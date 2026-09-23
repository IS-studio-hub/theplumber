/**
 * Detect social / messenger in-app browsers (LinkedIn, Facebook, Instagram, …).
 * These WebViews often break WebGL, autoplay audio, mic, and device sensors.
 */
export function isInAppBrowser(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  if (!ua) return false;
  if (
    /LinkedIn|LinkedInApp|FBAN|FBAV|FB_IAB|FBIOS|Instagram|Line\/|Twitter|TikTok|Snapchat|MicroMessenger|BytedanceWebview|GSA\//i.test(
      ua
    )
  ) {
    return true;
  }
  // iOS WebView that isn't Safari (common for LinkedIn / Mail / etc.)
  const ios = /iPhone|iPad|iPod/i.test(ua);
  if (ios && /AppleWebKit/i.test(ua) && !/Safari\//i.test(ua)) return true;
  return false;
}

/** Facebook / Instagram / LinkedIn — never mount WebGL (crashes the page). */
export function shouldAvoidWebGL(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  if (isInAppBrowser(ua)) return true;
  return false;
}

export function isAndroid(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return /Android/i.test(ua);
}

export function isIOS(ua = typeof navigator !== "undefined" ? navigator.userAgent : ""): boolean {
  return (
    /iPhone|iPad|iPod/i.test(ua) ||
    (typeof navigator !== "undefined" &&
      navigator.platform === "MacIntel" &&
      (navigator.maxTouchPoints || 0) > 1)
  );
}

/**
 * Safari / iOS / Android: lighter GPU profile that keeps the same look.
 * In-app browsers should use shouldAvoidWebGL() instead (no Three.js at all).
 */
export function needsLiteGpu(): boolean {
  if (typeof window === "undefined") return true;
  if (isIOS()) return true;
  if (isAndroid()) return true;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof mem === "number" && mem > 0 && mem <= 4) return true;
  return false;
}

export function canUseWebGL(): boolean {
  if (typeof document === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    const gl =
      canvas.getContext("webgl2") ||
      canvas.getContext("webgl") ||
      canvas.getContext("experimental-webgl");
    return Boolean(gl);
  } catch {
    return false;
  }
}

/** Copy helper that works in restricted WebViews without Clipboard API. */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through */
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Try to escape LinkedIn/Facebook WebView into Chrome/Safari.
 * Android: Chrome Intent URL. iOS: Safari/Chrome URL schemes (best-effort).
 */
export function tryOpenInExternalBrowser(url = typeof window !== "undefined" ? window.location.href : ""): boolean {
  if (!url || typeof window === "undefined") return false;
  const ua = navigator.userAgent || "";

  try {
    if (isAndroid(ua)) {
      const u = new URL(url);
      const intent =
        `intent://${u.host}${u.pathname}${u.search}${u.hash}` +
        `#Intent;scheme=https;package=com.android.chrome;` +
        `S.browser_fallback_url=${encodeURIComponent(url)};end`;
      window.location.href = intent;
      return true;
    }

    if (isIOS(ua)) {
      const withoutScheme = url.replace(/^https:\/\//i, "").replace(/^http:\/\//i, "");
      window.location.href = `x-safari-https://${withoutScheme}`;
      window.setTimeout(() => {
        try {
          window.location.href = `googlechromes://${withoutScheme}`;
        } catch {
          /* ignore */
        }
      }, 700);
      return true;
    }
  } catch {
    /* ignore */
  }

  try {
    window.location.assign(url);
    return true;
  } catch {
    return false;
  }
}
