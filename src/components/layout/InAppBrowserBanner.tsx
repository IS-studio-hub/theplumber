"use client";

import { useEffect, useMemo, useState, type MouseEvent, type TouchEvent } from "react";
import type { Locale } from "@/lib/lisa-types";
import {
  copyTextToClipboard,
  isAndroid,
  isIOS,
  isInAppBrowser,
  tryOpenInExternalBrowser,
} from "@/lib/in-app-browser";

const copy = {
  en: {
    text: "For the full 3D dog experience, open this page in Safari or Chrome. Chat still works here.",
    open: "Open in browser",
    copyLink: "Copy link",
    copied: "Link copied — paste it in Safari or Chrome",
    tipIos: "Tip: tap ⋯ → Open in Safari",
    tipAndroid: "Tip: tap ⋮ → Open in Chrome",
    dismiss: "Keep chatting here",
  },
  fr: {
    text: "Pour la 3D complète, ouvre cette page dans Safari ou Chrome. Le chat marche déjà ici.",
    open: "Ouvrir dans le navigateur",
    copyLink: "Copier le lien",
    copied: "Lien copié — colle-le dans Safari ou Chrome",
    tipIos: "Astuce: ⋯ → Ouvrir dans Safari",
    tipAndroid: "Astuce: ⋮ → Ouvrir dans Chrome",
    dismiss: "Continuer le chat ici",
  },
} as const;

const DISMISS_KEY = "dooogs_inapp_banner_dismissed";

export function InAppBrowserBanner({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hint, setHint] = useState<string | null>(null);
  const t = copy[locale] ?? copy.en;

  const tip = useMemo(() => {
    if (typeof navigator === "undefined") return t.tipIos;
    if (isAndroid()) return t.tipAndroid;
    if (isIOS()) return t.tipIos;
    return t.tipIos;
  }, [t]);

  useEffect(() => {
    if (!isInAppBrowser()) return;
    try {
      if (sessionStorage.getItem(DISMISS_KEY)) return;
    } catch {
      /* ignore */
    }
    setVisible(true);
  }, []);

  if (!visible) return null;

  const url = typeof window !== "undefined" ? window.location.href : "";

  function dismiss() {
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  async function copyUrl() {
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopied(true);
      setHint(t.copied);
      window.setTimeout(() => {
        setCopied(false);
        setHint(null);
      }, 3500);
    } else {
      setHint(tip);
    }
  }

  async function openExternal(e: MouseEvent | TouchEvent) {
    e.preventDefault();
    e.stopPropagation();
    void copyTextToClipboard(url);
    const tried = tryOpenInExternalBrowser(url);
    window.setTimeout(() => {
      setHint(tried ? tip : t.copied);
      setCopied(true);
    }, 900);
  }

  return (
    <aside className="c-inapp" role="status">
      <p className="c-inapp_text">{t.text}</p>
      {hint ? <p className="c-inapp_hint">{hint}</p> : <p className="c-inapp_hint">{tip}</p>}
      <div className="c-inapp_actions">
        <button type="button" className="c-inapp_btn -primary" onClick={(e) => void openExternal(e)}>
          {t.open}
        </button>
        <button type="button" className="c-inapp_btn -secondary" onClick={() => void copyUrl()}>
          {copied ? t.copied.split("—")[0]?.trim() || t.copied : t.copyLink}
        </button>
        <button type="button" className="c-inapp_btn -ghost" onClick={dismiss}>
          {t.dismiss}
        </button>
      </div>
    </aside>
  );
}
