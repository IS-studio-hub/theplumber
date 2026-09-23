#!/usr/bin/env bash
# Keep local Ollama reachable from phones + GitHub Pages (same chat as desktop).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MODEL="${OLLAMA_CHAT_MODEL:-llama3.1:8b}"
PROXY_PORT="${OLLAMA_PROXY_PORT:-11435}"

need() { command -v "$1" >/dev/null || { echo "Missing $1"; exit 1; }; }
need ollama
need cloudflared
need node
need rg

if ! curl -fsS --max-time 2 http://127.0.0.1:11434/api/version >/dev/null; then
  echo "Starting Ollama…"
  brew services start ollama 2>/dev/null || true
  sleep 3
fi
ollama pull "$MODEL" >/dev/null

pkill -f 'ollama-proxy.mjs' 2>/dev/null || true
pkill -f "cloudflared tunnel --url http://127.0.0.1:${PROXY_PORT}" 2>/dev/null || true
sleep 1

node "$ROOT/scripts/ollama-proxy.mjs" > /tmp/ollama-proxy.log 2>&1 &
sleep 1
cloudflared tunnel --url "http://127.0.0.1:${PROXY_PORT}" --no-autoupdate > /tmp/ollama-public.log 2>&1 &

echo "Waiting for public tunnel…"
TUNNEL=""
for _ in $(seq 1 40); do
  TUNNEL=$(rg -o 'https://[a-z0-9-]+\.trycloudflare\.com' /tmp/ollama-public.log 2>/dev/null | head -1 || true)
  [[ -n "$TUNNEL" ]] && break
  sleep 1
done
[[ -n "$TUNNEL" ]] || { echo "Tunnel failed — see /tmp/ollama-public.log"; exit 1; }

echo "$TUNNEL" > /tmp/ollama-public-url.txt
echo
echo "Public Ollama ready: $TUNNEL"
echo "Phones will use this URL (baked into the site build as NEXT_PUBLIC_OLLAMA_PUBLIC_URL)."
echo "Keep this process running while you want mobile chat to match desktop."
echo
# Optional smoke
HOST=${TUNNEL#https://}
for _ in $(seq 1 15); do
  IP=$(dig @1.1.1.1 +short "$HOST" A | head -1 || true)
  [[ -n "$IP" ]] || { sleep 1; continue; }
  if curl -4 -fsS --max-time 10 --resolve "$HOST:443:$IP" "$TUNNEL/api/tags" >/dev/null; then
    echo "Tunnel healthy."
    break
  fi
  sleep 1
done

tail -f /tmp/ollama-public.log
