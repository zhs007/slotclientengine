import type { SlotGameFramePolicy } from "@slotclientengine/gameframeworks";
import {
  calculateResponsiveArtViewport,
  mapArtRectToViewport,
  type RenderViewportSize,
  type ResponsiveArtVariantId,
  type ResponsiveArtViewport,
} from "@slotclientengine/rendercore";
import {
  createReelLayout,
  type ReelLayout,
} from "@slotclientengine/rendercore/reel";

export const GAME003_REELS_NAME = "bg-reel01";
export const GAME003_REEL_COUNT = 5;
export const GAME003_VISIBLE_ROWS = 5;

export const GAME003_SKIN1_LANDSCAPE_ART_SIZE = Object.freeze({
  width: 2000,
  height: 2000,
});

export const GAME003_SKIN1_PORTRAIT_ART_SIZE = Object.freeze({
  width: 1174,
  height: 2000,
});

export const GAME003_REFERENCE_SIZE = GAME003_SKIN1_PORTRAIT_ART_SIZE;

export const GAME003_ASSET_SIZE = Object.freeze({
  landscapeBackground: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
  portraitBackground: GAME003_SKIN1_PORTRAIT_ART_SIZE,
  mainReelBackground: Object.freeze({ width: 1130, height: 824 }),
  landscapeConveyor: Object.freeze({ width: 284, height: 775 }),
  portraitConveyor: Object.freeze({ width: 934, height: 227 }),
});

export const GAME003_SCENE_PART_GAP = 10;

export const GAME003_REEL_WINDOW_IN_MAIN_REEL_BG = Object.freeze({
  x: 135,
  y: 87,
  width: 860,
  height: 650,
});

export const GAME003_CELL_WIDTH =
  GAME003_REEL_WINDOW_IN_MAIN_REEL_BG.width / GAME003_REEL_COUNT;
export const GAME003_CELL_HEIGHT =
  GAME003_REEL_WINDOW_IN_MAIN_REEL_BG.height / GAME003_VISIBLE_ROWS;

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
  readonly reelWindow: Rect;
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
  readonly reelWindowInViewport: Rect;
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
  createLandscapeSceneParts(),
) satisfies Game003ScenePartLayout;

export const GAME003_SKIN1_PORTRAIT_SCENE_PARTS = Object.freeze(
  createPortraitSceneParts(),
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
  return Object.freeze({
    mode: "orientation-focus",
    variants: Object.freeze({
      landscape: Object.freeze({
        maxDesignSize: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
        focusRect: Object.freeze({
          width: GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.focusRegion.width,
          height: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.height,
        }),
      }),
      portrait: Object.freeze({
        maxDesignSize: GAME003_SKIN1_PORTRAIT_ART_SIZE,
        focusRect: Object.freeze({
          width: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.width,
          height: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.height,
        }),
        minFocusMargin: Object.freeze({
          left: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.x,
          right:
            GAME003_SKIN1_PORTRAIT_ART_SIZE.width -
            GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.x -
            GAME003_SKIN1_PORTRAIT_SCENE_PARTS.focusRegion.width,
        }),
      }),
    }),
  });
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
  const reelWindowInViewport = mapArtRectToViewport({
    artSize: viewport.artSize,
    visibleRect: viewport.visibleRect,
    rect: sceneParts.reelWindow,
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
    reelWindowInViewport,
  });
}

export function createGame003ReelLayout(): ReelLayout {
  return createReelLayout({
    reelCount: GAME003_REEL_COUNT,
    visibleRows: GAME003_VISIBLE_ROWS,
    cellWidth: GAME003_CELL_WIDTH,
    cellHeight: GAME003_CELL_HEIGHT,
    bufferRowsBefore: 1,
    bufferRowsAfter: 1,
  });
}

export function createGame003ReelLayerLayout(
  reelLayout: ReelLayout,
  layout: Game003Layout,
): Game003ReelLayerLayout {
  validateGame003ReelWindow(GAME003_REEL_WINDOW_IN_MAIN_REEL_BG);
  const rawReelsContentWidth =
    reelLayout.reelCount * reelLayout.cellWidth +
    (reelLayout.reelCount - 1) * reelLayout.columnGap;
  const rawReelsContentHeight = reelLayout.visibleRows * reelLayout.cellHeight;
  if (
    rawReelsContentWidth !== GAME003_REEL_WINDOW_IN_MAIN_REEL_BG.width ||
    rawReelsContentHeight !== GAME003_REEL_WINDOW_IN_MAIN_REEL_BG.height
  ) {
    throw new Error("game003 reel layout must match the calibrated window.");
  }

  return Object.freeze({
    rawReelsContentWidth,
    rawReelsContentHeight,
    x: layout.sceneParts.reelWindow.x,
    y: layout.sceneParts.reelWindow.y,
    stageVisibleFrame: layout.sceneParts.reelWindow,
    viewportVisibleFrame: layout.reelWindowInViewport,
  });
}

export function validateGame003ReelWindow(
  reelWindow: Rect = GAME003_REEL_WINDOW_IN_MAIN_REEL_BG,
): void {
  validateRect(reelWindow, "GAME003_REEL_WINDOW_IN_MAIN_REEL_BG");
  if (
    reelWindow.x + reelWindow.width >
      GAME003_ASSET_SIZE.mainReelBackground.width ||
    reelWindow.y + reelWindow.height >
      GAME003_ASSET_SIZE.mainReelBackground.height
  ) {
    throw new Error("game003 reel window must fit inside mainreelbg.png.");
  }
  if (reelWindow.width % GAME003_REEL_COUNT !== 0) {
    throw new Error("game003 reel window width must divide 5 columns.");
  }
  if (reelWindow.height % GAME003_VISIBLE_ROWS !== 0) {
    throw new Error("game003 reel window height must divide 5 rows.");
  }
}

function createLandscapeSceneParts(): Game003ScenePartLayout {
  const groupFrame = Object.freeze({
    x:
      (GAME003_SKIN1_LANDSCAPE_ART_SIZE.width -
        GAME003_ASSET_SIZE.landscapeConveyor.width -
        GAME003_SCENE_PART_GAP -
        GAME003_ASSET_SIZE.mainReelBackground.width) /
      2,
    y:
      (GAME003_SKIN1_LANDSCAPE_ART_SIZE.height -
        GAME003_ASSET_SIZE.mainReelBackground.height) /
      2,
    width:
      GAME003_ASSET_SIZE.landscapeConveyor.width +
      GAME003_SCENE_PART_GAP +
      GAME003_ASSET_SIZE.mainReelBackground.width,
    height: GAME003_ASSET_SIZE.mainReelBackground.height,
  });
  const mainReelBackground = Object.freeze({
    x:
      groupFrame.x +
      GAME003_ASSET_SIZE.landscapeConveyor.width +
      GAME003_SCENE_PART_GAP,
    y: groupFrame.y,
    width: GAME003_ASSET_SIZE.mainReelBackground.width,
    height: GAME003_ASSET_SIZE.mainReelBackground.height,
  });
  const conveyor = Object.freeze({
    x: groupFrame.x,
    y:
      mainReelBackground.y +
      mainReelBackground.height -
      GAME003_ASSET_SIZE.landscapeConveyor.height,
    width: GAME003_ASSET_SIZE.landscapeConveyor.width,
    height: GAME003_ASSET_SIZE.landscapeConveyor.height,
  });
  const reelWindow = translateRect(
    GAME003_REEL_WINDOW_IN_MAIN_REEL_BG,
    mainReelBackground,
  );

  return Object.freeze({
    orientation: "landscape",
    artSize: GAME003_SKIN1_LANDSCAPE_ART_SIZE,
    backgroundFrame: Object.freeze({
      x: 0,
      y: 0,
      width: GAME003_SKIN1_LANDSCAPE_ART_SIZE.width,
      height: GAME003_SKIN1_LANDSCAPE_ART_SIZE.height,
    }),
    mainReelBackground,
    conveyor,
    groupFrame,
    focusRegion: groupFrame,
    reelWindow,
  });
}

function createPortraitSceneParts(): Game003ScenePartLayout {
  const groupFrame = Object.freeze({
    x:
      (GAME003_SKIN1_PORTRAIT_ART_SIZE.width -
        GAME003_ASSET_SIZE.mainReelBackground.width) /
      2,
    y:
      (GAME003_SKIN1_PORTRAIT_ART_SIZE.height -
        GAME003_ASSET_SIZE.portraitConveyor.height -
        GAME003_SCENE_PART_GAP -
        GAME003_ASSET_SIZE.mainReelBackground.height) /
      2,
    width: GAME003_ASSET_SIZE.mainReelBackground.width,
    height:
      GAME003_ASSET_SIZE.portraitConveyor.height +
      GAME003_SCENE_PART_GAP +
      GAME003_ASSET_SIZE.mainReelBackground.height,
  });
  const conveyor = Object.freeze({
    x:
      groupFrame.x +
      (groupFrame.width - GAME003_ASSET_SIZE.portraitConveyor.width) / 2,
    y: groupFrame.y,
    width: GAME003_ASSET_SIZE.portraitConveyor.width,
    height: GAME003_ASSET_SIZE.portraitConveyor.height,
  });
  const mainReelBackground = Object.freeze({
    x:
      groupFrame.x +
      (groupFrame.width - GAME003_ASSET_SIZE.mainReelBackground.width) / 2,
    y:
      groupFrame.y +
      GAME003_ASSET_SIZE.portraitConveyor.height +
      GAME003_SCENE_PART_GAP,
    width: GAME003_ASSET_SIZE.mainReelBackground.width,
    height: GAME003_ASSET_SIZE.mainReelBackground.height,
  });
  const reelWindow = translateRect(
    GAME003_REEL_WINDOW_IN_MAIN_REEL_BG,
    mainReelBackground,
  );

  return Object.freeze({
    orientation: "portrait",
    artSize: GAME003_SKIN1_PORTRAIT_ART_SIZE,
    backgroundFrame: Object.freeze({
      x: 0,
      y: 0,
      width: GAME003_SKIN1_PORTRAIT_ART_SIZE.width,
      height: GAME003_SKIN1_PORTRAIT_ART_SIZE.height,
    }),
    mainReelBackground,
    conveyor,
    groupFrame,
    focusRegion: groupFrame,
    reelWindow,
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
