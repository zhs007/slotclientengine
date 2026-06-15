import { SlotUiConfigError } from "./errors.js";
import type { SlotUiDesignSize } from "./types.js";

export const DEFAULT_SLOT_UI_DESIGN_SIZE: SlotUiDesignSize = Object.freeze({
  width: 941,
  height: 1672,
});

export interface SlotUiLayout {
  readonly designSize: SlotUiDesignSize;
  readonly topInset: number;
  readonly sideInset: number;
  readonly bottomHudHeight: number;
  readonly leftRailButtonSize: number;
  readonly leftRailGap: number;
  readonly buyBonusWidth: number;
  readonly buyBonusHeight: number;
  readonly spinButtonDiameter: number;
  readonly autoButtonDiameter: number;
  readonly betStepButtonDiameter: number;
}

export function validateDesignSize(
  designSize: SlotUiDesignSize = DEFAULT_SLOT_UI_DESIGN_SIZE,
): SlotUiDesignSize {
  assertPositiveFinite(designSize.width, "designSize.width");
  assertPositiveFinite(designSize.height, "designSize.height");

  return Object.freeze({
    width: designSize.width,
    height: designSize.height,
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
  const longSide = Math.max(size.width, size.height);
  const uiScale = shortSide / DEFAULT_SLOT_UI_DESIGN_SIZE.width;

  return Object.freeze({
    designSize: size,
    topInset: clamp(longSide * 0.014, 18, 34),
    sideInset: clamp(shortSide * 0.024, 20, 34),
    bottomHudHeight: clamp(longSide * 0.138, 188, 238),
    leftRailButtonSize: clamp(58 * uiScale, 46, 68),
    leftRailGap: clamp(22 * uiScale, 14, 28),
    buyBonusWidth: clamp(184 * uiScale, 144, 204),
    buyBonusHeight: clamp(92 * uiScale, 72, 106),
    spinButtonDiameter: clamp(146 * uiScale, 108, 154),
    autoButtonDiameter: clamp(72 * uiScale, 56, 82),
    betStepButtonDiameter: clamp(50 * uiScale, 42, 58),
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
