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
}: {
  html: string;
  showCursor: boolean;
  onComplete?: () => void;
}) {
  const safeHtml = useMemo(() => sanitizeDialogHtml(html), [html]);
  const tokens = useMemo(() => tokenize(safeHtml), [safeHtml]);
  const [visibleCount, setVisibleCount] = useState(0);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    setVisibleCount(0);
    let i = 0;
    // Faster reveal for longer chat replies so the UI never feels stuck
    const step = tokens.length > 80 ? 3 : tokens.length > 40 ? 2 : 1;
    const delay = tokens.length > 120 ? 12 : 22;
    const id = window.setInterval(() => {
      i += step;
      setVisibleCount(Math.min(i, tokens.length));
      if (i >= tokens.length) {
        window.clearInterval(id);
        onCompleteRef.current?.();
      }
    }, delay);
    return () => window.clearInterval(id);
  }, [tokens]);

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
