import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getFileBuffer } from "@/lib/storage";
import { summarizePdf } from "@/lib/ai/summarize";
import { extractPdfTextWithOcrFallback } from "@/lib/ai/ocr";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { storageKey, filename } = await req.json();

    if (!storageKey || !filename) {
      return NextResponse.json(
        { error: "storageKey and filename are required" },
        { status: 400 }
      );
    }

    // 1. Create database record with PROCESSING status
    const pdfRecord = await db.pdf.create({
      data: {
        filename,
        storageKey,
        ownerId: session.user.id,
        status: "PROCESSING",
      },
    });

    // 2. Extract text from PDF with slide/page markers and per-page OCR fallback
    try {
      const buffer = await getFileBuffer(storageKey);
      
      const { extractedText, totalPages, ocrPages } = await extractPdfTextWithOcrFallback(buffer);

      if (ocrPages.length > 0) {
        console.log(
          `[Confirm Route] PDF ${pdfRecord.id} (${filename}) required OCR on ${ocrPages.length}/${totalPages} pages: [${ocrPages.join(", ")}]`
        );
      }

      // Update with extracted text, keep status as PROCESSING for summarization
      const updatedPdf = await db.pdf.update({
        where: { id: pdfRecord.id },
        data: {
          extractedText,
          status: "PROCESSING",
        },
      });

      // Fire and forget summarization/embedding pipeline
      // This will handle chunking, vector storage, and updating status to READY
      summarizePdf(pdfRecord.id, extractedText).catch(err => {
        console.error("Background summarization failed:", err);
      });

      return NextResponse.json({
        pdf: updatedPdf,
      });
    } catch (parseError: any) {
      console.error("PDF Parsing error:", parseError);

      // Keep record but mark as FAILED
      await db.pdf.update({
        where: { id: pdfRecord.id },
        data: {
          status: "FAILED",
        },
      });

      return NextResponse.json(
        { error: "Failed to extract text from PDF", pdfId: pdfRecord.id },
        { status: 500 }
      );
    }
  } catch (error: any) {
    console.error("Error confirming PDF upload:", error);
    return NextResponse.json(
      { error: error.message || "Failed to confirm upload" },
      { status: 500 }
    );
  }
}
