#!/usr/bin/env python3
# SPDX-License-Identifier: Apache-2.0
"""v0.24 iOS Settings Catalog chrome lock.

Catalog below installed plugins. 12pt muted Catalog. Two 44pt rows
(Slack / GitHub) with 14pt name and trailing 12pt Add. No extra sheet.
Hide the Catalog header when GET catalog is empty. Empty installed still
No plugins yet. Custom Add / Connect / Remove stay. No search.
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
IOS = ROOT / "ios" / "SnorlaxBot"
SETTINGS = (IOS / "SettingsSheet.swift").read_text(encoding="utf-8")
MODEL = (IOS / "AppModel.swift").read_text(encoding="utf-8")
CLIENT = (IOS / "RuntimeClient.swift").read_text(encoding="utf-8")
TYPES = (IOS / "Generated" / "V1Types.swift").read_text(encoding="utf-8")


def test_catalog_below_installed() -> None:
    assert "No plugins yet." in SETTINGS
    assert 'Text("Catalog")' in SETTINGS
    assert "pluginCatalog" in SETTINGS
    assert SETTINGS.index("No plugins yet.") < SETTINGS.index('Text("Catalog")')
    assert SETTINGS.index('Text("Plugins")') < SETTINGS.index('Text("Catalog")')
    assert "if !model.pluginCatalog.isEmpty" in SETTINGS
    assert ".frame(minHeight: 44)" in SETTINGS
    assert '.font(.system(size: 12))' in SETTINGS
    assert '.font(.system(size: 14))' in SETTINGS
    assert 'Button("Add")' in SETTINGS
    assert "addCatalogPlugin" in SETTINGS
    assert "AddPluginSheet" in SETTINGS
    assert "Search plugins" not in SETTINGS
    assert "marketplace" not in SETTINGS.lower()
    assert "Uninstall from catalog" not in SETTINGS


def test_catalog_client_and_model() -> None:
    assert "v1/plugins/catalog" in CLIENT
    assert "listPluginCatalog" in CLIENT
    assert "listPluginCatalog" in MODEL
    assert "addCatalogPlugin" in MODEL
    assert "PluginCatalogEntry" in MODEL
    assert "PluginCreate(" in MODEL
    assert "pluginCatalog = []" in MODEL
    assert "struct PluginCatalogEntry" in TYPES
    assert "computerPane.ts" not in SETTINGS
    assert "computerPane.ts" not in MODEL


def main() -> int:
    tests = [
        test_catalog_below_installed,
        test_catalog_client_and_model,
    ]
    failed = 0
    for test in tests:
        try:
            test()
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
