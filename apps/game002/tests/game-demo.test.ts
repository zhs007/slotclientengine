import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Assets, Texture, type Container as PixiContainer } from "pixi.js";

vi.mock(
  "../../../packages/rendercore/src/spine/runtime-player.js",
  async (importOriginal) => {
    const actual =
      await importOriginal<
        typeof import("../../../packages/rendercore/src/spine/runtime-player.js")
      >();
    const { Container } = await import("pixi.js");
    return {
      ...actual,
      createOfficialSpinePlayer: () => {
        const view = new Container();
        let loop = true;
        let onceCompleted = false;
        return {
          view,
          init: () => undefined,
          play: (options: { readonly loop: boolean }) => {
            loop = options.loop;
            onceCompleted = false;
          },
          update: () => {
            if (loop) return { completed: false, loopCompleted: true };
            if (onceCompleted) return { completed: false };
            onceCompleted = true;
            return { completed: true };
          },
          reset: () => undefined,
          destroy: () => view.destroy({ children: true }),
          attachSlotObject: (options: { readonly object: PixiContainer }) => {
            view.addChild(options.object);
          },
          removeSlotObject: (object: PixiContainer) => {
            view.removeChild(object);
          },
        };
      },
    };
  },
);

import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import {
  createGameConfig,
  createSlotGameLogicResult,
  compileSlotCascadeFacts,
} from "@slotclientengine/gameframeworks";
import {
  createDefaultSymbolAnimationResolver,
  createReelSymbolRegistry,
  ManualSymbolAni,
  RenderGridCellReelSet,
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
} from "../src/game002-reel-controller.js";
import { getTestGame002PackageConfig } from "./value-resource-fixture.js";

beforeEach(() => {
  vi.spyOn(Assets, "load").mockResolvedValue(Texture.WHITE as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("game002 Crave reel runtime", () => {
  it("keeps visual spin phase entropy separate from CN presentation random", () => {
    expect(DEFAULT_GAME002_REEL_CONFIG.spinPhaseRandom).not.toBe(
      DEFAULT_GAME002_REEL_CONFIG.random,
    );
  });

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

    expect(runtime.mainReelPresentation.visible).toBe(false);
    expect(runtime.config.emptySymbols).toEqual([]);
    expect(runtime.config.texturedSymbols).toContain("BN");
    runtime.applyScene(GAME002_SAMPLE_DEFAULT_SCENE, "default");
    expect(runtime.mainReelPresentation.visible).toBe(true);
    expect(runtime.getFinalYs()).toEqual(GAME002_SAMPLE_DEFAULT_STOP_Y);
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME002_SAMPLE_DEFAULT_SCENE,
      "default",
    );
  });

  it("assigns manifest default values to initial and temporary CN symbols", () => {
    const runtime = createRuntime();
    const candidates = new Set(
      getTestGame002PackageConfig().symbolValuePresentationResources.CN
        .defaultValues,
    );
    const cnCode = runtime.gameConfig.getSymbolCode("CN");
    expect(cnCode).toBe(8);

    runtime.applyScene(GAME002_SAMPLE_DEFAULT_SCENE, "default");
    assertCnPresentationValues(
      runtime.getVisualSnapshot(),
      cnCode!,
      candidates,
    );

    runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "spin");
    runtime.update(0.5);
    assertCnPresentationValues(
      runtime.getVisualSnapshot(),
      cnCode!,
      candidates,
    );
  });

  it("keeps server CN values on target endpoints through the final stop", async () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    const cnCode = runtime.gameConfig.getSymbolCode("CN");
    expect(cnCode).toBe(8);
    const targetValues = GAME002_SAMPLE_SPIN_SCENE.map((column) =>
      column.map((code) => (code === cnCode ? 250 : null)),
    );

    runtime.spinToScene(
      GAME002_SAMPLE_SPIN_SCENE,
      "spin with server CN values",
      targetValues,
    );
    let result = runtime.update(0.05);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      await Promise.resolve();
      result = runtime.update(0.05);
    }
    expect(result.completed).toBe(true);
    const snapshot = runtime.getVisualSnapshot();
    for (const [x, column] of snapshot.visibleScene.entries()) {
      for (const [y, code] of column.entries()) {
        expect(snapshot.presentationValues[x][y]).toBe(
          code === cnCode ? 250 : null,
        );
      }
    }
  });

  it("spins only selected FreeGame cells and preserves held WL/CN cells", async () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    const target = GAME002_SAMPLE_DEFAULT_SCENE.map((column) => [...column]);
    const positions = [
      { x: 0, y: 0 },
      { x: 2, y: 3 },
      { x: 5, y: 8 },
    ] as const;
    target[0]![0] = 3;
    target[2]![3] = 4;
    target[5]![8] = 6;
    const before = runtime.getVisualSnapshot();
    const values = before.presentationValues.map((column) => [...column]);
    for (const { x, y } of positions) values[x]![y] = null;
    const heldWl = { x: 0, y: 5 } as const;
    const heldCn = GAME002_SAMPLE_DEFAULT_SCENE.flatMap((column, x) =>
      column.flatMap((code, y) =>
        code === runtime.gameConfig.getSymbolCode("CN") ? [{ x, y }] : [],
      ),
    )[0]!;

    const plan = runtime.startSelectiveSpin({
      sourceScene: GAME002_SAMPLE_DEFAULT_SCENE,
      targetScene: target,
      targetValues: values,
      positions,
      sceneName: "FreeGame selective spin",
    });

    expect(plan.cells.map(({ x, y }) => ({ x, y }))).toEqual(positions);
    expect(runtime.getVisualSnapshot().visibleScene[heldWl.x]![heldWl.y]).toBe(
      GAME002_SAMPLE_DEFAULT_SCENE[heldWl.x]![heldWl.y],
    );
    expect(runtime.getVisualSnapshot().visibleScene[heldCn.x]![heldCn.y]).toBe(
      GAME002_SAMPLE_DEFAULT_SCENE[heldCn.x]![heldCn.y],
    );
    expect(
      runtime.getVisualSnapshot().presentationValues[heldCn.x]![heldCn.y],
    ).toBe(before.presentationValues[heldCn.x]![heldCn.y]);
    let result = runtime.update(0.05);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      await Promise.resolve();
      result = runtime.update(0.05);
    }
    expect(result.completed).toBe(true);
    expect(runtime.getVisualSnapshot().visibleScene).toEqual(target);
  });

  it("preserves the 54-cell order, offsets, dimming and stop timing", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    expect(runtime.config.spinBounceStrength).toBe(0);
    const plan = runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "spin");

    expect(plan.cells).toHaveLength(54);
    expect(plan.dimmingActivatedAtStart).toBe(false);
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
    expect(plan.cells[53]).toMatchObject({
      x: 5,
      y: 8,
      orderIndex: 53,
      dimmingAlpha: 0.5,
    });
    expect(plan.cells[9]).toMatchObject({
      x: 1,
      y: 0,
      dimmingAlpha: 0,
    });
    expect(plan.cells[10]).toMatchObject({
      x: 1,
      y: 1,
      dimmingAlpha: 0,
    });
    const cnCode = runtime.gameConfig.getSymbolCode("CN");
    expect(cnCode).toBeDefined();
    expect(
      plan.cells
        .filter((cell) => cell.targetVisibleSymbols[0] === cnCode)
        .every((cell) => cell.dimmingAlpha === 0),
    ).toBe(true);
    for (const cell of plan.cells) {
      const symbol = runtime.gameConfig.getPaytableEntry(
        cell.targetVisibleSymbols[0],
      )!.symbol;
      expect(cell.dimmingAlpha).toBe(
        symbol === "WL" || symbol === "CN" ? 0 : 0.5,
      );
    }
    for (let x = 0; x < 6; x += 1) {
      const columnPhases = plan.cells
        .filter((cell) => cell.x === x)
        .map((cell) =>
          runtime.gameConfig
            .getReels("reels-001")
            .normalizeY(x, cell.y + cell.reelOffsetY),
        );
      expect(new Set(columnPhases).size).toBe(9);
    }
    expect(plan.lastStopAtMs).toBe(1876);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).not.toContain(
      "disabled",
    );
    runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );
    const reelSet = runtime.mainReelPresentation as RenderGridCellReelSet;
    expect(
      reelSet
        .getSnapshot()
        .cells.filter((cell) => cell.phase === "spinning")
        .every((cell) => cell.reelY === 0),
    ).toBe(true);

    let result = runtime.update(0.05);
    let sawLandingAppear = runtime
      .getVisualSnapshot()
      .requestedStates.flat()
      .includes("appear");
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      result = runtime.update(0.05);
      sawLandingAppear ||= runtime
        .getVisualSnapshot()
        .requestedStates.flat()
        .includes("appear");
    }
    expect(sawLandingAppear).toBe(true);
    expect(result.completed).toBe(true);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).not.toContain(
      "appear",
    );
    assertGame002ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME002_SAMPLE_SPIN_SCENE,
      "completed spin",
    );
  });

  it("keeps CN bright before the anticipation gate and dims it after activation", () => {
    const dimmingCalls: Array<{
      readonly symbol: string;
      readonly activated: boolean;
    }> = [];
    const baseDimming = DEFAULT_GAME002_REEL_CONFIG.dimming;
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE, {
      dimming: {
        ...baseDimming,
        resolveSymbolDimmingAlpha: (symbol, activated) => {
          dimmingCalls.push({ symbol, activated });
          return baseDimming.resolveSymbolDimmingAlpha(symbol, activated);
        },
      },
    });
    const target = GAME002_SAMPLE_SPIN_SCENE.map((column) => [...column]);
    target[0][0] = 0;
    target[0][2] = 0;
    const plan = runtime.spinToScene(target, "dynamic CN dimming");
    const cnCode = runtime.gameConfig.getSymbolCode("CN");
    expect(cnCode).toBe(8);
    expect(
      plan.cells
        .filter((cell) => cell.targetVisibleSymbols[0] === cnCode)
        .every((cell) => cell.dimmingAlpha === 0),
    ).toBe(true);

    let result = runtime.update(0.02);
    for (let index = 0; index < 900 && !result.completed; index += 1) {
      result = runtime.update(0.02);
    }
    expect(result.completed).toBe(true);
    expect(dimmingCalls).toContainEqual({ symbol: "CN", activated: false });
    expect(dimmingCalls).toContainEqual({ symbol: "CN", activated: true });
  });

  it("reshuffles visual-only local reel phases for every spin plan", () => {
    let state = 1;
    let presentationRandomCalls = 0;
    let spinPhaseRandomCalls = 0;
    const runtime = createRuntime(undefined, {
      presentationRandom: () => {
        presentationRandomCalls += 1;
        return 0;
      },
      spinPhaseRandom: () => {
        spinPhaseRandomCalls += 1;
        state = (state * 48_271) % 2_147_483_647;
        return (state - 1) / 2_147_483_646;
      },
    });
    const presentationCallsBeforePlans = presentationRandomCalls;

    const first = runtime.createSpinPlan(GAME002_SAMPLE_SPIN_SCENE, "first");
    const second = runtime.createSpinPlan(GAME002_SAMPLE_SPIN_SCENE, "second");
    expect(first.cells.map((cell) => cell.reelOffsetY)).not.toEqual(
      second.cells.map((cell) => cell.reelOffsetY),
    );
    expect(first.cells.map((cell) => cell.targetVisibleSymbols)).toEqual(
      second.cells.map((cell) => cell.targetVisibleSymbols),
    );
    expect(
      first.cells.every((cell) => cell.axisPlan.direction === "forward"),
    ).toBe(true);
    expect(spinPhaseRandomCalls).toBe(108);
    expect(presentationRandomCalls).toBe(presentationCallsBeforePlans);
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

  it("activates on the second landed WL and splits dropdown, sweep and selective refill", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    const target = GAME002_SAMPLE_SPIN_SCENE.map((column) => [...column]);
    target[0][0] = 0;
    target[0][2] = 0;
    const plan = runtime.spinToScene(target, "two WL anticipation");
    expect(plan.activationGate).toEqual({ x: 0, y: 2 });
    expect(plan.cells.slice(0, 3).every((cell) => cell.effect === null)).toBe(
      true,
    );
    expect(plan.cells[3].effect).toMatchObject({
      effectId: "anticipation",
      loopCount: 1,
    });
    expect(
      plan.cells[3].effect!.startAtMs - plan.cells[2].stopAtMs,
    ).toBeCloseTo(133.3333, 4);
    expect(
      plan.cells[3].stopAtMs - plan.cells[3].effect!.startAtMs,
    ).toBeCloseTo(666.6667, 4);
    expect(plan.cells[3].effect!.startAtMs > plan.cells[2].stopAtMs).toBe(true);
    expect(plan.cells[3].stopAtMs - plan.cells[2].stopAtMs).toBeCloseTo(800, 4);
    expect(plan.cells[3].effect?.loopCount).toBe(1);
    expect(
      plan.cells[4].effect!.startAtMs - plan.cells[3].effect!.startAtMs,
    ).toBe(100);
    expect(plan.cells[4].stopAtMs - plan.cells[3].stopAtMs).toBe(100);

    let activationEdges = 0;
    let result = runtime.update(0.05);
    for (let index = 0; index < 420 && !result.completed; index += 1) {
      activationEdges += result.activationCells.length;
      result = runtime.update(0.05);
    }
    activationEdges += result.activationCells.length;
    expect(result.completed).toBe(true);
    expect(activationEdges).toBe(1);
    expect(runtime.getAnticipationSnapshot()).toEqual({
      active: true,
      landedTriggerCount: 2,
      activationCoordinate: { x: 0, y: 2 },
    });

    const holes = [
      { x: 4, y: 1 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
    ];
    runtime.releaseVisibleSymbols(holes);
    const removedScene = runtime.getCurrentScene()!;
    const removedValues = runtime.getCascadeValues();
    const refillScene = removedScene.map((column) => [...column]);
    refillScene[4][1] = 1;
    refillScene[4][0] = 1;
    refillScene[5][0] = 1;
    const refillValues = removedValues.map((column) =>
      column.map((value) => (value === -1 ? null : value)),
    );
    const cascadeFacts = compileSlotCascadeFacts({
      sourceScene: removedScene,
      sourceValues: removedValues,
      dropdownScene: removedScene,
      dropdownValues: removedValues,
      targetScene: refillScene,
      targetValues: refillValues,
      refillPositions: holes,
      canDropOccurrence: () => true,
    });
    const dropdown = runtime.createCascadeDropdownPlan({
      columns: cascadeFacts.columns,
      rows: cascadeFacts.rows,
      movements: cascadeFacts.dropdownMovements,
      valueCommits: cascadeFacts.dropdownValueCommits,
      motion: {
        columnStartStaggerSeconds: 0.03,
        startStaggerSeconds: 0.01,
        baseFallSeconds: 0.05,
        perRowFallSeconds: 0.01,
        maxFallSeconds: 0.2,
        overshootCellRatio: 0.1,
        settleSeconds: 0.02,
      },
    });
    expect(dropdown.movements).toEqual([]);
    runtime.startCascadeDrop(dropdown, removedScene);
    expect(runtime.getCurrentScene()).toEqual(removedScene);

    runtime.startRefillEffectSweep(holes);
    result = runtime.update(0.05);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }
    expect(result.completed).toBe(true);

    const refillPlan = runtime.startSelectiveRefillSpin({
      dropdownScene: removedScene,
      dropdownValues: removedValues,
      targetScene: refillScene,
      targetValues: refillValues,
      refillPositions: holes,
    });
    expect(refillPlan.cells.map(({ x, y }) => ({ x, y }))).toEqual([
      { x: 4, y: 1 },
      { x: 4, y: 0 },
      { x: 5, y: 0 },
    ]);
    expect(refillPlan.cells.map((cell) => cell.startGroupIndex)).toEqual([
      0, 1, 1,
    ]);
    expect(refillPlan.cells.map((cell) => cell.startAtMs)).toEqual([0, 16, 16]);
    expect(refillPlan.dimmingActivatedAtStart).toBe(true);
    expect(
      refillPlan.cells.every(
        (cell) => cell.effect?.effectId === "anticipation",
      ),
    ).toBe(true);
    expect(refillPlan.cells.every((cell) => cell.effect?.loopCount === 1)).toBe(
      true,
    );
    expect(
      refillPlan.cells.every(
        (cell) =>
          Math.abs(cell.stopAtMs - cell.effect!.startAtMs - 666.6667) < 0.0001,
      ),
    ).toBe(true);
    expect(
      refillPlan.cells[1]!.stopAtMs - refillPlan.cells[0]!.stopAtMs,
    ).toBeCloseTo(100, 8);
    expect(
      refillPlan.cells[2]!.stopAtMs - refillPlan.cells[1]!.stopAtMs,
    ).toBeCloseTo(100, 8);
    expect(
      refillPlan.cells[1]!.effect!.startAtMs -
        refillPlan.cells[0]!.effect!.startAtMs,
    ).toBeCloseTo(100, 8);
    expect(
      refillPlan.cells[2]!.effect!.startAtMs -
        refillPlan.cells[1]!.effect!.startAtMs,
    ).toBeCloseTo(100, 8);
    result = runtime.update(0.05);
    for (let index = 0; index < 80 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }
    expect(result.completed).toBe(true);
    expect(runtime.getCurrentScene()).toEqual(refillScene);
    expect(runtime.isAnticipationActive()).toBe(true);

    runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "next legal spin");
    expect(runtime.isAnticipationActive()).toBe(false);
  });

  it("activates after a unified refill lands the second exact WL", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    const initialTarget = GAME002_SAMPLE_SPIN_SCENE.map((column) =>
      column.map(() => 1),
    );
    initialTarget[0][0] = 0;
    runtime.spinToScene(initialTarget, "one WL before cascade refill");
    let result = runtime.update(0.05);
    for (let index = 0; index < 220 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }
    expect(result.completed).toBe(true);
    expect(runtime.getAnticipationSnapshot()).toEqual({
      active: false,
      landedTriggerCount: 1,
      activationCoordinate: null,
    });

    const refillPositions = [{ x: 1, y: 0 }];
    runtime.releaseVisibleSymbols(refillPositions);
    const removedScene = runtime.getCurrentScene()!;
    const removedValues = runtime.getCascadeValues();
    const refillScene = removedScene.map((column) => [...column]);
    refillScene[1][0] = 0;
    const refillValues = removedValues.map((column) =>
      column.map((value) => (value === -1 ? null : value)),
    );
    const cascadeFacts = compileSlotCascadeFacts({
      sourceScene: removedScene,
      sourceValues: removedValues,
      dropdownScene: removedScene,
      dropdownValues: removedValues,
      targetScene: refillScene,
      targetValues: refillValues,
      refillPositions,
      canDropOccurrence: () => true,
    });
    const unified = runtime.createCascadeDropPlan({
      columns: cascadeFacts.columns,
      rows: cascadeFacts.rows,
      movements: [
        ...cascadeFacts.dropdownMovements,
        ...cascadeFacts.refillMovements,
      ],
      valueCommits: cascadeFacts.targetValueCommits,
      motion: {
        columnStartStaggerSeconds: 0.03,
        startStaggerSeconds: 0.01,
        baseFallSeconds: 0.05,
        perRowFallSeconds: 0.01,
        maxFallSeconds: 0.2,
        overshootCellRatio: 0.1,
        settleSeconds: 0.02,
      },
    });
    expect(unified.movements).toEqual([
      expect.objectContaining({
        kind: "refill",
        x: 1,
        targetY: 0,
        outputCode: 0,
      }),
    ]);
    runtime.startCascadeDrop(unified, refillScene, removedScene);
    expect(runtime.isAnticipationActive()).toBe(false);
    result = runtime.update(0.05);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(runtime.getCurrentScene()).toEqual(refillScene);
    expect(runtime.getAnticipationSnapshot()).toEqual({
      active: true,
      landedTriggerCount: 2,
      activationCoordinate: { x: 1, y: 0 },
    });
    runtime.destroy();
    expect(runtime.getAnticipationSnapshot()).toEqual({
      active: false,
      landedTriggerCount: 0,
      activationCoordinate: null,
    });
  });

  it("exposes stopped grid symbols through the generic presentation target", () => {
    const runtime = createRuntime(GAME002_SAMPLE_SPIN_SCENE);
    const positions = Object.freeze([
      Object.freeze({ x: 1, y: 3 }),
      Object.freeze({ x: 2, y: 2 }),
    ]);
    const before = runtime.getVisualSnapshot().visibleScene;

    runtime.requestVisibleSymbolStates(positions, "win");
    expect(runtime.getVisibleSymbolStateSnapshots(positions)).toMatchObject([
      { x: 1, y: 3, requestedState: "win" },
      { x: 2, y: 2, requestedState: "win" },
    ]);
    expect(runtime.getVisibleSymbolGeometrySnapshots(positions)).toMatchObject([
      {
        x: 1,
        y: 3,
        centerX: 180,
        centerY: 420,
        cellWidth: 120,
        cellHeight: 120,
      },
      {
        x: 2,
        y: 2,
        centerX: 300,
        centerY: 300,
        cellWidth: 120,
        cellHeight: 120,
      },
    ]);

    for (let index = 0; index < 40; index += 1) runtime.update(0.05);
    expect(runtime.getVisibleSymbolStateSnapshots(positions)).toMatchObject([
      { x: 1, y: 3, requestedState: "normal", resolvedState: "normal" },
      { x: 2, y: 2, requestedState: "normal", resolvedState: "normal" },
    ]);
    expect(runtime.getVisualSnapshot().visibleScene).toEqual(before);
  });
});

function createRuntime(
  initialScene?: readonly (readonly number[])[],
  options: {
    readonly presentationRandom?: () => number;
    readonly spinPhaseRandom?: () => number;
    readonly dimming?: (typeof DEFAULT_GAME002_REEL_CONFIG)["dimming"];
  } = {},
) {
  const skin = getTestGame002PackageConfig();
  const normalResolver = createDefaultSymbolAnimationResolver();
  const gameConfig = createGameConfig(rawGameConfig);
  const config = {
    ...DEFAULT_GAME002_REEL_CONFIG,
    random: options.presentationRandom ?? DEFAULT_GAME002_REEL_CONFIG.random,
    spinPhaseRandom:
      options.spinPhaseRandom ?? DEFAULT_GAME002_REEL_CONFIG.spinPhaseRandom,
    dimming: options.dimming ?? DEFAULT_GAME002_REEL_CONFIG.dimming,
    texturedSymbols: skin.displaySymbols,
    emptySymbols: [],
    symbolScales: skin.symbolScales,
    symbolRenderPriorities: skin.symbolRenderPriorities,
    symbolAnimationCapabilities: skin.symbolAnimationCapabilities,
    symbolStatePreset: skin.symbolStatePreset,
    landingAppearSymbols: skin.landingAppearSymbols,
    symbolValuePresentationResources: skin.symbolValuePresentationResources,
    reelEffectResources: skin.reelEffectResources,
    reelEffectPoolCapacities: skin.reelEffectPoolCapacities,
    animationResolver: (context: Parameters<typeof normalResolver>[0]) =>
      context.resolvedState === "appear"
        ? new ManualSymbolAni({
            stateId: "appear",
            playback: "once",
            durationSeconds: 0.1,
          })
        : context.resolvedState === "dropdown"
          ? new ManualSymbolAni({
              stateId: "dropdown",
              playback: "loop",
            })
          : context.resolvedState === "win"
            ? new ManualSymbolAni({
                stateId: "win",
                playback: "once",
                durationSeconds: 0.1,
              })
            : normalResolver(context),
  };
  const symbolRegistry = createReelSymbolRegistry({
    gameConfig,
    assets: createSymbolAssets(skin.displaySymbols),
    emptySymbols: config.emptySymbols,
    symbolScales: config.symbolScales,
    symbolRenderPriorities: config.symbolRenderPriorities,
    symbolAnimationCapabilities: config.symbolAnimationCapabilities,
    statePreset: config.symbolStatePreset,
    landingAppearSymbols: config.landingAppearSymbols,
    animationResolver: config.animationResolver,
    texturePolicy: { requiredStateTextures: ["spinBlur", "disabled"] },
    valuePresentationResources: config.symbolValuePresentationResources,
  });
  return createGame002ReelRuntime({
    gameConfig,
    symbolRegistry,
    ...(initialScene === undefined ? {} : { initialScene }),
    config,
  });
}

function createSymbolAssets(symbols: readonly string[]): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      symbols.map((symbol) => [symbol, createTextureSet(200, 200)]),
    ),
  );
}

function assertCnPresentationValues(
  snapshot: ReturnType<ReturnType<typeof createRuntime>["getVisualSnapshot"]>,
  cnCode: number,
  candidates: ReadonlySet<number>,
): void {
  let count = 0;
  for (const [x, column] of snapshot.visibleScene.entries()) {
    for (const [y, code] of column.entries()) {
      if (code !== cnCode) continue;
      count += 1;
      expect(candidates.has(snapshot.presentationValues[x][y]!)).toBe(true);
    }
  }
  expect(count).toBeGreaterThan(0);
}
