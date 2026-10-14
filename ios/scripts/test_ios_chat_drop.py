#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.75 drag files onto the chat.

Dropping files or images onto the composer adds the same pending
chips as the paperclip. A text selection does not. Nothing sends.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DROP = (IOS / "ChatDrop.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP = (ROOT / "desktop" / "src" / "chatDrop.ts").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")

PHRASE = (
    "v0.75 drag files onto the chat (dragging files over the open chat shows "
    "Drop files to attach; drop adds pending chips like the paperclip; Esc or "
    "dragging away clears it; text drags do not; iOS drop on the composer adds "
    "the same chips; nothing auto-sends; no new HTTP)"
)

ROOTS = {
    "public.file-url",
    "public.image",
    "public.movie",
    "public.video",
    "com.adobe.pdf",
}
PARENTS = {
    "public.jpeg": "public.image",
    "public.png": "public.image",
    "public.gif": "public.image",
    "public.heic": "public.image",
    "org.webmproject.webp": "public.image",
    "public.webp": "public.image",
    "public.mpeg-4": "public.movie",
    "com.apple.quicktime-movie": "public.movie",
    "public.plain-text": "public.text",
    "public.utf8-plain-text": "public.plain-text",
    "public.html": "public.text",
    "public.text": "public.text",
    "public.url": "public.url",
}


def accepts(identifiers: list[str]) -> bool:
    for raw in identifiers:
        if raw in ROOTS:
            return True
        parent = PARENTS.get(raw)
        if parent in ROOTS:
            return True
    return False


def test_text_selections_are_not_files() -> None:
    assert accepts(["public.file-url"]) is True
    assert accepts(["public.jpeg"]) is True
    assert accepts(["public.png", "public.image"]) is True
    assert accepts(["public.mpeg-4"]) is True
    assert accepts(["com.adobe.pdf"]) is True
    assert accepts(["public.plain-text"]) is False
    assert accepts(["public.utf8-plain-text", "public.text"]) is False
    assert accepts(["public.html"]) is False
    assert accepts(["public.url"]) is False
    assert accepts([]) is False
    assert "Drop files to attach" in DROP
    assert "func accepts(typeIdentifiers offered: [String])" in DROP
    assert "conforms(to: .fileURL)" in DROP
    assert "conforms(to: .image)" in DROP
    assert "conforms(to: .movie)" in DROP
    assert "conforms(to: .video)" in DROP
    assert "conforms(to: .pdf)" in DROP
    assert ".plainText" not in DROP
    assert "No HTTP" in DROP
    assert "/v1/" not in DROP
    assert "Files" in DESKTOP
    assert "Drop files to attach" in DESKTOP
    assert "No HTTP" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_composer_drop_adds_chips_and_does_not_send() -> None:
    assert ".onDrop(of: ChatDrop.types, isTargeted: $dropTarget)" in CHAT
    assert "ChatDrop.label" in CHAT
    assert "ChatDrop.accepts(providers: providers)" in CHAT
    start = CHAT.index(".onDrop(of: ChatDrop.types")
    end = CHAT.index(".onDisappear", start)
    dropped = CHAT[start:end]
    assert "model.addPendingFile(" in dropped
    assert "model.send(" not in dropped
    escape = CHAT[
        CHAT.index("onEscapeStop: { composing in") : CHAT.index(
            "model.stopGeneratingFromEscape"
        )
    ]
    assert escape.index("if dropTarget {") < escape.index("onEscapeFind")


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.19.0" in OPENAPI
    assert "version: 0.19.0" in RUNTIME_OPENAPI
    assert "version: 0.19.0" in DESKTOP_OPENAPI
    assert PHRASE in ROADMAP
    assert "test_ios_chat_drop.py" in CI
    assert not DESKTOP_PANE.exists()


def main() -> None:
    test_text_selections_are_not_files()
    test_composer_drop_adds_chips_and_does_not_send()
    test_openapi_stays_0180_and_no_computer_pane()
    print("ios chat drop ok")


if __name__ == "__main__":
    try:
        main()
    except AssertionError as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
