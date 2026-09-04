// SPDX-License-Identifier: Apache-2.0
import { showAssistantCopy } from "./messageActions.ts";

export const SPEAK_LABEL = "Speak";
export const STOP_SPEAKING_LABEL = "Stop speaking";

export function showAssistantSpeak(opts: {
  message: {
    kind?: string;
    role?: string;
    senderId?: string;
  };
  completed: boolean;
}): boolean {
  return showAssistantCopy(opts);
}

export function speakLabel(playing: boolean): string {
  return playing ? STOP_SPEAKING_LABEL : SPEAK_LABEL;
}

/** Strip markdown to spoken text. Do not invent UI chrome. */
export function spokenText(src: string): string {
  let text = src ?? "";
  text = text.replace(/```[\s\S]*?```/g, (block) => {
    const inner = block.replace(/^```[^\n]*\n?/, "").replace(/```$/, "");
    return inner;
  });
  text = text.replace(/`([^`]+)`/g, "$1");
  text = text.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
  text = text.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  text = text.replace(/^#{1,6}\s+/gm, "");
  text = text.replace(/^\s{0,3}>\s?/gm, "");
  text = text.replace(/^\s*[-*+]\s+/gm, "");
  text = text.replace(/^\s*\d+\.\s+/gm, "");
  text = text.replace(/(\*\*|__)(.*?)\1/g, "$2");
  text = text.replace(/(\*|_)(.*?)\1/g, "$2");
  text = text.replace(/~~(.*?)~~/g, "$1");
  text = text.replace(/[ \t]+\n/g, "\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.replace(/[ \t]{2,}/g, " ").trim();
}
