// SPDX-License-Identifier: Apache-2.0
import { useEffect, useState } from "react";
import { getComputer, resolveMediaUrl } from "./api";
import {
  COMPUTER_LABEL,
  COMPUTER_POLL_MS,
  NO_COMPUTER_YET,
  computerImageUrl,
  showsComputerFrame,
  type ComputerPreviewState,
} from "./computerPreview";
import { OPEN_LABEL, canOpenComputer } from "./computerSession";
import type { Session } from "./types";

export function AgentComputer({
  session,
  agentId,
  open,
  onOpen,
}: {
  session: Session | null;
  agentId: string;
  open: boolean;
  onOpen?: () => void;
}) {
  const [preview, setPreview] = useState<ComputerPreviewState | null>(null);
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    if (!open || !session || !agentId) {
      setPreview(null);
      setBlobUrl("");
      return;
    }
    let dead = false;
    let objectUrl = "";

    async function tick() {
      if (!session) return;
      try {
        const row = await getComputer(session, agentId);
        if (dead) return;
        setPreview(row);
        const path = computerImageUrl(row);
        if (!path) {
          if (objectUrl) {
            URL.revokeObjectURL(objectUrl);
            objectUrl = "";
          }
          setBlobUrl("");
          return;
        }
        const src = resolveMediaUrl(session.baseUrl, path);
        const response = await fetch(src, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!response.ok || dead) return;
        const blob = await response.blob();
        if (dead) return;
        const next = URL.createObjectURL(blob);
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = next;
        setBlobUrl(next);
      } catch {
        if (!dead) {
          setPreview(null);
        }
      }
    }

    void tick();
    const id = window.setInterval(() => {
      void tick();
    }, COMPUTER_POLL_MS);
    return () => {
      dead = true;
      window.clearInterval(id);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, session, agentId]);

  const framed = showsComputerFrame(preview);
  const showOpen = canOpenComputer(preview?.hasSandbox) && Boolean(onOpen);

  return (
    <section className="info-computer" aria-label={COMPUTER_LABEL}>
      <p className="info-computer-header">
        <span>{COMPUTER_LABEL}</span>
        {showOpen ? (
          <button
            type="button"
            className="info-computer-open"
            onClick={onOpen}
          >
            {OPEN_LABEL}
          </button>
        ) : null}
      </p>
      {framed ? (
        <button
          type="button"
          className="info-computer-frame"
          onClick={showOpen ? onOpen : undefined}
        >
          {blobUrl ? (
            <img src={blobUrl} alt="" draggable={false} />
          ) : (
            <span className="info-computer-slot" />
          )}
        </button>
      ) : (
        <p className="info-computer-empty">{NO_COMPUTER_YET}</p>
      )}
    </section>
  );
}
