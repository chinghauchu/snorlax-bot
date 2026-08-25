# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import pytest

from snorlax_runtime.db import Store
from tests.conftest import AUTH


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


def test_cannot_delete_seeded_agent(client) -> None:
    response = client.delete("/v1/agents/snorlax-bot", headers=AUTH)
    assert response.status_code == 409
    assert response.json() == {"error": "seeded agent cannot be deleted"}
    still = client.get("/v1/agents/snorlax-bot", headers=AUTH)
    assert still.status_code == 200


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
