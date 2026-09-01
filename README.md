# PDF Intelligence & Conversational RAG Platform

A high-performance, full-stack AI platform built with Next.js 14, PostgreSQL (pgvector), LangChain, and Google Gemini. The system extracts text from PDFs, indexes documents using semantic embeddings, generates structured executive summaries, and provides an interactive conversational AI chat that grounds its answers directly in the document with page citations.

---

## Key Features

1. **Intelligent Text Extraction**: Uses `pdf-parse` with custom page-rendering hooks to preserve clean `--- [Page / Slide X] ---` boundaries for every page and slide.
2. **Logical Chunking & Multi-Scale Representation**: Retains natural page boundaries as discrete units of context; handles unusually long pages with recursive character splitting and overlapping windows.
3. **High-Dimensional Vector Embeddings**: Uses Google's `gemini-embedding-2` (3072 dimensions) with PostgreSQL's `pgvector` extension for sub-millisecond cosine similarity search (`<=>`).
4. **Dual-Path Query Routing**:
   - **Specific / Narrow Queries**: Combines pgvector semantic similarity search with explicit slide/page/question number matching to pull exact paragraphs.
   - **Broad / Holistic Queries**: Aggregates all per-page map summaries across the entire document so no scattered insights or risk factors are missed.
5. **Multi-Turn Conversational Memory**: Preserves the last 3–5 dialogue turns (stored in Postgres by `pdfId` and `sessionId`) so follow-up questions work naturally.
6. **Automatic Gemini Model Failover**: Resilient fallbacks (`gemini-3.5-flash` ➔ `gemini-3.7-flash` ➔ `gemini-3.5-flash-lite` ➔ `gemini-3.1-flash-lite`) to ensure 100% uptime even under free-tier quota constraints.

---

## AI Concepts & Architecture Explained

### 1. What is RAG (Retrieval-Augmented Generation)?
Traditional Large Language Models (LLMs) have a fixed training cutoff and no knowledge of private, user-uploaded documents. RAG bridges this gap:
1. **Indexing**: Documents are parsed, split into bite-sized segments (chunks), and transformed into mathematical vectors (embeddings).
2. **Retrieval**: When a user asks a question, the question is converted into the same vector space. The database calculates similarity (cosine distance) to find the most relevant document chunks.
3. **Generation**: The retrieved chunks, conversation history, and user question are injected into a prompt for the LLM. The LLM synthesizes a grounded answer referencing the provided context.

### 2. Chunking Strategy: Logical Unit First
A common failure in naive RAG systems is arbitrary character chunking (e.g. slicing every 500 characters), which slices sentences, diagrams, and slides in half.
- **Page & Slide Boundaries**: Presentations and test papers are author-crafted in discrete pages/slides. We preserve `[Page / Slide X]` as the primary chunk unit.
- **Adaptive Fallback**: If an individual page exceeds ~1,200 characters, `RecursiveCharacterTextSplitter` subdivides the text with a 200-character overlap, ensuring continuity without severing ideas.

### 3. Long Document Strategy (Exceeding Context Limits)
For large documents (50–100+ pages):
- **Map Step**: Each page/slide generates a concise factual summary at ingestion time.
- **Reduce Step**: Sequential summaries are synthesized into an Executive Overview, Key Findings, and Takeaways.
- **Selective Context Window**: For narrow queries, only the top-$k$ relevant chunks are retrieved. For broad questions (e.g., "list all risks in this deck"), the map summaries are aggregated into a single overview prompt.

### 4. Vector Similarity Search (`pgvector`)
PostgreSQL stores the 3,072-dimensional vector in a `vector(3072)` column:
```sql
SELECT "id", "content", "pageNumber" 
FROM "PdfChunk"
WHERE "pdfId" = $1
ORDER BY "embedding" <=> $2::vector
LIMIT $3;
```
The `<=>` operator computes cosine distance, placing semantically related phrases closest to 0.

### 5. Multi-Turn Conversational Memory
To enable natural follow-ups ("What was the second point?", "Can you elaborate on that threshold?"):
- User and Assistant messages are recorded in `ChatMessage` indexed by `(pdfId, sessionId, createdAt)`.
- The last 3–5 turns (up to 6–10 messages) are formatted chronologically and injected into the prompt alongside the document excerpts.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router, Server Actions, TypeScript)
- **Database & Vectors**: PostgreSQL with `pgvector` & Prisma ORM
- **Object Storage**: Cloudflare R2 / AWS S3 compatible
- **AI & LLMs**: Google Gemini (`gemini-3.5-flash`, `gemini-3.7-flash`, `gemini-embedding-2`) via LangChain
- **Authentication**: NextAuth.js (Session & Token-based share authorization)
- **Styling**: Tailwind CSS & Lucide Icons

---

## Getting Started

### 1. Environment Configuration
Create a `.env` file in the root directory:
```env
DATABASE_URL="postgresql://user:password@host:5432/dbname?pgbouncer=true"
NEXTAUTH_SECRET="your-secure-nextauth-secret"
NEXTAUTH_URL="http://localhost:3000"

# Cloudflare R2 / S3
S3_BUCKET_NAME="pdf-intelligence-storage"
S3_REGION="auto"
S3_ENDPOINT="https://<account-id>.r2.cloudflarestorage.com"
AWS_ACCESS_KEY_ID="<your-access-key>"
AWS_SECRET_ACCESS_KEY="<your-secret-key>"

# Google Gemini API
GOOGLE_API_KEY="<your-google-ai-api-key>"
GOOGLE_EMBEDDING_MODEL="gemini-embedding-2"
```

### 2. Install Dependencies & Migrate Database
```bash
npm install
npx prisma db push
```

### 3. Run Development Server
```bash
npm run dev
```
Open [http://localhost:3000](http://localhost:3000) to upload documents, view summaries, and chat with your PDFs.
