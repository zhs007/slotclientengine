import { createGameConfig, type SceneMatrix } from "@slotclientengine/logiccore";
import {
  RenderReelSet,
  createReelLayout,
  createReelSpinPlan,
  createReelSymbolRegistry,
  type ReelSpinPlan,
  type RenderReelSetUpdateResult
} from "@slotclientengine/rendercore/reel";
import {
  createDefaultSymbolAnimationResolver,
  createNamedSymbolAnimationResolver,
  type SymbolAssetMap
} from "@slotclientengine/rendercore";
import { getDefaultFinalYs, getDefaultGmiScene } from "./gmi.js";
import {
  DEFAULT_REELS_VIEWER_CONFIG,
  REELS_VIEWER_REQUIRED_STATE_TEXTURES,
  type ReelsViewerConfig
} from "./reels-config.js";
import { REELS_VIEWER_ANIMATION_PROFILES } from "./symbol-animation-config.js";

export interface ReelsDemoOptions {
  readonly rawGameConfig: unknown;
  readonly symbolAssets: SymbolAssetMap;
  readonly config?: ReelsViewerConfig;
  readonly scene?: SceneMatrix;
}

export interface ReelsDemo {
  readonly config: ReelsViewerConfig;
  readonly scene: SceneMatrix;
  readonly finalYs: readonly number[];
  readonly reelSet: RenderReelSet;
  createSpinPlan(): ReelSpinPlan;
  spin(): ReelSpinPlan;
  reset(): void;
  update(deltaSeconds: number): RenderReelSetUpdateResult;
  isSpinning(): boolean;
}

export function createReelsDemo(options: ReelsDemoOptions): ReelsDemo {
  const config = options.config ?? DEFAULT_REELS_VIEWER_CONFIG;
  const gameConfig = createGameConfig(options.rawGameConfig);
  const reels = gameConfig.getReels(config.reelsName);
  const scene = options.scene ?? getDefaultGmiScene();
  const finalYs = options.scene
    ? gameConfig.getStopYCoordinates({
        reelsName: config.reelsName,
        sceneName: "configured.scene",
        scene
      })
    : getDefaultFinalYs(gameConfig);
  const registry = createReelSymbolRegistry({
    gameConfig,
    assets: options.symbolAssets,
    emptySymbols: config.emptySymbols,
    symbolScales: config.symbolScales,
    animationResolver: createNamedSymbolAnimationResolver({
      profiles: REELS_VIEWER_ANIMATION_PROFILES,
      fallback: createDefaultSymbolAnimationResolver()
    }),
    texturePolicy: {
      requiredStateTextures: REELS_VIEWER_REQUIRED_STATE_TEXTURES
    }
  });
  const cellSize = registry.getCellSize();
  const layout = createReelLayout({
    reelCount: reels.getReelCount(),
    visibleRows: config.visibleRows,
    cellWidth: cellSize.width,
    cellHeight: cellSize.height,
    columnGap: Math.max(8, Math.round(cellSize.width * 0.08))
  });
  const reelSet = new RenderReelSet({
    reels,
    layout,
    registry
  });
  reelSet.resetToFinalYs(finalYs);

  let spinning = false;

  const createSpinPlanForConfig = () =>
    createReelSpinPlan({
      reels,
      finalYs,
      visibleRows: config.visibleRows,
      direction: config.direction,
      minimumSpinCycles: config.minimumSpinCycles,
      baseDurationMs: config.baseDurationMs,
      speedSymbolsPerSecond: config.speedSymbolsPerSecond,
      startDelayMs: config.startDelayMs,
      stopDelayMs: config.stopDelayMs
    });

  return Object.freeze({
    config,
    scene,
    finalYs,
    reelSet,
    createSpinPlan: createSpinPlanForConfig,
    spin(): ReelSpinPlan {
      if (spinning) {
        throw new Error("Reels demo is already spinning.");
      }
      const plan = createSpinPlanForConfig();
      reelSet.spin(plan);
      spinning = true;
      return plan;
    },
    reset(): void {
      spinning = false;
      reelSet.resetToFinalYs(finalYs);
    },
    update(deltaSeconds: number): RenderReelSetUpdateResult {
      const result = reelSet.update(deltaSeconds);
      if (result.completed) {
        spinning = false;
      }
      return result;
    },
    isSpinning(): boolean {
      return spinning;
    }
  });
}
