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
  CODE_BLOCK_COPY_MS,
  codeBlockClipboardText,
  codeBlockCopyAriaLabel,
  codeBlockCopyLabel,
  showCodeBlockCopy,
} from "./codeBlockCopy";
import {
  copyText,
  fenceLanguage,
  isSafeHttpsUrl,
  splitHttpsUrls,
  stabilizeMarkdown,
} from "./markdown";
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
import { FindText, useFindQuery } from "./FindText";

type Props = {
  text: string;
  knownNames: string[];
  /** Defer mermaid / math until the LEFT message is complete. */
  completed?: boolean;
};

export function MarkdownBody({ text, knownNames, completed = true }: Props) {
  const findQuery = useFindQuery();
  const { text: source, slots } = extractMath(stabilizeMarkdown(text));
  const enrich = (children?: ReactNode) =>
    enrichChildren(children, knownNames, completed, slots, findQuery);
  return (
    <Markdown
      components={{
        a: ({ href, children }) => <MdLink href={href}>{children}</MdLink>,
        pre: ({ children }) => (
          <CodeFence completed={completed} findQuery={findQuery}>
            {children}
          </CodeFence>
        ),
        code: ({ className, children }) => (
          <code className={className}>{children}</code>
        ),
        img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        p: ({ children }) => {
          const block = soleBlockMath(children, slots, completed, findQuery);
          if (block) return block;
          return <p>{enrich(children)}</p>;
        },
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

export function MdLink({
  href,
  children,
}: {
  href?: string;
  children?: ReactNode;
}) {
  if (!isSafeHttpsUrl(href) || !href) {
    return <>{children}</>;
  }
  const url = href;
  return (
    <a
      href={url}
      className="md-link"
      rel="noopener noreferrer"
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
  findQuery = "",
  active = null,
}: {
  text: string;
  findQuery?: string;
  active?: { start: number; end: number } | null;
}) {
  const pieces = splitHttpsUrls(text);
  if (pieces.length === 1 && pieces[0]?.type === "text") {
    return <FindText text={text} query={findQuery} active={active} />;
  }
  let offset = 0;
  return (
    <>
      {pieces.map((piece, index) => {
        const start = offset;
        offset += piece.value.length;
        const local =
          active &&
          active.start >= start &&
          active.start < start + piece.value.length
            ? {
                start: active.start - start,
                end: Math.min(active.end, start + piece.value.length) - start,
              }
            : null;
        const body = (
          <FindText text={piece.value} query={findQuery} active={local} />
        );
        return piece.type === "link" ? (
          <MdLink key={index} href={piece.value}>
            {body}
          </MdLink>
        ) : (
          <span key={index}>{body}</span>
        );
      })}
    </>
  );
}

function CodeFence({
  children,
  completed,
  findQuery,
}: {
  children?: ReactNode;
  completed: boolean;
  findQuery: string;
}) {
  const { text, language } = fenceFromChildren(children);
  if (shouldRenderMermaid({ language, completed })) {
    return (
      <MermaidFence
        language={language}
        source={text}
        completed={completed}
        findQuery={findQuery}
      />
    );
  }
  return (
    <FenceChrome
      language={language}
      source={text}
      completed={completed}
      findQuery={findQuery}
    />
  );
}

function MermaidFence({
  language,
  source,
  completed,
  findQuery,
}: {
  language: string;
  source: string;
  completed: boolean;
  findQuery: string;
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
      <FenceChrome language={language} source={source} completed={completed} findQuery={findQuery} />
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
}: {
  language: string;
  source: string;
  completed: boolean;
  findQuery: string;
}) {
  return (
    <div className="md-fence">
      <FenceBar language={language} source={source} completed={completed} />
      <pre className="md-fence-body">
        <code>
          <FindText text={source} query={findQuery} />
        </code>
      </pre>
    </div>
  );
}

function FenceBar({
  language,
  source,
  completed,
}: {
  language: string;
  source: string;
  completed: boolean;
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
    </div>
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
      );
    }
    if (isValidElement(child)) {
      const props = child.props as { children?: ReactNode };
      if (props.children == null) return child;
      return cloneElement(
        child,
        undefined,
        enrichChildren(props.children, knownNames, completed, slots, findQuery),
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
): ReactNode {
  const pieces = splitMathTokens(text);
  if (pieces.length === 1 && pieces[0]?.type === "text") {
    return mentionifyString(text, knownNames, keyBase, findQuery);
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
        {mentionifyString(piece.value, knownNames, inner, findQuery)}
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
): ReactNode {
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
