/**
 * Shared male TTS used on every device (mobile + desktop share the same audio).
 * Chunks long lines so mobile never gets a truncated/different voice path.
 */

function splitChunks(text: string, maxLen = 160): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences = clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) ?? [clean];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length <= maxLen) {
      buf = (buf + " " + s).trim();
    } else {
      if (buf) out.push(buf);
      if (s.length <= maxLen) buf = s;
      else {
        for (let i = 0; i < s.length; i += maxLen) out.push(s.slice(i, i + maxLen));
        buf = "";
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}

const MALE_VOICE = {
  en: { lang: "en-US", engine: "g3" },
  fr: { lang: "fr", engine: "g3" },
} as const;

/** US/French male voice, shared by every device. */
async function fetchMaleChunk(text: string, locale: "en" | "fr"): Promise<ArrayBuffer> {
  const voice = MALE_VOICE[locale];
  const url =
    "https://texttospeech.responsivevoice.org/v1/text:synthesize" +
    `?text=${encodeURIComponent(text)}` +
    `&lang=${voice.lang}&engine=${voice.engine}&name=` +
    "&pitch=0.5&rate=0.5&volume=1&gender=male";
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      Accept: "audio/mpeg,*/*",
      Referer: "https://responsivevoice.org/",
    },
  });
  if (!res.ok) throw new Error(`tts_http_${res.status}`);
  const buf = await res.arrayBuffer();
  if (!buf.byteLength) throw new Error("tts_empty");
  return buf;
}

export async function synthesizeSharedTts(
  text: string,
  locale: "en" | "fr" = "en"
): Promise<ArrayBuffer> {
  const chunks = splitChunks(text.replace(/\s+/g, " ").trim().slice(0, 1800));
  if (!chunks.length) throw new Error("empty_text");

  const parts: Uint8Array[] = [];
  for (const chunk of chunks) {
    const buf = await fetchMaleChunk(chunk, locale);
    parts.push(new Uint8Array(buf));
    // Gentle pacing so the service stays happy
    await new Promise((r) => setTimeout(r, 40));
  }

  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out.buffer;
}
