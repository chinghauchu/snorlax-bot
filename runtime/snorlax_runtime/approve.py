# SPDX-License-Identifier: Apache-2.0
"""Runtime-owned shell Approve cards. Widget chrome family, not kind=widget."""

from __future__ import annotations

import json
import re
import shlex
from pathlib import Path
from typing import Any

APPROVE_KIND = "approve"
STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUS_DENIED = "denied"
PENDING_ERROR = "approve pending"
DENIED_USER_NOTE = (
    "The user denied this shell command. Do not run it and do not ask again."
)
APPROVED_USER_NOTE = "The user approved this shell command."

READONLY_BINS = frozenset({"ls", "cat", "pwd"})
READONLY_GIT = frozenset({"status", "log", "diff"})
_GIT_PATH_OPTS = frozenset({"-C", "--git-dir", "--work-tree"})
# Chain, pipe, redirection, command substitution — always mutating.
_OP_RE = re.compile(r"(?:&&|\|\||[|;&`$<>()\n])")
_QUOTED_RE = re.compile(r"(?s)(?:'[^']*'|\"(?:\\.|[^\"])*\")")


class ApprovePendingError(Exception):
    def __init__(self, message: str = PENDING_ERROR) -> None:
        super().__init__(message)
        self.message = message


class ApproveAnswerError(Exception):
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


def _strip_quoted(command: str) -> str:
    return _QUOTED_RE.sub(" ", command)


def is_readonly_shell(command: str) -> bool:
    """True for ls / cat / pwd / git status|log|diff with simple flags/paths.

    Any chain, pipe, redirection, ``&&`` / ``;`` / ``|``, or any other
    binary is mutating and must gate.
    """
    raw = (command or "").strip()
    if not raw:
        return False
    if "\n" in raw or "\r" in raw:
        return False
    unquoted = _strip_quoted(raw)
    if _OP_RE.search(unquoted):
        return False
    try:
        tokens = shlex.split(raw, posix=True)
    except ValueError:
        return False
    if not tokens:
        return False
    binary = Path(tokens[0]).name.lower()
    if binary in READONLY_BINS:
        return True
    if binary != "git" or len(tokens) < 2:
        return False
    i = 1
    while i < len(tokens):
        token = tokens[i]
        if token in _GIT_PATH_OPTS:
            i += 2
            continue
        if token.startswith("--git-dir=") or token.startswith("--work-tree="):
            i += 1
            continue
        if token.startswith("-"):
            i += 1
            continue
        return token.lower() in READONLY_GIT
    return False


def approve_card(command: str, timeout: float | None = None) -> dict[str, Any]:
    cmd = (command or "").strip()
    payload: dict[str, Any] = {
        "command": cmd,
        "status": STATUS_PENDING,
    }
    if timeout is not None:
        payload["timeout"] = timeout
    return payload


def approve_card_from_args(args: dict[str, Any]) -> dict[str, Any]:
    timeout = args.get("timeout")
    parsed: float | None = None
    if timeout is not None:
        try:
            parsed = float(timeout)
        except (TypeError, ValueError):
            parsed = None
    return approve_card(str(args.get("command") or ""), parsed)


def card_body(payload: dict[str, Any] | None) -> dict[str, Any] | None:
    """Public Approve object: card fields only. Status lives on Message."""
    if not payload:
        return None
    command = str(payload.get("command") or "").strip()
    if not command:
        return None
    return {"command": command}


def public_approve(raw: Any) -> dict[str, Any] | None:
    payload = _as_dict(raw) if not isinstance(raw, dict) else raw
    if not payload:
        return None
    body = card_body(payload)
    if body is None:
        return None
    status = str(payload.get("status") or STATUS_PENDING).strip().lower()
    if status not in {STATUS_PENDING, STATUS_APPROVED, STATUS_DENIED}:
        status = STATUS_PENDING
    body["status"] = status
    timeout = payload.get("timeout")
    if timeout is not None:
        try:
            body["timeout"] = float(timeout)
        except (TypeError, ValueError):
            pass
    output = payload.get("output")
    if output is not None:
        body["output"] = str(output)
    return body


def format_approve_for_model(card: dict[str, Any]) -> str:
    command = str(card.get("command") or "").strip()
    status = str(card.get("status") or STATUS_PENDING)
    lines = [
        "You asked to run this shell command:",
        command or "(empty)",
    ]
    if status == STATUS_APPROVED:
        lines.append("The user approved. The command ran.")
        output = str(card.get("output") or "").strip()
        if output:
            lines.append("Output:")
            lines.append(output)
    elif status == STATUS_DENIED:
        lines.append(DENIED_USER_NOTE)
    else:
        lines.append("Waiting for the user to Approve or Deny. Do not run it yourself.")
    return "\n".join(lines)
