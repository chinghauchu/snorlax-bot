// SPDX-License-Identifier: Apache-2.0
import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, listWorkspace, readWorkspaceFile } from "./api";
import {
  BINARY_TOO_LARGE,
  EMPTY_WORKSPACE_COPY,
  isEscapePath,
  joinWorkspacePath,
  previewNote,
  type WorkspaceEntry,
} from "./workspaceTree";
import type { Agent, Session } from "./types";

type Preview =
  | { path: string; content: string; truncated?: boolean }
  | { path: string; note: string };

export function ComputerSeamButton({
  open,
  onClick,
}: {
  open: boolean;
  onClick: () => void;
}) {
  const label = open ? "Hide Computer" : "Show Computer";
  return (
    <button
      type="button"
      className="icon-btn computer-seam"
      title={label}
      aria-label={label}
      aria-expanded={open}
      onClick={onClick}
    >
      {open ? "›" : "‹"}
    </button>
  );
}

export function ComputerPane({
  session,
  conversation,
  refreshKey,
  onCollapse,
}: {
  session: Session | null;
  conversation: Agent | null;
  refreshKey: number;
  onCollapse: () => void;
}) {
  const [root, setRoot] = useState("");
  const [listings, setListings] = useState<Record<string, WorkspaceEntry[]>>(
    {},
  );
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["."]));
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const expandedRef = useRef(expanded);
  const selectedRef = useRef(selected);
  expandedRef.current = expanded;
  selectedRef.current = selected;

  const loadDir = useCallback(
    async (path: string, signal?: { dead: boolean }) => {
      if (!session || !conversation) return;
      if (isEscapePath(path)) return;
      try {
        const listing = await listWorkspace(session, conversation.id, path);
        if (signal?.dead) return;
        setRoot(listing.root);
        setListings((prev) => ({ ...prev, [listing.path]: listing.entries }));
        setError(null);
      } catch (err) {
        if (signal?.dead) return;
        if (err instanceof ApiError) {
          setError(err.message);
          return;
        }
        setError(err instanceof Error ? err.message : "Cannot load workspace");
      }
    },
    [session, conversation],
  );

  const loadFile = useCallback(
    async (path: string, signal?: { dead: boolean }) => {
      if (!session || !conversation) return;
      if (isEscapePath(path)) return;
      try {
        const file = await readWorkspaceFile(session, conversation.id, path);
        if (signal?.dead) return;
        setPreview({
          path: file.path,
          content: file.content,
          truncated: file.truncated,
        });
        setError(null);
      } catch (err) {
        if (signal?.dead) return;
        if (err instanceof ApiError) {
          setPreview({ path, note: previewNote(err) });
          return;
        }
        setPreview({
          path,
          note: err instanceof Error ? err.message : BINARY_TOO_LARGE,
        });
      }
    },
    [session, conversation],
  );

  useEffect(() => {
    if (!session || !conversation) {
      setListings({});
      setRoot("");
      setPreview(null);
      return;
    }
    const signal = { dead: false };
    const dirs = new Set([".", ...expandedRef.current]);
    void Promise.all([...dirs].map((path) => loadDir(path, signal)));
    const current = selectedRef.current;
    if (current) void loadFile(current, signal);
    return () => {
      signal.dead = true;
    };
  }, [session, conversation, refreshKey, loadDir, loadFile]);

  function toggleDir(path: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else {
        next.add(path);
        void loadDir(path);
      }
      return next;
    });
  }

  function openFile(path: string) {
    setSelected(path);
    void loadFile(path);
  }

  const rootEntries = listings["."] ?? [];
  const empty = Boolean(session && conversation) && rootEntries.length === 0;

  return (
    <aside className="computer" aria-label="Computer">
      <header className="computer-head">
        <ComputerSeamButton open onClick={onCollapse} />
        <span>Computer</span>
      </header>
      {root ? (
        <p className="computer-root" title={root}>
          {root}
        </p>
      ) : (
        <p className="computer-root">workspace</p>
      )}
      <div className="computer-tree">
        {!session || !conversation ? (
          <p className="computer-empty">{EMPTY_WORKSPACE_COPY}</p>
        ) : empty && !error ? (
          <p className="computer-empty">{EMPTY_WORKSPACE_COPY}</p>
        ) : (
          <Tree
            path="."
            entries={rootEntries}
            listings={listings}
            expanded={expanded}
            selected={selected}
            onToggleDir={toggleDir}
            onOpenFile={openFile}
            depth={0}
          />
        )}
        {error ? <p className="computer-error">{error}</p> : null}
      </div>
      <div className="computer-preview">
        {preview && "note" in preview ? (
          <p className="computer-empty">{preview.note}</p>
        ) : preview && "content" in preview ? (
          <>
            <p className="computer-preview-path">{preview.path}</p>
            <pre>{preview.content}</pre>
            {preview.truncated ? (
              <p className="computer-empty">truncated</p>
            ) : null}
          </>
        ) : (
          <p className="computer-empty">Select a file</p>
        )}
      </div>
    </aside>
  );
}

function Tree({
  path,
  entries,
  listings,
  expanded,
  selected,
  onToggleDir,
  onOpenFile,
  depth,
}: {
  path: string;
  entries: WorkspaceEntry[];
  listings: Record<string, WorkspaceEntry[]>;
  expanded: Set<string>;
  selected: string | null;
  onToggleDir: (path: string) => void;
  onOpenFile: (path: string) => void;
  depth: number;
}) {
  return (
    <ul className="computer-list" style={{ paddingLeft: depth === 0 ? 0 : 12 }}>
      {entries.map((entry) => {
        const child = joinWorkspacePath(path, entry.name);
        if (entry.kind === "dir") {
          const open = expanded.has(child);
          return (
            <li key={child}>
              <button
                type="button"
                className="computer-row dir"
                onClick={() => onToggleDir(child)}
              >
                <span className="computer-twist" aria-hidden>
                  {open ? "▾" : "▸"}
                </span>
                <span>{entry.name}</span>
              </button>
              {open ? (
                <Tree
                  path={child}
                  entries={listings[child] ?? []}
                  listings={listings}
                  expanded={expanded}
                  selected={selected}
                  onToggleDir={onToggleDir}
                  onOpenFile={onOpenFile}
                  depth={depth + 1}
                />
              ) : null}
            </li>
          );
        }
        return (
          <li key={child}>
            <button
              type="button"
              className={
                selected === child ? "computer-row file on" : "computer-row file"
              }
              onClick={() => onOpenFile(child)}
            >
              <span className="computer-twist" aria-hidden />
              <span>{entry.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}
