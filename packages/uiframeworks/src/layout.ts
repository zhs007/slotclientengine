import { SlotUiConfigError } from "./errors.js";
import type { SlotUiDesignSize } from "./types.js";

export const DEFAULT_SLOT_UI_DESIGN_SIZE: SlotUiDesignSize = Object.freeze({
  width: 941,
  height: 1672
});

export interface SlotUiLayout {
  readonly designSize: SlotUiDesignSize;
  readonly bottomBannerHeight: number;
  readonly topInset: number;
  readonly sideInset: number;
  readonly spinButtonDiameter: number;
  readonly autoButtonDiameter: number;
}

export function validateDesignSize(
  designSize: SlotUiDesignSize = DEFAULT_SLOT_UI_DESIGN_SIZE,
): SlotUiDesignSize {
  assertPositiveFinite(designSize.width, "designSize.width");
  assertPositiveFinite(designSize.height, "designSize.height");

  return Object.freeze({
    width: designSize.width,
    height: designSize.height
  });
}

export function calculateFrameScale(
  viewportWidth: number,
  viewportHeight: number,
  designSize: SlotUiDesignSize = DEFAULT_SLOT_UI_DESIGN_SIZE,
): number {
  const size = validateDesignSize(designSize);
  assertPositiveFinite(viewportWidth, "viewportWidth");
  assertPositiveFinite(viewportHeight, "viewportHeight");

  return Math.min(viewportWidth / size.width, viewportHeight / size.height);
}

export function createDefaultSlotLayout(
  designSize: SlotUiDesignSize = DEFAULT_SLOT_UI_DESIGN_SIZE,
): SlotUiLayout {
  const size = validateDesignSize(designSize);
  const shortSide = Math.min(size.width, size.height);
  const bottomBannerHeight = clamp(size.height * 0.15, 220, 280);

  return Object.freeze({
    designSize: size,
    bottomBannerHeight,
    topInset: Math.max(38, shortSide * 0.045),
    sideInset: Math.max(38, shortSide * 0.045),
    spinButtonDiameter: clamp(shortSide * 0.22, 174, 224),
    autoButtonDiameter: clamp(shortSide * 0.13, 112, 148)
  });
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SlotUiConfigError(`${label} must be a positive finite number.`);
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
