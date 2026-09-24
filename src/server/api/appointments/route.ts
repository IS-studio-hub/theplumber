import { NextResponse } from "next/server";

/**
 * Lightweight appointments API for local / Worker deploys.
 * Static GitHub Pages builds skip this route; the browser store remains source of truth.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type AppointmentBody = {
  lead?: Record<string, unknown>;
  business?: string;
};

/** In-memory store for the Node process (resets on restart). */
const store: Record<string, unknown>[] = [];

export async function GET() {
  return NextResponse.json({
    ok: true,
    appointments: store,
    count: store.length,
  });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as AppointmentBody;
    const lead = body?.lead;
    if (!lead || typeof lead !== "object" || !("id" in lead)) {
      return NextResponse.json({ ok: false, error: "lead required" }, { status: 400 });
    }
    const id = String((lead as { id: string }).id);
    const i = store.findIndex((x) => x && (x as { id?: string }).id === id);
    const next = { ...lead, syncedAt: new Date().toISOString() };
    if (i >= 0) store[i] = next;
    else store.unshift(next);
    // Cap memory
    if (store.length > 500) store.length = 500;
    return NextResponse.json({ ok: true, id, count: store.length });
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");
    if (!id) {
      store.length = 0;
      return NextResponse.json({ ok: true, cleared: true });
    }
    const before = store.length;
    for (let i = store.length - 1; i >= 0; i--) {
      if ((store[i] as { id?: string })?.id === id) store.splice(i, 1);
    }
    return NextResponse.json({ ok: true, removed: before - store.length });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
