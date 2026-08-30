import { Container } from "pixi.js";
import type {
  AwardCelebrationRuntime,
  PopupInteractionDispatchResult,
  SpinePopupRuntime,
  SingleStatePopupRuntime,
} from "../popup/core/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import { upgradeSceneLayoutManifestToLatest } from "./manifest-v3.js";
import { createSceneLayoutPackageRuntime } from "./package-runtime.js";
import type {
  SceneLayoutGameModeSnapshot,
  SceneLayoutGameMode,
  SceneLayoutGameModeRequestOptions,
  SceneLayoutPackageResource,
  SceneLayoutPopupCloseOptions,
  SceneLayoutPopupInputBindingOptions,
  SceneLayoutPopupOpenRequest,
  SceneLayoutPopupSession,
  SceneLayoutSnapshot,
  SceneLayoutLayerId,
  SceneLayoutNodeRenderLayerPlacement,
  SceneLayoutPoint,
  SceneLayoutPointSelector,
  SceneLayoutRenderLayerRef,
  SceneLayoutRenderObject,
} from "./types.js";
import type { RenderAnchor, RenderObjectLayer } from "../presentation/index.js";

export type SceneLayoutPresentationGameModeRequestOptions = Pick<
  SceneLayoutGameModeRequestOptions,
  "immediate" | "preludePopupStrings"
>;

export interface SceneLayoutPresentationSurface {
  readonly backgroundContainer: Container;
  readonly transitionContainer: Container;
  readonly popupContainer: Container;
  init(): Promise<void>;
  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot;
  update(deltaSeconds: number): void;
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
  prepareGameModeTransition(modeId: string): Promise<void>;
  requestGameMode(
    modeId: string,
    options?: SceneLayoutPresentationGameModeRequestOptions,
  ): Promise<void>;
  startPendingGameModeVideo(): Promise<void>;
  bindPopupInput(options: SceneLayoutPopupInputBindingOptions): () => void;
  requestPrimaryPopupInteraction(): PopupInteractionDispatchResult;
  openPopup(request: SceneLayoutPopupOpenRequest): SceneLayoutPopupSession;
  enqueuePopup(request: SceneLayoutPopupOpenRequest): SceneLayoutPopupSession;
  closePopup(options?: SceneLayoutPopupCloseOptions): Promise<void>;
  getActivePopupAddress():
    | import("./data/runtime-address.js").GameLayoutRuntimeAddress
    | null;
  getAwardCelebrationRuntime(id: string): AwardCelebrationRuntime;
  getSpinePopupRuntime(id: string): SpinePopupRuntime;
  getSingleStatePopupRuntime(id: string): SingleStatePopupRuntime;
  getLayer(id: SceneLayoutLayerId): Container;
  getNode(id: string): Container;
  getRenderLayer(ref: SceneLayoutRenderLayerRef): RenderObjectLayer;
  getNodeRenderLayer(
    nodeId: string,
    placement?: SceneLayoutNodeRenderLayerPlacement,
  ): RenderObjectLayer;
  getNodeAnchor(id: string): RenderAnchor;
  getRenderObject(nodeId: string): SceneLayoutRenderObject | null;
  getLayoutPoint(selector: SceneLayoutPointSelector): SceneLayoutPoint;
  getLayoutAnchor(point: SceneLayoutPoint): RenderAnchor;
  resolveLayoutAnchor(anchor: RenderAnchor): SceneLayoutPoint;
  destroy(): void;
}

export function createSceneLayoutPresentationSurface(options: {
  readonly resource: SceneLayoutPackageResource;
  readonly initialMode?: string;
  readonly formatPopupAmount?: import("../popup/data/types.js").PopupAmountFormatter;
}): SceneLayoutPresentationSurface {
  return new DefaultSceneLayoutPresentationSurface(options);
}

class DefaultSceneLayoutPresentationSurface implements SceneLayoutPresentationSurface {
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
    readonly formatPopupAmount?: import("../popup/data/types.js").PopupAmountFormatter;
  }) {
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
        const mode = this.#runtime.getStableGameMode();
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
    return this.#runtime.applyViewport(viewportSize);
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

  requestGameMode(
    modeId: string,
    options: SceneLayoutPresentationGameModeRequestOptions = {},
  ): Promise<void> {
    this.assertReady();
    return this.#runtime.requestGameMode(modeId, options);
  }

  startPendingGameModeVideo(): Promise<void> {
    this.assertReady();
    return this.#runtime.startPendingGameModeVideo();
  }

  bindPopupInput(options: SceneLayoutPopupInputBindingOptions): () => void {
    this.assertReady();
    return this.#runtime.bindPopupInput(options);
  }

  requestPrimaryPopupInteraction(): PopupInteractionDispatchResult {
    this.assertReady();
    return this.#runtime.requestPrimaryPopupInteraction();
  }

  openPopup(request: SceneLayoutPopupOpenRequest): SceneLayoutPopupSession {
    this.assertReady();
    return this.#runtime.openPopup(request);
  }

  enqueuePopup(request: SceneLayoutPopupOpenRequest): SceneLayoutPopupSession {
    this.assertReady();
    return this.#runtime.enqueuePopup(request);
  }

  closePopup(options?: SceneLayoutPopupCloseOptions): Promise<void> {
    this.assertReady();
    return this.#runtime.closePopup(options);
  }

  getActivePopupAddress():
    | import("./data/runtime-address.js").GameLayoutRuntimeAddress
    | null {
    this.assertReady();
    return this.#runtime.getActivePopupAddress();
  }

  getAwardCelebrationRuntime(id: string): AwardCelebrationRuntime {
    this.assertReady();
    return this.#runtime.getAwardCelebrationPopup(id);
  }

  getSpinePopupRuntime(id: string): SpinePopupRuntime {
    this.assertReady();
    return this.#runtime.getSpinePopup(id);
  }

  getSingleStatePopupRuntime(id: string): SingleStatePopupRuntime {
    this.assertReady();
    return this.#runtime.getSingleStatePopup(id);
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

  getRenderLayer(ref: SceneLayoutRenderLayerRef): RenderObjectLayer {
    this.assertReady();
    return this.#runtime.getRenderLayer(ref);
  }

  getNodeRenderLayer(
    nodeId: string,
    placement: SceneLayoutNodeRenderLayerPlacement = "child",
  ): RenderObjectLayer {
    this.assertReady();
    return this.#runtime.getNodeRenderLayer(nodeId, placement);
  }

  getNodeAnchor(id: string): RenderAnchor {
    this.assertReady();
    return this.#runtime.getNodeAnchor(id);
  }

  getRenderObject(nodeId: string): SceneLayoutRenderObject | null {
    this.assertReady();
    return this.#runtime.getRenderObject(nodeId);
  }

  getLayoutPoint(selector: SceneLayoutPointSelector): SceneLayoutPoint {
    this.assertReady();
    return this.#runtime.getLayoutPoint(selector);
  }

  getLayoutAnchor(point: SceneLayoutPoint): RenderAnchor {
    this.assertReady();
    return this.#runtime.getLayoutAnchor(point);
  }

  resolveLayoutAnchor(anchor: RenderAnchor): SceneLayoutPoint {
    this.assertReady();
    return this.#runtime.resolveLayoutAnchor(anchor);
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
  const gameModes = (
    resource.runtimeManifest ??
    (resource.manifest.version
      ? upgradeSceneLayoutManifestToLatest(resource.manifest)
      : (resource.manifest as never))
  ).gameModes;
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
