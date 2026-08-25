# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import base64
import json
import re
import secrets
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

from snorlax_runtime import (
    SEEDED_AGENT_AVATAR,
    SEEDED_AGENT_DESCRIPTION,
    SEEDED_AGENT_ID,
    SEEDED_AGENT_NAME,
    SEEDED_AGENT_TITLE,
)

ISO = "%Y-%m-%dT%H:%M:%S.%fZ"
DB_FILENAME = "snorlax.db"


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime(ISO)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "agent"


def image_url(image_id: str) -> str:
    return f"/v1/images/{image_id}"


SCHEMA = """
CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    avatar TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS images (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    mime TEXT NOT NULL,
    storage_path TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
"""


def agent_public(row: Any) -> dict[str, Any]:
    return {
        "id": row["id"],
        "name": row["name"],
        "title": row["title"],
        "description": row["description"],
        "avatar": row["avatar"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
    }


class Store:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.db_path = data_dir / DB_FILENAME
        self.images_dir = data_dir / "images"
        self._conn: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir.mkdir(parents=True, exist_ok=True)
        self._conn = await aiosqlite.connect(self.db_path)
        self._conn.row_factory = aiosqlite.Row
        await self._conn.execute("PRAGMA foreign_keys = ON")
        await self._conn.executescript(SCHEMA)
        await self._conn.commit()
        await self._seed()

    async def close(self) -> None:
        if self._conn is not None:
            await self._conn.close()
            self._conn = None

    @property
    def conn(self) -> aiosqlite.Connection:
        if self._conn is None:
            raise RuntimeError("store is not connected")
        return self._conn

    async def _seed(self) -> None:
        """Insert snorlax-bot only when the roster is empty. Never auto-reseed."""
        cur = await self.conn.execute("SELECT COUNT(*) AS n FROM agents")
        row = await cur.fetchone()
        if row is None or int(row["n"]) > 0:
            return
        now = utcnow()
        await self.conn.execute(
            "INSERT INTO agents "
            "(id, name, title, description, avatar, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (
                SEEDED_AGENT_ID,
                SEEDED_AGENT_NAME,
                SEEDED_AGENT_TITLE,
                SEEDED_AGENT_DESCRIPTION,
                SEEDED_AGENT_AVATAR,
                now,
                now,
            ),
        )
        await self.conn.commit()

    async def list_agents(self) -> list[dict[str, Any]]:
        cur = await self.conn.execute(
            "SELECT * FROM agents ORDER BY created_at ASC"
        )
        return [agent_public(r) for r in await cur.fetchall()]

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        cur = await self.conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        )
        row = await cur.fetchone()
        return None if row is None else agent_public(row)

    async def create_agent(
        self,
        name: str,
        title: str,
        description: str,
        avatar: str | None,
    ) -> dict[str, Any]:
        base = slugify(name)
        agent_id = base
        n = 2
        while await self.get_agent(agent_id):
            agent_id = f"{base}-{n}"
            n += 1
        now = utcnow()
        await self.conn.execute(
            "INSERT INTO agents "
            "(id, name, title, description, avatar, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (agent_id, name, title, description, avatar, now, now),
        )
        await self.conn.commit()
        agent = await self.get_agent(agent_id)
        assert agent is not None
        return agent

    async def patch_agent(
        self,
        agent_id: str,
        *,
        name: str | None,
        title: str | None,
        description: str | None,
        avatar: str | None | object = ...,
    ) -> dict[str, Any] | None:
        cur = await self.conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        )
        row = await cur.fetchone()
        if row is None:
            return None
        new_name = name if name is not None else row["name"]
        new_title = title if title is not None else row["title"]
        new_description = (
            description if description is not None else row["description"]
        )
        new_avatar = row["avatar"] if avatar is ... else avatar
        updated = utcnow()
        await self.conn.execute(
            "UPDATE agents SET name = ?, title = ?, description = ?, avatar = ?, "
            "updated_at = ? WHERE id = ?",
            (new_name, new_title, new_description, new_avatar, updated, agent_id),
        )
        await self.conn.commit()
        return await self.get_agent(agent_id)

    async def delete_agent(self, agent_id: str) -> bool:
        cur = await self.conn.execute(
            "DELETE FROM agents WHERE id = ?", (agent_id,)
        )
        await self.conn.commit()
        return cur.rowcount > 0

    async def list_messages(
        self, agent_id: str, *, limit: int, before: str | None
    ) -> list[dict[str, Any]]:
        params: list[Any] = [agent_id]
        where = "WHERE agent_id = ?"
        if before:
            cur = await self.conn.execute(
                "SELECT created_at FROM messages WHERE id = ? AND agent_id = ?",
                (before, agent_id),
            )
            row = await cur.fetchone()
            if row is not None:
                where += " AND created_at < ?"
                params.append(row["created_at"])
        params.append(limit)
        cur = await self.conn.execute(
            f"SELECT * FROM messages {where} ORDER BY created_at DESC LIMIT ?",
            params,
        )
        rows = [dict(r) for r in await cur.fetchall()]
        rows.reverse()
        return [await self._message_public(message) for message in rows]

    async def _message_public(self, message: dict[str, Any]) -> dict[str, Any]:
        return {
            "id": message["id"],
            "agentId": message["agent_id"],
            "role": message["role"],
            "content": message["content"],
            "images": await self.list_images(message["id"]),
            "createdAt": message["created_at"],
        }

    async def list_images(self, message_id: str) -> list[dict[str, Any]]:
        cur = await self.conn.execute(
            "SELECT id, mime FROM images WHERE message_id = ? "
            "ORDER BY created_at ASC",
            (message_id,),
        )
        return [
            {
                "id": row["id"],
                "mime": row["mime"],
                "url": image_url(row["id"]),
            }
            for row in await cur.fetchall()
        ]

    async def get_image(self, image_id: str) -> tuple[str, bytes] | None:
        cur = await self.conn.execute(
            "SELECT mime, storage_path FROM images WHERE id = ?", (image_id,)
        )
        row = await cur.fetchone()
        if row is None or not row["storage_path"]:
            return None
        path = Path(row["storage_path"])
        if not path.is_file():
            return None
        return str(row["mime"]), path.read_bytes()

    async def add_message(
        self,
        *,
        agent_id: str,
        role: str,
        content: str,
        images: list[dict[str, Any]] | None = None,
        message_id: str | None = None,
    ) -> dict[str, Any]:
        message_id = message_id or new_id("msg")
        created = utcnow()
        await self.conn.execute(
            "INSERT INTO messages (id, agent_id, role, content, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (message_id, agent_id, role, content, created),
        )
        stored: list[dict[str, Any]] = []
        for image in images or []:
            stored.append(await self._add_image(message_id, image))
        await self.conn.commit()
        return {
            "id": message_id,
            "agentId": agent_id,
            "role": role,
            "content": content,
            "images": stored,
            "createdAt": created,
        }

    async def _add_image(
        self, message_id: str, image: dict[str, Any]
    ) -> dict[str, Any]:
        image_id = new_id("img")
        created = utcnow()
        raw = base64.b64decode(image["data"])
        path = self.images_dir / image_id
        path.write_bytes(raw)
        await self.conn.execute(
            "INSERT INTO images "
            "(id, message_id, mime, storage_path, created_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (image_id, message_id, image["mime"], str(path), created),
        )
        return {
            "id": image_id,
            "mime": image["mime"],
            "url": image_url(image_id),
        }

    async def inference_transcript(self, agent_id: str) -> list[dict[str, str]]:
        """Text-only history. Images are omitted on purpose (no VL)."""
        agent = await self.get_agent(agent_id)
        assert agent is not None
        messages: list[dict[str, str]] = [
            {"role": "system", "content": agent["description"] or ""}
        ]
        cur = await self.conn.execute(
            "SELECT role, content FROM messages WHERE agent_id = ? "
            "ORDER BY created_at ASC",
            (agent_id,),
        )
        for row in await cur.fetchall():
            messages.append({"role": row["role"], "content": row["content"]})
        return messages


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
