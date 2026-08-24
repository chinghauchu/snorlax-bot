# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

from pydantic import BaseModel, Field


class ErrorModel(BaseModel):
    code: str
    message: str


class ErrorBody(BaseModel):
    error: ErrorModel


class ProcessHealth(BaseModel):
    status: str = "ok"


class RuntimeHealth(BaseModel):
    status: str = "ok"
    model: str
    inference_backend: str
    seeded_agent_id: str
    bind_host: str


class Agent(BaseModel):
    id: str
    name: str
    instructions: str
    created_at: str
    updated_at: str


class AgentList(BaseModel):
    agents: list[Agent]


class AgentCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    instructions: str = Field(default="", max_length=8000)


class AgentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    instructions: str | None = Field(default=None, max_length=8000)


class Attachment(BaseModel):
    id: str
    filename: str
    media_type: str
    sent_to_model: bool = False


class AttachmentIn(BaseModel):
    filename: str = Field(min_length=1, max_length=255)
    media_type: str = Field(min_length=1, max_length=127)
    data_base64: str | None = None


class Message(BaseModel):
    id: str
    agent_id: str
    role: str
    content: str
    attachments: list[Attachment]
    created_at: str


class MessageList(BaseModel):
    messages: list[Message]
    next_cursor: str | None = None


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=32000)
    attachments: list[AttachmentIn] = Field(default_factory=list)
