import type { NextConfig } from "next";
import { existsSync, rmSync } from "fs";
import { join } from "path";

const isGithubPages =
  process.env.GITHUB_PAGES === "true" ||
  process.env.GITHUB_ACTIONS === "true";

if (isGithubPages) {
  const apiDir = join(process.cwd(), "src/app/api");
  if (existsSync(apiDir)) {
    rmSync(apiDir, { recursive: true, force: true });
  }
}

/** Optional GitHub Pages repo name — leave empty for local / custom hosting */
const repoName = process.env.NEXT_PUBLIC_REPO_NAME || "";
const basePath = isGithubPages && repoName ? `/${repoName}` : "";

const nextConfig: NextConfig = {
  ...(isGithubPages
    ? {
        output: "export" as const,
        ...(basePath
          ? { basePath, assetPrefix: `${basePath}/` }
          : {}),
        trailingSlash: false,
        images: { unoptimized: true },
      }
    : {}),
  env: {
    NEXT_PUBLIC_BASE_PATH: basePath,
    NEXT_PUBLIC_API_ORIGIN: process.env.NEXT_PUBLIC_API_ORIGIN || "",
    NEXT_PUBLIC_OLLAMA_BASE_URL:
      process.env.NEXT_PUBLIC_OLLAMA_BASE_URL || "http://127.0.0.1:11434",
    NEXT_PUBLIC_OLLAMA_PUBLIC_URL:
      process.env.NEXT_PUBLIC_OLLAMA_PUBLIC_URL || "",
    NEXT_PUBLIC_OLLAMA_CHAT_MODEL:
      process.env.NEXT_PUBLIC_OLLAMA_CHAT_MODEL || "llama3.1:8b",
  },
};

export default nextConfig;
