# Snorlax-Bot runtime

Thin FastAPI process that owns agents, transcripts, and LAN auth. vLLM (or
the mock backend) sits behind it. Desktop and iOS never call the model
server.

## Run

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
snorlax-runtime
```

Equivalent: `python -m snorlax_runtime`.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `SNORLAX_DATA_DIR` | `~/.snorlax-bot` | SQLite + token + attachments |
| `SNORLAX_TOKEN` | generated | Override bearer token |
| `SNORLAX_BIND` | auto | Force host (`127.0.0.1` / `0.0.0.0`) |
| `SNORLAX_PORT` | `8787` | Listen port |
| `SNORLAX_INFERENCE_BACKEND` | `mock` | `mock` or `vllm` |
| `SNORLAX_VLLM_BASE_URL` | `http://127.0.0.1:8000/v1` | OpenAI-compat base |
| `SNORLAX_MODEL` | `meta-llama/Llama-3.3-70B-Instruct-FP8` | Default 70B-class FP8 id |

Bind policy: `127.0.0.1` until a token exists on disk, then `0.0.0.0`.

## Tests

```bash
pytest
```
