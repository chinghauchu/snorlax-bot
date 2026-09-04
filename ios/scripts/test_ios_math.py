#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.46 iOS math on LEFT kind=message.

Inline \\( \\) and block $$ on completed assistant LEFT kind=message
render via WKWebView + bundled KaTeX. Invalid math falls back to
monospace source. Mermaid still works. Tool / widget / user-right
unchanged. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
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
MATH = (IOS / "MathView.swift").read_text(encoding="utf-8")
MERMAID = (IOS / "MermaidView.swift").read_text(encoding="utf-8")
SPEAK = (IOS / "Speak.swift").read_text(encoding="utf-8")
COMPONENTS = (IOS / "Components.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_PANE = ROOT / "desktop" / "src" / "computerPane.ts"
DESKTOP_MD = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
DESKTOP_MATH = (ROOT / "desktop" / "src" / "math.ts").read_text(encoding="utf-8")
DESKTOP_MERMAID = (ROOT / "desktop" / "src" / "mermaid.ts").read_text(encoding="utf-8")
KATEX_JS = IOS / "katex.min.js"
KATEX_CSS = IOS / "katex.min.css"
KATEX_FONTS = IOS / "fonts"


def spoken_text(src: str) -> str:
    text = src
    text = re.sub(r"```[^\n]*\n?([\s\S]*?)```", r"\1", text)
    text = re.sub(r"\$\$([\s\S]*?)\$\$", lambda m: m.group(1).strip(), text)
    text = re.sub(r"\\\(([\s\S]*?)\\\)", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    return text.strip()


def test_math_on_left_kind_message() -> None:
    assert "splitInlineMath" in MARKDOWN
    assert "splitBlockMath" in MARKDOWN
    assert "MathBlock" in MARKDOWN
    assert "MathInline" in MARKDOWN
    assert "MathFallback" in MARKDOWN
    assert "var completed: Bool = true" in MARKDOWN
    assert "AssistantMarkdown(" in CHAT
    assert "completed: completed" in CHAT
    assert "completed: !(model.isSending && index == liveAssistantIdx)" in CHAT
    assert "WKWebView" in MATH
    assert "katex.min.js" in MATH
    assert "katex.renderToString" in MATH
    assert "throwOnError: true" in MATH
    assert KATEX_JS.is_file()
    assert KATEX_JS.stat().st_size > 1000
    assert KATEX_CSS.is_file()
    assert KATEX_FONTS.is_dir()
    assert any(KATEX_FONTS.glob("KaTeX_*.woff2"))
    assert r"\(" in MARKDOWN or "\\\\(" in MARKDOWN
    assert "$$" in MARKDOWN
    assert "single `$...$` is never math" in MARKDOWN.lower() or "Single `$...$` is never math" in MARKDOWN


def test_invalid_falls_back_and_streaming_defers() -> None:
    assert "MathFallback" in MARKDOWN
    assert "if failed" in MARKDOWN
    assert "failed.wrappedValue = true" in MATH
    assert "completed && closed" in MARKDOWN
    assert "completed: !(model.isSending && index == liveAssistantIdx)" in CHAT
    assert "no cloud" in MATH.lower() or "No cloud" in MATH
    assert "api.openai.com" not in MATH
    assert "cdn.jsdelivr" not in MATH
    assert "katex.org" not in MATH or "bundled" in MATH.lower()


def test_tool_widget_user_right_unchanged() -> None:
    assert "MentionLabel" in CHAT
    user_idx = CHAT.find("MentionLabel(text: message.displayContent")
    assert user_idx > 0
    user_slice = CHAT[user_idx : user_idx + 400]
    assert "AssistantMarkdown" not in user_slice
    assert "MathBlock" not in user_slice
    assert "isToolLine" in CHAT
    assert "isWidget" in CHAT
    assert "isConnect" in CHAT
    assert "isApprove" in CHAT
    assert "MathWebView" not in COMPONENTS


def test_mermaid_still_works() -> None:
    assert "isMermaidLanguage" in MARKDOWN
    assert "MermaidFence" in MARKDOWN
    assert "completed && MarkdownSplit.isMermaidLanguage(language)" in MARKDOWN
    assert "WKWebView" in MERMAID
    assert "mermaid.min.js" in MERMAID
    assert 'import("mermaid")' in DESKTOP_MERMAID
    assert "MermaidFence" in DESKTOP_MD


def test_speak_treats_math_like_other_markup() -> None:
    assert "Math is spoken as plain TeX source" in SPEAK
    spoken = spoken_text("Energy is \\( E = mc^2 \\).")
    assert "E = mc^2" in spoken
    assert "Speak" not in spoken
    spoken_block = spoken_text("$$\nx = 1\n$$")
    assert "x = 1" in spoken_block
    mermaid = spoken_text("```mermaid\ngraph TD; A-->B;\n```")
    assert "graph TD; A-->B;" in mermaid


def test_openapi_stays_0180_and_no_computer_pane() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "v0.46" in OPENAPI
    assert "v0.46" in RUNTIME_OPENAPI
    assert "v0.46" in DESKTOP_OPENAPI
    assert "0.18.0" in TYPES
    assert not DESKTOP_PANE.exists()
    assert "computerPane.ts" not in CHAT
    assert "computerPane.ts" not in MARKDOWN
    assert "computerPane.ts" not in MATH
    assert "computerPane.ts" not in MODEL
    assert "/v1/math" not in MATH
    assert "/v1/katex" not in MATH
    assert "/v1/chats/" not in MATH
    assert 'from "katex"' in DESKTOP_MATH
    assert "MathNode" in DESKTOP_MD


def main() -> int:
    tests = [
        test_math_on_left_kind_message,
        test_invalid_falls_back_and_streaming_defers,
        test_tool_widget_user_right_unchanged,
        test_mermaid_still_works,
        test_speak_treats_math_like_other_markup,
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
