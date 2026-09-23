import { NextResponse } from "next/server";
import { synthesizeSharedTts } from "@/lib/shared-tts";

export const runtime = "nodejs";

type Body = {
  text?: string;
  locale?: string;
};

/** Shared TTS — identical neural-ish voice on mobile and desktop. */
export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const text = (body.text ?? "").replace(/\s+/g, " ").trim().slice(0, 1800);
  if (!text) {
    return NextResponse.json({ error: "empty_text" }, { status: 400 });
  }

  const locale = body.locale === "fr" ? "fr" : "en";

  try {
    const audio = await synthesizeSharedTts(text, locale);
    return new NextResponse(audio, {
      status: 200,
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "tts_failed",
        detail: err instanceof Error ? err.message.slice(0, 200) : "unknown",
      },
      { status: 502 }
    );
  }
}
