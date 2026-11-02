#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.41 copy and save footnotes.

A completed assistant Footnotes list offers a muted Save beside Copy.
Tap or click writes one GFM definition per rendered note as notes.md.
The title and the painted numbers are not the file. Desktop downloads
the file. iOS opens the system share sheet and does not ask for
photo-library permission. The label reads Saved for 1.5s. Copy writes
those same definitions. A streaming reply hides Save. Message Save
still writes reply.md. v2.40 still writes links.md. v2.21 code-block
Save still writes snippet.py. The control does not take composer
focus. No new animation. No new shortcut. No new HTTP. OpenAPI stays
0.18.0. Never reintroduce computerPane.ts.

Saving a fenced code block as snippet.py was already on main (v2.21).
This cut does not add another code-block control.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "FootnoteSave.swift").read_text(encoding="utf-8")
COPY = (IOS / "FootnoteCopy.swift").read_text(encoding="utf-8")
FOOTNOTES = (IOS / "MarkdownFootnote.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "footnoteSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
LINKS = (ROOT / "desktop" / "src" / "messageLinks.ts").read_text(encoding="utf-8")
CODE = (ROOT / "desktop" / "src" / "codeBlockSave.ts").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.41 copy and save footnotes"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save footnotes"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "notes.md"' in SWIFT
    assert "static func showsSave(completed: Bool, notes: [MarkdownFootnote.Note]) -> Bool" in SWIFT
    assert "static func bodyText(_ notes: [MarkdownFootnote.Note]) -> String" in SWIFT
    assert "static func writeFile(notes: [MarkdownFootnote.Note], filename: String) -> URL?" in SWIFT
    assert "static func markdown(_ notes: [MarkdownFootnote.Note]) -> String" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-footnote" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "completed && !markdown(notes).isEmpty" in SWIFT
    assert "§§SBFN" in SWIFT
    assert '"    \\(line)"' in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'static let copyAria = "Copy footnotes"' in COPY
    assert "static func clipboardText(_ notes: [MarkdownFootnote.Note]) -> String" in COPY
    assert "UIPasteboard" in COPY
    assert "FootnoteSave.markdown" in COPY
    assert 'FOOTNOTE_SAVE_LABEL = "Save"' in DESKTOP
    assert 'FOOTNOTE_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'FOOTNOTE_SAVE_ARIA = "Save footnotes"' in DESKTOP
    assert 'FOOTNOTE_SAVE_FILENAME = "notes.md"' in DESKTOP
    assert "export function footnoteSaveBody" in DESKTOP
    assert "export function showFootnoteSave" in DESKTOP
    assert "export function downloadFootnoteMarkdown" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert 'MESSAGE_LINKS_FILENAME = "links.md"' in LINKS
    assert 'CODE_BLOCK_SAVE_FALLBACK = "snippet.txt"' in CODE
    assert 'python: "py"' in CODE


def test_save_beside_copy() -> None:
    listed = _slice(FOOTNOTES, "struct MarkdownFootnoteList", "struct MarkdownFootnotePopover")
    assert "FootnoteSave.showsSave(completed: completed, notes: notes)" in listed
    assert "FootnoteSave.label(saved: saved)" in listed
    assert "FootnoteSave.accessibilityLabel(saved: saved)" in listed
    assert "FootnoteSave.feedbackNanoseconds" in listed
    assert "FootnoteSave.writeFile(notes: notes, filename: FootnoteSave.filename)" in listed
    assert "FootnoteSave.keepsList()" in listed
    assert "FootnoteCopy.clipboardText(notes)" in listed
    assert "FootnoteCopy.writeClipboard" in listed
    assert "focusable(false)" in listed
    assert "UIActivityViewController" in listed
    assert "saved = false" in listed
    assert "PHPhotoLibrary" not in listed
    assert "withAnimation" not in listed
    assert "UIPasteboard" not in listed
    assert "ListSave" not in listed
    assert "TaskSave" not in listed
    save = _slice(listed, "private func saveNotes", "private struct FootnoteMarkdownShareSheet")
    assert "UIPasteboard" not in save
    assert "MarkdownFootnoteList(" in MARKDOWN
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "FootnoteSave" not in user
    button = _slice(BODY, "function FootnoteActions(", "function mentionifyString(")
    assert "showFootnoteSave(" in button
    assert "downloadFootnoteMarkdown(" in button
    assert 'className={saved ? "md-fn-save is-saved" : "md-fn-save"}' in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    assert "footnoteSaveKeepsList()" in button
    assert "footnoteClipboardText(notes)" in button
    assert "Save footnotes" not in SHORTCUTS
    assert "UIPasteboard" not in FOOTNOTES


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 241. v2.41" in SPEC
    assert "test_ios_footnote_save.py" in CI
    assert "footnoteSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios footnote save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
