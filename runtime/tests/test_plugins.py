# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
import sys
from pathlib import Path

from fastapi.testclient import TestClient

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings
from tests.conftest import AUTH, TOKEN, parse_sse

SEED = "snorlax-bot"
FAKE_STDIO = Path(__file__).resolve().parent / "fake_mcp_stdio.py"


def _settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path,
        token=TOKEN,
        bind="127.0.0.1",
        inference_backend="mock",
        port=8787,
        scheduler=False,
    )


def _disabled_stdio() -> dict:
    return {
        "command": sys.executable,
        "args": [str(FAKE_STDIO)],
        "disabled": True,
        "name": "Example",
        "tools": [
            {
                "name": "echo",
                "description": "Echo text.",
                "inputSchema": {
                    "type": "object",
                    "properties": {"text": {"type": "string"}},
                },
            }
        ],
    }


def _client_with_mcp(tmp_path: Path, servers: dict) -> TestClient:
    (tmp_path / "mcp.json").write_text(
        json.dumps({"mcpServers": servers}), encoding="utf-8"
    )
    return TestClient(create_app(_settings(tmp_path)))


def _send(client, dest: str, content: str, extra: dict | None = None):
    payload = {"content": content}
    if extra:
        payload.update(extra)
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json=payload,
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, body, parse_sse(body)


def test_get_plugins_empty(client) -> None:
    listed = client.get("/v1/plugins", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == []


def test_get_plugins_and_post_auth_returns_authorization_url(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        listed = client.get("/v1/plugins", headers=AUTH)
        assert listed.status_code == 200
        rows = listed.json()
        assert rows == [
            {"id": "example", "name": "Example", "status": "needsAuth"}
        ]
        started = client.post("/v1/plugins/example/auth", headers=AUTH)
        assert started.status_code == 200
        url = started.json()["authorizationUrl"]
        assert "/v1/plugins/oauth/start/example" in url
        assert "state=" in url
        done = client.get(url, follow_redirects=True)
        assert done.status_code == 200
        assert b"Connected" in done.content
        after = client.get("/v1/plugins", headers=AUTH).json()
        assert after[0]["status"] == "connected"
        assert "example__echo" in client.app.state.mcp.tool_names()


def test_kind_connect_persist_and_connect_reply(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        status, raw, events = _send(
            client, SEED, 'SNORLAX_TOOL example__echo {"text": "hello-mcp"}'
        )
        assert status == 200
        assert "event: connect" not in raw
        dones = [p for n, p in events if n == "message.done"]
        card = next(p for p in dones if p.get("kind") == "connect")
        assert card["senderId"] == SEED
        assert card["role"] == "assistant"
        assert card["connectStatus"] == "pending"
        assert card["connect"]["pluginId"] == "example"
        assert card["connect"]["prompt"].startswith("Connect Example")
        assert card["connect"]["helpText"] == "Opens your browser to sign in."
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        cards = [m for m in listed if m.get("kind") == "connect"]
        assert len(cards) == 1
        assert cards[0]["id"] == card["id"]
        assert all(m.get("role") != "user" or m.get("kind") != "connect" for m in listed)

        auth = client.post("/v1/plugins/example/auth", headers=AUTH).json()
        client.get(auth["authorizationUrl"], follow_redirects=True)
        status, _body, events = _send(
            client, SEED, "", extra={"connectReply": {"id": card["id"]}}
        )
        assert status == 200
        updated = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m["id"] == card["id"]
        )
        assert updated["kind"] == "connect"
        assert updated["connectStatus"] == "connected"
        dones = [p for n, p in events if n == "message.done"]
        assert dones[0]["id"] == card["id"]
        assert dones[0]["connectStatus"] == "connected"
        follow = [p for p in dones if p.get("kind") != "connect"]
        assert follow
        assert follow[-1]["role"] == "assistant"
        assert follow[-1]["senderId"] == SEED


def test_connect_dismiss_no_user_bubble(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        card = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m.get("kind") == "connect"
        )
        status, _body, events = _send(
            client,
            SEED,
            "",
            extra={"connectReply": {"id": card["id"], "dismissed": True}},
        )
        assert status == 200
        dones = [p for n, p in events if n == "message.done"]
        assert dones[0]["connectStatus"] == "dismissed"
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        users = [m for m in listed if m["role"] == "user"]
        assert len(users) == 1
        updated = next(m for m in listed if m["id"] == card["id"])
        assert updated["connectStatus"] == "dismissed"
        assert updated["kind"] == "connect"


def test_connect_card_isolation(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        alice = client.post(
            "/v1/agents", headers=AUTH, json={"name": "Alice"}
        ).json()
        bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
        _send(client, bob["id"], 'SNORLAX_TOOL example__echo {"text": "from-bob"}')
        bob_msgs = client.get(
            f"/v1/agents/{bob['id']}/messages", headers=AUTH
        ).json()
        bob_cards = [m for m in bob_msgs if m.get("kind") == "connect"]
        assert bob_cards
        assert bob_cards[0]["senderId"] == bob["id"]
        alice_msgs = client.get(
            f"/v1/agents/{alice['id']}/messages", headers=AUTH
        ).json()
        assert not any(m.get("kind") == "connect" for m in alice_msgs)
        seed_msgs = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        assert not any(m.get("kind") == "connect" for m in seed_msgs)


def test_channel_connect_is_thread_only(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
        channel = "snorlax-bot-group"
        status, _body, events = _send(
            client,
            channel,
            f"@{bob['name']} SNORLAX_TOOL example__echo " + '{"text": "ch"}',
            extra={"mentions": [bob["id"]]},
        )
        assert status == 200
        timeline = client.get(
            f"/v1/agents/{channel}/messages", headers=AUTH
        ).json()
        assert timeline
        assert not any(m.get("kind") == "connect" for m in timeline)
        root = timeline[-1]
        thread = client.get(
            f"/v1/agents/{channel}/messages",
            headers=AUTH,
            params={"threadId": root["id"]},
        ).json()
        connect_cards = [
            m
            for m in thread
            if m.get("kind") == "connect" and m["senderId"] == bob["id"]
        ]
        assert connect_cards
        assert connect_cards[0]["connectStatus"] == "pending"
        assert connect_cards[0].get("replyTo")
        seed_one_to_one = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        assert not any(
            m.get("kind") == "connect" and m["senderId"] == bob["id"]
            for m in seed_one_to_one
        )
        del events


def test_connect_reply_before_auth_stays_pending(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        card = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m.get("kind") == "connect"
        )
        blocked = client.post(
            f"/v1/agents/{SEED}/messages",
            headers=AUTH,
            json={"content": "", "connectReply": {"id": card["id"]}},
        )
        assert blocked.status_code == 409
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        updated = next(m for m in listed if m["id"] == card["id"])
        assert updated["connectStatus"] == "pending"
        assert client.get("/v1/plugins", headers=AUTH).json()[0]["status"] == "needsAuth"


def test_unknown_plugin_auth_404(client) -> None:
    response = client.post("/v1/plugins/missing/auth", headers=AUTH)
    assert response.status_code == 404


def test_content_while_connect_pending_is_409(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        blocked = client.post(
            f"/v1/agents/{SEED}/messages",
            headers=AUTH,
            json={"content": "hello anyway"},
        )
        assert blocked.status_code == 409
