import { Container } from "pixi.js";
import type { AwardCelebrationPlayer } from "../popup/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import { createSceneLayoutPackageRuntime } from "./package-runtime.js";
import type {
  SceneLayoutGameModeSnapshot,
  SceneLayoutGameMode,
  SceneLayoutPackageResource,
  SceneLayoutSnapshot,
  SceneLayoutLayerId,
} from "./types.js";

export interface SceneLayoutPresentationSurface {
  readonly backgroundContainer: Container;
  readonly transitionContainer: Container;
  readonly popupContainer: Container;
  init(): Promise<void>;
  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot;
  /**
   * Keeps the surface in manifest art coordinates when a parent container
   * already owns the focus/viewport transform.
   */
  applyArtSpace(): void;
  update(deltaSeconds: number): void;
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
  prepareGameModeTransition(modeId: string): Promise<void>;
  requestGameMode(modeId: string): Promise<void>;
  getAwardCelebrationPlayer(id: string): AwardCelebrationPlayer;
  getLayer(id: SceneLayoutLayerId): Container;
  getNode(id: string): Container;
  destroy(): void;
}

export function createSceneLayoutPresentationSurface(options: {
  readonly resource: SceneLayoutPackageResource;
  readonly initialMode?: string;
  readonly formatPopupAmount?: import("../popup/index.js").PopupAmountFormatter;
}): SceneLayoutPresentationSurface {
  return new DefaultSceneLayoutPresentationSurface(options);
}

class DefaultSceneLayoutPresentationSurface implements SceneLayoutPresentationSurface {
  readonly #resource: SceneLayoutPackageResource;
  readonly #runtime;
  readonly #initialMode: SceneLayoutGameMode | null;
  readonly #backgroundContainer = new Container();
  readonly #transitionContainer = new Container();
  readonly #popupContainer = new Container();
  #initialized = false;
  #initializing = false;
  #destroyed = false;

  constructor(options: {
    readonly resource: SceneLayoutPackageResource;
    readonly initialMode?: string;
    readonly formatPopupAmount?: import("../popup/index.js").PopupAmountFormatter;
  }) {
    this.#resource = options.resource;
    this.#runtime = createSceneLayoutPackageRuntime({
      resource: options.resource,
      presentationOnly: true,
      formatPopupAmount: options.formatPopupAmount,
    });
    this.#initialMode = resolveInitialMode(
      options.resource,
      options.initialMode,
    );
    this.#backgroundContainer.label =
      "scene-layout-presentation-background-root";
    this.#transitionContainer.label =
      "scene-layout-presentation-transition-root";
    this.#popupContainer.label = "scene-layout-presentation-popup-root";
  }

  get backgroundContainer(): Container {
    return this.#backgroundContainer;
  }

  get transitionContainer(): Container {
    return this.#transitionContainer;
  }

  get popupContainer(): Container {
    return this.#popupContainer;
  }

  async init(): Promise<void> {
    this.assertAlive();
    if (this.#initialized || this.#initializing) {
      throw new SceneLayoutError(
        "Scene layout presentation surface can only initialize once.",
      );
    }
    this.#initializing = true;
    try {
      await this.#runtime.init();
      this.assertAlive();
      if (this.#initialMode) {
        const mode = this.#runtime.getGameModeSnapshot().stableMode;
        if (mode !== this.#initialMode.id)
          throw new SceneLayoutError(
            `Scene layout presentation initial mode "${this.#initialMode.id}" does not match manifest initial mode "${String(mode)}".`,
          );
      }
      this.#backgroundContainer.addChild(
        this.#runtime.getBackgroundPresentation(),
      );
      this.#transitionContainer.addChild(
        this.#runtime.getModeTransitionPresentation(),
      );
      this.#popupContainer.addChild(this.#runtime.getPopupPresentation());
      this.#initialized = true;
    } catch (error) {
      this.destroy();
      throw error;
    } finally {
      this.#initializing = false;
    }
  }

  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot {
    this.assertReady();
    const snapshot = this.#runtime.applyViewport(viewportSize);
    this.applyPopupPlacements(snapshot.variantId, viewportSize);
    return snapshot;
  }

  applyArtSpace(): void {
    this.assertReady();
    const adaptation = this.#resource.manifest.adaptation;
    if (adaptation.mode !== "maximized-focus") {
      throw new SceneLayoutError(
        "Scene layout art-space presentation requires maximized-focus adaptation.",
      );
    }
    const snapshot = this.#runtime.applyArtSpace();
    const artSize = snapshot.artSize;
    this.#backgroundContainer.position.set(0, 0);
    this.applyPopupPlacements(snapshot.variantId, artSize);
  }

  private applyPopupPlacements(
    variantId: SceneLayoutSnapshot["variantId"],
    viewportSize: RenderViewportSize,
  ): void {
    for (const id of Object.keys(this.#resource.popupPackages)) {
      const popup = this.#runtime.getAwardCelebrationPopup(id);
      const binding = this.#resource.manifest.popups?.[id];
      const placement = binding?.placements[variantId];
      if (!binding || !placement) {
        throw new SceneLayoutError(
          `Scene layout popup "${id}" has no ${variantId} placement.`,
        );
      }
      popup.container.position.set(
        viewportSize.width / 2 + placement.x,
        viewportSize.height / 2 + placement.y,
      );
      popup.container.scale.set(placement.scale);
    }
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    this.#runtime.update(deltaSeconds);
  }

  getGameModeSnapshot(): SceneLayoutGameModeSnapshot {
    this.assertReady();
    return this.#runtime.getGameModeSnapshot();
  }

  prepareGameModeTransition(modeId: string): Promise<void> {
    this.assertReady();
    return this.#runtime.prepareGameModeTransition(modeId);
  }

  requestGameMode(modeId: string): Promise<void> {
    this.assertReady();
    return this.#runtime.requestGameMode(modeId);
  }

  getAwardCelebrationPlayer(id: string): AwardCelebrationPlayer {
    this.assertReady();
    return this.#runtime.getAwardCelebrationPopup(id);
  }

  getLayer(id: SceneLayoutLayerId): Container {
    this.assertReady();
    switch (id) {
      case "layout":
        return this.#backgroundContainer;
      case "transition":
        return this.#transitionContainer;
      case "popup":
        return this.#popupContainer;
      case "reel":
        throw new SceneLayoutError(
          'Scene layout presentation surface layer "reel" is unavailable in presentation-only mode.',
        );
    }
  }

  getNode(id: string): Container {
    this.assertReady();
    return this.#runtime.getNode(id);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#backgroundContainer.destroy({ children: false });
    this.#transitionContainer.destroy({ children: false });
    this.#popupContainer.destroy({ children: false });
    this.#runtime.destroy();
  }

  private assertReady(): void {
    this.assertAlive();
    if (!this.#initialized) {
      throw new SceneLayoutError(
        "Scene layout presentation surface has not initialized.",
      );
    }
  }

  private assertAlive(): void {
    if (this.#destroyed) {
      throw new SceneLayoutError(
        "Scene layout presentation surface was destroyed.",
      );
    }
  }
}

function resolveInitialMode(
  resource: SceneLayoutPackageResource,
  requested: string | undefined,
): SceneLayoutGameMode | null {
  const gameModes = resource.manifest.gameModes;
  if (!gameModes) {
    if (requested !== undefined) {
      throw new SceneLayoutError(
        "Scene layout presentation requested an initial mode but the manifest has no gameModes.",
      );
    }
    return null;
  }
  const id = requested ?? gameModes.initialMode;
  const mode = gameModes.modes.find((candidate) => candidate.id === id);
  if (!mode) {
    throw new SceneLayoutError(
      `Scene layout presentation initial mode "${id}" is unavailable.`,
    );
  }
  return mode;
}
