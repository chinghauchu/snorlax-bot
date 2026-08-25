# vLLM on NVIDIA DGX Spark (GB10)

This is the operator recipe for running **vLLM on localhost:8000**, then
**snorlax-runtime** with `SNORLAX_INFERENCE_BACKEND=vllm`. Clients still talk
only to FastAPI on port **8787**. They never call vLLM.

Laptop and CI stay on the mock backend. Do not run this recipe in CI and do
not download a 70B checkpoint unless you are on a Spark.

## Hardware this recipe assumes

| | DGX Spark |
| --- | --- |
| Superchip | GB10 Grace Blackwell (`sm_121`) |
| Memory | 128 GB LPDDR5x, coherent unified CPU+GPU pool |
| CUDA-visible | on the order of ~120 GiB of that pool |
| Workload | one resident 70B-class FP8 model, small-batch chat |

OS, vLLM weights, KV cache, and snorlax-runtime all draw from the same 128 GB.
`--gpu-memory-utilization` is therefore a fraction of the **unified** pool, not
a discrete VRAM card. Leave headroom.

## Recommended model

**`nvidia/Llama-3.3-70B-Instruct-FP8`**

That is the default `SNORLAX_MODEL`. It is a 70B-class FP8 Instruct checkpoint
that fits in 128 GB with KV headroom when the flags below are used.

| Tenant | Rough budget |
| --- | --- |
| OS + desktop session | ~10–16 GB |
| snorlax-runtime (FastAPI + SQLite) | ~1 GB |
| 70B FP8 weights | ~70 GB |
| CUDA / vLLM runtime | ~4–8 GB |
| KV cache (paged, `--max-num-seqs 4`) | remainder |

Swap the id if you prefer an equivalent 70B-class FP8 Instruct model, for
example `Qwen/Qwen2.5-72B-Instruct-FP8`. Keep `SNORLAX_MODEL` equal to the
`--served-model-name` (or the Hugging Face id) vLLM is serving.

Llama weights are gated. Export a Hugging Face token before the first pull:

```bash
export HF_TOKEN=hf_...
```

Pre-stage the weights once. Do not make the first `vllm serve` also be a
surprise 70B download on a cold box.

## Suggested vLLM flags (GB10)

| Flag | Value | Why |
| --- | --- | --- |
| `--host` / `--port` | `127.0.0.1` `8000` | Runtime proxies generation; LAN clients use `:8787` |
| `--dtype` | `auto` | FP8 checkpoint is detected from the model config |
| `--max-model-len` | `8192` | Caps KV so 70B FP8 plus OS/runtime still fit |
| `--gpu-memory-utilization` | `0.75` | Claims ~90 GiB of ~120 GiB CUDA-visible; leaves OS + runtime headroom |
| `--max-num-seqs` | `4` | Spark is small-batch interactive, not a public API |

Start from **0.75**, not vLLM’s default **0.90**. On unified memory a high
utilization pre-allocates a huge KV pool and can starve the OS. If the host
feels tight after load, drop to `0.70`. If you have measured headroom and want
longer context, try `--max-model-len 16384` and keep `--max-num-seqs` at 2–4.

Use a vLLM build or image validated for **GB10 `sm_121`** (CUDA 13 / `cu130`
track). Do not copy a Hopper or datacenter-Blackwell (`sm_100`) recipe blindly.

`--quantization` is unset on purpose: the recommended checkpoint is already
FP8. Set it only when you want vLLM to quantize a BF16 checkpoint at load
time (slower, more memory during conversion).

## 1. Start vLLM on localhost:8000

Native (preferred when `vllm` is on `PATH`):

```bash
./scripts/spark-up.sh vllm
```

Equivalent command:

```bash
vllm serve nvidia/Llama-3.3-70B-Instruct-FP8 \
  --host 127.0.0.1 \
  --port 8000 \
  --dtype auto \
  --max-model-len 8192 \
  --gpu-memory-utilization 0.75 \
  --max-num-seqs 4
```

Docker Compose (same flags, official OpenAI-compat image):

```bash
export HF_TOKEN=hf_...
docker compose -f compose.spark.yml up
```

Wait until the OpenAI-compat surface answers:

```bash
curl -sS http://127.0.0.1:8000/v1/models
```

First load of a 70B checkpoint can take many minutes. The first request after
boot may also JIT-compile kernels. That is vLLM, not the FastAPI runtime.

If vLLM is down, snorlax-runtime still accepts chat: it streams an SSE
`error` event whose data is `{ "error": "<string>" }` and includes
`inference_unavailable`. The `/v1` camelCase contract does not change.

## 2. Start snorlax-runtime in front of it

In another terminal, from a checkout that already has the runtime installed
(`cd runtime && python3 -m venv .venv && source .venv/bin/activate && pip install -e ".[dev]"`):

```bash
./scripts/spark-up.sh runtime
```

Equivalent environment:

```bash
export SNORLAX_INFERENCE_BACKEND=vllm
export SNORLAX_VLLM_BASE_URL=http://127.0.0.1:8000/v1
export SNORLAX_MODEL=nvidia/Llama-3.3-70B-Instruct-FP8
snorlax-runtime
```

On first start the process still:

1. Creates `~/.snorlax-bot`
2. Writes a bearer token to `~/.snorlax-bot/token` and prints it
3. Seeds agent `snorlax-bot`
4. Listens on `127.0.0.1:8787` until that token exists, then `0.0.0.0:8787`

Point desktop or curl at **8787**, not 8000:

```bash
export SNORLAX_TOKEN="$(tr -d '\n' < ~/.snorlax-bot/token)"
curl -N -H "Authorization: Bearer $SNORLAX_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"content":"Hello from the Spark"}' \
  http://127.0.0.1:8787/v1/agents/snorlax-bot/messages
```

Images may be attached and are persisted. They are **not** sent to vLLM.

## Timeouts

| Variable | Default | Meaning |
| --- | --- | --- |
| `SNORLAX_VLLM_CONNECT_TIMEOUT` | `10` | Seconds to connect to vLLM |
| `SNORLAX_VLLM_READ_TIMEOUT` | `120` | Seconds between streamed chunks (first token can be slow) |
| `SNORLAX_VLLM_WRITE_TIMEOUT` | `30` | Seconds to write the prompt |

If vLLM is not running, a chat request fails in about the connect timeout
with a clear `inference_unavailable` string on the SSE `error` event.

## Laptop / CI

Leave `SNORLAX_INFERENCE_BACKEND` unset (default `mock`). `pytest` in
`runtime/` never downloads a model and never needs a GPU.
