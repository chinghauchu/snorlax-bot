# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from snorlax_runtime.config import Settings
from snorlax_runtime.db import Store


def _settings(request: Request) -> Settings:
    return request.app.state.settings


def _store(request: Request) -> Store:
    return request.app.state.store


async def require_bearer(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(_settings),
    store: Store = Depends(_store),
) -> str:
    del request
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthorized", "message": "Bearer token required"},
        )
    offered = authorization.removeprefix("Bearer ").strip()
    expected = settings.token or await store.get_setting("auth_token")
    if not expected or not hmac.compare_digest(offered, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "unauthorized", "message": "Invalid bearer token"},
        )
    return offered
