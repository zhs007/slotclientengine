import { describe, expect, it } from "vitest";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import type {
  RenderSymbol,
  SymbolAssetMap,
} from "@slotclientengine/rendercore";
import {
  createTestTexture,
  createTextureSet,
} from "../../../packages/rendercore/tests/reel/helpers.js";
import { GAME_ASSET_SIZE } from "../src/game-layout.js";
import {
  GAME001_SYMBOL_SCALES,
  createGame001ReelRuntime,
} from "../src/game-demo.js";

const TARGET_SCENE = Object.freeze([
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([0, 4, 0, 5, 0]),
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([9, 0, 6, 0, 6]),
]);

describe("game001 reel runtime", () => {
  it("keeps reels hidden until a live scene is applied", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
    });

    expect(runtime.mainReelsLayer.visible).toBe(false);
    const finalYs = runtime.applyScene(TARGET_SCENE, "test.scene");

    expect(finalYs).toEqual([1, 1, 4, 0, 27]);
    expect(runtime.getFinalYs()).toEqual(finalYs);
    expect(runtime.getTargetScene()).toBeNull();
    expect(runtime.mainReelsLayer.visible).toBe(true);
    expect(runtime.reelSet.getVisibleScene()).toEqual(TARGET_SCENE);
  });

  it("uses parent fit scale without changing special symbol scale", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
      initialScene: TARGET_SCENE,
    });
    const rawWidth =
      runtime.layout.reelCount * runtime.layout.cellWidth +
      (runtime.layout.reelCount - 1) * runtime.layout.columnGap;
    const specialSymbol = findVisibleSymbol(runtime, "SC");

    expect(GAME001_SYMBOL_SCALES.SC).toBe(1.5);
    expect(specialSymbol.scale.x).toBe(1.5);
    expect(specialSymbol.scale.y).toBe(1.5);
    expect(runtime.mainReelsLayer.scale.x).toBe(
      GAME_ASSET_SIZE.mainReelsBackground.width / rawWidth,
    );
    expect(runtime.layerLayout.cropY).toBe(1.5 * runtime.layout.cellHeight);
    expect(runtime.layerLayout.cropHeight).toBe(2 * runtime.layout.cellHeight);
  });

  it("spins to a full 5 x 5 target scene and checks the final scene", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
      initialScene: TARGET_SCENE,
    });

    const dryRunPlan = runtime.createSpinPlan(TARGET_SCENE, "test.spin.plan");
    const plan = runtime.spinToScene(TARGET_SCENE, "test.spin");
    expect(plan.axes).toHaveLength(5);
    expect(dryRunPlan.axes.map((axis) => axis.finalY)).toEqual(
      plan.axes.map((axis) => axis.finalY),
    );
    expect(runtime.getTargetScene()).toEqual(TARGET_SCENE);
    expect(runtime.isSpinning()).toBe(true);
    expect(() => runtime.spinToScene(TARGET_SCENE)).toThrow(/already spinning/);

    let result = runtime.update(0.1);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      result = runtime.update(0.1);
    }

    expect(result.completed).toBe(true);
    expect(runtime.isSpinning()).toBe(false);
    expect(runtime.getCurrentScene()).toEqual(TARGET_SCENE);
    expect(runtime.reelSet.getVisibleScene()).toEqual(TARGET_SCENE);
  });

  it("rejects scenes that are not 5 x 5 before starting animation", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
      initialScene: TARGET_SCENE,
    });

    expect(() => runtime.spinToScene([[1, 2, 3, 4, 5]] as any)).toThrow(
      /width/,
    );
    expect(runtime.isSpinning()).toBe(false);
  });

  it("fails before animation when stop y cannot be resolved", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
      initialScene: TARGET_SCENE,
    });
    const impossibleScene = TARGET_SCENE.map((column) => [
      ...column,
    ]) as number[][];
    impossibleScene[0] = [10, 10, 10, 10, 10];

    expect(() => runtime.spinToScene(impossibleScene)).toThrow();
    expect(runtime.isSpinning()).toBe(false);
  });
});

function createGame001Textures(): SymbolAssetMap {
  const specialLayerCounts: Record<string, number> = {
    SC: 3,
    RS: 3,
    X2: 2,
    X5: 2,
    X10: 2,
  };

  return Object.fromEntries(
    [
      "S00",
      "S0",
      "S1",
      "S5",
      "S10",
      "SC",
      "RS",
      "X2",
      "X5",
      "X10",
      "CO",
      "SX",
    ].map((symbol) => [
      symbol,
      specialLayerCounts[symbol]
        ? createLayeredTextureSet(specialLayerCounts[symbol])
        : createTextureSet(20, 20),
    ]),
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
            texture: createTestTexture(20, 20),
          }),
        ),
      ),
    }),
    states: Object.freeze({
      spinBlur: createTestTexture(20, 20),
    }),
  });
}

function findVisibleSymbol(
  runtime: ReturnType<typeof createGame001ReelRuntime>,
  symbol: string,
): RenderSymbol {
  const visibleSymbol = runtime.reelSet.reels
    .flatMap((reel) => reel.getSlotSnapshots())
    .find((slot) => slot.symbol?.symbol === symbol)?.symbol;
  if (!visibleSymbol) {
    throw new Error(`Expected visible symbol "${symbol}".`);
  }
  return visibleSymbol;
}
