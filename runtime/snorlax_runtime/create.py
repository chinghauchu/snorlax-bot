# SPDX-License-Identifier: Apache-2.0
"""Local create_agent / create_channel tools wrapping POST /v1/agents."""

from __future__ import annotations

import json
from typing import Any

from snorlax_runtime.db import ChannelMembersError, resolve_channel_member_ids

ERR_NAME_REQUIRED = "Error: name is required"


def parse_create_args(arguments: str) -> dict[str, Any]:
    try:
        args = json.loads(arguments) if (arguments or "").strip() else {}
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}


def create_name(args: dict[str, Any]) -> str:
    return str(args.get("name") or "").strip()


def format_created(row: dict[str, Any]) -> str:
    """Plain-text tool result. First line is the name (done_summary)."""
    name = str(row.get("name") or "").replace("\n", " ").replace("\r", " ").strip()
    ident = str(row.get("id") or "").strip()
    label = name or ident or "item"
    lines = [label]
    if ident:
        lines.append(f"id: {ident}")
    if name and name != label:
        lines.append(f"name: {name}")
    return "\n".join(lines)


async def create_agent_tool(arguments: str, *, store: Any | None = None) -> str:
    args = parse_create_args(arguments)
    name = create_name(args)
    if not name:
        return ERR_NAME_REQUIRED
    if store is None:
        return "Error: no store"
    title = str(args.get("title") or "")
    description = str(args.get("description") or "")
    row = await store.create_agent(name, title, description, None)
    return format_created(row)


def _requested_member_ids(args: dict[str, Any]) -> list[str] | str:
    if "memberIds" not in args and "member_ids" not in args:
        return []
    raw = args.get("memberIds")
    if raw is None:
        raw = args.get("member_ids")
    if raw is None:
        return []
    if not isinstance(raw, list):
        return "memberIds must be agent ids"
    out: list[str] = []
    for item in raw:
        text = str(item or "").strip()
        if text:
            out.append(text)
    return out


async def create_channel_tool(arguments: str, *, store: Any | None = None) -> str:
    args = parse_create_args(arguments)
    name = create_name(args)
    if not name:
        return ERR_NAME_REQUIRED
    if store is None:
        return "Error: no store"
    requested = _requested_member_ids(args)
    if isinstance(requested, str):
        return f"Error: {requested}"
    roster = await store.list_agents()
    try:
        member_ids = resolve_channel_member_ids(
            roster, requested, snapshot_if_empty=True
        )
    except ChannelMembersError as exc:
        return f"Error: {exc}"
    row = await store.create_channel(name, "", "", None, member_ids)
    return format_created(row)
