# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import pytest

from snorlax_runtime.inference import MockBackend, StreamPart, ToolCall
from snorlax_runtime.tools import (
    PathJailError,
    execute_tool,
    resolve_in_workspace,
    run_tool_loop,
    workspace_for,
)
from tests.conftest import AUTH, parse_sse

CHANNEL = "snorlax-bot-group"
SEED = "snorlax-bot"


def _send(client, dest: str, content: str, mentions: list[str] | None = None):
    payload: dict = {"content": content}
    if mentions is not None:
        payload["mentions"] = mentions
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json=payload,
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, body, parse_sse(body)


def test_resolve_rejects_traversal(tmp_path) -> None:
    root = tmp_path / "ws"
    root.mkdir()
    (root / "ok.txt").write_text("in")
    assert resolve_in_workspace(root, "ok.txt") == (root / "ok.txt").resolve()
    with pytest.raises(PathJailError):
        resolve_in_workspace(root, "../secret.txt")
    with pytest.raises(PathJailError):
        resolve_in_workspace(root, "/etc/passwd")
    with pytest.raises(PathJailError):
        resolve_in_workspace(root, "foo/../../secret.txt")
    execute_tool(
        "write_file",
        '{"path": "../outside.txt", "content": "leaked"}',
        root,
    )
    assert not (tmp_path / "outside.txt").exists()
    assert "Error" in execute_tool(
        "read_file", '{"path": "/etc/passwd"}', root
    )


def test_tool_loop_writes_file_in_agent_workspace(client, tmp_path) -> None:
    status, _body, events = _send(
        client,
        SEED,
        'Write a file named app.py containing print("ok")',
    )
    assert status == 200
    names = [n for n, _ in events]
    assert "tool.start" in names
    assert "tool.done" in names
    assert "message.delta" in names
    assert names[-1] == "message.done"
    start = next(p for n, p in events if n == "tool.start")
    done = next(p for n, p in events if n == "tool.done")
    assert start["name"] == "write_file"
    assert "app.py" in start["summary"]
    assert done["ok"] is True
    assert done["summary"] == "Wrote app.py"
    path = tmp_path / "workspaces" / "agents" / SEED / "app.py"
    assert path.read_text() == 'print("ok")'
    assert not (tmp_path / "workspaces" / "channels" / CHANNEL / "app.py").exists()


def test_shell_pwd_is_agent_workspace(client, tmp_path) -> None:
    status, _body, events = _send(client, SEED, "Run pwd in the workspace.")
    assert status == 200
    workspace = (tmp_path / "workspaces" / "agents" / SEED).resolve()
    done = next(p for n, p in events if n == "message.done")
    assert str(workspace) in done["content"]
    assert workspace.is_dir()


def test_path_traversal_rejected_on_write(client, tmp_path) -> None:
    status, _body, events = _send(
        client,
        SEED,
        "Write a file named ../escape.txt containing leaked",
    )
    assert status == 200
    done_tool = next(p for n, p in events if n == "tool.done")
    assert done_tool["ok"] is False
    assert not (tmp_path / "escape.txt").exists()
    ws = tmp_path / "workspaces" / "agents" / SEED
    assert not (ws / "escape.txt").exists()
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assistant = [m for m in listed if m["role"] == "assistant"][-1]
    assert "Error" in assistant["content"] or "escape" in assistant["content"].lower()


def test_web_fetch_and_search_mocked(client, monkeypatch) -> None:
    async def fake_get(url: str, **_kwargs):
        if "duckduckgo" in url:
            html = (
                '<a class="result__a" href="https://example.com/snorlax">'
                "Snorlax page</a>"
                '<a class="result__snippet">A sleepy pokemon.</a>'
            )
            return 200, html, "text/html"
        return 200, "# Hello from fetch\n\nBody.", "text/markdown"

    monkeypatch.setattr("snorlax_runtime.tools.http_get", fake_get)

    status, _body, events = _send(
        client, SEED, "Search the web for snorlax bot"
    )
    assert status == 200
    assert any(n == "tool.start" and p["name"] == "web_search" for n, p in events)
    done = next(p for n, p in events if n == "message.done")
    assert "Snorlax page" in done["content"]
    assert "example.com/snorlax" in done["content"]

    status, _body, events = _send(
        client, SEED, "Fetch the url https://example.com/page"
    )
    assert status == 200
    assert any(n == "tool.start" and p["name"] == "web_fetch" for n, p in events)
    done = next(p for n, p in events if n == "message.done")
    assert "Hello from fetch" in done["content"]


def test_channel_turn_uses_channel_project(client, tmp_path) -> None:
    status, _body, events = _send(
        client,
        CHANNEL,
        'Write a file named shared.py containing print("chan")',
        mentions=[SEED],
    )
    assert status == 200
    channel_file = tmp_path / "workspaces" / "channels" / CHANNEL / "shared.py"
    agent_file = tmp_path / "workspaces" / "agents" / SEED / "shared.py"
    assert channel_file.read_text() == 'print("chan")'
    assert not agent_file.exists()
    assert any(n == "tool.done" for n, _ in events)


def test_agent_workspaces_are_isolated(client, tmp_path) -> None:
    other = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Inbox"},
    ).json()
    _send(client, SEED, "Write a file named private.txt containing snorlax-only")
    _send(
        client,
        other["id"],
        "Write a file named private.txt containing inbox-only",
    )
    seed_file = tmp_path / "workspaces" / "agents" / SEED / "private.txt"
    other_file = tmp_path / "workspaces" / "agents" / other["id"] / "private.txt"
    assert seed_file.read_text() == "snorlax-only"
    assert other_file.read_text() == "inbox-only"


@pytest.mark.asyncio
async def test_tool_round_cap(tmp_path) -> None:
    class AlwaysTool:
        async def generate(self, messages, tools=None):
            yield StreamPart(
                tool_calls=[
                    ToolCall(
                        id="call_loop",
                        name="list_dir",
                        arguments='{"path":"."}',
                    )
                ]
            )

    workspace = tmp_path / "ws"
    workspace.mkdir()
    events, content = await run_tool_loop(
        AlwaysTool(),
        [{"role": "user", "content": "loop"}],
        workspace=workspace,
        agent={"id": "a", "name": "A", "avatar": None},
        assistant_id="msg_1",
        stream=True,
        max_rounds=3,
    )
    starts = [p for n, p in events if n == "tool.start"]
    assert len(starts) == 3
    assert "tool-round cap" in content


def test_workspace_for_channel_vs_agent(tmp_path) -> None:
    channel = {"id": "snorlax-bot-group", "kind": "channel"}
    agent = {"id": "snorlax-bot", "kind": "agent"}
    assert workspace_for(tmp_path, agent, "snorlax-bot") == (
        tmp_path / "workspaces" / "agents" / "snorlax-bot"
    ).resolve()
    assert workspace_for(tmp_path, channel, "snorlax-bot") == (
        tmp_path / "workspaces" / "channels" / "snorlax-bot-group"
    ).resolve()


@pytest.mark.asyncio
async def test_mock_backend_emits_tool_call() -> None:
    backend = MockBackend()
    tools = [
        {
            "type": "function",
            "function": {"name": "write_file", "parameters": {}},
        }
    ]
    parts = [
        p
        async for p in backend.generate(
            [{"role": "user", "content": "Write a file named a.txt containing hi"}],
            tools=tools,
        )
    ]
    assert parts[0].tool_calls
    assert parts[0].tool_calls[0].name == "write_file"
