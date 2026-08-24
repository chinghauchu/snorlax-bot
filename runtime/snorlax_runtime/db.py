# SPDX-License-Identifier: Apache-2.0
from __future__ import annotations

import json
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import aiosqlite

from snorlax_runtime import SEEDED_AGENT_ID, SEEDED_AGENT_NAME, SEEDED_INSTRUCTIONS

ISO = "%Y-%m-%dT%H:%M:%S.%fZ"


def utcnow() -> str:
    return datetime.now(timezone.utc).strftime(ISO)


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


def slugify(name: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", name.lower()).strip("-")
    return slug or "agent"


SCHEMA = """
CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS agents (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    instructions TEXT NOT NULL DEFAULT '',
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

CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    filename TEXT NOT NULL,
    media_type TEXT NOT NULL,
    storage_path TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY (message_id) REFERENCES messages(id) ON DELETE CASCADE
);
"""


class Store:
    def __init__(self, data_dir: Path) -> None:
        self.data_dir = data_dir
        self.db_path = data_dir / "snorlax.sqlite"
        self.attachments_dir = data_dir / "attachments"
        self._conn: aiosqlite.Connection | None = None

    async def connect(self) -> None:
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.attachments_dir.mkdir(parents=True, exist_ok=True)
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
        cur = await self.conn.execute(
            "SELECT id FROM agents WHERE id = ?", (SEEDED_AGENT_ID,)
        )
        row = await cur.fetchone()
        if not row:
            now = utcnow()
            await self.conn.execute(
                "INSERT INTO agents (id, name, instructions, created_at, updated_at) "
                "VALUES (?, ?, ?, ?, ?)",
                (
                    SEEDED_AGENT_ID,
                    SEEDED_AGENT_NAME,
                    SEEDED_INSTRUCTIONS,
                    now,
                    now,
                ),
            )
            await self.conn.commit()

    async def get_setting(self, key: str) -> str | None:
        cur = await self.conn.execute(
            "SELECT value FROM settings WHERE key = ?", (key,)
        )
        row = await cur.fetchone()
        return None if row is None else str(row["value"])

    async def set_setting(self, key: str, value: str) -> None:
        await self.conn.execute(
            "INSERT INTO settings(key, value) VALUES(?, ?) "
            "ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            (key, value),
        )
        await self.conn.commit()

    async def list_agents(self) -> list[dict[str, Any]]:
        cur = await self.conn.execute(
            "SELECT * FROM agents ORDER BY created_at ASC"
        )
        return [dict(r) for r in await cur.fetchall()]

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        cur = await self.conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        )
        row = await cur.fetchone()
        return None if row is None else dict(row)

    async def create_agent(self, name: str, instructions: str) -> dict[str, Any]:
        base = slugify(name)
        agent_id = base
        n = 2
        while await self.get_agent(agent_id):
            agent_id = f"{base}-{n}"
            n += 1
        now = utcnow()
        await self.conn.execute(
            "INSERT INTO agents (id, name, instructions, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?)",
            (agent_id, name, instructions, now, now),
        )
        await self.conn.commit()
        agent = await self.get_agent(agent_id)
        assert agent is not None
        return agent

    async def patch_agent(
        self, agent_id: str, *, name: str | None, instructions: str | None
    ) -> dict[str, Any] | None:
        agent = await self.get_agent(agent_id)
        if agent is None:
            return None
        if name is not None:
            agent["name"] = name
        if instructions is not None:
            agent["instructions"] = instructions
        agent["updated_at"] = utcnow()
        await self.conn.execute(
            "UPDATE agents SET name = ?, instructions = ?, updated_at = ? WHERE id = ?",
            (agent["name"], agent["instructions"], agent["updated_at"], agent_id),
        )
        await self.conn.commit()
        return agent

    async def delete_agent(self, agent_id: str) -> bool:
        cur = await self.conn.execute(
            "DELETE FROM agents WHERE id = ?", (agent_id,)
        )
        await self.conn.commit()
        return cur.rowcount > 0

    async def list_messages(
        self, agent_id: str, *, limit: int, before: str | None
    ) -> tuple[list[dict[str, Any]], str | None]:
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
        params.append(limit + 1)
        cur = await self.conn.execute(
            f"SELECT * FROM messages {where} ORDER BY created_at DESC LIMIT ?",
            params,
        )
        rows = [dict(r) for r in await cur.fetchall()]
        next_cursor = None
        if len(rows) > limit:
            next_cursor = rows[limit]["id"]
            rows = rows[:limit]
        rows.reverse()
        for message in rows:
            message["attachments"] = await self.list_attachments(message["id"])
        return rows, next_cursor

    async def list_attachments(self, message_id: str) -> list[dict[str, Any]]:
        cur = await self.conn.execute(
            "SELECT id, filename, media_type FROM attachments WHERE message_id = ?",
            (message_id,),
        )
        out = []
        for row in await cur.fetchall():
            item = dict(row)
            item["sent_to_model"] = False
            out.append(item)
        return out

    async def add_message(
        self,
        *,
        agent_id: str,
        role: str,
        content: str,
        attachments: list[dict[str, Any]] | None = None,
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
        for att in attachments or []:
            stored.append(
                await self._add_attachment(message_id, att)
            )
        await self.conn.commit()
        return {
            "id": message_id,
            "agent_id": agent_id,
            "role": role,
            "content": content,
            "attachments": stored,
            "created_at": created,
        }

    async def _add_attachment(
        self, message_id: str, att: dict[str, Any]
    ) -> dict[str, Any]:
        att_id = new_id("att")
        created = utcnow()
        storage_path = None
        data_b64 = att.get("data_base64")
        if data_b64:
            import base64

            raw = base64.b64decode(data_b64)
            path = self.attachments_dir / att_id
            path.write_bytes(raw)
            storage_path = str(path)
        await self.conn.execute(
            "INSERT INTO attachments "
            "(id, message_id, filename, media_type, storage_path, created_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                att_id,
                message_id,
                att["filename"],
                att["media_type"],
                storage_path,
                created,
            ),
        )
        return {
            "id": att_id,
            "filename": att["filename"],
            "media_type": att["media_type"],
            "sent_to_model": False,
        }

    async def inference_transcript(self, agent_id: str) -> list[dict[str, str]]:
        """Text-only history for the model. Attachments are omitted on purpose."""
        agent = await self.get_agent(agent_id)
        assert agent is not None
        messages: list[dict[str, str]] = [
            {"role": "system", "content": agent["instructions"]}
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


def token_exists_on_disk(data_dir: Path) -> bool:
    db_path = data_dir / "snorlax.sqlite"
    if not db_path.exists():
        return False
    conn = sqlite3.connect(db_path)
    try:
        row = conn.execute(
            "SELECT value FROM settings WHERE key = 'auth_token'"
        ).fetchone()
        return bool(row and row[0])
    except sqlite3.OperationalError:
        return False
    finally:
        conn.close()
