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
    SEEDED_CHANNEL_ID,
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


def _exact_name_id(token: str, agents: list[dict[str, Any]]) -> str | None:
    """Exact display-name match only. Unknown or ambiguous → None (plain text)."""
    if token.casefold() == EVERYONE_ID:
        return EVERYONE_ID
    exact = [a for a in agents if a["name"].casefold() == token.casefold()]
    if len(exact) == 1:
        return exact[0]["id"]
    return None


def resolve_user_mentions(
    content: str,
    payload_ids: list[str] | None,
    roster: list[dict[str, Any]],
    *,
    is_group: bool,
) -> list[dict[str, str]]:
    """Resolve typeahead chip ids, plus exact `@DisplayName` in the body.

    422 only for an unknown chip id (or `@everyone` chip in a 1:1). Typed
    `@text` that does not exactly match a teammate stays plain text.
    """
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
        matched = _exact_name_id(token, agents)
        if matched is None:
            continue
        if matched == EVERYONE_ID:
            if not is_group:
                continue
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


def involve_channel_text(from_name: str, quoted: str) -> str:
    """Peer/involve chrome for the seeded channel only — never a 1:1."""
    snippet = quoted.strip().replace("\n", " ")
    if len(snippet) > 280:
        snippet = snippet[:277] + "..."
    return f"from {from_name}: {snippet}"


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

    await _enqueue_mentions(
        jobs,
        mentions,
        store=store,
        roster=roster,
        source_id=origin_id,
        source_sender=USER_SENDER_ID,
        source_name=conversation["name"],
        quoted=content,
        images=images,
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

        source_is_group = (
            (await store.get_agent(job.conversation_id) or {}).get("kind")
            == KIND_CHANNEL
        )
        await _enqueue_mentions(
            jobs,
            saved.get("mentions") or [],
            store=store,
            roster=await store.list_agents(),
            source_id=job.conversation_id,
            source_sender=agent["id"],
            source_name=agent["name"],
            quoted=saved["content"],
            images=[],
            hop=job.hop + 1,
            is_group=source_is_group,
            peer=True,
        )


async def _enqueue_mentions(
    jobs: list[_Job],
    mentions: list[dict[str, str]],
    *,
    store: Store,
    roster: list[dict[str, Any]],
    source_id: str,
    source_sender: str,
    source_name: str,
    quoted: str,
    images: list[dict[str, Any]],
    hop: int,
    is_group: bool,
    peer: bool,
) -> None:
    del images  # 1:1 isolation: involve clip is text-only in the channel
    exclude = source_sender if source_sender != USER_SENDER_ID else None
    targets = expand_mention_targets(mentions, roster, exclude=exclude)
    queued = {(j.agent_id, j.conversation_id, j.hop) for j in jobs}
    if is_group:
        for target in targets:
            key = (target, source_id, hop)
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
        return

    # 1:1 isolation: never write peer/involve/DM into either 1:1.
    # Address B in the seeded channel with "from A" + quoted clip, then B replies there.
    targets = [t for t in targets if t != source_id]
    if not targets:
        return
    if next((a for a in roster if a["id"] == SEEDED_CHANNEL_ID), None) is None:
        return
    through_id = source_sender if source_sender != USER_SENDER_ID else source_id
    through = next((a for a in roster if a["id"] == through_id), None)
    if through is None:
        return
    await store.add_message(
        agent_id=SEEDED_CHANNEL_ID,
        role="assistant",
        content=involve_channel_text(source_name if source_sender != USER_SENDER_ID else through["name"], quoted),
        sender_id=through["id"],
        sender_name=through["name"],
        sender_avatar=through.get("avatar"),
        hop=max(hop - 1, 0),
        mentions=mentions,
    )
    if source_sender == USER_SENDER_ID and not looks_like_ask(quoted):
        return
    edge_from = through["id"]
    for target in targets:
        key = (target, SEEDED_CHANNEL_ID, hop)
        if key in queued:
            continue
        queued.add(key)
        jobs.append(
            _Job(
                agent_id=target,
                conversation_id=SEEDED_CHANNEL_ID,
                hop=hop,
                peer=True,
                edge_from=edge_from,
                edge_to=target,
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
