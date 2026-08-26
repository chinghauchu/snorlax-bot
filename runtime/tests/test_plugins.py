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
        assert "event: connect.url" not in raw
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

        status, raw, events = _send(
            client, SEED, "", extra={"connectReply": {"id": card["id"]}}
        )
        assert status == 200
        assert "event: connect.url" in raw
        url_events = [p for n, p in events if n == "connect.url"]
        assert url_events
        assert url_events[0]["pluginId"] == "example"
        assert "/v1/plugins/oauth/start/example" in url_events[0]["url"]
        dones = [p for n, p in events if n == "message.done"]
        assert dones[0]["id"] == card["id"]
        assert dones[0]["connectStatus"] == "pending"
        pending = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m["id"] == card["id"]
        )
        assert pending["connectStatus"] == "pending"

        done = client.get(url_events[0]["url"], follow_redirects=True)
        assert done.status_code == 200
        assert b"Connected" in done.content
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        updated = next(m for m in listed if m["id"] == card["id"])
        assert updated["kind"] == "connect"
        assert updated["connectStatus"] == "connected"
        follow = [
            m
            for m in listed
            if m.get("kind") != "connect" and m["role"] == "assistant" and m["id"] != card["id"]
        ]
        assert follow
        assert follow[-1]["senderId"] == SEED
        assert client.get("/v1/plugins", headers=AUTH).json()[0]["status"] == "connected"


def test_connect_dismiss_no_user_bubble(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        card = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m.get("kind") == "connect"
        )
        status, raw, events = _send(
            client,
            SEED,
            "",
            extra={"connectReply": {"id": card["id"], "dismissed": True}},
        )
        assert status == 200
        assert "event: connect.url" not in raw
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


def test_connect_reply_stays_pending_until_auth(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        card = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m.get("kind") == "connect"
        )
        status, raw, events = _send(
            client, SEED, "", extra={"connectReply": {"id": card["id"]}}
        )
        assert status == 200
        assert "event: connect.url" in raw
        url_events = [p for n, p in events if n == "connect.url"]
        assert url_events[0]["pluginId"] == "example"
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        updated = next(m for m in listed if m["id"] == card["id"])
        assert updated["connectStatus"] == "pending"
        assert client.get("/v1/plugins", headers=AUTH).json()[0]["status"] == "needsAuth"
        users = [m for m in listed if m["role"] == "user"]
        assert len(users) == 1


def test_post_oauth_complete_with_code_and_state(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        card = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m.get("kind") == "connect"
        )
        _status, _raw, events = _send(
            client, SEED, "", extra={"connectReply": {"id": card["id"]}}
        )
        url = next(p["url"] for n, p in events if n == "connect.url")
        state = url.split("state=", 1)[1]
        posted = client.post(
            "/v1/plugins/oauth/callback",
            json={"state": state, "code": "local"},
        )
        assert posted.status_code == 200
        assert b"Connected" in posted.content
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        updated = next(m for m in listed if m["id"] == card["id"])
        assert updated["connectStatus"] == "connected"
        follow = [
            m
            for m in listed
            if m["role"] == "assistant" and m.get("kind") != "connect"
        ]
        assert follow
        assert client.get("/v1/plugins", headers=AUTH).json()[0]["status"] == "connected"


def test_settings_auth_completes_pending_connect_card(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        card = next(
            m
            for m in client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
            if m.get("kind") == "connect"
        )
        auth = client.post("/v1/plugins/example/auth", headers=AUTH).json()
        client.get(auth["authorizationUrl"], follow_redirects=True)
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        updated = next(m for m in listed if m["id"] == card["id"])
        assert updated["connectStatus"] == "connected"
        follow = [
            m
            for m in listed
            if m["role"] == "assistant" and m.get("kind") != "connect"
        ]
        assert follow


def test_unknown_plugin_auth_404(client) -> None:
    response = client.post("/v1/plugins/missing/auth", headers=AUTH)
    assert response.status_code == 404


def test_post_plugin_stdio_get_reflects_and_delete_uninstalls(tmp_path) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        created = client.post(
            "/v1/plugins",
            headers=AUTH,
            json={
                "name": "Example",
                "stdio": {
                    "command": sys.executable,
                    "args": [str(FAKE_STDIO)],
                },
            },
        )
        assert created.status_code in {200, 201}
        row = created.json()
        assert row["name"] == "Example"
        assert row["id"]
        assert row["status"] in {"connected", "needsAuth"}
        listed = client.get("/v1/plugins", headers=AUTH)
        assert listed.status_code == 200
        ids = [item["id"] for item in listed.json()]
        assert row["id"] in ids
        catalog = json.loads((tmp_path / "mcp.json").read_text(encoding="utf-8"))
        assert row["id"] in catalog.get("mcpServers", {})
        assert catalog["mcpServers"][row["id"]]["command"] == sys.executable
        deleted = client.delete(f"/v1/plugins/{row['id']}", headers=AUTH)
        assert deleted.status_code == 204
        after = client.get("/v1/plugins", headers=AUTH).json()
        assert after == []
        catalog = json.loads((tmp_path / "mcp.json").read_text(encoding="utf-8"))
        assert row["id"] not in catalog.get("mcpServers", {})
        missing = client.delete(f"/v1/plugins/{row['id']}", headers=AUTH)
        assert missing.status_code == 404


def test_post_plugin_url_get_reflects(tmp_path) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        created = client.post(
            "/v1/plugins",
            headers=AUTH,
            json={"name": "Lan ping", "url": "http://127.0.0.1:9/mcp"},
        )
        assert created.status_code in {200, 201}
        row = created.json()
        assert row["name"] == "Lan ping"
        listed = client.get("/v1/plugins", headers=AUTH).json()
        assert any(item["id"] == row["id"] and item["name"] == "Lan ping" for item in listed)
        catalog = json.loads((tmp_path / "mcp.json").read_text(encoding="utf-8"))
        spec = catalog["mcpServers"][row["id"]]
        assert spec["url"] == "http://127.0.0.1:9/mcp"
        assert "command" not in spec


def test_post_plugin_invalid_combo_422(client) -> None:
    both = client.post(
        "/v1/plugins",
        headers=AUTH,
        json={
            "name": "Both",
            "stdio": {"command": "echo"},
            "url": "http://127.0.0.1:9/mcp",
        },
    )
    assert both.status_code == 422
    neither = client.post("/v1/plugins", headers=AUTH, json={"name": "Empty"})
    assert neither.status_code == 422
    blocked = client.post(
        "/v1/plugins",
        headers=AUTH,
        json={"name": "Meta", "url": "http://169.254.169.254/mcp"},
    )
    assert blocked.status_code == 422


def test_unknown_plugin_delete_and_disconnect_404(client) -> None:
    deleted = client.delete("/v1/plugins/missing", headers=AUTH)
    assert deleted.status_code == 404
    disconnected = client.post("/v1/plugins/missing/disconnect", headers=AUTH)
    assert disconnected.status_code == 404


def test_disconnect_keeps_catalog_needs_auth(tmp_path) -> None:
    with TestClient(create_app(_settings(tmp_path))) as client:
        created = client.post(
            "/v1/plugins",
            headers=AUTH,
            json={
                "name": "Example",
                "stdio": {
                    "command": sys.executable,
                    "args": [str(FAKE_STDIO)],
                },
            },
        )
        assert created.status_code in {200, 201}
        row = created.json()
        if row["status"] != "connected":
            auth = client.post(f"/v1/plugins/{row['id']}/auth", headers=AUTH).json()
            client.get(auth["authorizationUrl"], follow_redirects=True)
            row = client.get("/v1/plugins", headers=AUTH).json()[0]
        assert row["status"] == "connected"
        disconnected = client.post(
            f"/v1/plugins/{row['id']}/disconnect", headers=AUTH
        )
        assert disconnected.status_code == 200
        body = disconnected.json()
        assert body["id"] == row["id"]
        assert body["status"] == "needsAuth"
        listed = client.get("/v1/plugins", headers=AUTH).json()
        assert listed == [body]
        catalog = json.loads((tmp_path / "mcp.json").read_text(encoding="utf-8"))
        assert row["id"] in catalog.get("mcpServers", {})


def test_clients_never_call_mcp() -> None:
    root = Path(__file__).resolve().parents[2]
    desktop_api = (root / "desktop" / "src" / "api.ts").read_text(encoding="utf-8")
    ios_client = (root / "ios" / "SnorlaxBot" / "RuntimeClient.swift").read_text(
        encoding="utf-8"
    )
    for source in (desktop_api, ios_client):
        assert "v1/plugins" in source
        assert "modelcontextprotocol" not in source
        assert "stdio_client" not in source
        assert "streamable_http" not in source
        assert "tools/list" not in source
        assert "mcp.json" not in source
        assert "JSON-RPC" not in source
        assert "jsonrpc" not in source.lower()


def test_content_while_connect_pending_is_409(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _disabled_stdio()}) as client:
        _send(client, SEED, 'SNORLAX_TOOL example__echo {"text": "x"}')
        blocked = client.post(
            f"/v1/agents/{SEED}/messages",
            headers=AUTH,
            json={"content": "hello anyway"},
        )
        assert blocked.status_code == 409
