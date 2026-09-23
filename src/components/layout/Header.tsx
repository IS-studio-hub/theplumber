"use client";

import type { Locale } from "@/lib/lisa-types";
import { AvaLogo } from "@/components/layout/AvaLogo";
import Link from "next/link";
import { withBase } from "@/lib/base-path";
import { useEffect, useState } from "react";

const copy = {
  en: {
    talk: "Chat with AVA",
    dash: "Dashboard",
  },
  fr: {
    talk: "Parler à AVA",
    dash: "Tableau de bord",
  },
} as const;

export function Header({ locale }: { locale: Locale }) {
  const t = copy[locale];
  const [dashHref, setDashHref] = useState(`/${locale}/dashboard`);

  useEffect(() => {
    setDashHref(withBase(`/${locale}/dashboard`));
  }, [locale]);

  return (
    <>
      <div className="c-header_bg" aria-hidden="true" />
      <header role="banner">
        <div className="c-header">
          <div className="c-header_logo">
            <Link href={`/${locale}`} className="c-header_logo_inner" style={{ textDecoration: "none" }}>
              <AvaLogo className="c-header_logo_img" title="AVA — Sewer Squad" />
            </Link>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <Link
              href={dashHref}
              style={{
                fontSize: "0.85rem",
                fontWeight: 500,
                letterSpacing: "0.04em",
                textTransform: "uppercase",
                textDecoration: "none",
                color: "inherit",
                opacity: 0.75,
              }}
            >
              {t.dash}
            </Link>
            <p className="c-header_cta">{t.talk}</p>
          </div>
        </div>
      </header>
    </>
  );
}
