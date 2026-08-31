# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from snorlax_runtime.db import ALWAYS_PREAMBLE_TOOLS, Store, tools_preamble
from snorlax_runtime.memory import (
    ERR_FULL,
    ERR_MISSING_FACT,
    ERR_NO_MATCH,
    MAX_FACTS,
    MEMORY_DIRNAME,
    MEMORY_FILENAME,
    forget_fact,
    load_facts,
    memory_dir,
    memory_path,
    remember_fact,
)
from snorlax_runtime.skills import SEED_MEMORY_SLUG, SKILL_FILENAME
from snorlax_runtime.tools import done_summary, execute_tool, offered_tool_definitions
from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"
FACT = "The user's name is Alex."
OTHER = "They prefer Asia/Taipei."


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
        return response.status_code, parse_sse(body)


def _msgs(client, dest: str) -> list[dict]:
    return client.get(f"/v1/agents/{dest}/messages", headers=AUTH).json()


def _tool_dones(events: list[tuple[str, dict]], name: str) -> list[dict]:
    return [
        p
        for n, p in events
        if n == "tool.done" and p.get("name") == name
    ]


def test_remember_forget_are_offered() -> None:
    names = {
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    }
    assert "remember" in names
    assert "forget" in names
    text = tools_preamble()
    assert "remember" in text
    assert "forget" in text
    assert "记住" in text
    assert "忘掉" in text
    for name in ("remember", "forget"):
        assert name in ALWAYS_PREAMBLE_TOOLS


def test_done_summary_remember_forget_never_paints_fact() -> None:
    assert done_summary("remember", {"fact": FACT}, True, "Remembered") == "Remembered"
    assert done_summary("forget", {"fact": FACT}, True, "Forgot") == "Forgot"
    assert FACT not in done_summary("remember", {"fact": FACT}, True, "Remembered")
    assert (
        done_summary("remember", {"fact": FACT}, False, ERR_MISSING_FACT)
        == "remember failed"
    )
    assert (
        done_summary("forget", {"fact": FACT}, False, ERR_NO_MATCH)
        == "forget failed"
    )


def test_remember_persists_outside_sandbox_and_kind_tool_line(
    client, tmp_path: Path
) -> None:
    status, events = _send(
        client, SEED, f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}'
    )
    assert status == 200
    dones = _tool_dones(events, "remember")
    assert dones
    assert dones[0]["ok"] is True
    assert dones[0]["summary"] == "Remembered"
    assert FACT not in dones[0]["summary"]
    assert dones[0]["name"] == "remember"
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools[-1]["content"] == "Remembered"
    assert FACT not in tools[-1]["content"]
    assert tools[-1]["senderId"] == SEED
    assert tools[-1].get("widget") is None
    path = memory_path(tmp_path, SEED)
    assert path.is_file()
    assert path == tmp_path / MEMORY_DIRNAME / SEED / MEMORY_FILENAME
    assert "workspaces" not in str(path.relative_to(tmp_path))
    text = path.read_text(encoding="utf-8")
    assert FACT in text
    assert text.strip().startswith("- ")
    assert load_facts(tmp_path, SEED) == [FACT]
    ws = tmp_path / "workspaces" / "agents" / SEED / MEMORY_FILENAME
    assert not ws.is_file()
    listed = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH).json()
    names = {row["name"] for row in listed["entries"]}
    assert MEMORY_FILENAME not in names
    skill_mem = tmp_path / "workspaces" / "agents" / SEED / "memory" / SKILL_FILENAME
    assert skill_mem.is_file()
    assert not (
        tmp_path / "workspaces" / "agents" / SEED / "memory" / MEMORY_FILENAME
    ).is_file()


async def test_remember_injects_into_system_prompt(client) -> None:
    _send(client, SEED, f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}')
    store = client.app.state.store
    messages = await store.inference_transcript(SEED, for_agent_id=SEED)
    system = messages[0]["content"]
    assert "### Memory" in system
    assert FACT in system
    assert "remember" in system
    assert "forget" in system


async def test_facts_survive_runtime_restart(tmp_path: Path) -> None:
    store = Store(tmp_path)
    await store.connect()
    try:
        assert remember_fact(tmp_path, SEED, FACT) == "Remembered"
        assert remember_fact(tmp_path, SEED, OTHER) == "Remembered"
    finally:
        await store.close()

    again = Store(tmp_path)
    await again.connect()
    try:
        assert load_facts(tmp_path, SEED) == [FACT, OTHER]
        messages = await again.inference_transcript(SEED, for_agent_id=SEED)
        system = messages[0]["content"]
        assert "### Memory" in system
        assert FACT in system
        assert OTHER in system
    finally:
        await again.close()


async def test_forget_removes_fact_from_disk_and_prompt(
    client, tmp_path: Path
) -> None:
    _send(client, SEED, f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}')
    _send(client, SEED, f'SNORLAX_TOOL remember {{"fact": "{OTHER}"}}')
    status, events = _send(
        client, SEED, f'SNORLAX_TOOL forget {{"fact": "{FACT}"}}'
    )
    assert status == 200
    dones = _tool_dones(events, "forget")
    assert dones
    assert dones[0]["ok"] is True
    assert dones[0]["summary"] == "Forgot"
    assert FACT not in dones[0]["summary"]
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools[-1]["content"] == "Forgot"
    assert FACT not in tools[-1]["content"]
    assert load_facts(tmp_path, SEED) == [OTHER]
    store = client.app.state.store
    system = (await store.inference_transcript(SEED, for_agent_id=SEED))[0][
        "content"
    ]
    assert FACT not in system
    assert OTHER in system


def test_forget_casefold_match_and_missing(client, tmp_path: Path) -> None:
    _send(client, SEED, f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}')
    status, events = _send(
        client, SEED, f'SNORLAX_TOOL forget {{"fact": "{FACT.lower()}"}}'
    )
    assert status == 200
    assert _tool_dones(events, "forget")[0]["ok"] is True
    assert _tool_dones(events, "forget")[0]["summary"] == "Forgot"
    assert load_facts(tmp_path, SEED) == []
    status, events = _send(
        client, SEED, f'SNORLAX_TOOL forget {{"fact": "{FACT}"}}'
    )
    assert status == 200
    dones = _tool_dones(events, "forget")
    assert dones[0]["ok"] is False
    assert dones[0]["summary"] == "forget failed"
    tools = [m for m in _msgs(client, SEED) if m.get("kind") == "tool"]
    assert tools[-1]["content"] == "forget failed"


async def test_remember_empty_fact_is_tool_error_not_422(
    client, tmp_path: Path
) -> None:
    status, events = _send(client, SEED, 'SNORLAX_TOOL remember {"fact": "  "}')
    assert status == 200
    dones = _tool_dones(events, "remember")
    assert dones[0]["ok"] is False
    assert dones[0]["summary"] == "remember failed"
    assert not memory_path(tmp_path, SEED).is_file()
    store = client.app.state.store
    system = (await store.inference_transcript(SEED, for_agent_id=SEED))[0][
        "content"
    ]
    assert "### Memory" not in system


async def test_memory_is_isolated_per_agent(client, tmp_path: Path) -> None:
    alice = client.post("/v1/agents", headers=AUTH, json={"name": "Alice"}).json()
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    _send(
        client,
        alice["id"],
        f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}',
    )
    _send(
        client,
        bob["id"],
        'SNORLAX_TOOL remember {"fact": "Bob only: ship Friday."}',
    )
    assert load_facts(tmp_path, alice["id"]) == [FACT]
    assert load_facts(tmp_path, bob["id"]) == ["Bob only: ship Friday."]
    assert FACT not in load_facts(tmp_path, bob["id"])
    store = client.app.state.store
    alice_sys = (
        await store.inference_transcript(alice["id"], for_agent_id=alice["id"])
    )[0]["content"]
    bob_sys = (
        await store.inference_transcript(bob["id"], for_agent_id=bob["id"])
    )[0]["content"]
    seed_sys = (await store.inference_transcript(SEED, for_agent_id=SEED))[0][
        "content"
    ]
    assert FACT in alice_sys
    assert FACT not in bob_sys
    assert FACT not in seed_sys
    assert "Bob only: ship Friday." in bob_sys
    assert "Bob only: ship Friday." not in alice_sys
    assert not memory_path(tmp_path, SEED).is_file()


async def test_channel_remember_writes_speaker_file_not_channel_store(
    client, tmp_path: Path
) -> None:
    alice = client.post("/v1/agents", headers=AUTH, json={"name": "Alice"}).json()
    status, events = _send(
        client,
        CHANNEL,
        f'@Snorlax SNORLAX_TOOL remember {{"fact": "{FACT}"}}',
        mentions=[SEED],
    )
    assert status == 200
    dones = _tool_dones(events, "remember")
    assert dones
    assert dones[0]["ok"] is True
    assert dones[0]["summary"] == "Remembered"
    assert FACT not in dones[0]["summary"]
    assert not (tmp_path / MEMORY_DIRNAME / CHANNEL).exists()
    assert not (
        tmp_path / "workspaces" / "channels" / CHANNEL / MEMORY_FILENAME
    ).is_file()
    assert load_facts(tmp_path, SEED) == [FACT]
    assert load_facts(tmp_path, alice["id"]) == []
    store = client.app.state.store
    channel_as_seed = await store.inference_transcript(
        CHANNEL, for_agent_id=SEED
    )
    channel_as_alice = await store.inference_transcript(
        CHANNEL, for_agent_id=alice["id"]
    )
    assert FACT in channel_as_seed[0]["content"]
    assert FACT not in channel_as_alice[0]["content"]
    seed_sys = (await store.inference_transcript(SEED, for_agent_id=SEED))[0][
        "content"
    ]
    assert FACT in seed_sys


def test_delete_agent_drops_memory_dir(client, tmp_path: Path) -> None:
    created = client.post("/v1/agents", headers=AUTH, json={"name": "Temp"}).json()
    _send(
        client,
        created["id"],
        f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}',
    )
    path = memory_path(tmp_path, created["id"])
    root = memory_dir(tmp_path, created["id"])
    assert path.is_file()
    deleted = client.delete(f"/v1/agents/{created['id']}", headers=AUTH)
    assert deleted.status_code == 204
    assert not path.is_file()
    assert not root.exists()


def test_duplicate_remember_is_noop_still_remembered(
    client, tmp_path: Path
) -> None:
    _send(client, SEED, f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}')
    status, events = _send(
        client, SEED, f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}'
    )
    assert status == 200
    dones = _tool_dones(events, "remember")
    assert dones[0]["ok"] is True
    assert dones[0]["summary"] == "Remembered"
    assert load_facts(tmp_path, SEED) == [FACT]


def test_memory_cap_32_then_full_error(tmp_path: Path) -> None:
    for i in range(MAX_FACTS):
        assert remember_fact(tmp_path, SEED, f"Fact number {i}.") == "Remembered"
    assert len(load_facts(tmp_path, SEED)) == MAX_FACTS
    assert remember_fact(tmp_path, SEED, "One more sentence.") == ERR_FULL
    assert len(load_facts(tmp_path, SEED)) == MAX_FACTS


def test_sandbox_tools_cannot_reach_memory_dir(tmp_path: Path) -> None:
    remember_fact(tmp_path, SEED, FACT)
    workspace = tmp_path / "workspaces" / "agents" / SEED
    workspace.mkdir(parents=True, exist_ok=True)
    leaked = execute_tool(
        "read_file",
        '{"path": "../../memory/snorlax-bot/MEMORY.md"}',
        workspace,
    )
    assert leaked.startswith("Error:")
    execute_tool(
        "write_file",
        '{"path": "../../memory/snorlax-bot/pwned.md", "content": "nope"}',
        workspace,
    )
    assert not (tmp_path / MEMORY_DIRNAME / SEED / "pwned.md").exists()
    assert load_facts(tmp_path, SEED) == [FACT]


def test_seed_memory_skill_maps_remember_forget(client, tmp_path: Path) -> None:
    listed = client.get(f"/v1/agents/{SEED}/skills", headers=AUTH).json()
    ids = {row["id"] for row in listed}
    assert SEED_MEMORY_SLUG in ids
    body = client.get(
        f"/v1/agents/{SEED}/skills/{SEED_MEMORY_SLUG}", headers=AUTH
    ).json()
    text = body["body"]
    assert "remember" in text
    assert "forget" in text
    assert "记住" in text
    assert "忘掉" in text
    dest = (
        tmp_path / "workspaces" / "agents" / SEED / SEED_MEMORY_SLUG / SKILL_FILENAME
    )
    assert dest.is_file()
    global_skill = tmp_path / "skills" / SEED_MEMORY_SLUG / SKILL_FILENAME
    assert global_skill.is_file()


async def test_remember_forget_are_not_skill_gated(
    client, tmp_path: Path
) -> None:
    created = client.post("/v1/agents", headers=AUTH, json={"name": "Bare"}).json()
    import shutil

    shutil.rmtree(tmp_path / "skills", ignore_errors=True)
    shutil.rmtree(
        tmp_path / "workspaces" / "agents" / created["id"], ignore_errors=True
    )
    store = client.app.state.store
    system = (
        await store.inference_transcript(
            created["id"], for_agent_id=created["id"]
        )
    )[0]["content"]
    assert "remember" in system
    assert "forget" in system
    offered = {
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    }
    assert "remember" in offered
    assert "forget" in offered
    status, events = _send(
        client,
        created["id"],
        f'SNORLAX_TOOL remember {{"fact": "{FACT}"}}',
    )
    assert status == 200
    assert _tool_dones(events, "remember")[0]["ok"] is True
    assert load_facts(tmp_path, created["id"]) == [FACT]


async def test_forget_fact_helper_exact_then_gone(tmp_path: Path) -> None:
    store = Store(tmp_path)
    await store.connect()
    try:
        remember_fact(tmp_path, SEED, FACT)
        remember_fact(tmp_path, SEED, OTHER)
        assert forget_fact(tmp_path, SEED, FACT) == "Forgot"
        assert load_facts(tmp_path, SEED) == [OTHER]
        assert forget_fact(tmp_path, SEED, FACT) == ERR_NO_MATCH
    finally:
        await store.close()


def test_get_memory_lists_facts_empty_is_array(client, tmp_path: Path) -> None:
    empty = client.get(f"/v1/agents/{SEED}/memory", headers=AUTH)
    assert empty.status_code == 200
    assert empty.json() == {"facts": []}
    remember_fact(tmp_path, SEED, FACT)
    remember_fact(tmp_path, SEED, OTHER)
    listed = client.get(f"/v1/agents/{SEED}/memory", headers=AUTH)
    assert listed.status_code == 200
    assert listed.json() == {"facts": [FACT, OTHER]}


def test_delete_memory_wraps_exact_forget(client, tmp_path: Path) -> None:
    remember_fact(tmp_path, SEED, FACT)
    remember_fact(tmp_path, SEED, OTHER)
    deleted = client.request(
        "DELETE",
        f"/v1/agents/{SEED}/memory",
        headers=AUTH,
        json={"fact": FACT},
    )
    assert deleted.status_code == 204
    assert load_facts(tmp_path, SEED) == [OTHER]
    listed = client.get(f"/v1/agents/{SEED}/memory", headers=AUTH)
    assert listed.json() == {"facts": [OTHER]}


def test_delete_memory_casefold_then_unknown_is_404(
    client, tmp_path: Path
) -> None:
    remember_fact(tmp_path, SEED, FACT)
    folded = client.request(
        "DELETE",
        f"/v1/agents/{SEED}/memory",
        headers=AUTH,
        json={"fact": FACT.lower()},
    )
    assert folded.status_code == 204
    assert load_facts(tmp_path, SEED) == []
    missing = client.request(
        "DELETE",
        f"/v1/agents/{SEED}/memory",
        headers=AUTH,
        json={"fact": FACT},
    )
    assert missing.status_code == 404
    assert missing.json()["error"] == ERR_NO_MATCH


def test_delete_memory_empty_fact_is_422(client) -> None:
    blank = client.request(
        "DELETE",
        f"/v1/agents/{SEED}/memory",
        headers=AUTH,
        json={"fact": "  "},
    )
    assert blank.status_code == 422
    assert blank.json()["error"] == ERR_MISSING_FACT


def test_memory_http_is_isolated_and_channel_is_409(
    client, tmp_path: Path
) -> None:
    alice = client.post("/v1/agents", headers=AUTH, json={"name": "Alice"}).json()
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    remember_fact(tmp_path, alice["id"], FACT)
    remember_fact(tmp_path, bob["id"], "Bob only: ship Friday.")
    alice_list = client.get(f"/v1/agents/{alice['id']}/memory", headers=AUTH)
    bob_list = client.get(f"/v1/agents/{bob['id']}/memory", headers=AUTH)
    seed_list = client.get(f"/v1/agents/{SEED}/memory", headers=AUTH)
    assert alice_list.json() == {"facts": [FACT]}
    assert bob_list.json() == {"facts": ["Bob only: ship Friday."]}
    assert seed_list.json() == {"facts": []}
    dropped = client.request(
        "DELETE",
        f"/v1/agents/{alice['id']}/memory",
        headers=AUTH,
        json={"fact": FACT},
    )
    assert dropped.status_code == 204
    assert load_facts(tmp_path, alice["id"]) == []
    assert load_facts(tmp_path, bob["id"]) == ["Bob only: ship Friday."]
    channel_get = client.get(f"/v1/agents/{CHANNEL}/memory", headers=AUTH)
    assert channel_get.status_code == 409
    channel_del = client.request(
        "DELETE",
        f"/v1/agents/{CHANNEL}/memory",
        headers=AUTH,
        json={"fact": FACT},
    )
    assert channel_del.status_code == 409
    missing_agent = client.get("/v1/agents/no-such/memory", headers=AUTH)
    assert missing_agent.status_code == 404
    missing_del = client.request(
        "DELETE",
        "/v1/agents/no-such/memory",
        headers=AUTH,
        json={"fact": FACT},
    )
    assert missing_del.status_code == 404
