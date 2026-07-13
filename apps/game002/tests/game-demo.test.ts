import { describe, expect, it } from "vitest";
import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import {
  createDefaultSymbolAnimationResolver,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import { createTextureSet } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME002_SAMPLE_DEFAULT_SCENE,
  GAME002_SAMPLE_DEFAULT_STOP_Y,
  GAME002_SAMPLE_RANDOM_NUMBERS,
  GAME002_SAMPLE_SPIN_RESULT,
  GAME002_SAMPLE_SPIN_SCENE,
  GAME002_SAMPLE_WIN_RESULTS,
} from "./fixtures/game002-gmi.js";
import {
  DEFAULT_GAME002_REEL_CONFIG,
  assertGame002ReelVisualMatchesTarget,
  createGame002ReelRuntime,
} from "../src/game-demo.js";
import { GAME002_GRID_CELL_REEL_OFFSETS } from "../src/game-layout.js";
import { getGame002SkinConfig } from "../src/skin-config.js";

describe("game002-s3 reel runtime", () => {
  it("locks the public reels, all 13 symbol codes and sample stop values", () => {
    const runtime = createRuntime();

    expect(runtime.gameConfig.getReelNames()).toContain("reels-001");
    expect(runtime.gameConfig.getReels("reels-001").getReelCount()).toBe(6);
    expect(runtime.gameConfig.getSymbolCode("WL")).toBe(0);
    expect(runtime.gameConfig.getSymbolCode("BN")).toBe(12);
    expect(
      runtime.gameConfig.getStopYCoordinates({
        reelsName: "reels-001",
        sceneName: "sample default",
        scene: GAME002_SAMPLE_DEFAULT_SCENE,
      }),
    ).toEqual(GAME002_SAMPLE_DEFAULT_STOP_Y);
    expect(
      runtime.gameConfig.getStopYCoordinates({
        reelsName: "reels-001",
        sceneName: "sample spin",
        scene: GAME002_SAMPLE_SPIN_SCENE,
      }),
    ).toEqual(GAME002_SAMPLE_RANDOM_NUMBERS);
  });

  it("parses the live fixture without changing protocol semantics", () => {
    const result = createSlotGameLogicResult(GAME002_SAMPLE_SPIN_RESULT, {
      bet: { bet: 5, lines: 30, times: 1 },
      userInfo: { gameid: 0 },
    });

    expect(result.totalwin).toBe(1575);
    expect(result.logic.getDefaultScene()).toEqual(
      GAME002_SAMPLE_DEFAULT_SCENE,
    );
    expect(result.logic.getStep(0).getScene(0)).toEqual(
      GAME002_SAMPLE_SPIN_SCENE,
    );
    expect(result.logic.getRandomNumbers()).toEqual(
      GAME002_SAMPLE_RANDOM_NUMBERS,
    );
    expect(result.logic.getStep(0).getResults()).toEqual(
      GAME002_SAMPLE_WIN_RESULTS,
    );
  });

  it("keeps reels hidden until a live scene and renders BN as a real symbol", () => {
    const runtime = createRuntime();

    expect(runtime.mainReelsLayer.visible).toBe(false);
    expect(runtime.config.emptySymbols).toEqual([]);
    expect(runtime.config.texturedSymbols).toContain("BN");
    runtime.applyScene(GAME002_SAMPLE_DEFAULT_SCENE, "default");
    expect(runtime.mainReelsLayer.visible).toBe(true);
    expect(runtime.getFinalYs()).toEqual(GAME002_SAMPLE_DEFAULT_STOP_Y);
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME002_SAMPLE_DEFAULT_SCENE,
      "default",
    );
  });

  it("preserves the 54-cell order, offsets, dimming and stop timing", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    const plan = runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "spin");

    expect(plan.cells).toHaveLength(54);
    expect(plan.cells[0]).toMatchObject({
      x: 0,
      y: 0,
      orderIndex: 0,
      dimmingAlpha: 0.5,
      reelOffsetY: 0,
    });
    expect(plan.cells[8]).toMatchObject({
      x: 0,
      y: 8,
      orderIndex: 8,
      dimmingAlpha: 0.5,
      reelOffsetY: GAME002_GRID_CELL_REEL_OFFSETS[0][8],
    });
    expect(plan.cells[53]).toMatchObject({
      x: 5,
      y: 8,
      orderIndex: 53,
      dimmingAlpha: 0.35,
    });
    expect(plan.lastStopAtMs).toBe(1876);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).not.toContain(
      "disabled",
    );
    runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );

    let result = runtime.update(0.05);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }
    expect(result.completed).toBe(true);
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME002_SAMPLE_SPIN_SCENE,
      "completed spin",
    );
  });

  it("uses a temporary visible strip when server scene is absent from local reels", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    const scene = GAME002_SAMPLE_SPIN_SCENE.map((column) => [...column]);
    scene[0][0] = 12;

    expect(() =>
      runtime.spinToScene(scene, "server scene with BN"),
    ).not.toThrow();
    let result = runtime.update(0.05);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }
    expect(result.completed).toBe(true);
    expect(runtime.getVisualSnapshot().visibleScene[0][0]).toBe(12);
  });
});

function createRuntime(initialScene?: readonly (readonly number[])[]) {
  const skin = getGame002SkinConfig("1");
  return createGame002ReelRuntime({
    rawGameConfig,
    symbolAssets: createSymbolAssets(skin.displaySymbols),
    ...(initialScene === undefined ? {} : { initialScene }),
    config: {
      ...DEFAULT_GAME002_REEL_CONFIG,
      texturedSymbols: skin.displaySymbols,
      emptySymbols: [],
      symbolScales: skin.symbolScales,
      symbolRenderPriorities: skin.symbolRenderPriorities,
      animationResolver: createDefaultSymbolAnimationResolver(),
    },
  });
}

function createSymbolAssets(symbols: readonly string[]): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      symbols.map((symbol) => [symbol, createTextureSet(200, 200)]),
    ),
  );
}
