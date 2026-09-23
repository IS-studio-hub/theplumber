import { NextResponse } from "next/server";
import { chatWithOllama } from "@/lib/ollama-chat";

export const runtime = "nodejs";

type ChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

type Body = {
  messages?: ChatMessage[];
  locale?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const locale = body.locale === "fr" ? "fr" : "en";
  const incoming = Array.isArray(body.messages) ? body.messages : [];
  const cleaned = incoming
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "assistant") &&
        typeof m.content === "string" &&
        m.content.trim()
    )
    .map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content.replace(/\s+/g, " ").trim().slice(0, 4000),
    }))
    .slice(-24);

  if (!cleaned.length || cleaned[cleaned.length - 1]?.role !== "user") {
    return NextResponse.json({ error: "need_user_message" }, { status: 400 });
  }

  const result = await chatWithOllama(cleaned, locale);
  return NextResponse.json(result);
}
