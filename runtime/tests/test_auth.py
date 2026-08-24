# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from snorlax_runtime.config import resolve_bind_host


def test_bind_localhost_until_token_exists() -> None:
    assert resolve_bind_host(token_exists=False, override=None) == "127.0.0.1"
    assert resolve_bind_host(token_exists=True, override=None) == "0.0.0.0"
    assert (
        resolve_bind_host(token_exists=True, override="127.0.0.1") == "127.0.0.1"
    )


def test_health_no_auth(client) -> None:
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


def test_v1_requires_bearer(client) -> None:
    response = client.get("/v1/agents")
    assert response.status_code == 401
    assert response.json()["error"]["code"] == "unauthorized"


def test_v1_rejects_bad_token(client) -> None:
    response = client.get(
        "/v1/agents", headers={"Authorization": "Bearer nope"}
    )
    assert response.status_code == 401


def test_runtime_health(client) -> None:
    from tests.conftest import AUTH

    response = client.get("/v1/health", headers=AUTH)
    assert response.status_code == 200
    body = response.json()
    assert body["seeded_agent_id"] == "snorlax-bot"
    assert body["inference_backend"] == "mock"
