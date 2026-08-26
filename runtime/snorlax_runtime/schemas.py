# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pydantic import BaseModel, Field, model_validator


class ErrorBody(BaseModel):
    error: str


class Health(BaseModel):
    ok: bool = True
    name: str = "Snorlax-Bot"
    version: str


class Agent(BaseModel):
    id: str
    name: str
    title: str
    description: str
    avatar: str | None
    kind: str
    memberIds: list[str]
    sharedProject: bool = False
    createdAt: str
    updatedAt: str


class AgentCreate(BaseModel):
    name: str = Field(default="New agent", min_length=1, max_length=80)
    title: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=8000)
    avatar: str | None = None
    kind: str = Field(default="agent")
    memberIds: list[str] = Field(default_factory=list)


class AgentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    title: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=8000)
    avatar: str | None = Field(
        default=None,
        description=(
            "Data URL, existing image id, or null. Empty/null shows initials "
            "from name. No new upload route."
        ),
    )
    memberIds: list[str] | None = Field(
        default=None,
        description=(
            "Agent ids for a user-created channel. Seed channel identity "
            "PATCH is 409. Unknown ids and channel ids 422."
        ),
    )
    sharedProject: bool | None = Field(
        default=None,
        description=(
            "Channel shared-project toggle. Default off. Seed channel may "
            "PATCH this field only; identity fields stay 409."
        ),
    )


class ImageOut(BaseModel):
    id: str
    mime: str
    url: str


class ImageIn(BaseModel):
    mime: str = Field(min_length=1, max_length=127)
    data: str


class Mention(BaseModel):
    id: str
    name: str


class HandoffRef(BaseModel):
    channelId: str
    threadId: str


class WidgetOption(BaseModel):
    label: str
    value: str | None = None
    description: str | None = None
    style: str = "default"


class Widget(BaseModel):
    prompt: str
    options: list[WidgetOption]
    helpText: str | None = None
    allowCustom: bool = False
    multiSelect: bool = False
    dismissOnMoveOn: bool = False


class WidgetReply(BaseModel):
    id: str
    values: list[str] | None = None
    dismissed: bool = False


class ConnectCard(BaseModel):
    prompt: str
    pluginId: str
    helpText: str | None = None


class ConnectReply(BaseModel):
    id: str | None = None
    dismissed: bool = False

    @model_validator(mode="after")
    def id_or_dismissed(self) -> ConnectReply:
        if self.dismissed:
            return self
        if not (self.id or "").strip():
            raise ValueError("id required")
        return self


class Message(BaseModel):
    id: str
    agentId: str
    role: str
    content: str
    images: list[ImageOut]
    createdAt: str
    senderId: str
    senderName: str
    senderAvatar: str | None
    hop: int
    mentions: list[Mention]
    kind: str = "message"
    replyTo: str | None = None
    handoff: HandoffRef | None = None
    userAsk: str | None = None
    brief: str | None = None
    replyCount: int = 0
    widget: Widget | None = None
    widgetStatus: str | None = None
    widgetValues: list[str] = Field(default_factory=list)
    connect: ConnectCard | None = None
    connectStatus: str | None = None
    routineName: str | None = None


class MessageCreate(BaseModel):
    content: str = Field(default="", max_length=32000)
    images: list[ImageIn] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    replyTo: str | None = None
    channelId: str | None = Field(
        default=None,
        description=(
            "Optional. A2A log fallback after seed snorlax-bot-group is "
            "gone. Ignored while the seed exists. After the seed is gone, "
            "1:1 @involves log here if the id is an existing kind=channel "
            "row. Unknown, stale, or agent ids skip the log (do not 422, "
            "do not recreate seed)."
        ),
    )
    widgetReply: WidgetReply | None = None
    connectReply: ConnectReply | None = None

    @model_validator(mode="after")
    def content_or_widget_answer(self) -> MessageCreate:
        if self.widgetReply is not None or self.connectReply is not None:
            return self
        if not (self.content or "").strip():
            raise ValueError("content must not be empty")
        return self


class MessageDelta(BaseModel):
    id: str
    role: str
    delta: str
    senderId: str | None = None
    senderName: str | None = None
    senderAvatar: str | None = None


class ToolTrace(BaseModel):
    id: str
    name: str
    summary: str
    ok: bool | None = None
    senderId: str | None = None
    senderName: str | None = None


class WorkspaceEntry(BaseModel):
    name: str
    kind: str
    size: int | None = None


class WorkspaceListing(BaseModel):
    root: str
    path: str
    entries: list[WorkspaceEntry]


class WorkspaceFile(BaseModel):
    path: str
    content: str
    truncated: bool = False


class RoutineTrigger(BaseModel):
    type: str = Field(description="webhook, slack, or github.")
    label: str | None = Field(
        default=None,
        description='Optional Slack/GitHub display, e.g. "Slack #eng".',
        max_length=80,
    )

    @model_validator(mode="after")
    def known_type(self) -> RoutineTrigger:
        kind = (self.type or "").strip().lower()
        if kind not in {"webhook", "slack", "github"}:
            raise ValueError("trigger.type must be webhook, slack, or github")
        self.type = kind
        if self.label is not None:
            self.label = self.label.strip() or None
        return self


class Routine(BaseModel):
    id: str
    name: str
    skill: str
    enabled: bool = True
    kind: str = "cron"
    schedule: str | None = None
    scheduleLabel: str | None = None
    webhookUrl: str | None = None
    label: str | None = None


class RoutineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    skill: str = Field(min_length=1, max_length=80)
    schedule: str | None = Field(
        default=None,
        max_length=80,
        description=(
            "Cron only. 5-field cron or a named hour (8am / weekdays at 9am). "
            "Interpreted in Asia/Taipei. XOR with trigger."
        ),
    )
    trigger: RoutineTrigger | None = Field(
        default=None,
        description="Event trigger. XOR with schedule. webhook always works.",
    )

    @model_validator(mode="after")
    def cron_xor_trigger(self) -> RoutineCreate:
        has_schedule = bool((self.schedule or "").strip())
        has_trigger = self.trigger is not None
        if has_schedule and has_trigger:
            raise ValueError("routine is cron XOR trigger")
        if not has_schedule and not has_trigger:
            raise ValueError("schedule or trigger is required")
        if has_schedule:
            self.schedule = (self.schedule or "").strip()
        return self


class RoutinePatch(BaseModel):
    enabled: bool = Field(description="true = enable/resume. false = pause.")


class SkillInfo(BaseModel):
    name: str
    description: str
    source: str
    path: str


class Plugin(BaseModel):
    id: str
    name: str
    status: str


class PluginCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    transport: str
    command: str | None = None
    args: list[str] | None = None
    url: str | None = None

    @model_validator(mode="after")
    def require_transport_fields(self) -> PluginCreate:
        name = (self.name or "").strip()
        if not name:
            raise ValueError("name is required")
        self.name = name
        kind = (self.transport or "").strip().lower()
        if kind not in {"stdio", "url"}:
            raise ValueError("transport must be stdio or url")
        self.transport = kind
        if kind == "stdio":
            command = (self.command or "").strip()
            if not command:
                raise ValueError("command is required")
            self.command = command
            if self.args is not None and (
                not isinstance(self.args, list)
                or any(not isinstance(item, str) for item in self.args)
            ):
                raise ValueError("args must be a list of strings")
        else:
            url = (self.url or "").strip()
            if not url:
                raise ValueError("url is required")
            self.url = url
        return self


class PluginAuth(BaseModel):
    authorizationUrl: str
