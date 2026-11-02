#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v2.39 save a task list.

A completed assistant task list offers a muted Save beside Copy.
Tap or click writes the lines that task list was split from as
tasks.md, including the checkbox markers. The display text, with
markers removed, is not the file. Desktop downloads the file. iOS
opens the system share sheet and does not ask for photo-library
permission. The label reads Saved for 1.5s. Copy still copies those
lines. A streaming reply hides Save. A bulleted or numbered list
keeps list.md. A nested task list has its own Save. The control
does not take composer focus. No new animation. No new shortcut.
No new HTTP. OpenAPI stays 0.18.0. Never reintroduce computerPane.ts.

Display-math Copy and Save were already on main (v2.23 math.tex
Copy, v2.29 Save). This cut does not add another math control.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SWIFT = (IOS / "TaskSave.swift").read_text(encoding="utf-8")
COPY = (IOS / "TaskCopy.swift").read_text(encoding="utf-8")
MARKDOWN = (IOS / "AssistantMarkdown.swift").read_text(encoding="utf-8")
CHAT = (IOS / "ChatView.swift").read_text(encoding="utf-8")
DESKTOP = (ROOT / "desktop" / "src" / "taskSave.ts").read_text(encoding="utf-8")
BODY = (ROOT / "desktop" / "src" / "MarkdownBody.tsx").read_text(encoding="utf-8")
LIST = (ROOT / "desktop" / "src" / "listSave.ts").read_text(encoding="utf-8")
MATH = (ROOT / "desktop" / "src" / "mathBlockSave.ts").read_text(encoding="utf-8")
QUOTE = (ROOT / "desktop" / "src" / "quoteSave.ts").read_text(encoding="utf-8")
SHORTCUTS = (IOS / "ChatShortcuts.swift").read_text(encoding="utf-8")
OPENAPI = (ROOT / "protocol" / "openapi.yaml").read_text(encoding="utf-8")
RUNTIME_OPENAPI = (ROOT / "runtime" / "openapi.yaml").read_text(encoding="utf-8")
DESKTOP_OPENAPI = (ROOT / "desktop" / "openapi.yaml").read_text(encoding="utf-8")
ROADMAP = (ROOT / "ROADMAP.md").read_text(encoding="utf-8")
SPEC = (ROOT / "docs" / "specs" / "v0.1-chat-and-agents.md").read_text(encoding="utf-8")
CI = (ROOT / ".github" / "workflows" / "ci.yml").read_text(encoding="utf-8")
PANE = ROOT / "desktop" / "src" / "computerPane.ts"

PHRASE = "v2.39 save a task list"


def _slice(src: str, start: str, end: str) -> str:
    at = src.find(start)
    if at < 0:
        raise AssertionError(f"missing {start}")
    stop = src.find(end, at + len(start))
    return src[at:stop] if stop > at else src[at:]


def test_label_and_body() -> None:
    assert 'static let saveLabel = "Save"' in SWIFT
    assert 'static let savedLabel = "Saved"' in SWIFT
    assert 'static let saveAria = "Save task list"' in SWIFT
    assert 'static let savedAria = "Saved"' in SWIFT
    assert 'static let filename = "tasks.md"' in SWIFT
    assert "static func showsSave(completed: Bool, source: String) -> Bool" in SWIFT
    assert "static func bodyText(_ source: String) -> String" in SWIFT
    assert "static func writeFile(markdown: String, filename: String) -> URL?" in SWIFT
    assert "return nil" in SWIFT
    assert "snorlax-task" in SWIFT
    assert "feedbackNanoseconds: UInt64 = 1_500_000_000" in SWIFT
    assert "completed && !source.isEmpty" in SWIFT
    assert "PHPhotoLibrary" not in SWIFT
    assert "UserDefaults" not in SWIFT
    assert "UIPasteboard" not in SWIFT
    assert "/v1/" not in SWIFT
    assert "http://" not in SWIFT
    assert "https://" not in SWIFT
    assert "computerPane.ts" not in SWIFT
    assert 'static let copyAria = "Copy task list"' in COPY
    assert "static func clipboardText(_ source: String) -> String" in COPY
    assert 'TASK_SAVE_LABEL = "Save"' in DESKTOP
    assert 'TASK_SAVED_LABEL = "Saved"' in DESKTOP
    assert 'TASK_SAVE_ARIA = "Save task list"' in DESKTOP
    assert 'TASK_SAVE_FILENAME = "tasks.md"' in DESKTOP
    assert "export function taskSaveBody" in DESKTOP
    assert "export function showTaskSave" in DESKTOP
    assert "export function downloadTaskMarkdown" in DESKTOP
    assert "return false" in DESKTOP
    assert "/v1/" not in DESKTOP
    assert "fetch(" not in DESKTOP
    assert "localStorage" not in DESKTOP
    assert 'LIST_SAVE_FILENAME = "list.md"' in LIST
    assert 'QUOTE_SAVE_FILENAME = "quote.md"' in QUOTE
    assert 'MATH_BLOCK_SAVE_FILENAME = "math.tex"' in MATH


def test_save_beside_copy() -> None:
    task = _slice(MARKDOWN, "struct MarkdownTaskList", "struct MarkdownTaskRow")
    assert "TaskSave.showsSave(completed: completed, source: markdown)" in task
    assert "TaskSave.bodyText(markdown)" in task
    assert "TaskSave.label(saved: saved)" in task
    assert "TaskSave.accessibilityLabel(saved: saved)" in task
    assert "TaskSave.feedbackNanoseconds" in task
    assert "TaskSave.writeFile(markdown: text, filename: TaskSave.filename)" in task
    assert "TaskSave.keepsTasks()" in task
    assert "TaskCopy.clipboardText(markdown)" in task
    assert "focusable(false)" in task
    assert "UIActivityViewController" in task
    assert "saved = false" in task
    assert "PHPhotoLibrary" not in task
    assert "withAnimation" not in task
    assert ".focus(" not in task
    assert "ListSave" not in task
    assert "ListCopy" not in task
    save = _slice(task, "private func saveTasks", "private struct TaskMarkdownShareSheet")
    assert "UIPasteboard" not in save
    listed = _slice(MARKDOWN, "struct MarkdownListBlock", "struct MarkdownListItemRow")
    assert "ListSave" in listed
    assert "TaskSave" not in listed
    user = _slice(CHAT, "} else if isUser {", "} else {")
    assert "TaskSave" not in user
    button = _slice(BODY, "function TaskActions(", "function CollapsibleList(")
    assert "showTaskSave(" in button
    assert "taskSaveBody(markdown)" in button
    assert "downloadTaskMarkdown(" in button
    assert 'className={saved ? "md-task-save is-saved" : "md-task-save"}' in button
    assert "onMouseDown={keepCodeBlockFocus}" in button
    assert "taskSaveKeepsTasks()" in button
    assert "taskClipboardText(markdown)" in button
    assert "Save task list" not in SHORTCUTS


def test_docs_and_openapi() -> None:
    assert "version: 0.18.0" in OPENAPI
    assert "version: 0.18.0" in RUNTIME_OPENAPI
    assert "version: 0.18.0" in DESKTOP_OPENAPI
    assert "version: 0.19" not in OPENAPI
    assert PHRASE in ROADMAP
    assert PHRASE in SPEC
    assert "## 239. v2.39" in SPEC
    assert "test_ios_task_save.py" in CI
    assert "taskSave.test.ts" in (ROOT / "desktop" / "package.json").read_text(
        encoding="utf-8"
    )
    assert not PANE.exists()


def main() -> int:
    test_label_and_body()
    test_save_beside_copy()
    test_docs_and_openapi()
    print("ios task save ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
