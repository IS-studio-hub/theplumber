# Unreal MCP (UE 5.8) — LISA setup

Unreal MCP runs **inside Unreal Editor**, not as an npm package. This website project is wired to the live editor server.

## Prerequisites

- Unreal Engine **5.8** (installed)
- Project: `AAA Game/ThirdPersonGame 5.8` (already has MCP plugins enabled)
- Unreal Editor open with that project

## Cursor config (this repo)

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "unreal-mcp": {
      "type": "http",
      "url": "http://127.0.0.1:8000/mcp"
    }
  }
}
```

Also written to the Unreal project as `.mcp.json`.

## Enable / verify in Unreal

1. **Edit → Plugins** → enable **Unreal MCP** + **All Toolsets** (restart if prompted)
2. **Edit → Editor Preferences → General → Model Context Protocol** → **Auto Start Server**
3. Endpoint: `http://127.0.0.1:8000/mcp`
4. Optional console: `ModelContextProtocol.GenerateClientConfig Cursor`

## What was created via MCP

In `Lvl_ThirdPerson`:

- Actor **LisaCharacter** — CRT-head turtleneck bust (primitives)
- Materials under `/Game/LISA/Materials/`
- Studio rect lights `Lisa_KeyLight` / `Lisa_FillLight`

Preview: `Saved/Lisa_MCP_preview.png` (after capture)

## Note

Unreal MCP is an **editor automation** API (spawn actors, materials, lighting). It does not generate cinematic organic characters; the LISA build here is a **high-level blockout** matching the CRT + turtleneck silhouette from [lisa.locomotive.ca](https://lisa.locomotive.ca/en).
