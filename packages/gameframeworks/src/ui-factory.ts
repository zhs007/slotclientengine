import { SlotGameConfigError, toSlotGameError } from "./errors.js";
import type {
  SlotGameFramePolicy,
  SlotGameUi,
  SlotGameUiCreateContext,
  SlotGameUiFactory,
  SlotGameViewportSnapshot,
} from "./types.js";

export function createAndValidateUi(
  factory: SlotGameUiFactory,
  context: SlotGameUiCreateContext,
): SlotGameUi {
  const ui = factory.create(freezeUiCreateContext(context));
  try {
    validateUiHandle(ui);
    validateViewportSnapshot(ui.getViewport());
    return ui;
  } catch (error) {
    try {
      if (
        typeof ui === "object" &&
        ui !== null &&
        typeof (ui as Partial<SlotGameUi>).destroy === "function"
      ) {
        (ui as Partial<SlotGameUi>).destroy?.();
      }
    } catch {
      // Preserve the create-boundary validation error.
    }
    if (error instanceof SlotGameConfigError) {
      throw error;
    }
    throw new SlotGameConfigError(
      `uiFactory.create() returned an invalid UI: ${
        toSlotGameError(error, "validation failed.").message
      }`,
    );
  }
}

export function validateViewportSnapshot(
  viewport: SlotGameViewportSnapshot,
): SlotGameViewportSnapshot {
  if (typeof viewport !== "object" || viewport === null) {
    throw new SlotGameConfigError(
      "SlotGameUi.getViewport() must return a viewport snapshot.",
    );
  }
  const pageSize = validateViewportSize(viewport.pageSize, "pageSize");
  const frameDesignSize = validateViewportSize(
    viewport.frameDesignSize,
    "frameDesignSize",
  );
  const cssSize = validateViewportSize(viewport.cssSize, "cssSize");
  for (const [label, value] of [
    ["scale", viewport.scale],
    ["offsetX", viewport.offsetX],
    ["offsetY", viewport.offsetY],
  ] as const) {
    if (!Number.isFinite(value)) {
      throw new SlotGameConfigError(
        `SlotGameUi viewport ${label} must be finite.`,
      );
    }
  }
  if (viewport.scale <= 0) {
    throw new SlotGameConfigError(
      "SlotGameUi viewport scale must be positive.",
    );
  }
  return Object.freeze({
    pageSize,
    frameDesignSize,
    scale: viewport.scale,
    cssSize,
    offsetX: viewport.offsetX,
    offsetY: viewport.offsetY,
  });
}

function freezeUiCreateContext(
  context: SlotGameUiCreateContext,
): SlotGameUiCreateContext {
  return Object.freeze({
    root: context.root,
    designSize: context.designSize,
    ...(context.framePolicy === undefined
      ? {}
      : { framePolicy: freezeFramePolicy(context.framePolicy) }),
    betOptions: context.betOptions,
    initialState: context.initialState,
    ...(context.brandLabel === undefined
      ? {}
      : { brandLabel: context.brandLabel }),
    ...(context.currency === undefined ? {} : { currency: context.currency }),
    ...(context.locale === undefined ? {} : { locale: context.locale }),
    ...(context.formatMoney === undefined
      ? {}
      : { formatMoney: context.formatMoney }),
    commands: context.commands,
  });
}

function freezeFramePolicy(policy: SlotGameFramePolicy): SlotGameFramePolicy {
  if (policy.mode === "fixed" || policy.mode === "maximized-focus") {
    return Object.freeze({ ...policy });
  }
  if (policy.mode === "focus") {
    return Object.freeze({
      ...policy,
      maxDesignSize: Object.freeze({ ...policy.maxDesignSize }),
      preferredPortraitSize: Object.freeze({
        ...policy.preferredPortraitSize,
      }),
      focusRect: Object.freeze({ ...policy.focusRect }),
      ...(policy.minFocusMargin === undefined
        ? {}
        : { minFocusMargin: Object.freeze({ ...policy.minFocusMargin }) }),
    });
  }
  const freezeVariant = (variant: (typeof policy.variants)["landscape"]) =>
    Object.freeze({
      ...variant,
      maxDesignSize: Object.freeze({ ...variant.maxDesignSize }),
      focusRect: Object.freeze({ ...variant.focusRect }),
      ...(variant.minFocusMargin === undefined
        ? {}
        : { minFocusMargin: Object.freeze({ ...variant.minFocusMargin }) }),
    });
  return Object.freeze({
    ...policy,
    variants: Object.freeze({
      landscape: freezeVariant(policy.variants.landscape),
      portrait: freezeVariant(policy.variants.portrait),
    }),
  });
}

function validateUiHandle(ui: unknown): asserts ui is SlotGameUi {
  if (typeof ui !== "object" || ui === null) {
    throw new SlotGameConfigError(
      "uiFactory.create() must return a SlotGameUi handle.",
    );
  }
  const candidate = ui as Partial<SlotGameUi>;
  if (
    typeof candidate.elements !== "object" ||
    candidate.elements === null ||
    !isHtmlElement(candidate.elements.frame) ||
    !isHtmlElement(candidate.elements.gameLayer) ||
    !isHtmlElement(candidate.elements.overlay)
  ) {
    throw new SlotGameConfigError(
      "SlotGameUi.elements must provide frame, gameLayer, and overlay HTMLElements.",
    );
  }
  if (
    typeof candidate.getViewport !== "function" ||
    typeof candidate.onViewportChange !== "function" ||
    typeof candidate.update !== "function" ||
    typeof candidate.destroy !== "function"
  ) {
    throw new SlotGameConfigError(
      "SlotGameUi must provide getViewport(), onViewportChange(), update(), and destroy().",
    );
  }
}

function isHtmlElement(value: unknown): value is HTMLElement {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as HTMLElement).appendChild === "function" &&
    typeof (value as HTMLElement).remove === "function"
  );
}

function validateViewportSize(
  size: { readonly width: number; readonly height: number } | undefined,
  label: string,
): { readonly width: number; readonly height: number } {
  if (
    typeof size !== "object" ||
    size === null ||
    !Number.isFinite(size.width) ||
    !Number.isFinite(size.height) ||
    size.width < 0 ||
    size.height < 0
  ) {
    throw new SlotGameConfigError(
      `SlotGameUi viewport ${label} must contain non-negative finite dimensions.`,
    );
  }
  return Object.freeze({ width: size.width, height: size.height });
}
