#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
# Start vLLM (localhost:8000) and/or snorlax-runtime (backend=vllm) on a Spark.
# Does nothing in CI. Does not download a 70B checkpoint unless you run `vllm`.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODEL="${SNORLAX_MODEL:-nvidia/Llama-3.3-70B-Instruct-FP8}"
VLLM_HOST="${VLLM_HOST:-127.0.0.1}"
VLLM_PORT="${VLLM_PORT:-8000}"
VLLM_BASE_URL="${SNORLAX_VLLM_BASE_URL:-http://${VLLM_HOST}:${VLLM_PORT}/v1}"
GPU_UTIL="${VLLM_GPU_MEMORY_UTILIZATION:-0.75}"
MAX_LEN="${VLLM_MAX_MODEL_LEN:-8192}"
MAX_SEQS="${VLLM_MAX_NUM_SEQS:-4}"
DTYPE="${VLLM_DTYPE:-auto}"

usage() {
  cat <<EOF
Start the Spark inference stack. Clients still use FastAPI on :8787.

Usage:
  $0 vllm       Start vLLM on ${VLLM_HOST}:${VLLM_PORT}
  $0 runtime    Start snorlax-runtime with SNORLAX_INFERENCE_BACKEND=vllm
  $0 status     Probe vLLM :8000 and runtime :8787

Default model: ${MODEL}
Flags: --dtype ${DTYPE} --max-model-len ${MAX_LEN} --gpu-memory-utilization ${GPU_UTIL} --max-num-seqs ${MAX_SEQS}

See docs/vllm-spark.md. Laptop/CI should keep the mock backend.
EOF
}

cmd_vllm() {
  local -a args=(
    serve "$MODEL"
    --host "$VLLM_HOST"
    --port "$VLLM_PORT"
    --dtype "$DTYPE"
    --max-model-len "$MAX_LEN"
    --gpu-memory-utilization "$GPU_UTIL"
    --max-num-seqs "$MAX_SEQS"
  )
  echo "Starting vLLM on ${VLLM_HOST}:${VLLM_PORT} with ${MODEL}"
  echo "GB10 flags: dtype=${DTYPE} max-model-len=${MAX_LEN} gpu-memory-utilization=${GPU_UTIL} max-num-seqs=${MAX_SEQS}"
  if command -v vllm >/dev/null 2>&1; then
    # Intentionally not downloading here; vllm serve will use a local HF cache
    # or pull only when this operator command is run on a Spark.
    exec vllm "${args[@]}"
  fi
  if command -v docker >/dev/null 2>&1; then
    echo "vllm not on PATH; using docker compose -f compose.spark.yml"
    exec docker compose -f "${ROOT}/compose.spark.yml" up
  fi
  echo "Neither vllm nor docker is available. Install a GB10/sm_121 vLLM build, or Docker with the NVIDIA toolkit." >&2
  echo "See docs/vllm-spark.md." >&2
  exit 1
}

cmd_runtime() {
  export SNORLAX_INFERENCE_BACKEND=vllm
  export SNORLAX_VLLM_BASE_URL="$VLLM_BASE_URL"
  export SNORLAX_MODEL="$MODEL"
  echo "Starting snorlax-runtime"
  echo "  SNORLAX_INFERENCE_BACKEND=${SNORLAX_INFERENCE_BACKEND}"
  echo "  SNORLAX_VLLM_BASE_URL=${SNORLAX_VLLM_BASE_URL}"
  echo "  SNORLAX_MODEL=${SNORLAX_MODEL}"
  echo "vLLM must already be serving ${VLLM_BASE_URL}."
  if [[ -x "${ROOT}/runtime/.venv/bin/snorlax-runtime" ]]; then
    exec "${ROOT}/runtime/.venv/bin/snorlax-runtime"
  fi
  if command -v snorlax-runtime >/dev/null 2>&1; then
    exec snorlax-runtime
  fi
  echo "snorlax-runtime is not installed. From the repo:" >&2
  echo "  cd runtime && python3 -m venv .venv && source .venv/bin/activate && pip install -e '.[dev]'" >&2
  exit 1
}

cmd_status() {
  echo "vLLM ${VLLM_BASE_URL}/models"
  if curl -sS --connect-timeout 2 --max-time 5 "${VLLM_BASE_URL}/models" >/dev/null; then
    echo "  up"
  else
    echo "  down (runtime will stream SSE error { error: inference_unavailable: ... })"
  fi
  echo "runtime http://127.0.0.1:8787/v1/health"
  if curl -sS --connect-timeout 2 --max-time 5 http://127.0.0.1:8787/v1/health >/dev/null; then
    echo "  up"
  else
    echo "  down"
  fi
}

case "${1:-}" in
  vllm) cmd_vllm ;;
  runtime) cmd_runtime ;;
  status) cmd_status ;;
  -h|--help|help|"") usage ;;
  *)
    echo "Unknown command: $1" >&2
    usage >&2
    exit 2
    ;;
esac
