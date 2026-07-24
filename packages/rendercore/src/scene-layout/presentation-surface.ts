import { Container } from "pixi.js";
import {
  createAwardCelebrationPlayer,
  type AwardCelebrationPlayer,
} from "../popup/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import { createSceneLayoutRuntime } from "./runtime.js";
import type {
  SceneLayoutGameMode,
  SceneLayoutPackageResource,
  SceneLayoutSnapshot,
} from "./types.js";

export interface SceneLayoutPresentationSurface {
  readonly backgroundContainer: Container;
  readonly popupContainer: Container;
  init(): Promise<void>;
  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot;
  /**
   * Keeps the surface in manifest art coordinates when a parent container
   * already owns the focus/viewport transform.
   */
  applyArtSpace(): void;
  update(deltaSeconds: number): void;
  getAwardCelebrationPlayer(id: string): AwardCelebrationPlayer;
  destroy(): void;
}

export function createSceneLayoutPresentationSurface(options: {
  readonly resource: SceneLayoutPackageResource;
  readonly initialMode?: string;
}): SceneLayoutPresentationSurface {
  return new DefaultSceneLayoutPresentationSurface(options);
}

class DefaultSceneLayoutPresentationSurface implements SceneLayoutPresentationSurface {
  readonly #resource: SceneLayoutPackageResource;
  readonly #layout;
  readonly #initialMode: SceneLayoutGameMode | null;
  readonly #popups = new Map<string, AwardCelebrationPlayer>();
  readonly popupContainer = new Container();
  #initialized = false;
  #initializing = false;
  #destroyed = false;

  constructor(options: {
    readonly resource: SceneLayoutPackageResource;
    readonly initialMode?: string;
  }) {
    this.#resource = options.resource;
    this.#layout = createSceneLayoutRuntime({
      resource: options.resource.layout,
    });
    this.#initialMode = resolveInitialMode(
      options.resource,
      options.initialMode,
    );
    this.popupContainer.label = "scene-layout-presentation-popup-root";
  }

  get backgroundContainer(): Container {
    return this.#layout.container;
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
      await this.#layout.init();
      this.assertAlive();
      if (this.#initialMode) {
        const activeNodes = new Set(
          Object.values(this.#initialMode.backgroundNodes ?? {}),
        );
        for (const mode of this.#resource.manifest.gameModes?.modes ?? []) {
          for (const nodeId of Object.values(mode.backgroundNodes ?? {})) {
            this.#layout.setNodeActive(nodeId, activeNodes.has(nodeId));
          }
        }
      }
      for (const [id, resource] of Object.entries(
        this.#resource.popupPackages,
      )) {
        const popup = createAwardCelebrationPlayer({ resource });
        await popup.init();
        this.assertAlive();
        this.#popups.set(id, popup);
        this.popupContainer.addChild(popup.container);
      }
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
    const snapshot = this.#layout.applyViewport(viewportSize);
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
    const artSize = adaptation.artSize;
    const snapshot = this.#layout.applyViewport(artSize);
    this.#layout.container.position.set(0, 0);
    this.applyPopupPlacements(snapshot.variantId, artSize);
  }

  private applyPopupPlacements(
    variantId: SceneLayoutSnapshot["variantId"],
    viewportSize: RenderViewportSize,
  ): void {
    for (const [id, popup] of this.#popups) {
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
    this.#layout.update(deltaSeconds);
  }

  getAwardCelebrationPlayer(id: string): AwardCelebrationPlayer {
    this.assertReady();
    const popup = this.#popups.get(id);
    if (!popup) {
      throw new SceneLayoutError(
        `Scene layout award celebration popup "${id}" is unavailable.`,
      );
    }
    return popup;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const popup of this.#popups.values()) popup.destroy();
    this.#popups.clear();
    this.popupContainer.destroy({ children: false });
    this.#layout.destroy();
    void this.#resource.destroy();
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
