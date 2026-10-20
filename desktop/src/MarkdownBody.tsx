// SPDX-License-Identifier: Apache-2.0
import {
  Children,
  cloneElement,
  createContext,
  isValidElement,
  useContext,
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
import { linkHref, splitWebUrls } from "./linkify";
import { splitIndentedCode } from "./markdownIndentedCode";
import { prepareAngleAutolinks, safeLinkHref } from "./markdownAutolink";
import { linkTitleHint } from "./markdownLinkTitle";
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
  protectMarkdownEscapes,
  restoreMarkdownEscapes,
} from "./markdownEscape";
import {
  breakAnimates,
  remarkStrikethrough,
  splitThematicBreaks,
} from "./markdownBreak";
import { applyHardLineBreaks, remarkHardBreaks } from "./markdownHardBreak";
import {
  headingInlineSource,
  literalizeSetextLines,
  protectLazySetext,
  setextAnimates,
  splitSetextHeadings,
} from "./markdownSetext";
import { neutralizeUnsafeImages } from "./markdownImage";
import {
  InMarkdownLink,
  markdownImageNode,
  MarkdownMediaProvider,
  useMarkdownMedia,
} from "./markdownImageView";
import type { ImageLightboxTarget } from "./imageLightbox";
import type { Session } from "./types";
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
  FOOTNOTES_TITLE,
  focusFootnote,
  footnoteBackLabel,
  footnoteRefLabel,
  splitFootnoteTokens,
  type Footnote,
} from "./markdownFootnote";
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
  /** Message id so a marker in any bubble can focus its note. */
  footnoteScope?: string;
  /** Matched notes. Only the last bubble of the message passes these. */
  footnotes?: Footnote[];
  /** Session for `/v1/attachments` and `/v1/images` image bytes. */
  session?: Session | null;
  /** v0.79 lightbox. An image inside a link does not use this. */
  onOpenImage?: (target: ImageLightboxTarget, trigger: HTMLElement) => void;
};

type FenceOrder = { n: number };

const FootnoteScopeContext = createContext("");

/** Message id shared by every bubble so a marker can find its note. */
export function FootnoteScopeProvider({
  scope,
  children,
}: {
  scope: string;
  children: ReactNode;
}) {
  return (
    <FootnoteScopeContext.Provider value={scope}>
      {children}
    </FootnoteScopeContext.Provider>
  );
}

function useFootnoteScope(): string {
  return useContext(FootnoteScopeContext);
}

export function MarkdownBody({
  text,
  knownNames,
  completed = true,
  wrapScope = "",
  fenceOrder,
  footnoteScope = "",
  footnotes,
  session,
  onOpenImage,
}: Props) {
  const parentMedia = useMarkdownMedia();
  const media = {
    session: session !== undefined ? session : parentMedia.session,
    onOpenImage: onOpenImage ?? parentMedia.onOpenImage,
  };
  const stable = stabilizeMarkdown(text);
  const segments = splitMarkdownTables(stable, completed);
  const order: FenceOrder = fenceOrder ?? { n: 0 };
  const body = (
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
      {footnotes?.length ? (
        <FootnotesList
          notes={footnotes}
          scope={footnoteScope}
          knownNames={knownNames}
        />
      ) : null}
    </>
  );
  const scoped = footnoteScope ? (
    <FootnoteScopeProvider scope={footnoteScope}>{body}</FootnoteScopeProvider>
  ) : (
    body
  );
  return <MarkdownMediaProvider value={media}>{scoped}</MarkdownMediaProvider>;
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
  const blocks = splitQuoteAndTasks(protectLazySetext(text, completed), completed);
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
          <SetextPieces
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
 * Top-level setext headings become the same h1 / h2 elements as ATX.
 * A multi-line heading is one element; the line break stays inside it.
 * Streaming is one markdown run.
 */
function SetextPieces({
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
  const parts = splitSetextHeadings(text, completed);
  const animate = setextAnimates(false);
  return (
    <>
      {parts.map((part, index) =>
        part.type === "heading" ? (
          <SetextHeading
            key={`setext-${index}`}
            level={part.level}
            text={part.text}
            knownNames={knownNames}
            completed={completed}
            animate={animate}
          />
        ) : (
          <MarkdownSegment
            key={`m-${index}`}
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

function SetextHeading({
  level,
  text,
  knownNames,
  completed,
  animate,
}: {
  level: 1 | 2;
  text: string;
  knownNames: string[];
  completed: boolean;
  animate: boolean;
}) {
  const Tag = level === 1 ? "h1" : "h2";
  return (
    <Tag data-animate={animate ? "1" : undefined}>
      <HeadingInline
        text={headingInlineSource(text)}
        knownNames={knownNames}
        completed={completed}
      />
    </Tag>
  );
}

/** Inline markdown for a setext heading. Paragraph wrappers stay out of the h1. */
function HeadingInline({
  text,
  knownNames,
  completed,
}: {
  text: string;
  knownNames: string[];
  completed: boolean;
}) {
  const findQuery = useFindQuery();
  const extracted = extractMath(text);
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, completed),
    completed,
  );
  const slots = extracted.slots;
  const source = applyHardLineBreaks(
    protectMarkdownEscapes(mathText, completed),
    completed,
  );
  const enrich = (children?: ReactNode) =>
    enrichChildren(children, knownNames, completed, slots, findQuery);
  return (
    <Markdown
      remarkPlugins={completed ? [remarkHardBreaks, remarkStrikethrough] : []}
      urlTransform={(url) => url}
      components={{
        a: ({ href, title, children }) =>
          markdownAnchor(href, title, completed, children),
        code: InlineCode,
        del: ({ children }) => <del className="md-strike">{enrich(children)}</del>,
        img: ({ alt, src, title }) =>
          markdownImageNode(
            completed,
            restoreMarkdownEscapes(typeof alt === "string" ? alt : ""),
            restoreMarkdownEscapes(typeof src === "string" ? src : ""),
            restoreMarkdownEscapes(typeof title === "string" ? title : ""),
          ),
        p: ({ children }) => <>{enrich(children)}</>,
        pre: ({ children }) => <>{children}</>,
      }}
    >
      {source}
    </Markdown>
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
  const parts = splitIndentedCode(text, completed);
  if (parts.length === 1 && parts[0]?.type === "markdown") {
    return (
      <MarkdownParsed
        text={parts[0].text}
        knownNames={knownNames}
        completed={completed}
        wrapScope={wrapScope}
        order={order}
        findQuery={findQuery}
      />
    );
  }
  return (
    <>
      {parts.map((part, index) =>
        part.type === "code" ? (
          <FenceChrome
            key={`indent-${index}`}
            language=""
            source={part.source}
            completed={completed}
            findQuery={findQuery}
            wrapId={codeBlockWrapId(wrapScope, order.n++)}
          />
        ) : (
          <MarkdownParsed
            key={`md-${index}`}
            text={part.text}
            knownNames={knownNames}
            completed={completed}
            wrapScope={wrapScope}
            order={order}
            findQuery={findQuery}
          />
        ),
      )}
    </>
  );
}

function MarkdownParsed({
  text,
  knownNames,
  completed,
  wrapScope,
  order,
  findQuery,
}: {
  text: string;
  knownNames: string[];
  completed: boolean;
  wrapScope: string;
  order: FenceOrder;
  findQuery: string;
}) {
  const extracted = extractMath(text);
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, completed),
    completed,
  );
  const slots = extracted.slots;
  const source = applyHardLineBreaks(
    protectMarkdownEscapes(mathText, completed),
    completed,
  );
  const enrich = (children?: ReactNode) =>
    enrichChildren(children, knownNames, completed, slots, findQuery);
  function SnorlaxPre({ children }: { children?: ReactNode }) {
    return (
      <CodeFence
        completed={completed}
        findQuery={findQuery}
        wrapScope={wrapScope}
        fenceIndex={order.n++}
      >
        {children}
      </CodeFence>
    );
  }
  SnorlaxPre.displayName = "SnorlaxPre";
  return (
    <Markdown
      remarkPlugins={completed ? [remarkHardBreaks, remarkStrikethrough] : []}
      urlTransform={(url) => url}
      components={{
        a: ({ href, title, children }) =>
          markdownAnchor(href, title, completed, children),
        pre: SnorlaxPre,
        code: InlineCode,
        img: ({ alt, src, title }) =>
          markdownImageNode(
            completed,
            restoreMarkdownEscapes(typeof alt === "string" ? alt : ""),
            restoreMarkdownEscapes(typeof src === "string" ? src : ""),
            restoreMarkdownEscapes(typeof title === "string" ? title : ""),
          ),
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
  const extracted = extractMath(literalizeSetextLines(text));
  const mathText = prepareAngleAutolinks(
    neutralizeUnsafeImages(extracted.text, completed),
    completed,
  );
  const slots = extracted.slots;
  const source = applyHardLineBreaks(
    protectMarkdownEscapes(mathText, completed),
    completed,
  );
  if (!source) return null;
  const enrich = (children?: ReactNode) =>
    enrichChildren(children, knownNames, completed, slots, findQuery);
  return (
    <Markdown
      remarkPlugins={completed ? [remarkHardBreaks, remarkStrikethrough] : []}
      urlTransform={(url) => url}
      components={{
        a: ({ href, title, children }) =>
          markdownAnchor(href, title, completed, children),
        code: InlineCode,
        del: ({ children }) => <del className="md-strike">{enrich(children)}</del>,
        img: ({ alt, src, title }) =>
          markdownImageNode(
            completed,
            restoreMarkdownEscapes(typeof alt === "string" ? alt : ""),
            restoreMarkdownEscapes(typeof src === "string" ? src : ""),
            restoreMarkdownEscapes(typeof title === "string" ? title : ""),
          ),
        pre: ({ children }) => <>{children}</>,
        p: ({ children }) => <>{enrich(children)}</>,
      }}
    >
      {source}
    </Markdown>
  );
}

function markdownAnchor(
  href: string | undefined,
  title: string | undefined,
  completed: boolean,
  children: ReactNode,
) {
  return (
    <MdLink href={href} title={title} preview={completed}>
      {children}
    </MdLink>
  );
}

export function MdLink({
  href,
  title,
  children,
  preview = true,
}: {
  href?: string;
  /** CommonMark link title. Shown only on a completed reply. */
  title?: string;
  children?: ReactNode;
  /** Completed message bubbles reveal the destination. Streaming does not. */
  preview?: boolean;
}) {
  const idRef = useRef(0);
  if (idRef.current === 0) idRef.current = nextLinkStatusId();
  // http(s) still go through isSafeWebUrl. A mailto email does too.
  const rawHref = restoreMarkdownEscapes(href ?? "");
  const url = safeLinkHref(rawHref);
  const hint = linkTitleHint(title, preview && url.length > 0);
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
      title={hint || undefined}
      aria-description={hint || undefined}
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
      <InMarkdownLink>
        <FootnoteMarkers>{children}</FootnoteMarkers>
      </InMarkdownLink>
    </a>
  );
}

/** A footnote token inside a link label still becomes a marker. */
function FootnoteMarkers({ children }: { children?: ReactNode }) {
  const scope = useFootnoteScope();
  return Children.map(children, (child, index) => {
    if (typeof child !== "string") return child;
    const shown = restoreMarkdownEscapes(child);
    if (!shown.includes("§§SBFN")) return shown;
    return splitFootnoteTokens(shown).map((piece, inner) =>
      piece.type === "ref" ? (
        <FootnoteRefButton
          key={`${index}-${inner}`}
          number={piece.number}
          scope={scope}
        />
      ) : (
        <span key={`${index}-${inner}`}>{piece.value}</span>
      ),
    );
  });
}

export function HttpsText({
  text,
  knownNames = [],
  chips = false,
  findQuery,
  active = null,
  streaming = false,
  emails = false,
}: {
  text: string;
  knownNames?: string[];
  chips?: boolean;
  findQuery?: string;
  active?: { start: number; end: number } | null;
  /** A URL that still touches the end of a growing bubble stays plain. */
  streaming?: boolean;
  /**
   * v1.45: bare GFM email autolinks. Completed assistant markdown
   * only. User bubbles and a streaming plain bubble leave them as text.
   */
  emails?: boolean;
}) {
  const fromContext = useFindQuery();
  const query = findQuery ?? fromContext;
  const rawPieces = splitWebUrls(text, { streaming, emails });
  const hasEscape = text.includes("§§SBE");
  const pieces = hasEscape
    ? rawPieces.map((piece) => ({
        ...piece,
        value: restoreMarkdownEscapes(piece.value),
      }))
    : rawPieces;
  const findText = hasEscape ? pieces.map((piece) => piece.value).join("") : text;
  const hits = findQueryActive(query)
    ? findHits([{ id: "row", text: findText }], query)
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
      // A fence (including indented code) already owns its text. Cloning
      // it here would turn that text into a footnote node and the block
      // would copy as empty. Lists pass the fence through `li`.
      const typeName =
        typeof child.type === "function"
          ? (child.type as { displayName?: string }).displayName
          : "";
      if (
        child.type === CodeFence ||
        child.type === FenceChrome ||
        child.type === MermaidFence ||
        typeName === "SnorlaxPre"
      ) {
        return child;
      }
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
    return (
      <FootnoteText
        text={text}
        knownNames={knownNames}
        findQuery={findQuery}
        linkify={linkify}
        emails={completed}
      />
    );
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
        <FootnoteText
          text={piece.value}
          knownNames={knownNames}
          findQuery={findQuery}
          linkify={linkify}
          emails={completed}
        />
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

function FootnoteText({
  text,
  knownNames,
  findQuery,
  linkify,
  emails,
}: {
  text: string;
  knownNames: string[];
  findQuery: string;
  linkify: boolean;
  emails: boolean;
}) {
  const scope = useFootnoteScope();
  if (!linkify || !text.includes("§§SBFN")) {
    return <>{mentionifyString(text, knownNames, 0, findQuery, linkify, emails)}</>;
  }
  const pieces = splitFootnoteTokens(text);
  return (
    <>
      {pieces.map((piece, index) =>
        piece.type === "ref" ? (
          <FootnoteRefButton key={index} number={piece.number} scope={scope} />
        ) : (
          <span key={index}>
            {mentionifyString(piece.value, knownNames, index, findQuery, linkify, emails)}
          </span>
        ),
      )}
    </>
  );
}

function FootnoteRefButton({
  number,
  scope,
}: {
  number: number;
  scope: string;
}) {
  return (
    <button
      type="button"
      className="md-fn-ref"
      data-fn-ref={scope}
      data-fn-number={number}
      aria-label={footnoteRefLabel(number)}
      onClick={() => focusFootnote(scope, number, "note")}
    >
      <sup>{number}</sup>
    </button>
  );
}

/** Muted numbered list. The back-link returns to the first marker. */
export function FootnotesList({
  notes,
  scope,
  knownNames,
}: {
  notes: Footnote[];
  scope: string;
  knownNames: string[];
}) {
  if (!notes.length) return null;
  return (
    <section className="md-footnotes" aria-label={FOOTNOTES_TITLE}>
      <p className="md-fn-title">{FOOTNOTES_TITLE}</p>
      <ol className="md-fn-list">
        {notes.map((note) => (
          <li
            key={note.number}
            className="md-fn-item"
            data-fn-note={scope}
            data-fn-number={note.number}
            tabIndex={-1}
          >
            <div className="md-fn-body">
              <MarkdownBody text={note.text} knownNames={knownNames} completed />
            </div>
            <button
              type="button"
              className="md-fn-back"
              aria-label={footnoteBackLabel(note.number)}
              onClick={() => focusFootnote(scope, note.number, "ref")}
            >
              {"\u21a9"}
            </button>
          </li>
        ))}
      </ol>
    </section>
  );
}

function mentionifyString(
  text: string,
  knownNames: string[],
  index: number,
  findQuery: string,
  linkify: boolean,
  emails: boolean,
): ReactNode {
  if (linkify) {
    return (
      <HttpsText
        text={text}
        knownNames={knownNames}
        findQuery={findQuery}
        emails={emails}
      />
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
