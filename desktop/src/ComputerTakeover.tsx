// SPDX-License-Identifier: Apache-2.0
import {
  KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  createSkill,
  getComputer,
  postComputerKey,
  postComputerPointer,
  resolveMediaUrl,
  startComputerRecord,
  stopComputerRecord,
} from "./api";
import {
  COMPUTER_POLL_MS,
  computerImageUrl,
} from "./computerPreview";
import {
  CANCEL_LABEL,
  DONE_BUTTON_PX,
  DONE_LABEL,
  DRIVING_LABEL,
  RECORD_LABEL,
  SAVE_AS_SKILL_TITLE,
  SAVE_BUTTON_PX,
  SAVE_LABEL,
  SAVED_FEEDBACK_MS,
  SAVED_LABEL,
  SANDBOX_HEIGHT,
  SANDBOX_WIDTH,
  STOP_LABEL,
  TAKEOVER_BAR_PX,
  doneDisabled,
  escapeAction,
  keyEventPayload,
  mapPointerToSandbox,
  saveDisabled,
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
  const [recording, setRecording] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [skillName, setSkillName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedUntil, setSavedUntil] = useState(0);
  const recordingRef = useRef(false);
  const saveOpenRef = useRef(false);

  useEffect(() => {
    recordingRef.current = recording;
  }, [recording]);
  useEffect(() => {
    saveOpenRef.current = saveOpen;
  }, [saveOpen]);

  useEffect(() => {
    rootRef.current?.focus();
  }, []);

  useEffect(() => {
    function onEsc(event: globalThis.KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      const action = escapeAction(recordingRef.current, saveOpenRef.current);
      if (action === "discard") {
        discardSave();
        return;
      }
      if (action === "stop") {
        void stopCapture();
        return;
      }
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

  async function startCapture() {
    try {
      await startComputerRecord(session, agent.id);
      setRecording(true);
    } catch {
      /* no session */
    }
  }

  async function stopCapture() {
    try {
      await stopComputerRecord(session, agent.id);
    } catch {
      /* already stopped */
    }
    setRecording(false);
    setSkillName("");
    setSaveOpen(true);
  }

  function discardSave() {
    setSaveOpen(false);
    setSkillName("");
  }

  async function saveSkill() {
    const name = skillName.trim();
    if (saveDisabled(name) || saving) return;
    setSaving(true);
    try {
      await createSkill(session, agent.id, { name });
      setSaveOpen(false);
      setSkillName("");
      setSavedUntil(Date.now() + SAVED_FEEDBACK_MS);
    } catch {
      /* capture gone */
    } finally {
      setSaving(false);
    }
  }

  const showSaved = savedUntil > Date.now();

  useEffect(() => {
    if (savedUntil <= 0) return;
    const wait = Math.max(0, savedUntil - Date.now());
    const id = window.setTimeout(() => setSavedUntil(0), wait);
    return () => window.clearTimeout(id);
  }, [savedUntil]);

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
        {showSaved ? (
          <span className="computer-takeover-saved">{SAVED_LABEL}</span>
        ) : null}
        {recording ? (
          <button
            type="button"
            className="computer-takeover-record recording"
            onClick={() => void stopCapture()}
          >
            <span className="computer-takeover-dot" aria-hidden="true" />
            {STOP_LABEL}
          </button>
        ) : (
          <button
            type="button"
            className="computer-takeover-record"
            onClick={() => void startCapture()}
          >
            {RECORD_LABEL}
          </button>
        )}
        <button
          type="button"
          className="primary computer-takeover-done"
          style={{ height: DONE_BUTTON_PX }}
          disabled={doneDisabled(recording)}
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
      {saveOpen ? (
        <div
          className="modal-backdrop plugin-sheet computer-skill-sheet"
          onClick={discardSave}
        >
          <div
            className="modal plugin-add-sheet"
            role="dialog"
            aria-label={SAVE_AS_SKILL_TITLE}
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <h2>{SAVE_AS_SKILL_TITLE}</h2>
              <button
                type="button"
                className="icon-btn"
                aria-label="Close"
                onClick={discardSave}
              >
                ×
              </button>
            </header>
            <div className="profile-form">
              <label>
                Name
                <input
                  className="plugin-add-name computer-skill-name"
                  value={skillName}
                  autoFocus
                  onChange={(e) => setSkillName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveSkill();
                    }
                  }}
                />
              </label>
              <div className="confirm-actions">
                <button type="button" onClick={discardSave}>
                  {CANCEL_LABEL}
                </button>
                <button
                  type="button"
                  className="primary plugin-add-primary computer-skill-save"
                  style={{ height: SAVE_BUTTON_PX }}
                  disabled={saving || saveDisabled(skillName)}
                  onClick={() => void saveSkill()}
                >
                  {SAVE_LABEL}
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
