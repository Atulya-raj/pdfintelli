import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getGeminiEmbeddings } from "@/lib/ai/gemini";

export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { query } = await req.json();

    if (!query || typeof query !== "string" || !query.trim()) {
      return NextResponse.json({ results: [] });
    }

    const trimmedQuery = query.trim();

    // 1. Generate embedding for search query via gemini-embedding-2
    const embeddings = getGeminiEmbeddings();
    const queryVector = await embeddings.embedQuery(trimmedQuery);
    const vectorString = `[${queryVector.join(",")}]`;

    // 2. Perform cosine similarity search across chunks belonging to user's PDFs
    const matches: any[] = await (db as any).$queryRawUnsafeWithRetry(
      `
      SELECT 
        c."id", 
        c."pdfId", 
        c."chunkIndex", 
        c."pageNumber", 
        c."content", 
        c."summary",
        p."filename",
        p."status",
        (1 - (c."embedding" <=> $1::vector)) as similarity
      FROM "PdfChunk" c
      JOIN "Pdf" p ON c."pdfId" = p."id"
      WHERE p."ownerId" = $2 AND c."embedding" IS NOT NULL
      ORDER BY similarity DESC
      LIMIT 8;
      `,
      vectorString,
      session.user.id
    );

    // Filter results with a reasonable similarity floor (e.g. > 0.45)
    const formattedResults = matches
      .filter((m) => m.similarity && m.similarity > 0.4)
      .map((m) => {
        // Clean excerpt around 200 chars
        const cleanContent = (m.summary || m.content || "").replace(/\s+/g, " ").trim();
        const snippet =
          cleanContent.length > 220
            ? cleanContent.slice(0, 220) + "..."
            : cleanContent;

        return {
          id: m.id,
          pdfId: m.pdfId,
          filename: m.filename,
          pageNumber: m.pageNumber || null,
          similarityPercentage: Math.round((m.similarity || 0) * 100),
          snippet,
        };
      });

    return NextResponse.json({ results: formattedResults });
  } catch (error: any) {
    console.error("Semantic search error:", error);
    return NextResponse.json(
      { error: error?.message || "Failed to perform semantic search" },
      { status: 500 }
    );
  }
}
