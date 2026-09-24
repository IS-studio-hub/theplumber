"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { sanitizeDialogHtml } from "@/lib/safe-html";

function tokenize(html: string): string[] {
  const parts = html.split(/(<[^>]+>|\s+)/).filter((p) => p.length > 0);
  return parts;
}

export function LisaDialog({
  html,
  showCursor,
  onComplete,
  instant = false,
}: {
  html: string;
  showCursor: boolean;
  onComplete?: () => void;
  /** Show the full message at once (opening greeting, etc.) */
  instant?: boolean;
}) {
  const safeHtml = useMemo(() => sanitizeDialogHtml(html), [html]);
  const tokens = useMemo(() => tokenize(safeHtml), [safeHtml]);
  const [visibleCount, setVisibleCount] = useState(instant ? tokens.length : 0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (instant || tokens.length === 0) {
      setVisibleCount(tokens.length);
      const t = window.setTimeout(() => onCompleteRef.current?.(), 40);
      return () => window.clearTimeout(t);
    }

    setVisibleCount(0);
    let i = 0;
    // Steady word-by-word reveal — never skip so hard the message looks chopped up
    const step = tokens.length > 100 ? 2 : 1;
    const delay = tokens.length > 80 ? 18 : 28;
    const id = window.setInterval(() => {
      i += step;
      setVisibleCount(Math.min(i, tokens.length));
      if (i >= tokens.length) {
        window.clearInterval(id);
        onCompleteRef.current?.();
      }
    }, delay);
    return () => window.clearInterval(id);
  }, [tokens, instant]);

  const shown = tokens.slice(0, visibleCount).join("");

  return (
    <div
      className={`c-lisa-step_dialog${showCursor && visibleCount < tokens.length ? " -show-cursor" : ""}`}
      role="status"
      aria-live="polite"
      aria-atomic="false"
    >
      <span dangerouslySetInnerHTML={{ __html: shown || "&nbsp;" }} />
    </div>
  );
}
