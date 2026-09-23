"use client";

import { useEffect, useState } from "react";
import { AvaLogo } from "@/components/layout/AvaLogo";
import { isInAppBrowser } from "@/lib/in-app-browser";

export function Preloader() {
  const [done, setDone] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    document.documentElement.classList.add("is-first-loading", "is-loading");
    const inApp = isInAppBrowser();
    let quick = false;
    try {
      quick = sessionStorage.getItem("ava.quickpreload") === "1";
    } catch {
      /* ignore */
    }
    const delay = inApp ? 180 : quick ? 400 : 1200;

    const t = window.setTimeout(() => {
      setDone(true);
      document.documentElement.classList.remove("is-first-loading", "is-loading");
      document.documentElement.classList.add("is-loaded", "is-ready");
      try {
        sessionStorage.setItem("ava.quickpreload", "1");
      } catch {
        /* ignore */
      }
    }, delay);

    const hide = window.setTimeout(
      () => setHidden(true),
      delay + (inApp ? 200 : 900)
    );

    return () => {
      window.clearTimeout(t);
      window.clearTimeout(hide);
    };
  }, []);

  if (hidden) return null;

  return (
    <div
      className={`c-preloader${done ? " is-done" : ""}`}
      aria-hidden="true"
      id="preloader"
    >
      <AvaLogo className="c-preloader_logo c-preloader_logo_img" invert title="AVA" />
    </div>
  );
}
