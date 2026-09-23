#!/usr/bin/env node
/**
 * Tiny CORS/Host proxy so public tunnels can reach local Ollama.
 * Usage: node scripts/ollama-proxy.mjs
 * Then: cloudflared tunnel --url http://127.0.0.1:11435
 */
import http from "node:http";

const LISTEN = Number(process.env.OLLAMA_PROXY_PORT || 11435);
const TARGET = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const body = Buffer.concat(chunks);

  try {
    const upstream = await fetch(`${TARGET}${req.url}`, {
      method: req.method,
      headers: {
        "Content-Type": req.headers["content-type"] || "application/json",
        Host: "127.0.0.1:11434",
      },
      body: req.method === "GET" || req.method === "HEAD" ? undefined : body,
    });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.writeHead(upstream.status, {
      "Content-Type": upstream.headers.get("content-type") || "application/json",
      "Access-Control-Allow-Origin": "*",
    });
    res.end(buf);
  } catch (err) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "proxy_failed", detail: String(err) }));
  }
});

server.listen(LISTEN, "127.0.0.1", () => {
  console.log(`ollama-proxy listening on http://127.0.0.1:${LISTEN} → ${TARGET}`);
});
