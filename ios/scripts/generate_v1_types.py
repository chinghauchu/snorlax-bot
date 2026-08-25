#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""Generate iOS /v1 Codable types from protocol/openapi.yaml.

Source of truth is the locked camelCase contract in protocol/openapi.yaml.
Do not hand-edit the Swift output.

    python3 ios/scripts/generate_v1_types.py
    python3 ios/scripts/generate_v1_types.py --check
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[2]
OPENAPI = ROOT / "protocol" / "openapi.yaml"
OUTPUT = ROOT / "ios" / "SnorlaxBot" / "Generated" / "V1Types.swift"


def swift_ident(name: str) -> str:
    reserved = {
        "associatedtype", "class", "deinit", "enum", "extension", "fileprivate",
        "func", "import", "init", "inout", "internal", "let", "operator",
        "private", "protocol", "public", "static", "struct", "subscript",
        "typealias", "var", "break", "case", "continue", "default", "defer",
        "do", "else", "fallthrough", "for", "guard", "if", "in", "repeat",
        "return", "switch", "where", "while", "as", "Any", "catch", "false",
        "is", "nil", "rethrows", "super", "self", "Self", "throw", "throws",
        "true", "try",
    }
    return f"`{name}`" if name in reserved else name


def unwrap_nullable(schema: dict) -> tuple[dict, bool]:
    if not isinstance(schema, dict):
        return schema, False
    types = schema.get("type")
    nullable = schema.get("nullable") is True
    if isinstance(types, list):
        nulls = [t for t in types if t == "null"]
        rest = [t for t in types if t != "null"]
        nullable = bool(nulls) or nullable
        copy = dict(schema)
        copy["type"] = rest[0] if len(rest) == 1 else rest
        return copy, nullable
    return schema, nullable


def ref_name(schema: dict) -> str | None:
    ref = schema.get("$ref")
    if not isinstance(ref, str):
        return None
    return ref.rsplit("/", 1)[-1]


def swift_type(schema: dict, schemas: dict, hint: str) -> str:
    schema, nullable = unwrap_nullable(schema)
    name = ref_name(schema)
    if name:
        inner = name
    else:
        t = schema.get("type")
        fmt = schema.get("format")
        if t == "string" and fmt == "date-time":
            inner = "Date"
        elif t == "string":
            inner = "String"
        elif t == "integer":
            inner = "Int"
        elif t == "number":
            inner = "Double"
        elif t == "boolean":
            inner = "Bool"
        elif t == "array":
            items = schema.get("items") or {}
            inner = f"[{swift_type(items, schemas, hint + 'Item')}]"
        elif t == "object":
            inner = "[String: JSONValue]"
        else:
            inner = "String"
    return f"{inner}?" if nullable else inner


def emit_enum(name: str, values: list) -> list[str]:
    lines = [
        f"    enum {name}: String, Codable, Hashable, Sendable {{",
    ]
    for value in values:
        ident = str(value)
        lines.append(f"        case {swift_ident(ident)}")
    lines.append("    }")
    return lines


def emit_struct(name: str, schema: dict, schemas: dict) -> str:
    props: dict = schema.get("properties") or {}
    required = set(schema.get("required") or [])
    protocols = ["Codable", "Hashable", "Sendable"]
    if "id" in props and swift_type(props["id"], schemas, "id") in {"String", "Int"}:
        protocols.insert(2, "Identifiable")

    chunks: list[str] = [f"struct {name}: {', '.join(protocols)} {{"]

    nested: list[str] = []
    fields: list[tuple[str, str, bool, bool, bool]] = []  # name, type, optional, required_nullable, nullable

    for prop, spec in props.items():
        spec, nullable = unwrap_nullable(spec)
        enum_values = spec.get("enum") if isinstance(spec, dict) else None
        field_type: str
        if enum_values and spec.get("type") == "string" and not ref_name(spec):
            enum_name = "Role" if prop == "role" else prop[:1].upper() + prop[1:]
            nested.extend(emit_enum(enum_name, enum_values))
            field_type = enum_name
        else:
            field_type = swift_type(spec if not nullable else {**spec, "type": ["null", spec.get("type", "string")]}, schemas, prop)
            if nullable and not field_type.endswith("?"):
                field_type += "?"
        optional = prop not in required
        if optional and not field_type.endswith("?"):
            field_type += "?"
        required_nullable = prop in required and field_type.endswith("?")
        fields.append((prop, field_type, optional, required_nullable, nullable))
        chunks.append(f"    var {swift_ident(prop)}: {field_type}")

    if nested:
        for i, line in enumerate(nested):
            chunks.insert(1 + i, line)
        chunks.insert(1 + len(nested), "")

    # memberwise init
    init_args = []
    for prop, field_type, optional, _required_nullable, _nullable in fields:
        default = " = nil" if optional else ""
        init_args.append(f"{swift_ident(prop)}: {field_type}{default}")
    chunks.append("")
    chunks.append(f"    init({', '.join(init_args)}) {{")
    for prop, _, _, _, _ in fields:
        ident = swift_ident(prop)
        chunks.append(f"        self.{ident} = {ident}")
    chunks.append("    }")

    keys = ", ".join(prop for prop, _, _, _, _ in fields)
    chunks.append("")
    chunks.append(f"    enum CodingKeys: String, CodingKey {{ case {keys} }}")
    chunks.append("")
    chunks.append("    init(from decoder: Decoder) throws {")
    chunks.append("        let container = try decoder.container(keyedBy: CodingKeys.self)")
    for prop, field_type, optional, required_nullable, _nullable in fields:
        ident = swift_ident(prop)
        base = field_type[:-1] if field_type.endswith("?") else field_type
        if optional:
            chunks.append(
                f"        {ident} = try container.decodeIfPresent({base}.self, forKey: .{prop})"
            )
        elif field_type.endswith("?"):
            chunks.append(
                f"        {ident} = try container.decode({base}?.self, forKey: .{prop})"
            )
        else:
            chunks.append(
                f"        {ident} = try container.decode({field_type}.self, forKey: .{prop})"
            )
    chunks.append("    }")
    chunks.append("")
    chunks.append("    func encode(to encoder: Encoder) throws {")
    chunks.append("        var container = encoder.container(keyedBy: CodingKeys.self)")
    for prop, field_type, optional, required_nullable, nullable in fields:
        ident = swift_ident(prop)
        if optional and nullable:
            chunks.append(
                f"        try container.encode({ident}, forKey: .{prop})"
            )
        elif optional:
            chunks.append(
                f"        try container.encodeIfPresent({ident}, forKey: .{prop})"
            )
        else:
            chunks.append(
                f"        try container.encode({ident}, forKey: .{prop})"
            )
    chunks.append("    }")
    chunks.append("}")
    return "\n".join(chunks)


def render(doc: dict) -> str:
    schemas: dict = doc.get("components", {}).get("schemas") or {}
    title = (doc.get("info") or {}).get("title", "Snorlax-Bot")
    version = (doc.get("info") or {}).get("version", "")

    parts = [
        "// SPDX-License-Identifier: Apache-2.0",
        "//",
        f"// Generated from protocol/openapi.yaml ({title} {version}).",
        "// Do not edit by hand. Regenerate with:",
        "//   python3 ios/scripts/generate_v1_types.py",
        "//",
        "import Foundation",
        "",
    ]
    for name, schema in schemas.items():
        if not isinstance(schema, dict):
            continue
        if schema.get("type") != "object" and "properties" not in schema:
            continue
        parts.append(emit_struct(name, schema, schemas))
        parts.append("")
    return "\n".join(parts).rstrip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="exit 1 if output is stale")
    args = parser.parse_args()

    if not OPENAPI.exists():
        print(f"missing {OPENAPI}", file=sys.stderr)
        return 1
    doc = yaml.safe_load(OPENAPI.read_text())
    text = render(doc)
    if args.check:
        current = OUTPUT.read_text() if OUTPUT.exists() else ""
        if current != text:
            print(f"{OUTPUT} is stale; run python3 ios/scripts/generate_v1_types.py", file=sys.stderr)
            return 1
        print("ok")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(text)
    print(f"wrote {OUTPUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
