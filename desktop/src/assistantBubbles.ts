// SPDX-License-Identifier: Apache-2.0

/**
 * v0.48: completed LEFT `kind=message` splits on blank lines into short
 * multi-bubbles. Mid-stream stays one growing bubble. Runtime still stores
 * a single content string.
 */
export function splitAssistantBubbles(
  text: string,
  completed = true,
): string[] {
  if (!text) return [];
  const src = text.replace(/\r\n/g, "\n");
  if (!completed) return [src];

  const lines = src.split("\n");
  const parts: string[] = [];
  let chunk: string[] = [];
  let fence: string | null = null;
  let inMath = false;

  const flush = () => {
    while (chunk.length && chunk[0]!.trim() === "") chunk.shift();
    while (chunk.length && chunk[chunk.length - 1]!.trim() === "") chunk.pop();
    const joined = chunk.join("\n");
    if (joined.trim()) parts.push(joined);
    chunk = [];
  };

  for (const line of lines) {
    const fenceMatch = /^( {0,3})(`{3,}|~{3,})(.*)$/.exec(line);
    if (fenceMatch && !inMath) {
      const marker = fenceMatch[2]!;
      const info = fenceMatch[3] ?? "";
      if (!fence) {
        fence = marker;
      } else if (
        marker[0] === fence[0] &&
        marker.length >= fence.length &&
        info.trim() === ""
      ) {
        fence = null;
      }
    } else if (!fence) {
      if (line.trim() === "$$") inMath = !inMath;
    }

    if (!fence && !inMath && line.trim() === "") {
      flush();
      continue;
    }
    chunk.push(line);
  }
  flush();
  return parts;
}

/** Fences and block math stretch to the column; short prose hugs the text. */
export function assistantBubbleWide(text: string): boolean {
  return /^( {0,3})(`{3,}|~{3,})/m.test(text) || /^\s*\$\$/m.test(text);
}
