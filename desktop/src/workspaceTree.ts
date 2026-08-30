// SPDX-License-Identifier: Apache-2.0

export const COMPUTER_PANE_WIDTH_PX = 320;
export const COMPUTER_OPEN_KEY = "snorlax.computerOpen";
export const BINARY_TOO_LARGE = "binary / too large";
export const EMPTY_WORKSPACE_COPY = "Empty workspace";

/** Desktop-wide pane flag. Missing or anything else → collapsed. */
export function loadComputerOpen(stored: string | null): boolean {
  return stored === "1" || stored === "true";
}

export function storeComputerOpen(open: boolean): string {
  return open ? "1" : "0";
}

export type WorkspaceEntry = {
  name: string;
  kind: "file" | "dir";
  size?: number | null;
};

export function joinWorkspacePath(parent: string, name: string): string {
  const base = (parent || ".").replace(/\\/g, "/").replace(/\/+$/, "");
  const leaf = name.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!base || base === ".") return leaf;
  return `${base}/${leaf}`;
}

/** Client-side guard only. The runtime jail is authoritative. */
export function isEscapePath(path: string): boolean {
  const raw = (path || ".").trim().replace(/\\/g, "/");
  if (!raw) return false;
  if (raw.startsWith("/")) return true;
  return raw.split("/").some((part) => part === "..");
}

export function previewNote(err: { status?: number; message?: string }): string {
  const message = (err.message || "").toLowerCase();
  if (err.status === 422 && message.includes("binary")) {
    return BINARY_TOO_LARGE;
  }
  if (err.status === 422 && message.includes("too large")) {
    return BINARY_TOO_LARGE;
  }
  return err.message || BINARY_TOO_LARGE;
}
