#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.45 iOS mermaid diagrams on LEFT kind=message.

Fenced mermaid on completed assistant LEFT kind=message renders via
WKWebView + bundled mermaid.min.js. Invalid mermaid falls back to fence
chrome. Non-mermaid fences unchanged. Tool / widget / user-right unchanged.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
MERMAID = (IOS / "MermaidView.swift").read_text(encoding="utf-8")
SPEAK = (IOS / "Speak.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_MD = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
DESKTOP_MERMAID = (ROOT / "desktop" / "src" / "mermaid.ts").read_text(encoding="utf-8")
MERMAID_JS = IOS / "mermaid.min.js"


def spoken_text(src: str) -> str:
    text = src
    text = re.sub(r"```[^\n]*\n?([\s\S]*?)```", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.strip()


def test_mermaid_on_left_kind_message() -> None:
    assert "isMermaidLanguage" in MARKDOWN
    assert "MermaidFence" in MARKDOWN
    assert "completed && MarkdownSplit.isMermaidLanguage(language)" in MARKDOWN
    assert "var completed: Bool = true" in MARKDOWN
    assert "AssistantMarkdown(" in CHAT
    assert "completed: completed" in CHAT
    assert "completed: !(model.isSending && index == liveAssistantIdx)" in CHAT
    assert "WKWebView" in MERMAID
    assert "mermaid.min.js" in MERMAID
    assert 'securityLevel: "strict"' in MERMAID
    assert MERMAID_JS.is_file()
    assert MERMAID_JS.stat().st_size > 1000


def test_non_mermaid_fences_unchanged() -> None:
    assert "struct CodeFence" in MARKDOWN
    assert 'Button("Copy")' in MARKDOWN
    assert "ScrollView(.horizontal" in MARKDOWN
    assert ".font(.system(size: 12, design: .monospaced))" in MARKDOWN
    assert "cornerRadius: 8" in MARKDOWN
    assert 'language.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() == "mermaid"' in MARKDOWN


def test_tool_widget_user_right_unchanged() -> None:
    assert "MentionLabel" in CHAT
    user_idx = CHAT.find("MentionLabel(text: message.displayContent")
    assert user_idx > 0
    user_slice = CHAT[user_idx : user_idx + 400]
    assert "AssistantMarkdown" not in user_slice
    assert "MermaidFence" not in user_slice
    assert "isToolLine" in CHAT
    assert "isWidget" in CHAT
    assert "isConnect" in CHAT
    assert "isApprove" in CHAT
    assert "WidgetCardView" in CHAT or "isWidget" in CHAT
    assert "MermaidWebView" not in COMPONENTS


def test_invalid_falls_back_and_streaming_defers() -> None:
    assert "if failed" in MARKDOWN
    assert "FenceSource(source: source)" in MARKDOWN
    assert "failed.wrappedValue = true" in MERMAID
    assert "completed && MarkdownSplit.isMermaidLanguage" in MARKDOWN
    assert "completed: !(model.isSending && index == liveAssistantIdx)" in CHAT
    assert "no cloud" in MERMAID.lower() or "No cloud" in MERMAID
    assert "api.openai.com" not in MERMAID
    assert "mermaid.ink" not in MERMAID
    assert "kroki" not in MERMAID.lower()


def test_speak_treats_mermaid_like_other_fences() -> None:
    assert "Mermaid fences are treated like other fences" in SPEAK
    spoken = spoken_text("```mermaid\ngraph TD; A-->B;\n```")
    assert "graph TD; A-->B;" in spoken
    assert "diagram" not in spoken.lower()
    assert "Speak" not in spoken


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.45" in OPENAPI
    assert "v0.45" in RUNTIME_OPENAPI
    assert "v0.45" in DESKTOP_OPENAPI
    assert "0.18.0" in TYPES
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MARKDOWN
    assert "computerPane.ts" not in MERMAID
    assert "computerPane.ts" not in MODEL
    assert "/v1/mermaid" not in MERMAID
    assert "/v1/chats/" not in MERMAID
    assert 'import("mermaid")' in DESKTOP_MERMAID
    assert "MermaidFence" in DESKTOP_MD


def main() -> int:
    tests = [
        test_mermaid_on_left_kind_message,
        test_non_mermaid_fences_unchanged,
        test_tool_widget_user_right_unchanged,
        test_invalid_falls_back_and_streaming_defers,
        test_speak_treats_mermaid_like_other_fences,
        test_openapi_stays_0180_and_no_computer_pane,
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
