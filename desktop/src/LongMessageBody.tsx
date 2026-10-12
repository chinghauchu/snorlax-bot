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
  children,
}: Props) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const [fullPx, setFullPx] = useState(0);

  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const measure = () => {
      const height = el.scrollHeight;
      const nextOverflows = completed && longMessageOverflows(height);
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
    ? LONG_MESSAGE_MAX_PX
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
        <div ref={bodyRef} className="long-message-body">
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
