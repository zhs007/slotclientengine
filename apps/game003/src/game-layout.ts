import {
  createSlotGameFramePolicyFromStaticConfig,
  getSlotGameStaticSkin,
  type SlotGameStaticArtVariant,
  type SlotGameStaticConveyorConfig,
  type SlotGameStaticNormalReelConfig,
  type SlotGameStaticReelAreaConfig,
} from "@slotclientengine/gameframeworks/static-config";
import type { SlotGameFramePolicy } from "@slotclientengine/gameframeworks";
import {
  calculateResponsiveArtViewport,
  mapAnchorRectToArt,
  mapArtRectToViewport,
  type RenderViewportSize,
  type ResponsiveArtVariantId,
  type ResponsiveArtViewport,
} from "@slotclientengine/rendercore";
import {
  createReelLayout,
  type ReelLayout,
} from "@slotclientengine/rendercore/reel";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";

const GAME003_STATIC_SKIN = getSlotGameStaticSkin(GAME003_STATIC_CONFIG, "1");
const GAME003_STATIC_REEL = getGame003StaticNormalReelConfig();
const GAME003_SKIN1_LANDSCAPE_VARIANT =
  GAME003_STATIC_SKIN.art.variants.landscape;
const GAME003_SKIN1_PORTRAIT_VARIANT =
  GAME003_STATIC_SKIN.art.variants.portrait;
const GAME003_SKIN1_LANDSCAPE_CONVEYOR = requireGame003Conveyor(
  GAME003_SKIN1_LANDSCAPE_VARIANT,
  "landscape",
);
const GAME003_SKIN1_PORTRAIT_CONVEYOR = requireGame003Conveyor(
  GAME003_SKIN1_PORTRAIT_VARIANT,
  "portrait",
);

export const GAME003_REELS_NAME = GAME003_STATIC_REEL.reelsName;
export const GAME003_REEL_COUNT = GAME003_STATIC_REEL.reelCount;
export const GAME003_VISIBLE_ROWS = GAME003_STATIC_REEL.visibleRows;

export const GAME003_SKIN1_LANDSCAPE_ART_SIZE = Object.freeze({
  width: GAME003_STATIC_SKIN.art.variants.landscape.background.width,
  height: GAME003_STATIC_SKIN.art.variants.landscape.background.height,
});

export const GAME003_SKIN1_PORTRAIT_ART_SIZE = Object.freeze({
  width: GAME003_STATIC_SKIN.art.variants.portrait.background.width,
  height: GAME003_STATIC_SKIN.art.variants.portrait.background.height,
});

export const GAME003_REFERENCE_SIZE = GAME003_SKIN1_PORTRAIT_ART_SIZE;

export const GAME003_ASSET_SIZE = Object.freeze({
  landscapeBackground: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
  portraitBackground: GAME003_SKIN1_PORTRAIT_ART_SIZE,
  mainReelBackground: Object.freeze({
    width: GAME003_STATIC_SKIN.art.mainReelBackground.width,
    height: GAME003_STATIC_SKIN.art.mainReelBackground.height,
  }),
  landscapeConveyor: Object.freeze({
    width: GAME003_SKIN1_LANDSCAPE_CONVEYOR.width,
    height: GAME003_SKIN1_LANDSCAPE_CONVEYOR.height,
  }),
  portraitConveyor: Object.freeze({
    width: GAME003_SKIN1_PORTRAIT_CONVEYOR.width,
    height: GAME003_SKIN1_PORTRAIT_CONVEYOR.height,
  }),
});

export const GAME003_REEL_AREA_IN_MAIN_REEL_BG = Object.freeze({
  x: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.x,
  y: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.y,
  width: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.width,
  height: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.height,
  reelCount: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.reelCount,
  reelGap: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.reelGap,
  cellWidth: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.cellWidth,
  cellHeight: GAME003_STATIC_SKIN.art.reelAreaInMainReelBackground.cellHeight,
});

export const GAME003_REEL_GAP = GAME003_REEL_AREA_IN_MAIN_REEL_BG.reelGap;
export const GAME003_CELL_WIDTH = GAME003_REEL_AREA_IN_MAIN_REEL_BG.cellWidth;
export const GAME003_CELL_HEIGHT = GAME003_REEL_AREA_IN_MAIN_REEL_BG.cellHeight;

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface Game003ScenePartLayout {
  readonly orientation: ResponsiveArtVariantId;
  readonly artSize: RenderViewportSize;
  readonly backgroundFrame: Rect;
  readonly mainReelBackground: Rect;
  readonly conveyor: Rect;
  readonly groupFrame: Rect;
  readonly focusRegion: Rect;
  readonly reelArea: Rect;
}

export interface Game003LayoutOptions {
  readonly viewportSize?: RenderViewportSize;
}

export interface Game003Layout {
  readonly orientation: ResponsiveArtVariantId;
  readonly artSize: RenderViewportSize;
  readonly viewportSize: RenderViewportSize;
  readonly visibleRect: ResponsiveArtViewport["visibleRect"];
  readonly worldOffset: ResponsiveArtViewport["worldOffset"];
  readonly focusRegion: Rect;
  readonly focusRegionInViewport: Rect;
  readonly background: Point;
  readonly backgroundFrame: Rect;
  readonly sceneParts: Game003ScenePartLayout;
  readonly mainReelBackgroundInViewport: Rect;
  readonly conveyorInViewport: Rect;
  readonly reelAreaInViewport: Rect;
}

export interface Game003ReelLayerLayout {
  readonly rawReelsContentWidth: number;
  readonly rawReelsContentHeight: number;
  readonly x: number;
  readonly y: number;
  readonly stageVisibleFrame: Rect;
  readonly viewportVisibleFrame: Rect;
}

export const GAME003_SKIN1_LANDSCAPE_SCENE_PARTS = Object.freeze(
  createGame003ScenePartsForVariant({
    orientation: "landscape",
    artSize: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
    variant: GAME003_SKIN1_LANDSCAPE_VARIANT,
  }),
) satisfies Game003ScenePartLayout;

export const GAME003_SKIN1_PORTRAIT_SCENE_PARTS = Object.freeze(
  createGame003ScenePartsForVariant({
    orientation: "portrait",
    artSize: GAME003_SKIN1_PORTRAIT_ART_SIZE,
    variant: GAME003_SKIN1_PORTRAIT_VARIANT,
  }),
) satisfies Game003ScenePartLayout;

export const GAME003_RESPONSIVE_VARIANTS = Object.freeze({
  landscape: Object.freeze({
    artSize: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
    focusRect: GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.focusRegion,
  }),
  portrait: Object.freeze({
    artSize: GAME003_SKIN1_PORTRAIT_ART_SIZE,
    focusRect: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion,
  }),
});

export function createGame003FramePolicy(): SlotGameFramePolicy {
  return createSlotGameFramePolicyFromStaticConfig(GAME003_STATIC_CONFIG, "1");
}

export function createGame003Layout(
  options: Game003LayoutOptions = {},
): Game003Layout {
  const viewport = calculateResponsiveArtViewport({
    viewportSize: options.viewportSize ?? GAME003_REFERENCE_SIZE,
    variants: GAME003_RESPONSIVE_VARIANTS,
  });
  const sceneParts =
    viewport.variantId === "portrait"
      ? GAME003_SKIN1_PORTRAIT_SCENE_PARTS
      : GAME003_SKIN1_LANDSCAPE_SCENE_PARTS;
  const mainReelBackgroundInViewport = mapArtRectToViewport({
    artSize: viewport.artSize,
    visibleRect: viewport.visibleRect,
    rect: sceneParts.mainReelBackground,
  });
  const conveyorInViewport = mapArtRectToViewport({
    artSize: viewport.artSize,
    visibleRect: viewport.visibleRect,
    rect: sceneParts.conveyor,
  });
  const reelAreaInViewport = mapArtRectToViewport({
    artSize: viewport.artSize,
    visibleRect: viewport.visibleRect,
    rect: sceneParts.reelArea,
  });

  return Object.freeze({
    orientation: viewport.variantId,
    artSize: viewport.artSize,
    viewportSize: viewport.viewportSize,
    visibleRect: viewport.visibleRect,
    worldOffset: viewport.worldOffset,
    focusRegion: sceneParts.focusRegion,
    focusRegionInViewport: viewport.focusRectInViewport,
    background: Object.freeze({ x: 0, y: 0 }),
    backgroundFrame: sceneParts.backgroundFrame,
    sceneParts,
    mainReelBackgroundInViewport,
    conveyorInViewport,
    reelAreaInViewport,
  });
}

export function createGame003ReelLayout(): ReelLayout {
  return createReelLayout({
    reelCount: GAME003_REEL_COUNT,
    visibleRows: GAME003_VISIBLE_ROWS,
    cellWidth: GAME003_CELL_WIDTH,
    cellHeight: GAME003_CELL_HEIGHT,
    columnGap: GAME003_REEL_GAP,
    rowGap: 0,
    bufferRowsBefore: 1,
    bufferRowsAfter: 1,
  });
}

export function createGame003ReelLayerLayout(
  reelLayout: ReelLayout,
  layout: Game003Layout,
): Game003ReelLayerLayout {
  validateGame003ReelArea(GAME003_REEL_AREA_IN_MAIN_REEL_BG);
  const rawReelsContentWidth =
    reelLayout.reelCount * reelLayout.cellWidth +
    (reelLayout.reelCount - 1) * reelLayout.columnGap;
  const rawReelsContentHeight =
    reelLayout.visibleRows * reelLayout.cellHeight +
    (reelLayout.visibleRows - 1) * reelLayout.rowGap;
  if (
    rawReelsContentWidth !== GAME003_REEL_AREA_IN_MAIN_REEL_BG.width ||
    rawReelsContentHeight !== GAME003_REEL_AREA_IN_MAIN_REEL_BG.height
  ) {
    throw new Error("game003 reel layout must match the calibrated reel area.");
  }

  return Object.freeze({
    rawReelsContentWidth,
    rawReelsContentHeight,
    x: layout.sceneParts.reelArea.x,
    y: layout.sceneParts.reelArea.y,
    stageVisibleFrame: layout.sceneParts.reelArea,
    viewportVisibleFrame: layout.reelAreaInViewport,
  });
}

export function validateGame003ReelArea(
  reelArea: SlotGameStaticReelAreaConfig = GAME003_REEL_AREA_IN_MAIN_REEL_BG,
): void {
  validateRect(reelArea, "GAME003_REEL_AREA_IN_MAIN_REEL_BG");
  if (
    reelArea.x + reelArea.width > GAME003_ASSET_SIZE.mainReelBackground.width ||
    reelArea.y + reelArea.height > GAME003_ASSET_SIZE.mainReelBackground.height
  ) {
    throw new Error("game003 reel area must fit inside mainreelbg.png.");
  }
  if (reelArea.reelCount !== GAME003_REEL_COUNT) {
    throw new Error("game003 reel area count must match reel.reelCount.");
  }
  const expectedWidth =
    reelArea.reelCount * reelArea.cellWidth +
    (reelArea.reelCount - 1) * reelArea.reelGap;
  if (!nearlyEqual(reelArea.width, expectedWidth)) {
    throw new Error("game003 reel area width must match cell sizes and gaps.");
  }
  const expectedHeight = GAME003_VISIBLE_ROWS * reelArea.cellHeight;
  if (!nearlyEqual(reelArea.height, expectedHeight)) {
    throw new Error("game003 reel area height must match cell sizes.");
  }
}

function nearlyEqual(left: number, right: number): boolean {
  return Math.abs(left - right) <= 0.000001;
}

export function createGame003ScenePartsForVariant(options: {
  readonly orientation: ResponsiveArtVariantId;
  readonly artSize: RenderViewportSize;
  readonly variant: SlotGameStaticArtVariant;
}): Game003ScenePartLayout {
  const { orientation, artSize, variant } = options;
  const conveyorConfig = requireGame003Conveyor(variant, orientation);
  const groupFrame = freezeRect(variant.focusRect);
  const mainReelBackground = mapAnchorRectToArt({
    artSize,
    anchorRect: groupFrame,
    rect: {
      x: variant.mainReelBackgroundPositionInFocusRect.x,
      y: variant.mainReelBackgroundPositionInFocusRect.y,
      width: GAME003_ASSET_SIZE.mainReelBackground.width,
      height: GAME003_ASSET_SIZE.mainReelBackground.height,
    },
  });
  const conveyor = mapAnchorRectToArt({
    artSize,
    anchorRect: groupFrame,
    rect: {
      x: conveyorConfig.positionInFocusRect.x,
      y: conveyorConfig.positionInFocusRect.y,
      width: conveyorConfig.width,
      height: conveyorConfig.height,
    },
  });
  const reelArea = translateRect(
    GAME003_REEL_AREA_IN_MAIN_REEL_BG,
    mainReelBackground,
  );

  return Object.freeze({
    orientation,
    artSize,
    backgroundFrame: Object.freeze({
      x: 0,
      y: 0,
      width: artSize.width,
      height: artSize.height,
    }),
    mainReelBackground,
    conveyor,
    groupFrame,
    focusRegion: groupFrame,
    reelArea,
  });
}

function translateRect(rect: Rect, origin: Rect): Rect {
  return Object.freeze({
    x: origin.x + rect.x,
    y: origin.y + rect.y,
    width: rect.width,
    height: rect.height,
  });
}

function freezeRect(rect: Rect): Rect {
  return Object.freeze({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
  });
}

function getGame003StaticNormalReelConfig(): SlotGameStaticNormalReelConfig {
  const reel = GAME003_STATIC_CONFIG.reel;
  if (reel.kind !== "normal") {
    throw new Error("game003 first release only supports normal reels.");
  }
  return reel;
}

function requireGame003Conveyor(
  variant: SlotGameStaticArtVariant,
  orientation: ResponsiveArtVariantId,
): SlotGameStaticConveyorConfig {
  if (!variant.conveyor) {
    throw new Error(`game003 ${orientation} conveyor config is required.`);
  }
  return variant.conveyor;
}

function validateRect(rect: Rect, label: string): void {
  for (const key of ["x", "y", "width", "height"] as const) {
    if (!Number.isFinite(rect[key])) {
      throw new Error(`${label}.${key} must be finite.`);
    }
  }
  if (rect.x < 0 || rect.y < 0) {
    throw new Error(`${label} origin must be non-negative.`);
  }
  if (rect.width <= 0 || rect.height <= 0) {
    throw new Error(`${label} size must be positive.`);
  }
}
