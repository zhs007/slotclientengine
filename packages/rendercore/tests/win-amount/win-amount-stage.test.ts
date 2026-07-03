import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { applyTierContainerLayout } from "../../src/win-amount/win-amount-stage.js";

describe("win amount stage layout", () => {
  it("preserves VNI tier aspect ratio inside non-square stage rects", () => {
    const container = new Container();

    applyTierContainerLayout(
      container,
      {
        minorTextPosition: { x: 0, y: 0 },
        majorTextPosition: { x: 0, y: 0 },
        tierStageRect: { x: 0, y: 0, width: 1174, height: 2000 },
      },
      { width: 2000, height: 2000 },
    );

    expect(container.scale.x).toBeCloseTo(1);
    expect(container.scale.y).toBeCloseTo(1);
  });

  it("uses cover scale for wide stage rects without stretching", () => {
    const container = new Container();

    applyTierContainerLayout(
      container,
      {
        minorTextPosition: { x: 0, y: 0 },
        majorTextPosition: { x: 0, y: 0 },
        tierStageRect: { x: 0, y: 0, width: 3000, height: 1000 },
      },
      { width: 2000, height: 2000 },
    );

    expect(container.scale.x).toBeCloseTo(1.5);
    expect(container.scale.y).toBeCloseTo(1.5);
  });
});
