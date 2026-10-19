// SPDX-License-Identifier: Apache-2.0
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import {
  codeHighlightClass,
  highlightCode,
  shouldHighlightCode,
} from "./codeHighlight";
import {
  CODE_BLOCK_COPY_MS,
  codeBlockClipboardText,
  codeBlockCopyAriaLabel,
  codeBlockCopyLabel,
  showCodeBlockCopy,
} from "./codeBlockCopy";
import {
  codeBlockWrapAriaLabel,
  codeBlockWrapClass,
  codeBlockWrapId,
  codeBlockWrapLabel,
  readCodeBlockWrap,
  showCodeBlockWrap,
  toggleCodeBlockWrap,
} from "./codeBlockWrap";
import { isSafeWebUrl, linkHref, splitWebUrls } from "./linkify";
import {
  linkStatusClearFocus,
  linkStatusClearHover,
  linkStatusFocus,
  linkStatusHover,
  nextLinkStatusId,
} from "./linkStatus";
import {
  copyText,
  fenceLanguage,
  stabilizeMarkdown,
} from "./markdown";
import {
  breakAnimates,
  remarkStrikethrough,
  splitThematicBreaks,
} from "./markdownBreak";
import {
  quoteTaskAnimates,
  splitQuoteAndTasks,
  taskGlyph,
  taskGlyphLabel,
} from "./markdownQuoteTask";
import {
  TABLE_COPY_MS,
  showTableCopy,
  splitMarkdownTables,
  tableClipboardText,
  tableCopyAriaLabel,
  tableCopyLabel,
  type MarkdownTable,
  type TableAlign,
} from "./markdownTable";
import {
  extractMath,
  renderKatex,
  shouldRenderMath,
  splitMathTokens,
  type MathSlot,
} from "./math";
import { shouldRenderMermaid, renderMermaidSvg } from "./mermaid";
import { splitMentions } from "./mentions";
import { openOsBrowser } from "./openUrl";
import { findHits, findQueryActive } from "./chatFind";
import { FindText, useFindQuery } from "./FindText";

type Props = {
  text: string;
  knownNames: string[];
  /** Defer mermaid / math until the LEFT message is complete. */
  completed?: boolean;
  /** Session key for per-fence wrap. Empty still keys by fence index. */
  wrapScope?: string;
  /** Shared fence index when a quote or task renders nested markdown. */
  fenceOrder?: FenceOrder;
};

type FenceOrder = { n: number };

export function MarkdownBody({
  text,
  knownNames,
  completed = true,
  wrapScope = "",
  fenceOrder,
}: Props) {
  const stable = stabilizeMarkdown(text);
  const segments = splitMarkdownTables(stable, completed);
  const order: FenceOrder = fenceOrder ?? { n: 0 };
  return (
    <>
      {segments.map((segment, index) =>
        segment.type === "table" ? (
          <MarkdownTableBlock
            key={`table-${index}`}
            table={segment.table}
            knownNames={knownNames}
            completed={completed}
          />
        ) : (
          <QuoteTaskPieces
            key={`md-${index}`}
            text={segment.text}
            knownNames={knownNames}
            completed={completed}
            wrapScope={wrapScope}
            order={order}
          />
        ),
      )}
    </>
  );
}

/**
 * Completed replies pull quotes and task lists out before the
 * commonmark renderer. Streaming (`completed: false`) is one
 * markdown run, the same bubble as today. Glyphs are static.
 */
function QuoteTaskPieces({
  text,
  knownNames,
  completed,
  wrapScope,
  order,
}: {
  text: string;
  knownNames: string[];
  completed: boolean;
  wrapScope: string;
  order: FenceOrder;
}) {
  const blocks = splitQuoteAndTasks(text, completed);
  const animate = quoteTaskAnimates(false);
  return (
    <>
      {blocks.map((block, index) => {
        if (block.type === "quote") {
          return (
            <blockquote
              className="md-quote"
              key={`q-${index}`}
              data-animate={animate ? "1" : undefined}
            >
              <MarkdownBody
                text={block.text}
                knownNames={knownNames}
                completed={completed}
                wrapScope={wrapScope}
                fenceOrder={order}
              />
            </blockquote>
          );
        }
        if (block.type === "tasks") {
          return (
            <ul className="md-task-list" key={`t-${index}`}>
              {block.items.map((item, itemIndex) => (
                <li
                  key={itemIndex}
                  className={
                    item.checked ? "md-task-item is-checked" : "md-task-item"
                  }
                >
                  <span
                    className={
                      item.checked
                        ? "md-task-glyph is-checked"
                        : "md-task-glyph"
                    }
                    role="img"
                    aria-label={taskGlyphLabel(item.checked)}
                  >
                    <span aria-hidden="true">{taskGlyph(item.checked)}</span>
                  </span>
                  {item.text ? (
                    <div className="md-task-body">
                      <MarkdownBody
                        text={item.text}
                        knownNames={knownNames}
                        completed={completed}
                        wrapScope={wrapScope}
                        fenceOrder={order}
                      />
                    </div>
                  ) : (
                    <div className="md-task-body" />
                  )}
                </li>
              ))}
            </ul>
          );
        }
        return (
          <MarkdownSegment
            key={`m-${index}`}
            text={block.text}
            knownNames={knownNames}
            completed={completed}
            wrapScope={wrapScope}
            order={order}
          />
        );
      })}
    </>
  );
}

/**
 * Completed replies pull thematic breaks out before the commonmark
 * renderer. ATX headings stay in the markdown and render as h1–h6.
 * Streaming (`completed: false`) is one markdown run.
 */
function MarkdownSegment({
  text,
  knownNames,
  completed,
  wrapScope,
  order,
}: {
  text: string;
  knownNames: string[];
  completed: boolean;
  wrapScope: string;
  order: FenceOrder;
}) {
  const parts = splitThematicBreaks(text, completed);
  const animate = breakAnimates(false);
  return (
    <>
      {parts.map((part, index) =>
        part.type === "rule" ? (
          <hr
            key={`rule-${index}`}
            className="md-rule"
            data-animate={animate ? "1" : undefined}
          />
        ) : (
          <MarkdownChunk
            key={`chunk-${index}`}
            text={part.text}
            knownNames={knownNames}
            completed={completed}
            wrapScope={wrapScope}
            order={order}
          />
        ),
      )}
    </>
  );
}

function MarkdownChunk({
  text,
  knownNames,
  completed,
  wrapScope,
  order,
}: {
  text: string;
  knownNames: string[];
  completed: boolean;
  wrapScope: string;
  order: FenceOrder;
}) {
  const findQuery = useFindQuery();
  const { text: source, slots } = extractMath(text);
  const enrich = (children?: ReactNode) =>
    enrichChildren(children, knownNames, completed, slots, findQuery);
  return (
    <Markdown
      remarkPlugins={completed ? [remarkStrikethrough] : []}
      components={{
        a: ({ href, children }) => (
          <MdLink href={href} preview={completed}>
            {children}
          </MdLink>
        ),
        pre: ({ children }) => (
          <CodeFence
            completed={completed}
            findQuery={findQuery}
            wrapScope={wrapScope}
            fenceIndex={order.n++}
          >
            {children}
          </CodeFence>
        ),
        code: InlineCode,
        img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        del: ({ children }) => <del className="md-strike">{enrich(children)}</del>,
        hr: () => <hr className="md-rule" />,
        p: ({ children }) => {
          const block = soleBlockMath(children, slots, completed, findQuery);
          if (block) return block;
          return <p>{enrich(children)}</p>;
        },
        // v1.36: CommonMark already sets `start` when the list does
        // not begin at 1. Forward it so a later custom `ol` cannot
        // drop the number. Nested lists stay inside the item.
        ol: ({ start, children }) =>
          typeof start === "number" ? (
            <ol start={start}>{children}</ol>
          ) : (
            <ol>{children}</ol>
          ),
        li: ({ children }) => <li>{enrich(children)}</li>,
        h1: ({ children }) => <h1>{enrich(children)}</h1>,
        h2: ({ children }) => <h2>{enrich(children)}</h2>,
        h3: ({ children }) => <h3>{enrich(children)}</h3>,
        h4: ({ children }) => <h4>{enrich(children)}</h4>,
        h5: ({ children }) => <h5>{enrich(children)}</h5>,
        h6: ({ children }) => <h6>{enrich(children)}</h6>,
      }}
    >
      {source}
    </Markdown>
  );
}

function MarkdownTableBlock({
  table,
  knownNames,
  completed,
}: {
  table: MarkdownTable;
  knownNames: string[];
  completed: boolean;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  function onCopy() {
    void copyText(tableClipboardText(table.source));
    setCopied(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCopied(false);
      timer.current = null;
    }, TABLE_COPY_MS);
  }

  return (
    <div className="md-table">
      {showTableCopy(completed) ? (
        <div className="md-table-bar">
          <button
            type="button"
            className="md-copy"
            aria-label={tableCopyAriaLabel(copied)}
            aria-live="polite"
            onClick={onCopy}
          >
            {tableCopyLabel(copied)}
          </button>
        </div>
      ) : null}
      <div className="md-table-scroll">
        <table>
          <thead>
            <tr>
              {table.header.map((cell, index) => (
                <th key={index} scope="col" className={tableAlignClass(table.align[index])}>
                  <TableCellText text={cell} knownNames={knownNames} completed={completed} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row, rowIndex) => (
              <tr key={rowIndex}>
                {row.map((cell, index) => (
                  <td key={index} className={tableAlignClass(table.align[index])}>
                    <TableCellText text={cell} knownNames={knownNames} completed={completed} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function tableAlignClass(align: TableAlign | undefined): string {
  if (align === "center") return "md-table-center";
  if (align === "right") return "md-table-right";
  return "md-table-left";
}

function TableCellText({
  text,
  knownNames,
  completed,
}: {
  text: string;
  knownNames: string[];
  completed: boolean;
}) {
  const findQuery = useFindQuery();
  const { text: source, slots } = extractMath(text);
  if (!source) return null;
  const enrich = (children?: ReactNode) =>
    enrichChildren(children, knownNames, completed, slots, findQuery);
  return (
    <Markdown
      remarkPlugins={completed ? [remarkStrikethrough] : []}
      components={{
        a: ({ href, children }) => (
          <MdLink href={href} preview={completed}>
            {children}
          </MdLink>
        ),
        code: InlineCode,
        del: ({ children }) => <del className="md-strike">{enrich(children)}</del>,
        img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        pre: ({ children }) => <>{children}</>,
        p: ({ children }) => <>{enrich(children)}</>,
      }}
    >
      {source}
    </Markdown>
  );
}

export function MdLink({
  href,
  children,
  preview = true,
}: {
  href?: string;
  children?: ReactNode;
  /** Completed message bubbles reveal the destination. Streaming does not. */
  preview?: boolean;
}) {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextLinkStatusId();
  const url = isSafeWebUrl(href) && href ? href : "";
  const reveal = preview && url.length > 0;
  useEffect(() => {
    if (!reveal) return;
    const id = idRef.current;
    return () => {
      linkStatusClearHover(id);
      linkStatusClearFocus(id);
    };
  }, [reveal, url]);
  if (!url) {
    return <>{children}</>;
  }
  const id = idRef.current;
  return (
    <a
      href={url}
      className="md-link"
      rel="noopener noreferrer"
      onMouseEnter={reveal ? () => linkStatusHover(id, url) : undefined}
      onMouseLeave={reveal ? () => linkStatusClearHover(id) : undefined}
      onFocus={
        reveal
          ? (event) => {
              if (event.currentTarget.matches(":focus-visible")) {
                linkStatusFocus(id, url);
              }
            }
          : undefined
      }
      onBlur={reveal ? () => linkStatusClearFocus(id) : undefined}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        event.preventDefault();
        void openOsBrowser(url);
      }}
    >
      {children}
    </a>
  );
}

export function HttpsText({
  text,
  knownNames = [],
  chips = false,
  findQuery,
  active = null,
  streaming = false,
}: {
  text: string;
  knownNames?: string[];
  chips?: boolean;
  findQuery?: string;
  active?: { start: number; end: number } | null;
  /** A URL that still touches the end of a growing bubble stays plain. */
  streaming?: boolean;
}) {
  const fromContext = useFindQuery();
  const query = findQuery ?? fromContext;
  const pieces = splitWebUrls(text, { streaming });
  const hits = findQueryActive(query)
    ? findHits([{ id: "row", text }], query)
    : [];
  let offset = 0;
  return (
    <>
      {pieces.map((piece, index) => {
        const start = offset;
        offset += piece.value.length;
        const overlapped = overlapHits(hits, active, start, offset);
        if (piece.type === "link") {
          return (
            <MdLink key={index} href={linkHref(piece.value)} preview={!streaming}>
              {paintOverlap(piece.value, overlapped)}
            </MdLink>
          );
        }
        return (
          <MentionPieces
            key={index}
            text={piece.value}
            knownNames={knownNames}
            chips={chips}
            hits={overlapped}
          />
        );
      })}
    </>
  );
}

type OverlapHit = { start: number; end: number; active: boolean };

function overlapHits(
  hits: Array<{ start: number; end: number }>,
  active: { start: number; end: number } | null,
  start: number,
  end: number,
): OverlapHit[] {
  const overlapped: OverlapHit[] = [];
  for (const hit of hits) {
    if (hit.end <= start || hit.start >= end) continue;
    overlapped.push({
      start: Math.max(hit.start, start) - start,
      end: Math.min(hit.end, end) - start,
      active: active != null && active.start === hit.start && active.end === hit.end,
    });
  }
  return overlapped;
}

function sliceHits(hits: OverlapHit[], start: number, end: number): OverlapHit[] {
  const sliced: OverlapHit[] = [];
  for (const hit of hits) {
    if (hit.end <= start || hit.start >= end) continue;
    sliced.push({
      start: Math.max(hit.start, start) - start,
      end: Math.min(hit.end, end) - start,
      active: hit.active,
    });
  }
  return sliced;
}

function paintOverlap(text: string, hits: OverlapHit[]): ReactNode {
  if (!text) return null;
  if (!hits.length) return text;
  const nodes: ReactNode[] = [];
  let cursor = 0;
  hits.forEach((hit, index) => {
    if (hit.start > cursor) {
      nodes.push(<span key={`t-${index}`}>{text.slice(cursor, hit.start)}</span>);
    }
    nodes.push(
      <mark
        key={`m-${index}`}
        className={hit.active ? "find-hit active" : "find-hit"}
        data-find-active={hit.active ? "true" : undefined}
      >
        {text.slice(hit.start, hit.end)}
      </mark>,
    );
    cursor = hit.end;
  });
  if (cursor < text.length) {
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  }
  return <>{nodes}</>;
}

function MentionPieces({
  text,
  knownNames,
  chips,
  hits,
}: {
  text: string;
  knownNames: string[];
  chips: boolean;
  hits: OverlapHit[];
}) {
  const pieces = splitMentions(text, knownNames);
  if (
    pieces.length === 0 ||
    (pieces.length === 1 && pieces[0]?.type !== "mention")
  ) {
    return <>{paintOverlap(text, hits)}</>;
  }
  let offset = 0;
  return (
    <>
      {pieces.map((piece, index) => {
        const start = offset;
        offset += piece.value.length;
        const body = paintOverlap(piece.value, sliceHits(hits, start, offset));
        if (piece.type === "mention" && piece.resolved) {
          return (
            <span key={index} className={chips ? "mention-chip" : "mention"}>
              {body}
            </span>
          );
        }
        return <span key={index}>{body}</span>;
      })}
    </>
  );
}

function InlineCode({
  className,
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <code className={className}>{children}</code>;
}

function CodeFence({
  children,
  completed,
  findQuery,
  wrapScope,
  fenceIndex,
}: {
  children?: ReactNode;
  completed: boolean;
  findQuery: string;
  wrapScope: string;
  fenceIndex: number;
}) {
  const { text, language } = fenceFromChildren(children);
  const wrapId = codeBlockWrapId(wrapScope, fenceIndex);
  if (shouldRenderMermaid({ language, completed })) {
    return (
      <MermaidFence
        language={language}
        source={text}
        completed={completed}
        findQuery={findQuery}
        wrapId={wrapId}
      />
    );
  }
  return (
    <FenceChrome
      language={language}
      source={text}
      completed={completed}
      findQuery={findQuery}
      wrapId={wrapId}
    />
  );
}

function MermaidFence({
  language,
  source,
  completed,
  findQuery,
  wrapId,
}: {
  language: string;
  source: string;
  completed: boolean;
  findQuery: string;
  wrapId: string;
}) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    setSvg(null);
    void renderMermaidSvg(source).then((next) => {
      if (!cancelled) setSvg(next);
    });
    return () => {
      cancelled = true;
    };
  }, [source]);
  if (!svg) {
    return (
      <FenceChrome language={language} source={source} completed={completed} findQuery={findQuery} wrapId={wrapId} />
    );
  }
  return (
    <div className="md-fence">
      <FenceBar language={language} source={source} completed={completed} />
      <div
        className="md-mermaid-body"
        // mermaid securityLevel=strict; official SVG only
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

function FenceChrome({
  language,
  source,
  completed,
  findQuery,
  wrapId,
}: {
  language: string;
  source: string;
  completed: boolean;
  findQuery: string;
  wrapId: string;
}) {
  const [wrapped, setWrapped] = useState(() => readCodeBlockWrap(wrapId));
  useEffect(() => {
    setWrapped(readCodeBlockWrap(wrapId));
  }, [wrapId]);
  const wrapOn = showCodeBlockWrap(completed) && wrapped;
  return (
    <div className="md-fence">
      <FenceBar
        language={language}
        source={source}
        completed={completed}
        wrapped={wrapped}
        onToggleWrap={() => setWrapped(toggleCodeBlockWrap(wrapId, wrapped))}
      />
      <pre className={codeBlockWrapClass(wrapOn)}>
        <code>
          <HighlightedCode
            source={source}
            language={language}
            completed={completed}
            findQuery={findQuery}
          />
        </code>
      </pre>
    </div>
  );
}

function FenceBar({
  language,
  source,
  completed,
  wrapped = false,
  onToggleWrap,
}: {
  language: string;
  source: string;
  completed: boolean;
  wrapped?: boolean;
  onToggleWrap?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof window.setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timer.current != null) window.clearTimeout(timer.current);
    };
  }, []);

  useEffect(() => {
    if (completed) return;
    setCopied(false);
    if (timer.current != null) {
      window.clearTimeout(timer.current);
      timer.current = null;
    }
  }, [completed]);

  function onCopy() {
    void copyText(codeBlockClipboardText(source));
    setCopied(true);
    if (timer.current != null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      setCopied(false);
      timer.current = null;
    }, CODE_BLOCK_COPY_MS);
  }

  return (
    <div className="md-fence-bar">
      <span className="md-fence-lang">{language}</span>
      <span className="md-fence-actions">
        {onToggleWrap && showCodeBlockWrap(completed) ? (
          <button
            type="button"
            className="md-fence-wrap"
            aria-pressed={wrapped}
            aria-label={codeBlockWrapAriaLabel(wrapped)}
            onClick={onToggleWrap}
          >
            {codeBlockWrapLabel(wrapped)}
          </button>
        ) : null}
        {showCodeBlockCopy(completed) ? (
          <button
            type="button"
            className="md-copy"
            aria-label={codeBlockCopyAriaLabel(copied)}
            aria-live="polite"
            onClick={onCopy}
          >
            {codeBlockCopyLabel(copied)}
          </button>
        ) : null}
      </span>
    </div>
  );
}

function HighlightedCode({
  source,
  language,
  completed,
  findQuery,
}: {
  source: string;
  language: string;
  completed: boolean;
  findQuery: string;
}) {
  if (!shouldHighlightCode({ language, completed })) {
    return <FindText text={source} query={findQuery} />;
  }
  const spans = highlightCode(source, language);
  return (
    <>
      {spans.map((span, index) =>
        span.kind === "plain" ? (
          <FindText key={index} text={span.text} query={findQuery} />
        ) : (
          <span key={index} className={codeHighlightClass(span.kind)}>
            <FindText text={span.text} query={findQuery} />
          </span>
        ),
      )}
    </>
  );
}

function fenceFromChildren(node: ReactNode): { text: string; language: string } {
  if (isValidElement(node)) {
    const props = node.props as { className?: string; children?: ReactNode };
    return {
      language: fenceLanguage(props.className),
      text: codeText(props.children).replace(/\n$/, ""),
    };
  }
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = fenceFromChildren(child);
      if (found.language || found.text) return found;
    }
  }
  return { language: "", text: codeText(node).replace(/\n$/, "") };
}

function codeText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(codeText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return codeText(props.children);
  }
  return "";
}

function soleBlockMath(
  children: ReactNode,
  slots: MathSlot[],
  completed: boolean,
  findQuery: string,
): ReactNode | null {
  const text = onlyText(children).trim();
  if (!text) return null;
  const pieces = splitMathTokens(text);
  if (pieces.length !== 1 || pieces[0]?.type !== "math") return null;
  const piece = pieces[0];
  if (piece.kind !== "block") return null;
  const slot = slots[piece.id];
  if (!slot) return null;
  return <MathNode slot={slot} completed={completed} findQuery={findQuery} />;
}

function onlyText(node: ReactNode): string {
  if (node == null || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(onlyText).join("");
  if (isValidElement(node)) {
    const props = node.props as { children?: ReactNode };
    return onlyText(props.children);
  }
  return "";
}

function enrichChildren(
  children: ReactNode,
  knownNames: string[],
  completed: boolean,
  slots: MathSlot[],
  findQuery: string,
  linkify = true,
): ReactNode {
  return Children.map(children, (child, index) => {
    if (typeof child === "string") {
      return renderTextWithMath(
        child,
        knownNames,
        completed,
        slots,
        index,
        findQuery,
        linkify,
      );
    }
    if (isValidElement(child)) {
      const props = child.props as { children?: ReactNode };
      if (props.children == null) return child;
      const skipLinks =
        child.type === InlineCode ||
        child.type === MdLink ||
        child.type === "code" ||
        child.type === "a" ||
        child.type === "pre";
      return cloneElement(
        child,
        undefined,
        enrichChildren(
          props.children,
          knownNames,
          completed,
          slots,
          findQuery,
          linkify && !skipLinks,
        ),
      );
    }
    return child;
  });
}

function renderTextWithMath(
  text: string,
  knownNames: string[],
  completed: boolean,
  slots: MathSlot[],
  keyBase: number,
  findQuery: string,
  linkify: boolean,
): ReactNode {
  const pieces = splitMathTokens(text);
  if (pieces.length === 1 && pieces[0]?.type === "text") {
    return mentionifyString(text, knownNames, keyBase, findQuery, linkify);
  }
  return pieces.map((piece, inner) => {
    if (piece.type === "math") {
      const slot = slots[piece.id];
      return slot ? (
        <MathNode
          key={`${keyBase}-m-${inner}`}
          slot={slot}
          completed={completed}
          findQuery={findQuery}
        />
      ) : null;
    }
    return (
      <span key={`${keyBase}-t-${inner}`}>
        {mentionifyString(piece.value, knownNames, inner, findQuery, linkify)}
      </span>
    );
  });
}

function MathNode({
  slot,
  completed,
  findQuery,
}: {
  slot: MathSlot;
  completed: boolean;
  findQuery: string;
}) {
  const display = slot.kind === "block";
  const html = shouldRenderMath({ completed, closed: slot.closed })
    ? renderKatex(slot.tex, display)
    : null;
  if (html) {
    return display ? (
      <div
        className="md-math-block"
        // KaTeX HTML from the local engine only
        dangerouslySetInnerHTML={{ __html: html }}
      />
    ) : (
      <span
        className="md-math-inline"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  if (display) {
    return (
      <pre className="md-math-fallback md-math-block">
        <FindText text={slot.raw} query={findQuery} />
      </pre>
    );
  }
  return (
    <code className="md-math-fallback">
      <FindText text={slot.raw} query={findQuery} />
    </code>
  );
}

function mentionifyString(
  text: string,
  knownNames: string[],
  index: number,
  findQuery: string,
  linkify: boolean,
): ReactNode {
  if (linkify) {
    return (
      <HttpsText text={text} knownNames={knownNames} findQuery={findQuery} />
    );
  }
  const pieces = splitMentions(text, knownNames);
  if (pieces.length === 1 && pieces[0]?.type === "text") {
    return <FindText text={text} query={findQuery} />;
  }
  return pieces.map((piece, inner) =>
    piece.type === "mention" && piece.resolved ? (
      <span key={`${index}-${inner}`} className="mention">
        <FindText text={piece.value} query={findQuery} />
      </span>
    ) : (
      <span key={`${index}-${inner}`}>
        <FindText text={piece.value} query={findQuery} />
      </span>
    ),
  );
}
