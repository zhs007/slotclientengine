import {
  createGameConfig,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import {
  createReelLayout,
  createReelSpinPlan,
  createSceneLayoutPackageRuntime,
  type RenderReelSetUpdateResult,
  type SceneLayoutPackageRuntime,
  type RenderVisibleSymbolGeometrySnapshot,
  type RenderVisibleSymbolStateSnapshot,
  type RenderViewportSize,
} from "@slotclientengine/rendercore";
import type {
  WinAmountAnimationInput,
  WinAmountAnimationLayout,
  WinAmountAnimationPhase,
  WinAmountAnimationPlayer,
  WinAmountAnimationUpdateResult,
} from "@slotclientengine/rendercore/win-amount";
import type {
  Game003ReelLayerLayout,
  Game003ReelRuntime,
  Game003ReelVisualSnapshot,
} from "./game-demo.js";
import { formatServerAmount } from "./money.js";
import { GAME003_RUNTIME_CONFIG } from "./runtime-config.js";
import { validateGame003Scene } from "./scene.js";
import type { Game003SkinConfig } from "./skin-config.js";

export interface Game003SceneLayoutPresentation {
  readonly reelRuntime: Game003ReelRuntime;
  readonly packageRuntime: SceneLayoutPackageRuntime;
  readonly winAmountPlayer: WinAmountAnimationPlayer;
  applyViewport(size: {
    readonly width: number;
    readonly height: number;
  }): void;
  destroy(): void;
}

export async function createGame003SceneLayoutPresentation(
  skin: Game003SkinConfig,
): Promise<Game003SceneLayoutPresentation> {
  const geometry = skin.resource.manifest.reels.main;
  if (!geometry || geometry.columns !== 5 || geometry.rows !== 5) {
    throw new Error("game003 minecart2 reels.main geometry must be 5x5.");
  }
  const gameConfig = createGameConfig(skin.rawGameConfig);
  const reels = gameConfig.getReels(skin.reelsName);
  const initialPhaseYs = Object.freeze(
    Array.from({ length: geometry.columns }, () => 0),
  );
  const initialScene = Object.freeze(
    initialPhaseYs.map((phaseY, x) =>
      Object.freeze(
        Array.from({ length: geometry.rows }, (_, y) =>
          reels.get(x, phaseY + y),
        ),
      ),
    ),
  );
  const packageRuntime = createSceneLayoutPackageRuntime({
    resource: skin.resource,
    reelPresentation: {
      kind: "standard",
      version: 1,
      direction: GAME003_RUNTIME_CONFIG.reel.direction,
      speedSymbolsPerSecond: GAME003_RUNTIME_CONFIG.reel.speedSymbolsPerSecond,
      minimumSpinCycles: GAME003_RUNTIME_CONFIG.reel.minimumSpinCycles,
      baseDurationMs: GAME003_RUNTIME_CONFIG.reel.baseDurationMs,
      startDelayMs: GAME003_RUNTIME_CONFIG.reel.startDelayMs,
      stopDelayMs: GAME003_RUNTIME_CONFIG.reel.stopDelayMs,
      bounceStrength: 0,
    },
    formatPopupAmount: formatServerAmount,
  });
  await packageRuntime.init({
    reels: {
      main: {
        scene: initialScene,
        localPhaseYs: initialPhaseYs,
      },
    },
  });

  let currentScene: SceneMatrix | null = initialScene;
  let targetScene: SceneMatrix | null = null;
  let finalYs: readonly number[] | null = initialPhaseYs;
  const layout = createReelLayout({
    reelCount: geometry.columns,
    visibleRows: geometry.rows,
    cellWidth: geometry.cellSize.width,
    cellHeight: geometry.cellSize.height,
    columnGap: geometry.gap.x,
    rowGap: geometry.gap.y,
    bufferRowsBefore: 1,
    bufferRowsAfter: 1,
  });
  let layerLayout = createEmptyLayerLayout(
    layout.reelCount * layout.cellWidth +
      (layout.reelCount - 1) * layout.columnGap,
    layout.visibleRows * layout.cellHeight +
      (layout.visibleRows - 1) * layout.rowGap,
  );

  const resolveFinalYs = (scene: SceneMatrix): readonly number[] =>
    Object.freeze(
      scene.map((column, x) => {
        const candidates = reels.findStopYCandidates(x, column);
        if (candidates.length > 0) return candidates[0];
        return reels.normalizeY(x, finalYs?.[x] ?? 0);
      }),
    );
  const createSpinPlan = (scene: SceneMatrix) => {
    const nextFinalYs = resolveFinalYs(scene);
    return createReelSpinPlan({
      reels,
      finalYs: nextFinalYs,
      visibleRows: geometry.rows,
      direction: GAME003_RUNTIME_CONFIG.reel.direction,
      minimumSpinCycles: GAME003_RUNTIME_CONFIG.reel.minimumSpinCycles,
      baseDurationMs: GAME003_RUNTIME_CONFIG.reel.baseDurationMs,
      speedSymbolsPerSecond: GAME003_RUNTIME_CONFIG.reel.speedSymbolsPerSecond,
      startDelayMs: GAME003_RUNTIME_CONFIG.reel.startDelayMs,
      stopDelayMs: GAME003_RUNTIME_CONFIG.reel.stopDelayMs,
    });
  };

  const reelRuntime: Game003ReelRuntime = Object.freeze({
    config: Object.freeze({
      ...GAME003_RUNTIME_CONFIG.reel,
      reelsName: skin.reelsName,
      emptySymbols: Object.freeze([]),
      texturedSymbols: skin.symbolPackage.displaySymbols,
      missingAssetLabel: skin.label,
      symbolScales: skin.symbolPackage.symbolScales,
      symbolRenderPriorities: skin.symbolPackage.symbolRenderPriorities,
      animationResolver: skin.symbolPackage.animationResolver,
    }),
    gameConfig,
    layout,
    mainReelsLayer: packageRuntime.getReelPresentation("main"),
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
      const scene = validateGame003Scene(
        packageRuntime.getMainReelSceneSnapshot(),
        "game003 minecart2 reel visual snapshot",
      );
      return Object.freeze({
        visible: true,
        spinning: packageRuntime.isMainReelSpinning(),
        visibleScene: scene,
        requestedStates: Object.freeze(
          scene.map((column, x) =>
            Object.freeze(
              packageRuntime
                .getMainReelSymbolStateSnapshots(
                  column.map((_, y) => ({ x, y })),
                )
                .map((snapshot) => snapshot.requestedState),
            ),
          ),
        ),
        reelCount: geometry.columns,
        layerX: 0,
        layerY: 0,
      });
    },
    applyScene(scene: SceneMatrix): readonly number[] {
      const validScene = validateGame003Scene(scene, "game003 minecart2 scene");
      const nextFinalYs = resolveFinalYs(validScene);
      packageRuntime.resetReelScene("main", {
        scene: validScene,
        localPhaseYs: nextFinalYs,
      });
      currentScene = validScene;
      targetScene = null;
      finalYs = nextFinalYs;
      return nextFinalYs;
    },
    createSpinPlan(scene: SceneMatrix) {
      const validScene = validateGame003Scene(
        scene,
        "game003 minecart2 spin scene",
      );
      return createSpinPlan(validScene);
    },
    spinToScene(scene: SceneMatrix) {
      const validScene = validateGame003Scene(
        scene,
        "game003 minecart2 spin scene",
      );
      const nextFinalYs = resolveFinalYs(validScene);
      const plan = createSpinPlan(validScene);
      packageRuntime.spinMainReelToScene({
        scene: validScene,
        localPhaseYs: nextFinalYs,
        random: Math.random,
      });
      finalYs = nextFinalYs;
      targetScene = validScene;
      return plan;
    },
    update(deltaSeconds: number): RenderReelSetUpdateResult {
      const wasSpinning = packageRuntime.isMainReelSpinning();
      packageRuntime.update(deltaSeconds);
      const spinning = packageRuntime.isMainReelSpinning();
      if (wasSpinning && !spinning && targetScene) {
        currentScene = targetScene;
        targetScene = null;
      }
      return Object.freeze({
        completed: wasSpinning && !spinning,
        spinning,
        startedAxes: Object.freeze(
          !wasSpinning && spinning ? [0, 1, 2, 3, 4] : [],
        ),
        stoppedAxes: Object.freeze(
          wasSpinning && !spinning ? [0, 1, 2, 3, 4] : [],
        ),
      });
    },
    isSpinning(): boolean {
      return packageRuntime.isMainReelSpinning();
    },
    requestVisibleSymbolStates(
      positions: readonly { readonly x: number; readonly y: number }[],
      state: string,
    ): void {
      packageRuntime.requestMainReelSymbolStates(positions, state);
    },
    getVisibleSymbolStateSnapshots(
      positions: readonly { readonly x: number; readonly y: number }[],
    ): readonly RenderVisibleSymbolStateSnapshot[] {
      return packageRuntime.getMainReelSymbolStateSnapshots(positions);
    },
    getVisibleSymbolGeometrySnapshots(
      positions: readonly { readonly x: number; readonly y: number }[],
    ): readonly RenderVisibleSymbolGeometrySnapshot[] {
      return packageRuntime.getMainReelSymbolGeometrySnapshots(positions);
    },
    applyLayout(nextLayerLayout: Game003ReelLayerLayout): void {
      layerLayout = nextLayerLayout;
    },
  });

  const winAmountPlayer = createSceneLayoutWinAmountPlayer(
    packageRuntime,
    skin.awardCelebrationPopup,
  );
  return Object.freeze({
    reelRuntime,
    packageRuntime,
    winAmountPlayer,
    applyViewport(size: RenderViewportSize): void {
      packageRuntime.applyViewport(size);
    },
    destroy(): void {
      packageRuntime.destroy();
    },
  });
}

function createSceneLayoutWinAmountPlayer(
  runtime: SceneLayoutPackageRuntime,
  popupId: string,
): WinAmountAnimationPlayer {
  const getPlayer = () => runtime.getAwardCelebrationPopup(popupId);
  return Object.freeze({
    container: getPlayer().container,
    start(input: WinAmountAnimationInput): void {
      getPlayer().start(input);
    },
    update(_deltaSeconds: number): WinAmountAnimationUpdateResult {
      const snapshot = getPlayer().getSnapshot();
      return Object.freeze({
        completed: snapshot.phase === "complete",
        phase: toWinAmountPhase(snapshot.phase),
        displayedAmountRaw: snapshot.displayedAmountRaw,
        ...(snapshot.activeTierId
          ? { activeTierId: snapshot.activeTierId }
          : {}),
      });
    },
    requestAdvance(): void {
      getPlayer().requestAdvance();
    },
    requestDismiss(): void {
      getPlayer().requestDismiss();
    },
    dismissImmediately(): void {
      getPlayer().dismissImmediately();
    },
    applyLayout(_layout: WinAmountAnimationLayout): void {},
    isPlaying(): boolean {
      return getPlayer().isPlaying();
    },
    destroy(): void {},
  });
}

function toWinAmountPhase(
  phase: "idle" | "counting" | "awaiting-dismiss" | "dismissing" | "complete",
): WinAmountAnimationPhase {
  if (phase === "counting") return "tier-counting";
  return phase;
}

function createEmptyLayerLayout(
  width: number,
  height: number,
): Game003ReelLayerLayout {
  const rect = Object.freeze({ x: 0, y: 0, width, height });
  return Object.freeze({
    rawReelsContentWidth: width,
    rawReelsContentHeight: height,
    x: 0,
    y: 0,
    stageVisibleFrame: rect,
    viewportVisibleFrame: rect,
  });
}
