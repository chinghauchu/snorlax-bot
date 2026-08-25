# SPDX-License-Identifier: Apache-2.0
"""@mention parsing and hop-limited agent routing."""

from __future__ import annotations

import logging
import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from typing import Any

from snorlax_runtime import (
    EVERYONE_ID,
    KIND_CHANNEL,
    USER_SENDER_ID,
    USER_SENDER_NAME,
)
from snorlax_runtime.db import Store, new_id

log = logging.getLogger("snorlax.routing")

MAX_HOP = 3
MAX_PEER_SENDS = 4

# @Name at a token boundary. Unique prefix matching is case-insensitive.
AT_RE = re.compile(r"(?<![A-Za-z0-9_])@([A-Za-z][A-Za-z0-9._-]*)")


class MentionError(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


def parse_at_tokens(content: str) -> list[str]:
    return AT_RE.findall(content)


def _agents_only(roster: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [row for row in roster if row.get("kind") != KIND_CHANNEL]


def match_token(token: str, agents: list[dict[str, Any]]) -> str | None:
    """Return an agent id, EVERYONE_ID, or None if unknown.

    Raises MentionError on ambiguous prefixes.
    """
    if token.casefold() == EVERYONE_ID:
        return EVERYONE_ID
    exact = [
        a for a in agents if a["name"].casefold() == token.casefold()
    ]
    if len(exact) == 1:
        return exact[0]["id"]
    if len(exact) > 1:
        raise MentionError(f"Ambiguous @{token}")
    prefixes = [
        a
        for a in agents
        if a["name"].casefold().startswith(token.casefold())
    ]
    if len(prefixes) == 1:
        return prefixes[0]["id"]
    if len(prefixes) > 1:
        raise MentionError(f"Ambiguous @{token}")
    return None


def _mention_record(agent: dict[str, Any] | None, *, everyone: bool = False) -> dict[str, str]:
    if everyone:
        return {"id": EVERYONE_ID, "name": "everyone"}
    assert agent is not None
    return {"id": agent["id"], "name": agent["name"]}


def _by_id(agents: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    return {a["id"]: a for a in agents}


def resolve_user_mentions(
    content: str,
    payload_ids: list[str] | None,
    roster: list[dict[str, Any]],
    *,
    is_group: bool,
) -> list[dict[str, str]]:
    """Resolve chips + @DisplayName. Unknown/ambiguous → MentionError."""
    agents = _agents_only(roster)
    index = _by_id(agents)
    found: list[dict[str, str]] = []
    seen: set[str] = set()

    def add(record: dict[str, str]) -> None:
        if record["id"] in seen:
            return
        seen.add(record["id"])
        found.append(record)

    for raw_id in payload_ids or []:
        if raw_id == EVERYONE_ID:
            if not is_group:
                raise MentionError("@everyone is only valid in the group")
            add(_mention_record(None, everyone=True))
            continue
        agent = index.get(raw_id)
        if agent is None:
            raise MentionError("Unknown @mention")
        add(_mention_record(agent))

    for token in parse_at_tokens(content):
        matched = match_token(token, agents)
        if matched is None:
            raise MentionError(f"Unknown @{token}")
        if matched == EVERYONE_ID:
            if not is_group:
                raise MentionError("@everyone is only valid in the group")
            add(_mention_record(None, everyone=True))
            continue
        add(_mention_record(index[matched]))

    return found


def resolve_agent_mentions(
    content: str,
    roster: list[dict[str, Any]],
    *,
    is_group: bool,
    self_id: str,
) -> list[dict[str, str]]:
    """Agent-authored @Name. Unknown is ignored. @everyone is group-only."""
    agents = _agents_only(roster)
    index = _by_id(agents)
    found: list[dict[str, str]] = []
    seen: set[str] = set()
    for token in parse_at_tokens(content):
        try:
            matched = match_token(token, agents)
        except MentionError:
            continue
        if matched is None:
            continue
        if matched == EVERYONE_ID:
            if not is_group:
                continue
            if EVERYONE_ID in seen:
                continue
            seen.add(EVERYONE_ID)
            found.append(_mention_record(None, everyone=True))
            continue
        if matched == self_id or matched in seen:
            continue
        seen.add(matched)
        found.append(_mention_record(index[matched]))
    return found


def expand_mention_targets(
    mentions: list[dict[str, str]],
    roster: list[dict[str, Any]],
    *,
    exclude: str | None = None,
) -> list[str]:
    agents = _agents_only(roster)
    if any(m["id"] == EVERYONE_ID for m in mentions):
        return [a["id"] for a in agents if a["id"] != exclude]
    return [m["id"] for m in mentions if m["id"] != exclude]


@dataclass
class TurnState:
    peer_sends: int = 0
    edges: set[tuple[str, str]] = field(default_factory=set)

    def allow_hop(self, hop: int) -> bool:
        if hop > MAX_HOP:
            log.info("drop hop_limit hop=%s", hop)
            return False
        return True

    def allow_edge(self, src: str, dst: str) -> bool:
        if src == USER_SENDER_ID:
            return True
        if src == dst:
            return False
        if (src, dst) in self.edges:
            log.info("drop same_edge %s→%s", src, dst)
            return False
        return True

    def commit_edge(self, src: str, dst: str) -> None:
        if src != USER_SENDER_ID:
            self.edges.add((src, dst))

    def allow_peer(self) -> bool:
        if self.peer_sends >= MAX_PEER_SENDS:
            log.info("drop peer_limit count=%s", self.peer_sends)
            return False
        return True

    def commit_peer(self) -> None:
        self.peer_sends += 1


@dataclass
class _Job:
    agent_id: str
    conversation_id: str
    hop: int
    peer: bool
    edge_from: str
    edge_to: str
    mirror_to: str | None = None
    involve_from: str | None = None
    involve_text: str | None = None


def involve_text(through_name: str, quoted: str) -> str:
    snippet = quoted.strip().replace("\n", " ")
    if len(snippet) > 280:
        snippet = snippet[:277] + "..."
    return f"{USER_SENDER_NAME} mentioned you in {through_name}: {snippet}"


def looks_like_ask(content: str) -> bool:
    stripped = content.strip()
    if not stripped:
        return False
    if "?" in stripped:
        return True
    lowered = stripped.casefold()
    ask_markers = (
        "please",
        "can you",
        "could you",
        "would you",
        "what ",
        "who ",
        "when ",
        "where ",
        "why ",
        "how ",
        "need you",
        "want you",
        "mentioned you",
    )
    return any(marker in lowered for marker in ask_markers)


async def run_user_turn(
    *,
    store: Store,
    backend: Any,
    conversation: dict[str, Any],
    content: str,
    images: list[dict[str, Any]],
    mentions: list[dict[str, str]],
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Persist the user message, then route hop-0 and peer work.

    Yields SSE (event, payload) only for messages that land in `conversation`.
    """
    origin_id = conversation["id"]
    is_group = conversation.get("kind") == KIND_CHANNEL
    roster = await store.list_agents()
    await store.add_message(
        agent_id=origin_id,
        role="user",
        content=content,
        images=images,
        sender_id=USER_SENDER_ID,
        sender_name=USER_SENDER_NAME,
        sender_avatar=None,
        hop=0,
        mentions=mentions,
    )
    turn = TurnState()
    jobs: list[_Job] = []

    if not is_group:
        jobs.append(
            _Job(
                agent_id=origin_id,
                conversation_id=origin_id,
                hop=0,
                peer=False,
                edge_from=USER_SENDER_ID,
                edge_to=origin_id,
            )
        )

    _enqueue_mentions(
        jobs,
        mentions,
        roster=roster,
        source_id=origin_id,
        source_sender=USER_SENDER_ID,
        source_name=conversation["name"],
        quoted=content,
        hop=0 if is_group else 1,
        is_group=is_group,
        peer=not is_group,
    )

    i = 0
    while i < len(jobs):
        job = jobs[i]
        i += 1
        roster = await store.list_agents()
        agent = next((a for a in roster if a["id"] == job.agent_id), None)
        if agent is None or agent.get("kind") == KIND_CHANNEL:
            continue
        if not turn.allow_hop(job.hop):
            continue
        if not turn.allow_edge(job.edge_from, job.edge_to):
            continue
        if job.peer and not turn.allow_peer():
            continue

        if job.involve_from and job.involve_text:
            through = next(
                (a for a in roster if a["id"] == job.involve_from), None
            )
            if through is None:
                continue
            involve = await store.add_message(
                agent_id=job.conversation_id,
                role="assistant",
                content=job.involve_text,
                sender_id=through["id"],
                sender_name=through["name"],
                sender_avatar=through["avatar"],
                hop=job.hop,
                mentions=[],
            )
            turn.commit_edge(job.edge_from, job.edge_to)
            turn.commit_peer()
            if job.conversation_id == origin_id:
                yield "message.done", involve
            # Mention-driven involve is an ask. FYI DMs with no ask stay silent.
            if not looks_like_ask(job.involve_text):
                continue
            reply_job = _Job(
                agent_id=job.agent_id,
                conversation_id=job.conversation_id,
                hop=job.hop,
                peer=True,
                edge_from=job.agent_id,
                edge_to=job.involve_from,
                mirror_to=job.mirror_to,
            )
            jobs.append(reply_job)
            continue

        turn.commit_edge(job.edge_from, job.edge_to)
        if job.peer:
            turn.commit_peer()

        in_origin = job.conversation_id == origin_id
        events, saved = await _generate(
            store,
            backend,
            agent=agent,
            conversation_id=job.conversation_id,
            hop=job.hop,
            stream=in_origin,
        )
        if in_origin:
            for event, payload in events:
                yield event, payload
        if saved is None:
            continue
        if job.mirror_to and job.mirror_to != job.conversation_id:
            await store.add_message(
                agent_id=job.mirror_to,
                role="assistant",
                content=saved["content"],
                sender_id=saved["senderId"],
                sender_name=saved["senderName"],
                sender_avatar=saved["senderAvatar"],
                hop=saved["hop"],
                mentions=saved["mentions"],
            )

        reply_group = job.conversation_id == origin_id and is_group
        in_origin_dm = job.conversation_id == origin_id and not is_group
        source_is_group = reply_group or (
            (await store.get_agent(job.conversation_id) or {}).get("kind")
            == KIND_CHANNEL
        )
        _enqueue_mentions(
            jobs,
            saved.get("mentions") or [],
            roster=await store.list_agents(),
            source_id=job.conversation_id,
            source_sender=agent["id"],
            source_name=agent["name"],
            quoted=saved["content"],
            hop=job.hop + 1,
            is_group=source_is_group,
            peer=True,
            mirror_hint=job.conversation_id if in_origin_dm or not source_is_group else None,
        )


def _enqueue_mentions(
    jobs: list[_Job],
    mentions: list[dict[str, str]],
    *,
    roster: list[dict[str, Any]],
    source_id: str,
    source_sender: str,
    source_name: str,
    quoted: str,
    hop: int,
    is_group: bool,
    peer: bool,
    mirror_hint: str | None = None,
) -> None:
    targets = expand_mention_targets(
        mentions, roster, exclude=source_sender if source_sender != USER_SENDER_ID else None
    )
    queued = {(j.agent_id, j.conversation_id, j.hop, j.involve_from) for j in jobs}
    for target in targets:
        if not is_group and target == source_id:
            continue
        if is_group:
            key = (target, source_id, hop, None)
            if key in queued:
                continue
            queued.add(key)
            jobs.append(
                _Job(
                    agent_id=target,
                    conversation_id=source_id,
                    hop=hop,
                    peer=peer,
                    edge_from=source_sender,
                    edge_to=target,
                )
            )
            continue
        # 1:1: deliver an involve into the mentioned agent's transcript.
        text = involve_text(source_name, quoted)
        key = (target, target, hop, source_id)
        if key in queued:
            continue
        queued.add(key)
        jobs.append(
            _Job(
                agent_id=target,
                conversation_id=target,
                hop=hop,
                peer=True,
                edge_from=source_sender if source_sender != USER_SENDER_ID else source_id,
                edge_to=target,
                mirror_to=source_id,
                involve_from=source_id if source_sender == USER_SENDER_ID else source_sender,
                involve_text=text,
            )
        )


async def _generate(
    store: Store,
    backend: Any,
    *,
    agent: dict[str, Any],
    conversation_id: str,
    hop: int,
    stream: bool,
) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any] | None]:
    from snorlax_runtime.inference import InferenceError

    assistant_id = new_id("msg")
    roster = await store.list_agents()
    conversation = await store.get_agent(conversation_id)
    is_group = bool(conversation and conversation.get("kind") == KIND_CHANNEL)
    transcript = await store.inference_transcript(
        conversation_id, for_agent_id=agent["id"]
    )
    pieces: list[str] = []
    events: list[tuple[str, dict[str, Any]]] = []
    try:
        async for delta in backend.stream(transcript):
            pieces.append(delta)
            if stream:
                events.append(
                    (
                        "message.delta",
                        {
                            "id": assistant_id,
                            "role": "assistant",
                            "delta": delta,
                            "senderId": agent["id"],
                            "senderName": agent["name"],
                            "senderAvatar": agent["avatar"],
                        },
                    )
                )
    except InferenceError as exc:
        if stream:
            events.append(("error", {"error": exc.message}))
        return events, None

    content = "".join(pieces)
    mentions = resolve_agent_mentions(
        content, roster, is_group=is_group, self_id=agent["id"]
    )
    saved = await store.add_message(
        agent_id=conversation_id,
        role="assistant",
        content=content,
        message_id=assistant_id,
        sender_id=agent["id"],
        sender_name=agent["name"],
        sender_avatar=agent["avatar"],
        hop=hop,
        mentions=mentions,
    )
    if stream:
        events.append(("message.done", saved))
    return events, saved
