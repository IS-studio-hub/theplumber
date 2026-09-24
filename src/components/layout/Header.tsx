"use client";

import type { Locale } from "@/lib/lisa-types";
import { AvaLogo } from "@/components/layout/AvaLogo";
import Link from "next/link";
import { withBase } from "@/lib/base-path";
import { useEffect, useState } from "react";

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
              <AvaLogo className="c-header_logo_img" title="Sewer Squad" />
            </Link>
          </div>

          <div className="c-header_actions">
            <Link href={dashHref} className="c-header_btn">
              {t.dash}
            </Link>
          </div>
        </div>
      </header>
    </>
  );
}
