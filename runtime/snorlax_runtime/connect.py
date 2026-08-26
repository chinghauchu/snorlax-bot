# SPDX-License-Identifier: Apache-2.0
"""Runtime-owned MCP Connect cards. Widget chrome family, not kind=widget."""

from __future__ import annotations

import json
from typing import Any

CONNECT_KIND = "connect"
STATUS_PENDING = "pending"
STATUS_CONNECTED = "connected"
STATUS_DISMISSED = "dismissed"
PENDING_ERROR = "connect pending"
CONNECT_HELP = "Opens your browser to sign in."


class ConnectPendingError(Exception):
    def __init__(self, message: str = PENDING_ERROR) -> None:
        super().__init__(message)
        self.message = message


class ConnectAnswerError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def _as_dict(raw: Any) -> dict[str, Any]:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            value = json.loads(raw)
        except json.JSONDecodeError:
            return {}
        return value if isinstance(value, dict) else {}
    return {}


def connect_card(plugin_id: str, display_name: str) -> dict[str, Any]:
    name = (display_name or plugin_id).strip() or plugin_id
    return {
        "prompt": f"Connect {name} to use its tools.",
        "helpText": CONNECT_HELP,
        "pluginId": plugin_id,
        "status": STATUS_PENDING,
    }


def card_body(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    if not payload:
        return None
    prompt = str(payload.get("prompt") or "").strip()
    plugin_id = str(payload.get("pluginId") or payload.get("plugin_id") or "").strip()
    if not prompt or not plugin_id:
        return None
    help_text = payload.get("helpText")
    if help_text is None:
        help_text = payload.get("help_text")
    if help_text is not None:
        help_text = str(help_text).strip() or None
    return {
        "prompt": prompt,
        "helpText": help_text,
        "pluginId": plugin_id,
    }


def public_connect(raw: Any) -> dict[str, Any] | None:
    payload = _as_dict(raw) if not isinstance(raw, dict) else raw
    if not payload:
        return None
    body = card_body(payload)
    if body is None:
        return None
    status = str(payload.get("status") or STATUS_PENDING).strip().lower()
    if status not in {STATUS_PENDING, STATUS_CONNECTED, STATUS_DISMISSED}:
        status = STATUS_PENDING
    body["status"] = status
    return body


def format_connect_for_model(card: dict[str, Any]) -> str:
    prompt = str(card.get("prompt") or "").strip()
    name = str(card.get("pluginId") or "plugin").strip()
    status = str(card.get("status") or STATUS_PENDING)
    lines = [
        "You asked the user to connect a plugin:",
        prompt or f"Connect {name}.",
    ]
    if status == STATUS_CONNECTED:
        lines.append("The user connected it. Continue with its tools.")
    elif status == STATUS_DISMISSED:
        lines.append("The user declined to connect. Do not ask again this turn.")
    else:
        lines.append("Waiting for them to connect or dismiss.")
    return "\n".join(lines)
