// SPDX-License-Identifier: Apache-2.0
import {
  Children,
  isValidElement,
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
import { splitMentions } from "./mentions";
import { openOsBrowser } from "./openUrl";

type Props = {
  text: string;
  knownNames: string[];
};

export function MarkdownBody({ text, knownNames }: Props) {
  const source = stabilizeMarkdown(text);
  return (
    <Markdown
      components={{
        a: ({ href, children }) => <MdLink href={href}>{children}</MdLink>,
        pre: ({ children }) => <CodeFence>{children}</CodeFence>,
        code: ({ className, children }) => (
          <code className={className}>{children}</code>
        ),
        img: ({ alt }) => (alt ? <span>{alt}</span> : null),
        p: ({ children }) => <p>{mentionify(children, knownNames)}</p>,
        li: ({ children }) => <li>{mentionify(children, knownNames)}</li>,
        h1: ({ children }) => <h1>{mentionify(children, knownNames)}</h1>,
        h2: ({ children }) => <h2>{mentionify(children, knownNames)}</h2>,
        h3: ({ children }) => <h3>{mentionify(children, knownNames)}</h3>,
        h4: ({ children }) => <h4>{mentionify(children, knownNames)}</h4>,
        h5: ({ children }) => <h5>{mentionify(children, knownNames)}</h5>,
        h6: ({ children }) => <h6>{mentionify(children, knownNames)}</h6>,
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

function CodeFence({ children }: { children?: ReactNode }) {
  const { text, language } = fenceFromChildren(children);
  return (
    <div className="md-fence">
      <div className="md-fence-bar">
        <span className="md-fence-lang">{language}</span>
        <button
          type="button"
          className="md-copy"
          onClick={() => void copyText(text)}
        >
          Copy
        </button>
      </div>
      <pre className="md-fence-body">
        <code>{text}</code>
      </pre>
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

function mentionify(children: ReactNode, knownNames: string[]): ReactNode {
  return Children.map(children, (child, index) => {
    if (typeof child !== "string") return child;
    const pieces = splitMentions(child, knownNames);
    if (pieces.length === 1 && pieces[0]?.type === "text") return child;
    return pieces.map((piece, inner) =>
      piece.type === "mention" && piece.resolved ? (
        <span key={`${index}-${inner}`} className="mention">
          {piece.value}
        </span>
      ) : (
        <span key={`${index}-${inner}`}>{piece.value}</span>
      ),
    );
  });
}
