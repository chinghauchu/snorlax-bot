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
chat (not a fourth column), Settings. The agent overlay shows a 288×180
16:10 computer preview above Routines. When `hasSandbox`, a trailing
12px **Open** (and a pointer-cursor shot) opens a takeover overlay on
chat + the info pane (sidebar stays). 52px bar: 24px avatar + name,
12px muted `You're driving · agent paused`, trailing primary **Done**
36px. Esc = Done. Composer is inert while driving. Empty `No computer
yet.` has no Open. While driving, 12px muted **Record** sits left of
Done. Recording swaps that control to `--danger` **Stop** plus a 6px
danger dot (static if Reduce Motion); Done is disabled. Stop opens a
320px **Save as skill** sheet. iOS stays preview-only (no tap-to-open,
no Record).
Create agent or channel from +.
Muted 12px tool traces (`Searching…` / `Wrote app.py` / `Used server__tool`) may appear in
the transcript while the runtime runs tools (including MCP). Agent info
pane lists cron routines (44px rows, live enable/pause switch, 12px Add /
Remove). Webhook
rows show muted `Webhook` plus Copy for the URL. Below that, Skills
(44px rows, 12px muted Edit then Remove; 320px Edit skill source
sheet; no blank Add). Settings
lists runtime plugins (`Connected` / `Needs sign-in`; Add / Remove).
Assistant LEFT
`kind=message` is 14px markdown (no grey bubble, 16/14 headings); user-right stays plain (`https://` tappable). Fenced code is full-turn language + Copy at 12px/1.45.
iOS has no file-tree computer pane; the agent sheet shows the same preview.

Types and the `/v1` client are generated from the locked camelCase OpenAPI
(`openapi.yaml`, same contract as `protocol/openapi.yaml` on the Backend
contract PR). Regenerate with `npm run generate:api`.
