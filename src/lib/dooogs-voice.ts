import type { Locale } from "@/lib/lisa-types";
import { apiUrl } from "@/lib/api-url";

/** Tiny silent WAV — unlocks iOS/Android autoplay. */
const SILENT_WAV =
  "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA";

let sharedAudio: HTMLAudioElement | null = null;
let unlockAudio: HTMLAudioElement | null = null;
let audioUnlocked = false;

export function stripDialogHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, ". ")
    .replace(/<\/p>/gi, ". ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .replace(/\s*\.\s*\./g, ".")
    .trim();
}

export function forSpokenVoice(html: string): string {
  let text = stripDialogHtml(html);
  text = text
    .replace(/\bAKC\b/g, "A K C")
    .replace(/\bFCI\b/g, "F C I")
    .replace(/\bUS\b/g, "U S")
    .replace(/\bUK\b/g, "U K")
    .replace(/\bvs\.?\b/gi, "versus")
    .replace(/\be\.g\./gi, "for example")
    .replace(/\bi\.e\./gi, "that is")
    .replace(/\s+/g, " ")
    .trim();
  // Match TTS server cap — don't cut the reply in half for speech
  if (text.length > 1800) {
    const cut = text.slice(0, 1780);
    const lastStop = Math.max(
      cut.lastIndexOf(". "),
      cut.lastIndexOf("! "),
      cut.lastIndexOf("? ")
    );
    text = (lastStop > 400 ? cut.slice(0, lastStop + 1) : cut).trim();
  }
  return text;
}

/** Split into short phrases so each TTS clip is one clean MP3 (avoids early `ended`). */
function splitSpeakChunks(text: string, maxLen = 160): string[] {
  const clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return [];
  const sentences =
    clean.match(/[^.!?]+[.!?]+|[^.!?]+$/g)?.map((s) => s.trim()) ?? [clean];
  const out: string[] = [];
  let buf = "";
  for (const s of sentences) {
    if ((buf + " " + s).trim().length <= maxLen) {
      buf = (buf + " " + s).trim();
    } else {
      if (buf) out.push(buf);
      if (s.length <= maxLen) {
        buf = s;
      } else {
        for (let i = 0; i < s.length; i += maxLen) {
          out.push(s.slice(i, i + maxLen));
        }
        buf = "";
      }
    }
  }
  if (buf) out.push(buf);
  return out;
}

function speechBudgetMs(text: string): number {
  // ~14 chars/sec spoken + headroom for network/TTS
  return Math.min(180_000, Math.max(20_000, 8_000 + text.length * 75));
}

function getSharedAudio(): HTMLAudioElement {
  if (!sharedAudio) {
    sharedAudio = new Audio();
    sharedAudio.setAttribute("playsinline", "true");
    sharedAudio.setAttribute("webkit-playsinline", "true");
    sharedAudio.preload = "auto";
    (sharedAudio as HTMLAudioElement & { playsInline?: boolean }).playsInline =
      true;
  }
  return sharedAudio;
}

function getUnlockAudio(): HTMLAudioElement {
  if (!unlockAudio) {
    unlockAudio = new Audio();
    unlockAudio.setAttribute("playsinline", "true");
    unlockAudio.setAttribute("webkit-playsinline", "true");
    (unlockAudio as HTMLAudioElement & { playsInline?: boolean }).playsInline =
      true;
  }
  return unlockAudio;
}

/** Call from a click/tap/send gesture so later speech is allowed. */
export function unlockDooogsAudio(): void {
  if (typeof window === "undefined") return;
  audioUnlocked = true;

  try {
    const audio = getUnlockAudio();
    audio.src = SILENT_WAV;
    audio.volume = 0.01;
    void audio.play().then(
      () => {
        audio.pause();
        audio.currentTime = 0;
      },
      () => undefined
    );
  } catch {
    /* ignore */
  }

  try {
    const tts = getSharedAudio();
    // Only prime if idle — never clobber an in-flight reply
    if (tts.paused || !tts.src || tts.src.startsWith("data:")) {
      tts.src = SILENT_WAV;
      tts.volume = 0.01;
      void tts.play().then(
        () => {
          if (tts.src.startsWith("data:audio/wav")) {
            tts.pause();
            tts.currentTime = 0;
            tts.volume = 1;
          }
        },
        () => undefined
      );
    }
  } catch {
    /* ignore */
  }

  try {
    if (window.speechSynthesis && !window.speechSynthesis.speaking) {
      const warm = new SpeechSynthesisUtterance(" ");
      warm.volume = 0;
      warm.rate = 2;
      warm.lang = "en-US";
      window.speechSynthesis.speak(warm);
    }
  } catch {
    /* ignore */
  }
}

export function isDooogsAudioUnlocked(): boolean {
  return audioUnlocked;
}

type SpeakHandles = {
  stop: () => void;
  done: Promise<void>;
};

function pickBrowserVoice(locale: Locale): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const want = locale === "fr" ? "fr" : "en";
  const scored = [...voices].map((v) => {
    const name = `${v.name} ${v.lang}`.toLowerCase();
    let score = 0;
    if (v.lang.toLowerCase().startsWith(want)) score += 50;
    if (/(google|natural|enhanced|premium|siri|neural)/.test(name)) score += 20;
    if (
      /(alex|aaron|arthur|daniel|david|fred|george|guy|james|mark|rishi|thomas|mathieu|henri|male)/.test(
        name
      ) &&
      !/female/.test(name)
    ) {
      score += 40;
    }
    if (
      /(samantha|karen|moira|aria|jenny|ava|zoe|victoria|amelie|marie|nicky|susan|zira|female|woman)/.test(
        name
      )
    ) {
      score -= 40;
    }
    return { v, score };
  });
  scored.sort((a, b) => b.score - a.score);
  return scored[0]?.v ?? null;
}

function waitForVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      resolve();
      return;
    }
    if (window.speechSynthesis.getVoices().length) {
      resolve();
      return;
    }
    const done = () => resolve();
    window.speechSynthesis.addEventListener("voiceschanged", done, {
      once: true,
    });
    try {
      window.speechSynthesis.getVoices();
    } catch {
      /* ignore */
    }
    window.setTimeout(done, 400);
  });
}

async function speakWithBrowser(
  text: string,
  locale: Locale,
  signal: { stopped: boolean },
  opts?: { onStart?: () => void; onEnd?: () => void }
): Promise<boolean> {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;

  await waitForVoices();
  if (signal.stopped) return false;

  window.speechSynthesis.cancel();

  const parts = splitSpeakChunks(text, 220);
  const voice = pickBrowserVoice(locale);
  opts?.onStart?.();

  const keepAlive = window.setInterval(() => {
    try {
      if (window.speechSynthesis.paused) window.speechSynthesis.resume();
    } catch {
      /* ignore */
    }
  }, 250);

  try {
    for (const chunk of parts) {
      if (signal.stopped) break;
      await new Promise<void>((resolve) => {
        const utter = new SpeechSynthesisUtterance(chunk);
        utter.lang = locale === "fr" ? "fr-FR" : "en-US";
        utter.rate = 1;
        utter.pitch = 0.92;
        utter.volume = 1;
        if (voice) utter.voice = voice;
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          resolve();
        };
        utter.onend = finish;
        utter.onerror = finish;
        // Per-chunk budget — long enough to finish, not forever
        window.setTimeout(finish, Math.min(45_000, 2500 + chunk.length * 90));
        window.speechSynthesis.speak(utter);
        window.setTimeout(() => {
          try {
            window.speechSynthesis.resume();
          } catch {
            /* ignore */
          }
        }, 30);
      });
    }
    opts?.onEnd?.();
    return parts.length > 0 && !signal.stopped;
  } finally {
    window.clearInterval(keepAlive);
  }
}

async function speakWithSharedMp3(
  blob: Blob,
  signal: { stopped: boolean }
): Promise<boolean> {
  if (signal.stopped) return false;
  const audio = getSharedAudio();
  const objectUrl = URL.createObjectURL(blob);
  let timer = 0;
  try {
    audio.onended = null;
    audio.onerror = null;
    audio.pause();
    audio.src = objectUrl;
    audio.load();
    audio.currentTime = 0;
    audio.volume = 1;

    const playPromise = audio.play();
    await Promise.race([
      playPromise,
      new Promise<never>((_, reject) => {
        timer = window.setTimeout(
          () => reject(new Error("audio_play_timeout")),
          5_000
        );
      }),
    ]);
    window.clearTimeout(timer);
    timer = 0;

    await new Promise<void>((resolve, reject) => {
      const finish = (err?: Error) => {
        window.clearTimeout(timer);
        audio.onended = null;
        audio.onerror = null;
        if (err) reject(err);
        else resolve();
      };

      const armTimeout = () => {
        window.clearTimeout(timer);
        const dur = audio.duration;
        // Wait for the real clip length (+ buffer). Never use a flat 20s cut-off.
        const ms =
          Number.isFinite(dur) && dur > 0
            ? Math.min(90_000, Math.max(6_000, dur * 1000 + 2_500))
            : Math.min(90_000, 6_000 + blob.size * 0.12);
        timer = window.setTimeout(() => {
          try {
            // Near the end → treat as done; otherwise fail this chunk
            if (
              Number.isFinite(audio.duration) &&
              audio.duration > 0 &&
              audio.currentTime >= audio.duration - 0.4
            ) {
              finish();
              return;
            }
            audio.pause();
          } catch {
            /* ignore */
          }
          finish(new Error("audio_ended_timeout"));
        }, ms);
      };

      audio.onended = () => finish();
      audio.onerror = () => finish(new Error("audio_error"));
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        armTimeout();
      } else {
        audio.addEventListener("loadedmetadata", armTimeout, { once: true });
        // Fallback if metadata never arrives
        timer = window.setTimeout(armTimeout, 1_200);
      }
    });
    return true;
  } catch {
    try {
      audio.pause();
    } catch {
      /* ignore */
    }
    return false;
  } finally {
    window.clearTimeout(timer);
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 2000);
  }
}

async function fetchTtsBlob(
  text: string,
  locale: Locale,
  signal: AbortSignal,
  timeoutMs = 12_000
): Promise<Blob | null> {
  const timeout = new AbortController();
  const onAbort = () => timeout.abort();
  signal.addEventListener("abort", onAbort);
  const timer = window.setTimeout(() => timeout.abort(), timeoutMs);
  try {
    const res = await fetch(apiUrl("/api/tts"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, locale }),
      signal: timeout.signal,
    });
    if (!res.ok) return null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) return null;
    const blob = await res.blob();
    if (blob.size < 400) return null;
    return blob;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
    signal.removeEventListener("abort", onAbort);
  }
}

/**
 * Speak a Dooogs! reply.
 * Plays short TTS clips in sequence (reliable duration) with browser fallback.
 */
export function speakDooogs(
  html: string,
  locale: Locale,
  opts?: {
    onStart?: () => void;
    onEnd?: () => void;
    onError?: () => void;
  }
): SpeakHandles {
  const text = forSpokenVoice(html);
  const signal = { stopped: false };
  const abort = new AbortController();
  let ended = false;

  const endOnce = () => {
    if (ended) return;
    ended = true;
    opts?.onEnd?.();
  };

  const stop = () => {
    signal.stopped = true;
    abort.abort();
    try {
      sharedAudio?.pause();
    } catch {
      /* ignore */
    }
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* ignore */
    }
    endOnce();
  };

  const done = (async () => {
    if (!text || signal.stopped) return;

    const hardCap = window.setTimeout(() => {
      if (!ended) stop();
    }, speechBudgetMs(text));

    try {
      const chunks = splitSpeakChunks(text, 160);
      if (!chunks.length) return;

      opts?.onStart?.();
      let spokenAny = false;

      for (let i = 0; i < chunks.length; i++) {
        if (signal.stopped) break;
        const chunk = chunks[i]!;
        const blob = await fetchTtsBlob(chunk, locale, abort.signal, 14_000);
        if (blob && !signal.stopped) {
          const played = await speakWithSharedMp3(blob, signal);
          if (played) {
            spokenAny = true;
            continue;
          }
        }
        if (signal.stopped) break;
        // Per-chunk browser fallback so one bad MP3 doesn't kill the rest
        const ok = await speakWithBrowser(chunk, locale, signal);
        if (ok) spokenAny = true;
        else if (!spokenAny && i === chunks.length - 1) {
          opts?.onError?.();
        }
      }

      if (!spokenAny && !signal.stopped) {
        const ok = await speakWithBrowser(text, locale, signal);
        if (!ok) opts?.onError?.();
      }
    } finally {
      window.clearTimeout(hardCap);
      endOnce();
    }
  })();

  return { stop, done };
}
