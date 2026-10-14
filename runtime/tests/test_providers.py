# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
from pathlib import Path

import httpx
import pytest

from snorlax_runtime.config import Settings
from snorlax_runtime.inference import MockBackend, OmlxBackend, VllmBackend
from snorlax_runtime.providers import (
    GROK_BASE,
    OPENAI_BASE,
    PROVIDER_LABELS,
    AnthropicBackend,
    GeminiBackend,
    ModelDirectory,
    ProviderKeyError,
    build_provider,
    delete_key,
    get_key,
    key_statuses,
    mask_secret,
    read_saved_default,
    secrets_path,
    set_key,
    write_saved_default,
)
from tests.conftest import AUTH
from tests.test_routing import CHANNEL, _create, _msgs, _send, _thread


LOCAL_MODEL = "meta-llama/Llama-3.3-70B-Instruct-FP8"
SECRET = "sk-test-secret-value-99zz"


def _openai_stream(text: str, *, tool: dict | None = None) -> bytes:
    chunks = []
    if text:
        chunks.append(
            {
                "choices": [
                    {"delta": {"content": text}, "index": 0}
                ]
            }
        )
    if tool is not None:
        chunks.append(
            {
                "choices": [
                    {
                        "delta": {
                            "tool_calls": [
                                {
                                    "index": 0,
                                    "id": "call_1",
                                    "function": {
                                        "name": tool["name"],
                                        "arguments": tool["arguments"],
                                    },
                                }
                            ]
                        },
                        "index": 0,
                    }
                ]
            }
        )
    lines = [f"data: {json.dumps(chunk)}\n\n" for chunk in chunks]
    lines.append("data: [DONE]\n\n")
    return "".join(lines).encode()


def _anthropic_stream() -> bytes:
    events = [
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "text_delta", "text": "Hello "},
        },
        {
            "type": "content_block_delta",
            "index": 0,
            "delta": {"type": "text_delta", "text": "there"},
        },
        {
            "type": "content_block_start",
            "index": 1,
            "content_block": {"type": "tool_use", "id": "toolu_1", "name": "shell"},
        },
        {
            "type": "content_block_delta",
            "index": 1,
            "delta": {"type": "input_json_delta", "partial_json": '{"command":'},
        },
        {
            "type": "content_block_delta",
            "index": 1,
            "delta": {"type": "input_json_delta", "partial_json": '"pwd"}'},
        },
    ]
    return "".join(f"data: {json.dumps(event)}\n\n" for event in events).encode()


def _gemini_stream() -> bytes:
    event = {
        "candidates": [
            {
                "content": {
                    "parts": [
                        {"text": "Hello there"},
                        {
                            "functionCall": {
                                "name": "shell",
                                "args": {"command": "pwd"},
                            }
                        },
                    ]
                }
            }
        ]
    }
    return f"data: {json.dumps(event)}\n\n".encode()


def _transport(body: bytes, status: int = 200, capture: list | None = None):
    def handler(request: httpx.Request) -> httpx.Response:
        if capture is not None:
            capture.append(request)
        return httpx.Response(status, content=body)
    return httpx.MockTransport(handler)


async def _collect(backend) -> tuple[str, list]:
    text: list[str] = []
    calls = []
    async for part in backend.generate(
        [{"role": "user", "content": "hi"}],
        tools=[
            {
                "type": "function",
                "function": {
                    "name": "shell",
                    "description": "run",
                    "parameters": {"type": "object", "properties": {}},
                },
            }
        ],
    ):
        if part.text:
            text.append(part.text)
        calls.extend(part.tool_calls)
    return "".join(text), calls


@pytest.mark.asyncio
async def test_openai_adapter_streams_text_and_tool(tmp_path) -> None:
    seen: list[httpx.Request] = []
    settings = Settings(data_dir=tmp_path, inference_backend="mock")
    set_key(tmp_path, "openai", SECRET)
    backend = build_provider(
        "openai",
        "gpt-4o",
        settings=settings,
        transport=_transport(
            _openai_stream("Hello there", tool={"name": "shell", "arguments": '{"command":"pwd"}'}),
            capture=seen,
        ),
    )
    text, calls = await _collect(backend)
    assert text == "Hello there"
    assert calls[0].name == "shell"
    assert "pwd" in calls[0].arguments
    assert seen[0].url.host == "api.openai.com"
    assert json.loads(seen[0].content)["model"] == "gpt-4o"
    assert seen[0].headers["authorization"] == f"Bearer {SECRET}"
    assert str(OPENAI_BASE).startswith("https://api.openai.com")


@pytest.mark.asyncio
async def test_grok_adapter_uses_xai_openai_compat(tmp_path) -> None:
    seen: list[httpx.Request] = []
    settings = Settings(data_dir=tmp_path)
    set_key(tmp_path, "grok", SECRET)
    backend = build_provider(
        "grok",
        "grok-3",
        settings=settings,
        transport=_transport(_openai_stream("Grok says hi"), capture=seen),
    )
    text, calls = await _collect(backend)
    assert text == "Grok says hi"
    assert calls == []
    assert seen[0].url.host == "api.x.ai"
    assert json.loads(seen[0].content)["model"] == "grok-3"
    assert str(GROK_BASE).startswith("https://api.x.ai")


@pytest.mark.asyncio
async def test_anthropic_adapter_streams_text_and_tool(tmp_path) -> None:
    seen: list[httpx.Request] = []
    settings = Settings(data_dir=tmp_path)
    set_key(tmp_path, "anthropic", SECRET)
    backend = build_provider(
        "anthropic",
        "claude-sonnet-4",
        settings=settings,
        transport=_transport(_anthropic_stream(), capture=seen),
    )
    assert isinstance(backend, AnthropicBackend)
    text, calls = await _collect(backend)
    assert text == "Hello there"
    assert calls[0].name == "shell"
    assert json.loads(calls[0].arguments) == {"command": "pwd"}
    body = json.loads(seen[0].content)
    assert body["model"] == "claude-sonnet-4"
    assert seen[0].headers["x-api-key"] == SECRET
    assert seen[0].url.host == "api.anthropic.com"
    assert "tools" in body


@pytest.mark.asyncio
async def test_gemini_adapter_streams_text_and_tool(tmp_path) -> None:
    seen: list[httpx.Request] = []
    settings = Settings(data_dir=tmp_path)
    set_key(tmp_path, "gemini", SECRET)
    backend = build_provider(
        "gemini",
        "gemini-2.0-flash",
        settings=settings,
        transport=_transport(_gemini_stream(), capture=seen),
    )
    assert isinstance(backend, GeminiBackend)
    text, calls = await _collect(backend)
    assert text == "Hello there"
    assert calls[0].name == "shell"
    assert json.loads(calls[0].arguments) == {"command": "pwd"}
    assert "generativelanguage.googleapis.com" in str(seen[0].url)
    assert "gemini-2.0-flash" in str(seen[0].url)
    assert seen[0].headers["x-goog-api-key"] == SECRET


@pytest.mark.asyncio
async def test_local_adapters_keep_loopback_urls(tmp_path) -> None:
    seen: list[httpx.Request] = []
    settings = Settings(
        data_dir=tmp_path,
        omlx_base_url="http://127.0.0.1:8000/v1",
        vllm_base_url="http://127.0.0.1:9000/v1",
    )
    omlx = build_provider(
        "omlx",
        "local-mlx",
        settings=settings,
        transport=_transport(_openai_stream("local"), capture=seen),
    )
    vllm = build_provider(
        "vllm",
        "spark-70b",
        settings=settings,
        transport=_transport(_openai_stream("spark"), capture=seen),
    )
    assert isinstance(omlx, OmlxBackend)
    assert isinstance(vllm, VllmBackend)
    await _collect(omlx)
    await _collect(vllm)
    assert seen[0].url.host == "127.0.0.1"
    assert seen[0].url.port == 8000
    assert json.loads(seen[0].content)["model"] == "local-mlx"
    assert "authorization" not in {k.lower() for k in seen[0].headers}
    assert seen[1].url.port == 9000
    assert json.loads(seen[1].content)["model"] == "spark-70b"


@pytest.mark.asyncio
async def test_missing_key_does_not_call_http(tmp_path) -> None:
    seen: list[httpx.Request] = []
    settings = Settings(data_dir=tmp_path)
    backend = build_provider(
        "openai",
        "gpt-4o",
        settings=settings,
        transport=_transport(_openai_stream("nope"), capture=seen),
    )
    with pytest.raises(ProviderKeyError) as caught:
        await _collect(backend)
    assert caught.value.reason == "missing_key"
    assert "Settings" in caught.value.message
    assert seen == []
    assert SECRET not in caught.value.message


@pytest.mark.asyncio
async def test_rejected_key_is_redacted(tmp_path, caplog) -> None:
    settings = Settings(data_dir=tmp_path)
    set_key(tmp_path, "openai", SECRET)
    body = json.dumps({"error": f"invalid_api_key {SECRET}"}).encode()
    backend = build_provider(
        "openai",
        "gpt-4o",
        settings=settings,
        transport=_transport(body, status=401),
    )
    with caplog.at_level("DEBUG"):
        with pytest.raises(ProviderKeyError) as caught:
            await _collect(backend)
    assert caught.value.reason == "invalid_key"
    assert "Settings" in caught.value.message
    assert SECRET not in caught.value.message
    assert SECRET not in caplog.text


def test_secrets_file_is_0600_and_masked(tmp_path) -> None:
    masked = set_key(tmp_path, "anthropic", SECRET)
    path = secrets_path(tmp_path)
    assert path.is_file()
    assert path.stat().st_mode & 0o777 == 0o600
    assert path.parent.stat().st_mode & 0o777 == 0o700
    assert get_key(tmp_path, "anthropic") == SECRET
    assert masked == mask_secret(SECRET)
    assert SECRET not in masked
    assert SECRET not in json.dumps(key_statuses(tmp_path))
    delete_key(tmp_path, "anthropic")
    assert get_key(tmp_path, "anthropic") is None


def test_unset_default_stays_on_the_local_model(tmp_path) -> None:
    settings = Settings(data_dir=tmp_path, inference_backend="mock", model=LOCAL_MODEL)
    directory = ModelDirectory(settings, MockBackend())
    assert read_saved_default(tmp_path) is None
    assert directory.display_default() == ("omlx", LOCAL_MODEL)
    agent = {"id": "snorlax-bot", "model": None}
    assert isinstance(directory.backend_for(agent), MockBackend)
    assert directory.label_for(agent) == LOCAL_MODEL
    write_saved_default(tmp_path, "openai", "gpt-4o")
    assert directory.display_default() == ("openai", "gpt-4o")
    assert directory.selection_for(agent) == ("openai", "gpt-4o")


def test_settings_api_masks_keys_and_keeps_local_default(client) -> None:
    current = client.get("/v1/settings/model", headers=AUTH)
    assert current.status_code == 200
    assert current.json() == {"provider": "omlx", "model": LOCAL_MODEL}
    saved = client.patch(
        "/v1/settings/model",
        headers=AUTH,
        json={"provider": "grok", "model": "grok-3"},
    )
    assert saved.status_code == 200
    assert saved.json()["model"] == "grok-3"
    put = client.put(
        "/v1/settings/keys/openai",
        headers=AUTH,
        json={"apiKey": SECRET},
    )
    assert put.status_code == 200
    body = put.json()
    assert body["configured"] is True
    assert body["masked"]
    assert SECRET not in put.text
    listed = client.get("/v1/settings/keys", headers=AUTH)
    assert SECRET not in listed.text
    assert {row["provider"] for row in listed.json()} == {
        "openai",
        "anthropic",
        "gemini",
        "grok",
    }
    gone = client.delete("/v1/settings/keys/openai", headers=AUTH)
    assert gone.status_code == 204
    again = client.get("/v1/settings/keys", headers=AUTH).json()
    openai = next(row for row in again if row["provider"] == "openai")
    assert openai["configured"] is False
    assert openai["masked"] is None


def test_agent_model_override_and_channel_rejected(client) -> None:
    ada = _create(client, "Ada")
    patched = client.patch(
        f"/v1/agents/{ada['id']}",
        headers=AUTH,
        json={"model": {"provider": "anthropic", "id": "claude-sonnet-4"}},
    )
    assert patched.status_code == 200
    assert patched.json()["model"] == {
        "provider": "anthropic",
        "id": "claude-sonnet-4",
    }
    cleared = client.patch(
        f"/v1/agents/{ada['id']}",
        headers=AUTH,
        json={"model": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["model"] is None
    channel = client.patch(
        f"/v1/agents/{CHANNEL}",
        headers=AUTH,
        json={"model": {"provider": "openai", "id": "gpt-4o"}},
    )
    assert channel.status_code == 422


def test_missing_key_is_an_inline_reply(client) -> None:
    ada = _create(client, "Ada")
    patched = client.patch(
        f"/v1/agents/{ada['id']}",
        headers=AUTH,
        json={"model": {"provider": "openai", "id": "gpt-4o"}},
    )
    assert patched.status_code == 200
    status, body = _send(client, ada["id"], "hello from the desk")
    assert status == 200
    assert "event: error" not in body
    messages = _msgs(client, ada["id"])
    reply = next(row for row in messages if row["senderId"] == ada["id"])
    assert reply["modelError"] == "missing_key"
    assert "Settings" in reply["content"]
    assert reply["model"] == "gpt-4o"
    assert PROVIDER_LABELS["openai"] in reply["content"]


def test_handoff_runs_peer_on_their_model(client) -> None:
    seen: list[httpx.Request] = []
    client.app.state.models.transport = _transport(
        _openai_stream("bob-cloud-reply"),
        capture=seen,
    )
    alice = _create(client, "Alice")
    bob = _create(client, "Bob")
    client.put(
        "/v1/settings/keys/openai",
        headers=AUTH,
        json={"apiKey": SECRET},
    )
    patched = client.patch(
        f"/v1/agents/{bob['id']}",
        headers=AUTH,
        json={"model": {"provider": "openai", "id": "gpt-bob"}},
    )
    assert patched.status_code == 200
    status, _body = _send(client, alice["id"], "Can you look at this @Bob?")
    assert status == 200
    user = [row for row in _msgs(client, alice["id"]) if row["senderId"] == "user"][-1]
    thread = _thread(client, user["handoff"]["threadId"])
    bob_reply = next(row for row in thread if row["senderId"] == bob["id"])
    assert bob_reply["content"] == "bob-cloud-reply"
    assert bob_reply["model"] == "gpt-bob"
    assert bob_reply["modelError"] is None
    assert len(seen) == 1
    assert seen[0].url.host == "api.openai.com"
    assert json.loads(seen[0].content)["model"] == "gpt-bob"
    assert SECRET not in bob_reply["content"]
    alice_reply = [row for row in _msgs(client, alice["id"]) if row["senderId"] == alice["id"]][-1]
    assert "bob-cloud-reply" in alice_reply["content"]
    assert isinstance(client.app.state.backend, MockBackend)


def test_invalid_key_is_an_inline_reply(client) -> None:
    client.app.state.models.transport = _transport(
        json.dumps({"error": f"invalid {SECRET}"}).encode(),
        status=401,
    )
    ada = _create(client, "Ada")
    client.put(
        "/v1/settings/keys/gemini",
        headers=AUTH,
        json={"apiKey": SECRET},
    )
    client.patch(
        f"/v1/agents/{ada['id']}",
        headers=AUTH,
        json={"model": {"provider": "gemini", "id": "gemini-2.0-flash"}},
    )
    status, body = _send(client, ada["id"], "hi")
    assert status == 200
    assert "event: error" not in body
    reply = next(row for row in _msgs(client, ada["id"]) if row["senderId"] == ada["id"])
    assert reply["modelError"] == "invalid_key"
    assert "Settings" in reply["content"]
    assert SECRET not in body
    assert SECRET not in reply["content"]


def test_default_turn_still_uses_mock_and_labels_the_local_model(client) -> None:
    status, body = _send(client, "snorlax-bot", "hello local")
    assert status == 200
    reply = next(row for row in _msgs(client, "snorlax-bot") if row["senderId"] == "snorlax-bot")
    assert "mock backend" in reply["content"]
    assert reply["model"] == LOCAL_MODEL
    assert reply["modelError"] is None
    assert "event: message.delta" in body
