"use client";

import { useEffect } from "react";
import { isInAppBrowser, isIOS } from "@/lib/in-app-browser";

/**
 * Fixes the “page pushed up / blank viewport” bug when opening from LinkedIn,
 * Facebook, or other in-app browsers into Safari/Chrome. Those handoffs often
 * leave a non-zero scroll offset or a stale visualViewport height until refresh.
 *
 * Also strips tracking query junk (fbclid, etc.) without reloading — avoids
 * odd WebView reload loops on shared links.
 */
export function ViewportLock() {
  useEffect(() => {
    const root = document.documentElement;
    const inApp = isInAppBrowser();
    if (inApp) root.classList.add("is-inapp");
    if (isIOS()) root.classList.add("is-ios");

    // Clean share-tracker params without a navigation (safe in WebViews)
    try {
      const u = new URL(window.location.href);
      const junk = ["fbclid", "gclid", "mc_eid", "igshid", "si"];
      let changed = false;
      for (const key of junk) {
        if (u.searchParams.has(key)) {
          u.searchParams.delete(key);
          changed = true;
        }
      }
      // utm_* params
      [...u.searchParams.keys()].forEach((k) => {
        if (k.startsWith("utm_")) {
          u.searchParams.delete(k);
          changed = true;
        }
      });
      if (changed) {
        window.history.replaceState(null, "", u.pathname + u.search + u.hash);
      }
    } catch {
      /* ignore */
    }

    let ticking = false;
    const apply = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const vv = window.visualViewport;
        const h = Math.round(vv?.height || window.innerHeight || root.clientHeight);
        if (h > 0) {
          root.style.setProperty("--app-height", `${h}px`);
        }

        if (window.scrollX !== 0 || window.scrollY !== 0) {
          // Don't fight document scroll on dashboard / privacy pages
          if (!root.classList.contains("allow-page-scroll")) {
            window.scrollTo(0, 0);
          }
        }
        if (!root.classList.contains("allow-page-scroll")) {
          if (root.scrollTop) root.scrollTop = 0;
          if (document.body.scrollTop) document.body.scrollTop = 0;
        }
      });
    };

    apply();
    // Fewer retries in fragile WebViews (avoids layout thrash → crash)
    const delays = inApp ? [100, 500] : [50, 250, 600];
    const timers = delays.map((ms) => window.setTimeout(apply, ms));

    const onShow = () => apply();
    window.addEventListener("resize", apply, { passive: true });
    window.addEventListener("orientationchange", onShow, { passive: true });
    window.addEventListener("pageshow", onShow);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") apply();
    });
    // Don't listen to visualViewport.scroll — it can fight iOS and crash WebViews
    window.visualViewport?.addEventListener("resize", apply, { passive: true });

    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("resize", apply);
      window.removeEventListener("orientationchange", onShow);
      window.removeEventListener("pageshow", onShow);
      window.visualViewport?.removeEventListener("resize", apply);
      root.classList.remove("is-inapp");
      root.classList.remove("is-ios");
    };
  }, []);

  return null;
}
