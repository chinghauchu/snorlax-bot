// SPDX-License-Identifier: Apache-2.0
import {
  Children,
  isValidElement,
  type MouseEvent,
  type ReactNode,
} from "react";
import Markdown from "react-markdown";
import { copyText, isSafeHttpsUrl, stabilizeMarkdown } from "./markdown";
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
      }}
    >
      {source}
    </Markdown>
  );
}

function MdLink({
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

function CodeFence({ children }: { children?: ReactNode }) {
  const text = codeText(children).replace(/\n$/, "");
  return (
    <div className="md-fence">
      <button
        type="button"
        className="md-copy"
        onClick={() => void copyText(text)}
      >
        Copy
      </button>
      <pre className="md-fence-body">
        <code>{text}</code>
      </pre>
    </div>
  );
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
