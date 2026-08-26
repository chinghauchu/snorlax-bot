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
from snorlax_runtime.handoff import (
    REPORT_MISS,
    report_pack,
    strip_involve_kicker,
    wake_pack,
)

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


def a2a_log_channel_id(
    roster: list[dict[str, Any]],
    *,
    preferred: str | None = None,
) -> str | None:
    """Channel that should hold 1:1 @involve traffic, or None to skip the log.

    Seed wins while it exists (body channelId is ignored). After it is gone,
    use preferred only if it is an existing kind=channel row. Unknown or stale
    ids skip the log — do not 422, do not recreate seed, do not pick another.
    """
    channels = [row for row in roster if row.get("kind") == KIND_CHANNEL]
    if any(row["id"] == SEEDED_CHANNEL_ID for row in channels):
        return SEEDED_CHANNEL_ID
    channel_ids = {row["id"] for row in channels}
    if preferred and preferred in channel_ids:
        return preferred
    return None


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

    def preview_runnable(
        self, *, hop: int, edge_from: str, targets: list[str]
    ) -> list[str]:
        """Targets that would survive hop/edge/peer caps at this moment."""
        if hop > MAX_HOP:
            log.info("drop hop_limit hop=%s", hop)
            return []
        simulated = set(self.edges)
        peer_left = MAX_PEER_SENDS - self.peer_sends
        runnable: list[str] = []
        for target in targets:
            if edge_from == target:
                continue
            if edge_from != USER_SENDER_ID and (edge_from, target) in simulated:
                log.info("drop same_edge %s→%s", edge_from, target)
                continue
            if peer_left <= 0:
                log.info("drop peer_limit count=%s", self.peer_sends)
                continue
            if edge_from != USER_SENDER_ID:
                simulated.add((edge_from, target))
            peer_left -= 1
            runnable.append(target)
        return runnable


@dataclass
class _Job:
    agent_id: str
    conversation_id: str
    hop: int
    peer: bool
    edge_from: str
    edge_to: str
    thread_id: str | None = None
    wake_pack: dict[str, Any] | None = None
    origin_conversation_id: str | None = None
    report_back: bool = False
    channel_id: str | None = None
    persist: bool = True


def looks_like_ask(content: str) -> bool:
    """FYI silence for 1:1 involves. Not an ACK classifier.

    Do not detect "I can help" in code. B is prompted to do the work.
    """
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
        "answer",
        "calculate",
        "compute",
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
    reply_to: str | None = None,
    preferred_channel_id: str | None = None,
) -> AsyncIterator[tuple[str, dict[str, Any]]]:
    """Persist the user message, then route hop-0 and peer work.

    Yields SSE (event, payload) only for messages that land in `conversation`.
    Holds the originating POST open until every mentioned peer has done or
    been dropped and A has reported for each. 1:1 @involves log as handoff
    threads on the seed channel when it exists; otherwise on body
    `channelId` if that row is an existing channel; otherwise no channel
    log (B still wakes).
    """
    origin_id = conversation["id"]
    is_group = conversation.get("kind") == KIND_CHANNEL
    roster = await store.list_agents()
    log_channel_id = (
        None
        if is_group
        else a2a_log_channel_id(roster, preferred=preferred_channel_id)
    )
    stored_reply_to = None
    thread_id: str | None = None
    if is_group:
        if reply_to:
            stored_reply_to = await store.resolve_thread_root(origin_id, reply_to)
            thread_id = stored_reply_to
    user_saved = await store.add_message(
        agent_id=origin_id,
        role="user",
        content=content,
        images=images,
        sender_id=USER_SENDER_ID,
        sender_name=USER_SENDER_NAME,
        sender_avatar=None,
        hop=0,
        mentions=mentions,
        reply_to=stored_reply_to,
    )
    if is_group and thread_id is None:
        thread_id = user_saved["id"]
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
                channel_id=log_channel_id,
            )
        )

    await _enqueue_mentions(
        jobs,
        mentions,
        store=store,
        roster=roster,
        turn=turn,
        source_id=origin_id,
        source_sender=USER_SENDER_ID,
        source_name=conversation["name"],
        quoted=content,
        hop=0 if is_group else 1,
        is_group=is_group,
        peer=not is_group,
        thread_id=thread_id,
        origin_user_message_id=user_saved["id"] if not is_group else None,
        origin_conversation_id=None if is_group else origin_id,
        handoff_channel_id=log_channel_id,
    )

    i = 0
    while i < len(jobs):
        job = jobs[i]
        i += 1
        roster = await store.list_agents()
        agent = next((a for a in roster if a["id"] == job.agent_id), None)
        if agent is None or agent.get("kind") == KIND_CHANNEL:
            continue

        # Report-back is A's 1:1 assistant turn, not a peer send. Hop caps
        # only apply to A2A / channel peer sends.
        if job.report_back:
            in_origin = job.conversation_id == origin_id
            events, saved = await _generate(
                store,
                backend,
                agent=agent,
                conversation_id=job.conversation_id,
                hop=0,
                stream=in_origin,
                thread_id=None,
                wake_pack=job.wake_pack,
                report_back=True,
                persist=job.persist,
            )
            if in_origin:
                for event, payload in events:
                    yield event, payload
            del saved
            continue

        dropped = False
        if not turn.allow_hop(job.hop):
            dropped = True
        elif not turn.allow_edge(job.edge_from, job.edge_to):
            dropped = True
        elif job.peer and not turn.allow_peer():
            dropped = True

        if dropped:
            _queue_report_back(
                jobs,
                at=i,
                from_agent=agent,
                result=REPORT_MISS,
                thread_id=job.thread_id or "",
                user_ask=_job_user_ask(job),
                origin_conversation_id=job.origin_conversation_id,
                channel_id=job.channel_id,
            )
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
            thread_id=job.thread_id,
            wake_pack=job.wake_pack,
            persist=job.persist,
        )
        if in_origin:
            for event, payload in events:
                yield event, payload
        if saved is None:
            _queue_report_back(
                jobs,
                at=i,
                from_agent=agent,
                result=REPORT_MISS,
                thread_id=job.thread_id or "",
                user_ask=_job_user_ask(job),
                origin_conversation_id=job.origin_conversation_id,
                channel_id=job.channel_id,
            )
            continue

        source_is_group = (
            (await store.get_agent(job.conversation_id) or {}).get("kind")
            == KIND_CHANNEL
        )
        next_thread = job.thread_id or (
            saved.get("replyTo") if source_is_group else None
        )
        origin_conversation = job.origin_conversation_id or (
            None if source_is_group else job.conversation_id
        )
        await _enqueue_mentions(
            jobs,
            saved.get("mentions") or [],
            store=store,
            roster=await store.list_agents(),
            turn=turn,
            source_id=job.conversation_id,
            source_sender=agent["id"],
            source_name=agent["name"],
            quoted=saved["content"],
            hop=job.hop + 1,
            is_group=source_is_group,
            peer=True,
            thread_id=next_thread or (saved["id"] if source_is_group else None),
            origin_user_message_id=None,
            origin_conversation_id=origin_conversation,
            handoff_channel_id=job.channel_id,
        )
        result = (saved.get("content") or "").strip()
        if result:
            _queue_report_back(
                jobs,
                at=i,
                from_agent=agent,
                result=result,
                thread_id=job.thread_id or saved.get("replyTo") or saved["id"],
                user_ask=_job_user_ask(job),
                origin_conversation_id=origin_conversation,
                channel_id=job.channel_id,
            )


async def _enqueue_mentions(
    jobs: list[_Job],
    mentions: list[dict[str, str]],
    *,
    store: Store,
    roster: list[dict[str, Any]],
    turn: TurnState,
    source_id: str,
    source_sender: str,
    source_name: str,
    quoted: str,
    hop: int,
    is_group: bool,
    peer: bool,
    thread_id: str | None,
    origin_user_message_id: str | None,
    origin_conversation_id: str | None,
    handoff_channel_id: str | None = None,
) -> None:
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
                    thread_id=thread_id,
                    origin_conversation_id=origin_conversation_id,
                    channel_id=handoff_channel_id,
                )
            )
        return

    # 1:1 isolation: never write peer/involve/DM into either 1:1.
    # A2A log: seed if present; else body channelId if it is a real
    # channel; else skip (no fake seed).
    targets = [t for t in targets if t != source_id]
    if not targets:
        return
    through_id = source_sender if source_sender != USER_SENDER_ID else source_id
    through = next((a for a in roster if a["id"] == through_id), None)
    if through is None:
        return
    origin_id = origin_conversation_id or source_id
    user_caused = source_sender == USER_SENDER_ID
    cap_runnable = turn.preview_runnable(
        hop=hop, edge_from=through["id"], targets=targets
    )
    should_report = (not user_caused) or looks_like_ask(quoted)
    if should_report:
        index = {a["id"]: a for a in roster}
        for target_id in targets:
            if target_id in cap_runnable:
                continue
            peer = index.get(target_id)
            if peer is None:
                continue
            _queue_report_back(
                jobs,
                at=len(jobs),
                from_agent=peer,
                result=REPORT_MISS,
                thread_id="",
                user_ask=quoted,
                origin_conversation_id=origin_id,
                channel_id=handoff_channel_id,
            )
    if not cap_runnable:
        return

    channel_id = a2a_log_channel_id(
        roster, preferred=handoff_channel_id
    )
    brief = await store.one_to_one_brief(origin_id)
    pack = wake_pack(
        originating=through,
        user_ask=quoted,
        brief=brief,
        mentioned_ids=cap_runnable,
    )
    if channel_id is None:
        if user_caused and not looks_like_ask(quoted):
            return
        for target in cap_runnable:
            key = (target, target, hop)
            if key in queued:
                continue
            queued.add(key)
            jobs.append(
                _Job(
                    agent_id=target,
                    conversation_id=target,
                    hop=hop,
                    peer=True,
                    edge_from=through["id"],
                    edge_to=target,
                    thread_id=None,
                    wake_pack=pack,
                    origin_conversation_id=origin_id,
                    channel_id=None,
                    persist=False,
                )
            )
        return

    root = await _ensure_handoff(
        store,
        roster=roster,
        through=through,
        origin_id=origin_id,
        user_ask=quoted,
        mentions=mentions,
        hop=max(hop - 1, 0),
        reuse_followup=not user_caused or bool(await store.find_handoff_root(origin_id)),
        channel_id=channel_id,
    )
    if root is None:
        return
    if user_caused and origin_user_message_id:
        await store.set_message_handoff(
            origin_user_message_id,
            channel_id=channel_id,
            thread_id=root["id"],
        )
    if user_caused and not looks_like_ask(quoted):
        return

    pack["brief"] = root.get("brief") or brief
    for target in cap_runnable:
        key = (target, channel_id, hop)
        if key in queued:
            continue
        queued.add(key)
        jobs.append(
            _Job(
                agent_id=target,
                conversation_id=channel_id,
                hop=hop,
                peer=True,
                edge_from=through["id"],
                edge_to=target,
                thread_id=root["id"],
                wake_pack=pack,
                origin_conversation_id=origin_id,
                channel_id=channel_id,
            )
        )


def _job_user_ask(job: _Job) -> str:
    pack = job.wake_pack or {}
    ask = pack.get("userAsk")
    return ask if isinstance(ask, str) else ""


def _queue_report_back(
    jobs: list[_Job],
    *,
    at: int,
    from_agent: dict[str, Any],
    result: str,
    thread_id: str,
    user_ask: str,
    origin_conversation_id: str | None,
    channel_id: str | None = None,
) -> None:
    """Enqueue A's 1:1 report as the next job (report-as-each-lands).

    Not a peer send. Does not increment hop or spend hop budget.
    """
    if not origin_conversation_id:
        return
    if from_agent["id"] == origin_conversation_id:
        return
    origin = origin_conversation_id
    from_id = from_agent["id"]
    for existing in jobs:
        if not existing.report_back:
            continue
        pack = existing.wake_pack or {}
        if (
            existing.agent_id == origin
            and (pack.get("from") or {}).get("id") == from_id
        ):
            return
    pack = report_pack(
        from_agent=from_agent,
        result=result,
        thread_id=thread_id,
        user_ask=user_ask,
    )
    jobs.insert(
        min(at, len(jobs)),
        _Job(
            agent_id=origin,
            conversation_id=origin,
            hop=0,
            peer=False,
            edge_from=from_agent["id"],
            edge_to=origin,
            thread_id=thread_id or None,
            wake_pack=pack,
            origin_conversation_id=origin,
            report_back=True,
            channel_id=channel_id,
        ),
    )


async def _ensure_handoff(
    store: Store,
    *,
    roster: list[dict[str, Any]],
    through: dict[str, Any],
    origin_id: str,
    user_ask: str,
    mentions: list[dict[str, str]],
    hop: int,
    reuse_followup: bool,
    channel_id: str,
) -> dict[str, Any] | None:
    del roster  # through is already resolved
    existing = await store.find_handoff_root(origin_id, channel_id)
    brief = await store.one_to_one_brief(origin_id)
    if existing is not None:
        if reuse_followup:
            await store.add_message(
                agent_id=existing.get("agentId") or channel_id,
                role="assistant",
                content=user_ask,
                sender_id=through["id"],
                sender_name=through["name"],
                sender_avatar=through.get("avatar"),
                hop=hop,
                mentions=mentions,
                reply_to=existing["id"],
            )
            # Refresh brief on the root so later wakes see the latest 1:1.
            await store.conn.execute(
                "UPDATE messages SET brief = ? WHERE id = ?",
                (brief, existing["id"]),
            )
            await store.conn.commit()
            existing = await store.find_handoff_root(origin_id, channel_id)
        return existing
    return await store.add_message(
        agent_id=channel_id,
        role="assistant",
        content=user_ask,
        sender_id=through["id"],
        sender_name=through["name"],
        sender_avatar=through.get("avatar"),
        hop=hop,
        mentions=mentions,
        kind="handoff",
        user_ask=user_ask,
        brief=brief,
        origin_conversation_id=origin_id,
    )


async def _generate(
    store: Store,
    backend: Any,
    *,
    agent: dict[str, Any],
    conversation_id: str,
    hop: int,
    stream: bool,
    thread_id: str | None = None,
    wake_pack: dict[str, Any] | None = None,
    report_back: bool = False,
    persist: bool = True,
) -> tuple[list[tuple[str, dict[str, Any]]], dict[str, Any] | None]:
    from snorlax_runtime.inference import InferenceError

    assistant_id = new_id("msg")
    roster = await store.list_agents()
    conversation = await store.get_agent(conversation_id)
    is_group = bool(conversation and conversation.get("kind") == KIND_CHANNEL)
    transcript = await store.inference_transcript(
        conversation_id,
        for_agent_id=agent["id"],
        thread_id=thread_id,
        wake_pack=wake_pack,
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

    content = strip_involve_kicker("".join(pieces))
    mentions: list[dict[str, str]] = []
    if not report_back:
        mentions = resolve_agent_mentions(
            content, roster, is_group=is_group, self_id=agent["id"]
        )
    if persist:
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
            reply_to=thread_id if is_group else None,
        )
    else:
        saved = {
            "id": assistant_id,
            "content": content,
            "mentions": mentions,
            "replyTo": None,
        }
    if stream:
        events.append(("message.done", saved))
    return events, saved
