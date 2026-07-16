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
  createGridCellCascadeDropPlan,
  createGridCellCascadeDropdownPlan,
  createGridCellEffectController,
  createReelSymbolRegistry,
  type GridCellDimmingPattern,
  type GridCellOrderMode,
  type GridCellReelOffsetMatrix,
  type GridCellReelSpinPlan,
  type GridCellReelSpinTiming,
  type GridCellCascadeDropPlan,
  type GridCellCascadeScene,
  type GridCellCascadeValueMatrix,
  type GridCellCascadeMotionOptions,
  type GridCellEffectResourceMap,
  type GridCellEffectSweepPlan,
  type ParsedReelManifest,
  type ReelLayout,
  type ReelSymbolRegistry,
  type ReelSymbolAnimationCapabilityMap,
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
  SymbolStatePreset,
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
  GAME002_GRID_CELL_REEL_OFFSETS,
  GAME002_GRID_CELL_REEL_ORDER,
  GAME002_GRID_LAYOUT,
  GAME002_FOCUS_REGION,
  createGame002GridCellDimming,
  createGame002Layout,
  createGame002ReelLayerLayout,
  createGame002ReelLayout,
  type Game002FocusRegion,
  type Game002GridCellDimming,
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
  readonly symbolAnimationCapabilities: ReelSymbolAnimationCapabilityMap;
  readonly symbolStatePreset: SymbolStatePreset;
  readonly landingAppearSymbols: readonly string[];
  readonly animationResolver: SymbolAnimationResolver;
  readonly symbolValuePresentationResources: SymbolValuePresentationResourceMap;
  readonly random: () => number;
  readonly gridLayout: Game002GridLayout;
  readonly focusRegion: Game002FocusRegion;
  readonly cellReelOffsets: GridCellReelOffsetMatrix;
  readonly direction: ReelSpinDirection;
  readonly orderMode: GridCellOrderMode;
  readonly timing: GridCellReelSpinTiming;
  readonly reelManifest: ParsedReelManifest;
  readonly reelEffectResources: GridCellEffectResourceMap;
  readonly reelEffectPoolCapacities: Readonly<Record<string, number>>;
  readonly dimming: Game002GridCellDimming;
  readonly spinBounceStrength: number;
}

const GAME002_DEFAULT_SKIN = getGame002SkinConfig("1");

export const DEFAULT_GAME002_REEL_CONFIG: Game002ReelConfig = Object.freeze({
  reelsName: GAME002_REELS_NAME,
  emptySymbols: GAME002_EMPTY_SYMBOLS,
  texturedSymbols: GAME002_DEFAULT_SKIN.displaySymbols,
  missingAssetLabel: GAME002_DEFAULT_SKIN.label,
  symbolScales: GAME002_SYMBOL_SCALES,
  symbolRenderPriorities: GAME002_SYMBOL_RENDER_PRIORITIES,
  symbolAnimationCapabilities: GAME002_DEFAULT_SKIN.symbolAnimationCapabilities,
  symbolStatePreset: GAME002_DEFAULT_SKIN.symbolStatePreset,
  landingAppearSymbols: GAME002_DEFAULT_SKIN.landingAppearSymbols,
  animationResolver: GAME002_DEFAULT_SKIN.symbolAnimationResolver,
  symbolValuePresentationResources:
    GAME002_DEFAULT_SKIN.symbolValuePresentationResources,
  random: Math.random,
  gridLayout: GAME002_GRID_LAYOUT,
  focusRegion: GAME002_FOCUS_REGION,
  cellReelOffsets: GAME002_GRID_CELL_REEL_OFFSETS,
  direction: "forward",
  orderMode: GAME002_GRID_CELL_REEL_ORDER,
  timing: GAME002_DEFAULT_SKIN.reelManifest.spin.timing,
  reelManifest: GAME002_DEFAULT_SKIN.reelManifest,
  reelEffectResources: GAME002_DEFAULT_SKIN.reelEffectResources,
  reelEffectPoolCapacities: GAME002_DEFAULT_SKIN.reelEffectPoolCapacities,
  dimming: createGame002GridCellDimming(
    GAME002_DEFAULT_SKIN.reelManifest.spin.dimmingAlpha,
  ),
  spinBounceStrength: GAME002_DEFAULT_SKIN.reelManifest.spin.bounceStrength,
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
  readonly anticipation: Game002AnticipationSnapshot;
  readonly effects: ReturnType<RenderGridCellReelSet["getSnapshot"]>["effects"];
}

export interface Game002AnticipationSnapshot {
  readonly active: boolean;
  readonly landedTriggerCount: number;
  readonly activationCoordinate: Readonly<{ x: number; y: number }> | null;
}

export interface Game002ReelRuntime {
  readonly config: Game002ReelConfig;
  readonly gameConfig: LogicGameConfig;
  readonly layout: ReelLayout;
  readonly mainReelsLayer: Container;
  readonly layerLayout: Game002ReelLayerLayout;
  prepare(): Promise<void> | void;
  resetPresentationState(): void;
  destroy(): void;
  isAnticipationActive(): boolean;
  getAnticipationSnapshot(): Game002AnticipationSnapshot;
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
  hasVisibleSymbolStateCapability(
    x: number,
    y: number,
    state: SymbolStateId,
  ): boolean;
  releaseVisibleSymbols(positions: readonly WinResultPosition[]): void;
  setVisibleSymbolDimming(
    highlightedPositions: readonly WinResultPosition[],
    dimmingAlpha: number,
  ): void;
  clearVisibleSymbolDimming(): void;
  getCascadeValues(): GridCellCascadeValueMatrix;
  createCascadeDropPlan(options: {
    readonly sourceScene: GridCellCascadeScene;
    readonly sourceValues: GridCellCascadeValueMatrix;
    readonly settledScene: GridCellCascadeScene;
    readonly settledValues: GridCellCascadeValueMatrix;
    readonly targetScene: GridCellCascadeScene;
    readonly targetValues: GridCellCascadeValueMatrix;
    readonly refillPositions: readonly WinResultPosition[];
    readonly canDropOccurrence: NonNullable<
      Parameters<typeof createGridCellCascadeDropPlan>[0]["canDropOccurrence"]
    >;
    readonly motion: GridCellCascadeMotionOptions;
  }): GridCellCascadeDropPlan;
  createCascadeDropdownPlan(options: {
    readonly sourceScene: GridCellCascadeScene;
    readonly sourceValues: GridCellCascadeValueMatrix;
    readonly settledScene: GridCellCascadeScene;
    readonly settledValues: GridCellCascadeValueMatrix;
    readonly targetScene: GridCellCascadeScene;
    readonly targetValues: GridCellCascadeValueMatrix;
    readonly refillPositions: readonly WinResultPosition[];
    readonly canDropOccurrence: NonNullable<
      Parameters<typeof createGridCellCascadeDropPlan>[0]["canDropOccurrence"]
    >;
    readonly motion: GridCellCascadeMotionOptions;
  }): GridCellCascadeDropPlan;
  startCascadeDrop(plan: GridCellCascadeDropPlan): void;
  startRefillEffectSweep(positions: readonly WinResultPosition[]): void;
  startSelectiveRefillSpin(options: {
    readonly dropdownScene: GridCellCascadeScene;
    readonly dropdownValues: GridCellCascadeValueMatrix;
    readonly targetScene: SceneMatrix;
    readonly targetValues: SymbolPresentationValueMatrix;
    readonly refillPositions: readonly WinResultPosition[];
    readonly sceneName?: string;
  }): GridCellReelSpinPlan;
  isSpinning(): boolean;
}

export function createGame002ReelRuntime(
  options: Game002ReelRuntimeOptions,
): Game002ReelRuntime {
  const config = options.config ?? DEFAULT_GAME002_REEL_CONFIG;
  const gameConfig = createGameConfig(options.rawGameConfig);
  const reels = gameConfig.getReels(config.reelsName);
  const spinDimming = Object.freeze({
    resolveDimmingAlpha: (code: number) => {
      const entry = gameConfig.getPaytableEntry(code);
      if (!entry) {
        throw new Error(
          `game002 spin dimming symbol code ${code} is missing from the paytable.`,
        );
      }
      return config.dimming.resolveSymbolDimmingAlpha(entry.symbol);
    },
    fadeInMs: config.dimming.fadeInMs,
    fadeOutMs: config.dimming.fadeOutMs,
  }) satisfies GridCellDimmingPattern;
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
    symbolAnimationCapabilities: config.symbolAnimationCapabilities,
    statePreset: config.symbolStatePreset,
    landingAppearSymbols: config.landingAppearSymbols,
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
  const effectController = createGridCellEffectController({
    resources: config.reelEffectResources,
    capacities: config.reelEffectPoolCapacities,
    columns: GAME002_REEL_COUNT,
    rows: GAME002_VISIBLE_ROWS,
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
  });
  const reelSet = new RenderGridCellReelSet({
    reels,
    registry,
    columns: GAME002_REEL_COUNT,
    rows: GAME002_VISIBLE_ROWS,
    cellWidth: layout.cellWidth,
    cellHeight: layout.cellHeight,
    order,
    effectController,
    bounceStrength: config.spinBounceStrength,
    presentationValueResolver: createPresentationValueResolver({
      registry,
      resources: config.symbolValuePresentationResources,
      random: config.random,
    }),
  });
  reelSet.x = layerLayout.x;
  reelSet.y = layerLayout.y;
  reelSet.visible = false;
  const effectPreparation = reelSet.prepareEffects();

  let currentScene: SceneMatrix | null = null;
  let targetScene: SceneMatrix | null = null;
  let finalYs: readonly number[] | null = null;
  let activeTargetKind: "initial-spin" | "dropdown" | "refill-spin" | null =
    null;
  let anticipationActive = false;
  let landedTriggerCount = 0;
  let activationCoordinate: Readonly<{ x: number; y: number }> | null = null;

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

  const createEffectPlanSpec = (effectId: "normal" | "anticipation") => {
    const resource = config.reelEffectResources[effectId];
    if (!resource) {
      throw new Error(`game002 reel effect resource "${effectId}" is missing.`);
    }
    return Object.freeze({
      effectId,
      durationMs: resource.durationSeconds * 1000,
      loopCount: resource.loopCount,
      finishBeforeStopMs: resource.finishBeforeStopMs,
    });
  };

  const findInitialActivationGate = (
    scene: SceneMatrix,
  ): Readonly<{ x: number; y: number }> | null => {
    let matched = 0;
    for (const cell of order) {
      const entry = gameConfig.getPaytableEntry(scene[cell.x][cell.y]);
      if (!entry) {
        throw new Error(
          `game002 anticipation target (${cell.x},${cell.y}) is missing from the paytable.`,
        );
      }
      if (entry.symbol !== "WL") continue;
      matched += 1;
      if (
        matched === config.reelManifest.spin.anticipation.triggerLandedCount
      ) {
        return Object.freeze({ x: cell.x, y: cell.y });
      }
    }
    return null;
  };

  const createInitialSpinPlan = (
    validScene: SceneMatrix,
    nextFinalYs: readonly number[],
  ): GridCellReelSpinPlan => {
    const activationGate = findInitialActivationGate(validScene);
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
      dimming: spinDimming,
      effects: {
        normal: createEffectPlanSpec("normal"),
        ...(activationGate
          ? {
              activated: createEffectPlanSpec("anticipation"),
              activationGate,
              firstFollowingStopDelayMs:
                config.reelManifest.spin.anticipation.firstFollowingStopDelayMs,
              activatedStopStepMs:
                config.reelManifest.spin.anticipation.stopStepMs,
            }
          : {}),
      },
    });
  };

  const runtime: Game002ReelRuntime = Object.freeze({
    config,
    gameConfig,
    layout,
    mainReelsLayer: reelSet,
    layerLayout,
    prepare(): Promise<void> | void {
      return effectPreparation;
    },
    resetPresentationState(): void {
      reelSet.cancelPresentationEffects();
      anticipationActive = false;
      landedTriggerCount = 0;
      activationCoordinate = null;
    },
    destroy(): void {
      reelSet.destroy({ children: true });
    },
    isAnticipationActive(): boolean {
      return anticipationActive;
    },
    getAnticipationSnapshot(): Game002AnticipationSnapshot {
      return Object.freeze({
        active: anticipationActive,
        landedTriggerCount,
        activationCoordinate,
      });
    },
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
        visibleScene: gridSnapshot.visibleScene,
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
        anticipation: runtime.getAnticipationSnapshot(),
        effects: gridSnapshot.effects,
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
      activeTargetKind = null;
      anticipationActive = false;
      landedTriggerCount = 0;
      activationCoordinate = null;
      return nextFinalYs;
    },
    createSpinPlan(
      scene: SceneMatrix,
      sceneName = "game002.spinScene",
    ): GridCellReelSpinPlan {
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      return createInitialSpinPlan(validScene, nextFinalYs);
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
      const plan = createInitialSpinPlan(validScene, nextFinalYs);
      reelSet.spin(plan, { targetPresentationValues });
      finalYs = nextFinalYs;
      targetScene = validScene;
      anticipationActive = false;
      landedTriggerCount = 0;
      activationCoordinate = null;
      activeTargetKind = "initial-spin";
      reelSet.visible = true;
      return plan;
    },
    update(deltaSeconds: number): RenderGridCellReelSetUpdateResult {
      const result = reelSet.update(deltaSeconds);
      if (activeTargetKind === "initial-spin") {
        const activationKeys = new Set(
          result.activationCells.map((cell) => `${cell.x}:${cell.y}`),
        );
        for (const cell of result.landedCells) {
          const code = targetScene?.[cell.x]?.[cell.y];
          const visibleCode = reelSet.getVisibleScene()[cell.x]?.[cell.y];
          if (code === undefined || visibleCode !== code) {
            throw new Error(
              `game002 landed cell (${cell.x},${cell.y}) does not match its validated target code.`,
            );
          }
          const symbol = gameConfig.getPaytableEntry(code)?.symbol;
          if (!symbol) {
            throw new Error(
              `game002 landed cell (${cell.x},${cell.y}) is missing from the paytable.`,
            );
          }
          if (symbol !== "WL") continue;
          landedTriggerCount += 1;
          if (
            landedTriggerCount ===
            config.reelManifest.spin.anticipation.triggerLandedCount
          ) {
            const key = `${cell.x}:${cell.y}`;
            if (!activationKeys.has(key)) {
              throw new Error(
                "game002 second landed WL did not match the presentation activation gate.",
              );
            }
            anticipationActive = true;
            activationCoordinate = Object.freeze({ x: cell.x, y: cell.y });
          }
        }
        for (const activation of result.activationCells) {
          if (
            !anticipationActive ||
            activationCoordinate?.x !== activation.x ||
            activationCoordinate.y !== activation.y
          ) {
            throw new Error(
              "game002 presentation activation edge did not match the second landed WL.",
            );
          }
        }
      }
      if (result.completed && targetScene) {
        const visibleScene = reelSet.getVisibleScene();
        if (
          activeTargetKind === "initial-spin" ||
          activeTargetKind === "refill-spin"
        ) {
          const fullScene = validateGame002Scene(
            visibleScene,
            "completed game002 reels",
          );
          assertScenesEqual(fullScene, targetScene, "completed game002 reels");
        } else if (!sceneEquals(visibleScene, targetScene)) {
          throw new Error(
            "completed game002 cascade scene does not match target.",
          );
        }
        currentScene = targetScene;
        targetScene = null;
        activeTargetKind = null;
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
    hasVisibleSymbolStateCapability(
      x: number,
      y: number,
      state: SymbolStateId,
    ): boolean {
      return reelSet.hasVisibleSymbolStateCapability(x, y, state);
    },
    releaseVisibleSymbols(positions: readonly WinResultPosition[]): void {
      reelSet.releaseVisibleSymbols(positions);
      currentScene = reelSet.getVisibleScene();
    },
    setVisibleSymbolDimming(
      highlightedPositions: readonly WinResultPosition[],
      dimmingAlpha: number,
    ): void {
      reelSet.setVisibleSymbolDimming(highlightedPositions, dimmingAlpha);
    },
    clearVisibleSymbolDimming(): void {
      reelSet.clearVisibleSymbolDimming();
    },
    getCascadeValues(): GridCellCascadeValueMatrix {
      return reelSet.getCascadeValues();
    },
    createCascadeDropPlan(dropOptions: {
      readonly sourceScene: GridCellCascadeScene;
      readonly sourceValues: GridCellCascadeValueMatrix;
      readonly settledScene: GridCellCascadeScene;
      readonly settledValues: GridCellCascadeValueMatrix;
      readonly targetScene: GridCellCascadeScene;
      readonly targetValues: GridCellCascadeValueMatrix;
      readonly refillPositions: readonly WinResultPosition[];
      readonly canDropOccurrence: NonNullable<
        Parameters<typeof createGridCellCascadeDropPlan>[0]["canDropOccurrence"]
      >;
      readonly motion: GridCellCascadeMotionOptions;
    }): GridCellCascadeDropPlan {
      return createGridCellCascadeDropPlan({
        ...dropOptions,
        cellHeight: layout.cellHeight,
      });
    },
    createCascadeDropdownPlan(dropOptions: {
      readonly sourceScene: GridCellCascadeScene;
      readonly sourceValues: GridCellCascadeValueMatrix;
      readonly settledScene: GridCellCascadeScene;
      readonly settledValues: GridCellCascadeValueMatrix;
      readonly targetScene: GridCellCascadeScene;
      readonly targetValues: GridCellCascadeValueMatrix;
      readonly refillPositions: readonly WinResultPosition[];
      readonly canDropOccurrence: NonNullable<
        Parameters<typeof createGridCellCascadeDropPlan>[0]["canDropOccurrence"]
      >;
      readonly motion: GridCellCascadeMotionOptions;
    }): GridCellCascadeDropPlan {
      return createGridCellCascadeDropdownPlan({
        ...dropOptions,
        cellHeight: layout.cellHeight,
      });
    },
    startCascadeDrop(plan: GridCellCascadeDropPlan): void {
      if (targetScene)
        throw new Error("game002 runtime already has a target scene.");
      targetScene = plan.targetScene;
      activeTargetKind = "dropdown";
      reelSet.startCascadeDrop(plan);
      if (plan.totalSeconds === 0) {
        currentScene = plan.targetScene;
        targetScene = null;
        activeTargetKind = null;
      }
    },
    startRefillEffectSweep(positions: readonly WinResultPosition[]): void {
      if (!anticipationActive) {
        throw new Error(
          "game002 refill effect sweep requires active anticipation.",
        );
      }
      const sweep = config.reelManifest.cascade.anticipationRefill.sweep;
      const sorted = sortRefillPositions(
        positions,
        sweep.order,
        GAME002_REEL_COUNT,
        GAME002_VISIBLE_ROWS,
      );
      const plan = Object.freeze({
        effectId: sweep.effect,
        loopCount: sweep.loopCount,
        startStepMs: sweep.startStepMs,
        positions: sorted,
      }) satisfies GridCellEffectSweepPlan;
      reelSet.startEffectSweep(plan);
    },
    startSelectiveRefillSpin(refillOptions: {
      readonly dropdownScene: GridCellCascadeScene;
      readonly dropdownValues: GridCellCascadeValueMatrix;
      readonly targetScene: SceneMatrix;
      readonly targetValues: SymbolPresentationValueMatrix;
      readonly refillPositions: readonly WinResultPosition[];
      readonly sceneName?: string;
    }): GridCellReelSpinPlan {
      if (!anticipationActive) {
        throw new Error(
          "game002 selective refill spin requires active anticipation.",
        );
      }
      assertCascadeMatrixEqual(
        reelSet.getVisibleScene(),
        refillOptions.dropdownScene,
        "game002 selective refill source scene",
      );
      assertCascadeMatrixEqual(
        reelSet.getCascadeValues(),
        refillOptions.dropdownValues,
        "game002 selective refill source values",
      );
      const sceneName =
        refillOptions.sceneName ?? "game002 selective refill scene";
      const validScene = validateGame002Scene(
        refillOptions.targetScene,
        sceneName,
      );
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      const spinConfig = config.reelManifest.cascade.anticipationRefill.spin;
      const positions = sortRefillPositions(
        refillOptions.refillPositions,
        spinConfig.order,
        GAME002_REEL_COUNT,
        GAME002_VISIBLE_ROWS,
      );
      assertPositionsMatchHoles(
        refillOptions.dropdownScene,
        positions,
        "game002 selective refill positions",
      );
      const plan = createGridCellReelSpinPlan({
        reels,
        finalYs: nextFinalYs,
        targetScene: validScene,
        columns: GAME002_REEL_COUNT,
        rows: GAME002_VISIBLE_ROWS,
        order,
        positions,
        cellReelOffsets: config.cellReelOffsets,
        direction: config.direction,
        timing: spinConfig,
        dimming: spinDimming,
        effects: { normal: createEffectPlanSpec("anticipation") },
      });
      reelSet.spin(plan, {
        targetPresentationValues: refillOptions.targetValues,
      });
      finalYs = nextFinalYs;
      targetScene = validScene;
      activeTargetKind = "refill-spin";
      reelSet.visible = true;
      return plan;
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

function sortRefillPositions(
  positions: readonly WinResultPosition[],
  order: "left-right-bottom-up" | "left-right-top-down",
  columns: number,
  rows: number,
): readonly WinResultPosition[] {
  if (!Array.isArray(positions) || positions.length === 0) {
    throw new Error("game002 refill positions must not be empty.");
  }
  const seen = new Set<string>();
  const parsed = positions.map((position, index) => {
    if (
      !Number.isSafeInteger(position.x) ||
      position.x < 0 ||
      position.x >= columns ||
      !Number.isSafeInteger(position.y) ||
      position.y < 0 ||
      position.y >= rows
    ) {
      throw new Error(`game002 refill position[${index}] is out of range.`);
    }
    const key = `${position.x}:${position.y}`;
    if (seen.has(key)) {
      throw new Error(`game002 refill position (${key}) is duplicated.`);
    }
    seen.add(key);
    return Object.freeze({ x: position.x, y: position.y });
  });
  return Object.freeze(
    [...parsed].sort((left, right) => {
      const rowDifference =
        order === "left-right-bottom-up" ? right.y - left.y : left.y - right.y;
      return rowDifference || left.x - right.x;
    }),
  );
}

function assertPositionsMatchHoles(
  scene: GridCellCascadeScene,
  positions: readonly WinResultPosition[],
  label: string,
): void {
  const keys = new Set(positions.map(({ x, y }) => `${x}:${y}`));
  for (const [x, column] of scene.entries()) {
    for (const [y, code] of column.entries()) {
      if ((code === -1) !== keys.has(`${x}:${y}`)) {
        throw new Error(`${label} must match dropdown holes exactly.`);
      }
    }
  }
}

function assertCascadeMatrixEqual(
  actual: readonly (readonly (number | null)[])[],
  expected: readonly (readonly (number | null)[])[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some(
      (column, x) =>
        column.length !== expected[x]?.length ||
        column.some((value, y) => value !== expected[x]?.[y]),
    )
  ) {
    throw new Error(`${label} does not match the validated cascade stage.`);
  }
}
