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
  type RenderVisibleSymbolGeometrySnapshot,
  type RenderVisibleSymbolStateSnapshot,
  type RenderReelSetUpdateResult,
} from "@slotclientengine/rendercore/reel";
import type {
  ReelSymbolScaleMap,
  SymbolAnimationResolver,
  SymbolAssetMap,
} from "@slotclientengine/rendercore";
import { GAME003_REQUIRED_STATE_TEXTURES } from "./assets.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import {
  GAME003_REEL_COUNT,
  GAME003_REELS_NAME,
  GAME003_VISIBLE_ROWS,
  createGame003Layout,
  createGame003ReelLayerLayout,
  createGame003ReelLayout,
  type Game003ReelLayerLayout,
} from "./game-layout.js";
import { GAME003_SYMBOL_SCALES } from "./symbol-animation-config.js";
import { getGame003SkinConfig } from "./skin-config.js";
import {
  assertScenesEqual,
  sceneEquals,
  validateGame003Scene,
} from "./scene.js";

export interface Game003ReelConfig {
  readonly kind: "normal";
  readonly reelsName: string;
  readonly emptySymbols: readonly string[];
  readonly texturedSymbols: readonly string[];
  readonly missingAssetLabel: string;
  readonly symbolScales: ReelSymbolScaleMap;
  readonly animationResolver: SymbolAnimationResolver;
  readonly direction: ReelSpinDirection;
  readonly minimumSpinCycles: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
}

const GAME003_DEFAULT_SKIN_CONFIG = getGame003SkinConfig("1");
const GAME003_STATIC_REEL_CONFIG = getGame003StaticNormalReelConfig();

export const DEFAULT_GAME003_REEL_CONFIG: Game003ReelConfig = Object.freeze({
  kind: "normal",
  reelsName: GAME003_STATIC_REEL_CONFIG.reelsName,
  emptySymbols: GAME003_DEFAULT_SKIN_CONFIG.emptySymbols,
  texturedSymbols: GAME003_DEFAULT_SKIN_CONFIG.displaySymbols,
  missingAssetLabel: GAME003_DEFAULT_SKIN_CONFIG.label,
  symbolScales: GAME003_SYMBOL_SCALES,
  animationResolver: GAME003_DEFAULT_SKIN_CONFIG.symbolAnimationResolver,
  direction: GAME003_STATIC_REEL_CONFIG.direction,
  minimumSpinCycles: GAME003_STATIC_REEL_CONFIG.minimumSpinCycles,
  baseDurationMs: GAME003_STATIC_REEL_CONFIG.baseDurationMs,
  speedSymbolsPerSecond: GAME003_STATIC_REEL_CONFIG.speedSymbolsPerSecond,
  startDelayMs: GAME003_STATIC_REEL_CONFIG.startDelayMs,
  stopDelayMs: GAME003_STATIC_REEL_CONFIG.stopDelayMs,
});

export interface Game003ReelRuntimeOptions {
  readonly rawGameConfig: unknown;
  readonly symbolAssets: SymbolAssetMap;
  readonly initialScene?: SceneMatrix;
  readonly config?: Game003ReelConfig;
}

export interface Game003ReelVisualSnapshot {
  readonly visible: boolean;
  readonly spinning: boolean;
  readonly visibleScene: SceneMatrix;
  readonly requestedStates: readonly (readonly (string | null)[])[];
  readonly reelCount: number;
  readonly layerX: number;
  readonly layerY: number;
}

export interface Game003ReelRuntime {
  readonly config: Game003ReelConfig;
  readonly gameConfig: LogicGameConfig;
  readonly layout: ReelLayout;
  readonly mainReelsLayer: Container;
  readonly layerLayout: Game003ReelLayerLayout;
  getCurrentScene(): SceneMatrix | null;
  getTargetScene(): SceneMatrix | null;
  getFinalYs(): readonly number[] | null;
  getVisualSnapshot(): Game003ReelVisualSnapshot;
  applyScene(scene: SceneMatrix, sceneName?: string): readonly number[];
  createSpinPlan(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  spinToScene(scene: SceneMatrix, sceneName?: string): ReelSpinPlan;
  update(deltaSeconds: number): RenderReelSetUpdateResult;
  isSpinning(): boolean;
  requestVisibleSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: string,
  ): void;
  getVisibleSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolStateSnapshot[];
  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[];
  applyLayout(layout: Game003ReelLayerLayout): void;
}

export function createGame003ReelRuntime(
  options: Game003ReelRuntimeOptions,
): Game003ReelRuntime {
  const config = options.config ?? DEFAULT_GAME003_REEL_CONFIG;
  if (config.kind !== "normal") {
    throw new Error("game003 first release only supports normal reels.");
  }
  const gameConfig = createGameConfig(options.rawGameConfig);
  const reels = gameConfig.getReels(config.reelsName);
  if (reels.getReelCount() !== GAME003_REEL_COUNT) {
    throw new Error(
      `game003 reels "${config.reelsName}" must contain 5 reels.`,
    );
  }

  const registry = createReelSymbolRegistry({
    gameConfig,
    assets: options.symbolAssets,
    emptySymbols: config.emptySymbols,
    symbolScales: config.symbolScales,
    animationResolver: config.animationResolver,
    texturePolicy: {
      requiredStateTextures: GAME003_REQUIRED_STATE_TEXTURES,
    },
  });
  assertConfiguredTexturedSymbolsAvailable(registry.getValidation(), config);
  const layout = createGame003ReelLayout();
  let layerLayout = createGame003ReelLayerLayout(layout, createGame003Layout());
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

  const runtime: Game003ReelRuntime = Object.freeze({
    config,
    gameConfig,
    layout,
    mainReelsLayer: reelSet,
    get layerLayout(): Game003ReelLayerLayout {
      return layerLayout;
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
    getVisualSnapshot(): Game003ReelVisualSnapshot {
      const snapshot = reelSet.getSnapshot();
      return Object.freeze({
        visible: reelSet.visible,
        spinning: snapshot.spinning,
        visibleScene: validateGame003Scene(
          snapshot.visibleScene,
          "game003 reel visual snapshot",
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
        reelCount: GAME003_REEL_COUNT,
        layerX: reelSet.x,
        layerY: reelSet.y,
      });
    },
    applyScene(
      scene: SceneMatrix,
      sceneName = "game003.initialScene",
    ): readonly number[] {
      const validScene = validateGame003Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      reelSet.resetToVisibleScene(validScene, nextFinalYs);
      const visibleScene = validateGame003Scene(
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
      sceneName = "game003.spinScene",
    ): ReelSpinPlan {
      const validScene = validateGame003Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      return createReelSpinPlan({
        reels,
        finalYs: nextFinalYs,
        visibleRows: GAME003_VISIBLE_ROWS,
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
      sceneName = "game003.spinScene",
    ): ReelSpinPlan {
      if (reelSet.getSnapshot().spinning) {
        throw new Error("game003 reels are already spinning.");
      }
      const validScene = validateGame003Scene(scene, sceneName);
      const nextFinalYs = resolveSceneFinalYs(validScene, sceneName);
      const plan = createReelSpinPlan({
        reels,
        finalYs: nextFinalYs,
        visibleRows: GAME003_VISIBLE_ROWS,
        direction: config.direction,
        minimumSpinCycles: config.minimumSpinCycles,
        baseDurationMs: config.baseDurationMs,
        speedSymbolsPerSecond: config.speedSymbolsPerSecond,
        startDelayMs: config.startDelayMs,
        stopDelayMs: config.stopDelayMs,
      });
      finalYs = nextFinalYs;
      targetScene = validScene;
      reelSet.spin(plan, { targetVisibleScene: validScene });
      reelSet.visible = true;
      return plan;
    },
    update(deltaSeconds: number): RenderReelSetUpdateResult {
      const result = reelSet.update(deltaSeconds);
      if (result.completed && targetScene) {
        const visibleScene = validateGame003Scene(
          reelSet.getVisibleScene(),
          "completed game003 reels",
        );
        assertScenesEqual(visibleScene, targetScene, "completed game003 reels");
        currentScene = targetScene;
        targetScene = null;
        reelSet.visible = true;
      }
      return result;
    },
    isSpinning(): boolean {
      return reelSet.getSnapshot().spinning;
    },
    requestVisibleSymbolStates(
      positions: readonly { readonly x: number; readonly y: number }[],
      state: string,
    ): void {
      reelSet.requestVisibleSymbolStates(positions, state);
    },
    getVisibleSymbolStateSnapshots(
      positions: readonly { readonly x: number; readonly y: number }[],
    ): readonly RenderVisibleSymbolStateSnapshot[] {
      return reelSet.getVisibleSymbolStateSnapshots(positions);
    },
    getVisibleSymbolGeometrySnapshots(
      positions: readonly { readonly x: number; readonly y: number }[],
    ): readonly RenderVisibleSymbolGeometrySnapshot[] {
      return reelSet.getVisibleSymbolGeometrySnapshots(positions);
    },
    applyLayout(nextLayerLayout: Game003ReelLayerLayout): void {
      layerLayout = nextLayerLayout;
      reelSet.x = nextLayerLayout.x;
      reelSet.y = nextLayerLayout.y;
    },
  });

  if (options.initialScene) {
    runtime.applyScene(options.initialScene, "game003.initialScene");
  }

  return runtime;
}

export function assertGame003ReelVisualMatchesTarget(
  snapshot: Game003ReelVisualSnapshot,
  targetScene: SceneMatrix,
  label: string,
): void {
  const validTargetScene = validateGame003Scene(targetScene, label);
  if (!snapshot.visible) {
    throw new Error(`${label} reel layer must be visible.`);
  }
  if (!sceneEquals(snapshot.visibleScene, validTargetScene)) {
    throw new Error(`${label} visible scene does not match target scene.`);
  }
}

function getGame003StaticNormalReelConfig() {
  const reel = GAME003_STATIC_CONFIG.reel;
  if (reel.kind !== "normal") {
    throw new Error("game003 first release only supports normal reels.");
  }
  return reel;
}

function assertRenderableSceneCodes(
  scene: SceneMatrix,
  label: string,
  gameConfig: LogicGameConfig,
  config: Game003ReelConfig,
): void {
  const emptySymbols = new Set(config.emptySymbols);
  const texturedSymbols = new Set(config.texturedSymbols);
  for (const [x, column] of scene.entries()) {
    for (const [y, code] of column.entries()) {
      const entry = gameConfig.getPaytableEntry(code);
      if (!entry) {
        throw new Error(
          `${label}[${x}][${y}] symbol code ${code} does not exist in game003 paytable.`,
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
  config: Game003ReelConfig,
): void {
  const available = new Set(validation.texturedSymbols);
  for (const symbol of config.texturedSymbols) {
    if (!available.has(symbol)) {
      throw new Error(
        `game003 ${config.missingAssetLabel} is missing assets for configured symbol "${symbol}".`,
      );
    }
  }
}
