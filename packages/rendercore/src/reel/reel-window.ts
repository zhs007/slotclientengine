import type { LogicReels } from "@slotclientengine/logiccore";
import type { ReelLayout, ReelWindowSnapshot } from "./types.js";

export function createReelWindowSnapshot(options: {
  readonly reels: LogicReels;
  readonly x: number;
  readonly y: number;
  readonly layout: ReelLayout;
  readonly codeAt?: (symbolY: number) => number;
}): ReelWindowSnapshot {
  const baseY = Math.floor(options.y);
  const fractionalY = options.y - baseY;
  const codeAt = options.codeAt ?? ((symbolY: number) => options.reels.get(options.x, symbolY));
  const slots = [];

  for (
    let windowY = -options.layout.bufferRowsBefore;
    windowY < options.layout.visibleRows + options.layout.bufferRowsAfter;
    windowY += 1
  ) {
    const symbolY = baseY + windowY;
    slots.push(
      Object.freeze({
        windowY,
        symbolY,
        code: codeAt(symbolY)
      })
    );
  }

  return Object.freeze({
    x: options.x,
    y: options.y,
    baseY,
    pixelOffsetY: -fractionalY * options.layout.cellHeight,
    visibleScene: Object.freeze(
      Array.from({ length: options.layout.visibleRows }, (_, visibleY) =>
        codeAt(baseY + visibleY)
      )
    ),
    slots: Object.freeze(slots)
  });
}
