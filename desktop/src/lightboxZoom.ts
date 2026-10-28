// SPDX-License-Identifier: Apache-2.0

/**
 * v2.12: zoom the image the lightbox is already showing.
 * Fit is 1×. Zoom in / Zoom out, double-click, and the wheel move
 * between 1× and 4×. A zoomed picture can be dragged. + / = zoom in,
 * − zooms out, and 0 fits, only while the overlay is open. Zoom does
 * not close, send, or remove a chip. Save still writes the original
 * bytes. Reduce Motion changes the scale instantly; otherwise 120ms.
 * Dragging does not ease. No new shortcuts-list chord. No new HTTP.
 * Keep in lockstep with `ios/SnorlaxBot/LightboxZoom.swift`.
 */

export const LIGHTBOX_ZOOM_MIN = 1;
export const LIGHTBOX_ZOOM_MAX = 4;
export const LIGHTBOX_ZOOM_STEP = 0.5;
export const LIGHTBOX_ZOOM_DOUBLE = 2;
export const LIGHTBOX_WHEEL_NOTCH = 48;
export const LIGHTBOX_ZOOM_TRANSITION_MS = 120;

export const LIGHTBOX_ZOOM_IN_LABEL = "Zoom in";
export const LIGHTBOX_ZOOM_OUT_LABEL = "Zoom out";
export const LIGHTBOX_ZOOM_IN_ARIA = "Zoom in";
export const LIGHTBOX_ZOOM_OUT_ARIA = "Zoom out";

export type LightboxZoom = {
  scale: number;
  x: number;
  y: number;
};

export const LIGHTBOX_ZOOM_FIT: LightboxZoom = { scale: 1, x: 0, y: 0 };

export type LightboxZoomAction = "in" | "out" | "fit" | "toggle";

export type LightboxZoomControl = "zoomOut" | "zoomIn" | "save" | "close";

export type LightboxPanLimits = {
  maxX: number;
  maxY: number;
};

function finite(value: number): number {
  return Number.isFinite(value) ? value : 0;
}

function quantize(scale: number): number {
  return Math.round(scale * 1000) / 1000;
}

/** 1× through 4×. Anything else falls back to fit. */
export function clampLightboxScale(scale: number): number {
  if (!Number.isFinite(scale)) return LIGHTBOX_ZOOM_MIN;
  return Math.min(
    LIGHTBOX_ZOOM_MAX,
    Math.max(LIGHTBOX_ZOOM_MIN, quantize(scale)),
  );
}

export function lightboxZoomCanIn(scale: number): boolean {
  return clampLightboxScale(scale) < LIGHTBOX_ZOOM_MAX - 0.001;
}

export function lightboxZoomCanOut(scale: number): boolean {
  return clampLightboxScale(scale) > LIGHTBOX_ZOOM_MIN + 0.001;
}

/** Drag to pan only after the picture is larger than fit. */
export function lightboxPanEnabled(scale: number): boolean {
  return lightboxZoomCanOut(scale);
}

/** Swipe-down dismiss stays the v0.79 gesture, and only at 1×. */
export function lightboxSwipeDismissAllowed(scale: number): boolean {
  return !lightboxPanEnabled(scale);
}

export function lightboxPanLimits(
  fitted: { width: number; height: number },
  scale: number,
): LightboxPanLimits {
  if (!lightboxPanEnabled(scale)) return { maxX: 0, maxY: 0 };
  const width = Number.isFinite(fitted.width) ? Math.max(0, fitted.width) : 0;
  const height = Number.isFinite(fitted.height) ? Math.max(0, fitted.height) : 0;
  return {
    maxX: ((scale - 1) * width) / 2,
    maxY: ((scale - 1) * height) / 2,
  };
}

export function clampLightboxPan(
  zoom: LightboxZoom,
  limits: LightboxPanLimits,
): LightboxZoom {
  const scale = clampLightboxScale(zoom.scale);
  if (!lightboxPanEnabled(scale)) return { ...LIGHTBOX_ZOOM_FIT };
  const maxX = Math.max(0, finite(limits.maxX));
  const maxY = Math.max(0, finite(limits.maxY));
  return {
    scale,
    x: Math.min(maxX, Math.max(-maxX, finite(zoom.x))),
    y: Math.min(maxY, Math.max(-maxY, finite(zoom.y))),
  };
}

function stepped(zoom: LightboxZoom, direction: 1 | -1): LightboxZoom {
  const scale = clampLightboxScale(zoom.scale + direction * LIGHTBOX_ZOOM_STEP);
  if (!lightboxPanEnabled(scale)) return { ...LIGHTBOX_ZOOM_FIT };
  return { scale, x: finite(zoom.x), y: finite(zoom.y) };
}

/** One button or key press. Fit clears the pan. */
export function lightboxZoomIn(zoom: LightboxZoom): LightboxZoom {
  return stepped(zoom, 1);
}

export function lightboxZoomOut(zoom: LightboxZoom): LightboxZoom {
  return stepped(zoom, -1);
}

/** Double-click / double-tap: 1× goes to 2×, anything larger returns to fit. */
export function lightboxZoomToggle(zoom: LightboxZoom): LightboxZoom {
  if (lightboxPanEnabled(zoom.scale)) return { ...LIGHTBOX_ZOOM_FIT };
  return { scale: LIGHTBOX_ZOOM_DOUBLE, x: 0, y: 0 };
}

export function lightboxZoomApplied(
  zoom: LightboxZoom,
  action: LightboxZoomAction,
  fitted: { width: number; height: number },
): LightboxZoom {
  const next =
    action === "in"
      ? lightboxZoomIn(zoom)
      : action === "out"
        ? lightboxZoomOut(zoom)
        : action === "toggle"
          ? lightboxZoomToggle(zoom)
          : { ...LIGHTBOX_ZOOM_FIT };
  return clampLightboxPan(next, lightboxPanLimits(fitted, next.scale));
}

/** Pinch multiplies the scale from the gesture's start. */
export function lightboxZoomFromPinch(
  baseScale: number,
  magnification: number,
): number {
  if (!Number.isFinite(baseScale)) return LIGHTBOX_ZOOM_MIN;
  if (!Number.isFinite(magnification) || magnification <= 0) {
    return clampLightboxScale(baseScale);
  }
  return clampLightboxScale(baseScale * magnification);
}

export function lightboxZoomPinched(
  baseScale: number,
  magnification: number,
  x: number,
  y: number,
  fitted: { width: number; height: number },
): LightboxZoom {
  const scale = lightboxZoomFromPinch(baseScale, magnification);
  return clampLightboxPan({ scale, x, y }, lightboxPanLimits(fitted, scale));
}

export function lightboxZoomPanned(
  scale: number,
  originX: number,
  originY: number,
  dx: number,
  dy: number,
  fitted: { width: number; height: number },
): LightboxZoom {
  if (!lightboxPanEnabled(scale)) return { ...LIGHTBOX_ZOOM_FIT };
  return clampLightboxPan(
    { scale, x: originX + dx, y: originY + dy },
    lightboxPanLimits(fitted, scale),
  );
}

/**
 * Trackpad and mouse-wheel deltas accumulate until one notch, then
 * one step. Negative deltaY zooms in. Leftover past a second notch
 * is dropped so one event cannot jump to 4×.
 */
export function lightboxZoomWheeled(
  zoom: LightboxZoom,
  deltaY: number,
  pending: number,
  fitted: { width: number; height: number },
): { zoom: LightboxZoom; pending: number } {
  if (!Number.isFinite(deltaY) || deltaY === 0) {
    return { zoom, pending: finite(pending) };
  }
  const total = finite(pending) + deltaY;
  if (Math.abs(total) < LIGHTBOX_WHEEL_NOTCH) return { zoom, pending: total };
  const next = lightboxZoomApplied(zoom, total < 0 ? "in" : "out", fitted);
  const consumed = total < 0 ? -LIGHTBOX_WHEEL_NOTCH : LIGHTBOX_WHEEL_NOTCH;
  let rest = total - consumed;
  if (Math.abs(rest) >= LIGHTBOX_WHEEL_NOTCH) rest = 0;
  return { zoom: next, pending: rest };
}

/**
 * Unmodified + / = zoom in, − / _ zoom out, 0 fits.
 * Cmd/Ctrl/Alt stay with the transcript text-size chord, which the
 * lightbox already blocks. Shift-0 is not fit.
 */
export function lightboxZoomKey(input: {
  key: string;
  metaKey?: boolean;
  ctrlKey?: boolean;
  altKey?: boolean;
  shiftKey?: boolean;
}): "in" | "out" | "fit" | null {
  if (input.metaKey || input.ctrlKey || input.altKey) return null;
  if (input.key === "+" || input.key === "=") return "in";
  if (input.key === "-" || input.key === "_") return "out";
  if (input.shiftKey) return null;
  if (input.key === "0") return "fit";
  return null;
}

export function lightboxDoubleClickZooms(clickCount: number): boolean {
  return clickCount >= 2;
}

/** Zooming leaves the overlay up. Nothing is sent and no chip is removed. */
export function lightboxZoomKeepsOpen(): boolean {
  return true;
}

/** The scale eases unless Reduce Motion is on. Dragging never eases. */
export function lightboxZoomTransitionMs(
  reduceMotion: boolean,
  dragging: boolean,
): number {
  if (reduceMotion || dragging) return 0;
  return LIGHTBOX_ZOOM_TRANSITION_MS;
}

/**
 * Tab order. A control at its limit is disabled and left out, so Tab
 * does not land on a button that does nothing. Close stays last.
 */
export function lightboxZoomFocusOrder(input: {
  saveOffered: boolean;
  canZoomOut: boolean;
  canZoomIn: boolean;
}): LightboxZoomControl[] {
  const order: LightboxZoomControl[] = [];
  if (input.canZoomOut) order.push("zoomOut");
  if (input.canZoomIn) order.push("zoomIn");
  if (input.saveOffered) order.push("save");
  order.push("close");
  return order;
}
