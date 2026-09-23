"use client";

import Script from "next/script";
import { useEffect, useState } from "react";
import { isInAppBrowser } from "@/lib/in-app-browser";

/**
 * Load Lytico only in real browsers. Facebook/LinkedIn WebViews are crash-prone;
 * skip third-party scripts there to keep the page alive.
 */
export function LyticoAnalytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (isInAppBrowser()) return;
    const t = window.setTimeout(() => setEnabled(true), 400);
    return () => window.clearTimeout(t);
  }, []);

  if (!enabled) return null;

  return (
    <Script
      src="https://lytico-production.up.railway.app/lytico.js"
      strategy="lazyOnload"
      data-site="lt_dooogs_is02"
    />
  );
}
