# Snorlax-Bot runtime

Thin FastAPI process that owns agents, transcripts, and LAN auth. vLLM (or
the mock backend) sits behind it. Clients never call the model server and
never read `~/.snorlax-bot/` — they use `SNORLAX_URL` + `SNORLAX_TOKEN`.

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
| `SNORLAX_INFERENCE_BACKEND` | `mock` | `mock` (laptop/CI) or `vllm` (Spark) |
| `SNORLAX_VLLM_BASE_URL` | `http://127.0.0.1:8000/v1` | OpenAI-compat base |
| `SNORLAX_MODEL` | `nvidia/Llama-3.3-70B-Instruct-FP8` | Default 70B-class FP8 id |
| `SNORLAX_VLLM_CONNECT_TIMEOUT` | `10` | Seconds to reach vLLM |
| `SNORLAX_VLLM_READ_TIMEOUT` | `120` | Seconds between streamed chunks |
| `SNORLAX_VLLM_WRITE_TIMEOUT` | `30` | Seconds to write the prompt |

Laptop and CI keep the default `mock` backend so `pytest` needs no GPU.
On a DGX Spark, start vLLM on `:8000` first, then set
`SNORLAX_INFERENCE_BACKEND=vllm`. Recipe, GB10 flags, and compose file:
[docs/vllm-spark.md](../docs/vllm-spark.md). Shortcut: `../scripts/spark-up.sh`.

## Tests

```bash
pytest
```

vLLM-client tests mock the OpenAI-compat HTTP stream. They do not download
a checkpoint.
