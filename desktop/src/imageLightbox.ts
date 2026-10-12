// SPDX-License-Identifier: Apache-2.0

/**
 * v0.79: click an image on a user-RIGHT or assistant-LEFT kind=message
 * bubble to open a full-size overlay. Esc, a click outside, or Close
 * dismisses it and focus returns to that image. Videos stay the player.
 * File chips stay chips. 120ms opacity; instant when Reduce Motion is on.
 * No new HTTP.
 */

export const IMAGE_LIGHTBOX_CLOSE = "Close";
export const IMAGE_LIGHTBOX_LABEL = "Image";

/** Keep in lockstep with the backdrop transition and iOS `ImageLightbox.fadeMs`. */
export const IMAGE_LIGHTBOX_FADE_MS = 120;

export type ImageLightboxTarget = {
  id: string;
  url: string;
  name: string;
};

export type LightboxPaint = {
  /** Keep the overlay in the tree, including during the dismiss fade. */
  mounted: boolean;
  /** Fully opaque and clickable. False at the start of appear / during dismiss. */
  shown: boolean;
};

export const LIGHTBOX_HIDDEN: LightboxPaint = { mounted: false, shown: false };

/** Only image attachments. Video stays the player; file chips stay chips. */
export function isLightboxImage(kind: string): boolean {
  return kind === "image";
}

export function lightboxLabel(name: string): string {
  const trimmed = name.trim();
  return trimmed || IMAGE_LIGHTBOX_LABEL;
}

/** Appear/dismiss opacity fade. Instant when Reduce Motion is on. */
export function lightboxFadeMs(reduceMotion: boolean): number {
  return reduceMotion ? 0 : IMAGE_LIGHTBOX_FADE_MS;
}

/** First paint when the overlay appears. Reduce Motion → fully shown. */
export function lightboxAppear(reduceMotion: boolean): LightboxPaint {
  return { mounted: true, shown: reduceMotion };
}

/** After the opening frame (or instantly under Reduce Motion). */
export function lightboxShown(): LightboxPaint {
  return { mounted: true, shown: true };
}

/** First paint when the overlay dismisses. Reduce Motion → unmount. */
export function lightboxDismiss(reduceMotion: boolean): LightboxPaint {
  return reduceMotion ? LIGHTBOX_HIDDEN : { mounted: true, shown: false };
}

/**
 * Esc closes the lightbox and must not fall through to Stop, Jump,
 * find, the switcher, or recall. IME composition keeps Esc.
 */
export function escapeClosesLightbox(input: {
  open: boolean;
  composing: boolean;
}): boolean {
  return input.open && !input.composing;
}
