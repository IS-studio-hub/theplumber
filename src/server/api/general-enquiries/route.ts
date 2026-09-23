import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { success: false, message: "Invalid payload" },
        { status: 400 }
      );
    }
    // Demo mock — accepts submissions without forwarding to production or reCAPTCHA.
    await new Promise((r) => setTimeout(r, 600));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { success: false, message: "Unable to process enquiry" },
      { status: 500 }
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, method: "POST required" });
}
