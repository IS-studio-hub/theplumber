"use client";

import type { Locale } from "@/lib/lisa-types";
import { AvaLogo } from "@/components/layout/AvaLogo";
import Link from "next/link";

const copy = {
  en: {
    dash: "Dashboard",
  },
  fr: {
    dash: "Tableau de bord",
  },
} as const;

export function Header({ locale }: { locale: Locale }) {
  const t = copy[locale];
  // next/link prefixes basePath itself. Do not wrap with withBase or GitHub Pages doubles it.

  return (
    <>
      <div className="c-header_bg" aria-hidden="true" />
      <header role="banner">
        <div className="c-header">
          <div className="c-header_logo">
            <Link href={`/${locale}`} className="c-header_logo_inner" style={{ textDecoration: "none" }}>
              <AvaLogo className="c-header_logo_img" title="Sewer Squad" />
            </Link>
          </div>

          <div className="c-header_actions">
            <Link href={`/${locale}/dashboard`} className="c-header_btn">
              {t.dash}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
