# SPDX-License-Identifier: Apache-2.0
"""Runtime-owned routine tools wrapping existing GET/POST/PATCH/DELETE.

create_routine and delete_routine stash a would-be HTTP body and end the
turn on a LEFT kind=widget confirm (v0.8 chrome, not kind=approve).
pause_routine auto-runs. No new HTTP routes.
"""

from __future__ import annotations

import json
import secrets
from typing import Any

from snorlax_runtime import KIND_CHANNEL
from snorlax_runtime.cron import CronError, parse_schedule
from snorlax_runtime.listeners import github_label, github_repo_valid, slack_label
from snorlax_runtime.mcp import plugin_kind_connected
from snorlax_runtime.skills import find_skill, load_skills, skill_slug
from snorlax_runtime.tools import workspace_for
from snorlax_runtime.widgets import parse_widget_args

CREATE_ROUTINE = "create_routine"
PAUSE_ROUTINE = "pause_routine"
DELETE_ROUTINE = "delete_routine"
ERR_CHANNEL = "Error: routines are assigned to an agent"
ERR_MISSING_NAME = "Error: missing name"
ERR_MISSING_SKILL = "Error: missing skill"
ERR_MISSING_ID = "Error: missing id"
ERR_UNKNOWN_ROUTINE = "Error: routine not found"
ERR_UNKNOWN_SKILL = "Error: unknown skill"
ERR_XOR = "Error: routine is cron XOR trigger"
ERR_SCHEDULE_OR_TRIGGER = "Error: schedule or trigger is required"
SAVE_VALUE = "Save"
DONT_VALUE = "Don't"
REMOVE_VALUE = "Remove"
KEEP_VALUE = "Keep"
ACTION_CREATE = "create"
ACTION_DELETE = "delete"
WEBHOOK_WHEN = "as a webhook"

CREATE_ROUTINE_DEFINITION: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": CREATE_ROUTINE,
        "description": (
            "Create a routine (定时 / 提醒 / cron) on this agent via "
            "existing POST /v1/agents/{id}/routines. Pass name and skill, "
            "plus schedule (5-field cron or a named hour) XOR trigger "
            "({ type: webhook } | { type: slack, channel } | "
            "{ type: github, repo }). Slack/GitHub require that plugin "
            "connected. The runtime asks the user to Save before writing "
            "(kind=widget, not kind=approve). Do not invent a second API. "
            "Agent 1:1 only — not a channel."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Display name for the routine.",
                },
                "skill": {
                    "type": "string",
                    "description": "SKILL.md name or slug to fire.",
                },
                "schedule": {
                    "type": "string",
                    "description": (
                        "Cron only. 5-field cron or a named hour "
                        "(8am / weekdays at 9am). Asia/Taipei. XOR trigger."
                    ),
                },
                "trigger": {
                    "type": "object",
                    "description": (
                        "Event trigger. XOR with schedule. "
                        "type is webhook, slack, or github."
                    ),
                    "properties": {
                        "type": {"type": "string"},
                        "channel": {"type": "string"},
                        "repo": {"type": "string"},
                    },
                    "required": ["type"],
                },
            },
            "required": ["name", "skill"],
        },
    },
}

PAUSE_ROUTINE_DEFINITION: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": PAUSE_ROUTINE,
        "description": (
            "Pause or resume a routine via existing PATCH "
            "{ enabled }. Pass id and enabled (false = pause, "
            "true = resume). Auto-runs; no confirm card. Agent 1:1 only."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Routine id."},
                "enabled": {
                    "type": "boolean",
                    "description": "true = resume. false = pause.",
                },
            },
            "required": ["id", "enabled"],
        },
    },
}

DELETE_ROUTINE_DEFINITION: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": DELETE_ROUTINE,
        "description": (
            "Delete a routine via existing DELETE .../routines/{id}. "
            "Pass id. The runtime asks Remove / Keep on a kind=widget "
            "card before deleting (not kind=approve). Agent 1:1 only."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "id": {"type": "string", "description": "Routine id."},
            },
            "required": ["id"],
        },
    },
}

ROUTINE_TOOL_DEFINITIONS = [
    CREATE_ROUTINE_DEFINITION,
    PAUSE_ROUTINE_DEFINITION,
    DELETE_ROUTINE_DEFINITION,
]


class RoutineError(Exception):
    """Same 422/409 cases as the HTTP routine routes. Tools surface Error:."""

    def __init__(self, message: str, status: int = 422) -> None:
        super().__init__(message)
        self.message = message
        self.status = status


def _parse_args(arguments: str) -> dict[str, Any]:
    try:
        args = json.loads(arguments) if (arguments or "").strip() else {}
    except json.JSONDecodeError:
        return {}
    return args if isinstance(args, dict) else {}


def _trigger_from_args(args: dict[str, Any]) -> dict[str, Any] | None:
    raw = args.get("trigger")
    if raw is None:
        return None
    if isinstance(raw, dict):
        kind = str(raw.get("type") or "").strip().lower()
        if not kind:
            return None
        out: dict[str, Any] = {"type": kind}
        if raw.get("channel") is not None:
            out["channel"] = str(raw.get("channel") or "")
        if raw.get("repo") is not None:
            out["repo"] = str(raw.get("repo") or "")
        return out
    return None


def _as_trigger_dict(trigger: Any) -> dict[str, Any] | None:
    if trigger is None:
        return None
    if isinstance(trigger, dict):
        return _trigger_from_args({"trigger": trigger})
    kind = str(getattr(trigger, "type", "") or "").strip().lower()
    if not kind:
        return None
    out: dict[str, Any] = {"type": kind}
    channel = getattr(trigger, "channel", None)
    repo = getattr(trigger, "repo", None)
    if channel is not None:
        out["channel"] = str(channel)
    if repo is not None:
        out["repo"] = str(repo)
    return out


def require_agent_conversation(conversation: dict[str, Any] | None) -> dict[str, Any]:
    if conversation is None:
        raise RoutineError("agent not found", 404)
    if conversation.get("kind") == KIND_CHANNEL:
        raise RoutineError("routines are assigned to an agent", 409)
    return conversation


def create_confirm_widget(name: str, when: str | None) -> dict[str, Any]:
    """kind=widget Save / Don't. No helpText. × is Don't."""
    label = (name or "").strip() or "routine"
    if (when or "").strip():
        prompt = f'Save "{label}" for {when.strip()}?'
    else:
        prompt = f'Save "{label}"?'
    parsed = parse_widget_args(
        {
            "prompt": prompt,
            "options": [
                {"label": "Save", "value": SAVE_VALUE, "style": "primary"},
                {"label": "Don't", "value": DONT_VALUE, "style": "default"},
            ],
        }
    )
    assert parsed is not None
    return parsed


def delete_confirm_widget(name: str) -> dict[str, Any]:
    """kind=widget Remove / Keep. No helpText. × is Keep."""
    label = (name or "").strip() or "routine"
    parsed = parse_widget_args(
        {
            "prompt": f'Remove "{label}"?',
            "options": [
                {"label": "Remove", "value": REMOVE_VALUE, "style": "danger"},
                {"label": "Keep", "value": KEEP_VALUE, "style": "default"},
            ],
        }
    )
    assert parsed is not None
    return parsed


def pending_payload(
    *,
    action: str,
    agent_id: str,
    name: str,
    body: dict[str, Any],
    confirm_values: list[str],
) -> dict[str, Any]:
    return {
        "action": action,
        "agentId": agent_id,
        "name": name,
        "body": body,
        "confirmValues": confirm_values,
    }


def is_confirm_reply(
    values: list[str], pending: dict[str, Any] | None
) -> bool:
    if not pending:
        return False
    wanted = {
        str(item).strip()
        for item in (pending.get("confirmValues") or [])
        if str(item).strip()
    }
    if not wanted:
        wanted = {SAVE_VALUE, REMOVE_VALUE}
    for item in values:
        if str(item).strip() in wanted:
            return True
    return False


def when_label(
    *,
    schedule: str | None,
    trigger: dict[str, Any] | None,
    schedule_label: str = "",
) -> str | None:
    if trigger is not None:
        kind = str(trigger.get("type") or "").strip().lower()
        if kind == "webhook":
            return WEBHOOK_WHEN
        if kind == "slack":
            channel = str(trigger.get("channel") or "").strip()
            return slack_label(channel) if channel else "Slack"
        if kind == "github":
            repo = str(trigger.get("repo") or "").strip()
            return github_label(repo) if repo else "GitHub"
        return None
    text = (schedule_label or "").strip()
    return text or None


async def prepare_create(
    store: Any,
    *,
    conversation: dict[str, Any] | None,
    arguments: str,
    mcp: Any | None = None,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate create_routine args. Does not persist.

    Returns (widget, pending stash). Raises RoutineError on the same
    cases as POST /v1/agents/{id}/routines (tools map those to Error:).
    """
    conversation = require_agent_conversation(conversation)
    agent_id = str(conversation["id"])
    args = _parse_args(arguments)
    name = str(args.get("name") or "").strip()
    skill = str(args.get("skill") or "").strip()
    if not name:
        raise RoutineError("missing name")
    if not skill:
        raise RoutineError("missing skill")
    schedule = str(args.get("schedule") or "").strip() or None
    trigger = _trigger_from_args(args)
    prepared = await _resolve_create(
        store,
        conversation=conversation,
        agent_id=agent_id,
        name=name,
        skill=skill,
        schedule=schedule,
        trigger=trigger,
        mcp=mcp,
    )
    when = when_label(
        schedule=schedule,
        trigger=trigger,
        schedule_label=str(prepared.get("scheduleLabel") or ""),
    )
    widget = create_confirm_widget(name, when)
    body: dict[str, Any] = {"name": name, "skill": skill}
    if trigger is not None:
        body["trigger"] = trigger
    elif schedule:
        body["schedule"] = schedule
    pending = pending_payload(
        action=ACTION_CREATE,
        agent_id=agent_id,
        name=name,
        body=body,
        confirm_values=[SAVE_VALUE],
    )
    return widget, pending


async def prepare_delete(
    store: Any,
    *,
    conversation: dict[str, Any] | None,
    arguments: str,
) -> tuple[dict[str, Any], dict[str, Any]]:
    """Validate delete_routine. Does not delete. Returns (widget, pending)."""
    conversation = require_agent_conversation(conversation)
    agent_id = str(conversation["id"])
    args = _parse_args(arguments)
    routine_id = str(args.get("id") or "").strip()
    if not routine_id:
        raise RoutineError("missing id")
    row = await store.get_routine(routine_id, agent_id=agent_id)
    if row is None:
        raise RoutineError("routine not found", 404)
    name = str(row.get("name") or "").strip() or "routine"
    widget = delete_confirm_widget(name)
    pending = pending_payload(
        action=ACTION_DELETE,
        agent_id=agent_id,
        name=name,
        body={"id": routine_id},
        confirm_values=[REMOVE_VALUE],
    )
    return widget, pending


async def _resolve_create(
    store: Any,
    *,
    conversation: dict[str, Any],
    agent_id: str,
    name: str,
    skill: str,
    schedule: str | None,
    trigger: dict[str, Any] | None,
    mcp: Any | None,
) -> dict[str, Any]:
    """Validate the same way POST /v1/agents/{id}/routines does."""
    has_schedule = bool((schedule or "").strip())
    has_trigger = trigger is not None
    if has_schedule and has_trigger:
        raise RoutineError("routine is cron XOR trigger")
    if not has_schedule and not has_trigger:
        raise RoutineError("schedule or trigger is required")
    workspace = workspace_for(store.data_dir, conversation, agent_id)
    matched = find_skill(load_skills(store.data_dir, workspace), skill)
    if matched is None:
        raise RoutineError("unknown skill")
    slug = skill_slug(matched)
    if trigger is not None:
        kind = str(trigger.get("type") or "").strip().lower()
        if kind == "webhook":
            return {
                "name": name,
                "skill": slug,
                "cron": "",
                "scheduleLabel": "",
                "triggerType": "webhook",
                "webhookKey": None,
            }
        if kind == "slack":
            channel = str(trigger.get("channel") or "").strip()
            if not channel:
                raise RoutineError("channel is required")
            if not plugin_kind_connected(mcp, "slack"):
                raise RoutineError("slack plugin is not connected")
            return {
                "name": name,
                "skill": slug,
                "cron": channel,
                "scheduleLabel": slack_label(channel),
                "triggerType": "slack",
                "webhookKey": None,
            }
        if kind == "github":
            repo = str(trigger.get("repo") or "").strip()
            if not github_repo_valid(repo):
                raise RoutineError("repo must be owner/name")
            if not plugin_kind_connected(mcp, "github"):
                raise RoutineError("github plugin is not connected")
            return {
                "name": name,
                "skill": slug,
                "cron": repo,
                "scheduleLabel": github_label(repo),
                "triggerType": "github",
                "webhookKey": None,
            }
        raise RoutineError(f"{kind} trigger is not available")
    try:
        cron, label = parse_schedule(schedule or "")
    except CronError as exc:
        raise RoutineError(exc.message) from exc
    return {
        "name": name,
        "skill": slug,
        "cron": cron,
        "scheduleLabel": label,
        "triggerType": "cron",
        "webhookKey": None,
    }


async def persist_create_routine(
    store: Any,
    *,
    agent_id: str,
    name: str,
    skill: str,
    schedule: str | None = None,
    trigger: Any = None,
    mcp: Any | None = None,
) -> dict[str, Any]:
    """Same write as POST /v1/agents/{id}/routines. Raises RoutineError."""
    conversation = await store.get_agent(agent_id)
    conversation = require_agent_conversation(conversation)
    trig = _as_trigger_dict(trigger)
    prepared = await _resolve_create(
        store,
        conversation=conversation,
        agent_id=agent_id,
        name=(name or "").strip(),
        skill=(skill or "").strip(),
        schedule=(schedule or "").strip() or None,
        trigger=trig,
        mcp=mcp,
    )
    webhook_key = prepared.get("webhookKey")
    if prepared.get("triggerType") == "webhook" and not webhook_key:
        webhook_key = secrets.token_urlsafe(32)
    return await store.create_routine(
        agent_id=agent_id,
        name=prepared["name"],
        skill=prepared["skill"],
        cron=prepared["cron"],
        schedule_label=prepared["scheduleLabel"],
        trigger_type=str(prepared.get("triggerType") or "cron"),
        webhook_key=webhook_key,
    )


async def persist_pending_routine(
    store: Any,
    pending: dict[str, Any],
    *,
    mcp: Any | None = None,
) -> tuple[str, str]:
    """Commit a confirmed stash. Returns (tool_name, summary)."""
    action = str(pending.get("action") or "")
    agent_id = str(pending.get("agentId") or "")
    name = str(pending.get("name") or "").strip() or "routine"
    body = pending.get("body") if isinstance(pending.get("body"), dict) else {}
    if action == ACTION_CREATE:
        await persist_create_routine(
            store,
            agent_id=agent_id,
            name=str(body.get("name") or name),
            skill=str(body.get("skill") or ""),
            schedule=str(body.get("schedule") or "").strip() or None,
            trigger=body.get("trigger"),
            mcp=mcp,
        )
        return CREATE_ROUTINE, f"Scheduled {name}"
    if action == ACTION_DELETE:
        routine_id = str(body.get("id") or "").strip()
        if not routine_id:
            raise RoutineError("missing id")
        deleted = await store.delete_routine(routine_id, agent_id=agent_id)
        if not deleted:
            raise RoutineError("routine not found", 404)
        return DELETE_ROUTINE, f"Removed {name}"
    raise RoutineError("unknown pending routine action")


async def pause_routine_tool(
    arguments: str,
    *,
    store: Any | None,
    conversation_id: str | None,
) -> str:
    if store is None or not conversation_id:
        return ERR_MISSING_ID
    conversation = await store.get_agent(conversation_id)
    try:
        require_agent_conversation(conversation)
    except RoutineError as exc:
        return f"Error: {exc.message}"
    args = _parse_args(arguments)
    routine_id = str(args.get("id") or "").strip()
    if not routine_id:
        return ERR_MISSING_ID
    if "enabled" not in args:
        return "Error: enabled is required"
    enabled = args.get("enabled")
    if isinstance(enabled, str):
        enabled = enabled.strip().lower() in {"1", "true", "yes", "on"}
    else:
        enabled = bool(enabled)
    row = await store.patch_routine(
        routine_id, agent_id=conversation_id, enabled=enabled
    )
    if row is None:
        return ERR_UNKNOWN_ROUTINE
    name = str(row.get("name") or "").strip() or "routine"
    return f"Resumed {name}" if enabled else f"Paused {name}"


async def create_routine_tool_error(arguments: str, *, error: str) -> str:
    del arguments
    text = (error or "").strip() or "failed"
    if text.lower().startswith("error:"):
        return text
    return f"Error: {text}"


def tool_error_from_exc(exc: RoutineError) -> str:
    return f"Error: {exc.message}"
