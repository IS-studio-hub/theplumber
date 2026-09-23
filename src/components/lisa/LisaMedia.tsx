"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import type { CharacterClip } from "./LisaCharacter";
import { canUseWebGL, shouldAvoidWebGL } from "@/lib/in-app-browser";

/**
 * Lazy-load Three.js only outside Facebook/LinkedIn/Instagram WebViews.
 * Those browsers crash (“A problem repeatedly occurred”) if WebGL starts.
 */
const LisaCharacter = dynamic(
  () => import("./LisaCharacter").then((m) => m.LisaCharacter),
  {
    ssr: false,
    loading: () => <StaticStage />,
  }
);

function StaticStage() {
  return (
    <div className="c-lisa_stage c-lisa_stage-static" aria-hidden="true">
      <div
        className="c-lisa_stage-mark"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: "100%",
          height: "100%",
          fontFamily: "var(--font-display-family), sans-serif",
          fontSize: "clamp(2.5rem, 8vw, 4.5rem)",
          fontWeight: 500,
          letterSpacing: "0.12em",
          color: "#222",
          opacity: 0.35,
        }}
      >
        AVA
      </div>
    </div>
  );
}

/**
 * AVA media stage for Sewer Squad.
 * Real browsers: 3D character. Facebook/etc: static branded stage + chat UI.
 */
export function LisaMedia({
  clip = "idle",
  useCharacter = true,
}: {
  media?: unknown;
  muted?: boolean;
  clip?: CharacterClip;
  useCharacter?: boolean;
}) {
  const [mode, setMode] = useState<"loading" | "static" | "3d">("loading");

  useEffect(() => {
    if (!useCharacter || shouldAvoidWebGL()) {
      setMode("static");
      return;
    }
    const start = () => {
      setMode(canUseWebGL() ? "3d" : "static");
    };
    let idleId = 0;
    let timeoutId = 0;
    const ric = (
      window as Window & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (typeof ric === "function") {
      idleId = ric(start, { timeout: 800 });
    } else {
      timeoutId = window.setTimeout(start, 200);
    }
    return () => {
      if (idleId && "cancelIdleCallback" in window) {
        (
          window as Window & { cancelIdleCallback?: (id: number) => void }
        ).cancelIdleCallback?.(idleId);
      }
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [useCharacter]);

  if (mode !== "3d") {
    return <StaticStage />;
  }

  return <LisaCharacter clip={clip} />;
}
