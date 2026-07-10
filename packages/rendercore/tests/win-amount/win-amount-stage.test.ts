import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { applyTierContainerLayout } from "../../src/win-amount/win-amount-stage.js";

describe("win amount stage layout", () => {
  it("renders VNI tiers at their natural 100% scale", () => {
    const container = new Container();

    applyTierContainerLayout(
      container,
      {
        minorTextPosition: { x: 0, y: 0 },
        majorTextPosition: { x: 0, y: 0 },
        tierStageRect: { x: 0, y: 0, width: 1174, height: 2000 },
      },
    );

    expect(container.scale.x).toBeCloseTo(1);
    expect(container.scale.y).toBeCloseTo(1);
  });

  it("does not fit VNI tiers to the stage rect size", () => {
    const container = new Container();

    applyTierContainerLayout(
      container,
      {
        minorTextPosition: { x: 0, y: 0 },
        majorTextPosition: { x: 0, y: 0 },
        tierStageRect: { x: 0, y: 0, width: 3000, height: 1000 },
      },
    );

    expect(container.scale.x).toBeCloseTo(1);
    expect(container.scale.y).toBeCloseTo(1);
  });
});
