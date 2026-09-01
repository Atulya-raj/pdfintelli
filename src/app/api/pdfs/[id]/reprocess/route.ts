import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPdf } from "@/lib/permissions";
import { getFileBuffer } from "@/lib/storage";
import { extractPdfTextWithOcrFallback } from "@/lib/ai/ocr";
import { summarizePdf } from "@/lib/ai/summarize";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let session: any = null;
    try {
      session = await getServerSession(authOptions);
    } catch {
      // Ignored for internal script calls if necessary
    }

    const pdfRecord = await db.pdf.findUnique({
      where: { id: params.id },
    });

    if (!pdfRecord) {
      return NextResponse.json({ error: "PDF not found" }, { status: 404 });
    }

    // Permission check if session exists
    if (session?.user?.id && pdfRecord.ownerId !== session.user.id) {
      const access = await canAccessPdf(params.id, { userId: session.user.id });
      if (!access.allowed) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
      }
    }

    console.log(`[Reprocess] Starting OCR & re-chunking for ${pdfRecord.id} (${pdfRecord.filename})...`);

    // 1. Fetch PDF buffer from R2
    const buffer = await getFileBuffer(pdfRecord.storageKey);

    // 2. Run enhanced OCR extraction
    const { extractedText, totalPages, ocrPages } = await extractPdfTextWithOcrFallback(buffer);

    console.log(
      `[Reprocess] Extraction complete for ${pdfRecord.id}. Total pages: ${totalPages}, OCR applied to ${ocrPages.length} pages: [${ocrPages.join(
        ", "
      )}]`
    );

    // 3. Update DB extractedText and set status to PROCESSING
    await db.pdf.update({
      where: { id: pdfRecord.id },
      data: {
        extractedText,
        status: "PROCESSING",
      },
    });

    // 4. Delete old chunks and re-run chunking, pgvector embedding, and summarization
    await db.pdfChunk.deleteMany({
      where: { pdfId: pdfRecord.id },
    });

    // Run summarization and pgvector embedding synchronously or trigger background
    await summarizePdf(pdfRecord.id, extractedText);

    const finalPdf = await db.pdf.findUnique({
      where: { id: pdfRecord.id },
      include: {
        _count: {
          select: { chunks: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      pdf: finalPdf,
      totalPages,
      ocrPages,
      chunkCount: finalPdf?._count?.chunks ?? 0,
    });
  } catch (error: any) {
    console.error("[Reprocess] Error reprocessing PDF:", error);
    return NextResponse.json(
      { error: error.message || "Failed to reprocess PDF" },
      { status: 500 }
    );
  }
}
