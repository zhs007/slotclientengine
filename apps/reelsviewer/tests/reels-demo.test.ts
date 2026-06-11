import { describe, expect, it } from "vitest";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import { createReelsDemo } from "../src/reels-demo.js";
import {
  createTestTexture,
  createTextureSet
} from "../../../packages/rendercore/tests/reel/helpers.js";
import type { RenderSymbol, SymbolAssetMap } from "@slotclientengine/rendercore";

describe("reelsviewer demo", () => {
  it("builds the real GMI spin plan and lands on the GMI scene", () => {
    const demo = createReelsDemo({
      rawGameConfig,
      symbolAssets: createViewerTextures()
    });
    const plan = demo.createSpinPlan();

    expect(demo.finalYs).toEqual([1, 1, 4, 0, 27]);
    expect(plan.axes.every((axis) => axis.travelSymbols >= 50)).toBe(true);
    expect(demo.reelSet.getVisibleScene()).toEqual(demo.scene);

    demo.spin();
    expect(demo.isSpinning()).toBe(true);
    expect(() => demo.spin()).toThrow(/already spinning/);

    let result = demo.update(0.1);
    for (let index = 0; index < 50 && !result.completed; index += 1) {
      result = demo.update(0.1);
    }

    expect(result.completed).toBe(true);
    expect(demo.isSpinning()).toBe(false);
    expect(demo.reelSet.getVisibleScene()).toEqual(demo.scene);
  });

  it("fails if a textured paytable symbol has no spinBlur state texture", () => {
    const textures = { ...createViewerTextures() };
    textures.SC = {
      normal: createTextureSet(20, 20).normal,
      states: {}
    } as any;

    expect(() =>
      createReelsDemo({
        rawGameConfig,
        symbolAssets: textures
      })
    ).toThrow(/SC.*spinBlur/);
  });

  it("uses layered animation profiles so special symbol layer 0 stays still", () => {
    const demo = createReelsDemo({
      rawGameConfig,
      symbolAssets: createViewerTextures()
    });
    const specialSymbol = findVisibleSymbol(demo, "SC");
    const [baseLayer, bounceLayer, shineLayer] = specialSymbol.getLayerSprites();

    expect(specialSymbol.scale.x).toBe(1.5);
    expect(specialSymbol.scale.y).toBe(1.5);

    specialSymbol.requestState("appear");
    specialSymbol.update(0.12);

    expect(baseLayer.sprite.scale.x).toBe(1);
    expect(baseLayer.sprite.scale.y).toBe(1);
    expect(baseLayer.sprite.position.x).toBe(0);
    expect(baseLayer.sprite.position.y).toBe(0);
    expect(bounceLayer.sprite.scale.x).toBeGreaterThan(1);
    expect(bounceLayer.sprite.position.y).not.toBe(0);
    expect(shineLayer.sprite.scale.x).toBeGreaterThan(1);

    specialSymbol.update(1);
    specialSymbol.requestState("win");
    specialSymbol.update(0.2);

    expect(baseLayer.sprite.scale.x).toBe(1);
    expect(baseLayer.sprite.scale.y).toBe(1);
    expect(baseLayer.sprite.position.x).toBe(0);
    expect(baseLayer.sprite.position.y).toBe(0);
    expect(bounceLayer.sprite.scale.x).toBeGreaterThan(1);
  });

  it("uses configured symbol scales for both visual scale and reel cell size", () => {
    const demo = createReelsDemo({
      rawGameConfig,
      symbolAssets: createViewerTextures()
    });
    const layout = demo.reelSet.reels[0].layout;
    const specialSymbol = findVisibleSymbol(demo, "SC");

    expect(layout.cellWidth).toBe(30);
    expect(layout.cellHeight).toBe(30);
    expect(specialSymbol.scale.x).toBe(1.5);
    expect(specialSymbol.scale.y).toBe(1.5);
  });
});

function createViewerTextures(): SymbolAssetMap {
  const specialLayerCounts: Record<string, number> = {
    SC: 3,
    RS: 3,
    X2: 2,
    X5: 2,
    X10: 2
  };

  return Object.fromEntries(
    ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10", "CO", "SX"].map(
      (symbol) => [
        symbol,
        specialLayerCounts[symbol] ? createLayeredTextureSet(specialLayerCounts[symbol]) : createTextureSet(20, 20)
      ]
    )
  );
}

function createLayeredTextureSet(layerCount: number) {
  return Object.freeze({
    normal: Object.freeze({
      kind: "layered",
      layers: Object.freeze(
        Array.from({ length: layerCount }, (_unused, index) =>
          Object.freeze({
            index,
            texture: createTestTexture(20, 20)
          })
        )
      )
    }),
    states: Object.freeze({
      spinBlur: createTestTexture(20, 20)
    })
  });
}

function findVisibleSymbol(demo: ReturnType<typeof createReelsDemo>, symbol: string): RenderSymbol {
  const visibleSymbol = demo.reelSet.reels
    .flatMap((reel) => reel.getSlotSnapshots())
    .find((slot) => slot.symbol?.symbol === symbol)?.symbol;
  if (!visibleSymbol) {
    throw new Error(`Expected visible symbol "${symbol}".`);
  }
  return visibleSymbol;
}
