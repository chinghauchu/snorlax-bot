# Desktop client

TypeScript + Tauri shell for Snorlax-Bot. The web UI is the product; Tauri
is the native window. Talks only to the FastAPI runtime (`/v1`) with a
bearer token. Never talks to vLLM.

## Web (no Rust)

Runtime must already be up (see [../runtime/README.md](../runtime/README.md)).

```bash
npm install
npm run dev
```

Open http://127.0.0.1:1420. There is no Connect gate — the two-column chrome
is always on screen. Click the **Local** chip (sidebar footer) and paste the
Spark LAN URL plus token under Settings → General.

- Prefill `SNORLAX_URL` / `SNORLAX_TOKEN` if those env vars are set.
- Otherwise leave the fields empty. Placeholder: `http://<spark-lan>:8787`.
- Health (`GET /v1/health`) is unauthenticated and does not unlock send.
  The composer stays disabled until both URL and token are present.

## Native window

Requires a Rust toolchain and Tauri system deps.

```bash
npm install
npm run tauri dev
```

v0 chrome: 256px agent sidebar, chat, profile overlay, Settings. No computer
pane.

Types and the `/v1` client are generated from the locked camelCase OpenAPI
(`openapi.yaml`, same contract as `protocol/openapi.yaml` on the Backend
contract PR). Regenerate with `npm run generate:api`.
