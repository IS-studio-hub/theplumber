/**
 * Free Ollama chat from the browser.
 * - Localhost: talks to http://127.0.0.1:11434
 * - GitHub Pages / phones: talks to NEXT_PUBLIC_OLLAMA_PUBLIC_URL (Cloudflare Tunnel)
 *   so every device shares the same model as desktop.
 */
import {
  dogExpertSystemPrompt,
  parseReplyAndSuggestions,
  suggestionSystemExtra,
} from "@/lib/dog-expert";

const LOCAL_BASE = "http://127.0.0.1:11434";
const DEFAULT_MODEL = "llama3.1:8b";

type Msg = { role: "user" | "assistant"; content: string };

export type BrowserOllamaResult = {
  reply: string;
  suggestions: string[];
  source: string;
} | null;

function ollamaBaseUrl(): string | null {
  if (typeof window === "undefined") return null;
  const publicUrl = (process.env.NEXT_PUBLIC_OLLAMA_PUBLIC_URL || "").replace(
    /\/+$/,
    ""
  );
  const host = window.location.hostname;
  if (host === "localhost" || host === "127.0.0.1") {
    return (process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || LOCAL_BASE).replace(
      /\/+$/,
      ""
    );
  }
  // Phones + GitHub Pages: use the public tunnel to the same Ollama
  return publicUrl || null;
}

export async function tryBrowserOllama(
  messages: Msg[],
  locale: "en" | "fr",
  opts?: { context?: string }
): Promise<BrowserOllamaResult> {
  const base = ollamaBaseUrl();
  if (!base) return null;

  const model = process.env.NEXT_PUBLIC_OLLAMA_CHAT_MODEL || DEFAULT_MODEL;
  const extra = opts?.context
    ? locale === "fr"
      ? `\n\nCONTEXTE COMPRIS:\n${opts.context.slice(0, 1400)}`
      : `\n\nUNDERSTANDING CONTEXT:\n${opts.context.slice(0, 1400)}`
    : "";
  const system = `${dogExpertSystemPrompt(locale)}${extra}\n\n${suggestionSystemExtra(locale)}`;

  const ctrl = new AbortController();
  // Phones shouldn't hang on a dead tunnel — fail fast to worker/offline answers
  const isLocal =
    typeof window !== "undefined" &&
    (window.location.hostname === "localhost" ||
      window.location.hostname === "127.0.0.1");
  const timeoutMs = isLocal ? 60_000 : 12_000;
  const timer = window.setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.55,
        max_tokens: 1100,
        messages: [{ role: "system", content: system }, ...messages],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const raw = data.choices?.[0]?.message?.content?.trim() || "";
    if (!raw) return null;
    const { reply, suggestions } = parseReplyAndSuggestions(raw);
    return {
      reply,
      suggestions:
        suggestions.length > 0
          ? suggestions
          : locale === "fr"
            ? ["En savoir plus", "Autre race", "Éducation"]
            : ["Tell me more", "Another breed", "Training tips"],
      source: `browser-ollama:${model}`,
    };
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}
