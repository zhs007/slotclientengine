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
      gridCellCount: 54,
      layerX: 637.5,
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

  it("shows the grid-cell reels during the first live spin without a default scene", () => {
    const runtime = createRuntime();

    runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "first live spin");
    expect(runtime.mainReelsLayer.visible).toBe(true);
    expect(runtime.getCurrentScene()).toBeNull();
    expect(runtime.getTargetScene()).toEqual(GAME002_SAMPLE_SPIN_SCENE);

    runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );
  });

  it("spins all 54 grid cell reels to the target scene and checks completion", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);

    const dryRunPlan = runtime.createSpinPlan(
      GAME002_SAMPLE_SPIN_SCENE,
      "test.spin.plan",
    );
    const plan = runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "test.spin");
    expect(plan.cells).toHaveLength(54);
    expect(dryRunPlan.cells.map((cell) => cell.axisPlan.finalY)).toEqual(
      plan.cells.map((cell) => cell.axisPlan.finalY),
    );
    expect(plan.cells[0]).toMatchObject({
      x: 0,
      y: 0,
      orderIndex: 0,
      dimmingAlpha: 0.5,
    });
    expect(plan.cells[8]).toMatchObject({
      x: 0,
      y: 8,
      orderIndex: 8,
      dimmingAlpha: 0.5,
    });
    expect(plan.cells[9]).toMatchObject({
      x: 1,
      y: 0,
      orderIndex: 9,
      dimmingAlpha: 0.35,
    });
    expect(plan.cells[53]).toMatchObject({
      x: 5,
      y: 8,
      orderIndex: 53,
      dimmingAlpha: 0.35,
    });
    const reels = runtime.gameConfig.getReels(
      DEFAULT_GAME002_REEL_CONFIG.reelsName,
    );
    expect(plan.cells[0].axisPlan.finalY).toBe(
      reels.normalizeY(0, GAME002_SAMPLE_RANDOM_NUMBERS[0]),
    );
    expect(plan.cells[8].axisPlan.finalY).toBe(
      reels.normalizeY(0, GAME002_SAMPLE_RANDOM_NUMBERS[0] + 8),
    );
    expect(plan.cells[53].axisPlan.finalY).toBe(
      reels.normalizeY(5, GAME002_SAMPLE_RANDOM_NUMBERS[5] + 8),
    );
    expect(plan.lastStopAtMs).toBe(1876);
    expect(runtime.getTargetScene()).toEqual(GAME002_SAMPLE_SPIN_SCENE);
    expect(runtime.isSpinning()).toBe(true);
    expect(() => runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE)).toThrow(
      /already spinning/,
    );

    let result = runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );
    let elapsedSeconds = 0.01;
    for (let index = 0; index < 60 && !result.completed; index += 1) {
      result = runtime.update(0.05);
      elapsedSeconds += 0.05;
    }

    expect(result.completed).toBe(true);
    expect(elapsedSeconds).toBeLessThanOrEqual(2.6);
    expect(runtime.isSpinning()).toBe(false);
    expect(runtime.getCurrentScene()).toEqual(GAME002_SAMPLE_SPIN_SCENE);
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME002_SAMPLE_SPIN_SCENE,
      "completed game002 scene",
    );
  });

  it("fuses server target windows into the local reel strip when stop y is absent", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    const localReelOnlyScene = cloneScene(GAME002_SAMPLE_SPIN_SCENE);
    localReelOnlyScene[0] = [1, 2, 3, 4, 5, 6, 7, 8, 0];

    expect(() => runtime.spinToScene([[1, 2, 3]] as any)).toThrow(/width/);
    expect(runtime.isSpinning()).toBe(false);

    const reels = runtime.gameConfig.getReels(
      DEFAULT_GAME002_REEL_CONFIG.reelsName,
    );
    expect(reels.findStopYCandidates(0, localReelOnlyScene[0])).toEqual([]);

    const plan = runtime.spinToScene(
      localReelOnlyScene,
      "server target not in local strip",
    );
    expect(plan.cells[0].axisPlan.finalY).toBe(
      reels.normalizeY(0, GAME002_SAMPLE_DEFAULT_STOP_Y[0]),
    );
    expect(runtime.getFinalYs()?.[0]).toBe(GAME002_SAMPLE_DEFAULT_STOP_Y[0]);
    expect(runtime.getTargetScene()).toEqual(localReelOnlyScene);

    let result = runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );
    for (let index = 0; index < 60 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(runtime.getCurrentScene()).toEqual(localReelOnlyScene);
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      localReelOnlyScene,
      "completed local strip fused scene",
    );
  });

  it("rejects invalid scenes and unknown symbol codes without local fallback", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);

    expect(() => runtime.spinToScene([[1, 2, 3]] as any)).toThrow(/width/);
    expect(runtime.isSpinning()).toBe(false);

    const impossibleScene = cloneScene(GAME002_SAMPLE_SPIN_SCENE);
    impossibleScene[0][0] = 999;
    expect(() =>
      runtime.spinToScene(impossibleScene, "impossible game002 scene"),
    ).toThrow(/does not exist in game002 paytable/);
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
          gridCellCount: 54,
          layerX: 637.5,
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
          gridCellCount: 54,
          layerX: 637.5,
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
    initialScene,
  });
}

function createGame002Textures(): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      GAME002_DISPLAY_SYMBOLS.map((symbol) => [
        symbol,
        createTextureSet(200, 200),
      ]),
    ),
  );
}

function cloneScene(scene: SceneMatrix): number[][] {
  return scene.map((column) => [...column]);
}
