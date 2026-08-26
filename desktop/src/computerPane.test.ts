// SPDX-License-Identifier: Apache-2.0
import assert from "node:assert/strict";
import test from "node:test";
import {
  BINARY_TOO_LARGE,
  isEscapePath,
  joinWorkspacePath,
  previewNote,
} from "./computerPane.ts";

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
