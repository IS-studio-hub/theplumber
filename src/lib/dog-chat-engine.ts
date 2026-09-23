/**
 * Dooogs! dog-chat engine — domain chatbot best practices (2026):
 * Understand (typos/slang/intent) → retrieve breed knowledge → grounded reply
 * → speakable text → suggestions.
 *
 * Cascade for GitHub Pages:
 * 1) Local / tunneled Ollama (free, when available)
 * 2) Free cloud LLM (Pollinations — no key)
 * 3) Cloudflare Worker (Workers AI / configured Ollama)
 * 4) Offline dog knowledge base
 */

import { isWeakDogReply } from "@/lib/dog-expert";
import { offlineDogReply } from "@/lib/dog-offline";
import { apiUrl } from "@/lib/api-url";
import { tryBrowserOllama } from "@/lib/browser-ollama";
import { chatWithFreeLlm } from "@/lib/free-llm";
import {
  detectTopic,
  messagesForLlm,
  understandUserTurn,
} from "@/lib/smart-understand";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type DogChatTurn = {
  reply: string;
  suggestions: string[];
  source: string;
  breedId?: string | null;
  topic?: string | null;
};

export { detectTopic };

/** True only for real continuations — NOT "tell me about X" / "what about Labs". */
export function isSoftFollowUp(text: string, namedBreedInMessage: boolean): boolean {
  if (namedBreedInMessage) return false;
  const t = text.trim().toLowerCase();
  return (
    /^(tell me more|more(?:\s+please)?|and then|what about (?:that|them|it|him|her)\b|how about (?:that|them|it)\b|go on|continue|another angle)/i.test(
      t
    ) ||
    /^(dis-moi plus|encore|et (?:ensuite|après)|autre angle|continue)/i.test(t) ||
    /^(training tips|diet|foods?|éducation|alimentation|toilettage|grooming|apartment|appart)\b/i.test(
      t
    )
  );
}

/**
 * One conversational turn for Dooogs!.
 * Prefer live AI when grounded; otherwise compose from the dog KB.
 */
export async function runDogChatTurn(
  userText: string,
  locale: "en" | "fr",
  history: ChatMessage[],
  opts?: { signal?: AbortSignal; timeoutMs?: number }
): Promise<DogChatTurn> {
  const text = userText.trim();
  const understood = understandUserTurn(text, locale, history);
  const llmMessages = messagesForLlm(history, understood);
  const nextMessages: ChatMessage[] = [...history, { role: "user", content: text }];
  const timeoutMs = opts?.timeoutMs ?? 28_000;
  const snippet = understood.contextBlock;
  const topic = understood.topic;

  let reply = "";
  let suggestions: string[] = [];
  let source = "offline";
  let fromLiveAi = false;

  // 1) Ollama (local or public tunnel) — free Llama-class models
  try {
    const ollama = await tryBrowserOllama(llmMessages, locale, {
      context: snippet,
    });
    if (ollama?.reply && !isWeakDogReply(text, ollama.reply)) {
      return {
        reply: ollama.reply,
        suggestions: ollama.suggestions,
        source: ollama.source,
        breedId: understood.breedId,
        topic,
      };
    }
    if (ollama?.reply) {
      reply = ollama.reply;
      suggestions = ollama.suggestions;
      source = ollama.source;
      fromLiveAi = true;
    }
  } catch {
    /* next */
  }

  // 2) Free cloud LLM (works on GitHub Pages with no keys)
  if (!fromLiveAi || isWeakDogReply(text, reply)) {
    try {
      const free = await chatWithFreeLlm(llmMessages, locale, {
        signal: opts?.signal,
        timeoutMs: Math.min(timeoutMs, 28_000),
        context: snippet,
      });
      if (free?.reply && !isWeakDogReply(text, free.reply)) {
        return {
          reply: free.reply,
          suggestions: free.suggestions,
          source: free.source,
          breedId: understood.breedId,
          topic,
        };
      }
      if (free?.reply) {
        reply = free.reply;
        suggestions = free.suggestions;
        source = free.source;
        fromLiveAi = true;
      }
    } catch {
      /* next */
    }
  }

  // 3) Cloudflare Worker (Workers AI / configured Ollama)
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, 14_000));
    const onOuter = () => ctrl.abort();
    opts?.signal?.addEventListener("abort", onOuter);
    try {
      const res = await fetch(apiUrl("/api/chat"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: llmMessages,
          locale,
          context: snippet || undefined,
          topic: topic || undefined,
        }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const data = (await res.json()) as {
          reply?: string;
          suggestions?: string[];
          source?: string;
        };
        const workerReply = data.reply?.trim() || "";
        const workerSource = data.source || "worker";
        const workerLive = Boolean(
          workerReply && data.source && !String(data.source).startsWith("offline")
        );
        if (workerLive && workerReply && !isWeakDogReply(text, workerReply)) {
          return {
            reply: workerReply,
            suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
            source: workerSource,
            breedId: understood.breedId,
            topic,
          };
        }
        if (workerReply && (!reply || workerReply.length > reply.length)) {
          reply = workerReply;
          suggestions = Array.isArray(data.suggestions) ? data.suggestions : suggestions;
          source = workerSource;
          fromLiveAi = workerLive || fromLiveAi;
        }
      }
    } finally {
      clearTimeout(timer);
      opts?.signal?.removeEventListener("abort", onOuter);
    }
  } catch {
    /* offline compose */
  }

  if (!fromLiveAi || !reply || isWeakDogReply(text, reply)) {
    // Prefer cleaned/interpreted text so offline KB catches typos like "coli"
    const offline = offlineDogReply(
      understood.cleaned || understood.interpreted || text,
      locale,
      nextMessages
    );
    if (
      !reply ||
      !fromLiveAi ||
      isWeakDogReply(text, reply) ||
      offline.reply.length > reply.length + 40
    ) {
      reply = offline.reply;
      suggestions = offline.suggestions;
      source = fromLiveAi ? "offline_override" : "offline_kb";
    }
  }

  if (!suggestions.length) {
    suggestions =
      locale === "fr"
        ? ["Éducation", "Alimentation", "Autre race"]
        : ["Training tips", "Diet & foods", "Another breed"];
  }

  return {
    reply,
    suggestions,
    source,
    breedId: understood.breedId,
    topic,
  };
}
