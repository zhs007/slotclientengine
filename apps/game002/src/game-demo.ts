import { type Container } from "pixi.js";
import {
  createGameConfig,
  type LogicGameConfig,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import {
  RenderReelSet,
  createReelSpinPlan,
  createReelSymbolRegistry,
  type ReelLayout,
  type ReelSpinDirection,
  type ReelSpinPlan,
  type RenderReelSetUpdateResult,
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
  readonly visibleRows: number;
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly direction: ReelSpinDirection;
  readonly minimumSpinCycles: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
}

export const DEFAULT_GAME002_REEL_CONFIG: Game002ReelConfig = Object.freeze({
  reelsName: GAME002_REELS_NAME,
  visibleRows: GAME002_VISIBLE_ROWS,
  emptySymbols: GAME002_EMPTY_SYMBOLS,
  symbolScales: GAME002_SYMBOL_SCALES,
  direction: "forward",
  minimumSpinCycles: 8,
  baseDurationMs: 1700,
  speedSymbolsPerSecond: 56,
  startDelayMs: 80,
  stopDelayMs: 120,
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
  createSpinPlan(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  spinToScene(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  update(deltaSeconds: number): RenderReelSetUpdateResult;
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
  const reelSet = new RenderReelSet({
    reels,
    layout,
    registry,
  });
  reelSet.x = layerLayout.x;
  reelSet.y = layerLayout.y;
  reelSet.visible = false;

  let currentScene: SceneMatrix | null = null;
  let targetScene: SceneMatrix | null = null;
  let finalYs: readonly number[] | null = null;

  const resolveFinalYs = (
    scene: SceneMatrix,
    sceneName: string,
  ): readonly number[] =>
    gameConfig.getStopYCoordinates({
      reelsName: config.reelsName,
      sceneName,
      scene,
    });

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
      return Object.freeze({
        visible: reelSet.visible,
        spinning: reelSet.getSnapshot().spinning,
        visibleScene: validateGame002Scene(
          reelSet.getVisibleScene(),
          "game002 reel visual snapshot",
        ),
        requestedStates: Object.freeze(
          reelSet.reels.map((reel) =>
            Object.freeze(
              reel
                .getSlotSnapshots()
                .filter((slot) => slot.container.visible)
                .map((slot) => slot.requestedState),
            ),
          ),
        ),
        reelCount: reelSet.reels.length,
        layerX: reelSet.x,
        layerY: reelSet.y,
      });
    },
    applyScene(
      scene: SceneMatrix,
      sceneName = "game002.initialScene",
    ): readonly number[] {
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveFinalYs(validScene, sceneName);
      reelSet.resetToFinalYs(nextFinalYs);
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
    ): ReelSpinPlan {
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveFinalYs(validScene, sceneName);
      return createReelSpinPlan({
        reels,
        finalYs: nextFinalYs,
        visibleRows: config.visibleRows,
        direction: config.direction,
        minimumSpinCycles: config.minimumSpinCycles,
        baseDurationMs: config.baseDurationMs,
        speedSymbolsPerSecond: config.speedSymbolsPerSecond,
        startDelayMs: config.startDelayMs,
        stopDelayMs: config.stopDelayMs,
      });
    },
    spinToScene(
      scene: SceneMatrix,
      sceneName = "game002.spinScene",
    ): ReelSpinPlan {
      if (reelSet.getSnapshot().spinning) {
        throw new Error("game002 reels are already spinning.");
      }
      const validScene = validateGame002Scene(scene, sceneName);
      const nextFinalYs = resolveFinalYs(validScene, sceneName);
      const plan = createReelSpinPlan({
        reels,
        finalYs: nextFinalYs,
        visibleRows: config.visibleRows,
        direction: config.direction,
        minimumSpinCycles: config.minimumSpinCycles,
        baseDurationMs: config.baseDurationMs,
        speedSymbolsPerSecond: config.speedSymbolsPerSecond,
        startDelayMs: config.startDelayMs,
        stopDelayMs: config.stopDelayMs,
      });
      finalYs = nextFinalYs;
      targetScene = validScene;
      reelSet.spin(plan);
      reelSet.visible = currentScene !== null;
      return plan;
    },
    update(deltaSeconds: number): RenderReelSetUpdateResult {
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
