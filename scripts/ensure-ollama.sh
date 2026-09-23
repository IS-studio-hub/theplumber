#!/usr/bin/env bash
# Start local Ollama (llama3.1:8b) + optional public tunnel for the Cloudflare Worker.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${OLLAMA_CHAT_MODEL:-llama3.1:8b}"

if ! command -v ollama >/dev/null 2>&1; then
  echo "Install Ollama from https://ollama.com then re-run."
  exit 1
fi

echo "Ensuring model $MODEL is available…"
ollama pull "$MODEL" >/dev/null

# Keep Ollama serving
if ! curl -fsS "http://127.0.0.1:11434/api/tags" >/dev/null 2>&1; then
  echo "Start the Ollama app (or: ollama serve) and re-run."
  exit 1
fi

echo "Local chat is ready at http://127.0.0.1:11434 (model $MODEL)"
echo "Run the site with: npm run dev"
echo
echo "For the live GitHub Pages site, claim the Cloudflare Worker account so"
echo "free Workers AI (Llama) can answer without your laptop staying online."
