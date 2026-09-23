/**
 * Allow only safe inline HTML for dialog text (XSS hardening).
 * Permits: <br>, <br/>, <b>, <i>, <em>, <strong> — strips scripts, links, events.
 */
const ALLOWED_TAG = /^(br|b|i|em|strong)$/i;

export function sanitizeDialogHtml(input: string): string {
  if (!input) return "";
  // Normalize null bytes / weird control chars
  let html = input.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");

  // Remove script/style/iframe blocks entirely
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  html = html.replace(/<\s*(script|style|iframe|object|embed|link|meta)[^>]*\/?\s*>/gi, "");

  // Strip event handlers and javascript: URLs
  html = html.replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, "");
  html = html.replace(/(href|src)\s*=\s*("|')\s*javascript:[^"']*\2/gi, "");

  // Rebuild with only allowed tags (no attributes)
  html = html.replace(/<\/?([a-z0-9]+)(\s[^>]*)?\/?>/gi, (full, tag: string) => {
    const name = tag.toLowerCase();
    if (!ALLOWED_TAG.test(name)) return "";
    if (name === "br") return "<br>";
    if (full.startsWith("</")) return `</${name}>`;
    return `<${name}>`;
  });

  // Escape any remaining bare < that aren't our tags
  // (already stripped unknown tags)

  return html.trim();
}

/** Plain text for aria-labels / titles */
export function stripHtml(input: string): string {
  return sanitizeDialogHtml(input)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/?[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Only allow http(s) URLs for window.open / navigation */
export function isSafeHttpUrl(url: string): boolean {
  try {
    const u = new URL(url, typeof window !== "undefined" ? window.location.href : "https://example.com");
    return u.protocol === "https:" || u.protocol === "http:";
  } catch {
    return false;
  }
}
