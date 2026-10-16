// SPDX-License-Identifier: Apache-2.0
import {
  useLayoutEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import {
  LONG_MESSAGE_MAX_PX,
  longMessageOverflows,
  longMessageToggleLabel,
  shouldClampLongMessage,
  showLongMessageToggle,
} from "./longMessage";

type Props = {
  completed: boolean;
  text: string;
  /** The active in-chat find hit is in this bubble. */
  activeFind: boolean;
  /** v0.94: `message` marks completed message text as quotable. */
  quote?: string;
  children: ReactNode;
};

/**
 * Mouse-down must not move focus off the composer. Keyboard users can
 * still tab to the control.
 */
function keepComposerFocus(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

export function LongMessageBody({
  completed,
  text,
  activeFind,
  quote,
  children,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [fullPx, setFullPx] = useState(0);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.scrollHeight;
      const raw = getComputedStyle(el).getPropertyValue("--transcript-scale").trim();
      const parsed = Number(raw);
      const nextScale = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
      setScale((prev) => (prev === nextScale ? prev : nextScale));
      const limit = LONG_MESSAGE_MAX_PX * nextScale;
      const nextOverflows = completed && longMessageOverflows(height, limit);
      setOverflows((prev) => (prev === nextOverflows ? prev : nextOverflows));
      const nextFull = Math.ceil(height);
      setFullPx((prev) => (Math.abs(prev - nextFull) <= 1 ? prev : nextFull));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [completed, text, expanded, activeFind]);

  const clamp = shouldClampLongMessage({
    completed,
    overflows,
    expanded,
    activeFind,
  });
  const showToggle = showLongMessageToggle({
    completed,
    overflows,
    activeFind,
  });
  const maxHeight = clamp
    ? LONG_MESSAGE_MAX_PX * scale
    : expanded && overflows && fullPx > 0
      ? fullPx
      : undefined;

  return (
    <>
      <div
        className="long-message"
        data-collapsed={clamp ? "true" : "false"}
        style={maxHeight == null ? undefined : { maxHeight }}
      >
        <div ref={bodyRef} className="long-message-body" data-quote={quote}>
          {children}
        </div>
      </div>
      {showToggle ? (
        <button
          type="button"
          className="long-message-toggle"
          aria-expanded={expanded}
          onMouseDown={keepComposerFocus}
          onClick={() => setExpanded((value) => !value)}
        >
          {longMessageToggleLabel(expanded)}
        </button>
      ) : null}
    </>
  );
}
