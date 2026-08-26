// SPDX-License-Identifier: Apache-2.0

export const COMPUTER_PREVIEW_WIDTH = 288;
export const COMPUTER_PREVIEW_HEIGHT = 180;
export const COMPUTER_POLL_MS = 1500;
export const NO_COMPUTER_YET = "No computer yet.";
export const COMPUTER_LABEL = "Computer";

export type ComputerPreviewState = {
  hasSandbox?: boolean | null;
  width?: number | null;
  height?: number | null;
  imageUrl?: string | null;
};

export function showsComputerFrame(
  preview: ComputerPreviewState | null | undefined,
): boolean {
  return Boolean(preview?.hasSandbox);
}

export function computerImageUrl(
  preview: ComputerPreviewState | null | undefined,
): string {
  if (!showsComputerFrame(preview)) return "";
  return (preview?.imageUrl || "").trim();
}
