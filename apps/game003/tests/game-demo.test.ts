import { describe, expect, it } from "vitest";
import { createTextureSet } from "../../../packages/rendercore/tests/reel/helpers.js";
import {
  createWinSymbolAni,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import {
  GAME003_DEFAULT_SCENE,
  GAME003_SPIN_SCENE,
  GAME003_WIN_SPIN_SCENE,
} from "./fixtures/game003-gmi.js";
import { GAME003_STATIC_CONFIG } from "../src/generated/game-static.generated.js";
import {
  DEFAULT_GAME003_REEL_CONFIG,
  assertGame003ReelVisualMatchesTarget,
  createGame003ReelRuntime,
} from "../src/game-demo.js";
import {
  GAME003_REEL_COUNT,
  GAME003_VISIBLE_ROWS,
} from "../src/game-layout.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

const GAME003_SKIN = getGame003SkinConfig("1");

describe("game003 reel runtime", () => {
  it("locks gamecfg003 reels and symbol codes", () => {
    const runtime = createRuntime();
    const gameConfig = runtime.gameConfig;

    expect(gameConfig.getReelNames()).toContain("bg-reel01");
    expect(gameConfig.getReels("bg-reel01").getReelCount()).toBe(5);
    expect(gameConfig.getSymbolCode("WL")).toBe(0);
    expect(gameConfig.getSymbolCode("SC")).toBe(22);
    expect(runtime.layout.visibleRows).toBe(GAME003_VISIBLE_ROWS);
    expect(runtime.layout.reelCount).toBe(GAME003_REEL_COUNT);
    expect(runtime.layout.columnGap).toBe(15);
  });

  it("keeps reels hidden until a live scene is applied", () => {
    const runtime = createRuntime();

    expect(runtime.mainReelsLayer.visible).toBe(false);
    expect(runtime.getVisualSnapshot()).toMatchObject({
      visible: false,
      spinning: false,
      reelCount: 5,
    });

    const finalYs = runtime.applyScene(GAME003_DEFAULT_SCENE, "test.default");

    expect(finalYs).toHaveLength(5);
    expect(runtime.getFinalYs()).toEqual(finalYs);
    expect(runtime.getTargetScene()).toBeNull();
    expect(runtime.mainReelsLayer.visible).toBe(true);
    assertGame003ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME003_DEFAULT_SCENE,
      "applied game003 scene",
    );
  });

  it("spins to the server target scene through temporary visible window injection", () => {
    const runtime = createRuntime(GAME003_DEFAULT_SCENE);
    const plan = runtime.spinToScene(GAME003_SPIN_SCENE, "test.spin");

    expect(plan.axes).toHaveLength(5);
    expect(runtime.getTargetScene()).toEqual(GAME003_SPIN_SCENE);
    expect(runtime.isSpinning()).toBe(true);
    expect(() => runtime.spinToScene(GAME003_SPIN_SCENE)).toThrow(
      /already spinning/,
    );

    let result = runtime.update(0.01);
    expect(runtime.getVisualSnapshot().requestedStates.flat()).toContain(
      "spinBlur",
    );
    for (let index = 0; index < 60 && !result.completed; index += 1) {
      result = runtime.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(runtime.isSpinning()).toBe(false);
    expect(runtime.getCurrentScene()).toEqual(GAME003_SPIN_SCENE);
    assertGame003ReelVisualMatchesTarget(
      runtime.getVisualSnapshot(),
      GAME003_SPIN_SCENE,
      "completed game003 scene",
    );
  });

  it("does not fail when a renderable target window cannot be found on the public reel strip", () => {
    const runtime = createRuntime(GAME003_DEFAULT_SCENE);
    const localReelMissingScene = [
      [22, 22, 22, 22, 22],
      ...GAME003_SPIN_SCENE.slice(1),
    ];
    const reels = runtime.gameConfig.getReels(
      DEFAULT_GAME003_REEL_CONFIG.reelsName,
    );
    expect(reels.findStopYCandidates(0, localReelMissingScene[0])).toEqual([]);

    const plan = runtime.spinToScene(localReelMissingScene, "missing stop y");

    expect(plan.axes[0].finalY).toBe(
      reels.normalizeY(0, runtime.getFinalYs()?.[0] ?? 0),
    );
    for (
      let result = runtime.update(0.05), index = 0;
      index < 60 && !result.completed;
      index += 1, result = runtime.update(0.05)
    ) {
      if (index === 59) {
        expect(result.completed).toBe(true);
      }
    }
    expect(runtime.getCurrentScene()).toEqual(localReelMissingScene);
  });

  it("requests win state on visible positions and lets once animation return to normal", () => {
    const runtime = createRuntime(GAME003_WIN_SPIN_SCENE, {
      ...DEFAULT_GAME003_REEL_CONFIG,
      animationResolver: (context) =>
        context.resolvedState === "win"
          ? createWinSymbolAni(context, { durationSeconds: 0.58 })
          : GAME003_SKIN.symbolAnimationResolver(context),
    });
    const positions = [
      { x: 0, y: 4 },
      { x: 1, y: 2 },
      { x: 2, y: 0 },
    ];

    runtime.requestVisibleSymbolStates(positions, "win");

    expect(
      runtime.getVisibleSymbolStateSnapshots(positions).map((snapshot) => ({
        x: snapshot.x,
        y: snapshot.y,
        requestedState: snapshot.requestedState,
      })),
    ).toEqual([
      { x: 0, y: 4, requestedState: "win" },
      { x: 1, y: 2, requestedState: "win" },
      { x: 2, y: 0, requestedState: "win" },
    ]);
    expect(
      runtime.getVisibleSymbolGeometrySnapshots(positions).map((snapshot) => ({
        x: snapshot.x,
        y: snapshot.y,
        centerX: snapshot.centerX,
        centerY: snapshot.centerY,
        cellWidth: snapshot.cellWidth,
        cellHeight: snapshot.cellHeight,
      })),
    ).toEqual([
      {
        x: 0,
        y: 4,
        centerX: 82.5,
        centerY: 585,
        cellWidth: 165,
        cellHeight: 130,
      },
      {
        x: 1,
        y: 2,
        centerX: 262.5,
        centerY: 325,
        cellWidth: 165,
        cellHeight: 130,
      },
      {
        x: 2,
        y: 0,
        centerX: 442.5,
        centerY: 65,
        cellWidth: 165,
        cellHeight: 130,
      },
    ]);
    expect(runtime.getVisualSnapshot().requestedStates[0][4]).toBe("win");

    runtime.update(0);
    expect(
      runtime
        .getVisibleSymbolStateSnapshots(positions)
        .every((snapshot) => snapshot.requestedState === "win"),
    ).toBe(true);

    runtime.update(0.58);
    expect(
      runtime
        .getVisibleSymbolStateSnapshots(positions)
        .every((snapshot) => snapshot.requestedState === "normal"),
    ).toBe(true);
  });

  it("fails fast for unknown or currently unrenderable paytable symbols", () => {
    const runtime = createRuntime();
    expect(() =>
      runtime.applyScene(
        [[13, 8, 9, 12, 1], ...GAME003_DEFAULT_SCENE.slice(1)],
        "BN scene",
      ),
    ).toThrow(/BN.*missing assets/);

    expect(() =>
      createGame003ReelRuntime({
        rawGameConfig: GAME003_STATIC_CONFIG.gameConfig,
        symbolAssets: createSymbolTextures(["WL"]),
      }),
    ).toThrow(/missing assets/);
  });

  it("fails fast if the static reel kind is not the supported normal mode", () => {
    expect(() =>
      createGame003ReelRuntime({
        rawGameConfig: GAME003_STATIC_CONFIG.gameConfig,
        symbolAssets: createSymbolTextures(GAME003_SKIN.displaySymbols),
        config: {
          ...DEFAULT_GAME003_REEL_CONFIG,
          kind: "grid-cell" as never,
        },
      }),
    ).toThrow(/only supports normal reels/);
  });
});

function createRuntime(
  initialScene?: typeof GAME003_DEFAULT_SCENE,
  config = DEFAULT_GAME003_REEL_CONFIG,
) {
  return createGame003ReelRuntime({
    rawGameConfig: GAME003_STATIC_CONFIG.gameConfig,
    symbolAssets: createSymbolTextures(GAME003_SKIN.displaySymbols),
    initialScene,
    config,
  });
}

function createSymbolTextures(symbols: readonly string[]): SymbolAssetMap {
  return Object.freeze(
    Object.fromEntries(
      symbols.map((symbol) => [symbol, createTextureSet(172, 130)]),
    ),
  );
}
