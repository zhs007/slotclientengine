import type { ResponsiveArtVariantId } from "@slotclientengine/rendercore";
import type { Game003BgBarSkinConfig } from "./skin-config.js";
import type { Game003Layout, Rect } from "./game-layout.js";

export interface Game003BgBarLayout {
  readonly orientation: ResponsiveArtVariantId;
  readonly movement: "down" | "right";
  readonly conveyorFrame: Rect;
  readonly slotRectsInConveyor: readonly [Rect, Rect, Rect, Rect, Rect];
}

export function createGame003BgBarLayout(options: {
  readonly layout: Game003Layout;
  readonly config: Game003BgBarSkinConfig;
}): Game003BgBarLayout {
  const variant = options.config.layout[options.layout.orientation];
  if (!variant) {
    throw new Error(
      `game003 bg-bar layout is missing ${options.layout.orientation}.`,
    );
  }
  if (variant.slotRectsInConveyor.length !== options.config.queueLength) {
    throw new Error("game003 bg-bar slot rect count must match queueLength.");
  }
  return Object.freeze({
    orientation: options.layout.orientation,
    movement: variant.movement,
    conveyorFrame: freezeRect(options.layout.sceneParts.conveyor),
    slotRectsInConveyor: Object.freeze(
      variant.slotRectsInConveyor.map(freezeRect),
    ) as readonly [Rect, Rect, Rect, Rect, Rect],
  });
}

export function getGame003BgBarSlotCenter(
  layout: Game003BgBarLayout,
  slotIndex: number,
): { readonly x: number; readonly y: number } {
  const rect = layout.slotRectsInConveyor[slotIndex];
  if (!rect) {
    throw new Error(`game003 bg-bar slot ${slotIndex} is out of range.`);
  }
  return Object.freeze({
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
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
