# Snorlax-Bot `/v1` protocol

Canonical contract: [openapi.yaml](openapi.yaml).

Clients (`SNORLAX_URL` + `SNORLAX_TOKEN`) talk only to the FastAPI runtime.
They never call vLLM and never read `~/.snorlax-bot/` on the Spark.

A copy is also kept at `runtime/openapi.yaml` so the runtime tree is
self-contained. Do not let the two files diverge.

iOS `/v1` Codable types are generated from this file:

```bash
python3 ios/scripts/generate_v1_types.py
```

