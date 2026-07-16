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
            if (loop || onceCompleted) return { completed: false };
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
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import {
  createDefaultSymbolAnimationResolver,
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
} from "../src/game-demo.js";
import { GAME002_GRID_CELL_REEL_OFFSETS } from "../src/game-layout.js";
import { getGame002SkinConfig } from "../src/skin-config.js";

beforeEach(() => {
  vi.spyOn(Assets, "load").mockResolvedValue(Texture.WHITE as never);
});

afterEach(() => {
  vi.restoreAllMocks();
});

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

  it("assigns manifest default values to initial and temporary CN symbols", () => {
    const runtime = createRuntime();
    const candidates = new Set(
      getGame002SkinConfig("1").symbolValuePresentationResources.CN
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

  it("preserves the 54-cell order, offsets, dimming and stop timing", () => {
    const runtime = createRuntime(GAME002_SAMPLE_DEFAULT_SCENE);
    expect(runtime.config.spinBounceStrength).toBe(0);
    const plan = runtime.spinToScene(GAME002_SAMPLE_SPIN_SCENE, "spin");

    expect(plan.cells).toHaveLength(54);
    expect(plan.cells[0]).toMatchObject({
      x: 0,
      y: 0,
      orderIndex: 0,
      dimmingAlpha: 0.6,
      reelOffsetY: 0,
    });
    expect(plan.cells[8]).toMatchObject({
      x: 0,
      y: 8,
      orderIndex: 8,
      dimmingAlpha: 0.6,
      reelOffsetY: GAME002_GRID_CELL_REEL_OFFSETS[0][8],
    });
    expect(plan.cells[53]).toMatchObject({
      x: 5,
      y: 8,
      orderIndex: 53,
      dimmingAlpha: 0.6,
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
    expect(plan.lastStopAtMs).toBe(1876);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).not.toContain(
      "disabled",
    );
    runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );
    const reelSet = runtime.mainReelsLayer as RenderGridCellReelSet;
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

function createRuntime(initialScene?: readonly (readonly number[])[]) {
  const skin = getGame002SkinConfig("1");
  const normalResolver = createDefaultSymbolAnimationResolver();
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
      animationResolver: (context) =>
        context.resolvedState === "appear"
          ? new ManualSymbolAni({
              stateId: "appear",
              playback: "once",
              durationSeconds: 0.1,
            })
          : context.resolvedState === "win"
            ? new ManualSymbolAni({
                stateId: "win",
                playback: "once",
                durationSeconds: 0.1,
              })
            : normalResolver(context),
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
