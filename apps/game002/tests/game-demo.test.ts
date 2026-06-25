import { describe, expect, it } from "vitest";
import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import {
  createSlotGameLogicResult,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import { createTextureSet } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  GAME002_SAMPLE_DEFAULT_SCENE,
  GAME002_SAMPLE_DEFAULT_STOP_Y,
  GAME002_SAMPLE_RANDOM_NUMBERS,
  GAME002_SAMPLE_SPIN_RESULT,
  GAME002_SAMPLE_SPIN_SCENE,
  GAME002_SAMPLE_WIN_RESULTS,
} from "./fixtures/game002-gmi.js";
import { GAME002_DISPLAY_SYMBOLS } from "../src/assets.js";
import {
  DEFAULT_GAME002_REEL_CONFIG,
  assertGame002ReelVisualMatchesTarget,
  createGame002ReelRuntime,
} from "../src/game-demo.js";
import { GAME002_CELL_SIZE } from "../src/game-layout.js";

const FAST_REEL_CONFIG = Object.freeze({
  ...DEFAULT_GAME002_REEL_CONFIG,
  minimumSpinCycles: 1,
  baseDurationMs: 80,
  speedSymbolsPerSecond: 500,
  startDelayMs: 0,
  stopDelayMs: 0,
});

describe("game002 reel runtime", () => {
  it("locks gamecfg002 reels, symbol codes and task sample stop y values", () => {
    const runtime = createRuntime();
    const gameConfig = runtime.gameConfig;

    expect(gameConfig.getReelNames()).toContain("reels-001");
    expect(gameConfig.getReels("reels-001").getReelCount()).toBe(6);
    expect(gameConfig.getSymbolCode("WL")).toBe(0);
    expect(gameConfig.getSymbolCode("BN")).toBe(12);
    expect(
      gameConfig.getStopYCoordinates({
        reelsName: "reels-001",
        sceneName: "sample default",
        scene: GAME002_SAMPLE_DEFAULT_SCENE,
      }),
    ).toEqual(GAME002_SAMPLE_DEFAULT_STOP_Y);
    expect(
      gameConfig.getStopYCoordinates({
        reelsName: "reels-001",
        sceneName: "sample spin",
        scene: GAME002_SAMPLE_SPIN_SCENE,
      }),
    ).toEqual(GAME002_SAMPLE_RANDOM_NUMBERS);
  });

  it("parses the full sample raw spin result through gameframeworks GameLogic", () => {
    const result = createSlotGameLogicResult(GAME002_SAMPLE_SPIN_RESULT, {
      bet: { bet: 5, lines: 30, times: 1 },
      userInfo: { gameid: 0 },
    });

    expect(result.results).toBe(1);
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
    expect(result.logic.getTotalWin()).toBe(1575);
    expect(result.logic.getStep(0).getResults()).toEqual(
      GAME002_SAMPLE_WIN_RESULTS,
    );
  });

  it("keeps reels hidden until a live scene is applied", () => {
    const runtime = createRuntime();

    expect(runtime.mainReelsLayer.visible).toBe(false);
    expect(runtime.getVisualSnapshot()).toMatchObject({
      visible: false,
      spinning: false,
      reelCount: 6,
      layerX: 200,
      layerY: 330,
    });

    const finalYs = runtime.applyScene(
      GAME002_SAMPLE_DEFAULT_SCENE,
      "test.default",
    );

    expect(finalYs).toEqual(GAME002_SAMPLE_DEFAULT_STOP_Y);
    expect(runtime.getFinalYs()).toEqual(finalYs);
    expect(runtime.getTargetScene()).toBeNull();
    expect(runtime.mainReelsLayer.visible).toBe(true);
    expect(runtime.layout.cellWidth).toBe(GAME002_CELL_SIZE);
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME002_SAMPLE_DEFAULT_SCENE,
      "applied game002 scene",
    );
  });

  it("spins all 6 reels to the target scene and checks the final visible scene", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);

    const dryRunPlan = runtime.createSpinPlan(
      GAME002_SAMPLE_SPIN_SCENE,
      "test.spin.plan",
    );
    const plan = runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "test.spin");
    expect(plan.axes).toHaveLength(6);
    expect(dryRunPlan.axes.map((axis) => axis.finalY)).toEqual(
      plan.axes.map((axis) => axis.finalY),
    );
    expect(plan.axes.map((axis) => axis.finalY)).toEqual(
      GAME002_SAMPLE_RANDOM_NUMBERS,
    );
    expect(runtime.getTargetScene()).toEqual(GAME002_SAMPLE_SPIN_SCENE);
    expect(runtime.isSpinning()).toBe(true);
    expect(() => runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE)).toThrow(
      /already spinning/,
    );

    let result = runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(runtime.isSpinning()).toBe(false);
    expect(runtime.getCurrentScene()).toEqual(GAME002_SAMPLE_SPIN_SCENE);
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME002_SAMPLE_SPIN_SCENE,
      "completed game002 scene",
    );
  });

  it("rejects invalid scenes and impossible stop y without local fallback", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);

    expect(() => runtime.spinToScene([[1, 2, 3]] as any)).toThrow(/width/);
    expect(runtime.isSpinning()).toBe(false);

    const impossibleScene = cloneScene(GAME002_SAMPLE_SPIN_SCENE);
    impossibleScene[0][0] = 999;
    expect(() =>
      runtime.spinToScene(impossibleScene, "impossible game002 scene"),
    ).toThrow(/No stop y candidate/);
    expect(runtime.isSpinning()).toBe(false);
  });

  it("rejects wrong reel counts and failed final visual assertions", () => {
    expect(() =>
      createGame002ReelRuntime({
        rawGameConfig: {
          ...rawGameConfig,
          reels: { "reels-001": rawGameConfig.reels["reels-001"].slice(0, 5) },
        },
        symbolAssets: createGame002Textures(),
        config: FAST_REEL_CONFIG,
      }),
    ).toThrow(/must contain 6 reels/);

    expect(() =>
      assertGame002ReelVisualMatchesTarget(
        {
          visible: false,
          spinning: false,
          visibleScene: GAME002_SAMPLE_DEFAULT_SCENE,
          requestedStates: [],
          reelCount: 6,
          layerX: 200,
          layerY: 330,
        },
        GAME002_SAMPLE_DEFAULT_SCENE,
        "hidden snapshot",
      ),
    ).toThrow(/visible/);

    expect(() =>
      assertGame002ReelVisualMatchesTarget(
        {
          visible: true,
          spinning: false,
          visibleScene: GAME002_SAMPLE_DEFAULT_SCENE,
          requestedStates: [],
          reelCount: 6,
          layerX: 200,
          layerY: 330,
        },
        GAME002_SAMPLE_SPIN_SCENE,
        "wrong snapshot",
      ),
    ).toThrow(/does not match/);
  });
});

function createRuntime(initialScene?: SceneMatrix) {
  return createGame002ReelRuntime({
    rawGameConfig,
    symbolAssets: createGame002Textures(),
    config: FAST_REEL_CONFIG,
    initialScene,
  });
}

function createGame002Textures(): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      GAME002_DISPLAY_SYMBOLS.map((symbol) => [
        symbol,
        createTextureSet(500, 500),
      ]),
    ),
  );
}

function cloneScene(scene: SceneMatrix): number[][] {
  return scene.map((column) => [...column]);
}
