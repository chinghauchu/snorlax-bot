# Snorlax-Bot runtime

Thin FastAPI process that owns agents, transcripts, LAN auth, and the
built-in tool loop. oMLX (Mac-local OpenAI-compat), vLLM (Spark), or the
mock backend sits behind it. Clients never call the model server, never
call tools, and never read `~/.snorlax-bot/` — they use `SNORLAX_URL` +
`SNORLAX_TOKEN`.

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
| `SNORLAX_DATA_DIR` | `~/.snorlax-bot` | `snorlax.db` + `token` + images + `workspaces/` |
| `SNORLAX_TOKEN` | generated file | Override bearer token |
| `SNORLAX_BIND` | auto | Force host (`127.0.0.1` / `0.0.0.0`) |
| `SNORLAX_PORT` | `8787` | Listen port |
| `SNORLAX_INFERENCE_BACKEND` | `mock` | `mock` (CI), `omlx` (Mac-local), or `vllm` (Spark) |
| `SNORLAX_OMLX_BASE_URL` | `http://127.0.0.1:8000/v1` | oMLX OpenAI-compat base |
| `SNORLAX_VLLM_BASE_URL` | `http://127.0.0.1:8000/v1` | Spark vLLM OpenAI-compat base |
| `SNORLAX_MODEL` | `meta-llama/Llama-3.3-70B-Instruct-FP8` | Model id (`GET /v1/models` on oMLX) |
| `SNORLAX_INFERENCE_API_KEY` | unset | Optional key for **non-loopback** inference |
| `SNORLAX_INFERENCE_SEND_AUTH` | auto | `true` forces a Bearer even on localhost |
| `SNORLAX_TOOL_MAX_ROUNDS` | `8` | Cap on runtime tool-loop rounds per generation |
| `SNORLAX_SEARCH_PROVIDER` | `duckduckgo` | `web_search` provider name (not hardcoded in the loop) |
| `SNORLAX_SEARCH_URL` | provider default | Optional search URL template; `{query}` is URL-encoded |

Loopback inference (`127.0.0.1` / `localhost`) gets **no** `Authorization`
header by default. Do not send the LAN `SNORLAX_TOKEN` to oMLX or vLLM.
Mac recipe: [docs/mac-local.md](../docs/mac-local.md).

Workspaces live under `$SNORLAX_DATA_DIR/workspaces/` (agents/{id} for 1:1,
channels/{id} for channel / handoff). That channel dir is the project
sandbox — not a picker for a folder on the host Mac. Tools auto-run.
Shell has no extra network; HTTP is `web_search` / `web_fetch` only.

## Tests

```bash
pytest
```
