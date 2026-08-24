# Desktop client

TypeScript + Tauri shell. Talks only to the FastAPI runtime (`/v1`) with
`SNORLAX_URL` + `SNORLAX_TOKEN`. Never talks to vLLM and never reads
`~/.snorlax-bot/` on the Spark.

Contract: [../../protocol/openapi.yaml](../../protocol/openapi.yaml).

## Web (no Rust)

Runtime must already be up.

```bash
npm install
SNORLAX_URL=http://127.0.0.1:8787 SNORLAX_TOKEN='<token>' npm run dev
```

Open http://127.0.0.1:1420.

## Native window

```bash
npm install
npm run tauri dev
```
