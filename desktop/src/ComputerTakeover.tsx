// SPDX-License-Identifier: Apache-2.0
import {
  KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  getComputer,
  postComputerKey,
  postComputerPointer,
  resolveMediaUrl,
} from "./api";
import {
  COMPUTER_POLL_MS,
  computerImageUrl,
} from "./computerPreview";
import {
  DONE_BUTTON_PX,
  DONE_LABEL,
  DRIVING_LABEL,
  SANDBOX_HEIGHT,
  SANDBOX_WIDTH,
  TAKEOVER_BAR_PX,
  keyEventPayload,
  mapPointerToSandbox,
} from "./computerSession";
import type { Agent, Session } from "./types";

export function ComputerTakeover({
  session,
  agent,
  avatar,
  onDone,
}: {
  session: Session;
  agent: Agent;
  avatar: ReactNode;
  onDone: () => void;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const [blobUrl, setBlobUrl] = useState("");

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    function onEsc(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onDone();
    }
    window.addEventListener("keydown", onEsc, true);
    return () => window.removeEventListener("keydown", onEsc, true);
  }, [onDone]);

  useEffect(() => {
    let dead = false;
    let objectUrl = "";

    async function tick() {
      try {
        const row = await getComputer(session, agent.id);
        if (dead) return;
        const path = computerImageUrl(row);
        if (!path) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = "";
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
        if (!dead) setBlobUrl("");
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
  }, [session, agent.id]);

  async function sendPointer(
    event: { clientX: number; clientY: number },
    type: "move" | "down" | "up" | "click",
  ) {
    const frame = frameRef.current;
    if (!frame) return;
    const rect = frame.getBoundingClientRect();
    const mapped = mapPointerToSandbox(event.clientX, event.clientY, rect);
    if (!mapped) return;
    try {
      await postComputerPointer(session, agent.id, {
        x: mapped.x,
        y: mapped.y,
        type,
      });
    } catch {
      /* session may have ended */
    }
  }

  async function sendKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onDone();
      return;
    }
    const payload = keyEventPayload({ key: event.key, type: event.type });
    if (!payload) return;
    event.preventDefault();
    event.stopPropagation();
    try {
      await postComputerKey(session, agent.id, payload);
    } catch {
      /* session may have ended */
    }
  }

  return (
    <div
      ref={rootRef}
      className="computer-takeover"
      role="dialog"
      aria-label="Computer"
      tabIndex={0}
      onKeyDown={sendKey}
      onKeyUp={sendKey}
    >
      <header
        className="computer-takeover-bar"
        style={{ height: TAKEOVER_BAR_PX }}
      >
        {avatar}
        <span className="computer-takeover-name">{agent.name}</span>
        <span className="computer-takeover-status">{DRIVING_LABEL}</span>
        <button
          type="button"
          className="primary computer-takeover-done"
          style={{ height: DONE_BUTTON_PX }}
          onClick={onDone}
        >
          {DONE_LABEL}
        </button>
      </header>
      <div className="computer-takeover-stage">
        <div
          ref={frameRef}
          className="computer-takeover-frame"
          style={{ aspectRatio: `${SANDBOX_WIDTH} / ${SANDBOX_HEIGHT}` }}
          onPointerMove={(e) => void sendPointer(e, "move")}
          onPointerDown={(e) => void sendPointer(e, "down")}
          onPointerUp={(e) => void sendPointer(e, "up")}
          onClick={(e) => void sendPointer(e, "click")}
        >
          {blobUrl ? (
            <img src={blobUrl} alt="" draggable={false} />
          ) : (
            <span className="computer-takeover-slot" />
          )}
        </div>
      </div>
    </div>
  );
}
