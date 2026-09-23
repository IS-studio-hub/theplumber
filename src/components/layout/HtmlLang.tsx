"use client";

import { useEffect } from "react";
import type { Locale } from "@/lib/lisa-types";

export function HtmlLang({ locale }: { locale: Locale }) {
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dataset.theme = "lisa";
    document.documentElement.dataset.template = "lisa";
  }, [locale]);
  return null;
}
