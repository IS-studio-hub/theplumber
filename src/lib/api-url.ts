import { withBase } from "@/lib/base-path";

/**
 * Cloudflare Worker for /api/chat + /api/tts + /api/stt (GitHub Pages has no Next server).
 * Temporary preview workers expire unless claimed in the Cloudflare dashboard.
 * Chat also falls back to free browser LLM + Ollama when the worker is down.
 */
const PAGES_API_ORIGIN =
  "https://ginny-dooogs-api.lofty-calliandra.workers.dev";

/**
 * API routes on GitHub Pages must hit an external origin (Cloudflare Worker).
 * Locally, same-origin /api/* via Next route handlers.
 */
export function apiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  let origin = (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "");

  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    // Always use the Worker on GitHub Pages (static export has no /api routes)
    if (!origin && host.endsWith("github.io")) {
      origin = PAGES_API_ORIGIN;
    }
  }

  // Build-time override for static Pages builds
  if (!origin && process.env.GITHUB_PAGES === "true") {
    origin = PAGES_API_ORIGIN;
  }

  if (origin) return `${origin}${normalized}`;
  return withBase(normalized);
}

export function dooogsApiOrigin(): string {
  return (
    (process.env.NEXT_PUBLIC_API_ORIGIN || "").replace(/\/$/, "") ||
    PAGES_API_ORIGIN
  );
}
