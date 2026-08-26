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
from snorlax_runtime.handoff import format_brief

ISO = "%Y-%m-%dT%H:%M:%S.%fZ"
DB_FILENAME = "snorlax.db"

TOOLS_PREAMBLE = (
    "You have built-in tools (list_dir, read_file, write_file, delete_file, "
    "shell, web_search, web_fetch). Call them instead of describing the work. "
    "The runtime runs tools immediately — do not ask the user to approve a "
    "tool call and do not wait for a widget. Question cards are for user "
    "judgment (which approach, whether to proceed on a product decision), "
    "never for gating shell/web/MCP. When you need a decision, call "
    "ask_user_question with a natural-language prompt and 1-6 options whose "
    "values read like a reply the user would send. That ends your turn. "
    "Write programs to files in the "
    "workspace; do not dump a whole app in the chat bubble. Do not "
    "acknowledge that you can help — do the task. HTTP is web_search / "
    "web_fetch only; do not curl from shell. 1:1 files are private to you. "
    "Channel and handoff turns use your private workspace unless that "
    "channel's shared project is on — then they share the channel sandbox "
    "under the runtime data dir (not a folder on the host Mac). If another "
    "teammate needs your files, turn shared project on or put them there. "
    "If a teammate needs a user decision, report back; do not try to paint "
    "a question card in someone else's 1:1."
)


def tools_preamble() -> str:
    from snorlax_runtime.mcp import mcp_tool_names

    names = mcp_tool_names()
    extra = ""
    if names:
        extra = (
            " Additional MCP tools are namespaced as server__tool "
            f"({', '.join(names)}). Built-in names win on collision. "
            "MCP HTTP is a runtime path, not the agent shell."
        )
    return TOOLS_PREAMBLE + extra


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
    shared_project INTEGER NOT NULL DEFAULT 0,
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

CREATE TABLE IF NOT EXISTS channel_members (
    channel_id TEXT NOT NULL,
    agent_id TEXT NOT NULL,
    PRIMARY KEY (channel_id, agent_id),
    FOREIGN KEY (channel_id) REFERENCES agents(id) ON DELETE CASCADE,
    FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
"""

ROSTER_SEEDED_KEY = "roster_seeded"


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
        if "shared_project" not in agent_cols:
            await self.conn.execute(
                "ALTER TABLE agents ADD COLUMN shared_project "
                "INTEGER NOT NULL DEFAULT 0"
            )
        msg_cols = await self._columns("messages")
        additions = {
            "sender_id": "TEXT NOT NULL DEFAULT 'user'",
            "sender_name": "TEXT NOT NULL DEFAULT 'User'",
            "sender_avatar": "TEXT",
            "hop": "INTEGER NOT NULL DEFAULT 0",
            "mentions": "TEXT NOT NULL DEFAULT '[]'",
            "reply_to": "TEXT",
            "kind": "TEXT NOT NULL DEFAULT 'message'",
            "user_ask": "TEXT",
            "brief": "TEXT",
            "handoff_channel_id": "TEXT",
            "handoff_thread_id": "TEXT",
            "origin_conversation_id": "TEXT",
            "widget": "TEXT",
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

    async def _roster_already_seeded(self) -> bool:
        cur = await self.conn.execute(
            "SELECT value FROM meta WHERE key = ?", (ROSTER_SEEDED_KEY,)
        )
        row = await cur.fetchone()
        return row is not None and str(row["value"]) == "1"

    async def _mark_roster_seeded(self) -> None:
        await self.conn.execute(
            "INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)",
            (ROSTER_SEEDED_KEY, "1"),
        )

    async def _seed(self) -> None:
        """Insert seed agent + channel only on first empty DB. Never auto-reseed.

        DELETE of seed `snorlax-bot` or seed channel `snorlax-bot-group` is 204.
        An empty roster (no agents and/or no channels) is OK and is not filled
        back in on reconnect. Existing DBs without the meta flag still pick up
        the v0.1 channel once, then lock.
        """
        already = await self._roster_already_seeded()
        cur = await self.conn.execute("SELECT COUNT(*) AS n FROM agents")
        row = await cur.fetchone()
        empty = row is not None and int(row["n"]) == 0
        if not already:
            if empty:
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
            await self._mark_roster_seeded()
        await self._lock_channel_label()
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

    async def _lock_channel_label(self) -> None:
        """Keep the seeded channel named Snorlax-Bot. Seed agent PATCH persists."""
        await self.conn.execute(
            "UPDATE agents SET name = ?, title = ? WHERE id = ?",
            (SEEDED_CHANNEL_NAME, SEEDED_CHANNEL_TITLE, SEEDED_CHANNEL_ID),
        )

    async def _all_agent_ids(self) -> list[str]:
        cur = await self.conn.execute(
            "SELECT id FROM agents WHERE kind = ? ORDER BY created_at ASC",
            (KIND_AGENT,),
        )
        return [str(row["id"]) for row in await cur.fetchall()]

    async def _member_ids(self, channel_id: str | None = None) -> list[str]:
        if channel_id is None or channel_id == SEEDED_CHANNEL_ID:
            return await self._all_agent_ids()
        cur = await self.conn.execute(
            "SELECT agent_id FROM channel_members WHERE channel_id = ? "
            "ORDER BY rowid ASC",
            (channel_id,),
        )
        return [str(row["agent_id"]) for row in await cur.fetchall()]

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
            "sharedProject": (
                bool(row["shared_project"])
                if kind == KIND_CHANNEL and "shared_project" in row.keys()
                else False
            ),
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
        }

    async def list_agents(self) -> list[dict[str, Any]]:
        cur = await self.conn.execute(
            "SELECT * FROM agents ORDER BY "
            "CASE kind WHEN 'channel' THEN 0 ELSE 1 END, created_at ASC"
        )
        rows = await cur.fetchall()
        out: list[dict[str, Any]] = []
        for row in rows:
            if row["kind"] == KIND_CHANNEL:
                members = await self._member_ids(row["id"])
            else:
                members = []
            out.append(self._agent_public(row, members))
        return out

    async def get_agent(self, agent_id: str) -> dict[str, Any] | None:
        cur = await self.conn.execute(
            "SELECT * FROM agents WHERE id = ?", (agent_id,)
        )
        row = await cur.fetchone()
        if row is None:
            return None
        members = (
            await self._member_ids(agent_id)
            if row["kind"] == KIND_CHANNEL
            else []
        )
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

    async def create_channel(
        self,
        name: str,
        title: str,
        description: str,
        avatar: str | None,
        member_ids: list[str],
    ) -> dict[str, Any]:
        base = slugify(name)
        channel_id = base
        n = 2
        while await self.get_agent(channel_id):
            channel_id = f"{base}-{n}"
            n += 1
        now = utcnow()
        await self.conn.execute(
            "INSERT INTO agents "
            "(id, name, title, description, avatar, kind, created_at, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                channel_id,
                name,
                title,
                description,
                avatar,
                KIND_CHANNEL,
                now,
                now,
            ),
        )
        for member_id in member_ids:
            await self.conn.execute(
                "INSERT OR IGNORE INTO channel_members (channel_id, agent_id) "
                "VALUES (?, ?)",
                (channel_id, member_id),
            )
        await self.conn.commit()
        channel = await self.get_agent(channel_id)
        assert channel is not None
        return channel

    async def patch_agent(
        self,
        agent_id: str,
        *,
        name: str | None,
        title: str | None,
        description: str | None,
        avatar: str | None | object = ...,
        shared_project: bool | object = ...,
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
        new_shared = row["shared_project"] if "shared_project" in row.keys() else 0
        if shared_project is not ...:
            new_shared = 1 if shared_project else 0
        updated = utcnow()
        await self.conn.execute(
            "UPDATE agents SET name = ?, title = ?, description = ?, avatar = ?, "
            "shared_project = ?, updated_at = ? WHERE id = ?",
            (
                new_name,
                new_title,
                new_description,
                new_avatar,
                new_shared,
                updated,
                agent_id,
            ),
        )
        await self.conn.commit()
        return await self.get_agent(agent_id)

    async def set_channel_members(
        self, channel_id: str, member_ids: list[str]
    ) -> None:
        await self.conn.execute(
            "DELETE FROM channel_members WHERE channel_id = ?",
            (channel_id,),
        )
        for member_id in member_ids:
            await self.conn.execute(
                "INSERT OR IGNORE INTO channel_members (channel_id, agent_id) "
                "VALUES (?, ?)",
                (channel_id, member_id),
            )
        await self.conn.execute(
            "UPDATE agents SET updated_at = ? WHERE id = ?",
            (utcnow(), channel_id),
        )
        await self.conn.commit()

    async def delete_agent(self, agent_id: str) -> bool:
        cur = await self.conn.execute(
            "DELETE FROM agents WHERE id = ?", (agent_id,)
        )
        await self.conn.commit()
        return cur.rowcount > 0

    async def list_messages(
        self,
        agent_id: str,
        *,
        limit: int,
        before: str | None,
        thread_id: str | None = None,
    ) -> list[dict[str, Any]]:
        conversation = await self.get_agent(agent_id)
        params: list[Any] = [agent_id]
        where = "WHERE agent_id = ?"
        # 1:1 transcripts are only the user and that agent. Peer traffic lives
        # in the seeded channel.
        is_channel = (
            conversation is not None and conversation.get("kind") == KIND_CHANNEL
        )
        if not is_channel:
            where += " AND (sender_id = ? OR sender_id = ?)"
            params.extend([USER_SENDER_ID, agent_id])
        elif thread_id:
            root_id = await self.resolve_thread_root(agent_id, thread_id)
            where += " AND (id = ? OR reply_to = ?)"
            params.extend([root_id, root_id])
        else:
            # Timeline = roots only. Thread replies and question cards stay
            # behind ?threadId=. Widgets never appear on the timeline.
            where += (
                " AND (reply_to IS NULL OR reply_to = '')"
                " AND (kind IS NULL OR kind != 'widget')"
            )
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

    async def resolve_thread_root(self, agent_id: str, thread_id: str) -> str:
        cur = await self.conn.execute(
            "SELECT id, reply_to FROM messages WHERE id = ? AND agent_id = ?",
            (thread_id, agent_id),
        )
        row = await cur.fetchone()
        if row is None:
            return thread_id
        reply_to = row["reply_to"]
        if reply_to:
            return str(reply_to)
        return str(row["id"])

    async def find_handoff_root(
        self,
        origin_conversation_id: str,
        channel_id: str | None = None,
    ) -> dict[str, Any] | None:
        params: list[Any] = [origin_conversation_id]
        where = (
            "SELECT * FROM messages WHERE kind = 'handoff' "
            "AND origin_conversation_id = ?"
        )
        if channel_id:
            where += " AND agent_id = ?"
            params.append(channel_id)
        where += " ORDER BY created_at ASC LIMIT 1"
        cur = await self.conn.execute(where, params)
        row = await cur.fetchone()
        if row is None and channel_id:
            cur = await self.conn.execute(
                "SELECT * FROM messages WHERE kind = 'handoff' "
                "AND origin_conversation_id = ? ORDER BY created_at ASC LIMIT 1",
                (origin_conversation_id,),
            )
            row = await cur.fetchone()
        if row is None:
            return None
        return await self._message_public(dict(row))

    async def set_message_handoff(
        self, message_id: str, *, channel_id: str, thread_id: str
    ) -> None:
        await self.conn.execute(
            "UPDATE messages SET handoff_channel_id = ?, handoff_thread_id = ? "
            "WHERE id = ?",
            (channel_id, thread_id, message_id),
        )
        await self.conn.commit()

    async def one_to_one_brief(self, agent_id: str) -> str:
        """Last 8 user+A turns of a 1:1, capped at 2k chars (drop oldest)."""
        cur = await self.conn.execute(
            "SELECT sender_id, sender_name, content FROM messages "
            "WHERE agent_id = ? AND (sender_id = ? OR sender_id = ?) "
            "AND (kind IS NULL OR kind = 'message') "
            "ORDER BY created_at DESC LIMIT 8",
            (agent_id, USER_SENDER_ID, agent_id),
        )
        rows = [dict(r) for r in await cur.fetchall()]
        rows.reverse()
        return format_brief(
            [
                {
                    "senderId": row["sender_id"],
                    "senderName": row["sender_name"],
                    "content": row["content"],
                }
                for row in rows
            ]
        )

    async def _reply_count(self, message_id: str) -> int:
        cur = await self.conn.execute(
            "SELECT COUNT(*) AS n FROM messages WHERE reply_to = ? "
            "AND (kind IS NULL OR kind NOT IN ('tool'))",
            (message_id,),
        )
        row = await cur.fetchone()
        return int(row["n"]) if row is not None else 0

    async def _message_public(self, message: dict[str, Any]) -> dict[str, Any]:
        raw_mentions = message.get("mentions") or "[]"
        if isinstance(raw_mentions, list):
            mentions = raw_mentions
        else:
            try:
                mentions = json.loads(raw_mentions)
            except json.JSONDecodeError:
                mentions = []
        reply_to = message.get("reply_to") or None
        handoff = None
        channel_id = message.get("handoff_channel_id")
        thread_id = message.get("handoff_thread_id")
        if channel_id and thread_id:
            handoff = {"channelId": channel_id, "threadId": thread_id}
        kind = message.get("kind") or "message"
        reply_count = 0
        if not reply_to:
            reply_count = await self._reply_count(message["id"])
        widget = None
        widget_status = None
        widget_values: list[str] = []
        if kind == "widget":
            from snorlax_runtime.widgets import card_body, public_widget

            stored = public_widget(message.get("widget"))
            if stored is not None:
                widget_status = stored.get("status") or "pending"
                raw_values = stored.get("values") or []
                widget_values = [str(item) for item in raw_values if str(item).strip()]
                widget = card_body(stored)
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
            "kind": kind,
            "replyTo": reply_to,
            "handoff": handoff,
            "userAsk": message.get("user_ask"),
            "brief": message.get("brief"),
            "replyCount": reply_count,
            "widget": widget,
            "widgetStatus": widget_status,
            "widgetValues": widget_values,
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
        reply_to: str | None = None,
        kind: str = "message",
        user_ask: str | None = None,
        brief: str | None = None,
        handoff_channel_id: str | None = None,
        handoff_thread_id: str | None = None,
        origin_conversation_id: str | None = None,
        widget: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        message_id = message_id or new_id("msg")
        created = utcnow()
        if sender_id is None:
            sender_id = USER_SENDER_ID if role == "user" else agent_id
        if sender_name is None:
            sender_name = USER_SENDER_NAME if sender_id == USER_SENDER_ID else sender_id
        stored_mentions = json.dumps(mentions or [], ensure_ascii=False)
        if kind == "widget":
            from snorlax_runtime.widgets import WidgetPendingError

            existing = await self.pending_widget(agent_id, thread_id=reply_to)
            if existing is not None:
                raise WidgetPendingError()
        stored_widget = (
            json.dumps(widget, ensure_ascii=False) if widget is not None else None
        )
        await self.conn.execute(
            "INSERT INTO messages "
            "(id, agent_id, role, content, created_at, sender_id, sender_name, "
            "sender_avatar, hop, mentions, reply_to, kind, user_ask, brief, "
            "handoff_channel_id, handoff_thread_id, origin_conversation_id, widget) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
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
                reply_to,
                kind,
                user_ask,
                brief,
                handoff_channel_id,
                handoff_thread_id,
                origin_conversation_id,
                stored_widget,
            ),
        )
        for image in images or []:
            await self._add_image(message_id, image)
        await self.conn.commit()
        cur = await self.conn.execute(
            "SELECT * FROM messages WHERE id = ?", (message_id,)
        )
        row = await cur.fetchone()
        assert row is not None
        return await self._message_public(dict(row))

    async def pending_widget(
        self,
        conversation_id: str,
        *,
        thread_id: str | None = None,
    ) -> dict[str, Any] | None:
        """Latest pending kind=widget in this transcript (or channel thread)."""
        params: list[Any] = [conversation_id, "widget"]
        where = "WHERE agent_id = ? AND kind = ?"
        conversation = await self.get_agent(conversation_id)
        is_channel = (
            conversation is not None and conversation.get("kind") == KIND_CHANNEL
        )
        if is_channel and thread_id:
            root_id = await self.resolve_thread_root(conversation_id, thread_id)
            where += " AND (id = ? OR reply_to = ?)"
            params.extend([root_id, root_id])
        elif is_channel:
            where += " AND (reply_to IS NULL OR reply_to = '')"
        cur = await self.conn.execute(
            f"SELECT * FROM messages {where} ORDER BY created_at DESC",
            params,
        )
        for row in await cur.fetchall():
            public = await self._message_public(dict(row))
            if public.get("widgetStatus") == "pending":
                return public
        return None

    async def get_message(self, message_id: str) -> dict[str, Any] | None:
        cur = await self.conn.execute(
            "SELECT * FROM messages WHERE id = ?", (message_id,)
        )
        row = await cur.fetchone()
        if row is None:
            return None
        return await self._message_public(dict(row))

    async def resolve_widget(
        self,
        message_id: str,
        *,
        status: str,
        values: list[str] | None = None,
    ) -> dict[str, Any] | None:
        from snorlax_runtime.widgets import public_widget

        cur = await self.conn.execute(
            "SELECT * FROM messages WHERE id = ?", (message_id,)
        )
        row = await cur.fetchone()
        if row is None:
            return None
        widget = public_widget(dict(row).get("widget"))
        if widget is None:
            return None
        widget["status"] = status
        widget["values"] = list(values or [])
        await self.conn.execute(
            "UPDATE messages SET widget = ? WHERE id = ?",
            (json.dumps(widget, ensure_ascii=False), message_id),
        )
        await self.conn.commit()
        cur = await self.conn.execute(
            "SELECT * FROM messages WHERE id = ?", (message_id,)
        )
        updated = await cur.fetchone()
        assert updated is not None
        return await self._message_public(dict(updated))

    async def decline_other_pending_widgets(
        self,
        conversation_id: str,
        *,
        keep_id: str,
        thread_id: str | None = None,
    ) -> None:
        params: list[Any] = [conversation_id, "widget", keep_id]
        where = "WHERE agent_id = ? AND kind = ? AND id != ?"
        conversation = await self.get_agent(conversation_id)
        is_channel = (
            conversation is not None and conversation.get("kind") == KIND_CHANNEL
        )
        if is_channel and thread_id:
            root_id = await self.resolve_thread_root(conversation_id, thread_id)
            where += " AND (id = ? OR reply_to = ?)"
            params.extend([root_id, root_id])
        cur = await self.conn.execute(
            f"SELECT id, widget FROM messages {where}",
            params,
        )
        from snorlax_runtime.widgets import public_widget

        for row in await cur.fetchall():
            widget = public_widget(row["widget"])
            if widget and widget.get("status") == "pending":
                await self.resolve_widget(str(row["id"]), status="dismissed")

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
        self,
        conversation_id: str,
        for_agent_id: str | None = None,
        *,
        thread_id: str | None = None,
        wake_pack: dict[str, Any] | None = None,
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
        if wake_pack is not None:
            from snorlax_runtime.handoff import is_report_pack, pack_prompt

            if is_report_pack(wake_pack):
                system = (
                    f"You are {speaker['name']}. You are in a 1:1 with the user. "
                    "A teammate finished work that was routed for this user. The "
                    "next JSON object is a report-back pack: { from, result, "
                    "threadId, userAsk }. Answer the user in this 1:1 with that "
                    "result. If result says the teammate was not reached, tell "
                    "the user that. Speak as yourself, not as the other agent. "
                    "Mentions are runtime-routed. Do not dump ACK chatter. Do "
                    "not prefix the bubble with 'from {name}:'.\n\n"
                    f"{tools_preamble()}\n\n"
                    f"{speaker['description'] or ''}"
                ).strip()
                return [
                    {"role": "system", "content": system},
                    {"role": "user", "content": pack_prompt(wake_pack)},
                ]

            place = (
                f"a {conversation['name']} channel thread after a handoff"
                if is_group
                else "a handoff after a teammate routed a user ask"
            )
            system = (
                f"You are {speaker['name']}. You are in {place}. "
                "A JSON handoff pack is the last user message, not a "
                "quote. You were asked to DO the task in userAsk. Do not "
                "acknowledge that you can. Do not ping-pong. If you have the "
                "answer, state it. Use brief as 1:1 context (user + the "
                "originating agent only). Mention another teammate with "
                "@DisplayName to continue this thread. Do not invent cues "
                "like [agent] or [Group chat:]. Stay silent on FYI notes that "
                "do not ask you anything.\n\n"
                f"{tools_preamble()}\n\n"
                f"{speaker['description'] or ''}"
            ).strip()
            messages: list[dict[str, str]] = [
                {"role": "system", "content": system},
            ]
            if thread_id:
                await self._append_thread_turns(
                    messages, conversation_id, thread_id, who
                )
            messages.append({"role": "user", "content": pack_prompt(wake_pack)})
            return messages
        place = (
            "a shared group channel with every teammate"
            if is_group
            else "a 1:1 with the user"
        )
        routed = (
            ""
            if is_group
            else (
                " If the user @mentions a teammate, the runtime already routes "
                "that mention; do not claim they cannot be reached or that you "
                "cannot talk to them. You may acknowledge you asked them. A "
                "later turn may carry their result."
            )
        )
        system = (
            f"You are {speaker['name']}. You are in {place}. "
            "Mention another teammate with @DisplayName to address them in "
            "the group channel; the runtime routes that mention. 1:1 "
            "transcripts stay between you and the user. Do not invent cues "
            f"like [agent] or [Group chat:]. Stay silent on FYI notes that do "
            f"not ask you anything.{routed}\n\n"
            f"{tools_preamble()}\n\n"
            f"{speaker['description'] or ''}"
        ).strip()
        messages = [{"role": "system", "content": system}]
        if is_group and thread_id:
            await self._append_thread_turns(
                messages, conversation_id, thread_id, who
            )
            return messages
        cur = await self.conn.execute(
            "SELECT sender_id, sender_name, role, content, kind, widget FROM messages "
            "WHERE agent_id = ? ORDER BY created_at ASC",
            (conversation_id,),
        )
        for row in await cur.fetchall():
            sender = row["sender_id"]
            if not is_group and sender not in {USER_SENDER_ID, who}:
                continue
            if (row["kind"] if "kind" in row.keys() else "message") in {
                "tool",
                "handoff",
            }:
                continue
            self._append_turn(messages, row, who)
        return messages

    async def _append_thread_turns(
        self,
        messages: list[dict[str, str]],
        conversation_id: str,
        thread_id: str,
        who: str,
    ) -> None:
        root_id = await self.resolve_thread_root(conversation_id, thread_id)
        cur = await self.conn.execute(
            "SELECT sender_id, sender_name, role, content, kind, widget FROM messages "
            "WHERE agent_id = ? AND (id = ? OR reply_to = ?) "
            "ORDER BY created_at ASC",
            (conversation_id, root_id, root_id),
        )
        for row in await cur.fetchall():
            if (row["kind"] or "message") in {"handoff", "tool"}:
                continue
            self._append_turn(messages, row, who)

    def _append_turn(
        self, messages: list[dict[str, str]], row: Any, who: str
    ) -> None:
        sender = row["sender_id"]
        kind = row["kind"] if "kind" in row.keys() else "message"
        body = row["content"]
        if kind == "widget":
            from snorlax_runtime.widgets import (
                DECLINE_USER_NOTE,
                format_widget_for_model,
                public_widget,
            )

            widget = public_widget(row["widget"] if "widget" in row.keys() else None)
            if widget is not None:
                body = format_widget_for_model(widget)
            messages.append({"role": "assistant", "content": body})
            if widget and widget.get("status") == "dismissed":
                messages.append({"role": "user", "content": DECLINE_USER_NOTE})
            elif widget and widget.get("status") == "resolved":
                picked = [
                    str(item).strip()
                    for item in (widget.get("values") or [])
                    if str(item).strip()
                ]
                messages.append(
                    {
                        "role": "user",
                        "content": "\n".join(picked) or "(empty)",
                    }
                )
            return
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


def dump_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))
