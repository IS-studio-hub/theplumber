/** Prefix public URLs when hosted under a repo base path (GitHub Pages). */
export function withBase(path: string): string {
  if (!path.startsWith("/")) return path;

  let base = (process.env.NEXT_PUBLIC_BASE_PATH || "").replace(/\/$/, "");

  // Pages builds sometimes leave NEXT_PUBLIC_BASE_PATH empty even with basePath set.
  // Detect project-site hosting at runtime: https://user.github.io/<repo>/...
  if (!base && typeof window !== "undefined") {
    const host = window.location.hostname;
    if (host.endsWith("github.io")) {
      const seg = window.location.pathname.split("/").filter(Boolean)[0];
      if (seg && seg !== "_next" && seg !== "assets") base = `/${seg}`;
      if (!base) base = "";
    }
  }

  if (!base) return path;
  if (path === base || path.startsWith(`${base}/`)) return path;
  return `${base}${path}`;
}
