// SPDX-License-Identifier: Apache-2.0

/**
 * v2.21: save a completed assistant code block.
 * A muted Save sits beside Copy on that fence. Desktop downloads the
 * full source. iOS hands the same bytes to the system share sheet and
 * does not ask for photo-library permission. Hidden lines under Show
 * more are included. A streaming fence hides Save. A math block has
 * no Save. Nothing is sent. No new shortcut. No animation.
 * Keep in lockstep with `ios/SnorlaxBot/CodeBlockSave.swift`.
 */

export const CODE_BLOCK_SAVE_LABEL = "Save";

/** Accessible name. Visible text stays Save. */
export const CODE_BLOCK_SAVE_ARIA = "Save code";

export const CODE_BLOCK_SAVE_STEM = "snippet";

export const CODE_BLOCK_SAVE_FALLBACK = "snippet.txt";

export const CODE_BLOCK_SAVE_MIME = "text/plain;charset=utf-8";

/** A download name longer than this is shortened, keeping a short extension. */
export const CODE_BLOCK_SAVE_MAX = 80;

/**
 * Fence info word → extension. The visible filename is `snippet.{ext}`.
 * Keys stay in lockstep with `CodeBlockSave.languageExtensions`.
 */
export const CODE_BLOCK_SAVE_EXTENSIONS: Record<string, string> = {
  bash: "sh",
  c: "c",
  "c#": "cs",
  "c++": "cpp",
  cc: "cpp",
  cjs: "cjs",
  cpp: "cpp",
  cs: "cs",
  csharp: "cs",
  css: "css",
  cxx: "cpp",
  dart: "dart",
  diff: "diff",
  go: "go",
  golang: "go",
  gql: "graphql",
  graphql: "graphql",
  h: "h",
  hpp: "hpp",
  htm: "html",
  html: "html",
  ini: "ini",
  java: "java",
  javascript: "js",
  js: "js",
  json: "json",
  jsonc: "json",
  jsx: "jsx",
  kotlin: "kt",
  kt: "kt",
  kts: "kts",
  lua: "lua",
  markdown: "md",
  md: "md",
  mermaid: "mmd",
  mjs: "mjs",
  patch: "diff",
  php: "php",
  plain: "txt",
  plaintext: "txt",
  proto: "proto",
  py: "py",
  python: "py",
  r: "r",
  rb: "rb",
  rs: "rs",
  ruby: "rb",
  rust: "rs",
  scala: "scala",
  scss: "scss",
  sh: "sh",
  shell: "sh",
  sql: "sql",
  svelte: "svelte",
  swift: "swift",
  text: "txt",
  toml: "toml",
  ts: "ts",
  tsx: "tsx",
  txt: "txt",
  typescript: "ts",
  vue: "vue",
  xml: "xml",
  yaml: "yml",
  yml: "yml",
  zsh: "sh",
};

/**
 * Info word that names a whole file, not `snippet.{ext}`.
 * Keys stay in lockstep with `CodeBlockSave.fileNames`.
 */
export const CODE_BLOCK_SAVE_FILE_NAMES: Record<string, string> = {
  dockerfile: "Dockerfile",
  gemfile: "Gemfile",
  makefile: "Makefile",
};

const WINDOWS_RESERVED = new Set([
  "con",
  "prn",
  "aux",
  "nul",
  "com1",
  "com2",
  "com3",
  "com4",
  "com5",
  "com6",
  "com7",
  "com8",
  "com9",
  "lpt1",
  "lpt2",
  "lpt3",
  "lpt4",
  "lpt5",
  "lpt6",
  "lpt7",
  "lpt8",
  "lpt9",
]);

const RESERVED_CHARS = new Set(["\\", "/", ":", "*", "?", '"', "<", ">", "|"]);

/** Same gate as fence Copy: a finished block only. */
export function showCodeBlockSave(completed: boolean): boolean {
  return completed;
}

/** Saving does not expand, collapse, send, or remove the fence. */
export function codeBlockSaveKeepsFence(): boolean {
  return true;
}

/** The label does not change, including when Reduce Motion is off. */
export function codeBlockSaveAnimates(_reduceMotion: boolean): boolean {
  return false;
}

/**
 * File body. The fence source only: no opening or closing fence, no
 * language tag. Interior whitespace stays. Lines hidden by Show more
 * stay in this string.
 */
export function codeBlockSaveBody(source: string): string {
  return source;
}

/**
 * Download or share-sheet name.
 * A path keeps its last segment. A segment that already has a short
 * extension stays, so `src/app.ts` is `app.ts`. A language word such
 * as `python` or `c++` becomes `snippet.py` or `snippet.cpp`.
 * `dockerfile` becomes `Dockerfile`. Anything else is `snippet.txt`.
 * A Windows device name is `snippet.txt`. Longer than 80 is shortened.
 */
export function codeBlockSaveFilename(language: string): string {
  const cleaned = sanitizeSegment(basename(firstToken(language)));
  if (!cleaned) return CODE_BLOCK_SAVE_FALLBACK;
  let name: string;
  if (plainExtension(cleaned) && !reservedStem(cleaned)) {
    name = cleaned;
  } else {
    const key = cleaned.toLowerCase();
    const whole = CODE_BLOCK_SAVE_FILE_NAMES[key];
    if (whole) {
      name = whole;
    } else {
      const ext = CODE_BLOCK_SAVE_EXTENSIONS[key];
      name = ext ? `${CODE_BLOCK_SAVE_STEM}.${ext}` : CODE_BLOCK_SAVE_FALLBACK;
    }
  }
  if (reservedStem(name)) return CODE_BLOCK_SAVE_FALLBACK;
  return capFilename(name);
}

/** Hand the source to the browser as a download. The fence stays up. */
export function downloadCodeBlock(source: string, filename: string): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([codeBlockSaveBody(source)], {
    type: CODE_BLOCK_SAVE_MIME,
  });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = filename;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(href), 1000);
}

function firstToken(language: string): string {
  const trimmed = language.trim();
  const match = /^\S+/.exec(trimmed);
  return match?.[0] ?? "";
}

function basename(token: string): string {
  const parts = token.split(/[/\\]/).filter((part) => part.length > 0);
  return parts.length > 0 ? (parts[parts.length - 1] ?? "") : "";
}

function sanitizeSegment(segment: string): string {
  let out = "";
  for (const ch of segment) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    if (RESERVED_CHARS.has(ch)) continue;
    out += ch;
  }
  let result = out.trim();
  while (result.startsWith(".")) result = result.slice(1);
  while (result.endsWith(".") || result.endsWith(" ")) {
    result = result.slice(0, -1);
  }
  return result.trim();
}

/** 1–8 ASCII letters or digits after the last dot. The stem must exist. */
function plainExtension(filename: string): string | null {
  const dot = filename.lastIndexOf(".");
  if (dot <= 0 || dot === filename.length - 1) return null;
  const ext = filename.slice(dot + 1);
  if (!/^[A-Za-z0-9]{1,8}$/.test(ext)) return null;
  return ext;
}

function reservedStem(filename: string): boolean {
  const stem = (filename.split(".")[0] ?? "").toLowerCase();
  return WINDOWS_RESERVED.has(stem);
}

function capFilename(name: string): string {
  if (name.length <= CODE_BLOCK_SAVE_MAX) return name;
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot) : "";
  if (ext.length >= 2 && ext.length <= 9 && plainExtension(name)) {
    const stem = name.slice(0, CODE_BLOCK_SAVE_MAX - ext.length);
    if (stem.length > 0) return stem + ext;
  }
  return name.slice(0, CODE_BLOCK_SAVE_MAX);
}
