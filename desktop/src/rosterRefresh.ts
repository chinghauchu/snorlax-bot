// SPDX-License-Identifier: Apache-2.0
/** Smallest sidebar refresh after create_agent / create_channel tool.done. */

export const ROSTER_CREATE_TOOLS = ["create_agent", "create_channel"] as const;

export function shouldRefreshRosterOnToolDone(
  name: string,
  ok: boolean | null | undefined,
): boolean {
  if (ok !== true) return false;
  return name === "create_agent" || name === "create_channel";
}
