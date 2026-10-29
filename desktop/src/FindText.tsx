// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext, type ReactNode } from "react";
import {
  findQueryActive,
  highlightSpans,
} from "./chatFind";

const FindQueryContext = createContext("");
const FindRowContext = createContext("");

export function FindQueryProvider({
  query,
  rowId = "",
  children,
}: {
  query: string;
  /** v2.19: row id of the active in-chat find hit. Empty when none. */
  rowId?: string;
  children: ReactNode;
}) {
  return (
    <FindQueryContext.Provider value={query}>
      <FindRowContext.Provider value={rowId}>{children}</FindRowContext.Provider>
    </FindQueryContext.Provider>
  );
}

export function useFindQuery(): string {
  return useContext(FindQueryContext);
}

/** Row id of the active find hit. Empty when find is closed or has no hit. */
export function useFindRowId(): string {
  return useContext(FindRowContext);
}

/** Highlight case-insensitive matches. No query leaves the text alone. */
export function FindText({
  text,
  query,
  active = null,
}: {
  text: string;
  query?: string;
  active?: { start: number; end: number } | null;
}) {
  const fromContext = useContext(FindQueryContext);
  const needle = query ?? fromContext;
  if (!findQueryActive(needle)) return <>{text}</>;
  const spans = highlightSpans(text, needle, active);
  if (spans.length === 1 && !spans[0]?.match) return <>{text}</>;
  return (
    <>
      {spans.map((span, index) =>
        span.match ? (
          <mark
            key={index}
            className={span.active ? "find-hit active" : "find-hit"}
            data-find-active={span.active ? "true" : undefined}
          >
            {span.text}
          </mark>
        ) : (
          <span key={index}>{span.text}</span>
        ),
      )}
    </>
  );
}
