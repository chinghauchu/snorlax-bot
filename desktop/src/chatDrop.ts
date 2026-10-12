// SPDX-License-Identifier: Apache-2.0

/**
 * v0.75: drag files onto the open chat to attach them.
 * A file drag includes the "Files" type. A text selection does not.
 * Esc clears the overlay and does not send. No HTTP.
 */

export const DROP_FILES_LABEL = "Drop files to attach";

export function dragCarriesFiles(
  types: ArrayLike<string> | Iterable<string> | null | undefined,
): boolean {
  if (!types) return false;
  for (const type of Array.from(types as ArrayLike<string>)) {
    if (type === "Files") return true;
  }
  return false;
}

/** Esc clears the overlay. Other Esc jobs stay put while it is showing. */
export function escapeClearsFileDrop(open: boolean): boolean {
  return open;
}
