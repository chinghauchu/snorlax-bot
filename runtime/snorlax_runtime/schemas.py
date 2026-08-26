# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pydantic import BaseModel, Field


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


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=32000)
    images: list[ImageIn] = Field(default_factory=list)
    mentions: list[str] = Field(default_factory=list)
    replyTo: str | None = None
    channelId: str | None = None


class MessageDelta(BaseModel):
    id: str
    role: str
    delta: str
    senderId: str | None = None
    senderName: str | None = None
    senderAvatar: str | None = None
