# SPDX-License-Identifier: Apache-2.0
"""Runtime-owned question widgets. Clients render the card; they never invent fields."""

from __future__ import annotations

import json
from typing import Any

ASK_USER_QUESTION = "ask_user_question"
WIDGET_KIND = "widget"
STATUS_PENDING = "pending"
STATUS_RESOLVED = "resolved"
STATUS_DISMISSED = "dismissed"
OPTION_STYLES = frozenset({"default", "primary", "danger"})
MAX_OPTIONS = 6
MIN_OPTIONS = 1
DECLINE_USER_NOTE = (
    "The user declined this question. Do not ask it again."
)
PENDING_ERROR = "question pending"


class WidgetPendingError(Exception):
    def __init__(self, message: str = PENDING_ERROR) -> None:
        super().__init__(message)
        self.message = message


class WidgetAnswerError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message

ASK_USER_QUESTION_DEFINITION: dict[str, Any] = {
    "type": "function",
    "function": {
        "name": ASK_USER_QUESTION,
        "description": (
            "Ask the user a decision as a question card in the transcript. "
            "Phrase prompt as a natural question, not a menu instruction. "
            "Each option value should read like a reply the user would send. "
            "1 to 6 options. This ends your turn — no more tokens or tools "
            "until they answer or decline. Never use this to approve or gate "
            "shell, web, file, or MCP tools; those already auto-run. In a 1:1 "
            "only you may ask; if a teammate needs a decision, they report "
            "back and you ask here. In a channel thread the speaking agent "
            "may ask."
        ),
        "parameters": {
            "type": "object",
            "properties": {
                "prompt": {
                    "type": "string",
                    "description": "Natural-language question shown on the card.",
                },
                "options": {
                    "type": "array",
                    "minItems": MIN_OPTIONS,
                    "maxItems": MAX_OPTIONS,
                    "items": {
                        "type": "object",
                        "properties": {
                            "label": {"type": "string"},
                            "value": {
                                "type": "string",
                                "description": "Reply text. Defaults to label.",
                            },
                            "description": {"type": "string"},
                            "style": {
                                "type": "string",
                                "enum": ["default", "primary", "danger"],
                            },
                        },
                        "required": ["label"],
                    },
                },
                "allowCustom": {
                    "type": "boolean",
                    "description": "User may type a reply that is not an option.",
                },
                "multiSelect": {
                    "type": "boolean",
                    "description": "User may pick more than one option.",
                },
                "helpText": {"type": "string"},
                "dismissOnMoveOn": {
                    "type": "boolean",
                    "description": (
                        "If the user sends a new composer message instead of "
                        "picking, decline this card and continue with that "
                        "message."
                    ),
                },
            },
            "required": ["prompt", "options"],
        },
    },
}


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


def _truthy(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.strip().lower() in {"1", "true", "yes", "on"}
    return bool(value)


def _option_style(raw: Any) -> str:
    style = str(raw or "default").strip().lower()
    return style if style in OPTION_STYLES else "default"


def _normalize_option(raw: Any) -> dict[str, Any] | None:
    if isinstance(raw, str):
        label = raw.strip()
        if not label:
            return None
        return {
            "label": label,
            "value": label,
            "description": None,
            "style": "default",
        }
    if not isinstance(raw, dict):
        return None
    label = str(raw.get("label") or "").strip()
    if not label:
        return None
    value = str(raw.get("value") or label).strip() or label
    description = raw.get("description")
    if description is not None:
        description = str(description).strip() or None
    return {
        "label": label,
        "value": value,
        "description": description,
        "style": _option_style(raw.get("style")),
    }


def _first_question(payload: dict[str, Any]) -> dict[str, Any]:
    questions = payload.get("questions")
    if isinstance(questions, list) and questions:
        first = questions[0]
        if isinstance(first, dict):
            return first
    return payload


def parse_widget_args(raw: Any) -> dict[str, Any] | None:
    """Normalize a model tool payload into the locked Widget object.

    Returns None when the card cannot be shown (no prompt or no options).
    """
    payload = _first_question(_as_dict(raw))
    prompt = str(
        payload.get("prompt") or payload.get("question") or ""
    ).strip()
    if not prompt:
        return None
    options_raw = payload.get("options")
    if not isinstance(options_raw, list):
        return None
    options: list[dict[str, Any]] = []
    seen_values: set[str] = set()
    for item in options_raw:
        option = _normalize_option(item)
        if option is None:
            continue
        if option["value"] in seen_values:
            continue
        seen_values.add(option["value"])
        options.append(option)
        if len(options) >= MAX_OPTIONS:
            break
    if len(options) < MIN_OPTIONS:
        return None
    help_text = payload.get("helpText")
    if help_text is None:
        help_text = payload.get("help_text")
    if help_text is not None:
        help_text = str(help_text).strip() or None
    allow_custom = payload.get("allowCustom")
    if allow_custom is None:
        allow_custom = payload.get("allow_custom", payload.get("allowOther"))
    multi = payload.get("multiSelect")
    if multi is None:
        multi = payload.get("multi_select")
    dismiss = payload.get("dismissOnMoveOn")
    if dismiss is None:
        dismiss = payload.get("dismiss_on_move_on")
    return {
        "prompt": prompt,
        "options": options,
        "allowCustom": _truthy(allow_custom),
        "multiSelect": _truthy(multi),
        "helpText": help_text,
        "dismissOnMoveOn": _truthy(dismiss),
        "status": STATUS_PENDING,
        "values": [],
    }


def card_body(widget: dict[str, Any] | None) -> dict[str, Any] | None:
    """Public Widget object: card fields only. Status/values live on Message."""
    if not widget:
        return None
    return {
        "prompt": widget["prompt"],
        "options": widget["options"],
        "allowCustom": bool(widget.get("allowCustom")),
        "multiSelect": bool(widget.get("multiSelect")),
        "helpText": widget.get("helpText"),
        "dismissOnMoveOn": bool(widget.get("dismissOnMoveOn")),
    }


def public_widget(raw: Any) -> dict[str, Any] | None:
    if raw is None or raw == "":
        return None
    payload = _as_dict(raw) if not isinstance(raw, dict) else raw
    if not payload:
        return None
    parsed = parse_widget_args(payload)
    if parsed is None:
        return None
    status = str(payload.get("status") or STATUS_PENDING).strip().lower()
    if status not in {STATUS_PENDING, STATUS_RESOLVED, STATUS_DISMISSED}:
        status = STATUS_PENDING
    parsed["status"] = status
    values = payload.get("values")
    if values is None:
        values = payload.get("selected")
    if isinstance(values, list):
        parsed["values"] = [str(item) for item in values if str(item).strip()]
    elif isinstance(values, str) and values.strip():
        parsed["values"] = [values.strip()]
    else:
        parsed["values"] = []
    for key in (
        "allowCustom",
        "multiSelect",
        "helpText",
        "dismissOnMoveOn",
    ):
        if key in payload and payload[key] is not None:
            if key == "helpText":
                parsed[key] = str(payload[key]).strip() or None
            elif key in {"allowCustom", "multiSelect", "dismissOnMoveOn"}:
                parsed[key] = _truthy(payload[key])
    return parsed


def require_reply_values(
    raw_values: list[str], widget: dict[str, Any] | None
) -> list[str]:
    stripped = [str(item).strip() for item in raw_values if str(item).strip()]
    if len(stripped) > 1 and not (widget or {}).get("multiSelect"):
        raise WidgetAnswerError("multiple values require multiSelect")
    values = reply_values(stripped, widget)
    if not values:
        raise WidgetAnswerError("values required")
    return values


def reply_values(raw_values: list[str], widget: dict[str, Any] | None) -> list[str]:
    values = [str(item).strip() for item in raw_values if str(item).strip()]
    if not widget:
        return values
    options = [opt for opt in (widget.get("options") or []) if isinstance(opt, dict)]
    mapped: list[str] = []
    seen: set[str] = set()
    for item in values:
        match = None
        for opt in options:
            value = str(opt.get("value") or opt.get("label") or "").strip()
            label = str(opt.get("label") or "").strip()
            if item == value or item == label:
                match = value or label
                break
        chosen = match if match is not None else (item if widget.get("allowCustom") else None)
        if not chosen or chosen in seen:
            continue
        seen.add(chosen)
        mapped.append(chosen)
        if not widget.get("multiSelect"):
            break
    return mapped


def format_widget_for_model(widget: dict[str, Any]) -> str:
    prompt = str(widget.get("prompt") or "").strip()
    options = widget.get("options") or []
    values = [
        str(opt.get("value") or opt.get("label") or "").strip()
        for opt in options
        if isinstance(opt, dict)
    ]
    values = [v for v in values if v]
    status = str(widget.get("status") or STATUS_PENDING)
    lines = [
        "You asked the user this question as a card in the transcript:",
        prompt,
    ]
    if values:
        lines.append("Options: " + " | ".join(values))
    if status == STATUS_RESOLVED:
        selected = widget.get("values") or []
        reply = "\n".join(str(item) for item in selected if str(item).strip())
        lines.append("The user answered:")
        lines.append(reply or "(empty)")
    elif status == STATUS_DISMISSED:
        lines.append(DECLINE_USER_NOTE)
    else:
        lines.append("Waiting for their reply. Do not re-ask until they answer or decline.")
    return "\n".join(lines)
