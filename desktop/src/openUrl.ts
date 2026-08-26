// SPDX-License-Identifier: Apache-2.0

/** Open a URL in the desktop OS browser. Tauri `open_url`, else window.open. */
export async function openOsBrowser(url: string): Promise<void> {
  const internals = (
    window as unknown as {
      __TAURI_INTERNALS__?: {
        invoke: (cmd: string, args: Record<string, unknown>) => Promise<unknown>;
      };
    }
  ).__TAURI_INTERNALS__;
  if (internals?.invoke) {
    try {
      await internals.invoke("open_url", { url });
      return;
    } catch {
      // Fall through to window.open when the native command is unavailable.
    }
  }
  window.open(url, "_blank", "noopener,noreferrer");
}
