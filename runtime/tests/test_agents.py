# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import pytest

from fastapi.testclient import TestClient

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings
from snorlax_runtime.db import Store
from tests.conftest import AUTH, TOKEN


def test_seeded_agent_present(client) -> None:
    response = client.get("/v1/agents", headers=AUTH)
    assert response.status_code == 200
    agents = response.json()
    assert isinstance(agents, list)
    snorlax = next(a for a in agents if a["id"] == "snorlax-bot")
    assert snorlax["name"] == "Snorlax"
    assert snorlax["title"] == "Assistant"
    assert snorlax["kind"] == "agent"
    channel = next(a for a in agents if a["id"] == "snorlax-bot-group")
    assert channel["name"] == "Snorlax-Bot"
    assert channel["kind"] == "channel"
    assert snorlax["name"] != channel["name"]
    assert snorlax["avatar"] is None
    assert snorlax["kind"] == "agent"
    assert snorlax["memberIds"] == []
    assert "description" in snorlax
    assert "instructions" not in snorlax
    assert "createdAt" in snorlax
    assert "updatedAt" in snorlax


def test_create_and_get_agent(client) -> None:
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={
            "name": "Inbox",
            "title": "Mail",
            "description": "Handle mail.",
            "avatar": None,
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["id"] == "inbox"
    assert body["title"] == "Mail"
    assert body["description"] == "Handle mail."
    fetched = client.get(f"/v1/agents/{body['id']}", headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.json()["description"] == "Handle mail."


def test_post_defaults_name_new_agent(client) -> None:
    created = client.post("/v1/agents", headers=AUTH, json={})
    assert created.status_code == 201
    assert created.json()["name"] == "New agent"
    assert created.json()["id"] == "new-agent"


def test_patch_profile_fields(client) -> None:
    client.post("/v1/agents", headers=AUTH, json={"name": "Ops"})
    patched = client.patch(
        "/v1/agents/ops",
        headers=AUTH,
        json={"title": "Ops", "description": "Keep the lights on.", "avatar": None},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["description"] == "Keep the lights on."
    assert body["name"] == "Ops"
    assert body["title"] == "Ops"
    assert body["avatar"] is None


def test_delete_seeded_agent_is_204_and_gone(client) -> None:
    response = client.delete("/v1/agents/snorlax-bot", headers=AUTH)
    assert response.status_code == 204
    missing = client.get("/v1/agents/snorlax-bot", headers=AUTH)
    assert missing.status_code == 404
    roster = client.get("/v1/agents", headers=AUTH).json()
    assert all(a["id"] != "snorlax-bot" for a in roster)
    channel = next(a for a in roster if a["id"] == "snorlax-bot-group")
    assert channel["kind"] == "channel"
    assert "snorlax-bot" not in channel["memberIds"]


def test_delete_seed_does_not_reseed_on_runtime_restart(tmp_path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        token=TOKEN,
        bind="127.0.0.1",
        inference_backend="mock",
        port=8787,
    )
    with TestClient(create_app(settings)) as client:
        deleted = client.delete("/v1/agents/snorlax-bot", headers=AUTH)
        assert deleted.status_code == 204
        roster = client.get("/v1/agents", headers=AUTH).json()
        assert [a["id"] for a in roster] == ["snorlax-bot-group"]
    with TestClient(create_app(settings)) as client:
        roster = client.get("/v1/agents", headers=AUTH).json()
        ids = [a["id"] for a in roster]
        assert "snorlax-bot" not in ids
        assert ids == ["snorlax-bot-group"]
        missing = client.get("/v1/agents/snorlax-bot", headers=AUTH)
        assert missing.status_code == 404


def test_patch_seed_identity(client) -> None:
    patched = client.patch(
        "/v1/agents/snorlax-bot",
        headers=AUTH,
        json={
            "name": "Sleepy",
            "title": "Nap lead",
            "description": "Dreams in tokens.",
            "avatar": None,
        },
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["id"] == "snorlax-bot"
    assert body["name"] == "Sleepy"
    assert body["title"] == "Nap lead"
    assert body["description"] == "Dreams in tokens."
    assert body["avatar"] is None
    fetched = client.get("/v1/agents/snorlax-bot", headers=AUTH).json()
    assert fetched["name"] == "Sleepy"
    assert fetched["title"] == "Nap lead"


def test_cannot_patch_seeded_channel(client) -> None:
    response = client.patch(
        "/v1/agents/snorlax-bot-group",
        headers=AUTH,
        json={"name": "Nope"},
    )
    assert response.status_code == 409
    assert response.json() == {"error": "seeded channel cannot be patched"}
    still = client.get("/v1/agents/snorlax-bot-group", headers=AUTH).json()
    assert still["name"] == "Snorlax-Bot"


def test_cannot_delete_seeded_channel(client) -> None:
    response = client.delete("/v1/agents/snorlax-bot-group", headers=AUTH)
    assert response.status_code == 409
    assert response.json() == {"error": "seeded channel cannot be deleted"}
    still = client.get("/v1/agents/snorlax-bot-group", headers=AUTH)
    assert still.status_code == 200


def test_create_and_delete_user_channel(client) -> None:
    alice = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Alice"}
    ).json()
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={
            "name": "Project",
            "kind": "channel",
            "memberIds": ["snorlax-bot", alice["id"]],
        },
    )
    assert created.status_code == 201
    body = created.json()
    assert body["kind"] == "channel"
    assert body["name"] == "Project"
    assert body["id"] == "project"
    assert body["memberIds"] == ["snorlax-bot", alice["id"]]
    roster = client.get("/v1/agents", headers=AUTH).json()
    channels = [a for a in roster if a["kind"] == "channel"]
    assert {c["id"] for c in channels} == {"snorlax-bot-group", "project"}
    seed = next(c for c in channels if c["id"] == "snorlax-bot-group")
    assert alice["id"] in seed["memberIds"]

    missing_member = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Ghost room", "kind": "channel", "memberIds": ["nope"]},
    )
    assert missing_member.status_code == 422

    deleted = client.delete(f"/v1/agents/{body['id']}", headers=AUTH)
    assert deleted.status_code == 204
    missing = client.get(f"/v1/agents/{body['id']}", headers=AUTH)
    assert missing.status_code == 404
    seed_blocked = client.delete("/v1/agents/snorlax-bot-group", headers=AUTH)
    assert seed_blocked.status_code == 409


def test_create_channel_requires_name(client) -> None:
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"kind": "channel"},
    )
    assert created.status_code == 422
    assert "name" in created.json()["error"].lower()


def test_create_channel_omitted_members_snapshots_agents(client) -> None:
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"kind": "channel", "name": "Ops"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Ops"
    assert body["kind"] == "channel"
    assert "snorlax-bot" in body["memberIds"]
    assert body["id"] != "snorlax-bot-group"


def test_channel_id_in_member_ids_is_422(client) -> None:
    response = client.post(
        "/v1/agents",
        headers=AUTH,
        json={
            "name": "Bad room",
            "kind": "channel",
            "memberIds": ["snorlax-bot-group"],
        },
    )
    assert response.status_code == 422


def test_patch_user_channel_name_and_members(client) -> None:
    alice = client.post(
        "/v1/agents", headers=AUTH, json={"name": "Alice"}
    ).json()
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={
            "name": "Project",
            "kind": "channel",
            "memberIds": ["snorlax-bot", alice["id"]],
        },
    )
    assert created.status_code == 201
    channel_id = created.json()["id"]
    patched = client.patch(
        f"/v1/agents/{channel_id}",
        headers=AUTH,
        json={"name": "Ops", "memberIds": [alice["id"]]},
    )
    assert patched.status_code == 200
    body = patched.json()
    assert body["name"] == "Ops"
    assert body["memberIds"] == [alice["id"]]
    seed = client.patch(
        "/v1/agents/snorlax-bot-group",
        headers=AUTH,
        json={"name": "Nope", "memberIds": [alice["id"]]},
    )
    assert seed.status_code == 409
    unknown = client.patch(
        f"/v1/agents/{channel_id}",
        headers=AUTH,
        json={"memberIds": ["nope"]},
    )
    assert unknown.status_code == 422
    as_channel = client.patch(
        f"/v1/agents/{channel_id}",
        headers=AUTH,
        json={"memberIds": ["snorlax-bot-group"]},
    )
    assert as_channel.status_code == 422


def test_patch_avatar_null_clears(client) -> None:
    set_avatar = client.patch(
        "/v1/agents/snorlax-bot",
        headers=AUTH,
        json={"avatar": "/v1/images/img_existing"},
    )
    assert set_avatar.status_code == 200
    assert set_avatar.json()["avatar"] == "/v1/images/img_existing"
    cleared = client.patch(
        "/v1/agents/snorlax-bot",
        headers=AUTH,
        json={"avatar": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["avatar"] is None


def test_delete_custom_agent(client) -> None:
    created = client.post("/v1/agents", headers=AUTH, json={"name": "Temp"})
    assert created.status_code == 201
    agent_id = created.json()["id"]
    deleted = client.delete(f"/v1/agents/{agent_id}", headers=AUTH)
    assert deleted.status_code == 204
    missing = client.get(f"/v1/agents/{agent_id}", headers=AUTH)
    assert missing.status_code == 404
    assert "error" in missing.json()
    assert isinstance(missing.json()["error"], str)
    roster = client.get("/v1/agents", headers=AUTH).json()
    assert all(a["id"] != agent_id for a in roster)


def test_slug_collision(client) -> None:
    first = client.post("/v1/agents", headers=AUTH, json={"name": "Research"})
    second = client.post("/v1/agents", headers=AUTH, json={"name": "Research"})
    assert first.json()["id"] == "research"
    assert second.json()["id"] == "research-2"


@pytest.mark.asyncio
async def test_does_not_reseed_if_roster_not_empty(tmp_path) -> None:
    store = Store(tmp_path)
    await store.connect()
    await store.create_agent("Inbox", "Mail", "", None)
    assert await store.delete_agent("snorlax-bot")
    await store.close()

    again = Store(tmp_path)
    await again.connect()
    assert await again.get_agent("snorlax-bot") is None
    assert await again.get_agent("inbox") is not None
    await again.close()


@pytest.mark.asyncio
async def test_delete_seed_does_not_reseed_when_only_channel_remains(
    tmp_path,
) -> None:
    store = Store(tmp_path)
    await store.connect()
    assert await store.delete_agent("snorlax-bot")
    await store.close()

    again = Store(tmp_path)
    await again.connect()
    assert await again.get_agent("snorlax-bot") is None
    channel = await again.get_agent("snorlax-bot-group")
    assert channel is not None
    assert channel["kind"] == "channel"
    assert channel["memberIds"] == []
    await again.close()


@pytest.mark.asyncio
async def test_seed_identity_patch_survives_reconnect(tmp_path) -> None:
    store = Store(tmp_path)
    await store.connect()
    updated = await store.patch_agent(
        "snorlax-bot",
        name="Sleepy",
        title="Nap lead",
        description="Dreams in tokens.",
        avatar=None,
    )
    assert updated is not None
    assert updated["name"] == "Sleepy"
    await store.close()

    again = Store(tmp_path)
    await again.connect()
    seed = await again.get_agent("snorlax-bot")
    assert seed is not None
    assert seed["name"] == "Sleepy"
    assert seed["title"] == "Nap lead"
    assert seed["description"] == "Dreams in tokens."
    channel = await again.get_agent("snorlax-bot-group")
    assert channel is not None
    assert channel["name"] == "Snorlax-Bot"
    await again.close()


@pytest.mark.asyncio
async def test_one_to_one_list_filters_peer_rows(tmp_path) -> None:
    store = Store(tmp_path)
    await store.connect()
    alice = await store.create_agent("Alice", "", "", None)
    await store.add_message(agent_id=alice["id"], role="user", content="hi @Bob")
    await store.add_message(
        agent_id=alice["id"],
        role="assistant",
        content="from Alice: hi @Bob",
        sender_id="bob",
        sender_name="Bob",
    )
    await store.add_message(
        agent_id=alice["id"],
        role="assistant",
        content="On it.",
        sender_id=alice["id"],
        sender_name="Alice",
    )
    listed = await store.list_messages(alice["id"], limit=100, before=None)
    assert [m["senderId"] for m in listed] == ["user", alice["id"]]
    await store.add_message(
        agent_id="snorlax-bot-group",
        role="assistant",
        content="from Alice: hi @Bob",
        sender_id=alice["id"],
        sender_name="Alice",
    )
    channel = await store.list_messages("snorlax-bot-group", limit=100, before=None)
    assert any(m["senderId"] == alice["id"] for m in channel)
    await store.close()
