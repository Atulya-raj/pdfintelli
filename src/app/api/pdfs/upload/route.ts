import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { uploadBufferToStorage } from "@/lib/storage";
import crypto from "crypto";
import { summarizePdf } from "@/lib/ai/summarize";
import { extractPdfTextWithOcrFallback } from "@/lib/ai/ocr";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
      return NextResponse.json(
        { error: "Only PDF files are supported" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Clean filename and create unique storage key
    const sanitizedFilename = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const uniqueId = crypto.randomBytes(8).toString("hex");
    const storageKey = `pdfs/${session.user.id}/${uniqueId}-${sanitizedFilename}`;

    // 1. Upload to Cloudflare R2
    await uploadBufferToStorage(
      storageKey,
      buffer,
      file.type || "application/pdf"
    );

    // 2. Create DB record
    const pdfRecord = await db.pdf.create({
      data: {
        filename: file.name,
        storageKey,
        ownerId: session.user.id,
        status: "PROCESSING",
      },
    });

    // 3. Extract text (with automatic OCR fallback for scanned/low-text pages)
    try {
      const { extractedText } = await extractPdfTextWithOcrFallback(buffer);

      const updatedPdf = await db.pdf.update({
        where: { id: pdfRecord.id },
        data: {
          extractedText,
          status: "PROCESSING",
        },
      });

      // Fire and forget summarization and embedding pipeline
      // Chunking, pgvector embedding generation, and status flip to READY happen asynchronously
      summarizePdf(updatedPdf.id, extractedText).catch((err: any) => {
        console.error(`[Background Summarization] Failed for ${updatedPdf.id}:`, err);
      });

      return NextResponse.json({ pdf: updatedPdf });
    } catch (extractError) {
      console.error("=== TEXT EXTRACTION FAILED ===", extractError);
      const updatedPdf = await db.pdf.update({
        where: { id: pdfRecord.id },
        data: { status: "READY" }, // Ready even if empty text
      });
      return NextResponse.json({ pdf: updatedPdf });
    }
  } catch (error: any) {
    console.error("=== UPLOAD ROUTE CRITICAL ERROR ===", error);
    if (error.stack) {
      console.error(error.stack);
    }
    return NextResponse.json(
      { error: error.message || "Failed to upload PDF" },
      { status: 500 }
    );
  }
}
