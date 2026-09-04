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

## Local voice dictation (whisper.cpp)

Desktop dictation POSTs audio to the runtime (`POST /v1/transcribe`).
The runtime shells to **whisper.cpp** — the same backend on Mac Metal
and NVIDIA CUDA. Clients never call a cloud STT.

```bash
# https://github.com/ggml-org/whisper.cpp
cmake -B build -DGGML_METAL=ON          # Mac
# cmake -B build -DGGML_CUDA=ON         # NVIDIA / Spark
cmake --build build -j --config Release
# binary: build/bin/whisper-cli
# model:  ./models/download-ggml-model.sh base.en

export SNORLAX_WHISPER_BIN=/path/to/whisper-cli
export SNORLAX_WHISPER_MODEL=/path/to/ggml-base.en.bin
# or drop both under ~/.snorlax-bot/whisper/
```

## Local TTS (piper)

Speak on LEFT messages POSTs text to the runtime (`POST /v1/speak`).
The runtime shells to **piper** — a local ONNX voice. Clients never
call a cloud TTS. Never autoplay; tap Speak on a completed agent
message.

```bash
# https://github.com/rhasspy/piper
# binary: piper
# model:  a *.onnx voice (plus its *.onnx.json next to it)

export SNORLAX_TTS_BIN=/path/to/piper
export SNORLAX_TTS_MODEL=/path/to/en_US-lessac-medium.onnx
# or drop piper + *.onnx under ~/.snorlax-bot/tts/
```

Example voices (Apache-2.0 / MIT-friendly community models):
<https://github.com/rhasspy/piper/blob/master/VOICES.md>

```bash
mkdir -p ~/.snorlax-bot/tts
# copy `piper` into that folder (or keep SNORLAX_TTS_BIN)
# copy en_US-lessac-medium.onnx and en_US-lessac-medium.onnx.json
```

## Spark (later)

When the box is a DGX Spark, use `SNORLAX_INFERENCE_BACKEND=vllm` and
`SNORLAX_VLLM_BASE_URL`. Same client URL (`:8787`). Same “no Bearer to
localhost inference” default. Whisper.cpp on Spark uses `-DGGML_CUDA=ON`.
Piper is a local CPU/ONNX binary on Mac and Spark.
