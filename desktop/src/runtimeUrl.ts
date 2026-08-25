// SPDX-License-Identifier: Apache-2.0

/** Strip whitespace and a trailing slash. Empty string stays empty. */
export function normalizeRuntimeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

/**
 * Restore the Runtime URL after reload.
 *
 * Loopback (`http://127.0.0.1:8787`, `http://localhost:8787`) is first-class
 * for Mac-local. The Settings placeholder may still hint a Spark LAN host
 * for remote use; it is not a ban.
 */
export function loadInitialRuntimeUrl(stored: string, envUrl = ""): string {
  return normalizeRuntimeUrl(stored) || normalizeRuntimeUrl(envUrl);
}
