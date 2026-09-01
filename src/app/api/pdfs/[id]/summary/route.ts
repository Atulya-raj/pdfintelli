import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPdf } from "@/lib/permissions";
import { getFileBuffer } from "@/lib/storage";
import pdfParse from "pdf-parse";
import { summarizePdf } from "@/lib/ai/summarize";

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    const { searchParams } = new URL(req.url);
    const shareToken = searchParams.get("shareToken") || undefined;

    const access = await canAccessPdf(params.id, {
      userId: session?.user?.id,
      shareToken,
    });

    if (!access.allowed || !access.pdf) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const pdf = access.pdf;

    // Check if extractedText has slide tags; if not, re-extract with pagerender
    let textToSummarize = pdf.extractedText || "";
    if (!textToSummarize.includes("[Page / Slide")) {
      try {
        const buffer = await getFileBuffer(pdf.storageKey);
        const renderPage = (pageData: any) => {
          return pageData.getTextContent().then((textContent: any) => {
            let lastY: number | undefined;
            let text = "";
            for (const item of textContent.items) {
              if (lastY === item.transform[5] || !lastY) {
                text += item.str;
              } else {
                text += "\n" + item.str;
              }
              lastY = item.transform[5];
            }
            return `\n--- [Page / Slide ${pageData.pageIndex + 1}] ---\n` + text;
          });
        };

        const parsed = await pdfParse(buffer, { pagerender: renderPage });
        textToSummarize = parsed.text || "";
        
        await db.pdf.update({
          where: { id: pdf.id },
          data: { extractedText: textToSummarize },
        });
      } catch (err) {
        console.warn("Could not re-extract from buffer, using existing extractedText:", err);
      }
    }

    // Set status to PROCESSING temporarily
    await db.pdf.update({
      where: { id: pdf.id },
      data: { status: "PROCESSING" },
    });

    // Run summarization & chunking synchronously or await it so the response has the fresh summary
    await summarizePdf(pdf.id, textToSummarize);

    const updatedPdf = await db.pdf.findUnique({
      where: { id: pdf.id },
      select: {
        id: true,
        filename: true,
        status: true,
        summary: true,
        updatedAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      pdf: updatedPdf,
    });
  } catch (error: any) {
    console.error("Error regenerating summary:", error);
    return NextResponse.json(
      { error: error.message || "Failed to regenerate summary" },
      { status: 500 }
    );
  }
}
