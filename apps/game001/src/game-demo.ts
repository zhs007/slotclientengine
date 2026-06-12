import { Container } from "pixi.js";
import {
  createGameConfig,
  type LogicGameConfig,
  type SceneMatrix,
} from "@slotclientengine/logiccore";
import {
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
  type ReelLayout,
  type ReelSpinDirection,
  type ReelSpinPlan,
  type ReelSymbolScaleMap,
} from "@slotclientengine/rendercore/reel";
import {
  createDefaultSymbolAnimationResolver,
  createNamedSymbolAnimationResolver,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import {
  createGame001Layout,
  createMainReelsLayerLayout,
  type MainReelsLayerLayout,
} from "./game-layout.js";
import { GAME001_REQUIRED_STATE_TEXTURES } from "./assets.js";
import { validateGame001Scene } from "./scene.js";
import { GAME001_ANIMATION_PROFILES } from "./symbol-animation-config.js";
import {
  createGame001MainReelsView,
  type Game001MainReelsView,
  type Game001MainReelsViewUpdateResult,
  type Game001MainReelsVisualSnapshot,
} from "./main-reels-view.js";

export const GAME001_SYMBOL_SCALES = Object.freeze({
  SC: 1.75,
  RS: 1.75,
  X2: 1.75,
  X5: 1.75,
  X10: 1.75,
} satisfies ReelSymbolScaleMap);

export interface Game001ReelConfig {
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

export const DEFAULT_GAME001_REEL_CONFIG: Game001ReelConfig = Object.freeze({
  reelsName: "reels01",
  visibleRows: 5,
  emptySymbols: Object.freeze(["BN"]),
  symbolScales: GAME001_SYMBOL_SCALES,
  direction: "forward",
  minimumSpinCycles: 10,
  baseDurationMs: 1600,
  speedSymbolsPerSecond: 42,
  startDelayMs: 90,
  stopDelayMs: 180,
});

export interface Game001ReelRuntimeOptions {
  readonly rawGameConfig: unknown;
  readonly symbolAssets: SymbolAssetMap;
  readonly initialScene?: SceneMatrix;
  readonly config?: Game001ReelConfig;
}

export interface Game001ReelRuntime {
  readonly config: Game001ReelConfig;
  readonly gameConfig: LogicGameConfig;
  readonly layout: ReelLayout;
  readonly mainReelsLayer: Container;
  readonly mainReelsView: Game001MainReelsView;
  readonly layerLayout: MainReelsLayerLayout;
  getCurrentScene(): SceneMatrix | null;
  getTargetScene(): SceneMatrix | null;
  getFinalYs(): readonly number[] | null;
  getVisualSnapshot(): Game001MainReelsVisualSnapshot;
  applyScene(scene: SceneMatrix, sceneName?: string): readonly number[];
  createSpinPlan(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  spinToScene(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  update(deltaSeconds: number): Game001MainReelsViewUpdateResult;
  isSpinning(): boolean;
}

export function createGame001ReelRuntime(
  options: Game001ReelRuntimeOptions,
): Game001ReelRuntime {
  const config = options.config ?? DEFAULT_GAME001_REEL_CONFIG;
  const gameConfig = createGameConfig(options.rawGameConfig);
  const reels = gameConfig.getReels(config.reelsName);
  const registry = createReelSymbolRegistry({
    gameConfig,
    assets: options.symbolAssets,
    emptySymbols: config.emptySymbols,
    symbolScales: config.symbolScales,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: GAME001_ANIMATION_PROFILES,
      fallback: createDefaultSymbolAnimationResolver(),
    }),
    texturePolicy: {
      requiredStateTextures: GAME001_REQUIRED_STATE_TEXTURES,
    },
  });
  const cellSize = registry.getCellSize();
  const layout = createReelLayout({
    reelCount: reels.getReelCount(),
    visibleRows: config.visibleRows,
    cellWidth: cellSize.width,
    cellHeight: cellSize.height,
    columnGap: Math.max(8, Math.round(cellSize.width * 0.08)),
  });
  const layerLayout = createMainReelsLayerLayout(layout, createGame001Layout());
  const mainReelsView = createGame001MainReelsView({
    reels,
    layout,
    registry,
    layerLayout,
  });

  let finalYs: readonly number[] | null = null;

  const calculateFinalYs = (scene: SceneMatrix, sceneName: string) =>
    gameConfig.getStopYCoordinates({
      reelsName: config.reelsName,
      sceneName,
      scene,
    });

  const runtime: Game001ReelRuntime = Object.freeze({
    config,
    gameConfig,
    layout,
    mainReelsLayer: mainReelsView.root,
    mainReelsView,
    layerLayout,
    getCurrentScene(): SceneMatrix | null {
      return mainReelsView.getCurrentScene();
    },
    getTargetScene(): SceneMatrix | null {
      return mainReelsView.getTargetScene();
    },
    getFinalYs(): readonly number[] | null {
      return finalYs;
    },
    getVisualSnapshot(): Game001MainReelsVisualSnapshot {
      return mainReelsView.getVisualSnapshot();
    },
    applyScene(
      scene: SceneMatrix,
      sceneName = "game001.initialScene",
    ): readonly number[] {
      const validScene = validateGame001Scene(scene, sceneName);
      const nextFinalYs = calculateFinalYs(validScene, sceneName);
      mainReelsView.applyScene(validScene, nextFinalYs);
      finalYs = nextFinalYs;
      return nextFinalYs;
    },
    createSpinPlan(
      scene: SceneMatrix,
      sceneName = "game001.spinScene",
    ): ReelSpinPlan {
      const validScene = validateGame001Scene(scene, sceneName);
      const nextFinalYs = calculateFinalYs(validScene, sceneName);
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
      sceneName = "game001.spinScene",
    ): ReelSpinPlan {
      if (mainReelsView.isSpinning()) {
        throw new Error("game001 reels are already spinning.");
      }
      const validScene = validateGame001Scene(scene, sceneName);
      const nextFinalYs = calculateFinalYs(validScene, sceneName);
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
      mainReelsView.spinToScene(validScene, nextFinalYs, plan);
      return plan;
    },
    update(deltaSeconds: number): Game001MainReelsViewUpdateResult {
      return mainReelsView.update(deltaSeconds);
    },
    isSpinning(): boolean {
      return mainReelsView.isSpinning();
    },
  });

  if (options.initialScene) {
    runtime.applyScene(options.initialScene, "game001.initialScene");
  }

  return runtime;
}
