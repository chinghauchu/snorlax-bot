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
    createdAt: str
    updatedAt: str


class AgentCreate(BaseModel):
    name: str = Field(default="New agent", min_length=1, max_length=80)
    title: str = Field(default="", max_length=80)
    description: str = Field(default="", max_length=8000)
    avatar: str | None = None


class AgentPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    title: str | None = Field(default=None, max_length=80)
    description: str | None = Field(default=None, max_length=8000)
    avatar: str | None = None


class ImageOut(BaseModel):
    id: str
    mime: str
    url: str


class ImageIn(BaseModel):
    mime: str = Field(min_length=1, max_length=127)
    data: str


class Message(BaseModel):
    id: str
    agentId: str
    role: str
    content: str
    images: list[ImageOut]
    createdAt: str


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=32000)
    images: list[ImageIn] = Field(default_factory=list)
