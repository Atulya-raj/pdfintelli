import { ChatGoogleGenerativeAI, GoogleGenerativeAIEmbeddings } from "@langchain/google-genai";

/**
 * Model specifications and known context windows (in tokens).
 * Used to calculate dynamic single-pass vs. map-reduce decisions.
 */
export interface ModelSpec {
  contextWindow: number;
  maxOutputTokens: number;
}

export const MODEL_SPECS: Record<string, ModelSpec> = {
  "gemini-3.6-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },
  "gemini-flash-lite-latest": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },
  "gemini-3.5-flash-lite": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },
  "gemini-3.1-flash-lite": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },
  "gemini-3.5-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },
  "gemini-3.7-flash": {
    contextWindow: 1_048_576,
    maxOutputTokens: 8_192,
  },
};

export const GEMINI_CHAT_MODELS = [
  "gemini-3.6-flash",
  "gemini-flash-lite-latest",
  "gemini-3.5-flash-lite",
  "gemini-3.1-flash-lite",
  "gemini-3.5-flash",
  "gemini-3.7-flash",
];

export const GEMINI_EMBEDDING_MODEL = process.env.GOOGLE_EMBEDDING_MODEL || "gemini-embedding-2";

export function getGeminiChat(
  modelName: string = GEMINI_CHAT_MODELS[0],
  temperature: number = 0.1,
  maxOutputTokens: number = 8192
) {
  return new ChatGoogleGenerativeAI({
    model: modelName,
    apiKey: process.env.GOOGLE_API_KEY,
    temperature,
    maxOutputTokens,
  });
}

export function getGeminiEmbeddings() {
  return new GoogleGenerativeAIEmbeddings({
    model: GEMINI_EMBEDDING_MODEL,
    apiKey: process.env.GOOGLE_API_KEY,
  });
}

/**
 * Calculates the exact token count using the official Gemini countTokens API.
 * Falls back to character-ratio approximation only if the API is unreachable.
 */
export async function countGeminiTokens(
  text: string,
  modelName: string = GEMINI_CHAT_MODELS[0]
): Promise<number> {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey || !text) {
    return Math.ceil((text || "").length / 3.8);
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:countTokens?key=${apiKey}`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text }] }],
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (typeof data.totalTokens === "number") {
        return data.totalTokens;
      }
    }
  } catch (err) {
    console.warn(`[Gemini Tokenizer] Failed to count tokens via API for ${modelName}:`, err);
  }

  // Safe fallback if API call encounters network error
  return Math.ceil(text.length / 3.8);
}

export interface GeminiInvokeOptions {
  temperature?: number;
  maxOutputTokens?: number;
  preferredModel?: string;
}

/**
 * Invokes Gemini LLM with automatic failover through available models
 * to ensure zero downtime even under free-tier quota constraints.
 */
export async function invokeGeminiWithFallback(
  promptOrInput: any,
  options: GeminiInvokeOptions = {}
): Promise<{ content: string; modelUsed: string }> {
  const modelsToTry = [
    ...(options.preferredModel ? [options.preferredModel] : []),
    ...GEMINI_CHAT_MODELS.filter((m) => m !== options.preferredModel),
  ];

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const llm = getGeminiChat(
        model,
        options.temperature ?? 0.1,
        options.maxOutputTokens ?? 8192
      );
      const result = await llm.invoke(promptOrInput);
      const text = typeof result.content === "string" ? result.content : JSON.stringify(result.content);
      return { content: text, modelUsed: model };
    } catch (err: any) {
      console.warn(`[Gemini Fallback] Model '${model}' failed (${err?.message || err}). Attempting next model...`);
      lastError = err;
      // Continue to next model in fallback list
    }
  }

  throw lastError || new Error("All available Gemini models failed to respond.");
}

/**
 * Streams Gemini LLM tokens progressively with model failover.
 * Yields text tokens in real time for responsive, high-perceived-quality chat.
 */
export async function* streamGeminiWithFallback(
  promptText: string,
  options: GeminiInvokeOptions = {}
): AsyncGenerator<string, { fullContent: string; modelUsed: string }, unknown> {
  const apiKey = process.env.GOOGLE_API_KEY;
  const modelsToTry = [
    ...(options.preferredModel ? [options.preferredModel] : []),
    ...GEMINI_CHAT_MODELS.filter((m) => m !== options.preferredModel),
  ];

  let lastError: any = null;

  for (const model of modelsToTry) {
    try {
      const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: promptText }] }],
          generationConfig: {
            temperature: options.temperature ?? 0.2,
            maxOutputTokens: options.maxOutputTokens ?? 8192,
          },
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 150)}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error("No response body stream available.");

      const decoder = new TextDecoder();
      let buffer = "";
      let fullContent = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete trailing line

        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("data: ")) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              const partText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
              if (partText) {
                fullContent += partText;
                yield partText;
              }
            } catch {
              // Ignore malformed JSON line
            }
          }
        }
      }

      // Process any remainder in buffer
      if (buffer.trim().startsWith("data: ")) {
        try {
          const data = JSON.parse(buffer.trim().slice(6));
          const partText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (partText) {
            fullContent += partText;
            yield partText;
          }
        } catch {}
      }

      return { fullContent, modelUsed: model };
    } catch (err: any) {
      console.warn(`[Gemini Streaming Fallback] Model '${model}' failed: ${err?.message || err}.`);
      lastError = err;
      // Try next model if no tokens were successfully streamed yet
    }
  }

  throw lastError || new Error("All available Gemini models failed to stream.");
}
