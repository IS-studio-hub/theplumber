"use client";

/** AVA wordmark — text brand for the plumber product */
export function AvaLogo({
  className = "",
  title = "AVA",
  invert = false,
}: {
  className?: string;
  title?: string;
  invert?: boolean;
}) {
  return (
    <span
      className={className}
      title={title}
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "flex-start",
        lineHeight: 1.05,
        fontFamily: "var(--font-display-family), var(--font-ui)",
        fontWeight: 500,
        letterSpacing: "0.04em",
        color: invert ? "#fff" : "#111",
        userSelect: "none",
      }}
      aria-label={title}
    >
      <span style={{ fontSize: "1.55rem" }}>AVA</span>
      <span
        style={{
          fontSize: "0.62rem",
          letterSpacing: "0.14em",
          textTransform: "uppercase",
          opacity: 0.72,
          fontWeight: 400,
        }}
      >
        Sewer Squad
      </span>
    </span>
  );
}
