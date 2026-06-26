import { type Container } from "pixi.js";
import {
  createGameConfig,
  type LogicGameConfig,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import {
  RenderGridCellReelSet,
  createGridCellOrder,
  createGridCellReelSpinPlan,
  createReelSymbolRegistry,
  type GridCellDimmingPattern,
  type GridCellOrderMode,
  type GridCellReelSpinPlan,
  type GridCellReelSpinTiming,
  type ReelLayout,
  type ReelSpinDirection,
  type RenderGridCellReelCellSnapshot,
  type RenderGridCellReelSetUpdateResult,
} from "@slotclientengine/rendercore/reel";
import type {
  ReelSymbolScaleMap,
  SymbolAssetMap,
} from "@slotclientengine/rendercore";
import {
  GAME002_EMPTY_SYMBOLS,
  GAME002_REQUIRED_STATE_TEXTURES,
} from "./assets.js";
import {
  GAME002_REEL_COUNT,
  GAME002_REELS_NAME,
  GAME002_VISIBLE_ROWS,
  GAME002_GRID_CELL_DIMMING,
  GAME002_GRID_CELL_REEL_ORDER,
  GAME002_GRID_CELL_REEL_TIMING,
  createGame002Layout,
  createGame002ReelLayerLayout,
  createGame002ReelLayout,
  type Game002ReelLayerLayout,
} from "./game-layout.js";
import { GAME002_SYMBOL_SCALES } from "./symbol-animation-config.js";
import {
  assertScenesEqual,
  sceneEquals,
  validateGame002Scene,
} from "./scene.js";

export interface Game002ReelConfig {
  readonly reelsName: string;
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly direction: ReelSpinDirection;
  readonly orderMode: GridCellOrderMode;
  readonly timing: GridCellReelSpinTiming;
  readonly dimming: GridCellDimmingPattern;
}

export const DEFAULT_GAME002_REEL_CONFIG: Game002ReelConfig = Object.freeze({
  reelsName: GAME002_REELS_NAME,
  emptySymbols: GAME002_EMPTY_SYMBOLS,
  symbolScales: GAME002_SYMBOL_SCALES,
  direction: "forward",
  orderMode: GAME002_GRID_CELL_REEL_ORDER,
  timing: GAME002_GRID_CELL_REEL_TIMING,
  dimming: GAME002_GRID_CELL_DIMMING,
});

export interface Game002ReelRuntimeOptions {
  readonly rawGameConfig: unknown;
  readonly symbolAssets: SymbolAssetMap;
  readonly initialScene?: SceneMatrix;
  readonly config?: Game002ReelConfig;
}

export interface Game002ReelVisualSnapshot {
  readonly visible: boolean;
  readonly spinning: boolean;
  readonly visibleScene: SceneMatrix;
  readonly requestedStates: readonly (readonly (string | null)[])[];
  readonly reelCount: number;
  readonly gridCellCount: number;
  readonly layerX: number;
  readonly layerY: number;
}

export interface Game002ReelRuntime {
  readonly config: Game002ReelConfig;
  readonly gameConfig: LogicGameConfig;
  readonly layout: ReelLayout;
  readonly mainReelsLayer: Container;
  readonly layerLayout: Game002ReelLayerLayout;
  getCurrentScene(): SceneMatrix | null;
  getTargetScene(): SceneMatrix | null;
  getFinalYs(): readonly number[] | null;
  getVisualSnapshot(): Game002ReelVisualSnapshot;
  applyScene(scene: SceneMatrix, sceneName?: string): readonly number[];
  createSpinPlan(scene: SceneMatrix, sceneName?: string): GridCellReelSpinPlan;
  spinToScene(scene: SceneMatrix, sceneName?: string): GridCellReelSpinPlan;
  update(deltaSeconds: number): RenderGridCellReelSetUpdateResult;
  isSpinning(): boolean;
}

export function createGame002ReelRuntime(
  options: Game002ReelRuntimeOptions,
): Game002ReelRuntime {
  const config = options.config ?? DEFAULT_GAME002_REEL_CONFIG;
  const gameConfig = createGameConfig(options.rawGameConfig);
  const reels = gameConfig.getReels(config.reelsName);
  if (reels.getReelCount() !== GAME002_REEL_COUNT) {
    throw new Error(
      `game002 reels "${config.reelsName}" must contain 6 reels.`,
    );
  }

  const registry = createReelSymbolRegistry({
    gameConfig,
    assets: options.symbolAssets,
    emptySymbols: config.emptySymbols,
    symbolScales: config.symbolScales,
    texturePolicy: {
      requiredStateTextures: GAME002_REQUIRED_STATE_TEXTURES,
    },
  });
  const layout = createGame002ReelLayout();
  const layerLayout = createGame002ReelLayerLayout(
    layout,
    createGame002Layout(),
  );
  const order = createGridCellOrder({
    columns: GAME002_REEL_COUNT,
    rows: GAME002_VISIBLE_ROWS,
    mode: config.orderMode,
  });
  const reelSet = new RenderGridCellReelSet({
    reels,
    registry,
    columns: GAME002_REEL_COUNT,
    rows: GAME002_VISIBLE_ROWS,
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
    order,
  });
  reelSet.x = layerLayout.x;
  reelSet.y = layerLayout.y;
  reelSet.visible = false;

  let currentScene: SceneMatrix | null = null;
  let targetScene: SceneMatrix | null = null;
  let finalYs: readonly number[] | null = null;

  const resolveSceneFinalYs = (
    scene: SceneMatrix,
    sceneName: string,
  ): readonly number[] => {
    assertRenderableSceneCodes(scene, sceneName, gameConfig);
    const resolvedFinalYs = scene.map((visibleSymbols, x) => {
      const candidates = reels.findStopYCandidates(x, visibleSymbols);
      return candidates[0];
    });
    if (resolvedFinalYs.every((finalY) => finalY !== undefined)) {
      return Object.freeze(resolvedFinalYs as number[]);
    }

    return Object.freeze(
      resolvedFinalYs.map((finalY, x) => {
        if (finalY !== undefined) {
          return finalY;
        }
        return reels.normalizeY(x, finalYs?.[x] ?? 0);
      }),
    );
  };

  const runtime: Game002ReelRuntime = Object.freeze({
    config,
    gameConfig,
    layout,
    mainReelsLayer: reelSet,
    layerLayout,
    getCurrentScene(): SceneMatrix | null {
      return currentScene;
    },
    getTargetScene(): SceneMatrix | null {
      return targetScene;
    },
    getFinalYs(): readonly number[] | null {
      return finalYs;
    },
    getVisualSnapshot(): Game002ReelVisualSnapshot {
      const gridSnapshot = reelSet.getSnapshot();
      return Object.freeze({
        visible: reelSet.visible,
        spinning: gridSnapshot.spinning,
        visibleScene: validateGame002Scene(
          gridSnapshot.visibleScene,
          "game002 reel visual snapshot",
        ),
        requestedStates: createGridCellSnapshotMatrix(
          gridSnapshot.cells,
          (cell) => cell.requestedState,
        ),
        reelCount: GAME002_REEL_COUNT,
        gridCellCount: gridSnapshot.cells.length,
        layerX: reelSet.x,
        layerY: reelSet.y,
      });
    },
    applyScene(
      scene: SceneMatrix,
      sceneName = "game002.initialScene",
    ): readonly number[] {
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      reelSet.resetToScene(validScene, nextFinalYs);
      const visibleScene = validateGame002Scene(
        reelSet.getVisibleScene(),
        `${sceneName} visible scene`,
      );
      assertScenesEqual(visibleScene, validScene, sceneName);
      reelSet.visible = true;
      currentScene = validScene;
      targetScene = null;
      finalYs = nextFinalYs;
      return nextFinalYs;
    },
    createSpinPlan(
      scene: SceneMatrix,
      sceneName = "game002.spinScene",
    ): GridCellReelSpinPlan {
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      return createGridCellReelSpinPlan({
        reels,
        finalYs: nextFinalYs,
        targetScene: validScene,
        columns: GAME002_REEL_COUNT,
        rows: GAME002_VISIBLE_ROWS,
        order,
        direction: config.direction,
        timing: config.timing,
        dimming: config.dimming,
      });
    },
    spinToScene(
      scene: SceneMatrix,
      sceneName = "game002.spinScene",
    ): GridCellReelSpinPlan {
      if (reelSet.getSnapshot().spinning) {
        throw new Error("game002 reels are already spinning.");
      }
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      const plan = createGridCellReelSpinPlan({
        reels,
        finalYs: nextFinalYs,
        targetScene: validScene,
        columns: GAME002_REEL_COUNT,
        rows: GAME002_VISIBLE_ROWS,
        order,
        direction: config.direction,
        timing: config.timing,
        dimming: config.dimming,
      });
      finalYs = nextFinalYs;
      targetScene = validScene;
      reelSet.spin(plan);
      reelSet.visible = true;
      return plan;
    },
    update(deltaSeconds: number): RenderGridCellReelSetUpdateResult {
      const result = reelSet.update(deltaSeconds);
      if (result.completed && targetScene) {
        const visibleScene = validateGame002Scene(
          reelSet.getVisibleScene(),
          "completed game002 reels",
        );
        assertScenesEqual(visibleScene, targetScene, "completed game002 reels");
        currentScene = targetScene;
        targetScene = null;
        reelSet.visible = true;
      }
      return result;
    },
    isSpinning(): boolean {
      return reelSet.getSnapshot().spinning;
    },
  });

  if (options.initialScene) {
    runtime.applyScene(options.initialScene, "game002.initialScene");
  }

  return runtime;
}

export function assertGame002ReelVisualMatchesTarget(
  snapshot: Game002ReelVisualSnapshot,
  targetScene: SceneMatrix,
  label: string,
): void {
  const validTargetScene = validateGame002Scene(targetScene, label);
  if (!snapshot.visible) {
    throw new Error(`${label} reel layer must be visible.`);
  }
  if (!sceneEquals(snapshot.visibleScene, validTargetScene)) {
    throw new Error(`${label} visible scene does not match target scene.`);
  }
}

function createGridCellSnapshotMatrix<T>(
  cells: readonly RenderGridCellReelCellSnapshot[],
  selector: (cell: RenderGridCellReelCellSnapshot) => T,
): readonly (readonly T[])[] {
  const matrix: Array<Array<T | undefined>> = Array.from(
    { length: GAME002_REEL_COUNT },
    () => Array.from({ length: GAME002_VISIBLE_ROWS }),
  );
  for (const cell of cells) {
    matrix[cell.x][cell.y] = selector(cell);
  }
  return Object.freeze(
    matrix.map((column, x) =>
      Object.freeze(
        column.map((value, y) => {
          if (value === undefined) {
            throw new Error(`Missing game002 grid cell snapshot (${x},${y}).`);
          }
          return value;
        }),
      ),
    ),
  );
}

function assertRenderableSceneCodes(
  scene: SceneMatrix,
  label: string,
  gameConfig: LogicGameConfig,
): void {
  for (const [x, column] of scene.entries()) {
    for (const [y, code] of column.entries()) {
      if (!gameConfig.getPaytableEntry(code)) {
        throw new Error(
          `${label}[${x}][${y}] symbol code ${code} does not exist in game002 paytable.`,
        );
      }
    }
  }
}
