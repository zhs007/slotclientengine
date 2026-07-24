import type { Container } from "pixi.js";
import {
  createSceneLayoutPresentationSurface,
  type SceneLayoutPackageResource,
  type SceneLayoutPresentationSurface,
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
  destroy(): void;
}

export function createGame002SceneLayoutPlayers(options: {
  readonly resource: SceneLayoutPackageResource;
  readonly initialMode: string;
  readonly awardCelebrationPopup: string;
}): {
  readonly backgroundPlayer: Game002BackgroundPlayer;
  readonly winAmountPlayer: WinAmountAnimationPlayer;
} {
  const surface = createSceneLayoutPresentationSurface({
    resource: options.resource,
    initialMode: options.initialMode,
  });
  return Object.freeze({
    backgroundPlayer: createBackgroundPlayer(surface),
    winAmountPlayer: createPopupAmountPlayer(
      surface,
      options.awardCelebrationPopup,
    ),
  });
}

function createBackgroundPlayer(
  surface: SceneLayoutPresentationSurface,
): Game002BackgroundPlayer {
  return Object.freeze({
    container: surface.backgroundContainer,
    async init(): Promise<void> {
      await surface.init();
      surface.applyArtSpace();
    },
    update(deltaSeconds: number): void {
      surface.update(deltaSeconds);
    },
    destroy(): void {
      surface.destroy();
    },
  });
}

function createPopupAmountPlayer(
  surface: SceneLayoutPresentationSurface,
  popupId: string,
): WinAmountAnimationPlayer {
  const getPlayer = () => surface.getAwardCelebrationPlayer(popupId);
  return Object.freeze({
    container: surface.popupContainer,
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
