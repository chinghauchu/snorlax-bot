# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from snorlax_runtime.db import ALWAYS_PREAMBLE_TOOLS, Store, tools_preamble
from snorlax_runtime.skills import (
    SEED_MEMORY_SLUG,
    SEED_ROUTINES_SLUG,
    SEED_SKILL_MARKDOWN,
    SEED_TEAMMATES_SLUG,
    SKILL_FILENAME,
    copy_seed_skills_into_agent,
)
from snorlax_runtime.tools import offered_tool_definitions
from tests.conftest import AUTH, parse_sse

SEED = "snorlax-bot"
CHANNEL = "snorlax-bot-group"
SEED_SLUGS = (SEED_TEAMMATES_SLUG, SEED_ROUTINES_SLUG, SEED_MEMORY_SLUG)


def _send(client, dest: str, content: str):
    with client.stream(
        "POST",
        f"/v1/agents/{dest}/messages",
        headers=AUTH,
        json={"content": content},
    ) as response:
        body = "".join(response.iter_text())
        return response.status_code, parse_sse(body)


def _seed_skill_text(tmp_path: Path, slug: str) -> str:
    return (tmp_path / "skills" / slug / SKILL_FILENAME).read_text(encoding="utf-8")


def _copied_skill(tmp_path: Path, agent_id: str, slug: str) -> Path:
    return tmp_path / "workspaces" / "agents" / agent_id / slug / SKILL_FILENAME


def _assert_two_seed_copies(tmp_path: Path, agent_id: str) -> None:
    for slug in SEED_SLUGS:
        dest = _copied_skill(tmp_path, agent_id, slug)
        assert dest.is_file()
        assert dest.read_text(encoding="utf-8") == _seed_skill_text(tmp_path, slug)


def test_http_new_agent_copies_seed_skill_markdown(client, tmp_path: Path) -> None:
    created = client.post(
        "/v1/agents", headers=AUTH, json={"name": "New agent"}
    ).json()
    assert created["id"] == "new-agent"
    _assert_two_seed_copies(tmp_path, created["id"])
    listed = client.get(f"/v1/agents/{created['id']}/skills", headers=AUTH).json()
    ids = {row["id"] for row in listed}
    assert SEED_TEAMMATES_SLUG in ids
    assert SEED_ROUTINES_SLUG in ids
    assert SEED_MEMORY_SLUG in ids
    teammates = client.get(
        f"/v1/agents/{created['id']}/skills/{SEED_TEAMMATES_SLUG}", headers=AUTH
    ).json()
    assert "项目" in teammates["body"]
    assert "员工" in teammates["body"]
    assert "create_agent" in teammates["body"]
    assert "create_channel" in teammates["body"]
    routines = client.get(
        f"/v1/agents/{created['id']}/skills/{SEED_ROUTINES_SLUG}", headers=AUTH
    ).json()
    assert "定时" in routines["body"]
    assert "提醒" in routines["body"]
    assert "create_routine" in routines["body"]
    listed_ws = client.get(
        f"/v1/agents/{created['id']}/workspace", headers=AUTH
    ).json()
    names = {row["name"] for row in listed_ws["entries"]}
    assert SEED_TEAMMATES_SLUG in names
    assert SEED_ROUTINES_SLUG in names
    assert SEED_MEMORY_SLUG in names
    memory = client.get(
        f"/v1/agents/{created['id']}/skills/{SEED_MEMORY_SLUG}", headers=AUTH
    ).json()
    assert "记住" in memory["body"]
    assert "忘掉" in memory["body"]
    assert "remember" in memory["body"]
    assert "forget" in memory["body"]


def test_create_agent_tool_copies_seed_skill_markdown(client, tmp_path: Path) -> None:
    status, _events = _send(
        client, SEED, 'SNORLAX_TOOL create_agent {"name": "B"}'
    )
    assert status == 200
    _assert_two_seed_copies(tmp_path, "b")


def test_create_channel_does_not_copy_skills_into_a_workspace(
    client, tmp_path: Path
) -> None:
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Ops", "kind": "channel"},
    ).json()
    assert created["kind"] == "channel"
    agent_ws = tmp_path / "workspaces" / "agents" / created["id"]
    copied = list(agent_ws.rglob(SKILL_FILENAME)) if agent_ws.exists() else []
    assert copied == []
    channel_ws = tmp_path / "workspaces" / "channels" / created["id"]
    channel_copied = (
        list(channel_ws.rglob(SKILL_FILENAME)) if channel_ws.exists() else []
    )
    assert channel_copied == []
    seed_channel = tmp_path / "workspaces" / "channels" / CHANNEL
    assert (
        list(seed_channel.rglob(SKILL_FILENAME)) if seed_channel.exists() else []
    ) == []


def test_startup_backfill_copies_two_seed_skills_onto_seed_agent(
    client, tmp_path: Path
) -> None:
    _assert_two_seed_copies(tmp_path, SEED)
    listed = client.get(f"/v1/agents/{SEED}/workspace", headers=AUTH).json()
    names = {row["name"] for row in listed["entries"]}
    assert names == set(SEED_SKILL_MARKDOWN)


async def test_startup_backfill_fills_existing_agent_missing_copies(
    tmp_path: Path,
) -> None:
    store = Store(tmp_path)
    await store.connect()
    alice = await store.create_agent("Alice", "", "", None)
    dest = _copied_skill(tmp_path, alice["id"], SEED_TEAMMATES_SLUG)
    dest.unlink()
    dest.parent.rmdir()
    assert not dest.is_file()
    await store.close()
    again = Store(tmp_path)
    await again.connect()
    try:
        _assert_two_seed_copies(tmp_path, alice["id"])
        _assert_two_seed_copies(tmp_path, SEED)
        channel_ws = tmp_path / "workspaces" / "channels" / CHANNEL
        copied = (
            list(channel_ws.rglob(SKILL_FILENAME)) if channel_ws.exists() else []
        )
        assert copied == []
    finally:
        await again.close()


async def test_startup_backfill_is_missing_file_only(tmp_path: Path) -> None:
    store = Store(tmp_path)
    await store.connect()
    try:
        dest = _copied_skill(tmp_path, SEED, SEED_TEAMMATES_SLUG)
        dest.write_text("KEEP EXISTING\n", encoding="utf-8")
        copy_seed_skills_into_agent(tmp_path, SEED)
        assert dest.read_text(encoding="utf-8") == "KEEP EXISTING\n"
    finally:
        await store.close()
    again = Store(tmp_path)
    await again.connect()
    try:
        assert (
            _copied_skill(tmp_path, SEED, SEED_TEAMMATES_SLUG).read_text(
                encoding="utf-8"
            )
            == "KEEP EXISTING\n"
        )
        routines = _copied_skill(tmp_path, SEED, SEED_ROUTINES_SLUG)
        assert routines.is_file()
        assert routines.read_text(encoding="utf-8") == _seed_skill_text(
            tmp_path, SEED_ROUTINES_SLUG
        )
    finally:
        await again.close()


def test_workspace_skill_copies_are_isolated(client, tmp_path: Path) -> None:
    alice = client.post("/v1/agents", headers=AUTH, json={"name": "Alice"}).json()
    bob = client.post("/v1/agents", headers=AUTH, json={"name": "Bob"}).json()
    original = client.get(
        f"/v1/agents/{SEED}/skills/{SEED_TEAMMATES_SLUG}", headers=AUTH
    ).json()["body"]
    patched_body = original.replace(
        "Pick the matching built-in tool.",
        "Alice-only teammates recipe.",
    )
    patched = client.patch(
        f"/v1/agents/{alice['id']}/skills/{SEED_TEAMMATES_SLUG}",
        headers=AUTH,
        json={"name": "teammates", "body": patched_body},
    )
    assert patched.status_code == 200
    assert "Alice-only teammates recipe." in patched.json()["body"]
    bob_body = client.get(
        f"/v1/agents/{bob['id']}/skills/{SEED_TEAMMATES_SLUG}", headers=AUTH
    ).json()["body"]
    assert "Alice-only teammates recipe." not in bob_body
    alice_file = _copied_skill(tmp_path, alice["id"], SEED_TEAMMATES_SLUG)
    bob_file = _copied_skill(tmp_path, bob["id"], SEED_TEAMMATES_SLUG)
    assert "Alice-only teammates recipe." in alice_file.read_text(encoding="utf-8")
    assert "Alice-only teammates recipe." not in bob_file.read_text(
        encoding="utf-8"
    )
    secret = tmp_path / "workspaces" / "agents" / alice["id"] / "a-only.txt"
    secret.write_text("secret", encoding="utf-8")
    bob_ws = client.get(f"/v1/agents/{bob['id']}/workspace", headers=AUTH).json()
    bob_names = {row["name"] for row in bob_ws["entries"]}
    assert "a-only.txt" not in bob_names
    leaked = client.get(
        f"/v1/agents/{bob['id']}/workspace/file",
        headers=AUTH,
        params={"path": "a-only.txt"},
    )
    assert leaked.status_code == 404


def test_create_tools_are_always_in_preamble() -> None:
    text = tools_preamble()
    for name in ALWAYS_PREAMBLE_TOOLS:
        assert name in text
    names = {
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    }
    for name in ALWAYS_PREAMBLE_TOOLS:
        assert name in names
    off = offered_tool_definitions(use_tools=False)
    off_names = {
        (row.get("function") or {}).get("name") or "" for row in off
    }
    assert "create_agent" not in off_names


async def test_create_tools_are_not_skill_gated(client, tmp_path: Path) -> None:
    created = client.post("/v1/agents", headers=AUTH, json={"name": "Bare"}).json()
    import shutil

    shutil.rmtree(tmp_path / "skills", ignore_errors=True)
    shutil.rmtree(
        tmp_path / "workspaces" / "agents" / created["id"], ignore_errors=True
    )
    listed = client.get(f"/v1/agents/{created['id']}/skills", headers=AUTH).json()
    assert listed == []
    store = client.app.state.store
    messages = await store.inference_transcript(
        created["id"], for_agent_id=created["id"]
    )
    system = messages[0]["content"]
    for name in ("create_agent", "create_channel", "create_routine"):
        assert name in system
    for name in ("pause_routine", "delete_routine", "remember", "forget"):
        assert name in system
    offered = {
        (row.get("function") or {}).get("name") or ""
        for row in offered_tool_definitions()
    }
    assert "create_agent" in offered
    assert "create_channel" in offered
    assert "create_routine" in offered
