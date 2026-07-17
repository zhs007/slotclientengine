import { Graphics } from "pixi.js";
import type { SceneLayoutSnapshot } from "@slotclientengine/rendercore/scene-layout";

export function drawPreviewGuides(options: {
  readonly graphics: Graphics;
  readonly snapshot: SceneLayoutSnapshot;
  readonly showFocus: boolean;
  readonly showReels: boolean;
}): void {
  const graphics = options.graphics;
  graphics.clear();
  if (options.showFocus) {
    const focus = options.snapshot.focusRectInViewport;
    graphics
      .rect(focus.x, focus.y, focus.width, focus.height)
      .stroke({ color: 0x27e1a7, width: 3, alpha: 0.95 });
  }
  if (!options.showReels) return;
  for (const reel of Object.values(options.snapshot.reels)) {
    const rect = reel.viewportRect;
    graphics
      .rect(rect.x, rect.y, rect.width, rect.height)
      .stroke({ color: 0xffc857, width: 3, alpha: 1 });
    for (let x = 0; x < reel.columns; x += 1) {
      for (let y = 0; y < reel.rows; y += 1) {
        graphics
          .rect(
            rect.x + x * reel.stride.width,
            rect.y + y * reel.stride.height,
            reel.cellSize.width,
            reel.cellSize.height,
          )
          .stroke({ color: 0xffc857, width: 1, alpha: 0.72 });
      }
    }
  }
}
