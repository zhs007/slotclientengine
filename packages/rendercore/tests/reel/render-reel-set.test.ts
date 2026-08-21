import { createGameConfig, createGameLogic } from "@slotclientengine/logiccore";
import { describe, expect, it, vi } from "vitest";
import game2Config from "../../../../assets/gamecfg/game2.json";
import basicMessage from "../../../logiccore/tests/fixtures/gamemoduleinfo-basic.json";
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
} from "../../src/reel/index.js";
import type {
  AwaitableVisibleSymbolPresentationTarget,
  VisibleSymbolPresentationTarget,
} from "../../src/reel/index.js";
import {
  createTestSymbolAnimationResolver,
  createTextureSet,
} from "./helpers.js";
import {
  createBasicLayout,
  createBasicRegistry,
  createBasicReels,
} from "./helpers.js";

describe("RenderReelSet", () => {
  it("reuses the no-event update result while idle", () => {
    const reelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });

    const first = reelSet.update(0);
    const second = reelSet.update(0);

    expect(second).toBe(first);
    expect(second).toEqual({
      completed: false,
      spinning: false,
      startedAxes: [],
      stoppedAxes: [],
    });
  });

  it("consumes one low-FPS delta with the same landing outcome as small updates", () => {
    const createSpinningSet = () => {
      const reels = createBasicReels();
      const reelSet = new RenderReelSet({
        reels,
        layout: createBasicLayout(),
        registry: createBasicRegistry(),
      });
      reelSet.resetToVisibleScene(
        [
          [1, 2, 1],
          [2, 1, 2],
        ],
        [0, 0],
      );
      reelSet.spin(
        createReelSpinPlan({
          reels,
          finalYs: [2, 3],
          visibleRows: 3,
          minimumSpinCycles: 1,
          baseDurationMs: 100,
          speedSymbolsPerSecond: 100,
          startDelayMs: 30,
          stopDelayMs: 20,
        }),
      );
      return reelSet;
    };
    const lowFps = createSpinningSet();
    const stepped = createSpinningSet();

    const lowFpsResult = lowFps.update(0.5);
    const steppedStoppedAxes: number[] = [];
    let steppedResult = stepped.update(0);
    let steppedCompleted = false;
    for (let index = 0; index < 30; index += 1) {
      steppedResult = stepped.update(0.5 / 30);
      steppedCompleted ||= steppedResult.completed;
      steppedStoppedAxes.push(...steppedResult.stoppedAxes);
    }

    expect(lowFpsResult).toMatchObject({
      completed: true,
      spinning: false,
      stoppedAxes: [0, 1],
    });
    expect(steppedCompleted).toBe(true);
    expect(steppedResult.spinning).toBe(false);
    expect(steppedStoppedAxes).toEqual([0, 1]);
    expect(lowFps.getVisibleScene()).toEqual(stepped.getVisibleScene());
    expect(lowFps.getSnapshot().reels.map((reel) => reel.currentY)).toEqual(
      stepped.getSnapshot().reels.map((reel) => reel.currentY),
    );
  });

  it("starts, settles, and cancels continuous spins across standard reels", () => {
    const reels = createBasicReels();
    const reelSet = new RenderReelSet({
      reels,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    const initialScene = [
      [1, 2, 1],
      [2, 1, 2],
    ] as const;
    const targetScene = [
      [2, 1, 2],
      [1, 2, 1],
    ] as const;
    reelSet.resetToVisibleScene(initialScene, [0, 0]);

    reelSet.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    expect(reelSet.isContinuousSpinning()).toBe(true);
    expect(() =>
      reelSet.startContinuous({
        direction: "forward",
        speedSymbolsPerSecond: 20,
      }),
    ).toThrow(/another spin is active/);
    reelSet.update(0.05);
    expect(reelSet.getSnapshot().spinning).toBe(true);

    reelSet.settleContinuous(
      createReelSpinPlan({
        reels,
        finalYs: [1, 1],
        visibleRows: 3,
        minimumSpinCycles: 1,
        baseDurationMs: 100,
        speedSymbolsPerSecond: 100,
        startDelayMs: 0,
        stopDelayMs: 0,
        direction: "forward",
      }),
      {
        targetVisibleScene: targetScene,
        targetVisiblePresentationValues: [
          [null, null, null],
          [null, null, null],
        ],
        targetVisibleStates: [
          ["normal", "normal", "normal"],
          ["normal", "normal", "normal"],
        ],
      },
    );
    expect(reelSet.isContinuousSpinning()).toBe(false);
    for (
      let index = 0;
      index < 20 && reelSet.getSnapshot().spinning;
      index += 1
    )
      reelSet.update(0.05);
    expect(reelSet.getVisibleScene()).toEqual(targetScene);
    expect(() =>
      reelSet.settleContinuous(
        createReelSpinPlan({
          reels,
          finalYs: [1, 1],
          visibleRows: 3,
          minimumSpinCycles: 1,
          baseDurationMs: 100,
          speedSymbolsPerSecond: 100,
          startDelayMs: 0,
          stopDelayMs: 0,
        }),
      ),
    ).toThrow(/without an active continuous spin/);

    reelSet.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    reelSet.cancelContinuous();
    expect(reelSet.getSnapshot().spinning).toBe(false);
    expect(
      reelSet.reels.every((reel) => reel.getSnapshot().phase === "stopped"),
    ).toBe(true);

    reelSet.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    reelSet.settleContinuous(
      createReelSpinPlan({
        reels,
        finalYs: [1, 1],
        visibleRows: 3,
        minimumSpinCycles: 1,
        baseDurationMs: 100,
        speedSymbolsPerSecond: 100,
        startDelayMs: 0,
        stopDelayMs: 0,
      }),
    );
    reelSet.cancelContinuous();
    expect(reelSet.getSnapshot().spinning).toBe(false);
  });

  it("preflights standard continuous spins and rolls back partial starts", () => {
    const reels = createBasicReels();
    const reelSet = new RenderReelSet({
      reels,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs: [1, 1],
      visibleRows: 3,
      minimumSpinCycles: 1,
      baseDurationMs: 100,
      speedSymbolsPerSecond: 100,
      startDelayMs: 0,
      stopDelayMs: 0,
    });

    expect(() => reelSet.settleContinuous(plan)).toThrow(
      /without an active continuous spin/,
    );
    reelSet.cancelContinuous();

    reelSet.spin(plan);
    expect(() =>
      reelSet.startContinuous({
        direction: "forward",
        speedSymbolsPerSecond: 20,
      }),
    ).toThrow(/another spin is active/);
    for (
      let index = 0;
      index < 20 && reelSet.getSnapshot().spinning;
      index += 1
    )
      reelSet.update(0.05);

    const startFailure = vi
      .spyOn(reelSet.reels[1]!, "startContinuous")
      .mockImplementationOnce(() => {
        throw new Error("start failed");
      });
    expect(() =>
      reelSet.startContinuous({
        direction: "forward",
        speedSymbolsPerSecond: 20,
      }),
    ).toThrow(/start failed/);
    expect(reelSet.reels[0]!.getSnapshot().phase).toBe("stopped");
    startFailure.mockRestore();

    reelSet.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    expect(() =>
      reelSet.settleContinuous({ ...plan, axes: plan.axes.slice(0, 1) }),
    ).toThrow(/axes length/);
    reelSet.cancelContinuous();

    reelSet.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    expect(() =>
      reelSet.settleContinuous({
        ...plan,
        axes: [plan.axes[0]!, { ...plan.axes[1]!, x: 0 }],
      }),
    ).toThrow(/missing axis 1/);
    reelSet.cancelContinuous();

    reelSet.startContinuous({
      direction: "forward",
      speedSymbolsPerSecond: 20,
    });
    reelSet.reels[1]!.cancelContinuous();
    expect(() => reelSet.settleContinuous(plan)).toThrow(
      /settle reel 1 without an active continuous spin/,
    );
    reelSet.cancelContinuous();
  });

  it("preflights and awaits a multi-state batch on standard reels", async () => {
    const reelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    reelSet.resetToVisibleScene(
      [
        [1, 2, 1],
        [2, 1, 2],
      ],
      [0, 0],
    );
    const target: AwaitableVisibleSymbolPresentationTarget = reelSet;
    const requests = [
      {
        positions: [
          { x: 0, y: 0 },
          { x: 0, y: 0 },
        ],
        state: "appear",
        options: {
          transitionMode: "immediate",
          completion: "once-complete",
        },
      },
      {
        positions: [{ x: 1, y: 0 }],
        state: "win",
        options: {
          transitionMode: "immediate",
          completion: "once-complete",
        },
      },
    ] as const;

    let completed = false;
    const playback = target.playVisibleSymbolStateBatch(requests).then(() => {
      completed = true;
    });
    reelSet.update(0.43);
    await Promise.resolve();
    expect(completed).toBe(false);
    reelSet.update(0.16);
    await playback;
    expect(completed).toBe(true);

    expect(() => target.playVisibleSymbolStateBatch([])).toThrow(
      /batch must not be empty/,
    );
    expect(() =>
      target.playVisibleSymbolStateBatch([
        {
          positions: [],
          state: "win",
          options: { completion: "once-complete" },
        },
      ]),
    ).toThrow(/positions must not be empty/);
    expect(() =>
      target.playVisibleSymbolStateBatch([
        requests[0],
        {
          positions: [{ x: 1, y: 0 }],
          state: "win",
          options: {
            transitionMode: "immediate",
            completion: "next-loop-complete",
          },
        },
      ]),
    ).toThrow(/expected "loop"/);
    expect(
      target.getVisibleSymbolStateSnapshots([{ x: 0, y: 0 }])[0]
        ?.requestedState,
    ).toBe("normal");

    vi.spyOn(
      reelSet.reels[1]!,
      "playVisibleSymbolState",
    ).mockImplementationOnce(() => {
      throw new Error("second standard reel playback did not start");
    });
    await expect(target.playVisibleSymbolStateBatch(requests)).rejects.toThrow(
      "second standard reel playback did not start",
    );
  });

  it("starts each target landing state at that axis boundary", () => {
    const reels = createBasicReels();
    const reelSet = new RenderReelSet({
      reels,
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    reelSet.resetToVisibleScene(
      [
        [1, 2, 1],
        [2, 1, 2],
      ],
      [0, 0],
    );
    reelSet.spin(
      createReelSpinPlan({
        reels,
        finalYs: [1, 1],
        visibleRows: 3,
        minimumSpinCycles: 1,
        baseDurationMs: 100,
        speedSymbolsPerSecond: 100,
        startDelayMs: 0,
        stopDelayMs: 100,
      }),
      {
        targetVisibleScene: [
          [2, 1, 2],
          [1, 2, 1],
        ],
        targetVisiblePresentationValues: [
          [7, null, null],
          [null, null, null],
        ],
        targetVisibleStates: [
          ["appear", "appear", "appear"],
          ["appear", "appear", "appear"],
        ],
      },
    );

    const result = reelSet.update(0.1);

    expect(result).toMatchObject({ completed: false, stoppedAxes: [0] });
    expect(reelSet.reels[0]!.getVisibleSymbolStateSnapshot(0)).toMatchObject({
      requestedState: "appear",
    });
    expect(reelSet.reels[0]!.getVisiblePresentationValues()[0]).toBe(7);
    expect(reelSet.reels[1]!.getSnapshot().phase).not.toBe("stopped");
  });

  it("starts and stops axes in order, rejects reentry, and lands on the GMI scene", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const finalYs = gameConfig.getStopYCoordinates({
      reelsName: "reels01",
      sceneName: "step0.scene0",
      scene,
    });
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      texturePolicy: {
        requiredStateTextures: ["spinBlur"],
      },
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const presentationTarget: VisibleSymbolPresentationTarget = reelSet;
    expect(presentationTarget).toBe(reelSet);
    const plan = createReelSpinPlan({
      reels,
      finalYs,
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
    });

    reelSet.spin(plan);
    expect(() => reelSet.spin(plan)).toThrow(/active/);
    expect(reelSet.update(0).startedAxes).toEqual([0]);
    expect(reelSet.update(0.04).startedAxes).toEqual([0, 1]);

    let result = reelSet.update(0.05);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(scene);
    expect(reelSet.getSnapshot().reels.map((reel) => reel.phase)).toEqual([
      "stopped",
      "stopped",
      "stopped",
      "stopped",
      "stopped",
    ]);
  });

  it("validates reset and spin plan width", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });

    expect(() => reelSet.resetToFinalYs([1])).toThrow(/finalYs/);
    reelSet.resetToFinalYs([1, 1, 4, 0, 27]);
    expect(reelSet.getVisibleScene()[0]).toEqual([2, 0, 3, 0, 4]);
    expect(() =>
      reelSet.spin({
        direction: "forward",
        totalDurationMs: 0,
        axes: [],
      }),
    ).toThrow(/axes length/);
  });

  it("resets directly to a target visible scene", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const targetVisibleScene = scene.map((column) =>
      Object.freeze([...column].reverse()),
    );

    reelSet.resetToVisibleScene(targetVisibleScene, [0, 0, 0, 0, 0]);

    expect(reelSet.getVisibleScene()).toEqual(targetVisibleScene);
    expect(reelSet.getSnapshot().spinning).toBe(false);
  });

  it("sorts visible slot containers across reels by render priority", () => {
    const prioritizedReelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry({
        symbolRenderPriorities: {
          A: 2,
        },
      }),
    });

    prioritizedReelSet.resetToVisibleScene(
      [
        [1, 2, 2],
        [2, 2, 2],
      ],
      [0, 0],
    );
    const leftHigh = getVisibleSlotTestView(prioritizedReelSet, 0, 0);
    const rightLow = getVisibleSlotTestView(prioritizedReelSet, 1, 2);
    expect(leftHigh.container.parent).toBe(rightLow.container.parent);
    expect(leftHigh.container.parent?.sortableChildren).toBe(true);
    expect(leftHigh.symbol?.renderPriority).toBe(2);
    expect(leftHigh.container.zIndex).toBeGreaterThan(
      rightLow.container.zIndex,
    );

    const defaultReelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    defaultReelSet.resetToVisibleScene(
      [
        [1, 1, 1],
        [2, 2, 2],
      ],
      [0, 0],
    );
    expect(
      getVisibleSlotTestView(defaultReelSet, 0, 2).container.zIndex,
    ).toBeGreaterThan(
      getVisibleSlotTestView(defaultReelSet, 0, 0).container.zIndex,
    );
    expect(
      getVisibleSlotTestView(defaultReelSet, 1, 0).container.zIndex,
    ).toBeGreaterThan(
      getVisibleSlotTestView(defaultReelSet, 0, 2).container.zIndex,
    );
  });

  it("keeps priority sorting and slot clip masks while spinning", () => {
    const reels = createBasicReels();
    const reelSet = new RenderReelSet({
      reels,
      layout: createBasicLayout(),
      registry: createBasicRegistry({
        symbolRenderPriorities: {
          A: 2,
        },
      }),
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs: [2, 1],
      visibleRows: 3,
      minimumSpinCycles: 2,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 30,
      startDelayMs: 0,
      stopDelayMs: 0,
    });

    reelSet.spin(plan, {
      targetVisibleScene: [
        [1, 1, 1],
        [2, 2, 2],
      ],
    });
    reelSet.update(0);
    expect(reelSet.reels[0].getSlotRenderView(0).hasClipMask).toBe(true);

    let result = reelSet.update(0.05);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
    }

    expect(result.completed).toBe(true);
    const leftHigh = reelSet.reels[0].getSlotRenderView(0);
    const rightLow = reelSet.reels[1].getSlotRenderView(2);
    expect(leftHigh.hasClipMask).toBe(false);
    expect(rightLow.hasClipMask).toBe(false);
    expect(leftHigh.zIndex).toBeGreaterThan(rightLow.zIndex);
  });

  it("injects target visible symbols without requiring the target window to exist on the public reel strip", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const scene = createGameLogic(basicMessage).getStep(0).getScene(0);
    const finalYs = gameConfig.getStopYCoordinates({
      reelsName: "reels01",
      sceneName: "step0.scene0",
      scene,
    });
    const targetVisibleScene = scene.map((column) =>
      Object.freeze([...column].reverse()),
    );
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      texturePolicy: {
        requiredStateTextures: ["spinBlur"],
      },
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs,
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
    });

    reelSet.spin(plan, { targetVisibleScene });
    let result = reelSet.update(0);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = reelSet.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(reelSet.getVisibleScene()).toEqual(targetVisibleScene);
  });

  it("validates target visible scene width and height", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
      }),
      registry,
    });
    const plan = createReelSpinPlan({
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
    });

    expect(() =>
      reelSet.spin(plan, { targetVisibleScene: [[1, 2, 3, 4, 5]] }),
    ).toThrow(/column count/);
    expect(() =>
      reelSet.spin(plan, {
        targetVisibleScene: [
          [1, 2, 3, 4],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
        ],
      }),
    ).toThrow(/length/);
  });

  it("requests visible symbol states by window coordinate after reels stop", () => {
    const gameConfig = createGameConfig(game2Config);
    const reels = gameConfig.getReels("reels01");
    const registry = createReelSymbolRegistry({
      gameConfig,
      assets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map(
          (symbol) => [symbol, createTextureSet(20, 20)],
        ),
      ),
      emptySymbols: ["BN"],
      animationResolver: createTestSymbolAnimationResolver(),
    });
    const reelSet = new RenderReelSet({
      reels,
      layout: createReelLayout({
        reelCount: 5,
        visibleRows: 5,
        cellWidth: 20,
        cellHeight: 20,
        columnGap: 3,
        rowGap: 4,
      }),
      registry,
    });
    const targetVisibleScene = [
      [2, 0, 3, 0, 4],
      [1, 2, 3, 0, 4],
      [3, 5, 10, 1, 2],
      [6, 6, 8, 9, 10],
      [1, 2, 3, 4, 5],
    ];

    reelSet.resetToVisibleScene(targetVisibleScene, [1, 1, 4, 0, 27]);
    reelSet.requestVisibleSymbolStates(
      [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ],
      "win",
    );

    expect(
      reelSet
        .getVisibleSymbolStateSnapshots([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ])
        .map((snapshot) => snapshot.requestedState),
    ).toEqual(["win", "win"]);
    expect(
      reelSet.getVisibleSymbolGeometrySnapshots([
        { x: 0, y: 0 },
        { x: 1, y: 1 },
      ]),
    ).toEqual([
      {
        x: 0,
        y: 0,
        code: 2,
        kind: "textured",
        centerX: 10,
        centerY: 10,
        cellWidth: 20,
        cellHeight: 20,
      },
      {
        x: 1,
        y: 1,
        code: 2,
        kind: "textured",
        centerX: 33,
        centerY: 34,
        cellWidth: 20,
        cellHeight: 20,
      },
    ]);

    reelSet.update(0);
    expect(reelSet.getVisibleSymbolStateSnapshot(0, 0).requestedState).toBe(
      "win",
    );

    reelSet.update(0.58);
    expect(
      reelSet
        .getVisibleSymbolStateSnapshots([
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ])
        .every((snapshot) => snapshot.requestedState === "normal"),
    ).toBe(true);

    expect(() => reelSet.requestVisibleSymbolState(0, 1, "win")).toThrow(
      /empty/,
    );
    expect(() => reelSet.requestVisibleSymbolState(5, 0, "win")).toThrow(
      /out of range/,
    );
    expect(() => reelSet.getVisibleSymbolGeometrySnapshot(5, 0)).toThrow(
      /out of range/,
    );
    expect(() => reelSet.getVisibleSymbolGeometrySnapshot(0, 5)).toThrow(
      /out of range/,
    );

    const plan = createReelSpinPlan({
      reels,
      finalYs: [1, 1, 4, 0, 27],
      visibleRows: 5,
      minimumSpinCycles: 10,
      baseDurationMs: 300,
      speedSymbolsPerSecond: 200,
      startDelayMs: 40,
      stopDelayMs: 30,
    });
    reelSet.spin(plan);
    expect(() => reelSet.requestVisibleSymbolState(0, 0, "win")).toThrow(
      /spinning/,
    );
    expect(() => reelSet.getVisibleSymbolGeometrySnapshot(0, 0)).toThrow(
      /spinning/,
    );
  });

  it("shares one symbol pool across reels and drains idle plus active symbols on destroy", () => {
    const reelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
      symbolPool: {
        enabled: true,
        targetIdlePerCode: 5,
        maxIdlePerCode: 10,
        maxIdleTotal: 80,
      },
    });

    reelSet.resetToVisibleScene(
      [
        [1, 1, 1],
        [2, 2, 2],
      ],
      [0, 0],
    );
    const firstA = getVisibleSlotSymbol(reelSet, 0, 0);
    const firstB = getVisibleSlotSymbol(reelSet, 1, 0);
    const firstADestroy = vi.spyOn(firstA, "destroy");
    const firstBDestroy = vi.spyOn(firstB, "destroy");

    reelSet.resetToVisibleScene(
      [
        [2, 2, 2],
        [1, 1, 1],
      ],
      [0, 0],
    );

    expect(
      reelSet.reels[1]
        .getSlotRenderViews()
        .some((slot) => slot.symbol === firstA),
    ).toBe(true);
    expect(reelSet.getSymbolPoolStats()).toMatchObject({
      totalIdle: expect.any(Number),
      idlePerCode: { 2: expect.any(Number) },
    });

    reelSet.destroy({ children: true });

    expect(firstADestroy).toHaveBeenCalledTimes(1);
    expect(firstBDestroy).toHaveBeenCalledTimes(1);
  });

  it("does not create or pool empty symbols", () => {
    const reelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
      symbolPool: {
        enabled: true,
        targetIdlePerCode: 5,
        maxIdlePerCode: 10,
        maxIdleTotal: 80,
      },
    });

    reelSet.resetToVisibleScene(
      [
        [0, 0, 0],
        [0, 0, 0],
      ],
      [0, 0],
    );

    expect(reelSet.getSymbolPoolStats()?.idlePerCode[0]).toBeUndefined();
    expect(
      reelSet.reels
        .flatMap((reel) => reel.getSlotRenderViews())
        .filter((slot) => slot.windowY >= 0 && slot.windowY < 3)
        .every((slot) => slot.symbol === null),
    ).toBe(true);
  });

  it("runs a real standard-reel cascade while preserving existing occurrence identity", () => {
    const reelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry({
        symbolAnimationCapabilities: {
          A: ["dropdown"],
          B: ["dropdown"],
          C: ["dropdown"],
        },
      }),
    });
    reelSet.resetToVisibleScene(
      [
        [1, 1, 2],
        [2, 2, 1],
      ],
      [0, 0],
    );
    const carried = getVisibleSlotSymbol(reelSet, 0, 0);
    const carriedRender = reelSet.getSymbol({ x: 0, y: 0 });
    reelSet.releaseVisibleSymbols([{ x: 0, y: 1 }]);
    reelSet.startCascadeDrop({
      columns: 2,
      rows: 3,
      movements: [
        {
          kind: "existing",
          x: 0,
          sourceY: 0,
          targetY: 1,
          startSeconds: 0,
          fallSeconds: 0.1,
          settleSeconds: 0.05,
          overshootPixels: 0,
        },
        {
          kind: "refill",
          x: 0,
          sourceY: -1,
          targetY: 0,
          outputCode: 2,
          outputPresentationValue: null,
          startSeconds: 0.02,
          fallSeconds: 0.1,
          settleSeconds: 0.05,
          overshootPixels: 0,
        },
      ],
      valueCommits: [],
      totalSeconds: 0.17,
    });
    expect(() =>
      reelSet.startContinuous({
        direction: "forward",
        speedSymbolsPerSecond: 20,
      }),
    ).toThrow(/cascade dropdown is active/);
    expect(reelSet.getSnapshot().spinning).toBe(true);
    reelSet.update(0.1);
    reelSet.update(0.1);
    expect(reelSet.getVisibleScene()).toEqual([
      [2, 1, 2],
      [2, 2, 1],
    ]);
    expect(getVisibleSlotSymbol(reelSet, 0, 1)).toBe(carried);
    carriedRender.setState("normal");
    expect(reelSet.getSnapshot().spinning).toBe(false);
  });

  it("rejects invalid standard-reel cascade positions and dimming inputs", () => {
    const reelSet = new RenderReelSet({
      reels: createBasicReels(),
      layout: createBasicLayout(),
      registry: createBasicRegistry(),
    });
    reelSet.resetToVisibleScene(
      [
        [1, 1, 2],
        [2, 2, 1],
      ],
      [0, 0],
    );
    const area = reelSet.getArea();
    area.setSymbolDimming(
      [
        { x: 0, y: 0 },
        { x: 1, y: 2 },
      ],
      0.8,
    );
    expect(reelSet.reels[0]!.getSlotBrightness(0)).toBeCloseTo(0.2, 2);
    expect(reelSet.reels[0]!.getSlotBrightness(1)).toBe(1);
    expect(reelSet.reels[1]!.getSlotBrightness(2)).toBeCloseTo(0.2, 2);
    area.setSymbolDimming([{ x: 1, y: 1 }], 0.5);
    expect(reelSet.reels[0]!.getSlotBrightness(0)).toBe(1);
    expect(reelSet.reels[1]!.getSlotBrightness(1)).toBeCloseTo(0.5, 2);
    area.clearSymbolDimming();
    expect(
      reelSet.reels.every((reel) =>
        reel
          .getSlotRenderViews()
          .filter((slot) => slot.windowY >= 0 && slot.windowY < 3)
          .every((slot) => reel.getSlotBrightness(slot.windowY) === 1),
      ),
    ).toBe(true);
    expect(() => area.setSymbolDimming([], 0.5)).toThrow(/must not be empty/);
    expect(() =>
      reelSet.releaseVisibleSymbols([
        { x: 0, y: 0 },
        { x: 0, y: 0 },
      ]),
    ).toThrow(/duplicate 0,0/);
    expect(() =>
      reelSet.releaseVisibleSymbols([{ x: Number.NaN, y: 0 }]),
    ).toThrow(/out of range/);
    expect(() => reelSet.releaseVisibleSymbols([{ x: 2, y: 0 }])).toThrow(
      /out of range/,
    );
    expect(() =>
      reelSet.setVisibleSymbolDimming([], Number.POSITIVE_INFINITY),
    ).toThrow(/finite and between 0 and 1/);
    expect(() => reelSet.setVisibleSymbolDimming([], -0.1)).toThrow(
      /finite and between 0 and 1/,
    );
    expect(() => reelSet.setVisibleSymbolDimming([], 1.1)).toThrow(
      /finite and between 0 and 1/,
    );
  });
});

function getVisibleSlotSymbol(reelSet: RenderReelSet, x: number, y: number) {
  const symbol = reelSet.reels[x].getSlotRenderView(y).symbol;
  if (!symbol) {
    throw new Error(`Missing visible symbol at ${x},${y}.`);
  }
  return symbol;
}

function getVisibleSlotTestView(reelSet: RenderReelSet, x: number, y: number) {
  const view = reelSet.reels[x].getSlotRenderView(y);
  const container = view.symbol?.parent?.parent;
  if (!container) throw new Error(`Missing visible slot at ${x},${y}.`);
  return { symbol: view.symbol, container };
}
