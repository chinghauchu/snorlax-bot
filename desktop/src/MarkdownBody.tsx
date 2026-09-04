// SPDX-License-Identifier: Apache-2.0
import {
  Children,
  cloneElement,
  isValidElement,
  useEffect,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
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

type Props = {
  text: string;
  knownNames: string[];
  /** Defer mermaid / math until the LEFT message is complete. */
  completed?: boolean;
};

export function MarkdownBody({ text, knownNames, completed = true }: Props) {
  const { text: source, slots } = extractMath(stabilizeMarkdown(text));
  const enrich = (children?: ReactNode) =>
    enrichChildren(children, knownNames, completed, slots);
  return (
    <Markdown
      components={{
        a: ({ href, children }) => <MdLink href={href}>{children}</MdLink>,
        pre: ({ children }) => (
          <CodeFence completed={completed}>{children}</CodeFence>
        ),
        code: ({ className, children }) => (
          <code className={className}>{children}</code>
        ),
        img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        p: ({ children }) => {
          const block = soleBlockMath(children, slots, completed);
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

export function HttpsText({ text }: { text: string }) {
  const pieces = splitHttpsUrls(text);
  if (pieces.length === 1 && pieces[0]?.type === "text") return <>{text}</>;
  return (
    <>
      {pieces.map((piece, index) =>
        piece.type === "link" ? (
          <MdLink key={index} href={piece.value}>
            {piece.value}
          </MdLink>
        ) : (
          <span key={index}>{piece.value}</span>
        ),
      )}
    </>
  );
}

function CodeFence({
  children,
  completed,
}: {
  children?: ReactNode;
  completed: boolean;
}) {
  const { text, language } = fenceFromChildren(children);
  if (shouldRenderMermaid({ language, completed })) {
    return <MermaidFence language={language} source={text} />;
  }
  return <FenceChrome language={language} source={text} />;
}

function MermaidFence({
  language,
  source,
}: {
  language: string;
  source: string;
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
    return <FenceChrome language={language} source={source} />;
  }
  return (
    <div className="md-fence">
      <FenceBar language={language} source={source} />
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
}: {
  language: string;
  source: string;
}) {
  return (
    <div className="md-fence">
      <FenceBar language={language} source={source} />
      <pre className="md-fence-body">
        <code>{source}</code>
      </pre>
    </div>
  );
}

function FenceBar({ language, source }: { language: string; source: string }) {
  return (
    <div className="md-fence-bar">
      <span className="md-fence-lang">{language}</span>
      <button
        type="button"
        className="md-copy"
        onClick={() => void copyText(source)}
      >
        Copy
      </button>
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
): ReactNode | null {
  const text = onlyText(children).trim();
  if (!text) return null;
  const pieces = splitMathTokens(text);
  if (pieces.length !== 1 || pieces[0]?.type !== "math") return null;
  const piece = pieces[0];
  if (piece.kind !== "block") return null;
  const slot = slots[piece.id];
  if (!slot) return null;
  return <MathNode slot={slot} completed={completed} />;
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
): ReactNode {
  return Children.map(children, (child, index) => {
    if (typeof child === "string") {
      return renderTextWithMath(child, knownNames, completed, slots, index);
    }
    if (isValidElement(child)) {
      const props = child.props as { children?: ReactNode };
      if (props.children == null) return child;
      return cloneElement(
        child,
        undefined,
        enrichChildren(props.children, knownNames, completed, slots),
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
): ReactNode {
  const pieces = splitMathTokens(text);
  if (pieces.length === 1 && pieces[0]?.type === "text") {
    return mentionifyString(text, knownNames, keyBase);
  }
  return pieces.map((piece, inner) => {
    if (piece.type === "math") {
      const slot = slots[piece.id];
      return slot ? (
        <MathNode
          key={`${keyBase}-m-${inner}`}
          slot={slot}
          completed={completed}
        />
      ) : null;
    }
    return (
      <span key={`${keyBase}-t-${inner}`}>
        {mentionifyString(piece.value, knownNames, inner)}
      </span>
    );
  });
}

function MathNode({
  slot,
  completed,
}: {
  slot: MathSlot;
  completed: boolean;
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
    return <pre className="md-math-fallback md-math-block">{slot.raw}</pre>;
  }
  return <code className="md-math-fallback">{slot.raw}</code>;
}

function mentionifyString(
  text: string,
  knownNames: string[],
  index: number,
): ReactNode {
  const pieces = splitMentions(text, knownNames);
  if (pieces.length === 1 && pieces[0]?.type === "text") return text;
  return pieces.map((piece, inner) =>
    piece.type === "mention" && piece.resolved ? (
      <span key={`${index}-${inner}`} className="mention">
        {piece.value}
      </span>
    ) : (
      <span key={`${index}-${inner}`}>{piece.value}</span>
    ),
  );
}
