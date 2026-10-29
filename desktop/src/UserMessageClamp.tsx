// SPDX-License-Identifier: Apache-2.0
import type { ReactNode } from "react";
import { LongMessageBody } from "./LongMessageBody";

type Props = {
  /** False while this bubble is still the in-flight optimistic send. */
  settled: boolean;
  text: string;
  /** The active in-chat find hit is in this bubble. */
  activeFind: boolean;
  children: ReactNode;
};

/**
 * v2.16: reuse the completed-LEFT collapse chrome for one user bubble.
 * `settled` is that chrome's `completed` flag, so a send still in
 * flight stays open and an active find match stays fully visible.
 * The control is the same Show more button: a click does not move
 * composer focus. No new HTTP.
 */
export function UserMessageClamp({
  settled,
  text,
  activeFind,
  children,
}: Props) {
  return (
    <LongMessageBody
      completed={settled}
      text={text}
      activeFind={activeFind}
    >
      {children}
    </LongMessageBody>
  );
}
