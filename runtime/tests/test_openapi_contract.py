# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pathlib import Path

from tests.conftest import AUTH


FORBIDDEN = ("instructions", "created_at", "attachments", "AgentList")


def test_protocol_openapi_is_locked_v0_contract() -> None:
    text = Path(__file__).resolve().parents[2].joinpath(
        "protocol", "openapi.yaml"
    ).read_text(encoding="utf-8")
    lowered = text
    for token in FORBIDDEN:
        assert token not in lowered, f"protocol/openapi.yaml still contains {token!r}"
    assert "info:\n  title: Snorlax-Bot" in text
    assert "createdAt" in text
    assert "updatedAt" in text
    assert "agentId" in text
    assert "const: Snorlax-Bot" in text
    assert "New agent" in text
    assert "snorlax-bot-group" in text
    assert "Never reuse `snorlax-bot` as the channel transcript" in text
    assert "kind=channel" in text
    assert "threadId" in text
    assert "kind=handoff" in text
    assert "An empty agent roster is OK" in text
    assert "kind=agent including seed" in text
    assert "Never treat snorlax-bot-group as an agent profile" in text
    assert "seeded agent cannot be deleted" not in text
    assert "No new upload route" in text
    assert "identity PATCH is 409" in text
    assert "Seeded channel cannot be deleted" not in text
    assert "seeded channel cannot be deleted" not in text
    assert "DELETE of kind=channel including seed" in text
    assert "`snorlax-bot-group` is 204" in text
    assert "User-created channel DELETE is 204" in text
    assert "last-selected extra channel" not in text
    assert "body `channelId`" in text
    assert "do not recreate seed" in text
    assert "kind=channel" in text
    assert "report-back" in text
    assert "tool.start" in text
    assert "tool.done" in text
    assert "ToolTrace" in text
    assert "workspaces" in text
    assert "not a picker for a folder on the host Mac" in text
    assert "Shell has no extra network" in text
    assert "web_search / web_fetch only" in text
    assert "Tools auto-run" in text
    assert "SNORLAX_SEARCH_PROVIDER" in text
    assert "sharedProject" in text
    assert "kind=tool" in text
    assert "enum: [message, handoff, tool, widget, connect]" in text
    assert "kind=widget" in text
    assert "kind=connect" in text
    assert "connectReply" in text
    assert "connectStatus" in text
    assert "/v1/plugins" in text
    assert "/v1/plugins/catalog" in text
    assert "/v1/plugins/{id}/auth" in text
    assert "/v1/plugins/{id}" in text
    assert "/v1/plugins/{id}/disconnect" not in text
    assert "PluginCatalogEntry" in text
    assert "v0.24" in text
    assert "No separate disconnect" in text or "uninstall plus disconnect" in text
    assert "PluginCreate" in text
    assert 'transport: "stdio" | "url"' in text or "transport: \"stdio\"" in text or "enum: [stdio, url]" in text
    assert "No store" in text or "no store" in text.lower() or "No marketplace" in text
    assert "connect.url" in text
    assert "authorizationUrl" in text
    assert "needsAuth" in text
    assert "NOT kind=widget" in text or "not kind=widget" in text.lower()
    assert "widgetStatus" in text
    assert "widgetValues" in text
    assert "ask_user_question" in text
    assert "dismissOnMoveOn" in text
    assert "allowCustom" in text
    assert "multiSelect" in text
    assert "always finishes with a normal assistant" in text
    assert "projectPath" not in text
    assert "folderPath" not in text
    assert "not persisted as Message" not in text
    assert "SSE, chat-only (no tools)" not in text
    assert "/v1/agents/{id}/workspace" in text
    assert "/v1/agents/{id}/workspace/file" in text
    assert "WorkspaceListing" in text
    assert "WorkspaceFile" in text
    assert "binary / too large" in text
    assert "computer pane" in text
    assert "320px computer pane" in text
    assert "mcp.json" in text
    assert "server__tool" in text
    assert "never call MCP" in text
    assert "SNORLAX_DATA_DIR" in text
    assert "No MCP, no browser-use GUI" not in text
    assert "0.18.0" in text
    assert "0.17.0" in text
    assert "0.16.0" in text
    assert "0.15.0" in text
    assert "0.14.0" in text
    assert "0.13.0" in text
    assert "assistant markdown" in text.lower() or "v0.11" in text
    assert "v0.12" in text
    assert "v0.13" in text
    assert "v0.14" in text
    assert "v0.15" in text
    assert "v0.16" in text
    assert "v0.17" in text
    assert "v0.18" in text
    assert "v0.22" in text
    assert "v0.23" in text
    assert "v0.24" in text
    assert "type: slack, channel" in text
    assert "owner/name" in text
    assert "no wildcards" in text.lower()
    assert "/v1/agents/{id}/computer" in text
    assert "/v1/agents/{id}/computer/screenshot" in text
    assert "/v1/agents/{id}/computer/session" in text
    assert "/v1/agents/{id}/computer/session/{sessionId}" in text
    assert "/v1/agents/{id}/computer/pointer" in text
    assert "/v1/agents/{id}/computer/key" in text
    assert "/v1/agents/{id}/computer/record" in text
    assert "/v1/agents/{id}/computer/image" not in text
    assert "/v1/agents/{id}/computer/click" not in text
    assert "/v1/agents/{id}/computer/scroll" not in text
    assert "ComputerPreview" in text
    assert "ComputerSession" in text
    assert "ComputerRecording" in text
    assert "PointerEvent" in text
    assert "KeyEvent" in text
    assert "SkillCreate" in text
    assert "SkillBody" in text
    assert "SkillPatch" in text
    assert "    Skill:\n      type: object\n      required: [id, name]" in text
    assert "already recording" in text
    assert "no pending capture" in text
    assert "201 Skill" in text
    assert "sessionId" in text
    assert "hasSandbox" in text
    assert "recording" in text
    assert "Save as skill" in text
    assert "Edit skill" in text
    assert "No blank Add" in text or "No blank POST" in text
    assert "New skill" in text
    assert "body omitted" in text
    assert "slugify_skill_name" in text
    assert "/v1/agents/{id}/skills/{sid}" in text
    assert "getSkill" in text
    assert "patchSkill" in text
    assert "deleteSkill" in text
    assert "after YAML frontmatter" not in text
    assert "YAML frontmatter plus recipe" in text
    assert "prefer keep" in text
    assert "No computer yet." in text
    assert "288x180" in text or "288×180" in text
    assert "You're driving" in text
    assert "agent paused" in text
    assert "computer session is active" in text
    assert "Bearer PNG" in text
    assert "/v1/hooks/{token}" in text
    assert "/v1/hooks/{routineId}" not in text
    assert "X-Snorlax-Hook-Key" not in text
    assert "webhookKey" not in text
    assert "cron XOR trigger" in text or "cron XOR" in text
    assert "trigger: { type: webhook }" in text or "type: webhook" in text
    assert "webhookUrl" in text
    assert "clients must not paint" in text.lower()
    assert "Copied" in text or "1.5s" in text or "left of the switch" in text
    assert "does not go through SNORLAX_TOKEN" in text or "Does not use SNORLAX_TOKEN" in text or "not SNORLAX_TOKEN" in text
    assert "not rewrite" in text
    assert "contentType, mime, html, or blocks[]" in text
    assert "split one message into" in text
    assert "text chunks of that same string" in text
    assert "No MCP mix-in" in text
    assert "/v1/agents/{id}/routines" in text
    assert "/v1/agents/{id}/skills" in text
    assert "SKILL.md" in text
    assert "skillsDir" in text
    assert "Asia/Taipei" in text
    assert "routineName" in text
    assert "{ id, name, skill, schedule, enabled }" in text or "skill, schedule, enabled" in text
    assert "later: skills, routines" not in text.lower()
    assert "No computer preview, routines, or connectors" not in text
    assert "kind=channel is 409" in text
    assert "unknown skill" in text
    assert "no catch-up" in text
    assert "skills/<slug>/SKILL.md" in text
    assert "deleteRoutine" in text
    assert "Add routine" in text
    assert "Remove {name}?" in text
    assert "No New / create / edit / delete UI" in text or "list + enable/pause" in text or "enable/pause only" in text or "Pause stays" in text


def test_message_content_stays_a_string_no_blocks() -> None:
    import yaml
    from snorlax_runtime.schemas import Message, MessageDelta

    root = Path(__file__).resolve().parents[2]
    doc = yaml.safe_load(
        (root / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
    )
    props = doc["components"]["schemas"]["Message"]["properties"]
    assert props["content"]["type"] == "string"
    delta = doc["components"]["schemas"]["MessageDelta"]["properties"]["delta"]
    assert delta["type"] == "string"
    for name in ("contentType", "html", "blocks"):
        assert name not in props
        assert name not in Message.model_fields
    assert "widget" in props
    assert "connect" in props
    assert "routineName" in props
    assert Message.model_fields["content"].annotation is str
    assert MessageDelta.model_fields["delta"].annotation is str
    assert "widget" in Message.model_fields
    assert "connect" in Message.model_fields
    assert "routineName" in Message.model_fields


def test_openapi_copies_match_protocol() -> None:
    root = Path(__file__).resolve().parents[2]
    proto = (root / "protocol" / "openapi.yaml").read_bytes()
    assert (root / "runtime" / "openapi.yaml").read_bytes() == proto
    assert (root / "desktop" / "openapi.yaml").read_bytes() == proto
