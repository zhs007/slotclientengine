import type { Container } from "pixi.js";
import {
  createSceneLayoutPackageRuntime,
  RenderGridCellReelSet,
  type PopupInteractionDispatchResult,
  type SceneLayoutPackageResource,
  type SceneLayoutPackageRuntime,
  type SceneLayoutPopupInputBindingOptions,
} from "@slotclientengine/rendercore";
import type {
  WinAmountAnimationInput,
  WinAmountAnimationLayout,
  WinAmountAnimationPhase,
  WinAmountAnimationPlayer,
  WinAmountAnimationUpdateResult,
} from "@slotclientengine/rendercore/win-amount";

export interface Game002BackgroundPlayer {
  readonly container: Container;
  init(): Promise<void>;
  update(deltaSeconds: number): void;
  getMode?(): string;
  prepareModeTransition?(modeId: string): Promise<void>;
  requestMode?(modeId: string): Promise<void>;
  acknowledgeReelSceneCommit(): void;
  attachReelOverlay(overlay: Container): () => void;
  bindPopupInput(options: SceneLayoutPopupInputBindingOptions): () => void;
  requestPrimaryPopupInteraction(): PopupInteractionDispatchResult;
  destroy(): void;
}

export function createGame002SceneRuntime(options: {
  readonly resource: SceneLayoutPackageResource;
  readonly initialMode: string;
  readonly awardCelebrationPopup: string;
  readonly reel: RenderGridCellReelSet;
}): {
  readonly backgroundPlayer: Game002BackgroundPlayer;
  readonly winAmountPlayer: WinAmountAnimationPlayer;
} {
  const runtime = createSceneLayoutPackageRuntime({
    resource: options.resource,
    createGridCellReel: () => options.reel,
    hostUpdatesMainReel: true,
  });
  return Object.freeze({
    backgroundPlayer: createBackgroundPlayer(runtime, options.initialMode),
    winAmountPlayer: createPopupAmountPlayer(
      runtime,
      options.awardCelebrationPopup,
    ),
  });
}

function createBackgroundPlayer(
  runtime: SceneLayoutPackageRuntime,
  initialMode: string,
): Game002BackgroundPlayer {
  return Object.freeze({
    container: runtime.container,
    async init(): Promise<void> {
      await runtime.init();
      runtime.applyArtSpace();
      if (runtime.getGameModeSnapshot().stableMode !== initialMode)
        throw new Error(
          `game002 initial mode "${initialMode}" does not match Scene Layout.`,
        );
    },
    update(deltaSeconds: number): void {
      runtime.update(deltaSeconds);
    },
    getMode(): string {
      return runtime.getGameModeSnapshot().stableMode;
    },
    prepareModeTransition(modeId: string): Promise<void> {
      return runtime.prepareGameModeTransition(modeId);
    },
    requestMode(modeId: string): Promise<void> {
      return runtime.requestGameMode(modeId);
    },
    acknowledgeReelSceneCommit(): void {
      runtime.acknowledgeMainReelSceneCommit();
    },
    attachReelOverlay(overlay: Container): () => void {
      return runtime.attachMainReelOverlay(overlay);
    },
    bindPopupInput(options: SceneLayoutPopupInputBindingOptions): () => void {
      return runtime.bindPopupInput(options);
    },
    requestPrimaryPopupInteraction(): PopupInteractionDispatchResult {
      return runtime.requestPrimaryPopupInteraction();
    },
    destroy(): void {
      runtime.destroy();
    },
  });
}

function createPopupAmountPlayer(
  runtime: SceneLayoutPackageRuntime,
  popupId: string,
): WinAmountAnimationPlayer {
  const getPlayer = () => runtime.getAwardCelebrationPopup(popupId);
  return Object.freeze({
    container: runtime.container,
    start(input: WinAmountAnimationInput): void {
      getPlayer().start(input);
    },
    update(deltaSeconds: number): WinAmountAnimationUpdateResult {
      const snapshot = getPlayer().update(deltaSeconds);
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
    applyLayout(_layout: WinAmountAnimationLayout): void {
      // Placement is manifest-owned and applied by the shared scene-layout surface.
    },
    isPlaying(): boolean {
      return getPlayer().isPlaying();
    },
    destroy(): void {
      // The background player owns and destroys the shared surface.
    },
  });
}

function toWinAmountPhase(
  phase: "idle" | "counting" | "awaiting-dismiss" | "dismissing" | "complete",
): WinAmountAnimationPhase {
  if (phase === "counting") return "tier-counting";
  return phase;
}
