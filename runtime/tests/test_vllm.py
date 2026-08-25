# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
import subprocess
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

import httpx
import pytest
from fastapi.testclient import TestClient

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings
from snorlax_runtime.inference import (
    InferenceError,
    VllmBackend,
    build_backend,
    text_only_messages,
)
from tests.conftest import AUTH, TOKEN, parse_sse

MODEL = "nvidia/Llama-3.3-70B-Instruct-FP8"
VLLM_BASE = "http://vllm.test/v1"


def _sse_chunk(content: str | None, *, error: object | None = None) -> bytes:
    if error is not None:
        payload = {"error": error}
    else:
        payload = {"choices": [{"delta": {"content": content}}]}
    return f"data: {json.dumps(payload)}\n\n".encode("utf-8")


def _stream_body(*contents: str) -> bytes:
    parts = [_sse_chunk(c) for c in contents]
    parts.append(b"data: [DONE]\n\n")
    return b"".join(parts)


class _CaptureTransport(httpx.MockTransport):
    def __init__(self, handler) -> None:
        self.requests: list[httpx.Request] = []

        def wrapped(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            return handler(request)

        super().__init__(wrapped)


class _RaiseTransport(httpx.AsyncBaseTransport):
    def __init__(self, exc: Exception) -> None:
        self.exc = exc

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        raise self.exc


def _backend(transport: httpx.AsyncBaseTransport | httpx.BaseTransport) -> VllmBackend:
    return VllmBackend(VLLM_BASE, MODEL, transport=transport)


async def _collect(backend: VllmBackend, messages: list[dict] | None = None) -> str:
    msgs = messages or [{"role": "user", "content": "Hello"}]
    return "".join([token async for token in backend.stream(msgs)])


def test_default_settings_stay_on_mock() -> None:
    settings = Settings()
    assert settings.resolved_backend() == "mock"
    assert settings.model == MODEL
    assert settings.vllm_base_url == "http://127.0.0.1:8000/v1"


def test_spark_up_help_does_not_download() -> None:
    script = Path(__file__).resolve().parents[2] / "scripts" / "spark-up.sh"
    result = subprocess.run([str(script)], check=False, capture_output=True, text=True)
    assert result.returncode == 0
    assert MODEL in result.stdout
    assert "mock" in result.stdout
    assert "docs/vllm-spark.md" in result.stdout


def test_build_backend_selects_vllm() -> None:
    backend = build_backend("vllm", vllm_base_url=VLLM_BASE, model=MODEL)
    assert isinstance(backend, VllmBackend)
    assert backend.model == MODEL


def test_text_only_messages_drop_non_text() -> None:
    cleaned = text_only_messages(
        [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": "look"},
                    {"type": "image_url", "image_url": {"url": "data:image/png;base64,xx"}},
                ],
                "name": "extra",
                "tool_calls": [{"id": "x"}],
            }
        ]
    )
    assert cleaned == [{"role": "user", "content": "look"}]


@pytest.mark.asyncio
async def test_vllm_streams_openai_compat_deltas() -> None:
    transport = _CaptureTransport(
        lambda _req: httpx.Response(
            200,
            content=_stream_body("Hello", " from", " Spark"),
            headers={"content-type": "text/event-stream"},
        )
    )
    text = await _collect(
        _backend(transport),
        [
            {
                "role": "user",
                "content": "hi",
                "images": [{"mime": "image/png", "data": "xx"}],
            }
        ],
    )
    assert text == "Hello from Spark"
    assert transport.requests
    request = transport.requests[0]
    assert str(request.url) == f"{VLLM_BASE}/chat/completions"
    body = json.loads(request.content)
    assert body["model"] == MODEL
    assert body["stream"] is True
    assert body["messages"] == [{"role": "user", "content": "hi"}]
    for message in body["messages"]:
        assert set(message) == {"role", "content"}
        assert isinstance(message["content"], str)


@pytest.mark.asyncio
async def test_vllm_skips_malformed_and_empty_deltas() -> None:
    body = (
        b"event: ignored\n"
        + b"data: not-json\n\n"
        + _sse_chunk("")
        + b"data: {\"choices\":[]}\n\n"
        + _sse_chunk("ok")
        + b"data: [DONE]\n\n"
    )
    transport = httpx.MockTransport(
        lambda _req: httpx.Response(
            200, content=body, headers={"content-type": "text/event-stream"}
        )
    )
    assert await _collect(_backend(transport)) == "ok"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("status", "body"),
    [
        (400, "bad request: unknown model"),
        (404, "not found"),
        (503, "engine overloaded"),
        (500, "internal"),
    ],
)
async def test_vllm_maps_http_errors(status: int, body: str) -> None:
    transport = httpx.MockTransport(lambda _req: httpx.Response(status, text=body))
    with pytest.raises(InferenceError) as exc:
        await _collect(_backend(transport))
    assert exc.value.code == "inference_unavailable"
    assert "inference_unavailable" in exc.value.message
    assert str(status) in exc.value.message
    assert body[:20] in exc.value.message


@pytest.mark.asyncio
async def test_vllm_maps_stream_error_object() -> None:
    transport = httpx.MockTransport(
        lambda _req: httpx.Response(
            200,
            content=_sse_chunk(None, error={"message": "context overflow"}),
            headers={"content-type": "text/event-stream"},
        )
    )
    with pytest.raises(InferenceError) as exc:
        await _collect(_backend(transport))
    assert "inference_unavailable" in exc.value.message
    assert "context overflow" in exc.value.message


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "exc",
    [
        httpx.ConnectError("Connection refused"),
        httpx.ConnectTimeout("connect timed out"),
        httpx.ReadTimeout("read timed out"),
        httpx.RemoteProtocolError("disconnected"),
    ],
)
async def test_vllm_maps_connection_and_timeouts(exc: Exception) -> None:
    backend = _backend(_RaiseTransport(exc))
    with pytest.raises(InferenceError) as raised:
        await _collect(backend)
    assert raised.value.code == "inference_unavailable"
    assert "inference_unavailable" in raised.value.message
    if isinstance(exc, httpx.ConnectError):
        assert "not reachable" in raised.value.message
        assert "Is vLLM running?" in raised.value.message
    elif isinstance(exc, httpx.TimeoutException):
        assert "timed out" in raised.value.message


@contextmanager
def _vllm_client(tmp_path, transport) -> Iterator[TestClient]:
    settings = Settings(
        data_dir=tmp_path,
        token=TOKEN,
        bind="127.0.0.1",
        inference_backend="vllm",
        vllm_base_url=VLLM_BASE,
        model=MODEL,
        port=8787,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        app.state.backend = VllmBackend(VLLM_BASE, MODEL, transport=transport)
        yield client


def test_vllm_sse_matches_locked_delta_contract(tmp_path) -> None:
    transport = httpx.MockTransport(
        lambda _req: httpx.Response(
            200,
            content=_stream_body("Alpha", " Beta"),
            headers={"content-type": "text/event-stream"},
        )
    )
    with _vllm_client(tmp_path, transport) as client:
        with client.stream(
            "POST",
            "/v1/agents/snorlax-bot/messages",
            headers=AUTH,
            json={"content": "Say hello."},
        ) as response:
            assert response.status_code == 200
            body = "".join(response.iter_text())

    events = parse_sse(body)
    names = [name for name, _ in events]
    assert "message.delta" in names
    assert names[-1] == "message.done"
    deltas = "".join(p["delta"] for n, p in events if n == "message.delta")
    assert deltas == "Alpha Beta"
    first = next(p for n, p in events if n == "message.delta")
    assert set(first) == {"id", "role", "delta"}
    assert first["role"] == "assistant"
    done = events[-1][1]
    assert done["content"] == deltas
    assert done["agentId"] == "snorlax-bot"
    assert "message" not in done


@pytest.mark.parametrize(
    "transport",
    [
        _RaiseTransport(httpx.ConnectError("Connection refused")),
        httpx.MockTransport(lambda _req: httpx.Response(503, text="engine down")),
        httpx.MockTransport(lambda _req: httpx.Response(400, text="bad request")),
    ],
)
def test_vllm_failures_are_sse_error_string(tmp_path, transport) -> None:
    with _vllm_client(tmp_path, transport) as client:
        with client.stream(
            "POST",
            "/v1/agents/snorlax-bot/messages",
            headers=AUTH,
            json={"content": "Are you up?"},
        ) as response:
            assert response.status_code == 200
            body = "".join(response.iter_text())

    events = parse_sse(body)
    assert events
    name, payload = events[-1]
    assert name == "error"
    assert set(payload) == {"error"}
    assert isinstance(payload["error"], str)
    assert "inference_unavailable" in payload["error"]
    assert "message.done" not in [n for n, _ in events]
