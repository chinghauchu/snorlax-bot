# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

import pytest

from snorlax_runtime.config import Settings
from snorlax_runtime.inference import InferenceError, MockBackend, StreamPart, ToolCall
from snorlax_runtime.tools import (
    PathJailError,
    configure_tools,
    execute_tool,
    resolve_in_workspace,
    run_tool_loop,
    search_request_url,
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


def _final_assistant(events: list[tuple[str, dict]]) -> dict:
    dones = [p for n, p in events if n == "message.done"]
    for payload in reversed(dones):
        if payload.get("kind") != "tool":
            return payload
    return dones[-1]


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
    tool_msgs = [p for n, p in events if n == "message.done" and p.get("kind") == "tool"]
    assert tool_msgs
    assert tool_msgs[0]["content"] == "Wrote app.py"
    assert tool_msgs[0]["id"] == done["id"]
    assert tool_msgs[0]["senderId"] == SEED
    path = tmp_path / "workspaces" / "agents" / SEED / "app.py"
    assert path.read_text() == 'print("ok")'
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[0]["content"] == "Wrote app.py"
    assert tools[0]["senderId"] == SEED
    assert tools[0]["role"] == "assistant"
    assert not (tmp_path / "workspaces" / "channels" / CHANNEL / "app.py").exists()


def test_peer_tool_lines_stay_out_of_report_back(client, tmp_path) -> None:
    alice = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Alice"}
    ).json()
    bob = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Bob"}
    ).json()
    status, _body, events = _send(
        client,
        alice["id"],
        "@Bob please Write a file named secret.py containing leaked",
    )
    assert status == 200
    sse_senders = {
        payload.get("senderId")
        for name, payload in events
        if name in {"message.delta", "message.done", "tool.start", "tool.done"}
    }
    assert bob["id"] not in sse_senders
    assert not any(
        payload.get("kind") == "tool" and payload.get("senderId") == bob["id"]
        for name, payload in events
        if name == "message.done"
    )

    alice_msgs = client.get(
        f"/v1/agents/{alice['id']}/messages", headers=AUTH
    ).json()
    assert not any(m["senderId"] == bob["id"] for m in alice_msgs)
    alice_tools = [m for m in alice_msgs if m.get("kind") == "tool"]
    assert all(m["senderId"] == alice["id"] for m in alice_tools)
    reports = [
        m
        for m in alice_msgs
        if m["senderId"] == alice["id"] and m.get("kind") != "tool"
    ]
    assert reports
    report = reports[-1]
    assert report.get("kind", "message") == "message"
    assert report["role"] == "assistant"
    assert report["senderId"] == alice["id"]
    assert report["content"] != "Wrote secret.py"

    user = [m for m in alice_msgs if m["senderId"] == "user"][-1]
    thread_id = user["handoff"]["threadId"]
    thread = client.get(
        f"/v1/agents/{CHANNEL}/messages",
        headers=AUTH,
        params={"threadId": thread_id},
    ).json()
    bob_tools = [
        m
        for m in thread
        if m.get("kind") == "tool" and m["senderId"] == bob["id"]
    ]
    assert bob_tools
    assert bob_tools[0]["content"] == "Wrote secret.py"
    assert bob_tools[0]["role"] == "assistant"
    assert (tmp_path / "workspaces" / "agents" / bob["id"] / "secret.py").read_text() == (
        "leaked"
    )
    timeline = client.get(f"/v1/agents/{CHANNEL}/messages", headers=AUTH).json()
    assert not any(m.get("kind") == "tool" for m in timeline)


def test_shell_pwd_is_agent_workspace(client, tmp_path) -> None:
    status, _body, events = _send(client, SEED, "Run pwd in the workspace.")
    assert status == 200
    workspace = (tmp_path / "workspaces" / "agents" / SEED).resolve()
    done = _final_assistant(events)
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
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[0]["content"] == "write_file failed"
    assert tools[0]["senderId"] == SEED
    assert tools[0]["role"] == "assistant"
    assistant = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind") != "tool"
    ][-1]
    assert "Error" in assistant["content"] or "escape" in assistant["content"].lower()


class _FetchThenEmpty:
    async def generate(self, messages, tools=None):
        del tools
        if any(item.get("role") == "tool" for item in messages):
            return
        yield StreamPart(
            tool_calls=[
                ToolCall(
                    id="call_fetch",
                    name="web_fetch",
                    arguments='{"url": "https://example.com/missing"}',
                )
            ]
        )


class _FetchThenTalk:
    async def generate(self, messages, tools=None):
        del tools
        if any(item.get("role") == "tool" for item in messages):
            yield StreamPart(text="That page could not be fetched.")
            return
        yield StreamPart(
            tool_calls=[
                ToolCall(
                    id="call_fetch",
                    name="web_fetch",
                    arguments='{"url": "https://example.com/missing"}',
                )
            ]
        )


class _ToolThenBoom:
    async def generate(self, messages, tools=None):
        del tools
        if any(item.get("role") == "tool" for item in messages):
            raise InferenceError(
                "inference_unavailable", "model died after tools"
            )
        yield StreamPart(
            tool_calls=[
                ToolCall(
                    id="call_ls",
                    name="list_dir",
                    arguments='{"path": "."}',
                )
            ]
        )


class _WriteThenDone:
    async def generate(self, messages, tools=None):
        del tools
        if any(item.get("role") == "tool" for item in messages):
            yield StreamPart(text="Wrote the file in the workspace.")
            return
        yield StreamPart(
            tool_calls=[
                ToolCall(
                    id="call_write",
                    name="write_file",
                    arguments='{"path": "ok.py", "content": "print(1)"}',
                )
            ]
        )


def _failing_fetch(_url: str, **_kwargs):
    return 500, "nope", "text/plain"


def test_failed_web_fetch_then_empty_model_still_has_assistant_followup(
    client, monkeypatch
) -> None:
    monkeypatch.setattr("snorlax_runtime.tools.http_get", _failing_fetch)
    client.app.state.backend = _FetchThenEmpty()
    status, _body, events = _send(client, SEED, "Fetch https://example.com/missing")
    assert status == 200
    names = [n for n, _ in events]
    assert "tool.start" in names
    assert "tool.done" in names
    assert "message.delta" in names
    assert names[-1] == "message.done"
    done_tool = next(p for n, p in events if n == "tool.done")
    assert done_tool["ok"] is False
    assert done_tool["summary"] == "web_fetch failed"
    tool_msgs = [p for n, p in events if n == "message.done" and p.get("kind") == "tool"]
    assert tool_msgs
    assert tool_msgs[0]["content"] == "web_fetch failed"
    final = _final_assistant(events)
    assert final.get("kind") != "tool"
    assert final["role"] == "assistant"
    assert final["senderId"] == SEED
    assert final["content"].strip()
    assert "web_fetch" in final["content"]
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools
    assert tools[0]["content"] == "web_fetch failed"
    assistant = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind") != "tool"
    ][-1]
    assert assistant["id"] == final["id"]
    assert assistant["content"] == final["content"]


def test_inference_error_after_tool_still_has_assistant_message(client) -> None:
    client.app.state.backend = _ToolThenBoom()
    status, _body, events = _send(client, SEED, "List the workspace files")
    assert status == 200
    names = [n for n, _ in events]
    assert "tool.done" in names
    assert "message.delta" in names
    assert names[-1] == "message.done"
    tool_msgs = [p for n, p in events if n == "message.done" and p.get("kind") == "tool"]
    assert tool_msgs
    assert tool_msgs[0]["content"] == "Listed ."
    final = _final_assistant(events)
    assert final.get("kind") != "tool"
    assert final["content"].strip()
    assert "Inference failed" in final["content"]
    assert "model died after tools" in final["content"]
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assistant = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind") != "tool"
    ]
    assert assistant
    assert assistant[-1]["content"] == final["content"]
    assert assistant[-1]["senderId"] == SEED


def test_failed_tool_then_model_followup_keeps_model_text(
    client, monkeypatch
) -> None:
    monkeypatch.setattr("snorlax_runtime.tools.http_get", _failing_fetch)
    client.app.state.backend = _FetchThenTalk()
    status, _body, events = _send(client, SEED, "Fetch https://example.com/missing")
    assert status == 200
    final = _final_assistant(events)
    assert final["content"] == "That page could not be fetched."
    assert final.get("kind") != "tool"


def test_successful_tool_loop_still_streams_assistant_after_tool_line(
    client,
) -> None:
    client.app.state.backend = _WriteThenDone()
    status, _body, events = _send(client, SEED, "write ok.py")
    assert status == 200
    names = [n for n, _ in events]
    assert "tool.start" in names
    assert "tool.done" in names
    assert "message.delta" in names
    assert names[-1] == "message.done"
    done_tool = next(p for n, p in events if n == "tool.done")
    assert done_tool["ok"] is True
    assert done_tool["summary"] == "Wrote ok.py"
    tool_msgs = [p for n, p in events if n == "message.done" and p.get("kind") == "tool"]
    assert tool_msgs
    assert tool_msgs[0]["content"] == "Wrote ok.py"
    final = _final_assistant(events)
    assert final.get("kind") != "tool"
    assert final["content"] == "Wrote the file in the workspace."
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    tools = [m for m in listed if m.get("kind") == "tool"]
    assert tools[0]["content"] == "Wrote ok.py"
    assistant = [
        m
        for m in listed
        if m["role"] == "assistant" and m.get("kind") != "tool"
    ][-1]
    assert assistant["content"] == "Wrote the file in the workspace."


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
    done = _final_assistant(events)
    assert "Snorlax page" in done["content"]
    assert "example.com/snorlax" in done["content"]
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    search_tools = [
        m for m in listed if m.get("kind") == "tool" and m["content"].startswith("Searched")
    ]
    assert search_tools

    status, _body, events = _send(
        client, SEED, "Fetch the url https://example.com/page"
    )
    assert status == 200
    assert any(n == "tool.start" and p["name"] == "web_fetch" for n, p in events)
    done = _final_assistant(events)
    assert "Hello from fetch" in done["content"]
    listed = client.get(f"/v1/agents/{SEED}/messages", headers=AUTH).json()
    assert any(m.get("kind") == "tool" and m["content"] == "Fetched page" for m in listed)


def test_channel_turn_uses_agent_workspace_when_project_off(client, tmp_path) -> None:
    status, _body, events = _send(
        client,
        CHANNEL,
        'Write a file named shared.py containing print("chan")',
        mentions=[SEED],
    )
    assert status == 200
    channel_file = tmp_path / "workspaces" / "channels" / CHANNEL / "shared.py"
    agent_file = tmp_path / "workspaces" / "agents" / SEED / "shared.py"
    assert agent_file.read_text() == 'print("chan")'
    assert not channel_file.exists()
    assert any(n == "tool.done" for n, _ in events)


def test_channel_shared_project_uses_channel_sandbox(client, tmp_path) -> None:
    patched = client.patch(
        f"/v1/agents/{CHANNEL}",
        headers=AUTH,
        json={"sharedProject": True},
    )
    assert patched.status_code == 200
    assert patched.json()["sharedProject"] is True
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
    assert str(channel_file).startswith(str(tmp_path.resolve()))
    assert "/Users/" not in str(channel_file)


def test_channel_project_ignores_host_folder_picker(tmp_path) -> None:
    channel = {
        "id": "snorlax-bot-group",
        "kind": "channel",
        "projectPath": "/Users/chinghau/Projects/shared",
        "sharedProject": True,
    }
    path = workspace_for(tmp_path, channel, "snorlax-bot")
    assert path == (
        tmp_path / "workspaces" / "channels" / "snorlax-bot-group"
    ).resolve()
    assert "chinghau" not in str(path)
    assert "Projects" not in str(path)


def test_tools_auto_run_without_approval_events(client, tmp_path) -> None:
    status, _body, events = _send(
        client,
        SEED,
        "Write a file named auto.py containing print(2)",
    )
    assert status == 200
    names = [n for n, _ in events]
    assert "tool.start" in names
    assert "tool.done" in names
    assert "widget" not in names
    assert "approval" not in names
    assert "question" not in names
    assert (tmp_path / "workspaces" / "agents" / SEED / "auto.py").read_text() == (
        "print(2)"
    )


def test_shell_has_no_extra_network(tmp_path) -> None:
    root = tmp_path / "ws"
    root.mkdir()
    out = execute_tool("shell", '{"command": "curl https://example.com"}', root)
    assert "Error: shell has no network" in out
    assert "web_search" in out
    wget = execute_tool("shell", '{"command": "wget https://example.com"}', root)
    assert "Error: shell has no network" in wget
    env_out = execute_tool(
        "shell",
        '{"command": "printf %s \\"$SSH_AUTH_SOCK$DOCKER_HOST$HTTP_PROXY\\""}',
        root,
    )
    assert "SSH" not in env_out
    assert "docker" not in env_out.lower()
    assert "http://127.0.0.1:9" in env_out


def test_search_provider_is_configurable(monkeypatch) -> None:
    seen: list[str] = []

    async def fake_get(url: str, **_kwargs):
        seen.append(url)
        html = '<a href="https://example.com/hit">Configurable hit</a>'
        return 200, html, "text/html"

    monkeypatch.setattr("snorlax_runtime.tools.http_get", fake_get)
    configure_tools(
        search_provider="generic",
        search_url="https://search.test/find?q={query}",
    )
    try:
        assert search_request_url("hello world") == (
            "https://search.test/find?q=hello+world"
        )
        result = execute_tool("web_search", '{"query": "hello world"}', Path("/tmp"))
        assert seen == ["https://search.test/find?q=hello+world"]
        assert "Configurable hit" in result
        assert "example.com/hit" in result
    finally:
        configure_tools(search_provider="duckduckgo", search_url=None)


def test_default_search_url_is_overridable() -> None:
    configure_tools(search_provider="duckduckgo", search_url=None)
    assert "html.duckduckgo.com" in search_request_url("snorlax")
    configure_tools(
        search_provider="duckduckgo",
        search_url="https://alt.example/html/?q={query}",
    )
    try:
        assert search_request_url("snorlax") == "https://alt.example/html/?q=snorlax"
    finally:
        configure_tools(search_provider="duckduckgo", search_url=None)


def test_search_settings_come_from_env(monkeypatch) -> None:
    monkeypatch.setenv("SNORLAX_SEARCH_PROVIDER", "generic")
    monkeypatch.setenv(
        "SNORLAX_SEARCH_URL", "https://search.example/find?q={query}"
    )
    settings = Settings()
    assert settings.search_provider == "generic"
    assert settings.search_url == "https://search.example/find?q={query}"


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


def test_delete_agent_drops_workspace_dir(client, tmp_path) -> None:
    created = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Temp"}
    ).json()
    _send(
        client,
        created["id"],
        "Write a file named gone.txt containing bye",
    )
    root = tmp_path / "workspaces" / "agents" / created["id"]
    assert (root / "gone.txt").exists()
    deleted = client.delete(f"/v1/agents/{created['id']}", headers=AUTH)
    assert deleted.status_code == 204
    assert not root.exists()


def test_delete_channel_drops_workspace_dir(client, tmp_path) -> None:
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Room", "kind": "channel", "memberIds": [SEED]},
    ).json()
    patched = client.patch(
        f"/v1/agents/{created['id']}",
        headers=AUTH,
        json={"sharedProject": True},
    )
    assert patched.status_code == 200
    _send(
        client,
        created["id"],
        "Write a file named shared.txt containing room",
        mentions=[SEED],
    )
    root = tmp_path / "workspaces" / "channels" / created["id"]
    assert (root / "shared.txt").exists()
    deleted = client.delete(f"/v1/agents/{created['id']}", headers=AUTH)
    assert deleted.status_code == 204
    assert not root.exists()
    still_seed = client.get(f"/v1/agents/{CHANNEL}", headers=AUTH)
    assert still_seed.status_code == 200


def test_delete_seed_channel_drops_workspace_dir_no_reseed(client, tmp_path) -> None:
    patched = client.patch(
        f"/v1/agents/{CHANNEL}",
        headers=AUTH,
        json={"sharedProject": True},
    )
    assert patched.status_code == 200
    _send(
        client,
        CHANNEL,
        "Write a file named seed.txt containing seed",
        mentions=[SEED],
    )
    root = tmp_path / "workspaces" / "channels" / CHANNEL
    assert (root / "seed.txt").exists()
    deleted = client.delete(f"/v1/agents/{CHANNEL}", headers=AUTH)
    assert deleted.status_code == 204
    assert client.get(f"/v1/agents/{CHANNEL}", headers=AUTH).status_code == 404
    assert not root.exists()
    roster = client.get("/v1/agents", headers=AUTH).json()
    assert all(a["id"] != CHANNEL for a in roster)
    assert any(a["id"] == SEED for a in roster)


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
    events, content, _widget, _connect = await run_tool_loop(
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


@pytest.mark.asyncio
async def test_run_tool_loop_empty_after_failed_fetch_synthesizes_followup(
    tmp_path, monkeypatch
) -> None:
    monkeypatch.setattr("snorlax_runtime.tools.http_get", _failing_fetch)
    saved: list[dict] = []

    async def persist(content: str, message_id: str) -> dict:
        row = {
            "id": message_id,
            "kind": "tool",
            "content": content,
            "role": "assistant",
            "senderId": "a",
        }
        saved.append(row)
        return row

    workspace = tmp_path / "ws"
    workspace.mkdir()
    events, content, _widget, _connect = await run_tool_loop(
        _FetchThenEmpty(),
        [{"role": "user", "content": "fetch it"}],
        workspace=workspace,
        agent={"id": "a", "name": "A", "avatar": None},
        assistant_id="msg_follow",
        stream=True,
        persist_tool=persist,
    )
    assert saved
    assert saved[0]["kind"] == "tool"
    assert saved[0]["content"] == "web_fetch failed"
    assert any(n == "tool.done" and p["ok"] is False for n, p in events)
    assert any(n == "message.done" and p.get("kind") == "tool" for n, p in events)
    assert any(n == "message.delta" for n, _ in events)
    assert content.strip()
    assert "web_fetch" in content


@pytest.mark.asyncio
async def test_run_tool_loop_inference_error_after_tool_returns_followup(
    tmp_path,
) -> None:
    workspace = tmp_path / "ws"
    workspace.mkdir()
    events, content, _widget, _connect = await run_tool_loop(
        _ToolThenBoom(),
        [{"role": "user", "content": "list files"}],
        workspace=workspace,
        agent={"id": "a", "name": "A", "avatar": None},
        assistant_id="msg_err",
        stream=True,
    )
    assert any(n == "tool.done" for n, _ in events)
    assert not any(n == "error" for n, _ in events)
    assert any(n == "message.delta" for n, _ in events)
    assert "Inference failed" in content
    assert "model died after tools" in content


def test_workspace_for_channel_vs_agent(tmp_path) -> None:
    channel = {"id": "snorlax-bot-group", "kind": "channel"}
    agent = {"id": "snorlax-bot", "kind": "agent"}
    agent_root = (
        tmp_path / "workspaces" / "agents" / "snorlax-bot"
    ).resolve()
    channel_root = (
        tmp_path / "workspaces" / "channels" / "snorlax-bot-group"
    ).resolve()
    assert workspace_for(tmp_path, agent, "snorlax-bot") == agent_root
    assert workspace_for(tmp_path, channel, "snorlax-bot") == agent_root
    on = {**channel, "sharedProject": True}
    assert workspace_for(tmp_path, on, "snorlax-bot") == channel_root


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
