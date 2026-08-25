# Snorlax-Bot runtime

Thin FastAPI process that owns agents, transcripts, and LAN auth. oMLX
(Mac-local OpenAI-compat), vLLM (Spark), or the mock backend sits behind it.
Clients never call the model server and never read `~/.snorlax-bot/` — they
use `SNORLAX_URL` + `SNORLAX_TOKEN`.

Contract: [../protocol/openapi.yaml](../protocol/openapi.yaml) (copy:
[openapi.yaml](openapi.yaml)).

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
snorlax-runtime
```

Equivalent: `python -m snorlax_runtime`. Port **8787**.

On first start: `~/.snorlax-bot/token` and `~/.snorlax-bot/snorlax.db`.
Bind `127.0.0.1` until a token exists, then `0.0.0.0`. `SNORLAX_TOKEN`
overrides the file.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `SNORLAX_DATA_DIR` | `~/.snorlax-bot` | `snorlax.db` + `token` + images |
| `SNORLAX_TOKEN` | generated file | Override bearer token |
| `SNORLAX_BIND` | auto | Force host (`127.0.0.1` / `0.0.0.0`) |
| `SNORLAX_PORT` | `8787` | Listen port |
| `SNORLAX_INFERENCE_BACKEND` | `mock` | `mock` (CI), `omlx` (Mac-local), or `vllm` (Spark) |
| `SNORLAX_OMLX_BASE_URL` | `http://127.0.0.1:8000/v1` | oMLX OpenAI-compat base |
| `SNORLAX_VLLM_BASE_URL` | `http://127.0.0.1:8000/v1` | Spark vLLM OpenAI-compat base |
| `SNORLAX_MODEL` | `meta-llama/Llama-3.3-70B-Instruct-FP8` | Model id (`GET /v1/models` on oMLX) |
| `SNORLAX_INFERENCE_API_KEY` | unset | Optional key for **non-loopback** inference |
| `SNORLAX_INFERENCE_SEND_AUTH` | auto | `true` forces a Bearer even on localhost |

Loopback inference (`127.0.0.1` / `localhost`) gets **no** `Authorization`
header by default. Do not send the LAN `SNORLAX_TOKEN` to oMLX or vLLM.
Mac recipe: [docs/mac-local.md](../docs/mac-local.md).

## Tests

```bash
pytest
```
