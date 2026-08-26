# Desktop client

TypeScript + Tauri shell for Snorlax-Bot. The web UI is the product; Tauri
is the native window. Talks only to the FastAPI runtime (`/v1`) with a
bearer token. Never talks to oMLX or vLLM.

## Web (no Rust)

Runtime must already be up (see [../runtime/README.md](../runtime/README.md)).

```bash
npm install
npm run dev
```

Open http://127.0.0.1:1420. There is no Connect gate — the chrome
(sidebar, chat, computer pane) is always on screen. Click the **Local**
chip (sidebar footer) and paste the Runtime URL plus token under
Settings → General.

- Prefill `SNORLAX_URL` / `SNORLAX_TOKEN` if those env vars are set.
- Loopback is first-class: `http://127.0.0.1:8787` and `http://localhost:8787`
  save and survive reload.
- Otherwise leave the fields empty. Placeholder: `http://<spark-lan>:8787`
  (hint for a phone on the Spark LAN; not a ban on loopback).
- Health (`GET /v1/health`) is unauthenticated and does not unlock send.
  The composer stays disabled until both URL and token are present.

Mac-local runtime + oMLX: [../docs/mac-local.md](../docs/mac-local.md).

## Native window

Requires a Rust toolchain and Tauri system deps.

```bash
npm install
npm run tauri dev
```

v0 chrome: 256px agent sidebar, chat, 320px computer pane (file tree +
text preview; collapsible, default open), 320px identity overlay on the
chat (not a fourth column), Settings. Create agent or channel from +.
Muted 12px tool traces (`Searching…` / `Wrote app.py` / `Used server__tool`) may appear in
the transcript while the runtime runs tools (including MCP). Agent info
pane lists cron routines (44px rows, live enable/pause switch). Settings
lists runtime plugins (`Connected` / `Needs sign-in`; Add / uninstall /
disconnect). Assistant LEFT
`kind=message` is 14px markdown (no grey bubble, 16/14 headings); user-right stays plain (`https://` tappable). Fenced code is full-turn language + Copy at 12px/1.45.
iOS has no computer pane.

Types and the `/v1` client are generated from the locked camelCase OpenAPI
(`openapi.yaml`, same contract as `protocol/openapi.yaml` on the Backend
contract PR). Regenerate with `npm run generate:api`.
