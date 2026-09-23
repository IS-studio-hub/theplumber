/**
 * Free cloud LLM (OpenAI-compatible) for GitHub Pages when Ollama / Workers AI
 * are unavailable. Uses Pollinations text API — no API key required.
 */
import {
  dogExpertSystemPrompt,
  parseReplyAndSuggestions,
  suggestionSystemExtra,
} from "@/lib/dog-expert";
import { getBreedKnowledgeSnippet } from "@/lib/dog-offline";

const FREE_LLM_URL = "https://text.pollinations.ai/openai";

type Msg = { role: "user" | "assistant"; content: string };

export type FreeLlmResult = {
  reply: string;
  suggestions: string[];
  source: string;
} | null;

function normalizeReplyHtml(text: string): string {
  return text
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-•]\s+/gm, "")
    .replace(/\n{2,}/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(/(?:<br>\s*){3,}/gi, "<br><br>")
    .trim();
}

export async function chatWithFreeLlm(
  messages: Msg[],
  locale: "en" | "fr",
  opts?: { signal?: AbortSignal; timeoutMs?: number; context?: string }
): Promise<FreeLlmResult> {
  const lastUser = messages[messages.length - 1]?.content || "";
  const snippet =
    opts?.context || getBreedKnowledgeSnippet(lastUser, locale) || "";
  const rag = snippet
    ? locale === "fr"
      ? `\n\nCONTEXTE COMPRIS (intention + faits):\n${snippet.slice(0, 1400)}`
      : `\n\nUNDERSTANDING CONTEXT (intent + facts):\n${snippet.slice(0, 1400)}`
    : "";
  const system = `${dogExpertSystemPrompt(locale)}${rag}\n\n${suggestionSystemExtra(locale)}`;

  const timeoutMs = opts?.timeoutMs ?? 28_000;
  const attempt = async (): Promise<FreeLlmResult> => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const onOuter = () => ctrl.abort();
    opts?.signal?.addEventListener("abort", onOuter);
    try {
      const res = await fetch(FREE_LLM_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "openai",
          temperature: 0.5,
          max_tokens: 700,
          messages: [
            { role: "system", content: system },
            ...messages.slice(-16),
          ],
        }),
        signal: ctrl.signal,
      });
      if (res.status === 429) return null;
      if (!res.ok) return null;
      const data = (await res.json()) as {
        choices?: { message?: { content?: string } }[];
      };
      const raw = data.choices?.[0]?.message?.content?.trim() || "";
      if (!raw) return null;
      const { reply, suggestions } = parseReplyAndSuggestions(raw);
      const clean = normalizeReplyHtml(reply);
      if (!clean || clean.length < 40) return null;
      return {
        reply: clean,
        suggestions:
          suggestions.length > 0
            ? suggestions
            : locale === "fr"
              ? ["En savoir plus", "Autre race", "Éducation"]
              : ["Tell me more", "Another breed", "Training tips"],
        source: "free-llm:pollinations",
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onOuter);
    }
  };

  const first = await attempt();
  if (first) return first;
  // One quiet retry — free endpoints sometimes queue
  await new Promise((r) => setTimeout(r, 900));
  return attempt();
}
