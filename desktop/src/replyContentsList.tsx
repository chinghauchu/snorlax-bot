// SPDX-License-Identifier: Apache-2.0
import { useLayoutEffect, useRef, type MouseEvent } from "react";
import {
  CONTENTS_LABEL,
  contentsAnchor,
  contentsAncestorsToOpen,
  contentsBubbleFor,
  contentsGoToLabel,
  contentsIndentPx,
  replyContentsEntries,
  scrollContentsHeading,
  type ContentsEntry,
} from "./replyContents.ts";

type Props = {
  messageId: string;
  text: string;
  completed: boolean;
  collapsed: ReadonlySet<number>;
  bubbles: readonly { offset: number }[][];
  open: (offsets: readonly number[]) => void;
  reveal: (bubble: number | null) => void;
};

/**
 * Mouse-down must not move focus off the composer. Keyboard users can
 * still tab to a heading row.
 */
function keepComposerFocus(event: MouseEvent<HTMLButtonElement>) {
  event.preventDefault();
}

/**
 * v2.44: Contents sits above the first bubble of one finished reply.
 * Choosing a row reveals that heading, then scrolls it into view.
 */
export function ReplyContentsList({
  messageId,
  text,
  completed,
  collapsed,
  bubbles,
  open,
  reveal,
}: Props) {
  const entries = replyContentsEntries(text, completed);
  const pending = useRef<number | null>(null);
  useLayoutEffect(() => {
    const offset = pending.current;
    if (offset == null) return;
    if (scrollContentsHeading(contentsAnchor(messageId, offset))) {
      pending.current = null;
    }
  });
  if (entries.length === 0) return null;
  return (
    <nav className="reply-contents" aria-label={CONTENTS_LABEL}>
      <p className="reply-contents-label">{CONTENTS_LABEL}</p>
      {entries.map((entry) => (
        <ContentsRow
          key={entry.offset}
          messageId={messageId}
          entry={entry}
          pending={pending}
          onPrepare={(offset) => {
            open(contentsAncestorsToOpen(text, offset, collapsed));
            reveal(contentsBubbleFor(bubbles, offset));
          }}
        />
      ))}
    </nav>
  );
}

function ContentsRow({
  messageId,
  entry,
  pending,
  onPrepare,
}: {
  messageId: string;
  entry: ContentsEntry;
  pending: { current: number | null };
  onPrepare: (offset: number) => void;
}) {
  return (
    <button
      type="button"
      className="reply-contents-jump"
      style={{ paddingLeft: contentsIndentPx(entry.level) }}
      aria-label={contentsGoToLabel(entry.title)}
      onMouseDown={keepComposerFocus}
      onClick={() => {
        pending.current = entry.offset;
        onPrepare(entry.offset);
        const offset = entry.offset;
        window.requestAnimationFrame(() => {
          if (pending.current !== offset) return;
          if (scrollContentsHeading(contentsAnchor(messageId, offset))) {
            pending.current = null;
          }
        });
      }}
    >
      {entry.title}
    </button>
  );
}
