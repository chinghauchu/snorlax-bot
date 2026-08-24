# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from tests.conftest import AUTH


def test_seeded_agent_present(client) -> None:
    response = client.get("/v1/agents", headers=AUTH)
    assert response.status_code == 200
    agents = response.json()["agents"]
    assert any(a["id"] == "snorlax-bot" for a in agents)
    snorlax = next(a for a in agents if a["id"] == "snorlax-bot")
    assert snorlax["name"] == "Snorlax"


def test_create_and_get_agent(client) -> None:
    created = client.post(
        "/v1/agents",
        headers=AUTH,
        json={"name": "Inbox", "instructions": "Handle mail."},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["id"] == "inbox"
    fetched = client.get(f"/v1/agents/{body['id']}", headers=AUTH)
    assert fetched.status_code == 200
    assert fetched.json()["instructions"] == "Handle mail."


def test_patch_agent(client) -> None:
    client.post("/v1/agents", headers=AUTH, json={"name": "Ops"})
    patched = client.patch(
        "/v1/agents/ops",
        headers=AUTH,
        json={"instructions": "Keep the lights on."},
    )
    assert patched.status_code == 200
    assert patched.json()["instructions"] == "Keep the lights on."
    assert patched.json()["name"] == "Ops"


def test_cannot_delete_seeded_agent(client) -> None:
    response = client.delete("/v1/agents/snorlax-bot", headers=AUTH)
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "seeded_agent"
    still = client.get("/v1/agents/snorlax-bot", headers=AUTH)
    assert still.status_code == 200


def test_delete_custom_agent(client) -> None:
    client.post("/v1/agents", headers=AUTH, json={"name": "Temp"})
    deleted = client.delete("/v1/agents/temp", headers=AUTH)
    assert deleted.status_code == 204
    missing = client.get("/v1/agents/temp", headers=AUTH)
    assert missing.status_code == 404


def test_slug_collision(client) -> None:
    first = client.post("/v1/agents", headers=AUTH, json={"name": "Research"})
    second = client.post("/v1/agents", headers=AUTH, json={"name": "Research"})
    assert first.json()["id"] == "research"
    assert second.json()["id"] == "research-2"
