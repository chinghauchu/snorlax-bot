#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.64 / v0.69 iOS per-chat composer drafts.

Switching chats keeps each conversation's unsent text (agentId + threadId,
nil thread = top level). Send clears that conversation's draft. A failed
Send puts the text back on the conversation it was typed in, not whichever
chat is open now. Attachments still clear on switch. Dictation / Speak
cancel as today. Drafts persist across relaunch in UserDefaults
(desktop: localStorage). Up-arrow recall still requires an empty composer.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
DRAFTS = (IOS / "ChatDrafts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_DRAFTS = (ROOT / "desktop" / "src" / "chatDrafts.ts").read_text(encoding="utf-8")
DESKTOP_APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.64 per-chat composer drafts (switch keeps each chat's unsent text; "
    "Send clears; failed Send restores to its own chat; no new HTTP)"
)
PERSIST_PHRASE = (
    "v0.69 per-chat drafts persist (unsent text stays with its chat across "
    "switches and app restart; desktop local storage; iOS UserDefaults; "
    "Send clears; Up-arrow recall only when the composer is empty; no new HTTP)"
)
STORAGE_KEY = "snorlax.chatDrafts"


def _fn(src: str, name: str) -> str:
    markers = (
        f"func {name}",
        f"private func {name}",
        f"async function {name}",
        f"function {name}",
    )
    start = -1
    used = ""
    for marker in markers:
        idx = src.find(marker)
        if idx >= 0:
            start = idx
            used = marker
            break
    if start < 0:
        raise AssertionError(f"missing {name}")
    nxt = src.find("\n    func ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    private func ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    async function ", start + len(used))
    if nxt < 0:
        nxt = src.find("\n    var ", start + len(used))
    return src[start:nxt] if nxt > 0 else src[start:]


def _token(agent_id: str, thread_id: str | None) -> str:
    return f"{agent_id}\0{thread_id or ''}"


def _parse_token(token: str) -> tuple[str, str | None] | None:
    if "\0" not in token:
        return None
    agent_id, _, rest = token.partition("\0")
    if not agent_id:
        return None
    return agent_id, rest or None


def _load(raw: str | None) -> dict[tuple[str, str | None], str]:
    if not raw:
        return {}
    try:
        obj = json.loads(raw)
    except json.JSONDecodeError:
        return {}
    if not isinstance(obj, dict):
        return {}
    slots: dict[tuple[str, str | None], str] = {}
    for token, value in obj.items():
        if not isinstance(token, str) or not isinstance(value, str) or value == "":
            continue
        parsed = _parse_token(token)
        if parsed is None:
            continue
        slots[parsed] = value
    return slots


def _dump(slots: dict[tuple[str, str | None], str]) -> str:
    blob = {
        _token(agent_id, thread_id): text
        for (agent_id, thread_id), text in slots.items()
        if text
    }
    return json.dumps(blob, ensure_ascii=True, separators=(",", ":"))


class Drafts:
    """Same rules as ChatDrafts.swift / chatDrafts.ts, including relaunch."""

    def __init__(self, raw: str | None = None) -> None:
        self.slots = _load(raw)

    @property
    def raw(self) -> str:
        return _dump(self.slots)

    def relaunch(self) -> "Drafts":
        return Drafts(self.raw)

    def get(self, agent_id: str, thread_id: str | None) -> str:
        return self.slots.get((agent_id, thread_id), "")

    def set(self, agent_id: str, thread_id: str | None, text: str) -> None:
        key = (agent_id, thread_id)
        if text == "":
            self.slots.pop(key, None)
        else:
            self.slots[key] = text

    def clear(self, agent_id: str, thread_id: str | None) -> None:
        self.slots.pop((agent_id, thread_id), None)

    def swap(
        self,
        from_agent: str | None,
        from_thread: str | None,
        text: str,
        to_agent: str | None,
        to_thread: str | None,
    ) -> str:
        same = from_agent == to_agent and from_thread == to_thread
        if from_agent is not None and not same:
            self.set(from_agent, from_thread, text)
        if to_agent is None:
            return text if same else ""
        if same:
            return text
        return self.get(to_agent, to_thread)

    def restore(self, agent_id: str, thread_id: str | None, text: str) -> None:
        self.set(agent_id, thread_id, text)


def test_per_chat_and_thread_keys() -> None:
    drafts = Drafts()
    drafts.set("agent-a", None, "hello A")
    drafts.set("agent-b", None, "hello B")
    shown = drafts.swap("agent-a", None, "hello A edited", "agent-b", None)
    assert shown == "hello B"
    assert drafts.get("agent-a", None) == "hello A edited"
    assert drafts.get("agent-b", None) == "hello B"

    drafts.set("chan", None, "timeline")
    drafts.set("chan", "thread-1", "in the thread")
    assert drafts.get("chan", None) != drafts.get("chan", "thread-1")
    timeline = drafts.swap("chan", "thread-1", "thread more", "chan", None)
    assert timeline == "timeline"
    assert drafts.get("chan", "thread-1") == "thread more"
    assert ("chan", None) != ("chan", "thread-1")

    assert "struct Key: Hashable" in DRAFTS
    assert "var agentId: String" in DRAFTS
    assert "var threadId: String?" in DRAFTS
    assert "fromAgentId == toAgentId && fromThreadId == toThreadId" in DRAFTS
    assert "text.isEmpty" in DRAFTS
    assert "chatDraftKey" in DESKTOP_DRAFTS
    assert "from.threadId === to.threadId" in DESKTOP_DRAFTS


def test_clear_on_send_and_failed_send_restores_origin() -> None:
    drafts = Drafts()
    drafts.set("agent-a", None, "typed in A")
    drafts.set("agent-a", "thread-1", "thread draft")
    drafts.set("agent-b", None, "leave B")
    drafts.clear("agent-a", None)
    assert drafts.get("agent-a", None) == ""
    assert drafts.get("agent-a", "thread-1") == "thread draft"
    assert drafts.get("agent-b", None) == "leave B"

    shown = drafts.swap("agent-a", None, "", "agent-b", None)
    assert shown == "leave B"
    drafts.set("agent-b", None, "typed in B")
    drafts.restore("agent-a", None, "typed in A")
    assert drafts.get("agent-a", None) == "typed in A"
    assert drafts.get("agent-b", None) == "typed in B"

    assert "mutating func clear" in DRAFTS
    assert "mutating func restore" in DRAFTS
    assert "clear(agentId: string" in DESKTOP_DRAFTS
    assert "restore(agentId: string" in DESKTOP_DRAFTS


def test_ios_load_swaps_and_send_targets_origin() -> None:
    assert "private var chatDrafts = ChatDrafts()" in MODEL
    load = _fn(MODEL, "loadConversation(")
    assert "adoptComposerDraft(agentId: id, threadId: thread)" in load
    assert load.index("adoptComposerDraft") < load.index("selectedAgentID = id")
    assert "pendingAttachments = []" in load
    assert "cancelDictation()" in load
    assert "stopSpeaking()" in load
    assert "wantsComposerFocus = true" not in load

    adopt = _fn(MODEL, "adoptComposerDraft(")
    assert "chatDrafts.swap(" in adopt
    assert "fromAgentId: composerAgentID" in adopt
    assert "fromThreadId: composerThreadID" in adopt
    assert "fromAgentId: selectedAgentID" not in adopt
    assert "suppressDraftPersist = true" in adopt
    assert adopt.index("suppressDraftPersist = true") < adopt.index("draft = next")
    assert adopt.index("draft = next") < adopt.index("suppressDraftPersist = false")
    assert adopt.index("draft = next") < adopt.index("recallArmed = false")
    assert "pendingComposerCaret = next.utf16.count" in adopt
    assert "wantsComposerFocus" not in adopt
    assert "private func persistOpenDraft()" in MODEL
    assert "composerAgentID ?? selectedAgentID" in MODEL

    select = _fn(MODEL, "select(")
    assert "loadConversation(id, thread: nil, push: push)" in select
    jump = _fn(MODEL, "openJump(")
    assert "loadConversation(channelId, thread: threadId, push: true)" in jump
    close = _fn(MODEL, "closeThread()")
    assert "loadConversation(id, thread: nil, push: false)" in close
    create = _fn(MODEL, "createAgent()")
    assert "await select(agent.id, push: true)" in create

    send = _fn(MODEL, "send()")
    assert "chatDrafts.clear(agentId: originAgentID, threadId: originThreadID)" in send
    assert send.index("chatDrafts.clear") < send.index('draft = ""')
    assert "chatDrafts.restore(agentId: originAgentID, threadId: originThreadID, text: content)" in send
    assert "selectedAgentID == originAgentID && threadID == originThreadID" in send
    assert "draft = content" in send
    assert send.index("selectedAgentID == originAgentID") < send.index("draft = content")
    assert "pendingAttachments = chips" in send
    assert "moveComposer" in DESKTOP_APP
    assert "chatDrafts.current.clear" in DESKTOP_APP
    assert "chatDrafts.current.restore" in DESKTOP_APP
    assert "if (content) setDraft(content)" in DESKTOP_APP


def test_persist_across_relaunch_and_recall_stays_empty_only() -> None:
    drafts = Drafts()
    drafts.set("agent-a", None, "half written")
    drafts.set("agent-b", None, "bee")
    # iPad moves selection to B before adopt. The composer owner is still A.
    shown = drafts.swap("agent-a", None, "half written", "agent-b", None)
    assert shown == "bee"
    assert drafts.get("agent-a", None) == "half written"
    # A leak would treat the already-updated selection as the source and
    # keep A's text as B's live draft.
    leaked = Drafts()
    leaked.set("agent-b", None, "bee")
    followed = leaked.swap("agent-b", None, "half written", "agent-b", None)
    assert followed == "half written"

    revived = drafts.relaunch()
    assert revived.get("agent-a", None) == "half written"
    assert revived.get("agent-b", None) == "bee"
    back = revived.swap("agent-b", None, "bee", "agent-a", None)
    assert back == "half written"
    assert back != ""  # recall refused
    empty = revived.swap("agent-a", None, "half written", "agent-c", None)
    assert empty == ""  # recall allowed

    revived.clear("agent-a", None)
    after_send = revived.relaunch()
    assert after_send.get("agent-a", None) == ""
    assert after_send.get("agent-b", None) == "bee"
    after_send.restore("agent-a", None, "put back")
    assert after_send.relaunch().get("agent-a", None) == "put back"

    assert _load("{") == {}
    assert _load("[]") == {}
    assert _load(json.dumps({"bad": "x"})) == {}
    assert _load(json.dumps({_token("a", None): ""})) == {}
    assert STORAGE_KEY == "snorlax.chatDrafts"
    assert f'static let storageKey = "{STORAGE_KEY}"' in DRAFTS
    assert 'agentId + "\\u{0}"' in DRAFTS
    assert "UserDefaults" in DRAFTS
    assert "JSONSerialization" in DRAFTS
    assert "CHAT_DRAFTS_KEY" in DESKTOP_DRAFTS
    assert "localStorage" in DESKTOP_DRAFTS
    assert "browserDraftStorage" in DESKTOP_APP
    assert "setRecallArmed(false)" in DESKTOP_APP
    assert "RecallDraft.arrowUpRecalls(composerText: draft" in MODEL


def test_openapi_roadmap_ci_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PERSIST_PHRASE in ROADMAP
    assert "python3 ios/scripts/test_ios_chat_drafts.py" in CI
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in DRAFTS
    assert "computerPane.ts" not in MODEL
    assert "/v1/" not in DRAFTS
    assert "/v1/" not in DESKTOP_DRAFTS


def main() -> int:
    tests = [
        test_per_chat_and_thread_keys,
        test_clear_on_send_and_failed_send_restores_origin,
        test_ios_load_swaps_and_send_targets_origin,
        test_persist_across_relaunch_and_recall_stays_empty_only,
        test_openapi_roadmap_ci_no_computer_pane,
    ]
    failed = 0
    for test in tests:
        try:
            test()
            print(f"ok  {test.__name__}")
        except AssertionError as exc:
            failed += 1
            print(f"FAIL {test.__name__}: {exc}", file=sys.stderr)
    if failed:
        print(f"{failed} failed", file=sys.stderr)
        return 1
    print("ok")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
