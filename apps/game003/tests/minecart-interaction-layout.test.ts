import { describe, expect, it } from "vitest";
import { createGame003Layout } from "../src/game-layout.js";
import { createGame003MinecartInteractionLayout } from "../src/minecart-interaction-layout.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 minecart interaction layout", () => {
  it("creates a landscape offscreen entry and track stop below the reel area", () => {
    const gameLayout = createGame003Layout({
      viewportSize: { width: 1600, height: 1000 },
    });
    const config = getGame003SkinConfig("1").minecartInteraction;
    const layout = createGame003MinecartInteractionLayout({
      layout: gameLayout,
      config,
    });
    const reelArea = gameLayout.sceneParts.reelArea;

    expect(layout.orientation).toBe("landscape");
    expect(layout.cartStopCenter).toEqual({
      x: reelArea.x + reelArea.width / 2,
      y: reelArea.y + reelArea.height + 85,
    });
    expect(layout.cartStopCenter.y).toBeGreaterThan(
      reelArea.y + reelArea.height,
    );
    expect(
      layout.cartStartCenter.x +
        config.imageSize.width -
        layout.cartPivotInImage.x,
    ).toBeLessThanOrEqual(
      gameLayout.visibleRect.x - config.layout.landscape.offscreenMargin,
    );
    expect(layout.payloadStartCenter.x).toBeCloseTo(
      layout.payloadTargetCenter.x,
    );
    expect(layout.payloadTargetCenter).toEqual({
      x: reelArea.x + reelArea.width / 2,
      y: reelArea.y + reelArea.height / 2,
    });
  });

  it("creates a portrait offscreen entry and keeps payload flight vertical", () => {
    const gameLayout = createGame003Layout({
      viewportSize: { width: 1174, height: 2000 },
    });
    const config = getGame003SkinConfig("1").minecartInteraction;
    const layout = createGame003MinecartInteractionLayout({
      layout: gameLayout,
      config,
    });
    const reelArea = gameLayout.sceneParts.reelArea;

    expect(layout.orientation).toBe("portrait");
    expect(layout.cartStopCenter).toEqual({
      x: reelArea.x + reelArea.width / 2,
      y: reelArea.y + reelArea.height + 145,
    });
    expect(layout.cartStopCenter.y).toBeGreaterThan(
      reelArea.y + reelArea.height,
    );
    expect(
      layout.cartStartCenter.x +
        config.imageSize.width -
        layout.cartPivotInImage.x,
    ).toBeLessThanOrEqual(
      gameLayout.visibleRect.x - config.layout.portrait.offscreenMargin,
    );
    expect(layout.payloadStartCenter.x).toBeCloseTo(
      layout.payloadTargetCenter.x,
    );
  });
});
