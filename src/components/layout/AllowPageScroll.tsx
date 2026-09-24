"use client";

import { useEffect } from "react";

/**
 * Opt out of the full-screen chat shell scroll lock so long pages
 * (dashboard, privacy, etc.) can scroll normally.
 */
export function AllowPageScroll() {
  useEffect(() => {
    const root = document.documentElement;
    root.classList.add("allow-page-scroll");
    return () => {
      root.classList.remove("allow-page-scroll");
    };
  }, []);

  return null;
}
