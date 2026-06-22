import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import {
  RenderSymbol,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import {
  createTestTexture,
  createTextureSet,
} from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME001_LOCKED_CENTER_Y,
  GAME_ASSET_SIZE,
} from "../src/game-layout.js";
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

const SERVER_SCENE_WITH_REDACTED_REEL_STOP = Object.freeze([
  Object.freeze([2, 0, 2, 0, 3]),
  TARGET_SCENE[1],
  TARGET_SCENE[2],
  TARGET_SCENE[3],
  TARGET_SCENE[4],
]);
describe("game001 reel runtime", () => {
  it("keeps reels hidden until a live scene is applied", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
    });

    expect(runtime.mainReelsLayer.visible).toBe(false);
    expect(runtime.getVisualSnapshot().lockedAxis.code).toBeNull();
    expect(runtime.getVisualSnapshot().lockedAxis.visibleSymbolCount).toBe(0);
    const finalYs = runtime.applyScene(TARGET_SCENE, "test.scene");

    expect(finalYs).toEqual([1, 1, 4, 0, 27]);
    expect(runtime.getFinalYs()).toEqual(finalYs);
    expect(runtime.getTargetScene()).toBeNull();
    expect(runtime.mainReelsLayer.visible).toBe(true);
    expectRuntimeVisualMatchesScene(runtime, TARGET_SCENE);
  });

  it("renders a live scene even when the redacted client reel has no exact stop y", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
    });

    expect(runtime.applyScene(SERVER_SCENE_WITH_REDACTED_REEL_STOP)).toEqual([
      0, 1, 4, 0, 27,
    ]);
    expectRuntimeVisualMatchesScene(
      runtime,
      SERVER_SCENE_WITH_REDACTED_REEL_STOP,
    );
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
    const oldFullBackgroundScale =
      GAME_ASSET_SIZE.mainReelsBackground.width / rawWidth;
    const specialSymbol = findVisibleSymbol(runtime, "SC");

    expect(GAME001_SYMBOL_SCALES.SC).toBe(1.75);
    expect(specialSymbol.scale.x).toBe(1.75);
    expect(specialSymbol.scale.y).toBe(1.75);
    expect(runtime.mainReelsLayer.scale.x).toBe(
      runtime.layerLayout.mainReelsFitScale,
    );
    expect(runtime.mainReelsLayer.scale.x).not.toBe(oldFullBackgroundScale);
    expect(runtime.layerLayout.cropY).toBeCloseTo(
      (GAME001_LOCKED_CENTER_Y + 0.5) * runtime.layout.cellHeight -
        runtime.layerLayout.cropHeight / 2,
    );
    expect(runtime.layerLayout.cropHeight).toBeLessThan(
      2 * runtime.layout.cellHeight,
    );
    expect(runtime.layerLayout.visibleHeight).toBeCloseTo(
      runtime.layerLayout.stageVisibleFrame.height,
    );
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
    const spinningSnapshot = runtime.getVisualSnapshot();
    const lockedAxis = spinningSnapshot.lockedAxis;
    expect(spinningSnapshot.startedNormalAxes).not.toContain(3);
    expect(lockedAxis.code).toBe(TARGET_SCENE[3][2]);
    expect(lockedAxis.rotation).toBe(0);
    expect(lockedAxis.requestedState).toBe("normal");
    expect(lockedAxis.requestedState).not.toBe("spinBlur");

    let result = runtime.update(0.1);
    const updatingLockedAxis = runtime.getVisualSnapshot().lockedAxis;
    expect(updatingLockedAxis.code).toBe(lockedAxis.code);
    expect(updatingLockedAxis.x).toBe(lockedAxis.x);
    expect(updatingLockedAxis.y).toBe(lockedAxis.y);
    expect(updatingLockedAxis.rotation).toBe(0);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      result = runtime.update(0.1);
    }

    expect(result.completed).toBe(true);
    expect(runtime.isSpinning()).toBe(false);
    expect(runtime.getCurrentScene()).toEqual(TARGET_SCENE);
    expectRuntimeVisualMatchesScene(runtime, TARGET_SCENE);
  });

  it("plays SC win keyframes when a visible SC is manually requested", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
      initialScene: TARGET_SCENE,
    });
    const scSymbol = findVisibleSymbol(runtime, "SC");
    const scLayer = scSymbol.getLayerSprites()[1];

    expect(scLayer.keyframes).toHaveLength(5);
    scSymbol.requestState("win");
    expect(scLayer.sprite.texture).toBe(scLayer.keyframes[0]);

    scSymbol.update(0.2);
    expect(scLayer.sprite.texture).toBe(scLayer.keyframes[1]);
  });

  it("rotates RS layer 1 left while it scales during appear and win", () => {
    const rsScene = Object.freeze([
      ...TARGET_SCENE.slice(0, 4),
      Object.freeze([0, 6, 0, 7, 0]),
    ]);
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
      initialScene: rsScene,
    });
    const rsSymbol = findVisibleSymbol(runtime, "RS");
    const layerOne = rsSymbol.getLayerSprites()[1];

    rsSymbol.requestState("appear");
    rsSymbol.update(0.2);

    expect(layerOne.sprite.scale.x).toBeGreaterThan(1);
    expect(layerOne.sprite.rotation).toBeLessThan(0);

    rsSymbol.update(1);
    expect(layerOne.sprite.rotation).toBe(0);

    rsSymbol.requestState("win");
    rsSymbol.update(0.2);

    expect(layerOne.sprite.scale.x).toBeGreaterThan(1);
    expect(layerOne.sprite.rotation).toBeLessThan(0);

    rsSymbol.update(1);
    expect(layerOne.sprite.rotation).toBe(0);
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

  it("injects the server target scene when the redacted client reel has no exact stop y", () => {
    const runtime = createGame001ReelRuntime({
      rawGameConfig,
      symbolAssets: createGame001Textures(),
      initialScene: TARGET_SCENE,
    });

    const plan = runtime.spinToScene(SERVER_SCENE_WITH_REDACTED_REEL_STOP);
    expect(plan.axes[0].finalY).toBe(0);
    expect(runtime.isSpinning()).toBe(true);

    let result = runtime.update(0.1);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      result = runtime.update(0.1);
    }

    expect(result.completed).toBe(true);
    expect(runtime.isSpinning()).toBe(false);
    expect(runtime.getCurrentScene()).toEqual(
      SERVER_SCENE_WITH_REDACTED_REEL_STOP,
    );
    expectRuntimeVisualMatchesScene(
      runtime,
      SERVER_SCENE_WITH_REDACTED_REEL_STOP,
    );
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
        ? createLayeredTextureSet(specialLayerCounts[symbol], symbol === "SC")
        : createTextureSet(20, 20),
    ]),
  );
}

function createLayeredTextureSet(layerCount: number, withKeyframes = false) {
  return Object.freeze({
    normal: Object.freeze({
      kind: "layered",
      layers: Object.freeze(
        Array.from({ length: layerCount }, (_unused, index) => {
          const texture = createTestTexture(20, 20);
          return Object.freeze({
            index,
            texture,
            ...(withKeyframes && index === 1
              ? {
                  keyframes: Object.freeze([
                    texture,
                    createTestTexture(20, 20),
                    createTestTexture(20, 20),
                    createTestTexture(20, 20),
                    createTestTexture(20, 20),
                  ]),
                }
              : {}),
          });
        }),
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
  const stack: Container[] = [...runtime.mainReelsLayer.children];
  while (stack.length > 0) {
    const child = stack.shift();
    if (!child) {
      continue;
    }
    if (
      child instanceof RenderSymbol &&
      child.visible &&
      child.symbol === symbol
    ) {
      return child;
    }
    stack.push(...child.children.filter((item) => item instanceof Container));
  }
  throw new Error(`Expected visible symbol "${symbol}".`);
}

function expectRuntimeVisualMatchesScene(
  runtime: ReturnType<typeof createGame001ReelRuntime>,
  scene: typeof TARGET_SCENE | typeof SERVER_SCENE_WITH_REDACTED_REEL_STOP,
): void {
  const snapshot = runtime.getVisualSnapshot();
  expect(snapshot.normalAxisIndexes).toEqual([0, 1, 2, 4]);
  expect(snapshot.normalVisibleScene).toEqual([
    scene[0],
    scene[1],
    scene[2],
    scene[4],
  ]);
  expect(snapshot.lockedAxis.xIndex).toBe(3);
  expect(snapshot.lockedAxis.sceneY).toBe(2);
  expect(snapshot.lockedAxis.code).toBe(scene[3][2]);
  expect(snapshot.lockedAxis.visibleSymbolCount).toBe(1);
}
