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
    KIND_AGENT,
    KIND_CHANNEL,
    SEEDED_AGENT_AVATAR,
    SEEDED_AGENT_DESCRIPTION,
    SEEDED_AGENT_ID,
    SEEDED_AGENT_NAME,
    SEEDED_AGENT_TITLE,
    SEEDED_CHANNEL_AVATAR,
    SEEDED_CHANNEL_DESCRIPTION,
    SEEDED_CHANNEL_ID,
    SEEDED_CHANNEL_NAME,
    SEEDED_CHANNEL_TITLE,
    USER_SENDER_ID,
    USER_SENDER_NAME,
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
    kind TEXT NOT NULL DEFAULT 'agent',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    agent_id TEXT NOT NULL,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL,
    sender_id TEXT NOT NULL DEFAULT 'user',
    sender_name TEXT NOT NULL DEFAULT 'User',
    sender_avatar TEXT,
    hop INTEGER NOT NULL DEFAULT 0,
    mentions TEXT NOT NULL DEFAULT '[]',
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
        await self._migrate()
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

    async def _columns(self, table: str) -> set[str]:
        cur = await self.conn.execute(f"PRAGMA table_info({table})")
        return {str(row["name"]) for row in await cur.fetchall()}

    async def _migrate(self) -> None:
        agent_cols = await self._columns("agents")
        if "kind" not in agent_cols:
            await self.conn.execute(
                "ALTER TABLE agents ADD COLUMN kind TEXT NOT NULL DEFAULT 'agent'"
            )
        msg_cols = await self._columns("messages")
        additions = {
            "sender_id": "TEXT NOT NULL DEFAULT 'user'",
            "sender_name": "TEXT NOT NULL DEFAULT 'User'",
            "sender_avatar": "TEXT",
            "hop": "INTEGER NOT NULL DEFAULT 0",
            "mentions": "TEXT NOT NULL DEFAULT '[]'",
        }
        for name, spec in additions.items():
            if name not in msg_cols:
                await self.conn.execute(
                    f"ALTER TABLE messages ADD COLUMN {name} {spec}"
                )
        await self.conn.execute(
            "UPDATE messages SET sender_id = ?, sender_name = ? "
            "WHERE role = 'user' AND (sender_id IS NULL OR sender_id = '')",
            (USER_SENDER_ID, USER_SENDER_NAME),
        )
        await self.conn.execute(
            "UPDATE messages SET sender_id = agent_id "
            "WHERE role = 'assistant' AND (sender_id IS NULL OR sender_id = '' "
            "OR sender_id = 'user')"
        )
        await self.conn.execute(
            "UPDATE messages SET sender_name = ("
            "  SELECT name FROM agents WHERE agents.id = messages.sender_id"
            ") WHERE role = 'assistant' AND (sender_name IS NULL OR sender_name = '' "
            "OR sender_name = 'User')"
        )
        await self.conn.commit()

    async def _seed(self) -> None:
        """Insert snorlax-bot only when the roster has no agents. Never auto-reseed.

        The group channel is created if missing so existing DBs pick up v0.1.
        """
        cur = await self.conn.execute(
            "SELECT COUNT(*) AS n FROM agents WHERE kind = ?", (KIND_AGENT,)
        )
        row = await cur.fetchone()
        if row is not None and int(row["n"]) == 0:
            now = utcnow()
            await self.conn.execute(
                "INSERT INTO agents "
                "(id, name, title, description, avatar, kind, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    SEEDED_AGENT_ID,
                    SEEDED_AGENT_NAME,
                    SEEDED_AGENT_TITLE,
                    SEEDED_AGENT_DESCRIPTION,
                    SEEDED_AGENT_AVATAR,
                    KIND_AGENT,
                    now,
                    now,
                ),
            )
        await self._ensure_channel()
        await self.conn.commit()

    async def _ensure_channel(self) -> None:
        existing = await self.get_agent(SEEDED_CHANNEL_ID)
        if existing is not None:
            return
        now = utcnow()
        await self.conn.execute(
            "INSERT INTO agents "
            "(id, name, title, description, avatar, kind, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                SEEDED_CHANNEL_ID,
                SEEDED_CHANNEL_NAME,
                SEEDED_CHANNEL_TITLE,
                SEEDED_CHANNEL_DESCRIPTION,
                SEEDED_CHANNEL_AVATAR,
                KIND_CHANNEL,
                now,
                now,
            ),
        )

    async def _member_ids(self) -> list[str]:
        cur = await self.conn.execute(
            "SELECT id FROM agents WHERE kind = ? ORDER BY created_at ASC",
            (KIND_AGENT,),
        )
        return [str(row["id"]) for row in await cur.fetchall()]

    def _agent_public(self, row: Any, member_ids: list[str]) -> dict[str, Any]:
        kind = row["kind"] if "kind" in row.keys() else KIND_AGENT
        return {
            "id": row["id"],
            "name": row["name"],
            "title": row["title"],
            "description": row["description"],
            "avatar": row["avatar"],
            "kind": kind,
            "memberIds": list(member_ids) if kind == KIND_CHANNEL else [],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    async def list_agents(self) -> list[dict[str, Any]]:
        cur = await self.conn.execute(
            "SELECT * FROM agents ORDER BY "
            "CASE kind WHEN 'channel' THEN 0 ELSE 1 END, created_at ASC"
        )
        rows = await cur.fetchall()
        members = [str(r["id"]) for r in rows if r["kind"] != KIND_CHANNEL]
        return [self._agent_public(r, members) for r in rows]

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        cur = await self.conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        )
        row = await cur.fetchone()
        if row is None:
            return None
        members = await self._member_ids() if row["kind"] == KIND_CHANNEL else []
        return self._agent_public(row, members)

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
            "(id, name, title, description, avatar, kind, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (agent_id, name, title, description, avatar, KIND_AGENT, now, now),
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
        conversation = await self.get_agent(agent_id)
        params: list[Any] = [agent_id]
        where = "WHERE agent_id = ?"
        # 1:1 transcripts are only the user and that agent. Peer traffic lives
        # in the seeded channel.
        if conversation is not None and conversation.get("kind") != KIND_CHANNEL:
            where += " AND (sender_id = ? OR sender_id = ?)"
            params.extend([USER_SENDER_ID, agent_id])
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
        raw_mentions = message.get("mentions") or "[]"
        if isinstance(raw_mentions, list):
            mentions = raw_mentions
        else:
            try:
                mentions = json.loads(raw_mentions)
            except json.JSONDecodeError:
                mentions = []
        return {
            "id": message["id"],
            "agentId": message["agent_id"],
            "role": message["role"],
            "content": message["content"],
            "images": await self.list_images(message["id"]),
            "createdAt": message["created_at"],
            "senderId": message.get("sender_id") or USER_SENDER_ID,
            "senderName": message.get("sender_name") or USER_SENDER_NAME,
            "senderAvatar": message.get("sender_avatar"),
            "hop": int(message.get("hop") or 0),
            "mentions": mentions,
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
        sender_id: str | None = None,
        sender_name: str | None = None,
        sender_avatar: str | None = None,
        hop: int = 0,
        mentions: list[dict[str, Any]] | None = None,
    ) -> dict[str, Any]:
        message_id = message_id or new_id("msg")
        created = utcnow()
        if sender_id is None:
            sender_id = USER_SENDER_ID if role == "user" else agent_id
        if sender_name is None:
            sender_name = USER_SENDER_NAME if sender_id == USER_SENDER_ID else sender_id
        stored_mentions = json.dumps(mentions or [], ensure_ascii=False)
        await self.conn.execute(
            "INSERT INTO messages "
            "(id, agent_id, role, content, created_at, sender_id, sender_name, "
            "sender_avatar, hop, mentions) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                message_id,
                agent_id,
                role,
                content,
                created,
                sender_id,
                sender_name,
                sender_avatar,
                hop,
                stored_mentions,
            ),
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
            "senderId": sender_id,
            "senderName": sender_name,
            "senderAvatar": sender_avatar,
            "hop": hop,
            "mentions": mentions or [],
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

    async def inference_transcript(
        self, conversation_id: str, for_agent_id: str | None = None
    ) -> list[dict[str, str]]:
        """Text-only history. Images are omitted on purpose (no VL)."""
        conversation = await self.get_agent(conversation_id)
        assert conversation is not None
        speaker = (
            await self.get_agent(for_agent_id) if for_agent_id else conversation
        )
        assert speaker is not None
        is_group = conversation.get("kind") == KIND_CHANNEL
        who = speaker["id"] if for_agent_id else conversation_id
        place = (
            "a shared group channel with every teammate"
            if is_group
            else "a 1:1 with the user"
        )
        system = (
            f"You are {speaker['name']}. You are in {place}. "
            "Mention another teammate with @DisplayName to address them in "
            "the group channel; the runtime routes that mention. 1:1 "
            "transcripts stay between you and the user. Do not invent cues "
            "like [agent] or [Group chat:]. Stay silent on FYI notes that do "
            "not ask you anything.\n\n"
            f"{speaker['description'] or ''}"
        ).strip()
        messages: list[dict[str, str]] = [{"role": "system", "content": system}]
        cur = await self.conn.execute(
            "SELECT sender_id, sender_name, role, content FROM messages "
            "WHERE agent_id = ? ORDER BY created_at ASC",
            (conversation_id,),
        )
        for row in await cur.fetchall():
            sender = row["sender_id"]
            if not is_group and sender not in {USER_SENDER_ID, who}:
                continue
            body = row["content"]
            if sender == who:
                messages.append({"role": "assistant", "content": body})
            elif sender == USER_SENDER_ID:
                messages.append({"role": "user", "content": body})
            else:
                messages.append(
                    {
                        "role": "user",
                        "content": f"{row['sender_name']}: {body}",
                    }
                )
        return messages


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
