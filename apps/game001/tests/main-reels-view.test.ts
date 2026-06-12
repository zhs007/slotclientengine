import { describe, expect, it } from "vitest";
import { Container } from "pixi.js";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import {
  createGameConfig,
  type LogicGameConfig,
  type LogicReels,
  type SceneMatrix,
} from "@slotclientengine/logiccore";
import {
  RenderSymbol,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import {
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
  type ReelLayout,
  type ReelSpinPlan,
  type ReelSymbolRegistry,
} from "@slotclientengine/rendercore/reel";
import {
  createTestTexture,
  createTextureSet,
} from "../../../packages/rendercore/tests/reel/helpers.js";
import { GAME001_REQUIRED_STATE_TEXTURES } from "../src/assets.js";
import { GAME001_SYMBOL_SCALES } from "../src/game-demo.js";
import {
  GAME001_LOCKED_AXIS_INDEX,
  GAME001_LOCKED_CENTER_Y,
  createGame001Layout,
  createMainReelsLayerLayout,
} from "../src/game-layout.js";
import {
  createGame001MainReelsView,
  type Game001MainReelsView,
} from "../src/main-reels-view.js";

const INITIAL_SCENE = Object.freeze([
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([2, 0, 3, 0, 4]),
  Object.freeze([0, 4, 0, 5, 0]),
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([9, 0, 6, 0, 6]),
]);

const TARGET_WITH_CHANGED_LOCK = Object.freeze([
  INITIAL_SCENE[0],
  INITIAL_SCENE[1],
  INITIAL_SCENE[2],
  Object.freeze([1, 1, 2, 1, 1]),
  INITIAL_SCENE[4],
]);

describe("game001 main reels view", () => {
  it("applies a full scene while rendering only normal axes plus one locked center symbol", () => {
    const fixture = createFixture();
    fixture.view.applyScene(INITIAL_SCENE, fixture.finalYs);
    const snapshot = fixture.view.getVisualSnapshot();

    expect(snapshot.visible).toBe(true);
    expect(snapshot.normalAxisIndexes).toEqual([0, 1, 2, 4]);
    expect(snapshot.normalAxisIndexes).not.toContain(GAME001_LOCKED_AXIS_INDEX);
    expect(snapshot.lockedAxis.xIndex).toBe(GAME001_LOCKED_AXIS_INDEX);
    expect(snapshot.lockedAxis.sceneY).toBe(GAME001_LOCKED_CENTER_Y);
    expect(snapshot.lockedAxis.code).toBe(INITIAL_SCENE[3][2]);
    expect(snapshot.lockedAxis.symbol).toBe("S00");
    expect(snapshot.lockedAxis.visibleSymbolCount).toBe(1);
    expect(snapshot.lockedAxis.x).toBe(
      fixture.layout.getReelX(3) + fixture.layout.cellWidth / 2,
    );
    expect(snapshot.lockedAxis.y).toBe(
      1.5 * fixture.layout.cellHeight + fixture.layout.cellHeight,
    );
    expect(snapshot.normalVisibleScene).toEqual([
      INITIAL_SCENE[0],
      INITIAL_SCENE[1],
      INITIAL_SCENE[2],
      INITIAL_SCENE[4],
    ]);
  });

  it("spins only normal axes and keeps the locked symbol fixed until completion", () => {
    const fixture = createFixture();
    fixture.view.applyScene(INITIAL_SCENE, fixture.finalYs);
    const before = fixture.view.getVisualSnapshot().lockedAxis;
    const plan = createFastPlan(fixture.reels, fixture.finalYs);

    fixture.view.spinToScene(TARGET_WITH_CHANGED_LOCK, fixture.finalYs, plan);
    const spinningSnapshot = fixture.view.getVisualSnapshot();

    expect(spinningSnapshot.startedNormalAxes).toEqual([0, 1, 2, 4]);
    expect(spinningSnapshot.startedNormalAxes).not.toContain(3);
    expect(spinningSnapshot.normalRequestedStates.flat()).toContain("spinBlur");
    expect(spinningSnapshot.spinning).toBe(true);
    expect(spinningSnapshot.lockedAxis.code).toBe(before.code);
    expect(spinningSnapshot.lockedAxis.x).toBe(before.x);
    expect(spinningSnapshot.lockedAxis.y).toBe(before.y);
    expect(spinningSnapshot.lockedAxis.rotation).toBe(0);
    expect(spinningSnapshot.lockedAxis.requestedState).toBe("normal");
    expect(spinningSnapshot.lockedAxis.requestedState).not.toBe("spinBlur");

    let result = fixture.view.update(0.05);
    expect(fixture.view.getVisualSnapshot().lockedAxis.code).toBe(before.code);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = fixture.view.update(0.05);
    }

    const completedSnapshot = fixture.view.getVisualSnapshot();
    expect(result.completed).toBe(true);
    expect(fixture.view.isSpinning()).toBe(false);
    expect(completedSnapshot.normalVisibleScene).toEqual([
      TARGET_WITH_CHANGED_LOCK[0],
      TARGET_WITH_CHANGED_LOCK[1],
      TARGET_WITH_CHANGED_LOCK[2],
      TARGET_WITH_CHANGED_LOCK[4],
    ]);
    expect(completedSnapshot.lockedAxis.code).toBe(
      TARGET_WITH_CHANGED_LOCK[3][2],
    );
    expect(completedSnapshot.lockedAxis.symbol).toBe("S0");
    expect(completedSnapshot.lockedAxis.visibleSymbolCount).toBe(1);
    expect(completedSnapshot.lockedAxis.x).toBe(before.x);
    expect(completedSnapshot.lockedAxis.y).toBe(before.y);
    expect(completedSnapshot.lockedAxis.rotation).toBe(0);
  });

  it("does not carry an unfinished appear state into the next spin", () => {
    const fixture = createFixture();
    fixture.view.applyScene(INITIAL_SCENE, fixture.finalYs);
    for (const symbol of collectNormalRenderSymbols(fixture.view.root)) {
      symbol.requestState("appear");
    }
    expect(fixture.view.getVisualSnapshot().normalRequestedStates.flat()).toContain(
      "appear",
    );

    fixture.view.spinToScene(
      TARGET_WITH_CHANGED_LOCK,
      fixture.finalYs,
      createFastPlan(fixture.reels, fixture.finalYs),
    );

    const requestedStates =
      fixture.view.getVisualSnapshot().normalRequestedStates.flat();
    expect(requestedStates).toContain("spinBlur");
    expect(requestedStates).not.toContain("appear");
  });

  it("keeps the locked axis hidden before the first target scene completes", () => {
    const fixture = createFixture();
    const plan = createFastPlan(fixture.reels, fixture.finalYs);

    expect(fixture.view.root.visible).toBe(false);
    expect(fixture.view.getVisualSnapshot().lockedAxis.code).toBeNull();
    expect(fixture.view.getVisualSnapshot().lockedAxis.visibleSymbolCount).toBe(0);

    fixture.view.spinToScene(INITIAL_SCENE, fixture.finalYs, plan);
    expect(fixture.view.root.visible).toBe(false);
    expect(fixture.view.getVisualSnapshot().lockedAxis.code).toBeNull();
    expect(fixture.view.getVisualSnapshot().lockedAxis.visibleSymbolCount).toBe(0);

    let result = fixture.view.update(0.05);
    for (let index = 0; index < 20 && !result.completed; index += 1) {
      result = fixture.view.update(0.05);
    }

    expect(result.completed).toBe(true);
    expect(fixture.view.root.visible).toBe(true);
    expect(fixture.view.getVisualSnapshot().lockedAxis.code).toBe(
      INITIAL_SCENE[3][2],
    );
    expect(fixture.view.getVisualSnapshot().lockedAxis.visibleSymbolCount).toBe(1);
  });

  it("rejects invalid locked axis symbols and never accumulates old symbols", () => {
    const fixture = createFixture();
    const emptyLockedScene = cloneScene(INITIAL_SCENE);
    emptyLockedScene[3][2] = 0;
    const unknownLockedScene = cloneScene(INITIAL_SCENE);
    unknownLockedScene[3][2] = 999;

    expect(() => fixture.view.applyScene(emptyLockedScene, fixture.finalYs)).toThrow(
      /empty symbol/,
    );
    expect(() =>
      fixture.view.applyScene(unknownLockedScene, fixture.finalYs),
    ).toThrow(/does not exist/);

    fixture.view.applyScene(INITIAL_SCENE, fixture.finalYs);
    expect(fixture.view.getVisualSnapshot().lockedAxis.visibleSymbolCount).toBe(1);
    fixture.view.applyScene(TARGET_WITH_CHANGED_LOCK, fixture.finalYs);
    expect(fixture.view.getVisualSnapshot().lockedAxis.visibleSymbolCount).toBe(1);
    expect(fixture.view.getVisualSnapshot().lockedAxis.code).toBe(2);
  });
});

function createFixture(): {
  readonly gameConfig: LogicGameConfig;
  readonly reels: LogicReels;
  readonly layout: ReelLayout;
  readonly registry: ReelSymbolRegistry;
  readonly finalYs: readonly number[];
  readonly view: Game001MainReelsView;
} {
  const gameConfig = createGameConfig(rawGameConfig);
  const reels = gameConfig.getReels("reels01");
  const registry = createReelSymbolRegistry({
    gameConfig,
    assets: createGame001Textures(),
    emptySymbols: ["BN"],
    symbolScales: GAME001_SYMBOL_SCALES,
    texturePolicy: {
      requiredStateTextures: GAME001_REQUIRED_STATE_TEXTURES,
    },
  });
  const cellSize = registry.getCellSize();
  const layout = createReelLayout({
    reelCount: reels.getReelCount(),
    visibleRows: 5,
    cellWidth: cellSize.width,
    cellHeight: cellSize.height,
    columnGap: Math.max(8, Math.round(cellSize.width * 0.08)),
  });
  const finalYs = gameConfig.getStopYCoordinates({
    reelsName: "reels01",
    sceneName: "test.scene",
    scene: INITIAL_SCENE,
  });
  const view = createGame001MainReelsView({
    reels,
    layout,
    registry,
    layerLayout: createMainReelsLayerLayout(layout, createGame001Layout()),
  });

  return Object.freeze({
    gameConfig,
    reels,
    layout,
    registry,
    finalYs,
    view,
  });
}

function createFastPlan(
  reels: LogicReels,
  finalYs: readonly number[],
): ReelSpinPlan {
  return createReelSpinPlan({
    reels,
    finalYs,
    visibleRows: 5,
    direction: "forward",
    minimumSpinCycles: 1,
    baseDurationMs: 120,
    speedSymbolsPerSecond: 50,
    startDelayMs: 0,
    stopDelayMs: 0,
  });
}

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

function cloneScene(scene: SceneMatrix): number[][] {
  return scene.map((column) => [...column]);
}

function collectNormalRenderSymbols(root: Container): RenderSymbol[] {
  const normalLayer = root.children[0];
  if (!(normalLayer instanceof Container)) {
    throw new Error("Expected game001 main reels normal layer.");
  }

  const symbols: RenderSymbol[] = [];
  const stack: Container[] = [normalLayer];
  while (stack.length > 0) {
    const child = stack.shift();
    if (!child) {
      continue;
    }
    if (child instanceof RenderSymbol) {
      symbols.push(child);
      continue;
    }
    stack.push(...child.children.filter((item) => item instanceof Container));
  }
  return symbols;
}
