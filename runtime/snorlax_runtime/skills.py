# SPDX-License-Identifier: Apache-2.0
"""Load SKILL.md recipes. Skills have no trigger of their own."""

from __future__ import annotations

import os
import re
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
