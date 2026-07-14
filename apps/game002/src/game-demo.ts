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
  type GridCellReelOffsetMatrix,
  type GridCellReelSpinPlan,
  type GridCellReelSpinTiming,
  type ReelLayout,
  type ReelSymbolRegistry,
  type ReelSpinDirection,
  type RenderGridCellReelCellSnapshot,
  type RenderGridCellReelSetUpdateResult,
  type RenderVisibleSymbolGeometrySnapshot,
  type RenderVisibleSymbolStateSnapshot,
  type SymbolPresentationValueMatrix,
} from "@slotclientengine/rendercore/reel";
import type {
  ReelSymbolRenderPriorityMap,
  ReelSymbolScaleMap,
  SymbolAnimationResolver,
  SymbolAssetMap,
  SymbolStateId,
  SymbolValuePresentationResourceMap,
} from "@slotclientengine/rendercore";
import type { WinResultPosition } from "@slotclientengine/gameframeworks";
import {
  GAME002_EMPTY_SYMBOLS,
  GAME002_REQUIRED_STATE_TEXTURES,
} from "./assets.js";
import {
  GAME002_REEL_COUNT,
  GAME002_REELS_NAME,
  GAME002_VISIBLE_ROWS,
  GAME002_GRID_CELL_DIMMING,
  GAME002_GRID_CELL_REEL_OFFSETS,
  GAME002_GRID_CELL_REEL_ORDER,
  GAME002_GRID_CELL_REEL_TIMING,
  GAME002_GRID_LAYOUT,
  GAME002_FOCUS_REGION,
  createGame002Layout,
  createGame002ReelLayerLayout,
  createGame002ReelLayout,
  type Game002FocusRegion,
  type Game002GridLayout,
  type Game002ReelLayerLayout,
} from "./game-layout.js";
import {
  GAME002_SYMBOL_RENDER_PRIORITIES,
  GAME002_SYMBOL_SCALES,
} from "./symbol-animation-config.js";
import { getGame002SkinConfig } from "./skin-config.js";
import {
  assertScenesEqual,
  sceneEquals,
  validateGame002Scene,
} from "./scene.js";

export interface Game002ReelConfig {
  readonly reelsName: string;
  readonly emptySymbols: readonly string[];
  readonly texturedSymbols: readonly string[];
  readonly missingAssetLabel: string;
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly animationResolver: SymbolAnimationResolver;
  readonly symbolValuePresentationResources: SymbolValuePresentationResourceMap;
  readonly random: () => number;
  readonly gridLayout: Game002GridLayout;
  readonly focusRegion: Game002FocusRegion;
  readonly cellReelOffsets: GridCellReelOffsetMatrix;
  readonly direction: ReelSpinDirection;
  readonly orderMode: GridCellOrderMode;
  readonly timing: GridCellReelSpinTiming;
  readonly dimming: GridCellDimmingPattern;
}

const GAME002_DEFAULT_SKIN = getGame002SkinConfig("1");

export const DEFAULT_GAME002_REEL_CONFIG: Game002ReelConfig = Object.freeze({
  reelsName: GAME002_REELS_NAME,
  emptySymbols: GAME002_EMPTY_SYMBOLS,
  texturedSymbols: GAME002_DEFAULT_SKIN.displaySymbols,
  missingAssetLabel: GAME002_DEFAULT_SKIN.label,
  symbolScales: GAME002_SYMBOL_SCALES,
  symbolRenderPriorities: GAME002_SYMBOL_RENDER_PRIORITIES,
  animationResolver: GAME002_DEFAULT_SKIN.symbolAnimationResolver,
  symbolValuePresentationResources:
    GAME002_DEFAULT_SKIN.symbolValuePresentationResources,
  random: Math.random,
  gridLayout: GAME002_GRID_LAYOUT,
  focusRegion: GAME002_FOCUS_REGION,
  cellReelOffsets: GAME002_GRID_CELL_REEL_OFFSETS,
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
  readonly presentationValues: SymbolPresentationValueMatrix;
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
  applyScene(
    scene: SceneMatrix,
    sceneName?: string,
    presentationValues?: SymbolPresentationValueMatrix,
  ): readonly number[];
  createSpinPlan(scene: SceneMatrix, sceneName?: string): GridCellReelSpinPlan;
  spinToScene(
    scene: SceneMatrix,
    sceneName?: string,
    targetPresentationValues?: SymbolPresentationValueMatrix,
  ): GridCellReelSpinPlan;
  update(deltaSeconds: number): RenderGridCellReelSetUpdateResult;
  requestVisibleSymbolStates(
    positions: readonly WinResultPosition[],
    state: SymbolStateId,
  ): void;
  getVisibleSymbolStateSnapshots(
    positions: readonly WinResultPosition[],
  ): readonly RenderVisibleSymbolStateSnapshot[];
  getVisibleSymbolGeometrySnapshots(
    positions: readonly WinResultPosition[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[];
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
    symbolRenderPriorities: config.symbolRenderPriorities,
    animationResolver: config.animationResolver,
    texturePolicy: {
      requiredStateTextures: GAME002_REQUIRED_STATE_TEXTURES,
    },
    valuePresentationResources: config.symbolValuePresentationResources,
  });
  assertConfiguredTexturedSymbolsAvailable(registry.getValidation(), config);
  const layout = createGame002ReelLayout(config.gridLayout);
  const layerLayout = createGame002ReelLayerLayout(
    layout,
    createGame002Layout({
      gridLayout: config.gridLayout,
      focusRegion: config.focusRegion,
    }),
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
    presentationValueResolver: createPresentationValueResolver({
      registry,
      resources: config.symbolValuePresentationResources,
      random: config.random,
    }),
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
    assertRenderableSceneCodes(scene, sceneName, gameConfig, config);
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
        presentationValues: createGridCellSnapshotMatrix(
          gridSnapshot.cells,
          (cell) => cell.presentationValue,
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
      presentationValues?: SymbolPresentationValueMatrix,
    ): readonly number[] {
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      reelSet.resetToScene(
        validScene,
        nextFinalYs,
        config.cellReelOffsets,
        presentationValues,
      );
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
        cellReelOffsets: config.cellReelOffsets,
        direction: config.direction,
        timing: config.timing,
        dimming: config.dimming,
      });
    },
    spinToScene(
      scene: SceneMatrix,
      sceneName = "game002.spinScene",
      targetPresentationValues?: SymbolPresentationValueMatrix,
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
        cellReelOffsets: config.cellReelOffsets,
        direction: config.direction,
        timing: config.timing,
        dimming: config.dimming,
      });
      finalYs = nextFinalYs;
      targetScene = validScene;
      reelSet.spin(plan, { targetPresentationValues });
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
    requestVisibleSymbolStates(
      positions: readonly WinResultPosition[],
      state: SymbolStateId,
    ): void {
      reelSet.requestVisibleSymbolStates(positions, state);
    },
    getVisibleSymbolStateSnapshots(
      positions: readonly WinResultPosition[],
    ): readonly RenderVisibleSymbolStateSnapshot[] {
      return reelSet.getVisibleSymbolStateSnapshots(positions);
    },
    getVisibleSymbolGeometrySnapshots(
      positions: readonly WinResultPosition[],
    ): readonly RenderVisibleSymbolGeometrySnapshot[] {
      return reelSet.getVisibleSymbolGeometrySnapshots(positions);
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
  config: Game002ReelConfig,
): void {
  const emptySymbols = new Set(config.emptySymbols);
  const texturedSymbols = new Set(config.texturedSymbols);
  for (const [x, column] of scene.entries()) {
    for (const [y, code] of column.entries()) {
      const entry = gameConfig.getPaytableEntry(code);
      if (!entry) {
        throw new Error(
          `${label}[${x}][${y}] symbol code ${code} does not exist in game002 paytable.`,
        );
      }
      if (emptySymbols.has(entry.symbol)) {
        continue;
      }
      if (!texturedSymbols.has(entry.symbol)) {
        throw new Error(
          `${label}[${x}][${y}] symbol code ${code} (${entry.symbol}) is missing assets for ${config.missingAssetLabel}.`,
        );
      }
    }
  }
}

function assertConfiguredTexturedSymbolsAvailable(
  validation: ReturnType<
    ReturnType<typeof createReelSymbolRegistry>["getValidation"]
  >,
  config: Game002ReelConfig,
): void {
  const available = new Set(validation.texturedSymbols);
  for (const symbol of config.texturedSymbols) {
    if (!available.has(symbol)) {
      throw new Error(
        `game002 ${config.missingAssetLabel} is missing assets for configured symbol "${symbol}".`,
      );
    }
  }
}

function createPresentationValueResolver(options: {
  readonly registry: ReelSymbolRegistry;
  readonly resources: SymbolValuePresentationResourceMap;
  readonly random: () => number;
}): (context: {
  readonly x: number;
  readonly y: number;
  readonly symbolY: number;
  readonly code: number;
}) => number | null {
  const valuesByOccurrence = new Map<string, number>();
  return ({ x, y, symbolY, code }) => {
    const symbol = options.registry.getEntryByCode(code).symbol;
    const resource = options.resources[symbol];
    if (!resource) return null;
    const key = `${x}:${y}:${symbolY}:${code}`;
    const existing = valuesByOccurrence.get(key);
    if (existing !== undefined) return existing;
    const random = options.random();
    if (!Number.isFinite(random) || random < 0 || random >= 1) {
      throw new Error("game002 CN presentation random must be in [0, 1).");
    }
    const value =
      resource.defaultValues[
        Math.min(
          resource.defaultValues.length - 1,
          Math.floor(random * resource.defaultValues.length),
        )
      ];
    if (value === undefined) {
      throw new Error(`Symbol "${symbol}" has no default presentation values.`);
    }
    valuesByOccurrence.set(key, value);
    return value;
  };
}
