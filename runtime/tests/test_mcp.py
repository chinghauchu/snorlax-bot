# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
import socket
import sys
import threading
import time
from pathlib import Path

import pytest
import uvicorn
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.routing import Route

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings
from snorlax_runtime.mcp import (
    BUILTIN_TOOL_NAMES,
    mcp_url_allowed,
    qualify_tool_name,
)
from snorlax_runtime.tools import execute_tool
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
    )


def _client_with_mcp(tmp_path: Path, servers: dict) -> TestClient:
    (tmp_path / "mcp.json").write_text(
        json.dumps({"mcpServers": servers}), encoding="utf-8"
    )
    return TestClient(create_app(_settings(tmp_path)))


def _send(client, dest: str, content: str):
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json={"content": content},
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, body, parse_sse(body)


def _final_assistant(events: list[tuple[str, dict]]) -> dict:
    dones = [p for n, p in events if n == "message.done"]
    for payload in reversed(dones):
        if payload.get("kind") != "tool":
            return payload
    return dones[-1]


def _stdio_spec() -> dict:
    return {
        "command": sys.executable,
        "args": [str(FAKE_STDIO)],
    }


def _make_lan_app() -> Starlette:
    async def mcp_endpoint(request: Request) -> Response:
        if request.method == "GET":
            return Response(status_code=405)
        if request.method == "DELETE":
            return Response(status_code=200)
        try:
            body = await request.json()
        except Exception:  # noqa: BLE001
            return Response(status_code=400)
        method = body.get("method")
        mid = body.get("id")
        if method == "initialize":
            resp = JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": mid,
                    "result": {
                        "protocolVersion": (body.get("params") or {}).get(
                            "protocolVersion"
                        )
                        or "2025-03-26",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "fake-lan", "version": "0.7"},
                    },
                }
            )
            resp.headers["mcp-session-id"] = "test-sess"
            return resp
        if method in {"notifications/initialized", "notifications/cancelled"}:
            return Response(status_code=202)
        if method == "ping":
            return JSONResponse({"jsonrpc": "2.0", "id": mid, "result": {}})
        if method == "tools/list":
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": mid,
                    "result": {
                        "tools": [
                            {
                                "name": "ping_lan",
                                "description": "Ping a LAN MCP server.",
                                "inputSchema": {
                                    "type": "object",
                                    "properties": {},
                                },
                            }
                        ]
                    },
                }
            )
        if method == "tools/call":
            name = (body.get("params") or {}).get("name")
            if name == "ping_lan":
                return JSONResponse(
                    {
                        "jsonrpc": "2.0",
                        "id": mid,
                        "result": {
                            "content": [{"type": "text", "text": "lan-ok"}],
                            "isError": False,
                        },
                    }
                )
            return JSONResponse(
                {
                    "jsonrpc": "2.0",
                    "id": mid,
                    "error": {"code": -32601, "message": f"Unknown tool {name}"},
                }
            )
        return JSONResponse(
            {
                "jsonrpc": "2.0",
                "id": mid,
                "error": {"code": -32601, "message": str(method)},
            },
            status_code=400,
        )

    return Starlette(
        routes=[
            Route("/mcp", mcp_endpoint, methods=["GET", "POST", "DELETE"]),
        ]
    )


def _free_port() -> int:
    sock = socket.socket()
    sock.bind(("127.0.0.1", 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


@pytest.fixture
def lan_mcp_url():
    port = _free_port()
    server = uvicorn.Server(
        uvicorn.Config(
            _make_lan_app(),
            host="127.0.0.1",
            port=port,
            log_level="error",
        )
    )
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    deadline = time.time() + 5
    while time.time() < deadline and not server.started:
        time.sleep(0.05)
    assert server.started
    yield f"http://127.0.0.1:{port}/mcp"
    server.should_exit = True
    thread.join(timeout=5)


def test_missing_mcp_json_boots_with_builtins(client, tmp_path) -> None:
    assert not (tmp_path / "mcp.json").exists()
    health = client.get("/v1/health")
    assert health.status_code == 200
    status, _body, events = _send(
        client, SEED, 'Write a file named app.py containing print("ok")'
    )
    assert status == 200
    assert any(n == "tool.done" and p["name"] == "write_file" for n, p in events)
    assert (tmp_path / "workspaces" / "agents" / SEED / "app.py").read_text() == (
        'print("ok")'
    )


def test_stdio_mcp_tool_in_loop_and_kind_tool_persisted(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _stdio_spec()}) as client:
        offered = client.app.state.mcp.tool_names()
        assert "example__echo" in offered
        assert "list_dir" not in offered
        assert "example__list_dir" in offered
        status, _body, events = _send(
            client, SEED, 'SNORLAX_TOOL example__echo {"text": "hello-mcp"}'
        )
        assert status == 200
        names = [n for n, _ in events]
        assert "tool.start" in names
        assert "tool.done" in names
        start = next(p for n, p in events if n == "tool.start")
        done = next(p for n, p in events if n == "tool.done")
        assert start["name"] == "example__echo"
        assert "example__echo" in start["summary"]
        assert done["ok"] is True
        assert done["summary"] == "Used example__echo"
        tool_msgs = [
            p for n, p in events if n == "message.done" and p.get("kind") == "tool"
        ]
        assert tool_msgs
        assert tool_msgs[0]["content"] == "Used example__echo"
        assert tool_msgs[0]["senderId"] == SEED
        final = _final_assistant(events)
        assert final.get("kind") != "tool"
        assert "hello-mcp" in final["content"]
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        tools = [m for m in listed if m.get("kind") == "tool"]
        assert tools
        assert tools[0]["content"] == "Used example__echo"
        assistant = [
            m
            for m in listed
            if m["role"] == "assistant" and m.get("kind") != "tool"
        ][-1]
        assert "hello-mcp" in assistant["content"]


def test_lan_mcp_http_tool_in_loop(tmp_path, lan_mcp_url) -> None:
    with _client_with_mcp(
        tmp_path, {"lan": {"url": lan_mcp_url}}
    ) as client:
        assert "lan__ping_lan" in client.app.state.mcp.tool_names()
        status, _body, events = _send(
            client, SEED, "SNORLAX_TOOL lan__ping_lan {}"
        )
        assert status == 200
        done = next(p for n, p in events if n == "tool.done")
        assert done["name"] == "lan__ping_lan"
        assert done["ok"] is True
        final = _final_assistant(events)
        assert "lan-ok" in final["content"]
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        tools = [m for m in listed if m.get("kind") == "tool"]
        assert tools[0]["content"] == "Used lan__ping_lan"


def test_name_collision_builtin_wins(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"collide": _stdio_spec()}) as client:
        names = client.app.state.mcp.tool_names()
        assert "collide__list_dir" in names
        assert "list_dir" not in names
        offered = {t["function"]["name"] for t in client.app.state.mcp.openai_tools()}
        assert "list_dir" not in offered
        assert "collide__list_dir" in offered
        status, _body, events = _send(
            client, SEED, "List the workspace files"
        )
        assert status == 200
        done = next(p for n, p in events if n == "tool.done")
        assert done["name"] == "list_dir"
        assert done["ok"] is True
        assert done["summary"] == "Listed ."
        final = _final_assistant(events)
        assert "mcp-list:" not in final["content"]
        status, _body, events = _send(
            client, SEED, 'SNORLAX_TOOL collide__list_dir {"path": "mcp-only"}'
        )
        assert status == 200
        mcp_done = next(p for n, p in events if n == "tool.done")
        assert mcp_done["name"] == "collide__list_dir"
        mcp_final = _final_assistant(events)
        assert "mcp-list:mcp-only" in mcp_final["content"]


def test_failed_mcp_tool_still_has_assistant_followup(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _stdio_spec()}) as client:
        status, _body, events = _send(
            client, SEED, "SNORLAX_TOOL example__fail {}"
        )
        assert status == 200
        names = [n for n, _ in events]
        assert "tool.done" in names
        assert "message.delta" in names
        assert names[-1] == "message.done"
        done = next(p for n, p in events if n == "tool.done")
        assert done["ok"] is False
        assert done["summary"] == "example__fail failed"
        tool_msgs = [
            p for n, p in events if n == "message.done" and p.get("kind") == "tool"
        ]
        assert tool_msgs[0]["content"] == "example__fail failed"
        final = _final_assistant(events)
        assert final.get("kind") != "tool"
        assert final["role"] == "assistant"
        assert final["content"].strip()
        assert "mcp boom" in final["content"] or "example__fail" in final["content"]
        listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
        assistant = [
            m
            for m in listed
            if m["role"] == "assistant" and m.get("kind") != "tool"
        ][-1]
        assert assistant["content"] == final["content"]


def test_failed_mcp_server_still_boots_builtins(tmp_path) -> None:
    with _client_with_mcp(
        tmp_path,
        {
            "dead": {"command": "/nonexistent/snorlax-mcp-server", "args": []},
            "example": _stdio_spec(),
        },
    ) as client:
        health = client.get("/v1/health")
        assert health.status_code == 200
        failures = " ".join(client.app.state.mcp.failures)
        assert "dead" in failures
        assert "example__echo" in client.app.state.mcp.tool_names()
        status, _body, events = _send(
            client, SEED, 'Write a file named still.py containing print(1)'
        )
        assert status == 200
        assert any(n == "tool.done" and p["name"] == "write_file" for n, p in events)
        assert (
            tmp_path / "workspaces" / "agents" / SEED / "still.py"
        ).read_text() == "print(1)"


def test_seed_channel_delete_still_204_with_mcp(tmp_path) -> None:
    with _client_with_mcp(tmp_path, {"example": _stdio_spec()}) as client:
        deleted = client.delete("/v1/agents/snorlax-bot-group", headers=AUTH)
        assert deleted.status_code == 204
        assert client.get("/v1/agents/snorlax-bot-group", headers=AUTH).status_code == 404
        roster = client.get("/v1/agents", headers=AUTH).json()
        assert all(a["id"] != "snorlax-bot-group" for a in roster)
        assert any(a["id"] == SEED for a in roster)


def test_qualify_and_builtin_set() -> None:
    assert qualify_tool_name("example", "echo") == "example__echo"
    assert "list_dir" in BUILTIN_TOOL_NAMES
    assert "example__echo" not in BUILTIN_TOOL_NAMES


@pytest.mark.parametrize(
    "url,ok",
    [
        ("http://127.0.0.1:8765/mcp", True),
        ("http://localhost:8765/mcp", True),
        ("http://10.0.0.8:8765/mcp", True),
        ("http://192.168.1.10/mcp", True),
        ("http://172.16.0.2/mcp", True),
        ("http://printer.local/mcp", True),
        ("http://169.254.169.254/latest/meta-data", False),
        ("http://169.254.1.1/", False),
        ("file:///etc/passwd", False),
        ("ftp://127.0.0.1/mcp", False),
    ],
)
def test_mcp_url_allowlist(url: str, ok: bool) -> None:
    allowed, reason = mcp_url_allowed(url)
    assert allowed is ok, reason


def test_blocked_metadata_url_does_not_register(tmp_path) -> None:
    with _client_with_mcp(
        tmp_path,
        {"meta": {"url": "http://169.254.169.254/mcp"}},
    ) as client:
        assert client.app.state.mcp.servers == {}
        assert any("meta" in f for f in client.app.state.mcp.failures)
        root = tmp_path / "ws"
        root.mkdir()
        out = execute_tool("list_dir", '{"path": "."}', root)
        assert "Error" not in out or out == "(empty)"
        assert client.get("/v1/health").status_code == 200


def test_empty_mcp_json_is_no_mcp(tmp_path) -> None:
    (tmp_path / "mcp.json").write_text("", encoding="utf-8")
    with TestClient(create_app(_settings(tmp_path))) as client:
        assert client.app.state.mcp.tool_names() == []
        status, _body, events = _send(
            client, SEED, "Run pwd in the workspace"
        )
        assert status == 200
        assert any(n == "tool.done" and p["name"] == "shell" for n, p in events)
