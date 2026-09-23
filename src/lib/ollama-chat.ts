/**
 * Free local chat via Ollama (OpenAI-compatible API).
 * Default: http://127.0.0.1:11434 + llama3.1:8b
 */

import {
  dogExpertSystemPrompt,
  parseReplyAndSuggestions,
  suggestionSystemExtra,
} from "@/lib/dog-expert";
import { getBreedKnowledgeSnippet, offlineDogReply } from "@/lib/dog-offline";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
};

export type ChatResult = {
  reply: string;
  suggestions: string[];
  source: string;
  detail?: string;
};

function ollamaBaseUrl(): string {
  return (
    process.env.OLLAMA_BASE_URL?.trim().replace(/\/+$/, "") ||
    "http://127.0.0.1:11434"
  );
}

function ollamaModel(): string {
  return process.env.OLLAMA_CHAT_MODEL?.trim() || "llama3.1:8b";
}

export async function chatWithOllama(
  cleaned: ChatMessage[],
  locale: "en" | "fr"
): Promise<ChatResult> {
  const lastUser = cleaned[cleaned.length - 1]!.content;
  const snippet = getBreedKnowledgeSnippet(lastUser, locale);
  const rag = snippet
    ? locale === "fr"
      ? `\n\nCONNAISSANCES RÉCUPÉRÉES (source de vérité):\n${snippet}`
      : `\n\nRETRIEVED KNOWLEDGE (source of truth):\n${snippet}`
    : "";
  const system = `${dogExpertSystemPrompt(locale)}${rag}\n\n${suggestionSystemExtra(locale)}`;
  const base = ollamaBaseUrl();
  const model = ollamaModel();

  try {
    const upstream = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 1100,
        messages: [{ role: "system", content: system }, ...cleaned],
      }),
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => "");
      const offline = offlineDogReply(lastUser, locale, cleaned);
      return {
        reply: offline.reply,
        suggestions: offline.suggestions,
        source: "offline_fallback",
        detail: detail.slice(0, 200),
      };
    }

    const data = (await upstream.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) {
      const offline = offlineDogReply(lastUser, locale, cleaned);
      return {
        reply: offline.reply,
        suggestions: offline.suggestions,
        source: "offline_empty",
      };
    }

    const { reply, suggestions } = parseReplyAndSuggestions(raw);
    return {
      reply,
      suggestions:
        suggestions.length > 0
          ? suggestions
          : locale === "fr"
            ? ["En savoir plus", "Autre race", "Éducation"]
            : ["Tell me more", "Another breed", "Training tips"],
      source: `ollama:${model}`,
    };
  } catch (err) {
    const offline = offlineDogReply(lastUser, locale, cleaned);
    return {
      reply: offline.reply,
      suggestions: offline.suggestions,
      source: "offline_error",
      detail: err instanceof Error ? err.message.slice(0, 200) : undefined,
    };
  }
}
