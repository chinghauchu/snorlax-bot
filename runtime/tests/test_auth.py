# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from fastapi.testclient import TestClient

from snorlax_runtime.app import create_app
from snorlax_runtime.config import Settings, resolve_bind_host
from snorlax_runtime.token import read_token_file


def test_bind_localhost_until_token_exists() -> None:
    assert resolve_bind_host(token_exists=False, override=None) == "127.0.0.1"
    assert resolve_bind_host(token_exists=True, override=None) == "0.0.0.0"
    assert (
        resolve_bind_host(token_exists=True, override="127.0.0.1") == "127.0.0.1"
    )


def test_health_no_auth(client) -> None:
    response = client.get("/v1/health")
    assert response.status_code == 200
    body = response.json()
    assert body == {"ok": True, "name": "Snorlax-Bot", "version": "0.9.0"}


def test_v1_requires_bearer(client) -> None:
    response = client.get("/v1/agents")
    assert response.status_code == 401
    assert response.json() == {"error": "Bearer token required"}


def test_v1_rejects_bad_token(client) -> None:
    response = client.get(
        "/v1/agents", headers={"Authorization": "Bearer nope"}
    )
    assert response.status_code == 401
    assert response.json() == {"error": "Invalid bearer token"}


def test_env_token_overrides_file(tmp_path) -> None:
    (tmp_path / "token").write_text("file-token\n", encoding="utf-8")
    settings = Settings(
        data_dir=tmp_path,
        token="env-token",
        bind="127.0.0.1",
        inference_backend="mock",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        denied = client.get(
            "/v1/agents", headers={"Authorization": "Bearer file-token"}
        )
        assert denied.status_code == 401
        ok = client.get(
            "/v1/agents", headers={"Authorization": "Bearer env-token"}
        )
        assert ok.status_code == 200
    assert read_token_file(tmp_path) == "file-token"


def test_generates_token_file(tmp_path) -> None:
    settings = Settings(
        data_dir=tmp_path,
        bind="127.0.0.1",
        inference_backend="mock",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        token = read_token_file(tmp_path)
        assert token
        listed = client.get(
            "/v1/agents", headers={"Authorization": f"Bearer {token}"}
        )
        assert listed.status_code == 200
        assert (tmp_path / "snorlax.db").is_file()
        assert (tmp_path / "token").is_file()
