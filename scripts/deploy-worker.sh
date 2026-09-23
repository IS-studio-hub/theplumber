#!/usr/bin/env bash
# Deploy the Dooogs! API worker (chat + STT + TTS).
# Requires: npx wrangler login   OR   export CLOUDFLARE_API_TOKEN=...
# Tip: temporary preview accounts cannot run Workers AI / Whisper until claimed
# and billed — TTS (Google) still works. Claim URL is printed by wrangler.
set -euo pipefail
cd "$(dirname "$0")/../workers/ginny-api"
npx wrangler deploy
echo "Worker deployed. Mic STT + shared TTS + dog chat are live."
