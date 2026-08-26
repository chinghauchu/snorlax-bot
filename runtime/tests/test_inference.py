# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings
from snorlax_runtime.inference import (
    MockBackend,
    OmlxBackend,
    VllmBackend,
    build_backend,
    inference_auth_headers,
    is_loopback_url,
)
from tests.conftest import TOKEN


def test_fixture_client_stays_on_mock(client) -> None:
    assert isinstance(client.app.state.backend, MockBackend)


def test_runtime_lan_token_is_not_sent_to_omlx(tmp_path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        token=TOKEN,
        bind="127.0.0.1",
        inference_backend="omlx",
        omlx_base_url="http://127.0.0.1:8000/v1",
        model="mlx-community/local",
    )
    app = create_app(settings)
    with TestClient(app) as test_client:
        backend = test_client.app.state.backend
        assert isinstance(backend, OmlxBackend)
        assert backend.api_key is None
        assert backend.request_headers() == {}


def test_default_settings_stay_on_mock() -> None:
    settings = Settings()
    assert settings.resolved_backend() == "mock"
    assert settings.inference_base_url() is None
    assert settings.vllm_base_url == "http://127.0.0.1:8000/v1"
    assert settings.omlx_base_url == "http://127.0.0.1:8000/v1"
    assert settings.inference_api_key is None
    assert settings.inference_send_auth is None


@pytest.mark.parametrize(
    ("raw", "want"),
    [
        ("mock", "mock"),
        ("MOCK", "mock"),
        ("vllm", "vllm"),
        ("omlx", "omlx"),
        ("openai", "omlx"),
        ("openai-compat", "omlx"),
        ("openai_compat", "omlx"),
    ],
)
def test_backend_selection(raw: str, want: str) -> None:
    assert Settings(inference_backend=raw).resolved_backend() == want


def test_unknown_backend_rejected() -> None:
    with pytest.raises(ValueError, match="SNORLAX_INFERENCE_BACKEND"):
        Settings(inference_backend="spark").resolved_backend()


def test_build_backend_selects_distinct_classes() -> None:
    mock = build_backend("mock", vllm_base_url="http://vllm.test/v1", model="m")
    vllm = build_backend("vllm", vllm_base_url="http://vllm.test/v1", model="m")
    omlx = build_backend(
        "omlx",
        vllm_base_url="http://vllm.test/v1",
        omlx_base_url="http://127.0.0.1:8000/v1",
        model="local-model",
    )
    aliased = build_backend(
        "openai-compat",
        vllm_base_url="http://vllm.test/v1",
        omlx_base_url="http://127.0.0.1:8000/v1",
        model="local-model",
    )
    assert isinstance(mock, MockBackend)
    assert isinstance(vllm, VllmBackend)
    assert not isinstance(vllm, OmlxBackend)
    assert isinstance(omlx, OmlxBackend)
    assert not isinstance(omlx, VllmBackend)
    assert isinstance(aliased, OmlxBackend)
    assert omlx.base_url == "http://127.0.0.1:8000/v1"
    assert omlx.model == "local-model"
    assert vllm.base_url == "http://vllm.test/v1"


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1:8000/v1",
        "http://localhost:8000/v1",
        "http://127.0.0.2:8000/v1",
        "http://[::1]:8000/v1",
    ],
)
def test_loopback_urls(url: str) -> None:
    assert is_loopback_url(url)


def test_non_loopback_url() -> None:
    assert not is_loopback_url("http://spark.local:8000/v1")
    assert not is_loopback_url("http://10.0.0.4:8000/v1")


def test_no_auth_header_to_localhost_by_default() -> None:
    headers = inference_auth_headers(
        base_url="http://127.0.0.1:8000/v1",
        api_key="secret-from-omlx-admin",
    )
    assert headers == {}
    headers = inference_auth_headers(
        base_url="http://localhost:8000/v1",
        api_key="secret-from-omlx-admin",
        send_auth=None,
    )
    assert headers == {}


def test_auth_header_sent_to_remote_when_key_set() -> None:
    headers = inference_auth_headers(
        base_url="http://spark.local:8000/v1",
        api_key="remote-key",
    )
    assert headers == {"Authorization": "Bearer remote-key"}


def test_force_auth_on_localhost() -> None:
    headers = inference_auth_headers(
        base_url="http://127.0.0.1:8000/v1",
        api_key="forced",
        send_auth=True,
    )
    assert headers == {"Authorization": "Bearer forced"}


def test_omlx_backend_skips_authorization_on_loopback() -> None:
    backend = OmlxBackend(
        "http://127.0.0.1:8000/v1",
        "local-model",
        api_key="should-not-be-sent",
    )
    assert backend.request_headers() == {}


def test_vllm_backend_skips_authorization_on_loopback() -> None:
    backend = VllmBackend(
        "http://127.0.0.1:8000/v1",
        "spark-model",
        api_key="should-not-be-sent",
    )
    assert backend.request_headers() == {}


def test_env_selects_omlx(monkeypatch) -> None:
    monkeypatch.setenv("SNORLAX_INFERENCE_BACKEND", "omlx")
    monkeypatch.setenv("SNORLAX_OMLX_BASE_URL", "http://127.0.0.1:8000/v1")
    monkeypatch.setenv("SNORLAX_MODEL", "mlx-community/local")
    settings = Settings()
    assert settings.resolved_backend() == "omlx"
    assert settings.inference_base_url() == "http://127.0.0.1:8000/v1"
    assert settings.model == "mlx-community/local"


def test_empty_key_never_sends_authorization() -> None:
    assert (
        inference_auth_headers(
            base_url="http://spark.local:8000/v1", api_key=None
        )
        == {}
    )
    assert (
        inference_auth_headers(
            base_url="http://spark.local:8000/v1", api_key="  "
        )
        == {}
    )


class _CaptureTransport(httpx.MockTransport):
    def __init__(self, handler) -> None:
        self.requests: list[httpx.Request] = []

        def wrapped(request: httpx.Request) -> httpx.Response:
            self.requests.append(request)
            return handler(request)

        super().__init__(wrapped)


def _stream_body(*contents: str) -> bytes:
    parts = [
        f"data: {json.dumps({'choices': [{'delta': {'content': c}}]})}\n\n".encode()
        for c in contents
    ]
    parts.append(b"data: [DONE]\n\n")
    return b"".join(parts)


@pytest.mark.asyncio
async def test_omlx_streams_without_authorization() -> None:
    transport = _CaptureTransport(
        lambda _req: httpx.Response(
            200,
            content=_stream_body("Hello", " from", " oMLX"),
            headers={"content-type": "text/event-stream"},
        )
    )
    backend = OmlxBackend(
        "http://127.0.0.1:8000/v1",
        "mlx-community/local",
        api_key="omlx-admin-key",
        transport=transport,
    )
    text = "".join(
        [token async for token in backend.stream([{"role": "user", "content": "hi"}])]
    )
    assert text == "Hello from oMLX"
    assert transport.requests
    request = transport.requests[0]
    assert str(request.url) == "http://127.0.0.1:8000/v1/chat/completions"
    assert "authorization" not in {k.lower() for k in request.headers}
    body = json.loads(request.content)
    assert body["model"] == "mlx-community/local"
    assert body["stream"] is True
    assert body["messages"] == [{"role": "user", "content": "hi"}]
    assert "tools" not in body


@pytest.mark.asyncio
async def test_omlx_passes_tools_on_generate() -> None:
    transport = _CaptureTransport(
        lambda _req: httpx.Response(
            200,
            content=_stream_body("ok"),
            headers={"content-type": "text/event-stream"},
        )
    )
    backend = OmlxBackend(
        "http://127.0.0.1:8000/v1",
        "mlx-community/local",
        transport=transport,
    )
    tools = [{"type": "function", "function": {"name": "list_dir", "parameters": {}}}]
    parts = [
        p
        async for p in backend.generate(
            [{"role": "user", "content": "hi"}], tools=tools
        )
    ]
    assert "".join(p.text or "" for p in parts) == "ok"
    body = json.loads(transport.requests[0].content)
    assert body["tools"] == tools


@pytest.mark.asyncio
async def test_vllm_still_posts_openai_compat() -> None:
    transport = _CaptureTransport(
        lambda _req: httpx.Response(
            200,
            content=_stream_body("Spark"),
            headers={"content-type": "text/event-stream"},
        )
    )
    backend = VllmBackend(
        "http://127.0.0.1:8000/v1",
        "meta-llama/Llama-3.3-70B-Instruct-FP8",
        transport=transport,
    )
    text = "".join(
        [token async for token in backend.stream([{"role": "user", "content": "hi"}])]
    )
    assert text == "Spark"
    assert isinstance(backend, VllmBackend)
    assert "authorization" not in {k.lower() for k in transport.requests[0].headers}
