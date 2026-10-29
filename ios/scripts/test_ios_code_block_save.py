#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.21 save a code block.

A completed assistant code fence offers muted Save beside Copy.
Tap or click writes that block's full source as a file. Desktop
downloads it. iOS opens the system share sheet and does not ask
for photo-library permission. Lines hidden by Show more are
included. A streaming fence hides Save. A math block has no Save.
The control does not take composer focus. No new animation. No
new shortcut. No new HTTP. OpenAPI stays 0.18.0. Never
reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "CodeBlockSave.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "codeBlockSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.21 save a code block"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_name_and_body() -> None:
    assert 'static let label = "Save"' in SWIFT
    assert 'static let accessibilityLabel = "Save code"' in SWIFT
    assert 'static let fallbackName = "snippet.txt"' in SWIFT
    assert 'static let stem = "snippet"' in SWIFT
    assert '"python": "py"' in SWIFT
    assert '"c++": "cpp"' in SWIFT
    assert '"c#": "cs"' in SWIFT
    assert '"mermaid": "mmd"' in SWIFT
    assert '"dockerfile": "Dockerfile"' in SWIFT
    assert "static func showsSave(completed: Bool) -> Bool" in SWIFT
    assert "static func keepsFence() -> Bool" in SWIFT
    assert "static func bodyText(_ source: String) -> String" in SWIFT
    assert "static func filename(language: String) -> String" in SWIFT
    assert "static func writeFile(source: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-code" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'CODE_BLOCK_SAVE_LABEL = "Save"' in DESKTOP
    assert 'CODE_BLOCK_SAVE_ARIA = "Save code"' in DESKTOP
    assert 'CODE_BLOCK_SAVE_FALLBACK = "snippet.txt"' in DESKTOP
    assert "export function codeBlockSaveBody" in DESKTOP
    assert "export function codeBlockSaveFilename" in DESKTOP
    assert "export function showCodeBlockSave" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_fence_saves_the_full_source() -> None:
    bar = _slice(MARKDOWN, "struct FenceBar", "struct FenceSource")
    assert "CodeBlockSave.showsSave(completed: completed)" in bar
    assert "CodeBlockSave.label" in bar
    assert "CodeBlockSave.accessibilityLabel" in bar
    assert "CodeBlockSave.filename(language: language)" in bar
    assert "CodeBlockSave.writeFile(source: source" in bar
    assert "CodeBlockSave.keepsFence()" in bar
    assert "focusable(false)" in bar
    assert "UIActivityViewController" in bar
    assert "PHPhotoLibrary" not in bar
    paste = bar.split("UIPasteboard.general.string", 1)[1].split("copied = true", 1)[0]
    assert "CodeBlockSave" not in paste
    assert "showCodeBlockSave(completed)" in BODY
    assert "codeBlockSaveBody(source)" in BODY
    assert "codeBlockSaveFilename(language)" in BODY
    assert 'className="md-fence-save"' in BODY
    assert "onMouseDown={keepCodeBlockFocus}" in BODY
    assert "codeBlockSaveKeepsFence()" in BODY
    math = _slice(MARKDOWN, "struct MathBlock", "struct MathFallback")
    assert "CodeBlockSave" not in math
    assert "Save code" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 221. v2.21" in SPEC
    assert "test_ios_code_block_save.py" in CI
    assert "codeBlockSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_name_and_body()
    test_fence_saves_the_full_source()
    test_docs_and_openapi()
    print("ios code block save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
