// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import { readdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import {
  BINARY_TOO_LARGE,
  COMPUTER_OPEN_KEY,
  isEscapePath,
  joinWorkspacePath,
  loadComputerOpen,
  previewNote,
  storeComputerOpen,
} from "./workspaceTree.ts";

test("src filenames must not collide on case-insensitive volumes", () => {
  const srcDir = dirname(fileURLToPath(import.meta.url));
  const names = readdirSync(srcDir);
  const byStem = new Map<string, string[]>();
  for (const name of names) {
    const stem = name.replace(/\.[^.]+$/, "").toLowerCase();
    const group = byStem.get(stem);
    if (group) group.push(name);
    else byStem.set(stem, [name]);
  }
  const collisions = [...byStem.values()].filter((group) => group.length > 1);
  assert.deepEqual(
    collisions,
    [],
    `case-insensitive stem collision in desktop/src: ${collisions
      .map((group) => group.join(" vs "))
      .join("; ")}`,
  );
  assert.equal(
    names.some((name) => name.toLowerCase() === "computerpane.ts"),
    false,
    "computerPane.ts collides with ComputerPane.tsx on macOS",
  );
});

test("joinWorkspacePath stays relative", () => {
  assert.equal(joinWorkspacePath(".", "app.py"), "app.py");
  assert.equal(joinWorkspacePath("", "app.py"), "app.py");
  assert.equal(joinWorkspacePath("src", "app.py"), "src/app.py");
  assert.equal(joinWorkspacePath("src/", "lib/a.ts"), "src/lib/a.ts");
});

test("isEscapePath catches .. and absolute paths", () => {
  assert.equal(isEscapePath("src/app.py"), false);
  assert.equal(isEscapePath("."), false);
  assert.equal(isEscapePath("../secret"), true);
  assert.equal(isEscapePath("/etc/passwd"), true);
  assert.equal(isEscapePath("foo/../../etc/passwd"), true);
});

test("computer open flag is desktop-wide and defaults collapsed", () => {
  assert.equal(COMPUTER_OPEN_KEY, "snorlax.computerOpen");
  assert.doesNotMatch(COMPUTER_OPEN_KEY, /agent/i);
  assert.equal(loadComputerOpen(null), false);
  assert.equal(loadComputerOpen(""), false);
  assert.equal(loadComputerOpen("0"), false);
  assert.equal(loadComputerOpen("false"), false);
  assert.equal(loadComputerOpen("1"), true);
  assert.equal(loadComputerOpen("true"), true);
  assert.equal(storeComputerOpen(true), "1");
  assert.equal(storeComputerOpen(false), "0");
});

test("previewNote maps binary policy to the short copy", () => {
  assert.equal(
    previewNote({ status: 422, message: "binary / too large" }),
    BINARY_TOO_LARGE,
  );
  assert.equal(
    previewNote({ status: 422, message: "path escapes workspace" }),
    "path escapes workspace",
  );
});
