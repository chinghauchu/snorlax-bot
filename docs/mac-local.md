# Mac-local: snorlax-runtime + oMLX

Chinghau’s current desk is a Mac, not a DGX Spark. This is the first-class
path: **snorlax-runtime on :8787** in front of **oMLX** (OpenAI-compat on
`:8000/v1`). Spark vLLM stays a real backend for later; do not point clients
at the model server.

Laptop/CI default remains `mock`. Clients still talk only to `/v1` on the
runtime (camelCase, health unauthenticated, SSE, LAN bearer).

## Topology

```
desktop / iOS  --Bearer-->  snorlax-runtime :8787  --no auth-->  oMLX :8000/v1
```

## 1. Start oMLX on :8000

Run oMLX so it serves OpenAI-compat at `http://127.0.0.1:8000/v1`. In oMLX
admin, **turn off API-key auth** for local use. The runtime will not send
`Authorization` to localhost inference.

List the served model id:

```bash
curl -sS http://127.0.0.1:8000/v1/models
```

Copy `data[0].id` (or the id you actually want). That string is
`SNORLAX_MODEL`.

## 2. Start snorlax-runtime on :8787

```bash
cd runtime
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"

export SNORLAX_INFERENCE_BACKEND=omlx
export SNORLAX_OMLX_BASE_URL=http://127.0.0.1:8000/v1
export SNORLAX_MODEL='<id from GET /v1/models>'
# Leave SNORLAX_INFERENCE_API_KEY unset. Loopback gets no Bearer.
snorlax-runtime
```

Do **not** set `SNORLAX_INFERENCE_BACKEND=vllm` for oMLX. `vllm` is the Spark
path. `omlx` is the Mac-local OpenAI-compat backend (`openai` /
`openai-compat` are aliases).

On first start the process still writes `~/.snorlax-bot/token` and listens on
`127.0.0.1:8787`. Printout includes `backend: omlx` and
`inference: http://127.0.0.1:8000/v1`.

`SNORLAX_TOKEN` is LAN auth between desktop/iOS and the runtime. It is never
forwarded to oMLX.

## 3. Point the clients at the runtime

Desktop (http://127.0.0.1:1420) and iOS Settings:

- Runtime URL: `http://127.0.0.1:8787` or `http://localhost:8787`
- Token: the printed bearer / `~/.snorlax-bot/token`

Loopback URLs save and survive reload. The Settings placeholder may still
show `http://<spark-lan>:8787` for a phone on the LAN later.

Clients never call `:8000`.

Smoke the locked contract:

```bash
export SNORLAX_TOKEN="$(tr -d '\n' < ~/.snorlax-bot/token)"
curl -sS http://127.0.0.1:8787/v1/health
curl -N -H "Authorization: Bearer $SNORLAX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from the Mac"}' \
  http://127.0.0.1:8787/v1/agents/snorlax-bot/messages
```

## Spark (later)

When the box is a DGX Spark, use `SNORLAX_INFERENCE_BACKEND=vllm` and
`SNORLAX_VLLM_BASE_URL`. Same client URL (`:8787`). Same “no Bearer to
localhost inference” default.
