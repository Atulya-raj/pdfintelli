import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { canAccessPdf } from "@/lib/permissions";
import { PromptTemplate } from "@langchain/core/prompts";
import { getGeminiEmbeddings, invokeGeminiWithFallback, streamGeminiWithFallback } from "@/lib/ai/gemini";

const embeddings = getGeminiEmbeddings();

// Heuristic keyword check for broad / whole-document queries
const BROAD_QUESTION_REGEX = /\b(all|every|throughout|overall|summarize|summary|entire|whole\s+document|across\s+the\s+document|list\s+all|comprehensive\s+list)\b/i;

// Question number extraction (e.g., "first question", "question 2", "2nd question", "q1", "q 2")
const ORDINAL_MAP: Record<string, number> = {
  first: 1,
  "1st": 1,
  second: 2,
  "2nd": 2,
  third: 3,
  "3rd": 3,
  fourth: 4,
  "4th": 4,
  fifth: 5,
  "5th": 5,
  sixth: 6,
  "6th": 6,
  seventh: 7,
  "7th": 7,
  eighth: 8,
  "8th": 8,
  ninth: 9,
  "9th": 9,
  tenth: 10,
  "10th": 10,
};

function extractQuestionNumber(message: string): number | null {
  const numMatch = message.match(/(?:question|q\.?)\s*#?\s*(\d+)/i);
  if (numMatch) return parseInt(numMatch[1], 10);

  const ordinalMatch = message.match(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|1st|2nd|3rd|4th|5th|6th|7th|8th|9th|10th)\s+question\b/i);
  if (ordinalMatch) {
    return ORDINAL_MAP[ordinalMatch[1].toLowerCase()] || null;
  }
  return null;
}

export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    let session: any = null;
    try {
      session = await getServerSession(authOptions);
    } catch {
      // Gracefully handled if called outside Next.js request context (e.g., test runners)
    }
    const { searchParams } = new URL(req.url);
    const shareToken = searchParams.get("shareToken") || undefined;

    // Authorization Gate: Verify user or guest shareToken access
    const access = await canAccessPdf(params.id, {
      userId: session?.user?.id,
      shareToken,
    });

    if (!access.allowed || !access.pdf) {
      return NextResponse.json({ error: "Access denied" }, { status: 403 });
    }

    const { message, sessionId } = await req.json();

    if (!message || !sessionId) {
      return NextResponse.json({ error: "Missing message or sessionId" }, { status: 400 });
    }

    // Total chunks in document
    const totalChunkCount = await db.pdfChunk.count({ where: { pdfId: params.id } });

    // =========================================================================
    // QUERY ROUTING: Dual-Path Retrieval Strategy
    // =========================================================================
    const isBroad = BROAD_QUESTION_REGEX.test(message.trim());
    let contextText = "";

    if (isBroad) {
      console.log(`[Chat Routing] Broad/whole-document path selected for PDF ${params.id}`);
      
      // Fetch all chunk summaries across the entire document
      const allChunks = await db.pdfChunk.findMany({
        where: { pdfId: params.id },
        orderBy: { chunkIndex: "asc" },
        select: {
          id: true,
          pageNumber: true,
          summary: true,
          content: true,
        },
      });

      if (allChunks.length > 0) {
        contextText = allChunks
          .map((chunk, idx) => {
            const pageLabel = chunk.pageNumber ? `Page/Slide ${chunk.pageNumber}` : `Section ${idx + 1}`;
            const summaryText = chunk.summary || chunk.content.slice(0, 250);
            return `[${pageLabel} Summary]:\n${summaryText}`;
          })
          .join("\n\n");
      } else {
        contextText = "No content available for this document.";
      }
    } else {
      console.log(`[Chat Routing] Specific/narrow RAG path selected for PDF ${params.id}`);

      // Strategy for small-to-medium documents (<= 15 chunks / slides):
      // Gemini's context window is 1,000,000 tokens. When the document is <= 15 chunks (e.g. 10 slides),
      // providing all pages guarantees 100% accurate answers for any question while staying
      // well under 1% of the context window.
      if (totalChunkCount > 0 && totalChunkCount <= 15) {
        console.log(`[Chat Routing] Small document (${totalChunkCount} chunks): Providing full sequential context.`);
        const allChunks = await db.pdfChunk.findMany({
          where: { pdfId: params.id },
          orderBy: { chunkIndex: "asc" },
          select: { id: true, content: true, pageNumber: true },
        });

        contextText = allChunks
          .map((c) => {
            const pageLabel = c.pageNumber ? `Page / Slide ${c.pageNumber}` : "Document Section";
            return `--- [${pageLabel}] ---\n${c.content}`;
          })
          .join("\n\n---\n\n");
      } else {
        // Strategy for large documents (> 15 chunks):
        // 1. Dynamic k based on document length
        const k = Math.min(12, Math.max(5, Math.ceil(totalChunkCount * 0.08) + 3));

        // 2. Direct Slide / Page Lookup (if user explicitly referenced a slide or page)
        let directSlideChunks: any[] = [];
        const slideMatch = message.match(/(?:slide|page)\s*#?\s*(\d+)/i);
        if (slideMatch) {
          const num = parseInt(slideMatch[1], 10);
          directSlideChunks = await db.pdfChunk.findMany({
            where: {
              pdfId: params.id,
              pageNumber: num,
            },
            take: 3,
            select: { id: true, content: true, pageNumber: true },
          });
        }

        // 3. Question Number Lookup (e.g. "first question", "question 2", "q3")
        let directQuestionChunks: any[] = [];
        const qNum = extractQuestionNumber(message);
        if (qNum !== null) {
          directQuestionChunks = await db.pdfChunk.findMany({
            where: {
              pdfId: params.id,
              OR: [
                { content: { contains: `${qNum}.` } },
                { content: { contains: `Q. ${qNum}` } },
                { content: { contains: `Question ${qNum}` } },
                { pageNumber: qNum },
              ],
            },
            take: 3,
            select: { id: true, content: true, pageNumber: true },
          });
        }

        // 4. Vector Similarity Search via PGVector
        const vector = await embeddings.embedQuery(message);
        const vectorString = `[${vector.join(",")}]`;

        const similarChunks: any[] = await (db as any).$queryRawUnsafeWithRetry(
          `SELECT "id", "content", "pageNumber" FROM "PdfChunk" 
           WHERE "pdfId" = $1
           ORDER BY "embedding" <=> $2::vector 
           LIMIT $3`,
          params.id,
          vectorString,
          k
        );

        // 5. Merge direct matches with vector similarity matches without duplicates
        const combinedChunks = [...directSlideChunks, ...directQuestionChunks];
        for (const chunk of similarChunks) {
          if (!combinedChunks.some((c) => c.id === chunk.id)) {
            combinedChunks.push(chunk);
          }
        }

        if (combinedChunks.length > 0) {
          contextText = combinedChunks
            .map((c) => {
              const pageLabel = c.pageNumber ? `Page / Slide ${c.pageNumber}` : "Document Section";
              return `--- [${pageLabel}] ---\n${c.content}`;
            })
            .join("\n\n---\n\n");
        } else {
          contextText = "No relevant excerpts found in document.";
        }
      }
    }

    // 3. Fetch conversation history (last 3-5 turns -> last 6 messages)
    const history = await db.chatMessage.findMany({
      where: {
        pdfId: params.id,
        sessionId,
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    });

    // Reverse to chronological order for conversational coherence
    const historyText = history
      .reverse()
      .map((msg) => `${msg.role === "user" ? "User" : "Assistant"}: ${msg.content}`)
      .join("\n\n");

    // 4. Save new user message to DB
    await db.chatMessage.create({
      data: {
        pdfId: params.id,
        authorId: session?.user?.id || null,
        sessionId,
        role: "user",
        content: message,
      },
    });

    // 5. Grounded Prompt with Page Citations
    const promptTemplate = PromptTemplate.fromTemplate(`
You are an expert AI assistant answering questions about a document.
You must answer using ONLY the provided DOCUMENT CONTEXT below. Do not use outside knowledge or speculate.

Grounding & Citation Rules:
- Answer the user's question accurately, thoroughly, and objectively based on the document excerpts or summaries provided.
- CITATION REQUIREMENT: Always cite the specific page or slide number where the information is found (e.g. "According to slide 12...", "[Page 42]", or "In slide 5 and slide 18...").
- For broad questions summarizing information across the whole document, synthesize the findings and explicitly cite the pages/slides corresponding to each item.
- If the document excerpts only partially address the question, provide what is known from the text and note what is missing.
- If the excerpts do not contain the answer, state clearly: "The provided document does not appear to contain information on that topic." Do not fabricate answers.
- Conversational Flow: When the user asks follow-up questions referencing previous turns, use the PREVIOUS CONVERSATION context to understand pronouns or references.

DOCUMENT CONTEXT:
{context}

PREVIOUS CONVERSATION (Last 3-5 turns):
{history}

USER QUESTION:
{question}

ANSWER:
`);

    const formattedPrompt = await promptTemplate.format({
      context: contextText,
      history: historyText || "No previous conversation.",
      question: message,
    });

    const isStreamingRequested = searchParams.get("stream") !== "false";

    if (!isStreamingRequested) {
      const { content: fullResponse } = await invokeGeminiWithFallback(formattedPrompt, {
        temperature: 0.2,
      });

      const trimmedResponse = fullResponse.trim();
      await db.chatMessage.create({
        data: {
          pdfId: params.id,
          authorId: null,
          sessionId,
          role: "assistant",
          content: trimmedResponse,
        },
      });

      return new Response(trimmedResponse, {
        headers: { "Content-Type": "text/plain; charset=utf-8" },
      });
    }

    // Real-time token streaming via ReadableStream
    const encoder = new TextEncoder();
    let accumulatedText = "";

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const tokenGenerator = streamGeminiWithFallback(formattedPrompt, {
            temperature: 0.2,
          });

          for await (const token of tokenGenerator) {
            accumulatedText += token;
            controller.enqueue(encoder.encode(token));
          }

          // Save completed assistant response to database
          if (accumulatedText.trim()) {
            await db.chatMessage.create({
              data: {
                pdfId: params.id,
                authorId: null,
                sessionId,
                role: "assistant",
                content: accumulatedText.trim(),
              },
            });
          }

          controller.close();
        } catch (streamErr: any) {
          console.error("Error during streaming chat:", streamErr);
          try {
            controller.enqueue(
              encoder.encode("\n\n*[Notice: Response generation interrupted due to a temporary network blip. Please ask your question again.]*")
            );
            controller.close();
          } catch {
            controller.error(streamErr);
          }
        }
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error: any) {
    console.error("Error in chat route:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to process chat" },
      { status: 500 }
    );
  }
}
