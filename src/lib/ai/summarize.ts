import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { db } from "@/lib/db";
import crypto from "crypto";
import {
  getGeminiChat,
  getGeminiEmbeddings,
  invokeGeminiWithFallback,
  countGeminiTokens,
  MODEL_SPECS,
  GEMINI_CHAT_MODELS,
} from "./gemini";

export const llm = getGeminiChat(GEMINI_CHAT_MODELS[0], 0.1, 8192);
export const embeddings = getGeminiEmbeddings();

export interface PageChunk {
  pageNumber: number;
  content: string;
  title?: string;
}

/**
 * 1. Chunk by logical unit:
 * Split on page/slide boundaries first (1 chunk per page/slide as default unit).
 * Only apply RecursiveCharacterTextSplitter inside a page if that single page's
 * text exceeds ~1200 characters to prevent cutting a slide's content across chunks.
 */
export async function chunkTextByLogicalUnit(extractedText: string): Promise<PageChunk[]> {
  const chunks: PageChunk[] = [];
  const pageMarkerRegex = /---\s*\[\s*(?:Page|Slide)(?:\s*[\/]\s*(?:Page|Slide))?\s*(\d+)\s*\]\s*---/gi;

  const matches = Array.from(extractedText.matchAll(pageMarkerRegex));

  if (matches.length > 0) {
    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const pageNum = parseInt(match[1], 10) || i + 1;
      const startIndex = match.index! + match[0].length;
      const endIndex = i + 1 < matches.length ? matches[i + 1].index! : extractedText.length;
      const rawPageText = extractedText.slice(startIndex, endIndex).trim();

      if (!rawPageText) continue;

      // Extract headline / first line for scaffolding
      const lines = rawPageText.split("\n").map((l) => l.trim()).filter(Boolean);
      const title = lines[0] ? lines[0].slice(0, 80) : `Slide ${pageNum}`;

      if (rawPageText.length <= 1200) {
        chunks.push({
          pageNumber: pageNum,
          content: rawPageText,
          title,
        });
      } else {
        // Only split within this specific page if text is unusually long
        const splitter = new RecursiveCharacterTextSplitter({
          chunkSize: 1200,
          chunkOverlap: 200,
        });
        const subDocs = await splitter.createDocuments([rawPageText]);
        for (const subDoc of subDocs) {
          if (subDoc.pageContent.trim()) {
            chunks.push({
              pageNumber: pageNum,
              content: subDoc.pageContent.trim(),
              title,
            });
          }
        }
      }
    }
  }

  // Fallback if no page markers were found (e.g. legacy plain text)
  if (chunks.length === 0 && extractedText.trim()) {
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1200,
      chunkOverlap: 200,
    });
    const subDocs = await splitter.createDocuments([extractedText]);
    subDocs.forEach((doc, idx) => {
      chunks.push({
        pageNumber: idx + 1,
        content: doc.pageContent.trim(),
        title: `Section ${idx + 1}`,
      });
    });
  }

  return chunks;
}

/**
 * Builds structured scaffolding from individual logical units (pages/slides).
 * Anchors the LLM to literal page boundaries and titles so it builds grounded,
 * proportional topic groupings without hallucinating or summarizing unstructured text.
 */
function buildStructuredScaffolding(chunks: PageChunk[]): string {
  return chunks
    .map((c) => {
      const pageLabel = c.pageNumber ? `Page / Slide ${c.pageNumber}` : "Section";
      const heading = c.title ? ` (Title/Heading: "${c.title}")` : "";
      return `[${pageLabel}]${heading}\n${c.content}`;
    })
    .join("\n\n---\n\n");
}

/**
 * Constructs the rigorous, anti-hallucination, proportional topic-by-topic summary prompt.
 */
function buildTopicSummaryPrompt(structuredText: string): string {
  return `You are a precision AI document summarizer. Analyze the provided source document and generate a structured, topic-by-topic breakdown.

ANTI-HALLUCINATION CONSTRAINTS (STRICT):
1. ONLY include facts, claims, definitions, metrics, and mechanisms that are EXPLICITLY present in the source text.
2. If a section's content is brief, incomplete, or unclear, state only what is present or omit it — NEVER infer, assume, or invent detail to make the summary read more smoothly.
3. Do NOT add background knowledge about this subject beyond what appears in the source text, even if you know more about the topic generally.
4. Do NOT use raw # or ## or ### hash markdown symbols. Use clean bold formatting for topic headings.

REQUIRED SUMMARY FORMAT:
1. Introductory Line: Write exactly one sentence:
   "This document covers [subject], progressing from [starting point] to [ending point] across [N] main topics."

2. Topic-by-Topic Breakdown:
   - Identify the distinct topics or sections the document covers. Group consecutive pages/slides that discuss the same subject.
   - Format each topic heading clearly on its own line as:
     **Topic X: [Topic Name]** (pages/slides X–Y)
   - Under each topic heading, list 2–4 concise, factual key takeaways using bullet points (* ). Each bullet point MUST state specific definitions, mechanisms, port numbers, commands, metrics, or principles explicitly present in those pages/slides.
   - Separate every topic with double blank lines (\n\n) to maintain generous visual breathing room.
   - PROPORTIONALITY REQUIREMENT: The summary length of each topic MUST be strictly proportional to how much of the document that topic spans:
     * A topic covered in relatively few pages/slides (e.g. 2–3 slides) gets a correspondingly short summary (2 concise bullet points).
     * A topic covered across a large portion of the document (e.g. 10–20 slides) gets correspondingly more detailed bullet coverage.
     * Compute this proportionality from the actual page/slide counts behind each topic.

3. Total Summary Length:
   - MUST be between 250 and 400 words total, regardless of source document length.
   - If the natural draft exceeds 400 words, compress the least-covered topics further rather than eliminating any topic.

DOCUMENT SOURCE CONTENT (Structured by Page/Slide):
${structuredText}

TOPIC-BY-TOPIC SUMMARY:`;
}

/**
 * Generates the executive topic-by-topic summary using dynamic sizing logic:
 * - Computes the exact token count using the official tokenizer.
 * - Reads model specs from config (leaving headroom for system prompt & output).
 * - Executes a SINGLE PASS whenever the text fits in the model's context window.
 * - Falls back to Map-Reduce ONLY when the document genuinely exceeds the budget.
 */
async function generateExecutiveSummary(
  extractedText: string,
  chunks: PageChunk[],
  modelName: string = GEMINI_CHAT_MODELS[0]
): Promise<{ summary: string; strategyUsed: "SINGLE_PASS" | "MAP_REDUCE"; tokenCount: number }> {
  // 1. Calculate actual token count using model's official tokenizer
  const tokenCount = await countGeminiTokens(extractedText, modelName);
  const spec = MODEL_SPECS[modelName] || { contextWindow: 1_048_576, maxOutputTokens: 8_192 };
  
  // Reasonable headroom for system prompt, anti-hallucination rules, scaffolding, and output
  const HEADROOM_TOKENS = 12_000;
  const safeBudget = spec.contextWindow - HEADROOM_TOKENS;

  console.log(
    `[Summary Engine] Document Token Count: ${tokenCount}, Model: ${modelName}, Context Window: ${spec.contextWindow}, Budget: ${safeBudget}`
  );

  // 2. Decision: Single-Pass vs. Map-Reduce
  if (tokenCount <= safeBudget) {
    console.log(`[Summary Engine] Size fits context budget. Running SINGLE-PASS summarization (zero compression loss).`);
    const scaffolding = buildStructuredScaffolding(chunks);
    const prompt = buildTopicSummaryPrompt(scaffolding);

    const { content } = await invokeGeminiWithFallback(prompt, {
      temperature: 0.1, // Low temperature for factual extraction without creative smoothing
      maxOutputTokens: 8192,
      preferredModel: modelName,
    });

    return {
      summary: content.trim(),
      strategyUsed: "SINGLE_PASS",
      tokenCount,
    };
  }

  // 3. Fallback: Map-Reduce (Only for extreme documents genuinely exceeding 1M tokens)
  console.log(`[Summary Engine] Document genuinely exceeds context budget (${tokenCount} > ${safeBudget}). Running MAP-REDUCE.`);
  const batchSize = 20;
  const intermediateSummaries: string[] = [];

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const batchScaffolding = buildStructuredScaffolding(batch);
    const batchPrompt = `Summarize the factual contents of these pages/slides in 2-3 sentences per major theme. State only facts explicitly present:\n\n${batchScaffolding}`;
    
    try {
      const { content } = await invokeGeminiWithFallback(batchPrompt, {
        temperature: 0.1,
        preferredModel: modelName,
      });
      intermediateSummaries.push(content.trim());
    } catch {
      intermediateSummaries.push(batch.map((b) => `Slide ${b.pageNumber}: ${b.content.slice(0, 200)}`).join("\n"));
    }
  }

  const combinedIntermediate = intermediateSummaries.join("\n\n---\n\n");
  const finalPrompt = buildTopicSummaryPrompt(combinedIntermediate);
  const { content } = await invokeGeminiWithFallback(finalPrompt, {
    temperature: 0.1,
    maxOutputTokens: 8192,
    preferredModel: modelName,
  });

  return {
    summary: content.trim(),
    strategyUsed: "MAP_REDUCE",
    tokenCount,
  };
}

export async function summarizePdf(pdfId: string, extractedText: string) {
  try {
    if (!extractedText || extractedText.trim().length === 0) {
      console.warn(`No text found to summarize for PDF ${pdfId}`);
      await db.pdf.update({
        where: { id: pdfId },
        data: {
          summary: "No text could be extracted from this document to summarize.",
          status: "READY",
        },
      });
      return;
    }

    // 1. Chunk by logical unit (page/slide boundaries first)
    const chunks = await chunkTextByLogicalUnit(extractedText);
    console.log(`Document ${pdfId} split into ${chunks.length} logical chunks.`);

    if (chunks.length === 0) {
      await db.pdf.update({
        where: { id: pdfId },
        data: {
          summary: "Document content was empty.",
          status: "READY",
        },
      });
      return;
    }

    // 2. Generate grounded, proportional Executive Summary
    const { summary: finalSummary, strategyUsed, tokenCount } = await generateExecutiveSummary(
      extractedText,
      chunks,
      GEMINI_CHAT_MODELS[0]
    );

    console.log(`Summary successfully generated via ${strategyUsed} (${tokenCount} tokens).`);

    // 3. Generate Embeddings & Save Chunks to Database
    console.log(`Generating embeddings for ${chunks.length} chunks via ${embeddings.model}...`);
    const chunkContents = chunks.map((c) => c.content);
    const chunkEmbeddings = await embeddings.embedDocuments(chunkContents);

    // Delete existing chunks for this PDF to avoid duplicates
    await (db as any).$executeRawUnsafeWithRetry(`DELETE FROM "PdfChunk" WHERE "pdfId" = $1`, pdfId);

    console.log("Saving chunks with pageNumber and verbatim excerpt to DB in bounded batches...");
    const BATCH_SIZE = 5;
    for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
      const batch = chunks.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map(async (chunk, batchIdx) => {
          const chunkIndex = i + batchIdx;
          const id = crypto.randomUUID();
          const chunkSummary = chunk.title
            ? `[Page/Slide ${chunk.pageNumber} - ${chunk.title}]: ${chunk.content.slice(0, 350).replace(/\s+/g, " ")}`
            : `[Page/Slide ${chunk.pageNumber}]: ${chunk.content.slice(0, 350).replace(/\s+/g, " ")}`;
          const vectorString = `[${chunkEmbeddings[chunkIndex].join(",")}]`;

          await (db as any).$executeRawUnsafeWithRetry(
            `INSERT INTO "PdfChunk" ("id", "pdfId", "chunkIndex", "pageNumber", "summary", "content", "embedding") 
             VALUES ($1, $2, $3, $4, $5, $6, $7::vector)`,
            id,
            pdfId,
            chunkIndex,
            chunk.pageNumber,
            chunkSummary,
            chunk.content,
            vectorString
          );
        })
      );
    }

    // 4. Update PDF status and final summary
    await db.pdf.update({
      where: { id: pdfId },
      data: {
        summary: finalSummary,
        status: "READY",
      },
    });

    console.log(`Successfully processed and summarized PDF ${pdfId}`);
  } catch (error) {
    console.error(`Failed to summarize PDF ${pdfId}:`, error);
    await db.pdf.update({
      where: { id: pdfId },
      data: {
        summary: "Failed to generate summary.",
        status: "READY",
      },
    });
  }
}
