# SPDX-License-Identifier: Apache-2.0
"""Load SKILL.md recipes. Skills have no trigger of their own."""

from __future__ import annotations

import os
import re
import shutil
from dataclasses import dataclass
from pathlib import Path
from typing import Any

SKILL_FILENAME = "SKILL.md"
SKILLS_DIRNAME = "skills"
SOURCE_WORKSPACE = "workspace"
SOURCE_SKILLS_DIR = "skillsDir"
MAX_SKILLS = 24
MAX_WALK_DEPTH = 6
MAX_BODY_CHARS = 8000

_FRONTMATTER = re.compile(
    r"\A---[ \t]*\n(?P<meta>.*?)\n---[ \t]*\n?(?P<body>.*)\Z",
    re.S,
)


@dataclass(frozen=True)
class Skill:
    name: str
    description: str
    body: str
    source: str
    path: str

    def public(self) -> dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "source": self.source,
            "path": self.path,
        }

    def listed(self) -> dict[str, str]:
        return {"id": skill_slug(self), "name": self.name}


def skills_dir(data_dir: Path) -> Path:
    return data_dir / SKILLS_DIRNAME


def parse_skill_markdown(
    text: str, *, source: str, path: str
) -> Skill | None:
    match = _FRONTMATTER.match(text.replace("\r\n", "\n"))
    if match is None:
        return None
    meta = _parse_frontmatter(match.group("meta"))
    name = str(meta.get("name") or "").strip()
    description = str(meta.get("description") or "").strip()
    if not name or not description:
        return None
    body = match.group("body").strip()
    return Skill(
        name=name,
        description=description,
        body=body,
        source=source,
        path=path,
    )


def _parse_frontmatter(block: str) -> dict[str, str]:
    """Minimal YAML mapping for ``name`` / ``description`` scalars."""
    out: dict[str, str] = {}
    for raw_line in block.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or ":" not in line:
            continue
        key, value = line.split(":", 1)
        key = key.strip()
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
            value = value[1:-1]
        if key:
            out[key] = value
    return out


def _iter_skill_files(root: Path) -> list[Path]:
    if not root.is_dir():
        return []
    found: list[Path] = []
    root_resolved = root.resolve()
    for dirpath, dirnames, filenames in os.walk(root):
        current = Path(dirpath)
        try:
            depth = len(current.resolve().relative_to(root_resolved).parts)
        except ValueError:
            continue
        if depth > MAX_WALK_DEPTH:
            dirnames[:] = []
            continue
        dirnames[:] = [
            name
            for name in dirnames
            if not name.startswith(".") and name not in {"node_modules", ".git"}
        ]
        if SKILL_FILENAME in filenames:
            found.append(current / SKILL_FILENAME)
        if len(found) >= MAX_SKILLS:
            break
    return found[:MAX_SKILLS]


def find_skill(skills: list[Skill], name: str) -> Skill | None:
    wanted = (name or "").strip()
    if not wanted:
        return None
    lowered = wanted.casefold()
    for skill in skills:
        if skill.name == wanted or skill_slug(skill) == wanted:
            return skill
    for skill in skills:
        if skill.name.casefold() == lowered or skill_slug(skill).casefold() == lowered:
            return skill
    return None


def skill_slug(skill: Skill) -> str:
    """Directory name under skills/<slug>/SKILL.md, else frontmatter name."""
    rel = (skill.path or "").replace("\\", "/").strip("/")
    parts = [p for p in rel.split("/") if p]
    if len(parts) >= 2 and parts[-1] == SKILL_FILENAME:
        return parts[-2]
    return skill.name


def load_skills(data_dir: Path, workspace: Path | None = None) -> list[Skill]:
    """Discover SKILL.md from the global skills dir and the agent workspace.

    Workspace files win on the same ``name``. Missing dirs are empty, not an
    error. No marketplace catalog.
    """
    by_name: dict[str, Skill] = {}
    global_root = skills_dir(data_dir)
    for path in _iter_skill_files(global_root):
        skill = _read_file(path, source=SOURCE_SKILLS_DIR, root=global_root)
        if skill is not None:
            by_name[skill.name] = skill
    if workspace is not None:
        for path in _iter_skill_files(workspace):
            skill = _read_file(path, source=SOURCE_WORKSPACE, root=workspace)
            if skill is not None:
                by_name[skill.name] = skill
    return list(by_name.values())


def _read_file(path: Path, *, source: str, root: Path) -> Skill | None:
    try:
        text = path.read_text(encoding="utf-8")
    except OSError:
        return None
    try:
        rel = str(path.relative_to(root)).replace("\\", "/")
    except ValueError:
        rel = path.name
    return parse_skill_markdown(text, source=source, path=rel)


_SLASH_TOKEN = re.compile(r"(?:^|\s)/")


def slash_rest(content: str) -> str | None:
    """Text after a token-start ``/``, or None.

    Unknown names stay a normal user message — this helper does not error.
    """
    text = content or ""
    match = _SLASH_TOKEN.search(text)
    if match is None:
        return None
    rest = text[match.end() :]
    if not rest or rest[0].isspace():
        return None
    return rest


def _slash_name_candidates(rest: str) -> list[str]:
    """Longest-first ``/Name`` / ``/slug`` candidates for ``find_skill``.

    Names may contain spaces (``/Status check``). First whitespace token
    still matches a slug (``/known-skill please``).
    """
    line = (rest or "").split("\n", 1)[0].strip()
    if not line:
        return []
    parts = line.split()
    return [" ".join(parts[:i]) for i in range(len(parts), 0, -1)]


def invoked_skill(skills: list[Skill], content: str) -> Skill | None:
    """Match ``/slug`` or ``/Name`` at a token start (1:1 load path).

    Uses ``find_skill`` (slug or frontmatter name, case-insensitive).
    No match → None (plain user text, not an error). Channel callers skip.
    """
    text = content or ""
    for match in _SLASH_TOKEN.finditer(text):
        rest = text[match.end() :]
        if not rest or rest[0].isspace():
            continue
        for candidate in _slash_name_candidates(rest):
            found = find_skill(skills, candidate)
            if found is not None:
                return found
    return None


def skill_ask_from_turn(
    transcript: list[dict[str, Any]],
    wake_pack: dict[str, Any] | None,
) -> str:
    """User ask that may start with ``/name``. Skip JSON wake packs."""
    if wake_pack and wake_pack.get("userAsk") is not None:
        return str(wake_pack.get("userAsk") or "")
    for item in reversed(transcript or []):
        if item.get("role") != "user":
            continue
        content = str(item.get("content") or "")
        stripped = content.lstrip()
        if stripped.startswith("{") and stripped.endswith("}"):
            continue
        return content
    return ""


def skill_invoke_preamble(skill: Skill) -> str:
    """Load this SKILL.md into the current turn (user ``/name`` invoke)."""
    body = skill.body
    if len(body) > MAX_BODY_CHARS:
        body = body[: MAX_BODY_CHARS - 1] + "…"
    return (
        f"The user invoked skill {skill.name} with /{skill.name}. "
        "Follow this SKILL.md recipe for this turn instead of inventing "
        "a new procedure.\n\n"
        f"### Invoked skill: {skill.name}\n{skill.description}\n\n{body}"
    ).strip()


def skills_preamble(skills: list[Skill]) -> str:
    if not skills:
        return ""
    chunks = [
        "Skills are reusable recipes you may follow. They have no trigger "
        "of their own — a routine or the user ask is the when. When a "
        "skill matches the work, follow its body instead of inventing a "
        "new procedure."
    ]
    for skill in skills:
        body = skill.body
        if len(body) > MAX_BODY_CHARS:
            body = body[: MAX_BODY_CHARS - 1] + "…"
        origin = (
            "workspace SKILL.md"
            if skill.source == SOURCE_WORKSPACE
            else "runtime skills dir"
        )
        chunks.append(
            f"### Skill: {skill.name} ({origin}, {skill.path})\n"
            f"{skill.description}\n\n{body}".strip()
        )
    return "\n\n".join(chunks)


_SLUG_SAFE = re.compile(r"[^a-z0-9]+")


def slugify_skill_name(name: str) -> str:
    slug = _SLUG_SAFE.sub("-", (name or "").strip().casefold()).strip("-")
    return (slug[:80] or "skill").rstrip("-")


def _yaml_scalar(value: str) -> str:
    text = (value or "").replace("\n", " ").strip()
    if not text:
        return '""'
    if any(ch in text for ch in ":#{}[]&*?|>!%@`'\"\\") or text[:1] in {"-", "?"}:
        escaped = text.replace("\\", "\\\\").replace('"', '\\"')
        return f'"{escaped}"'
    return text


def skill_body_from_capture(capture: object) -> str:
    """Turn a recorded demonstration into a v0.9-runnable recipe.

    The agent replays with ``computer_click`` / ``computer_key`` (same
    tools as v0.15). Screenshots next to SKILL.md are context, not a
    stub.
    """
    events = list(getattr(capture, "events", None) or [])
    lines = [
        "This is a recorded demonstration on the agent's 1280×800 sandbox.",
        "Replay it with `computer_click` and `computer_key` in this order.",
        "Do not invent extra clicks. Do not skip a step.",
        "Screenshots `start.png` and `end.png` sit next to this SKILL.md "
        "as visual context for the desktop at record start and stop.",
        "",
        "## Replay",
        "",
    ]
    steps = _replay_steps(events)
    if not steps:
        lines.append(
            "No pointer or key events were captured. The start/end "
            "screenshots still describe the desktop; re-record if the "
            "task needs clicks."
        )
    else:
        for index, step in enumerate(steps, start=1):
            lines.append(f"{index}. {step}")
    lines.append("")
    lines.append("## Recorded events")
    lines.append("")
    lines.append("```")
    if events:
        for event in events:
            lines.append(_event_line(event))
    else:
        lines.append("(none)")
    lines.append("```")
    return "\n".join(lines).strip() + "\n"


def _replay_steps(events: list[dict[str, object]]) -> list[str]:
    steps: list[str] = []
    typed: list[str] = []

    def flush_typed() -> None:
        if not typed:
            return
        text = "".join(typed)
        steps.append(f"computer_key type text={text!r} (type this string)")
        typed.clear()

    for event in events:
        kind = str(event.get("kind") or "")
        etype = str(event.get("type") or "")
        if kind == "pointer" and etype in {"click", "down"}:
            flush_typed()
            x = int(event.get("x") or 0)
            y = int(event.get("y") or 0)
            steps.append(f"computer_click x={x} y={y}")
        elif kind == "key":
            text = str(event.get("text") or "").strip()
            key = str(event.get("key") or "")
            if etype == "type" and text:
                typed.append(text)
            elif etype == "type" and len(key) == 1:
                typed.append(key)
            elif etype in {"down", "type"} and key in {"Enter", "Return"}:
                flush_typed()
                steps.append("computer_key key=Enter type=down")
            elif etype in {"down", "type"} and key in {"Backspace", "Delete", "Tab", "Escape"}:
                flush_typed()
                steps.append(f"computer_key key={key} type=down")
            elif etype == "up":
                continue
            elif etype in {"down", "type"} and key:
                flush_typed()
                steps.append(f"computer_key key={key} type={etype}")
    flush_typed()
    return steps


def _event_line(event: dict[str, object]) -> str:
    kind = str(event.get("kind") or "")
    etype = str(event.get("type") or "")
    if kind == "pointer":
        return f"pointer {etype} {event.get('x')},{event.get('y')}"
    key = event.get("key")
    text = event.get("text")
    extra = f" text={text!r}" if text else ""
    return f"key {etype} {key}{extra}"


def render_skill_markdown(name: str, description: str, body: str) -> str:
    text = (body or "").replace("\r\n", "\n").strip()
    if text:
        text += "\n"
    return (
        f"---\nname: {_yaml_scalar(name)}\n"
        f"description: {_yaml_scalar(description)}\n---\n\n{text}"
    )


def skill_disk_path(
    data_dir: Path, workspace: Path | None, skill: Skill
) -> Path:
    root = (
        workspace
        if skill.source == SOURCE_WORKSPACE and workspace is not None
        else skills_dir(data_dir)
    )
    return root / skill.path


def skill_wire(
    data_dir: Path, workspace: Path | None, skill: Skill
) -> dict[str, str]:
    """GET/PATCH shape: full SKILL.md source (frontmatter + recipe)."""
    path = skill_disk_path(data_dir, workspace, skill)
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        raw = render_skill_markdown(skill.name, skill.description, skill.body)
    return {"id": skill_slug(skill), "name": skill.name, "body": raw}


def compose_skill_markdown(
    name: str, body: str, *, description: str = ""
) -> str:
    """Write-ready SKILL.md. Body may be full source or recipe-only."""
    title = (name or "").strip()
    text = (body or "").replace("\r\n", "\n")
    if not title or not text.strip():
        raise ValueError("name and body are required")
    match = _FRONTMATTER.match(text if text.endswith("\n") else text + "\n")
    if match is not None:
        meta = _parse_frontmatter(match.group("meta"))
        desc = (
            str(meta.get("description") or "").strip()
            or description
            or title
        )
        recipe = match.group("body")
        return render_skill_markdown(title, desc, recipe)
    return render_skill_markdown(title, description or title, text)


def _compose_patched_markdown(skill: Skill, name: str, body: str) -> str:
    return compose_skill_markdown(
        name, body, description=skill.description or ""
    )


def patch_skill(
    data_dir: Path,
    workspace: Path | None,
    sid: str,
    *,
    name: str,
    body: str,
) -> Skill | None:
    """Rewrite SKILL.md in place. Keep slug/id stable. Empty name/body is 422."""
    skill = find_skill(load_skills(data_dir, workspace), sid)
    if skill is None:
        return None
    markdown = _compose_patched_markdown(skill, name, body)
    path = skill_disk_path(data_dir, workspace, skill)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(markdown, encoding="utf-8")
    updated = parse_skill_markdown(
        markdown, source=skill.source, path=skill.path
    )
    if updated is None:
        raise ValueError("failed to write skill")
    return updated


def delete_skill(
    data_dir: Path, workspace: Path | None, sid: str
) -> bool:
    """Remove SKILL.md (and its slug directory under the skills dir)."""
    skill = find_skill(load_skills(data_dir, workspace), sid)
    if skill is None:
        return False
    path = skill_disk_path(data_dir, workspace, skill)
    if not path.is_file():
        return False
    parent = path.parent
    path.unlink()
    roots = [skills_dir(data_dir)]
    if workspace is not None:
        roots.append(workspace)
    try:
        resolved_roots = [root.resolve() for root in roots if root.exists()]
        resolved_parent = parent.resolve()
    except OSError:
        return True
    if resolved_parent in resolved_roots:
        return True
    if parent.name == skill_slug(skill):
        shutil.rmtree(parent, ignore_errors=True)
    return True


def write_authored_skill(data_dir: Path, name: str, body: str) -> Skill:
    """Persist a blank New skill as SKILL.md on the v0.9 load path.

    No computer capture. Writes ``SNORLAX_DATA_DIR/skills/<slug>/SKILL.md``
    via ``slugify_skill_name``. ``body`` is the same shape as PATCH: full
    SKILL.md source (frontmatter plus recipe) or recipe-only.
    """
    markdown = compose_skill_markdown(name, body)
    slug = slugify_skill_name((name or "").strip())
    root = skills_dir(data_dir) / slug
    root.mkdir(parents=True, exist_ok=True)
    path = root / SKILL_FILENAME
    path.write_text(markdown, encoding="utf-8")
    skill = parse_skill_markdown(
        markdown, source=SOURCE_SKILLS_DIR, path=f"{slug}/{SKILL_FILENAME}"
    )
    if skill is None:
        raise ValueError("failed to write skill")
    return skill


def write_taught_skill(data_dir: Path, name: str, capture: object) -> Skill:
    """Persist a recorded capture as SKILL.md on the v0.9 load path.

    Writes ``SNORLAX_DATA_DIR/skills/<slug>/SKILL.md`` plus start/end
    PNG context. Discard is omitting this write.
    """
    title = (name or "").strip()
    if not title:
        raise ValueError("name is required")
    slug = slugify_skill_name(title)
    root = skills_dir(data_dir) / slug
    root.mkdir(parents=True, exist_ok=True)
    description = (
        f"Recorded demonstration: {title}. Replay with computer_click "
        "and computer_key on the 1280×800 sandbox."
    )
    body = skill_body_from_capture(capture)
    markdown = render_skill_markdown(title, description, body)
    path = root / SKILL_FILENAME
    path.write_text(markdown, encoding="utf-8")
    start_png = getattr(capture, "start_png", None)
    end_png = getattr(capture, "end_png", None)
    if isinstance(start_png, (bytes, bytearray)) and start_png:
        (root / "start.png").write_bytes(bytes(start_png))
    if isinstance(end_png, (bytes, bytearray)) and end_png:
        (root / "end.png").write_bytes(bytes(end_png))
    skill = parse_skill_markdown(
        markdown, source=SOURCE_SKILLS_DIR, path=f"{slug}/{SKILL_FILENAME}"
    )
    if skill is None:
        raise ValueError("failed to write skill")
    return skill
