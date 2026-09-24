"use client";

import { withBase } from "@/lib/base-path";

const LOGO_SRC = "/assets/images/sewer-squad-logo.png";

/** Sewer Squad brand mark */
export function AvaLogo({
  className = "",
  title = "Sewer Squad",
}: {
  className?: string;
  title?: string;
  invert?: boolean;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={withBase(LOGO_SRC)}
      alt={title}
      title={title}
      width={504}
      height={277}
    />
  );
}
