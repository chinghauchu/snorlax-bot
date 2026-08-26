# Snorlax-Bot `/v1` protocol

Canonical contract: [openapi.yaml](openapi.yaml).

Clients (`SNORLAX_URL` + `SNORLAX_TOKEN`) talk only to the FastAPI runtime.
They never call oMLX or vLLM, never call tools, and never read
`~/.snorlax-bot/` on the host. Additive `GET /v1/agents/{id}/workspace`
reads are served by the runtime from that sandbox. Channel workspaces are
sandboxes under that data dir, not a picker for a folder on the Mac.

A copy is also kept at `runtime/openapi.yaml` and `desktop/openapi.yaml`
so those trees are self-contained. Do not let the files diverge.

iOS `/v1` Codable types are generated from this file:

```bash
python3 ios/scripts/generate_v1_types.py
```
