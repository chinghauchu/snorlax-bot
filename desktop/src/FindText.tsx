// SPDX-License-Identifier: Apache-2.0
import { createContext, useContext, type ReactNode } from "react";
import {
  findQueryActive,
  highlightSpans,
} from "./chatFind";

const FindQueryContext = createContext("");

export function FindQueryProvider({
  query,
  children,
}: {
  query: string;
  children: ReactNode;
}) {
  return (
    <FindQueryContext.Provider value={query}>{children}</FindQueryContext.Provider>
  );
}

export function useFindQuery(): string {
  return useContext(FindQueryContext);
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
