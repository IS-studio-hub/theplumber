"use client";

import { useEffect, useState } from "react";
import { withBase } from "@/lib/base-path";

/** dooogs dachshund silhouette mark */
export function DooogsLogo({
  className = "",
  title = "dooogs",
  invert = false,
}: {
  className?: string;
  title?: string;
  /** White silhouette for dark backgrounds (preloader). */
  invert?: boolean;
}) {
  const path = invert
    ? "/assets/images/brand/dooogs-mark-white.png?v=dachshund-1"
    : "/assets/images/brand/dooogs-mark.png?v=dachshund-1";
  const [src, setSrc] = useState(path);

  useEffect(() => {
    setSrc(withBase(path));
  }, [path]);

  return (
    // eslint-disable-next-line @next/next/no-img-element -- static export + CSS sizing
    <img
      src={src}
      alt={title}
      width={240}
      height={120}
      className={className}
      decoding="async"
    />
  );
}
