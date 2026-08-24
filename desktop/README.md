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

Open http://127.0.0.1:1420. Paste `http://127.0.0.1:8787` and the token
printed by `snorlax-runtime`.

## Native window

Requires a Rust toolchain and Tauri system deps.

```bash
npm install
npm run tauri dev
```

v0 is chat-only: roster, create teammate, streaming transcript. Computer
pane, widgets, and skills are later (see [../docs/tickets.md](../docs/tickets.md)).
