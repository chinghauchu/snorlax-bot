// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import {
  currentLinkStatus,
  linkStatusLabel,
  subscribeLinkStatus,
} from "./linkStatus";

/**
 * v1.35: browser-style destination, pinned to the bottom-left of the
 * chat column. Hidden when no message link is hovered or focused.
 * No fade. The text is the middle-truncated destination; the
 * accessible name is the full URL.
 */
export function LinkStatusPill() {
  const [url, setUrl] = useState<string | null>(() => currentLinkStatus());
  useEffect(() => subscribeLinkStatus(() => setUrl(currentLinkStatus())), []);
  if (!url) return null;
  return (
    <div className="link-status" role="status" aria-label={url}>
      {linkStatusLabel(url)}
    </div>
  );
}
