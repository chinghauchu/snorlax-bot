#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.02 cmark-gfm lowercase HTML declarations.

Checked cmark-gfm 0.29.0.gfm.13 on main first. A declaration
opens only on `<!` plus an ASCII uppercase letter. `<!doctype`
stays in the paragraph, so emphasis and a setext underline
still apply. iOS and desktop stash that `<` before the parser.
An uppercase `<!DOCTYPE` stays a raw declaration.

Streaming stays plain text. Copy keeps markdown source. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
HTML = (IOS / "MarkdownHtmlLiteral.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "markdownHtmlLiteral.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
APP = (ROOT / "desktop" / "src" / "App.tsx").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.02 cmark-gfm lowercase HTML declarations in completed assistant replies"


def test_rules_match() -> None:
    for source in (HTML, DESKTOP):
        assert "v2.02" in source
        assert "isLowerHtmlDeclaration" in source
        assert "ASCII uppercase" in source
        assert "/v1/" not in source
        assert "computerPane" not in source
    assert 'token("<")' in HTML
    assert 'stashMarkdownText("<")' in DESKTOP
    assert "literalizeRawHtml(" in BODY
    assert "copyText(reply.content)" in APP
    assert "UIPasteboard" not in HTML
    assert "withAnimation" not in HTML
    assert not PANE.exists()


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert "/ v2.02 " in ROADMAP
    assert "## 202. v2.02" in SPEC
    assert "test_ios_markdown_declaration.py" in CI
    assert "markdownDeclaration.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )


def main() -> int:
    test_rules_match()
    test_docs_and_openapi()
    print("ios markdown declaration ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
