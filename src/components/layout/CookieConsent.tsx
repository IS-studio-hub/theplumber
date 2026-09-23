"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { Locale } from "@/lib/lisa-types";

const copy = {
  en: {
    title: "We use cookies!",
    description:
      "Hi, this website uses essential cookies to ensure its proper operation and tracking cookies to understand how you interact with it. The latter will be set only after consent.",
    acceptAll: "Accept All",
    acceptNecessary: "Accept Necessary",
    privacy: "privacy policy",
  },
  fr: {
    title: "Nous utilisons des cookies!",
    description:
      "Bonjour, ce site utilise des cookies essentiels pour assurer son bon fonctionnement et des cookies de suivi pour comprendre comment vous interagissez avec lui. Ces derniers ne seront déposés qu’après consentement.",
    acceptAll: "Tout accepter",
    acceptNecessary: "Accepter le nécessaire",
    privacy: "politique de confidentialité",
  },
} as const;

const STORAGE_KEY = "cc_cookie_dooogs_local";

export function CookieConsent({ locale }: { locale: Locale }) {
  const [visible, setVisible] = useState(false);
  const t = copy[locale];

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setVisible(true);
    } catch {
      setVisible(true);
    }
  }, []);

  function save(categories: string[]) {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ categories, ts: Date.now() })
      );
    } catch {
      /* ignore */
    }
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <aside
      className="c-cookie"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cookie-title"
    >
      <div className="c-cookie_title" id="cookie-title">
        {t.title}
      </div>
      <p>
        {t.description}{" "}
        <Link href={`/${locale}/privacy-policy`} className="c-cookie_link">
          {t.privacy}
        </Link>
      </p>
      <div className="c-cookie_actions">
        <button
          type="button"
          className="c-cookie_btn -primary"
          onClick={() => save(["necessary", "analytics"])}
        >
          {t.acceptAll}
        </button>
        <button
          type="button"
          className="c-cookie_btn -secondary"
          onClick={() => save(["necessary"])}
        >
          {t.acceptNecessary}
        </button>
      </div>
    </aside>
  );
}
