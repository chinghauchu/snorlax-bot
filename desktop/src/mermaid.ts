// SPDX-License-Identifier: Apache-2.0
import { isMermaidLanguage } from "./markdown.ts";

let seq = 0;

function cssVar(name: string, fallback: string): string {
  if (typeof document === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function themeVariables(): Record<string, string | boolean> {
  const text = cssVar("--text", "#ececef");
  const muted = cssVar("--text-muted", "#8b8d94");
  const elevated = cssVar("--bg-elevated", "#18191e");
  const page = cssVar("--bg", "#0c0d10");
  const border = cssVar("--border", "rgba(255, 255, 255, 0.08)");
  const accent = cssVar("--accent", "#6d8bff");
  const dark =
    typeof document === "undefined"
      ? true
      : document.documentElement.getAttribute("data-theme") !== "light";
  return {
    darkMode: dark,
    background: elevated,
    primaryColor: accent,
    primaryTextColor: text,
    primaryBorderColor: border,
    lineColor: muted,
    secondaryColor: page,
    tertiaryColor: elevated,
    nodeTextColor: text,
    mainBkg: elevated,
    textColor: text,
    titleColor: text,
    clusterBkg: page,
    clusterBorder: border,
    edgeLabelBackground: elevated,
    noteBkgColor: page,
    noteTextColor: text,
    noteBorderColor: border,
    actorBkg: elevated,
    actorTextColor: text,
    actorBorder: border,
    signalColor: text,
    signalTextColor: text,
    labelBoxBkgColor: elevated,
    labelTextColor: text,
    loopTextColor: text,
    fontFamily: "inherit",
  };
}

const mermaidConfig = () => ({
  startOnLoad: false,
  securityLevel: "strict" as const,
  theme: "base" as const,
  themeVariables: themeVariables(),
  fontFamily: "inherit",
  flowchart: { useMaxWidth: false, htmlLabels: false },
  sequence: { useMaxWidth: false },
  class: { useMaxWidth: false },
  state: { useMaxWidth: false },
  er: { useMaxWidth: false },
  pie: { useMaxWidth: false },
  gantt: { useMaxWidth: false },
  journey: { useMaxWidth: false },
  gitGraph: { useMaxWidth: false },
});

let mermaidMod: Promise<typeof import("mermaid")> | null = null;

function loadMermaid() {
  mermaidMod ??= import("mermaid");
  return mermaidMod;
}

/** Official mermaid, client-side only. Null on invalid / failed parse. */
export async function renderMermaidSvg(source: string): Promise<string | null> {
  const text = source.trim();
  if (!text) return null;
  try {
    const mod = await loadMermaid();
    const mermaid = mod.default;
    mermaid.initialize(mermaidConfig());
    seq += 1;
    const id = `snorlaxMermaid${seq}`;
    const { svg } = await mermaid.render(id, text);
    return svg || null;
  } catch {
    return null;
  }
}

export function shouldRenderMermaid(opts: {
  language: string;
  completed: boolean;
}): boolean {
  return opts.completed && isMermaidLanguage(opts.language);
}
