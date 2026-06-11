import { describe, expect, it } from "vitest";
import { createReelWindowSnapshot } from "../../src/reel/index.js";
import { createBasicLayout, createBasicReels } from "./helpers.js";

describe("createReelWindowSnapshot", () => {
  it("returns x-first visible symbols and fractional pixel offsets", () => {
    const reels = createBasicReels();
    const layout = createBasicLayout();
    const snapshot = createReelWindowSnapshot({
      reels,
      x: 0,
      y: 1.5,
      layout
    });

    expect(snapshot.baseY).toBe(1);
    expect(snapshot.pixelOffsetY).toBe(-6);
    expect(snapshot.visibleScene).toEqual([0, 2, 3]);
    expect(snapshot.slots.map((slot) => slot.code)).toEqual([
      reels.get(0, 0),
      reels.get(0, 1),
      reels.get(0, 2),
      reels.get(0, 3),
      reels.get(0, 4)
    ]);
  });
});
