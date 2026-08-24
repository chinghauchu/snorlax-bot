# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import hmac
from typing import Annotated

from fastapi import Depends, Header, HTTPException, Request, status

from snorlax_runtime.config import Settings
from snorlax_runtime.token import resolve_token


def _settings(request: Request) -> Settings:
    return request.app.state.settings


async def require_bearer(
    request: Request,
    authorization: Annotated[str | None, Header()] = None,
    settings: Settings = Depends(_settings),
) -> str:
    del request
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Bearer token required",
        )
    offered = authorization.removeprefix("Bearer ").strip()
    expected = resolve_token(env_token=settings.token, data_dir=settings.data_dir)
    if not expected or not hmac.compare_digest(offered, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid bearer token",
        )
    return offered
