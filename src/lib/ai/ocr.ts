import pdfParse from "pdf-parse";
import { GEMINI_CHAT_MODELS } from "./gemini";

export interface OcrExtractionResult {
  extractedText: string;
  totalPages: number;
  ocrPages: number[];
}

interface PageContent {
  pageNumber: number;
  text: string;
  charCount: number;
  wordCount: number;
}

/**
 * Transcribes text from an image buffer using Gemini's multimodal API
 * with automatic model failover across supported flash models.
 */
export async function performGeminiOcr(imageBuffer: Buffer): Promise<string> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured for Gemini OCR.");
  }

  const base64Data = imageBuffer.toString("base64");
  let lastError: any = null;

  // Attempt models in priority order: flagship flash first, then ultra-fast lite models
  for (const model of GEMINI_CHAT_MODELS) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      const payload = {
        contents: [
          {
            parts: [
              {
                inlineData: {
                  mimeType: "image/png",
                  data: base64Data,
                },
              },
              {
                text: "Extract all readable text, dates, names, labels, timelines, diagrams, charts, and bullet points from this document page image exactly as shown in reading order. Do not summarize, extrapolate, or add conversational commentary, just transcribe the text content. If no text exists on this page, return an empty response.",
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.0,
          maxOutputTokens: 4096,
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        console.warn(
          `[Gemini OCR Fallback] Model '${model}' returned HTTP ${res.status}: ${
            errJson?.error?.message || res.statusText
          }`
        );
        lastError = new Error(errJson?.error?.message || `HTTP ${res.status}`);
        continue;
      }

      const data = await res.json();
      const transcribedText = data.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      const trimmed = transcribedText.trim();

      // Guard against standard negative responses
      const isNegativeResponse =
        /^(there is )?no readable text( in this image)?\.?$/i.test(trimmed) ||
        /^(no text (found|detected|exists)|this image does not contain( any)? text)\.?$/i.test(trimmed);

      if (isNegativeResponse) {
        return "";
      }

      return trimmed;
    } catch (err: any) {
      console.warn(`[Gemini OCR Fallback] Error with model '${model}':`, err?.message || err);
      lastError = err;
    }
  }

  console.error("[Gemini OCR Fallback] All fallback models failed for image OCR.", lastError);
  return "";
}

/**
 * Extracts text from a PDF document with intelligent per-page OCR fallback.
 * 
 * Rules:
 * 1. Evaluates each page individually using pdf-parse.
 * 2. Checks both character count and word count per page.
 *    In presentation slides or visual documents, a page with infographics or diagrams
 *    often contains only a title or source link (e.g. 5-30 words / < 300 chars),
 *    while 90% of the content is in graphic/diagram form.
 * 3. Any page with < 350 characters OR < 50 words (or < 550 chars / < 75 words for visual decks)
 *    is flagged for multimodal OCR.
 * 4. Merges OCR transcription seamlessly with existing text layer (titles, links) so no
 *    metadata or links are lost, while all infographic/diagram text is captured into chunks.
 */
export async function extractPdfTextWithOcrFallback(
  buffer: Buffer
): Promise<OcrExtractionResult> {
  const rawPages: { pageNumber: number; text: string }[] = [];

  // Custom page renderer to capture page index and individual page text
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

      const pageNumber = pageData.pageIndex + 1;
      rawPages.push({
        pageNumber,
        text: text.trim(),
      });

      return `\n--- [Page / Slide ${pageNumber}] ---\n` + text;
    });
  };

  await pdfParse(buffer, { pagerender: renderPage });

  // Sort pages in ascending order
  rawPages.sort((a, b) => a.pageNumber - b.pageNumber);
  const totalPages = rawPages.length;

  const pages: PageContent[] = rawPages.map((p) => {
    const wordCount = p.text ? p.text.split(/\s+/).filter(Boolean).length : 0;
    return {
      pageNumber: p.pageNumber,
      text: p.text,
      charCount: p.text.length,
      wordCount,
    };
  });

  const totalWords = pages.reduce((acc, p) => acc + p.wordCount, 0);
  const avgWordsPerPage = totalPages > 0 ? totalWords / totalPages : 0;
  const isVisualDeck = avgWordsPerPage < 120 || totalPages <= 25;

  // Identify pages that need visual OCR
  const ocrTargetPages = pages.filter((p) => {
    // Empty or near-empty pages
    if (p.charCount < 50 || p.wordCount < 10) return true;

    // Sparse text pages (e.g. only slide titles, URLs, or diagram labels)
    if (p.charCount < 350 || p.wordCount < 50) return true;

    // For visual slide decks, check pages with moderate text that might have infographics
    if (isVisualDeck && (p.charCount < 550 || p.wordCount < 75)) return true;

    return false;
  });

  // If all pages have dense text layers (> 550 chars and > 75 words), return immediately
  if (ocrTargetPages.length === 0) {
    console.log(
      `[PDF Extraction] All ${totalPages} pages contain dense, healthy text layers. OCR skipped.`
    );
    const extractedText = pages
      .map((p) => `\n--- [Page / Slide ${p.pageNumber}] ---\n${p.text}`)
      .join("\n");
    return { extractedText, totalPages, ocrPages: [] };
  }

  console.log(
    `[PDF Extraction] Detected ${ocrTargetPages.length}/${totalPages} pages requiring OCR: pages [${ocrTargetPages
      .map((p) => `Page ${p.pageNumber} (${p.wordCount} words, ${p.charCount} chars)`)
      .join(", ")}]`
  );

  const ocrPagesApplied: number[] = [];

  // Load pdf-to-img for rasterization
  try {
    const { pdf } = await import("pdf-to-img");
    const pdfDoc = await pdf(buffer, { scale: 2.0, format: "png" });

    for (const target of ocrTargetPages) {
      try {
        console.log(`[OCR Pipeline] Rasterizing Page ${target.pageNumber} to image...`);
        const pageImageBuffer = await pdfDoc.getPage(target.pageNumber);

        if (pageImageBuffer && pageImageBuffer.length > 0) {
          console.log(
            `[OCR Pipeline] Sending Page ${target.pageNumber} (${pageImageBuffer.length} bytes) to Gemini OCR...`
          );
          const ocrText = await performGeminiOcr(pageImageBuffer);

          if (ocrText.length > 20) {
            console.log(
              `[OCR Pipeline] Page ${target.pageNumber} OCR success: extracted ${ocrText.length} characters.`
            );
            
            // Intelligently merge: preserve original text layer (URLs, headers) AND visual OCR
            if (target.text.length > 0) {
              target.text = `${target.text}\n\n[Visual Content & Infographics Transcription]:\n${ocrText}`;
            } else {
              target.text = ocrText;
            }
            target.charCount = target.text.length;
            target.wordCount = target.text.split(/\s+/).filter(Boolean).length;
            ocrPagesApplied.push(target.pageNumber);
          } else {
            console.log(
              `[OCR Pipeline] Page ${target.pageNumber} OCR returned empty or minimal text.`
            );
          }
        }
      } catch (pageOcrErr: any) {
        console.error(
          `[OCR Pipeline] Failed to OCR Page ${target.pageNumber}:`,
          pageOcrErr?.message || pageOcrErr
        );
      }
    }

    if (typeof (pdfDoc as any).destroy === "function") {
      await (pdfDoc as any).destroy();
    }
  } catch (rasterErr: any) {
    console.error("[OCR Pipeline] Failed to rasterize PDF for OCR:", rasterErr?.message || rasterErr);
  }

  // Construct standard downstream formatted text
  const extractedText = pages
    .map((p) => `\n--- [Page / Slide ${p.pageNumber}] ---\n${p.text}`)
    .join("\n");

  console.log(
    `[PDF Extraction] Completed extraction. Total pages: ${totalPages}, OCR applied to: [${ocrPagesApplied.join(
      ", "
    )}]`
  );

  return {
    extractedText,
    totalPages,
    ocrPages: ocrPagesApplied,
  };
}
