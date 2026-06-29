import { SlotUiConfigError } from "./errors.js";
import type {
  SlotUiDesignSize,
  SlotUiFocusFramePolicy,
  SlotUiFramePolicy,
  SlotUiViewportSnapshot,
} from "./types.js";

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

export function calculateSlotUiFrameViewport(options: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly designSize?: SlotUiDesignSize;
  readonly policy?: SlotUiFramePolicy;
}): SlotUiViewportSnapshot {
  assertPositiveFinite(options.viewportWidth, "viewportWidth");
  assertPositiveFinite(options.viewportHeight, "viewportHeight");
  const pageSize = Object.freeze({
    width: options.viewportWidth,
    height: options.viewportHeight,
  });
  const frameDesignSize = calculateFrameDesignSize(options);
  const scale = Math.min(
    pageSize.width / frameDesignSize.width,
    pageSize.height / frameDesignSize.height,
  );
  const cssSize = Object.freeze({
    width: frameDesignSize.width * scale,
    height: frameDesignSize.height * scale,
  });

  return Object.freeze({
    pageSize,
    frameDesignSize,
    scale,
    cssSize,
    offsetX: (pageSize.width - cssSize.width) / 2,
    offsetY: (pageSize.height - cssSize.height) / 2,
  });
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

function calculateFrameDesignSize(options: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly designSize?: SlotUiDesignSize;
  readonly policy?: SlotUiFramePolicy;
}): SlotUiDesignSize {
  const designSize = validateDesignSize(options.designSize);
  const policy = options.policy ?? { mode: "fixed" as const };
  if (policy.mode === "fixed") {
    return designSize;
  }
  if (policy.mode === "focus") {
    return calculateFocusFrameDesignSize({
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      maxDesignSize: policy.maxDesignSize,
      preferredPortraitSize: policy.preferredPortraitSize,
      focusRect: policy.focusRect,
      minFocusMargin: policy.minFocusMargin,
    });
  }
  if (policy.mode === "orientation-focus") {
    const variants = policy.variants;
    if (!variants?.landscape) {
      throw new SlotUiConfigError(
        "framePolicy orientation-focus variants must include landscape.",
      );
    }
    if (!variants.portrait) {
      throw new SlotUiConfigError(
        "framePolicy orientation-focus variants must include portrait.",
      );
    }
    const variant =
      options.viewportHeight > options.viewportWidth
        ? variants.portrait
        : variants.landscape;
    return calculateFocusFrameDesignSize({
      viewportWidth: options.viewportWidth,
      viewportHeight: options.viewportHeight,
      maxDesignSize: variant.maxDesignSize,
      preferredPortraitSize: variant.maxDesignSize,
      focusRect: variant.focusRect,
      minFocusMargin: variant.minFocusMargin,
    });
  }

  throw new SlotUiConfigError(
    "framePolicy.mode must be fixed, focus, or orientation-focus.",
  );
}

function calculateFocusFrameDesignSize(options: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly maxDesignSize: SlotUiDesignSize;
  readonly preferredPortraitSize: SlotUiDesignSize;
  readonly focusRect: SlotUiFocusFramePolicy["focusRect"];
  readonly minFocusMargin: SlotUiFocusFramePolicy["minFocusMargin"];
}): SlotUiDesignSize {
  const maxDesignSize = validateDesignSize(options.maxDesignSize);
  const preferredPortraitSize = validateDesignSize(
    options.preferredPortraitSize,
  );
  const focusWidth = readPositiveFinite(
    options.focusRect.width,
    "framePolicy.focusRect.width",
  );
  const focusHeight = readPositiveFinite(
    options.focusRect.height,
    "framePolicy.focusRect.height",
  );
  const margin = normalizeFocusMargin(options.minFocusMargin);
  const minFocusWidth = focusWidth + margin.left + margin.right;
  const minFocusHeight = focusHeight + margin.top + margin.bottom;

  if (
    preferredPortraitSize.width > maxDesignSize.width ||
    preferredPortraitSize.height > maxDesignSize.height
  ) {
    throw new SlotUiConfigError(
      "framePolicy.preferredPortraitSize must not exceed maxDesignSize.",
    );
  }
  if (
    minFocusWidth > maxDesignSize.width ||
    minFocusHeight > maxDesignSize.height
  ) {
    throw new SlotUiConfigError(
      "framePolicy focusRect and minFocusMargin must fit inside maxDesignSize.",
    );
  }

  const rawAspect = options.viewportWidth / options.viewportHeight;
  const portraitAspect =
    preferredPortraitSize.width / preferredPortraitSize.height;
  const maxWideAspect = maxDesignSize.width / minFocusHeight;
  let frameDesignWidth: number;
  let frameDesignHeight: number;

  if (rawAspect <= portraitAspect) {
    frameDesignHeight = maxDesignSize.height;
    frameDesignWidth = clamp(
      frameDesignHeight * rawAspect,
      minFocusWidth,
      preferredPortraitSize.width,
    );
  } else if (rawAspect >= maxWideAspect) {
    frameDesignWidth = maxDesignSize.width;
    frameDesignHeight = minFocusHeight;
  } else {
    frameDesignHeight = Math.max(minFocusHeight, minFocusWidth / rawAspect);
    frameDesignWidth = frameDesignHeight * rawAspect;
  }

  frameDesignWidth = clamp(
    frameDesignWidth,
    minFocusWidth,
    maxDesignSize.width,
  );
  frameDesignHeight = clamp(
    frameDesignHeight,
    minFocusHeight,
    maxDesignSize.height,
  );

  return Object.freeze({
    width: frameDesignWidth,
    height: frameDesignHeight,
  });
}

function assertPositiveFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new SlotUiConfigError(`${label} must be a positive finite number.`);
  }
}

function readPositiveFinite(value: number, label: string): number {
  assertPositiveFinite(value, label);
  return value;
}

function normalizeFocusMargin(
  margin: SlotUiFocusFramePolicy["minFocusMargin"],
): {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
} {
  const normalized = Object.freeze({
    left: margin?.left ?? 0,
    right: margin?.right ?? 0,
    top: margin?.top ?? 0,
    bottom: margin?.bottom ?? 0,
  });
  assertNonNegativeFinite(normalized.left, "framePolicy.minFocusMargin.left");
  assertNonNegativeFinite(normalized.right, "framePolicy.minFocusMargin.right");
  assertNonNegativeFinite(normalized.top, "framePolicy.minFocusMargin.top");
  assertNonNegativeFinite(
    normalized.bottom,
    "framePolicy.minFocusMargin.bottom",
  );
  return normalized;
}

function assertNonNegativeFinite(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new SlotUiConfigError(
      `${label} must be a non-negative finite number.`,
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
