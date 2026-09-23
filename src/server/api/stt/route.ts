import type { NextRequest } from "next/server";

/** Local Next STT proxies to the same Cloudflare Worker used on Pages. */
const WORKER =
  process.env.NEXT_PUBLIC_API_ORIGIN?.replace(/\/$/, "") ||
  "https://ginny-dooogs-api.lofty-calliandra.workers.dev";

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const upstream = await fetch(`${WORKER}/api/stt`, {
      method: "POST",
      body: form,
    });
    const text = await upstream.text();
    return new Response(text, {
      status: upstream.status,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return Response.json(
      {
        error: "stt_proxy_failed",
        detail: err instanceof Error ? err.message : "unknown",
      },
      { status: 502 }
    );
  }
}
