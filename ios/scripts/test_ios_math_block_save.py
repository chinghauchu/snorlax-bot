#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.29 save a math block.

A completed assistant display-math block offers a muted Save beside
Copy. Tap or click writes the TeX interior as math.tex. The $$ 
delimiters are not included. Desktop downloads the file. iOS opens
the system share sheet and does not ask for photo-library permission.
The label reads Saved for 1.5s. Copy still copies that TeX. A
streaming block hides Save, and so does an unclosed block. Inline
math has no Save. A user bubble has no Save. The control does not
take composer focus. No new animation. No new shortcut. No new HTTP.
OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "MathBlockSave.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "mathBlockSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.29 save a math block"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save math"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "math.tex"' in SWIFT
    assert "static func showsSave(completed: Bool, closed: Bool) -> Bool" in SWIFT
    assert "static func bodyText(_ tex: String) -> String" in SWIFT
    assert "static func writeFile(tex: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-math" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'MATH_BLOCK_SAVE_LABEL = "Save"' in DESKTOP
    assert 'MATH_BLOCK_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'MATH_BLOCK_SAVE_ARIA = "Save math"' in DESKTOP
    assert 'MATH_BLOCK_SAVE_FILENAME = "math.tex"' in DESKTOP
    assert "export function mathBlockSaveBody" in DESKTOP
    assert "export function showMathBlockSave" in DESKTOP
    assert "export function downloadMathBlock" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP


def test_save_beside_copy() -> None:
    math = _slice(MARKDOWN, "struct MathBlock", "struct MathInline")
    assert "MathBlockSave.showsSave(completed: completed, closed: closed)" in math
    assert "MathBlockSave.bodyText(source)" in math
    assert "MathBlockSave.label(saved: saved)" in math
    assert "MathBlockSave.accessibilityLabel(saved: saved)" in math
    assert "MathBlockSave.feedbackNanoseconds" in math
    assert "MathBlockSave.writeFile(tex: tex, filename: MathBlockSave.filename)" in math
    assert "MathBlockSave.keepsBlock()" in math
    assert "MathBlockCopy.clipboardText(source)" in math
    assert "focusable(false)" in math
    assert "UIActivityViewController" in math
    assert "PHPhotoLibrary" not in math
    save = _slice(math, "private func saveMath", "var body: some View")
    assert "UIPasteboard" not in save
    assert "raw" not in save
    inline = _slice(MARKDOWN, "struct MathInline", "struct MathFallback")
    assert "MathBlockSave" not in inline
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "MathBlockSave" not in user
    button = _slice(BODY, "function MathBlockCopyButton(", "function MathNode(")
    assert "showMathBlockSave(" in button
    assert "mathBlockSaveBody(tex)" in button
    assert "downloadMathBlock(" in button
    assert 'className="md-math-save"' in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    assert "mathBlockSaveKeepsBlock()" in button
    assert "mathBlockClipboardText(tex)" in button
    assert "Save math" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 229. v2.29" in SPEC
    assert "test_ios_math_block_save.py" in CI
    assert "mathBlockSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios math block save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
