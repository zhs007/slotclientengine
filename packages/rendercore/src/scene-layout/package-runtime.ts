import type { LogicReels } from "@slotclientengine/logiccore";
import {
  createAudioRuntime,
  createPixiSoundBackend,
  type AudioBackend,
  type AudioPlaybackHandle,
  type AudioRuntime,
} from "@slotclientengine/audiocore/core";
import { Container, Graphics, Rectangle } from "pixi.js";
import { createContainerRenderAnchor } from "../presentation/render-anchor.js";
import {
  createRenderObjectLayer,
  type RenderObjectLayer,
  type RenderObjectLayerController,
} from "../presentation/render-object-layer.js";
import {
  bindPopupInteractionInput,
  createAwardCelebrationRuntime,
  createSingleStatePopupRuntime,
  createSpinePopupRuntime,
  handledPopupInteraction,
  unhandledPopupInteraction,
  type AwardCelebrationRuntime,
  type PopupInteractionDispatchResult,
  type PopupStringNodeHandle,
  type SingleStatePopupRuntime,
  type SpinePopupRuntime,
} from "../popup/core/index.js";
import type { AwardCelebrationSnapshot } from "../popup/core/types.js";
import { inspectAwardCelebrationRuntime } from "../popup/award-player.js";
import {
  RenderGridCellReelSet,
  RenderReelSet,
  createGridCellOrder,
  createGridCellReelSpinPlan,
  createReelLayout,
  createReelSpinPlan,
  createShuffledGridCellReelOffsetMatrix,
  createShuffledGridCellReelPhaseMatrix,
  type SymbolPresentationValueMatrix,
} from "../reel/index.js";
import {
  createSymbolPackageReelRegistryFromCatalog,
  type SymbolCatalogModel,
  type SymbolPackageResource,
} from "../symbol/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import { SceneLayoutError } from "./errors.js";
import {
  assertSceneLayoutGeometryCompatible,
  parseSceneLayoutManifest,
  parseSceneLayoutManifestDocument,
} from "./manifest.js";
import { materializeSceneLayoutManifestForMode } from "./manifest-v2.js";
import { upgradeSceneLayoutManifestToLatest } from "./manifest-v3.js";
import { transitionResourceKey } from "./resource.js";
import { createPreparedSceneLayoutRuntime } from "./runtime.js";
import {
  createSceneLayoutTransitionVideoPlayer,
  type SceneLayoutTransitionVideoPlayer,
} from "./video-transition-player.js";
import type {
  AttachChildOptions,
  AttachRelativeOptions,
  ResolvedSceneLayoutReelGrid,
  SceneLayoutGameMode,
  SceneLayoutGameModeV2,
  SceneLayoutGameModeTransition,
  SceneLayoutGameModeRequestOptions,
  SceneLayoutGameModeSnapshot,
  SceneLayoutInitialReelScene,
  SceneLayoutGridCellSpinPlanStage,
  SceneLayoutMainReelContinuousSpinInput,
  SceneLayoutMainReelSpinInput,
  SceneLayoutNodeStateSnapshot,
  SceneLayoutNodeRenderLayerPlacement,
  SceneLayoutPackageResource,
  SceneLayoutPackageRuntime,
  SceneLayoutPopupStringInput,
  SceneLayoutPopupInputBindingOptions,
  SceneLayoutLayerId,
  SceneLayoutPoint,
  SceneLayoutPointSelector,
  SceneLayoutRenderLayerRef,
  SceneLayoutRenderObject,
  SceneLayoutSnapshot,
  SceneLayoutManifest,
  SceneLayoutManifestV1,
  SceneLayoutSymbolPackageBinding,
} from "./types.js";
import type { SlotReelPresentationProfileV1 } from "./template-presentation.js";
import { createSceneLayoutOccurrenceEffectPlayerFactory } from "./occurrence-effect-player.js";
import {
  createSceneLayoutRenderObjectFactory,
  type SceneLayoutRenderObjectFactory,
  type SceneLayoutRenderObjectFactoryDependencies,
} from "./render-object-factory.js";
import { resolveSceneLayoutRenderLayerRef } from "./render-layer-ref.js";
import {
  createGameLayoutRuntimeAddresses,
  type GameLayoutRuntimeAddressController,
  type GameLayoutRuntimeAddresses,
} from "./core/runtime-address.js";
import { formatGameLayoutRuntimeAddress } from "./data/runtime-address.js";

type ReelPresentation = RenderReelSet | RenderGridCellReelSet;

interface ResolvedSymbolBinding {
  readonly id: string;
  readonly binding: SceneLayoutSymbolPackageBinding;
  readonly resource: SymbolPackageResource;
}

interface ReelEntry extends ResolvedSymbolBinding {
  readonly reel: ReelPresentation;
  readonly catalog: SymbolCatalogModel;
  sceneCommitted: boolean;
}

type PreparedModeTarget = ReelEntry;

interface PreparedModeTransitionBase {
  spec: SceneLayoutGameModeTransition;
  geometry: SceneLayoutManifestV1 | null;
  readonly source: SceneLayoutGameMode;
  readonly target: SceneLayoutGameMode;
  readonly prepared: PreparedModeTarget | null;
  readonly bindingChanged: boolean;
  readonly targetSymbolPackageId: string | null;
  readonly optionsSignature: string;
}

type PreparedModeTransition =
  | (PreparedModeTransitionBase & {
      readonly kind: "none";
    })
  | (PreparedModeTransitionBase & {
      readonly kind: "spine";
      readonly player: RendercoreSpinePlayer;
    })
  | (PreparedModeTransitionBase & {
      readonly kind: "video";
      readonly player: SceneLayoutTransitionVideoPlayer;
    });

interface ActiveModeTransitionBase extends PreparedModeTransitionBase {
  switched: boolean;
  readonly resolve: () => void;
  readonly reject: (error: SceneLayoutError) => void;
}

interface PackagePresentationDelayWaiter {
  remainingMs: number;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
}

interface ActiveAwardCelebrationWaiter {
  readonly popupId: string;
  readonly resolve: () => void;
  readonly reject: (error: SceneLayoutError) => void;
}

type ActiveModeTransition =
  | (ActiveModeTransitionBase & {
      readonly kind: "spine";
      readonly player: RendercoreSpinePlayer;
      switchEventCount: number;
    })
  | (ActiveModeTransitionBase & {
      readonly kind: "video";
      readonly player: SceneLayoutTransitionVideoPlayer;
    });

interface ActiveModePrelude {
  readonly prepared: PreparedModeTransition;
  readonly popupId: string;
  readonly restorePopupStrings: () => void;
  phase: "popup" | "awaiting-video-start";
  readonly resolve: () => void;
  readonly reject: (error: SceneLayoutError) => void;
}

const activeAwardSnapshotReaders = new WeakMap<
  SceneLayoutPackageRuntime,
  () => AwardCelebrationSnapshot | null
>();
const gameModeSnapshotReaders = new WeakMap<
  SceneLayoutPackageRuntime,
  () => SceneLayoutGameModeSnapshot
>();

export function createSceneLayoutPackageRuntime(options: {
  readonly resource: SceneLayoutPackageResource;
  /**
   * Keeps mode/background/transition/popup ownership in this runtime while
   * allowing a host to retain its existing business reel.
   */
  readonly presentationOnly?: boolean;
  readonly reelPresentation?: SlotReelPresentationProfileV1;
  readonly areaSpinFunction?: import("../reel/index.js").AreaSpinFunction;
  readonly symbolValueTextBindings?: import("../symbol/index.js").SymbolValueTextBindingMap;
  readonly gridCellPresentation?: {
    readonly createEffectController?: () => import("../reel/index.js").GridCellEffectController;
    readonly presentationValueResolver?: import("../reel/index.js").GridCellSymbolPresentationValueResolver;
  };
  /** Typed factory for a business-configured grid-cell reel transferred to package ownership. */
  readonly createGridCellReel?: () => RenderGridCellReelSet;
  /** The host advances an injected main reel and drains its update result. */
  readonly hostUpdatesMainReel?: boolean;
  readonly formatPopupAmount?: import("../popup/data/types.js").PopupAmountFormatter;
  readonly createTransitionPlayer?: (options: {
    readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
  }) => RendercoreSpinePlayer;
  readonly createSpinePopupRuntime?: (options: {
    readonly resource: SceneLayoutPackageResource["popupPackages"][string];
  }) => SpinePopupRuntime;
  readonly createVideoTransitionPlayer?: (options: {
    readonly url: string;
    readonly fadeOutSeconds: number;
  }) => SceneLayoutTransitionVideoPlayer;
  /** @internal Deterministic audio adapter seam used by package tests. */
  readonly audioBackend?: AudioBackend;
  /** @internal Deterministic RenderObject factory seams used by package tests. */
  readonly renderObjectFactoryDependencies?: SceneLayoutRenderObjectFactoryDependencies;
}): SceneLayoutPackageRuntime {
  return new DefaultSceneLayoutPackageRuntime(
    options.resource,
    options.presentationOnly === true,
    options.reelPresentation,
    options.areaSpinFunction,
    options.symbolValueTextBindings,
    options.gridCellPresentation,
    options.createGridCellReel,
    options.hostUpdatesMainReel === true,
    options.formatPopupAmount,
    options.createTransitionPlayer,
    options.createSpinePopupRuntime,
    options.createVideoTransitionPlayer,
    options.audioBackend,
    options.renderObjectFactoryDependencies,
  );
}

/** @internal Editor/diagnostic bridge; omitted from the scene-layout barrel. */
export function inspectActiveAwardCelebrationRuntime(
  runtime: SceneLayoutPackageRuntime,
): AwardCelebrationSnapshot | null {
  const read = activeAwardSnapshotReaders.get(runtime);
  if (!read)
    throw new SceneLayoutError(
      "Scene layout award celebration inspection is unavailable.",
    );
  return read();
}

/** @internal Editor/diagnostic bridge; omitted from the core public facade. */
export function inspectSceneLayoutGameModeRuntime(
  runtime: SceneLayoutPackageRuntime,
): SceneLayoutGameModeSnapshot {
  const read = gameModeSnapshotReaders.get(runtime);
  if (!read)
    throw new SceneLayoutError(
      "Scene layout game mode inspection is unavailable.",
    );
  return read();
}

class DefaultSceneLayoutPackageRuntime implements SceneLayoutPackageRuntime {
  readonly addresses: GameLayoutRuntimeAddresses;
  readonly #addressController: GameLayoutRuntimeAddressController;
  readonly container: Container;
  readonly #resource: SceneLayoutPackageResource;
  readonly #presentationOnly: boolean;
  #document: SceneLayoutManifest;
  #manifest: SceneLayoutManifestV1;
  readonly #layout;
  readonly #reelPresentation: SlotReelPresentationProfileV1 | null;
  readonly #areaSpinFunction:
    | import("../reel/index.js").AreaSpinFunction
    | undefined;
  readonly #symbolValueTextBindings:
    | import("../symbol/index.js").SymbolValueTextBindingMap
    | undefined;
  readonly #gridCellPresentation:
    | {
        readonly createEffectController?: () => import("../reel/index.js").GridCellEffectController;
        readonly presentationValueResolver?: import("../reel/index.js").GridCellSymbolPresentationValueResolver;
      }
    | undefined;
  readonly #createGridCellReel: (() => RenderGridCellReelSet) | undefined;
  readonly #hostUpdatesMainReel: boolean;
  readonly #formatPopupAmount:
    | import("../popup/data/types.js").PopupAmountFormatter
    | undefined;
  readonly #createTransitionPlayer: (options: {
    readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
  }) => RendercoreSpinePlayer;
  readonly #createSpinePopupRuntime: (options: {
    readonly resource: SceneLayoutPackageResource["popupPackages"][string];
  }) => SpinePopupRuntime;
  readonly #createVideoTransitionPlayer: (options: {
    readonly url: string;
    readonly fadeOutSeconds: number;
  }) => SceneLayoutTransitionVideoPlayer;
  readonly #renderObjectFactory: SceneLayoutRenderObjectFactory;
  readonly #audio: AudioRuntime;
  readonly #disposeAudioMusicObserver: () => void;
  #audioUnlocked = false;
  #audioMode: string | null = null;
  #audioFailure: SceneLayoutError | null = null;
  readonly #popupAudioStates = new Map<string, string>();
  readonly #popupAudioHandles = new Map<string, AudioPlaybackHandle[]>();
  readonly #symbolAudioHandles = new Map<string, AudioPlaybackHandle[]>();
  readonly #popupRoot = new Container();
  readonly #transitionRoot = new Container();
  readonly #popupRenderLayerRoot = new Container();
  readonly #transitionRenderLayerRoot = new Container();
  readonly #reelRenderLayerRoot = new Container();
  readonly #popupRenderLayerController: RenderObjectLayerController;
  readonly #transitionRenderLayerController: RenderObjectLayerController;
  readonly #reelRenderLayerController: RenderObjectLayerController;
  readonly #videoBlackoutRoot = new Container();
  readonly #videoBlackout = new Graphics();
  #reel: ReelPresentation | null = null;
  readonly #reelEntries = new Map<string, ReelEntry>();
  #mainReelSceneCommitted = false;
  readonly #mainReelOverlays = new Set<Container>();
  #catalog: SymbolCatalogModel | null = null;
  #activeSymbolPackageId: string | null = null;
  #stableSymbolPackageId: string | null = null;
  #targetSymbolPackageId: string | null = null;
  #activeBackgroundNodes: readonly string[] = Object.freeze([]);
  readonly #popups = new Map<string, AwardCelebrationRuntime>();
  readonly #spinePopups = new Map<string, SpinePopupRuntime>();
  readonly #singleStatePopups = new Map<string, SingleStatePopupRuntime>();
  #initialized = false;
  #initializing = false;
  #destroyed = false;
  readonly #presentationDelayWaiters =
    new Set<PackagePresentationDelayWaiter>();
  #stableMode: string | null = null;
  #gameModeIds: readonly string[] = Object.freeze([]);
  #displayedMode: string | null = null;
  #targetMode: string | null = null;
  #modeRequestInProgress = false;
  #activeTransition: ActiveModeTransition | null = null;
  #activePrelude: ActiveModePrelude | null = null;
  #preparedTransition: PreparedModeTransition | null = null;
  #activePopupId: string | null = null;
  #activeAwardCelebrationWaiter: ActiveAwardCelebrationWaiter | null = null;
  #viewportSize: RenderViewportSize | null = null;
  #artSpaceApplied = false;
  #pendingMainReelLandingPositions: {
    readonly x: number;
    readonly y: number;
  }[] = [];
  #mainReelLandingKeys = new Set<string>();
  #pendingMainReelStartedPositions: {
    readonly x: number;
    readonly y: number;
  }[] = [];
  #mainReelStartedKeys = new Set<string>();
  #pendingMainReelActivationPositions: {
    readonly x: number;
    readonly y: number;
  }[] = [];
  #mainReelActivationKeys = new Set<string>();
  #disposePopupInputBinding: (() => void) | null = null;
  readonly #onPopupPointerDown = () => {
    const result = this.requestPrimaryPopupInteraction();
    if (result.handled && result.completion)
      void result.completion.catch(() => {});
  };

  constructor(
    resource: SceneLayoutPackageResource,
    presentationOnly: boolean,
    reelPresentation: SlotReelPresentationProfileV1 | undefined,
    areaSpinFunction: import("../reel/index.js").AreaSpinFunction | undefined,
    symbolValueTextBindings:
      | import("../symbol/index.js").SymbolValueTextBindingMap
      | undefined,
    gridCellPresentation:
      | {
          readonly createEffectController?: () => import("../reel/index.js").GridCellEffectController;
          readonly presentationValueResolver?: import("../reel/index.js").GridCellSymbolPresentationValueResolver;
        }
      | undefined,
    createGridCellReel: (() => RenderGridCellReelSet) | undefined,
    hostUpdatesMainReel: boolean,
    formatPopupAmount:
      | import("../popup/data/types.js").PopupAmountFormatter
      | undefined,
    createTransitionPlayer:
      | ((options: {
          readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
        }) => RendercoreSpinePlayer)
      | undefined,
    spinePopupRuntimeFactory:
      | ((options: {
          readonly resource: SceneLayoutPackageResource["popupPackages"][string];
        }) => SpinePopupRuntime)
      | undefined,
    createVideoTransitionPlayer:
      | ((options: {
          readonly url: string;
          readonly fadeOutSeconds: number;
        }) => SceneLayoutTransitionVideoPlayer)
      | undefined,
    audioBackend: AudioBackend | undefined,
    renderObjectFactoryDependencies:
      | SceneLayoutRenderObjectFactoryDependencies
      | undefined,
  ) {
    this.#resource = resource;
    this.#presentationOnly = presentationOnly;
    this.#document =
      resource.runtimeManifest ??
      (resource.manifest.version
        ? upgradeSceneLayoutManifestToLatest(resource.manifest)
        : (resource.manifest as never));
    this.#manifest =
      resource.layout.manifest ?? (resource.manifest as SceneLayoutManifestV1);
    this.#areaSpinFunction = areaSpinFunction;
    this.#symbolValueTextBindings = symbolValueTextBindings;
    this.#reelPresentation = reelPresentation ?? null;
    this.#gridCellPresentation = gridCellPresentation;
    this.#createGridCellReel = createGridCellReel;
    this.#hostUpdatesMainReel = hostUpdatesMainReel;
    this.#formatPopupAmount = formatPopupAmount;
    this.#layout = createPreparedSceneLayoutRuntime({
      resource: resource.layout,
    });
    this.#audio = createAudioRuntime({
      backend: audioBackend ?? createPixiSoundBackend(),
      effects: resource.audioEffects,
      music: resource.audioMusic,
    });
    this.#createTransitionPlayer =
      createTransitionPlayer ??
      ((options) =>
        createOfficialSpinePlayer({
          resource: options.resource,
          createError: (message) => new SceneLayoutError(message),
        }));
    this.#createSpinePopupRuntime =
      spinePopupRuntimeFactory ?? createSpinePopupRuntime;
    this.#createVideoTransitionPlayer =
      createVideoTransitionPlayer ?? createSceneLayoutTransitionVideoPlayer;
    this.#renderObjectFactory = createSceneLayoutRenderObjectFactory({
      resource,
      dependencies: renderObjectFactoryDependencies,
    });
    this.#addressController = createGameLayoutRuntimeAddresses(resource, {
      getRenderObject: (id) => this.getRenderObject(id),
      getRenderLayer: (ref) => this.getRenderLayer(ref),
      getArea: (id) => this.getSymbolArea(id),
      getGameModeSnapshot: () => this.getGameModeSnapshot(),
      playEffect: (route) => this.playEffect(route),
      stopEffect: (route) => this.stopEffect(route),
      getAudioSnapshot: () => this.#audio.getSnapshot(),
      getPopupLayer: (popupId, layerId) => {
        const popup = this.#singleStatePopups.get(popupId);
        if (!popup)
          throw new SceneLayoutError(
            `Popup layer runtime is unavailable for non-single-state popup "${popupId}".`,
          );
        return popup.getLayer(layerId);
      },
      getPopupString: (popupId, kind, name) => {
        const popup =
          this.#singleStatePopups.get(popupId) ??
          this.#spinePopups.get(popupId) ??
          this.#popups.get(popupId);
        if (!popup)
          throw new SceneLayoutError(
            `Scene layout popup "${popupId}" is unavailable.`,
          );
        return kind === "text"
          ? popup.getTextNode(name)
          : popup.getImageStringNode(name);
      },
      createRenderObject: (name) => this.createRenderObject(name),
      createImgNumberRenderObject: (name, options) =>
        this.createImgNumberRenderObject(name, options),
      assertReady: () => this.assertReady(),
    });
    this.addresses = this.#addressController.addresses;
    this.#disposeAudioMusicObserver = this.#audio.observeMusic((event) => {
      const detail = Object.freeze({ music: event.name, phase: event.phase });
      this.#addressController.emit(
        formatGameLayoutRuntimeAddress(
          "audio",
          "music",
          event.name,
          "lifecycle",
          event.phase,
        ),
        detail,
      );
      for (const mode of resource.runtimeManifest?.gameModes.modes ?? [])
        if (mode.bgm === event.name)
          this.#addressController.emit(
            formatGameLayoutRuntimeAddress(
              "mode",
              mode.id,
              "bgm",
              "lifecycle",
              event.phase,
            ),
            Object.freeze({ ...detail, mode: mode.id }),
          );
    });
    activeAwardSnapshotReaders.set(this, () =>
      this.#createActiveAwardCelebrationSnapshot(),
    );
    gameModeSnapshotReaders.set(this, () => this.getGameModeSnapshot());
    this.container = new Container();
    this.container.label = `scene-layout-package:${resource.manifest.id}`;
    this.#popupRoot.label = "scene-layout-popup-root";
    this.#popupRoot.sortableChildren = true;
    this.#popupRoot.eventMode = "none";
    this.#popupRoot.on("pointerdown", this.#onPopupPointerDown);
    this.#transitionRoot.label = "scene-transition-overlay";
    this.#transitionRoot.sortableChildren = true;
    this.#popupRenderLayerRoot.label = "scene-layout-render-layer:popup";
    this.#popupRenderLayerRoot.sortableChildren = true;
    this.#popupRenderLayerRoot.zIndex = 1_000_000_000;
    this.#transitionRenderLayerRoot.label =
      "scene-layout-render-layer:transition";
    this.#transitionRenderLayerRoot.sortableChildren = true;
    this.#transitionRenderLayerRoot.zIndex = 1_000_000_000;
    this.#reelRenderLayerRoot.label = "scene-layout-render-layer:reel";
    this.#reelRenderLayerRoot.sortableChildren = true;
    this.#popupRoot.addChild(this.#popupRenderLayerRoot);
    this.#transitionRoot.addChild(this.#transitionRenderLayerRoot);
    this.#popupRenderLayerController = this.createLayerController(
      this.#popupRenderLayerRoot,
      "scene layout popup render layer",
    );
    this.#transitionRenderLayerController = this.createLayerController(
      this.#transitionRenderLayerRoot,
      "scene layout transition render layer",
    );
    this.#reelRenderLayerController = this.createLayerController(
      this.#reelRenderLayerRoot,
      "scene layout reel render layer",
      true,
    );
    this.#videoBlackoutRoot.label = "scene-transition-video-blackout";
    this.#videoBlackout.label = "scene-transition-video-black";
    this.#videoBlackoutRoot.visible = false;
    this.#videoBlackoutRoot.addChild(this.#videoBlackout);
    this.container.addChild(
      this.#layout.container,
      this.#popupRoot,
      this.#transitionRoot,
      this.#videoBlackoutRoot,
    );
  }

  async init(
    options: {
      readonly reels?: Readonly<
        Partial<Record<"main", SceneLayoutInitialReelScene>>
      >;
    } = {},
  ): Promise<void> {
    this.assertAlive();
    if (this.#initialized || this.#initializing)
      throw new SceneLayoutError(
        "Scene layout package runtime is already initializing or initialized.",
      );
    this.#initializing = true;
    try {
      const initialModeId = this.#document.gameModes?.initialMode ?? null;
      const initialMode = initialModeId
        ? this.requireMode(initialModeId)
        : null;
      const activeBinding = this.resolveModeSymbolBinding(initialMode);
      if (activeBinding && this.#presentationOnly && options.reels?.main)
        throw new SceneLayoutError(
          "Presentation-only scene layout runtime must not receive reels.main input.",
        );
      if (!activeBinding && options.reels?.main)
        throw new SceneLayoutError(
          "Scene layout package has no symbol binding and must not receive reels.main input.",
        );

      const layoutPromise = this.#layout.init();
      const allBindings = this.resolveAllSymbolBindings();
      if (this.#createGridCellReel && allBindings.length > 1)
        throw new SceneLayoutError(
          "Injected grid-cell reel factory cannot own multiple symbol package bindings.",
        );
      const reelPromises = this.#presentationOnly
        ? []
        : this.#createGridCellReel
          ? [
              Promise.resolve().then(async () => {
                if (!activeBinding) return;
                if (activeBinding.binding.renderMode !== "grid-cell")
                  throw new SceneLayoutError(
                    "Injected grid-cell reel requires a grid-cell symbol binding.",
                  );
                this.#reel = this.#createGridCellReel!();
                this.#catalog = null;
                await this.prepareReelPresentation(this.#reel);
                this.assertAlive();
              }),
            ]
          : allBindings.map((binding) =>
              Promise.resolve().then(async () => {
                const catalog = await binding.resource.createCatalog();
                this.assertAlive();
                const reel = this.createReelPresentation(
                  binding.resource,
                  catalog,
                  binding.binding,
                );
                const entry: ReelEntry = {
                  ...binding,
                  reel,
                  catalog,
                  sceneCommitted: false,
                };
                this.#reelEntries.set(binding.id, entry);
                reel.visible = false;
                try {
                  await this.prepareReelPresentation(reel);
                  this.assertAlive();
                } catch (error) {
                  this.#reelEntries.delete(binding.id);
                  reel.destroy({ children: true });
                  throw error;
                }
              }),
            );
      const popupEntries = Object.entries(this.#resource.popupPackages).map(
        ([id, resource]) => {
          const popup =
            resource.manifest.type === "spine"
              ? this.#createSpinePopupRuntime({ resource })
              : resource.manifest.type === "single-state"
                ? createSingleStatePopupRuntime({ resource })
                : createAwardCelebrationRuntime({
                    resource,
                    formatAmount: this.#formatPopupAmount,
                  });
          if (resource.manifest.type === "spine")
            this.#spinePopups.set(id, popup as SpinePopupRuntime);
          else if (resource.manifest.type === "single-state")
            this.#singleStatePopups.set(id, popup as SingleStatePopupRuntime);
          else this.#popups.set(id, popup as AwardCelebrationRuntime);
          return Object.freeze({
            id,
            resource,
            popup,
            initPromise: Promise.resolve().then(async () => {
              await popup.init();
              this.assertAlive();
            }),
          });
        },
      );

      await settleAllInOrder([
        layoutPromise,
        ...reelPromises,
        ...popupEntries.map((entry) => entry.initPromise),
      ]);
      this.assertAlive();
      if (activeBinding && !this.#presentationOnly) {
        const initial = options.reels?.main;
        const symbolPackage = activeBinding.resource;
        const entry = this.#reelEntries.get(activeBinding.id);
        const reel = this.#createGridCellReel ? this.#reel : entry?.reel;
        if (!reel)
          throw new SceneLayoutError(
            "Scene layout active reel preparation completed without a reel.",
          );
        this.attachReel(reel);
        this.#reel = reel;
        this.#catalog = entry?.catalog ?? null;
        if (initial) {
          this.applyReelScene(
            reel,
            symbolPackage,
            activeBinding.binding,
            initial,
          );
          this.#mainReelSceneCommitted = true;
          if (entry) entry.sceneCommitted = true;
        } else {
          reel.visible = false;
        }
        this.#activeSymbolPackageId = activeBinding.id;
        this.#stableSymbolPackageId = activeBinding.id;
      } else if (activeBinding) {
        this.#activeSymbolPackageId = activeBinding.id;
        this.#stableSymbolPackageId = activeBinding.id;
      }
      this.commitModeVisibility(initialMode);
      for (const { id, popup } of popupEntries) {
        const binding = this.#manifest.popups?.[id];
        if (!binding)
          throw new SceneLayoutError(
            `Scene layout popup "${id}" has no manifest binding.`,
          );
        popup.container.zIndex = binding.order;
        this.#popupRoot.addChild(popup.container);
      }
      this.#popupRoot.sortChildren();
      this.#stableMode = initialModeId;
      this.#displayedMode = initialModeId;
      this.#gameModeIds = Object.freeze(
        this.requireGameModes().modes.map((mode) => mode.id),
      );
      this.#initialized = true;
    } catch (error) {
      this.destroy();
      throw asSceneLayoutError(error);
    } finally {
      this.#initializing = false;
    }
  }

  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot {
    this.assertReady();
    const snapshot = this.#layout.applyViewport(viewportSize);
    this.#artSpaceApplied = false;
    return this.applySnapshot(snapshot, viewportSize);
  }

  applyArtSpace(): SceneLayoutSnapshot {
    this.assertReady();
    const snapshot = this.#layout.applyArtSpace();
    this.#artSpaceApplied = true;
    return this.applySnapshot(snapshot, snapshot.artSize);
  }

  private applySnapshot(
    snapshot: SceneLayoutSnapshot,
    viewportSize: RenderViewportSize,
  ): SceneLayoutSnapshot {
    this.#viewportSize = Object.freeze({ ...viewportSize });
    this.#popupRoot.hitArea = new Rectangle(
      0,
      0,
      viewportSize.width,
      viewportSize.height,
    );
    if (
      this.#reel &&
      this.#mainReelSceneCommitted &&
      !this.#hostUpdatesMainReel
    ) {
      const grid = snapshot.reels.main;
      if (!grid)
        throw new SceneLayoutError(
          'Bound scene layout reel "main" is missing.',
        );
      this.#reel.position.set(grid.artRect.x, grid.artRect.y);
      this.#reelRenderLayerRoot.position.set(grid.artRect.x, grid.artRect.y);
      for (const overlay of this.#mainReelOverlays)
        overlay.position.set(grid.artRect.x, grid.artRect.y);
    }
    for (const [id, popup] of this.#popups) {
      const binding = this.#manifest.popups?.[id];
      const placement = binding?.placements[snapshot.variantId];
      if (!binding || !placement)
        throw new SceneLayoutError(
          `Scene layout popup "${id}" has no ${snapshot.variantId} placement.`,
        );
      if (popup.applyViewport) popup.applyViewport(viewportSize, placement);
      else {
        popup.container.position.set(
          viewportSize.width / 2 + placement.x,
          viewportSize.height / 2 + placement.y,
        );
        popup.container.scale.set(placement.scale);
      }
    }
    for (const [id, popup] of this.#spinePopups) {
      const binding = this.#manifest.popups?.[id];
      const placement = binding?.placements[snapshot.variantId];
      if (!binding || !placement)
        throw new SceneLayoutError(
          `Scene layout popup "${id}" has no ${snapshot.variantId} placement.`,
        );
      if (popup.applyViewport) popup.applyViewport(viewportSize, placement);
      else {
        popup.container.position.set(
          viewportSize.width / 2 + placement.x,
          viewportSize.height / 2 + placement.y,
        );
        popup.container.scale.set(placement.scale);
      }
    }
    for (const [id, popup] of this.#singleStatePopups) {
      const binding = this.#manifest.popups?.[id];
      const placement = binding?.placements[snapshot.variantId];
      if (!binding || !placement)
        throw new SceneLayoutError(
          `Scene layout popup "${id}" has no ${snapshot.variantId} placement.`,
        );
      if (popup.applyViewport) popup.applyViewport(viewportSize, placement);
      else {
        popup.container.position.set(
          viewportSize.width / 2 + placement.x,
          viewportSize.height / 2 + placement.y,
        );
        popup.container.scale.set(placement.scale);
      }
    }
    this.#transitionRoot.position.set(
      snapshot.worldOffset.x,
      snapshot.worldOffset.y,
    );
    const activeTransition = this.#activeTransition;
    if (activeTransition?.kind === "spine") {
      const overlay = activeTransition.spec.overlay;
      if (!("placements" in overlay))
        throw new SceneLayoutError("Active Spine transition schema mismatch.");
      const placement = overlay.placements[snapshot.variantId];
      if (!placement)
        throw new SceneLayoutError(
          `Scene transition ${activeTransition.spec.from} -> ${activeTransition.spec.to} has no ${snapshot.variantId} placement.`,
        );
      activeTransition.player.view.position.set(
        (this.#manifest.coordinateOrigin ?? "top-left") === "center"
          ? snapshot.artSize.width / 2 + placement.x
          : placement.x,
        (this.#manifest.coordinateOrigin ?? "top-left") === "center"
          ? snapshot.artSize.height / 2 + placement.y
          : placement.y,
      );
      activeTransition.player.view.scale.set(placement.scale);
    }
    if (activeTransition?.kind === "video")
      activeTransition.player.applyViewport(viewportSize);
    this.redrawVideoBlackout(viewportSize);
    return snapshot;
  }

  applyGeometryManifest(
    manifestValue: SceneLayoutPackageResource["manifest"],
  ): SceneLayoutSnapshot | null {
    this.assertReady();
    if (this.#activeTransition || this.#activePrelude)
      throw new SceneLayoutError(
        "Scene layout geometry cannot change during an active transition or prelude.",
      );
    const sourceDocument = parseSceneLayoutManifestDocument(manifestValue);
    const document = upgradeSceneLayoutManifestToLatest(sourceDocument);
    const manifest =
      sourceDocument.version === 1
        ? sourceDocument
        : materializeSceneLayoutManifestForMode(
            document,
            this.#stableMode ?? undefined,
          );
    assertSceneLayoutGeometryCompatible(this.#manifest, manifest);
    const prepared = this.#preparedTransition;
    const nextPreparedSpec = prepared
      ? document.gameModes?.transitions?.find(
          (candidate) =>
            candidate.from === prepared.spec.from &&
            candidate.to === prepared.spec.to,
        )
      : null;
    const nextPreparedGeometry = prepared
      ? materializeModeGeometry(document, prepared.target.id)
      : null;
    if (prepared && !nextPreparedSpec)
      throw new SceneLayoutError(
        "Prepared scene transition is missing from geometry update.",
      );
    this.#layout.commitPreparedGeometryManifest(manifest);
    this.#document = document;
    this.#manifest = manifest;
    if (prepared && nextPreparedSpec) {
      prepared.spec = nextPreparedSpec;
      prepared.geometry = nextPreparedGeometry;
    }
    return this.#viewportSize
      ? this.#artSpaceApplied
        ? this.applyArtSpace()
        : this.applyViewport(this.#viewportSize)
      : null;
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    if (this.#audioFailure) throw this.#audioFailure;
    this.syncStableModeMusic();
    this.#audio.update(deltaSeconds);
    this.updatePresentationDelayWaiters(deltaSeconds);
    this.#layout.update(deltaSeconds);
    this.#renderObjectFactory.update(deltaSeconds);
    if (this.#reel && !this.#hostUpdatesMainReel) {
      const geometry = this.#manifest.reels.main;
      if (this.#reel instanceof RenderGridCellReelSet) {
        const result = this.#reel.update(deltaSeconds);
        for (const position of result.startedCells)
          this.recordMainReelStarted(position.x, position.y);
        for (const position of result.landedCells)
          this.recordMainReelLanding(position.x, position.y);
        for (const position of result.activationCells)
          this.recordMainReelActivation(position.x, position.y);
      } else if (geometry) {
        const result = this.#reel.update(deltaSeconds);
        for (const x of result.stoppedAxes)
          for (let y = 0; y < geometry.rows; y++) {
            this.recordMainReelLanding(x, y);
          }
      } else {
        this.#reel.update(deltaSeconds);
      }
    }
    for (const [id, popup] of this.#popups)
      if (popup.isPlaying())
        try {
          popup.update(deltaSeconds);
        } catch (error) {
          if (this.#activeAwardCelebrationWaiter?.popupId === id) {
            const waiter = this.#activeAwardCelebrationWaiter;
            this.#activeAwardCelebrationWaiter = null;
            waiter.reject(asSceneLayoutError(error));
          }
          throw error;
        }
    for (const [id, popup] of this.#spinePopups)
      if (popup.isPlaying())
        try {
          popup.update(deltaSeconds);
        } catch (error) {
          if (this.#activePrelude?.popupId === id) {
            this.failActivePrelude(
              this.#activePrelude,
              asSceneLayoutError(error),
            );
          } else throw error;
        }
    for (const popup of this.#singleStatePopups.values())
      if (popup.isPlaying()) popup.update(deltaSeconds);
    this.updatePopupAudioCues();
    this.updateActivePrelude();
    this.updateActiveTransition(deltaSeconds);
    if (
      this.#activePopupId &&
      !this.#popups.get(this.#activePopupId)?.isPlaying()
    ) {
      const completedId = this.#activePopupId;
      this.#activePopupId = null;
      this.refreshPopupPointerInteraction();
      if (this.#activeAwardCelebrationWaiter?.popupId === completedId) {
        const waiter = this.#activeAwardCelebrationWaiter;
        this.#activeAwardCelebrationWaiter = null;
        waiter.resolve();
      }
    }
  }

  resetReelScene(reelId: "main", input: SceneLayoutInitialReelScene): void {
    this.assertReady();
    const reel = this.requirePreparedReel(reelId);
    const mode = this.#stableMode ? this.requireMode(this.#stableMode) : null;
    const binding = this.resolveModeSymbolBinding(mode);
    if (!binding)
      throw new SceneLayoutError(
        "Current scene layout game mode has no symbol package binding.",
      );
    this.applyReelScene(reel, binding.resource, binding.binding, input);
    reel.visible = true;
    this.#mainReelSceneCommitted = true;
    this.clearMainReelLandingPositions();
  }

  hasCommittedMainReelScene(): boolean {
    this.assertReady();
    return this.#mainReelSceneCommitted;
  }

  acknowledgeMainReelSceneCommit(): void {
    this.assertReady();
    if (!this.#createGridCellReel)
      throw new SceneLayoutError(
        "Main reel scene acknowledgement requires an ownership-transferred reel.",
      );
    if (this.#mainReelSceneCommitted)
      throw new SceneLayoutError("Main reel scene is already committed.");
    const reel = this.requirePreparedReel("main");
    const binding = this.resolveModeSymbolBinding(
      this.#stableMode ? this.requireMode(this.#stableMode) : null,
    );
    if (!binding)
      throw new SceneLayoutError(
        "Current scene layout game mode has no symbol package binding.",
      );
    const geometry = this.#manifest.reels.main!;
    validateScene(
      reel.getVisibleScene(),
      geometry.columns,
      geometry.rows,
      binding.resource,
    );
    reel.visible = true;
    this.#mainReelSceneCommitted = true;
  }

  applyMainReelSnapshot(input: SceneLayoutInitialReelScene): void {
    this.assertReady();
    const reel = this.requireReel("main");
    if (this.isMainReelSpinning())
      throw new SceneLayoutError(
        "Cannot apply a main reel snapshot while spinning.",
      );
    const geometry = this.#manifest.reels.main!;
    const binding = this.resolveModeSymbolBinding(
      this.#stableMode ? this.requireMode(this.#stableMode) : null,
    );
    if (!binding)
      throw new SceneLayoutError(
        "Current scene layout game mode has no symbol package binding.",
      );
    const scene = validateScene(
      input.scene,
      geometry.columns,
      geometry.rows,
      binding.resource,
    );
    validatePhases(
      input.localPhaseYs,
      geometry.columns,
      binding.resource.gameConfig.getReels(binding.binding.reelSet),
    );
    const values = validateValues(
      input.presentationValues,
      geometry.columns,
      geometry.rows,
    );
    validateEmptyCellValues(scene, values);
    const current = reel.getVisibleScene();
    const currentValues = reel
      .getCascadeValues()
      .map((column) =>
        Object.freeze(column.map((value) => (value === -1 ? null : value))),
      );
    const occupancyChanged = current.some((column, x) =>
      column.some((code, y) => (code === -1) !== (scene[x]![y] === -1)),
    );
    if (occupancyChanged) {
      this.applyReelScene(reel, binding.resource, binding.binding, {
        scene,
        localPhaseYs: input.localPhaseYs,
        ...(values ? { presentationValues: values } : {}),
      });
      return;
    }
    const replacements: import("../reel/index.js").SymbolReplacement[] = [];
    try {
      for (let x = 0; x < geometry.columns; x++)
        for (let y = 0; y < geometry.rows; y++)
          if (current[x]![y] !== scene[x]![y])
            replacements.push(
              Object.freeze({
                position: Object.freeze({ x, y }),
                target: Object.freeze({
                  code: scene[x]![y]!,
                  value: values?.[x]?.[y] ?? null,
                }),
              }),
            );
      if (replacements.length > 0) reel.replaceSymbols(replacements);
      for (let x = 0; x < geometry.columns; x++)
        for (let y = 0; y < geometry.rows; y++)
          if (current[x]![y] === scene[x]![y] && scene[x]![y] !== -1)
            reel.setVisibleSymbolPresentationValue(
              x,
              y,
              values?.[x]?.[y] ?? null,
            );
    } catch (error) {
      this.applyReelScene(reel, binding.resource, binding.binding, {
        scene: current,
        localPhaseYs: Object.freeze(
          Array.from({ length: geometry.columns }, () => 0),
        ),
        presentationValues: Object.freeze(currentValues),
      });
      throw asSceneLayoutError(error);
    }
  }

  spinMainReelToScene(input: SceneLayoutMainReelSpinInput): void {
    this.spinMainReelToSceneInternal(input, false);
  }

  startMainReelContinuousSpin(
    input: SceneLayoutMainReelContinuousSpinInput = {},
  ): void {
    this.assertReady();
    const reel = this.requireReel("main");
    const profile = this.#reelPresentation;
    if (!profile) {
      throw new SceneLayoutError(
        "Continuous main reel spin requires a reel presentation profile.",
      );
    }
    if (profile.kind === "grid-cell") {
      /* v8 ignore next -- reel kind is created from this validated profile */
      if (!(reel instanceof RenderGridCellReelSet)) {
        throw new SceneLayoutError(
          "Continuous grid-cell spin resolved a non-grid-cell runtime.",
        );
      }
      const geometry = this.#manifest.reels.main!;
      const binding = this.resolveModeSymbolBinding(
        this.#stableMode ? this.requireMode(this.#stableMode) : null,
      );
      if (!binding)
        throw new SceneLayoutError(
          "Scene layout current mode has no active symbol package binding.",
        );
      const reels = binding.resource.gameConfig.getReels(
        binding.binding.reelSet,
      );
      if (input.random !== undefined && typeof input.random !== "function")
        throw new SceneLayoutError(
          "continuous grid-cell phase random must be a function.",
        );
      const cellLocalPhaseYs =
        input.random === undefined
          ? undefined
          : createShuffledGridCellReelPhaseMatrix({
              reels,
              columns: geometry.columns,
              rows: geometry.rows,
              random: input.random,
            });
      this.clearMainReelLandingPositions();
      reel.startContinuous({
        direction: profile.direction,
        speedSymbolsPerSecond: profile.timing.speedSymbolsPerSecond,
        startStepMs: profile.timing.startStepMs,
        ...(input.positions ? { positions: input.positions } : {}),
        ...(cellLocalPhaseYs ? { cellLocalPhaseYs } : {}),
        ...(input.dimming ? { dimming: input.dimming } : {}),
        ...(input.dimmingActivatedAtStart === undefined
          ? {}
          : { dimmingActivatedAtStart: input.dimmingActivatedAtStart }),
      });
      return;
    }
    /* v8 ignore next -- reel kind is created from this validated profile */
    if (reel instanceof RenderGridCellReelSet) {
      throw new SceneLayoutError(
        "Continuous standard spin resolved a grid-cell runtime.",
      );
    }
    if (
      input.positions !== undefined ||
      input.random !== undefined ||
      input.dimming !== undefined ||
      input.dimmingActivatedAtStart !== undefined
    )
      throw new SceneLayoutError(
        "Standard continuous spin does not accept grid-cell presentation options.",
      );
    this.clearMainReelLandingPositions();
    reel.startContinuous({
      direction: profile.direction,
      speedSymbolsPerSecond: profile.speedSymbolsPerSecond,
    });
  }

  settleMainReelContinuousSpin(input: SceneLayoutMainReelSpinInput): void {
    this.spinMainReelToSceneInternal(input, true);
  }

  cancelMainReelContinuousSpin(): void {
    this.assertReady();
    const reel = this.requireReel("main");
    reel.cancelContinuous();
    this.clearMainReelLandingPositions();
  }

  getSymbolArea(reelId: string) {
    this.assertReady();
    if (reelId !== "main")
      throw new SceneLayoutError(
        `Scene layout symbol area "${reelId}" is unavailable.`,
      );
    return this.requireReel("main");
  }

  getSymbolMutationArea(reelId: string) {
    return this.getSymbolArea(reelId);
  }

  getReelSpin(reelId: string) {
    this.assertReady();
    if (reelId !== "main")
      throw new SceneLayoutError(
        `Scene layout reel spin "${reelId}" is unavailable.`,
      );
    const reel = this.requireReel("main");
    if (reel instanceof RenderGridCellReelSet)
      throw new SceneLayoutError(
        'Scene layout reel spin "main" requires a standard reel runtime.',
      );
    return reel;
  }

  getReelArea(reelId: string) {
    const reel = this.getReelSpin(reelId);
    /* v8 ignore next -- getReelSpin already rejects grid-cell */
    if (!(reel instanceof RenderReelSet))
      throw new SceneLayoutError("Standard reel area is unavailable.");
    return reel.getArea();
  }

  getReelSpinSessionController(reelId: string) {
    const reel = this.getReelSpin(reelId);
    if (!(reel instanceof RenderReelSet))
      throw new SceneLayoutError("Standard reel spin session is unavailable.");
    return reel.getSpinSessionController();
  }

  private spinMainReelToSceneInternal(
    input: SceneLayoutMainReelSpinInput,
    settleContinuous: boolean,
  ): void {
    this.assertReady();
    const reel = this.requireReel("main");
    this.clearMainReelLandingPositions();
    const binding = this.resolveModeSymbolBinding(
      this.#stableMode ? this.requireMode(this.#stableMode) : null,
    );
    if (!binding)
      throw new SceneLayoutError(
        "Scene layout current mode has no active symbol package binding.",
      );
    const profile = this.#reelPresentation;
    if (!profile)
      throw new SceneLayoutError(
        "Scene layout runtime was not configured with a reel presentation profile.",
      );
    if (profile.kind !== binding.binding.renderMode)
      throw new SceneLayoutError(
        `Configured reel kind "${profile.kind}" does not match active renderMode "${binding.binding.renderMode}".`,
      );
    if (typeof input.random !== "function")
      throw new SceneLayoutError("spin random must be a function.");
    if (
      input.buildGridCellSpinPlan !== undefined &&
      typeof input.buildGridCellSpinPlan !== "function"
    )
      throw new SceneLayoutError("buildGridCellSpinPlan must be a function.");
    const geometry = this.#manifest.reels.main!;
    const scene = validateScene(
      input.scene,
      geometry.columns,
      geometry.rows,
      binding.resource,
    );
    const reels = binding.resource.gameConfig.getReels(binding.binding.reelSet);
    const phases = validatePhases(input.localPhaseYs, geometry.columns, reels);
    const values = validateValues(
      input.presentationValues,
      geometry.columns,
      geometry.rows,
    );
    validateEmptyCellValues(scene, values);
    const landingStates = validateLandingStates(
      input.landingStates,
      geometry.columns,
      geometry.rows,
    );
    validateEmptyCellStates(scene, landingStates);
    if (profile.kind === "grid-cell") {
      if (!(reel instanceof RenderGridCellReelSet))
        throw new SceneLayoutError(
          "Grid-cell reel profile resolved a non-grid-cell runtime.",
        );
      const order = createGridCellOrder({
        columns: geometry.columns,
        rows: geometry.rows,
        mode: profile.order,
      });
      const cellReelOffsets = createShuffledGridCellReelOffsetMatrix({
        reels,
        columns: geometry.columns,
        rows: geometry.rows,
        random: input.random,
      });
      const createPlan: SceneLayoutGridCellSpinPlanStage["createPlan"] = (
        options = {},
      ) =>
        createGridCellReelSpinPlan({
          reels,
          finalYs: phases,
          targetScene: scene,
          columns: geometry.columns,
          rows: geometry.rows,
          order,
          cellReelOffsets,
          direction: profile.direction,
          timing: options.timing ?? profile.timing,
          ...(options.positions ? { positions: options.positions } : {}),
          dimming: options.dimming ?? {
            resolveDimmingAlpha: () => 0,
            fadeInMs: 0,
            fadeOutMs: 0,
          },
          ...(options.dimmingActivatedAtStart === undefined
            ? {}
            : {
                dimmingActivatedAtStart: options.dimmingActivatedAtStart,
              }),
          ...(options.activation ? { activation: options.activation } : {}),
          ...(options.effects ? { effects: options.effects } : {}),
        });
      const plan = input.buildGridCellSpinPlan
        ? input.buildGridCellSpinPlan(
            Object.freeze({
              targetScene: scene,
              order,
              createPlan,
            }),
          )
        : createPlan();
      const spinOptions = {
        ...(values ? { targetPresentationValues: values } : {}),
        ...(landingStates ? { targetLandingStates: landingStates } : {}),
      };
      if (settleContinuous) {
        if (!reel.isContinuousSpinning()) {
          throw new SceneLayoutError(
            "Cannot settle main reel without an active continuous spin.",
          );
        }
        reel.settleContinuous(plan, spinOptions);
        return;
      }
      if (reel.isContinuousSpinning()) {
        throw new SceneLayoutError(
          "An active continuous spin must be settled through settleMainReelContinuousSpin().",
        );
      }
      if (plan.selective) {
        reel.spinSelective(plan, spinOptions);
      } else {
        reel.spin(plan, spinOptions);
      }
      return;
    }
    if (reel instanceof RenderGridCellReelSet)
      throw new SceneLayoutError(
        "Standard reel profile resolved a grid-cell runtime.",
      );
    if (input.buildGridCellSpinPlan)
      throw new SceneLayoutError(
        "buildGridCellSpinPlan requires a grid-cell reel profile.",
      );
    const plan = createReelSpinPlan({
      reels,
      finalYs: phases,
      visibleRows: geometry.rows,
      direction: profile.direction,
      minimumSpinCycles: profile.minimumSpinCycles,
      baseDurationMs: profile.baseDurationMs,
      speedSymbolsPerSecond: profile.speedSymbolsPerSecond,
      startDelayMs: profile.startDelayMs,
      stopDelayMs: profile.stopDelayMs,
    });
    const spinOptions = {
      targetVisibleScene: scene,
      ...(values ? { targetVisiblePresentationValues: values } : {}),
      ...(landingStates ? { targetVisibleStates: landingStates } : {}),
    };
    if (settleContinuous) {
      if (!reel.isContinuousSpinning())
        throw new SceneLayoutError(
          "Cannot settle main reel without an active continuous spin.",
        );
      reel.settleContinuous(plan, spinOptions);
    } else {
      if (reel.isContinuousSpinning())
        throw new SceneLayoutError(
          "An active continuous spin must be settled through settleMainReelContinuousSpin().",
        );
      reel.spin(plan, spinOptions);
    }
  }

  isMainReelSpinning(): boolean {
    this.assertReady();
    return this.requireReel("main").isSpinning();
  }

  requestMainReelSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: string,
    transitionMode: import("../symbol/index.js").SymbolStateTransitionMode = "boundary",
  ): void {
    this.assertReady();
    const reel = this.requireReel("main");
    if (this.isMainReelSpinning())
      reel.requestLandedVisibleSymbolStates(positions, state, transitionMode);
    else reel.requestVisibleSymbolStates(positions, state, transitionMode);
  }

  playMainReelSymbolStateBatch(
    requests: readonly import("../reel/index.js").VisibleSymbolStatePlaybackRequest[],
    options?: import("../reel/index.js").VisibleSymbolStatePlaybackBatchOptions,
  ): Promise<void> {
    this.assertReady();
    const reel = this.requireReel("main");
    const bindingId = this.#activeSymbolPackageId;
    const symbolPackage = bindingId
      ? (this.#resource.symbolPackages[bindingId] ??
        this.#resource.symbolPackage)
      : null;
    if (bindingId && symbolPackage) {
      for (const request of requests) {
        const snapshots = reel.getVisibleSymbolStateSnapshots(
          request.positions,
        );
        for (const snapshot of snapshots) {
          const cueOwner = `${bindingId}:${snapshot.x}:${snapshot.y}`;
          this.cancelPendingAudioHandles(
            this.#symbolAudioHandles.get(cueOwner),
          );
          this.#symbolAudioHandles.delete(cueOwner);
          if (snapshot.code < 0) continue;
          const symbol = symbolPackage.gameConfig.getPaytableEntry(
            snapshot.code,
          )?.symbol;
          const cues = symbol
            ? (symbolPackage.symbolManifest.symbols[symbol]?.audioCues.filter(
                (candidate) => candidate.state === request.state,
              ) ?? [])
            : [];
          if (cues.length > 0)
            this.#symbolAudioHandles.set(
              cueOwner,
              cues.map((cue) =>
                this.#audio.playEffect(`${bindingId}.${cue.effect}`),
              ),
            );
        }
      }
    }
    return reel.playVisibleSymbolStateBatch(requests, options);
  }

  playEffect(route: string): AudioPlaybackHandle {
    this.assertReady();
    this.assertProgrammaticAudioRoute(route);
    return this.#audio.playEffect(route);
  }

  stopEffect(route: string): void {
    this.assertReady();
    this.assertProgrammaticAudioRoute(route);
    this.#audio.stopEffect(route);
  }

  async unlockAudio(): Promise<void> {
    this.assertReady();
    await this.#audio.unlock();
    this.#audioUnlocked = true;
    this.syncStableModeMusic(true);
  }

  setAudioMuted(muted: boolean): void {
    this.assertReady();
    this.#audio.setMasterMuted(muted);
  }

  setMusicVolume(volume: number): void {
    this.assertReady();
    this.#audio.setMusicVolume(volume);
  }

  setEffectVolume(volume: number): void {
    this.assertReady();
    this.#audio.setEffectVolume(volume);
  }

  setMainReelSymbolPresentationValue(
    x: number,
    y: number,
    value: number | null,
  ): void {
    this.assertReady();
    this.requireReel("main").setVisibleSymbolPresentationValue(x, y, value);
  }

  setMainReelSymbolImageStringText(
    x: number,
    y: number,
    name: string,
    text: string,
  ): void {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      throw new SceneLayoutError(
        "Visible symbol image-string text requires a grid-cell main reel.",
      );
    reel.setVisibleSymbolImageStringText(x, y, name, text);
  }

  getMainReelSymbolImageStringText(x: number, y: number, name: string): string {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      throw new SceneLayoutError(
        "Visible symbol image-string text requires a grid-cell main reel.",
      );
    return reel.getVisibleSymbolImageStringText(x, y, name);
  }

  transferMainReelSymbols(
    input: import("../reel/index.js").DirectVisibleOccurrenceTransferBatchInput,
  ): Promise<void> {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      return Promise.reject(
        new SceneLayoutError(
          "Direct symbol transfer requires a grid-cell main reel.",
        ),
      );
    return reel.transferSymbols(input);
  }

  dropMainReelOccurrences(
    input: import("../reel/index.js").DirectGridCellCascadeDropInput,
  ): Promise<void> {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      return Promise.reject(
        new SceneLayoutError(
          "Direct occurrence drop requires a grid-cell main reel.",
        ),
      );
    return reel.dropOccurrences(input);
  }

  waitForPresentationDelay(
    durationMs: number,
    signal?: AbortSignal,
  ): Promise<void> {
    this.assertReady();
    if (!Number.isFinite(durationMs) || durationMs < 0)
      return Promise.reject(
        new SceneLayoutError(
          "Presentation delay durationMs must be finite and non-negative.",
        ),
      );
    if (signal?.aborted)
      return Promise.reject(
        new SceneLayoutError("Presentation delay was aborted."),
      );
    if (durationMs === 0) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      const waiter: PackagePresentationDelayWaiter = {
        remainingMs: durationMs,
        resolve,
        reject,
        signal,
      };
      if (signal) {
        const abortListener = (): void => {
          if (!this.#presentationDelayWaiters.delete(waiter)) return;
          reject(new SceneLayoutError("Presentation delay was aborted."));
        };
        (waiter as { abortListener?: () => void }).abortListener =
          abortListener;
        signal.addEventListener("abort", abortListener, { once: true });
      }
      this.#presentationDelayWaiters.add(waiter);
    });
  }

  getMainReelVisibleOccurrence(x: number, y: number) {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      throw new SceneLayoutError(
        "Visible occurrence handles require a grid-cell main reel.",
      );
    return reel.getVisibleOccurrenceHandle(x, y);
  }

  runMainReelVisibleOccurrenceTransfer(
    input: import("../reel/index.js").VisibleOccurrenceTransferInput,
    choreography: (
      scope: import("../reel/index.js").VisibleOccurrenceTransferScope,
    ) => Promise<void>,
  ): Promise<void> {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      return Promise.reject(
        new SceneLayoutError(
          "Visible occurrence transfer requires a grid-cell main reel.",
        ),
      );
    return reel.runVisibleOccurrenceTransfer(input, choreography);
  }

  drainMainReelLandingPositions(): readonly {
    readonly x: number;
    readonly y: number;
  }[] {
    this.assertReady();
    const positions = Object.freeze(
      this.#pendingMainReelLandingPositions.splice(0),
    );
    return positions;
  }

  drainMainReelStartedPositions(): readonly {
    readonly x: number;
    readonly y: number;
  }[] {
    this.assertReady();
    return Object.freeze(this.#pendingMainReelStartedPositions.splice(0));
  }

  drainMainReelActivationPositions(): readonly {
    readonly x: number;
    readonly y: number;
  }[] {
    this.assertReady();
    return Object.freeze(this.#pendingMainReelActivationPositions.splice(0));
  }

  getMainReelSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ) {
    this.assertReady();
    return this.requireReel("main").getVisibleSymbolStateSnapshots(positions);
  }

  getMainReelSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ) {
    this.assertReady();
    return this.requireReel("main").getVisibleSymbolGeometrySnapshots(
      positions,
    );
  }

  hasMainReelSymbolStateCapability(
    position: { readonly x: number; readonly y: number },
    state: string,
  ): boolean {
    this.assertReady();
    return this.requireReel("main").hasVisibleSymbolStateCapability(
      position.x,
      position.y,
      state,
    );
  }

  getMainReelSceneSnapshot(): readonly (readonly number[])[] {
    this.assertReady();
    return this.requireReel("main").getVisibleScene();
  }

  getMainReelCascadeValues(): import("../reel/index.js").GridCellCascadeValueMatrix {
    this.assertReady();
    return this.requireReel("main").getCascadeValues();
  }

  releaseMainReelSymbols(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void {
    this.assertReady();
    this.requireReel("main").releaseVisibleSymbols(positions);
  }

  removeMainReelSymbols(
    options: import("../reel/index.js").GridCellTerminalRemoveOptions,
  ): Promise<void> {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      throw new SceneLayoutError(
        "Terminal remove requires a grid-cell main reel.",
      );
    return reel.removeVisibleSymbols(options);
  }

  setMainReelSymbolDimming(
    highlightedPositions: readonly {
      readonly x: number;
      readonly y: number;
    }[],
    dimmingAlpha: number,
  ): void {
    this.assertReady();
    this.requireReel("main").setVisibleSymbolDimming(
      highlightedPositions,
      dimmingAlpha,
    );
  }

  clearMainReelSymbolDimming(): void {
    this.assertReady();
    this.requireReel("main").clearVisibleSymbolDimming();
  }

  startMainReelCascadeDrop(
    plan: import("../reel/index.js").GridCellCascadeDropPlan,
  ): void {
    this.assertReady();
    this.requireReel("main").startCascadeDrop(plan);
  }

  startMainReelGridCellSpin(
    plan: import("../reel/index.js").GridCellReelSpinPlan,
    options?: import("../reel/index.js").RenderGridCellReelSetSpinOptions,
  ): void {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      throw new SceneLayoutError(
        "Custom grid-cell spin requires a grid-cell main reel.",
      );
    this.clearMainReelLandingPositions();
    if (plan.selective) reel.spinSelective(plan, options);
    else reel.spin(plan, options);
  }

  startMainReelEffectSweep(
    plan: import("../reel/index.js").GridCellEffectSweepPlan,
  ): void {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      throw new SceneLayoutError(
        "Effect sweep requires a grid-cell main reel.",
      );
    reel.startEffectSweep(plan);
  }

  attachMainReelOverlay(overlay: Container): () => void {
    this.assertReady();
    if (overlay.parent)
      throw new SceneLayoutError(
        "Main reel overlay must be detached before attach.",
      );
    const reel = this.requirePreparedReel("main");
    const parent = reel.parent;
    if (!parent)
      throw new SceneLayoutError("Main reel presentation is not attached.");
    const reelIndex = parent.getChildIndex(reel);
    parent.addChildAt(overlay, reelIndex + 1 + this.#mainReelOverlays.size);
    overlay.position.copyFrom(reel.position);
    this.#mainReelOverlays.add(overlay);
    let attached = true;
    return () => {
      if (!attached) return;
      attached = false;
      this.#mainReelOverlays.delete(overlay);
      overlay.parent?.removeChild(overlay);
    };
  }

  getReelPresentation(reelId: "main"): Container {
    this.assertReady();
    return this.requireReel(reelId);
  }

  getAwardCelebrationPopup(id: string): AwardCelebrationRuntime {
    this.assertReady();
    const popup = this.#popups.get(id);
    if (!popup)
      throw new SceneLayoutError(
        `Scene layout award celebration popup "${id}" is unavailable.`,
      );
    return popup;
  }

  getSpinePopup(id: string): SpinePopupRuntime {
    this.assertReady();
    const popup = this.#spinePopups.get(id);
    if (!popup)
      throw new SceneLayoutError(
        `Scene layout Spine popup "${id}" is unavailable.`,
      );
    return popup;
  }

  getSingleStatePopup(id: string): SingleStatePopupRuntime {
    this.assertReady();
    const popup = this.#singleStatePopups.get(id);
    if (!popup)
      throw new SceneLayoutError(
        `Scene layout single-state popup "${id}" is unavailable.`,
      );
    return popup;
  }

  getBackgroundPresentation(): Container {
    this.assertReady();
    return this.#layout.container;
  }

  getModeTransitionPresentation(): Container {
    this.assertReady();
    return this.#transitionRoot;
  }

  getPopupPresentation(): Container {
    this.assertReady();
    return this.#popupRoot;
  }

  bindPopupInput(options: SceneLayoutPopupInputBindingOptions): () => void {
    this.assertReady();
    if (this.#disposePopupInputBinding)
      throw new SceneLayoutError("Scene layout Popup input is already bound.");
    this.#popupRoot.off("pointerdown", this.#onPopupPointerDown);
    this.refreshPopupPointerInteraction();
    let disposeNative: () => void;
    try {
      disposeNative = bindPopupInteractionInput({
        ...options,
        dispatch: () => this.requestPrimaryPopupInteraction(),
      });
    } catch (error) {
      this.#popupRoot.on("pointerdown", this.#onPopupPointerDown);
      this.refreshPopupPointerInteraction();
      throw error;
    }
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      disposeNative();
      if (this.#disposePopupInputBinding !== dispose) return;
      this.#disposePopupInputBinding = null;
      if (this.#destroyed) return;
      this.#popupRoot.on("pointerdown", this.#onPopupPointerDown);
      this.refreshPopupPointerInteraction();
    };
    this.#disposePopupInputBinding = dispose;
    this.refreshPopupPointerInteraction();
    return dispose;
  }

  requestPrimaryPopupInteraction(): PopupInteractionDispatchResult {
    this.assertReady();
    const prelude = this.#activePrelude;
    if (prelude?.phase === "popup") {
      this.requestDismissGameModePrelude();
      return handledPopupInteraction();
    }
    if (prelude?.phase === "awaiting-video-start")
      return handledPopupInteraction(this.startPendingGameModeVideo());
    const awardId = this.#activePopupId ?? this.playingPopupId();
    if (!awardId) return unhandledPopupInteraction();
    this.getAwardCelebrationPopup(awardId).requestAdvance();
    return handledPopupInteraction();
  }

  getLayer(id: SceneLayoutLayerId): Container {
    this.assertReady();
    switch (id) {
      case "layout":
        return this.#layout.container;
      case "reel":
        return this.requireReel("main");
      case "transition":
        return this.#transitionRoot;
      case "popup":
        return this.#popupRoot;
    }
  }

  getRenderLayer(ref: SceneLayoutRenderLayerRef): RenderObjectLayer {
    this.assertReady();
    return resolveSceneLayoutRenderLayerRef(ref, {
      stable: (id) => {
        switch (id) {
          case "layout":
            return this.#layout.getRootRenderLayer();
          case "reel":
            this.requireReel("main");
            return this.#reelRenderLayerController.layer;
          case "transition":
            return this.#transitionRenderLayerController.layer;
          case "popup":
            return this.#popupRenderLayerController.layer;
        }
      },
      area: (areaId, placement) =>
        this.getSymbolArea(areaId).getLayer(placement),
      node: (nodeId, placement) =>
        this.#layout.getNodeRenderLayer(nodeId, placement),
    });
  }

  getGameModeIds(): readonly string[] {
    this.assertReady();
    return this.#gameModeIds;
  }

  getStableGameMode(): string {
    this.assertReady();
    return this.#stableMode!;
  }

  getGameModePhase(): "stable" | "transitioning" {
    this.assertReady();
    return this.#targetMode ? "transitioning" : "stable";
  }

  getGameModeSnapshot(): SceneLayoutGameModeSnapshot {
    this.assertReady();
    this.requireGameModes();
    return Object.freeze({
      stableMode: this.#stableMode!,
      displayedMode: this.#displayedMode!,
      targetMode: this.#targetMode,
      phase: this.#targetMode ? "transitioning" : "stable",
      transitionPhase: this.#activePrelude
        ? this.#activePrelude.phase
        : this.#activeTransition
          ? this.#activeTransition.switched
            ? "after-switch"
            : "before-switch"
          : null,
      transition: this.#activePrelude
        ? Object.freeze({
            from: this.#activePrelude.prepared.spec.from,
            to: this.#activePrelude.prepared.spec.to,
          })
        : this.#activeTransition
          ? Object.freeze({
              from: this.#activeTransition.spec.from,
              to: this.#activeTransition.spec.to,
            })
          : null,
      preparedTargetMode: this.#preparedTransition?.target.id ?? null,
      transitionKind:
        this.#activePrelude?.prepared.kind ??
        this.#activeTransition?.kind ??
        this.#preparedTransition?.kind ??
        null,
      activePreludePopup: this.#activePrelude?.popupId ?? null,
      mediaTimeSeconds:
        this.#activeTransition?.kind === "video"
          ? this.#activeTransition.player.currentTimeSeconds
          : null,
      mediaDurationSeconds:
        this.#activeTransition?.kind === "video"
          ? this.#activeTransition.player.durationSeconds
          : this.#preparedTransition?.kind === "video"
            ? this.#preparedTransition.player.durationSeconds
            : null,
      fadeProgress:
        this.#activeTransition?.kind === "video"
          ? this.videoFadeProgress(this.#activeTransition)
          : null,
      stableSymbolPackage: this.#stableSymbolPackageId,
      displayedSymbolPackage: this.#activeSymbolPackageId,
      targetSymbolPackage: this.#targetMode
        ? this.#targetSymbolPackageId
        : null,
      activeBackgroundNodes: this.#activeBackgroundNodes,
    });
  }

  async selectAuthoringGameMode(
    modeId: string,
    options: SceneLayoutGameModeRequestOptions = {},
  ): Promise<void> {
    this.assertCanPrepareTransition();
    const target = this.requireMode(modeId);
    if (modeId === this.#stableMode) {
      if (options.recreateReel === true || options.reels?.main)
        throw new SceneLayoutError(
          "Current authoring game mode must not receive a redundant reel input.",
        );
      return;
    }
    if (options.recreateReel !== undefined)
      throw new SceneLayoutError(
        "Authoring game mode selection does not support recreateReel.",
      );
    this.releasePreparedTransition(this.#preparedTransition);
    this.#preparedTransition = null;
    const source = this.requireMode(this.#stableMode!);
    const sourceBinding = this.resolveModeSymbolBinding(source);
    const targetBinding = this.resolveModeSymbolBinding(target);
    const bindingChanged = sourceBinding?.id !== targetBinding?.id;
    if (this.#presentationOnly && bindingChanged)
      throw new SceneLayoutError(
        "Presentation-only authoring selection requires source and target modes to share one symbol package binding.",
      );
    const targetInput = options.reels?.main;
    if (!bindingChanged && targetInput)
      throw new SceneLayoutError(
        "Authoring modes sharing a symbol package must not receive reels.main input.",
      );
    if (!targetBinding && targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${target.id}" has no symbol package and must not receive reels.main input.`,
      );
    this.#modeRequestInProgress = true;
    let prepared: PreparedModeTarget | null = null;
    try {
      if (bindingChanged && targetBinding)
        prepared = await this.prepareTargetReelEntry(
          targetBinding,
          targetInput,
          false,
        );
      this.commitModeGeometry(target.id);
      if (bindingChanged) {
        if (prepared) {
          this.activateReelEntry(prepared);
        } else {
          const previous = this.#reel;
          this.#reel = null;
          this.#catalog = null;
          this.#mainReelSceneCommitted = false;
          this.#reelRenderLayerController.detachAll();
          this.#reelRenderLayerRoot.parent?.removeChild(
            this.#reelRenderLayerRoot,
          );
          previous?.parent?.removeChild(previous);
          if (previous) previous.visible = false;
          this.#activeSymbolPackageId = null;
        }
        prepared = null;
      }
      this.commitModeVisibility(target);
      this.#stableMode = target.id;
      this.#displayedMode = target.id;
      this.#stableSymbolPackageId = this.#activeSymbolPackageId;
    } catch (error) {
      this.releasePreparedTarget(prepared);
      throw asSceneLayoutError(error);
    } finally {
      this.#modeRequestInProgress = false;
    }
  }

  async prepareGameModeTransition(
    modeId: string,
    options: SceneLayoutGameModeRequestOptions = {},
  ): Promise<void> {
    this.assertCanPrepareTransition();
    const signature = requestOptionsSignature(options);
    if (
      this.#preparedTransition?.target.id === modeId &&
      this.#preparedTransition.optionsSignature === signature
    )
      return;
    this.cancelPreparedGameModeTransition();
    this.#modeRequestInProgress = true;
    try {
      this.#preparedTransition = await this.buildPreparedTransition(
        modeId,
        options,
        signature,
      );
      this.assertReady();
    } catch (error) {
      this.releasePreparedTransition(this.#preparedTransition);
      this.#preparedTransition = null;
      throw asSceneLayoutError(error);
    } finally {
      this.#modeRequestInProgress = false;
    }
  }

  cancelPreparedGameModeTransition(): void {
    this.assertReady();
    if (this.#activeTransition || this.#targetMode)
      throw new SceneLayoutError(
        "Cannot cancel a scene layout game mode transition after it started.",
      );
    this.releasePreparedTransition(this.#preparedTransition);
    this.#preparedTransition = null;
  }

  requestGameMode(
    modeId: string,
    options: SceneLayoutGameModeRequestOptions = {},
  ): Promise<void> {
    let transition: SceneLayoutGameModeTransition;
    try {
      this.assertCanPrepareTransition();
      this.requireMode(modeId);
      if (modeId === this.#stableMode && options.recreateReel !== true) {
        if (options.preludePopupStrings?.length)
          throw new SceneLayoutError(
            "Current game mode has no transition prelude for string inputs.",
          );
        if (options.reels?.main)
          throw new SceneLayoutError(
            "Current game mode must not receive a redundant reels.main input.",
          );
        return Promise.resolve();
      }
      transition = this.findTransition(modeId);
      if (options.preludePopupStrings?.length && !transition.preludePopup)
        throw new SceneLayoutError(
          `Scene transition ${transition.from} -> ${transition.to} has no prelude Popup for string inputs.`,
        );
    } catch (error) {
      return Promise.reject(asSceneLayoutError(error));
    }
    const signature = requestOptionsSignature(options);
    if (
      !("kind" in transition.overlay) &&
      transition.overlay.resource.kind === "video"
    ) {
      const prepared = this.#preparedTransition;
      if (
        prepared?.kind !== "video" ||
        prepared.target.id !== modeId ||
        prepared.optionsSignature !== signature
      )
        return Promise.reject(
          new SceneLayoutError(
            `Video scene transition to "${modeId}" must be prepared before the trusted user gesture.`,
          ),
        );
      if (transition.preludePopup)
        return this.activatePreparedPrelude(
          prepared,
          transition.preludePopup,
          options.preludePopupStrings,
        );
      // This call is intentionally made before any await or visible mutation.
      let playPromise: Promise<void>;
      try {
        playPromise = prepared.player.play();
      } catch (error) {
        this.#preparedTransition = null;
        this.releasePreparedTransition(prepared);
        return Promise.reject(asSceneLayoutError(error));
      }
      return this.startPreparedVideoTransition(prepared, playPromise);
    }
    if ("kind" in transition.overlay)
      return this.startNoneTransition(modeId, options, signature);
    return this.startSpineTransition(modeId, options, signature);
  }

  requestPrimaryGameModeAction(
    options: SceneLayoutGameModeRequestOptions = {},
  ): Promise<void> {
    try {
      this.assertReady();
      const mode = this.requireMode(this.#stableMode!);
      const action = "primaryAction" in mode ? mode.primaryAction : undefined;
      if (!action) return Promise.resolve();
      return this.requestGameMode(action.targetMode, options);
    } catch (error) {
      return Promise.reject(asSceneLayoutError(error));
    }
  }

  startPendingGameModeVideo(): Promise<void> {
    this.assertReady();
    const active = this.#activePrelude;
    if (
      active?.phase !== "awaiting-video-start" ||
      active.prepared.kind !== "video"
    )
      return Promise.reject(
        new SceneLayoutError(
          "No completed game mode prelude is awaiting video start.",
        ),
      );
    let playPromise: Promise<void>;
    try {
      playPromise = active.prepared.player.play();
    } catch (error) {
      this.failActivePrelude(active, asSceneLayoutError(error));
      return Promise.reject(asSceneLayoutError(error));
    }
    this.#activePrelude = null;
    this.refreshPopupPointerInteraction();
    this.#preparedTransition = active.prepared;
    const continuation = this.startPreparedVideoTransition(
      active.prepared,
      playPromise,
    );
    void continuation.then(active.resolve, active.reject);
    return continuation;
  }

  requestDismissGameModePrelude(): void {
    this.assertReady();
    const active = this.#activePrelude;
    if (!active || active.phase !== "popup")
      throw new SceneLayoutError("No game mode transition prelude is active.");
    this.getSpinePopup(active.popupId).requestDismiss();
  }

  dismissGameModePreludeImmediately(): void {
    this.assertReady();
    const active = this.#activePrelude;
    if (!active) return;
    this.failActivePrelude(
      active,
      new SceneLayoutError("Game mode transition prelude was dismissed."),
    );
  }

  startAwardCelebrationForCurrentMode(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): void {
    this.assertReady();
    const modes = this.requireGameModes();
    if (this.#targetMode)
      throw new SceneLayoutError(
        "Cannot start an award celebration during a game mode transition.",
      );
    if (this.playingPopupId())
      throw new SceneLayoutError("An award celebration is already active.");
    if (!Number.isSafeInteger(input.betAmountRaw) || input.betAmountRaw <= 0)
      throw new SceneLayoutError(
        "betAmountRaw must be a positive safe integer.",
      );
    if (!Number.isSafeInteger(input.winAmountRaw) || input.winAmountRaw < 0)
      throw new SceneLayoutError(
        "winAmountRaw must be a non-negative safe integer.",
      );
    const mode = modes.modes.find(
      (candidate) => candidate.id === this.#stableMode,
    )!;
    if (!mode.awardCelebrationPopup)
      throw new SceneLayoutError(
        `Scene layout game mode "${mode.id}" has no award celebration popup.`,
      );
    const popup = this.getAwardCelebrationPopup(mode.awardCelebrationPopup);
    popup.start(input);
    if (popup.isPlaying()) {
      this.#activePopupId = mode.awardCelebrationPopup;
      this.refreshPopupPointerInteraction();
    }
  }

  playAwardCelebrationForCurrentMode(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): Promise<void> {
    this.startAwardCelebrationForCurrentMode(input);
    const popupId = this.#activePopupId;
    if (!popupId) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      this.#activeAwardCelebrationWaiter = { popupId, resolve, reject };
    });
  }

  requestAdvanceAwardCelebration(): void {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) throw new SceneLayoutError("No award celebration is active.");
    this.getAwardCelebrationPopup(id).requestAdvance();
  }

  dismissActiveAwardCelebrationImmediately(): void {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) return;
    this.getAwardCelebrationPopup(id).dismissImmediately();
    this.#activePopupId = null;
    this.refreshPopupPointerInteraction();
    if (this.#activeAwardCelebrationWaiter?.popupId === id) {
      const waiter = this.#activeAwardCelebrationWaiter;
      this.#activeAwardCelebrationWaiter = null;
      waiter.resolve();
    }
  }

  getActiveAwardCelebrationPhase() {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) return null;
    return this.getAwardCelebrationPopup(id).getPhase();
  }

  #createActiveAwardCelebrationSnapshot() {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) return null;
    return inspectAwardCelebrationRuntime(this.getAwardCelebrationPopup(id));
  }

  getSnapshot(): SceneLayoutSnapshot {
    this.assertReady();
    return this.#layout.getSnapshot();
  }

  getLayoutPoint(selector: SceneLayoutPointSelector): SceneLayoutPoint {
    this.assertReady();
    return this.#layout.getLayoutPoint(selector);
  }

  getLayoutAnchor(point: SceneLayoutPoint) {
    this.assertReady();
    return this.#layout.getLayoutAnchor(point);
  }

  resolveLayoutAnchor(anchor: import("../presentation/index.js").RenderAnchor) {
    this.assertReady();
    return this.#layout.resolveLayoutAnchor(anchor);
  }

  getNode(id: string): Container {
    this.assertReady();
    return this.#layout.getNode(id);
  }

  getRootRenderLayer(): RenderObjectLayer {
    this.assertReady();
    return this.#layout.getRootRenderLayer();
  }

  getNodeRenderLayer(
    nodeId: string,
    placement: SceneLayoutNodeRenderLayerPlacement = "child",
  ): RenderObjectLayer {
    this.assertReady();
    return this.#layout.getNodeRenderLayer(nodeId, placement);
  }

  getNodeAnchor(id: string) {
    this.assertReady();
    return createContainerRenderAnchor(this.#layout.getNode(id));
  }

  getRenderObject(nodeId: string): SceneLayoutRenderObject | null {
    this.assertReady();
    return this.#layout.getRenderObject(nodeId);
  }

  attachChild(options: AttachChildOptions): () => void {
    this.assertReady();
    return this.#layout.attachChild(options);
  }

  attachRelative(options: AttachRelativeOptions): () => void {
    this.assertReady();
    return this.#layout.attachRelative(options);
  }

  getReelGrid(id: string): ResolvedSceneLayoutReelGrid {
    this.assertReady();
    return this.#layout.getReelGrid(id);
  }

  getImageStringNodeNames(): readonly string[] {
    this.assertReady();
    return this.#layout.getImageStringNodeNames();
  }

  setImageStringText(nodeId: string, text: string): void {
    this.assertReady();
    this.#layout.setImageStringText(nodeId, text);
  }

  getImageStringText(nodeId: string): string {
    this.assertReady();
    return this.#layout.getImageStringText(nodeId);
  }

  createRenderObject(
    name: string,
  ): Promise<import("../presentation/index.js").RenderObject> {
    this.assertReady();
    return this.#renderObjectFactory.createRenderObject(name);
  }

  createImgNumberRenderObject(
    name: string,
    options: {
      readonly text: string;
      readonly anchor?: { readonly x: number; readonly y: number };
    },
  ): Promise<import("../presentation/index.js").ImgNumberRenderObject> {
    this.assertReady();
    return this.#renderObjectFactory.createImgNumberRenderObject(name, options);
  }

  requestNodeState(nodeId: string, state: string): Promise<void> {
    this.assertReady();
    return this.#layout.requestNodeState(nodeId, state);
  }

  canRequestNodeState(nodeId: string, state: string): boolean {
    this.assertReady();
    return this.#layout.canRequestNodeState(nodeId, state);
  }

  getNodeStateSnapshot(nodeId: string): SceneLayoutNodeStateSnapshot {
    this.assertReady();
    return this.#layout.getNodeStateSnapshot(nodeId);
  }

  setNodeActive(nodeId: string, active: boolean): void {
    this.assertReady();
    this.#layout.setNodeActive(nodeId, active);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    activeAwardSnapshotReaders.delete(this);
    gameModeSnapshotReaders.delete(this);
    for (const waiter of this.#presentationDelayWaiters) {
      waiter.signal?.removeEventListener("abort", waiter.abortListener!);
      waiter.reject(
        new SceneLayoutError("Presentation delay runtime was destroyed."),
      );
    }
    this.#presentationDelayWaiters.clear();
    if (this.#activeAwardCelebrationWaiter) {
      const waiter = this.#activeAwardCelebrationWaiter;
      this.#activeAwardCelebrationWaiter = null;
      waiter.reject(
        new SceneLayoutError(
          "Scene layout package runtime was destroyed during an award celebration.",
        ),
      );
    }
    this.#disposePopupInputBinding?.();
    this.#disposePopupInputBinding = null;
    this.releasePreparedTransition(this.#preparedTransition);
    this.#preparedTransition = null;
    if (this.#activeTransition) {
      const active = this.#activeTransition;
      this.#activeTransition = null;
      active.player.destroy();
      if (!active.switched) this.releasePreparedTarget(active.prepared);
      active.reject(
        new SceneLayoutError(
          "Scene layout package runtime was destroyed during a game mode transition.",
        ),
      );
    }
    if (this.#activePrelude) {
      const active = this.#activePrelude;
      this.#activePrelude = null;
      this.refreshPopupPointerInteraction();
      this.#spinePopups.get(active.popupId)?.dismissImmediately();
      active.restorePopupStrings();
      this.releasePreparedTransition(active.prepared);
      active.reject(
        new SceneLayoutError(
          "Scene layout package runtime was destroyed during a game mode transition prelude.",
        ),
      );
    }
    this.#reelRenderLayerController.detachAll();
    this.#popupRenderLayerController.detachAll();
    this.#transitionRenderLayerController.detachAll();
    this.#reelRenderLayerRoot.parent?.removeChild(this.#reelRenderLayerRoot);
    const retainedReels = new Set(
      [...this.#reelEntries.values()].map((entry) => entry.reel),
    );
    for (const reel of retainedReels) {
      reel.parent?.removeChild(reel);
      reel.destroy({ children: true });
    }
    if (this.#reel && !retainedReels.has(this.#reel))
      this.#reel.destroy({ children: true });
    this.#reelEntries.clear();
    this.#reel = null;
    this.#mainReelSceneCommitted = false;
    for (const overlay of this.#mainReelOverlays)
      overlay.parent?.removeChild(overlay);
    this.#mainReelOverlays.clear();
    this.clearMainReelLandingPositions();
    this.#catalog = null;
    for (const popup of this.#popups.values()) popup.destroy();
    this.#popups.clear();
    for (const popup of this.#spinePopups.values()) popup.destroy();
    this.#spinePopups.clear();
    for (const popup of this.#singleStatePopups.values()) popup.destroy();
    this.#singleStatePopups.clear();
    this.#popupAudioStates.clear();
    this.#popupAudioHandles.clear();
    this.#symbolAudioHandles.clear();
    this.#videoBlackoutRoot.removeChildren();
    this.#videoBlackout.destroy();
    this.#disposeAudioMusicObserver();
    this.#addressController.destroy();
    this.#renderObjectFactory.destroy();
    this.#audio.destroy();
    this.#layout.destroy();
    this.#resource.destroy();
    this.#initialized = false;
    this.#stableMode = null;
    this.#gameModeIds = Object.freeze([]);
    this.#displayedMode = null;
    this.#targetMode = null;
    this.#modeRequestInProgress = false;
    this.#activePopupId = null;
    this.#activeSymbolPackageId = null;
    this.#stableSymbolPackageId = null;
    this.#targetSymbolPackageId = null;
    this.#activeBackgroundNodes = Object.freeze([]);
    this.#viewportSize = null;
  }

  private assertProgrammaticAudioRoute(route: string): void {
    if (!this.#resource.programmaticAudioEffects.has(route))
      throw new SceneLayoutError(
        `Audio effect route is not programmatic: ${route}.`,
      );
  }

  private updatePopupAudioCues(): void {
    for (const [popupId, resource] of Object.entries(
      this.#resource.popupPackages,
    )) {
      if (!("audio" in resource.manifest)) continue;
      let target: string | null = null;
      const award = this.#popups.get(popupId);
      if (award?.isPlaying()) {
        const snapshot = inspectAwardCelebrationRuntime(award);
        if (snapshot.activeTierId)
          target = `award-tier:${snapshot.activeTierId}`;
      }
      const spine = this.#spinePopups.get(popupId);
      if (spine?.isPlaying()) {
        const phase = spine.getPhase();
        if (phase === "start" || phase === "loop" || phase === "end")
          target = `segment:${phase}`;
      }
      if (target === null) {
        this.cancelPendingAudioHandles(this.#popupAudioHandles.get(popupId));
        this.#popupAudioHandles.delete(popupId);
        this.#popupAudioStates.delete(popupId);
        continue;
      }
      if (this.#popupAudioStates.get(popupId) === target) continue;
      this.cancelPendingAudioHandles(this.#popupAudioHandles.get(popupId));
      this.#popupAudioHandles.delete(popupId);
      this.#popupAudioStates.set(popupId, target);
      const handles: AudioPlaybackHandle[] = [];
      for (const cue of resource.manifest.audio.cues) {
        const cueTarget =
          cue.target.kind === "segment"
            ? `segment:${cue.target.segment}`
            : `award-tier:${cue.target.tier}`;
        if (cueTarget === target)
          handles.push(this.#audio.playEffect(`${popupId}.${cue.effect}`));
      }
      if (handles.length) this.#popupAudioHandles.set(popupId, handles);
    }
  }

  private cancelPendingAudioHandles(
    handles: readonly AudioPlaybackHandle[] | undefined,
  ): void {
    for (const handle of handles ?? [])
      if (handle.state === "pending") handle.stop();
  }

  private syncStableModeMusic(force = false): void {
    if (!this.#audioUnlocked) return;
    const modeId = this.#stableMode;
    if (!modeId || (!force && this.#audioMode === modeId)) return;
    const mode = this.#resource.runtimeManifest.gameModes.modes.find(
      (candidate) => candidate.id === modeId,
    );
    if (!mode)
      throw new SceneLayoutError(
        `Stable Scene Layout mode is unknown: ${modeId}.`,
      );
    this.#audioMode = modeId;
    void this.#audio.requestMusic(mode.bgm ?? null).catch((error: unknown) => {
      if (this.#destroyed || this.#audioMode !== modeId) return;
      this.#audioFailure = new SceneLayoutError(
        `Failed to activate BGM for mode "${modeId}": ${error instanceof Error ? error.message : String(error)}`,
      );
    });
  }

  private updatePresentationDelayWaiters(deltaSeconds: number): void {
    const deltaMs = deltaSeconds * 1000;
    for (const waiter of [...this.#presentationDelayWaiters]) {
      waiter.remainingMs -= deltaMs;
      if (waiter.remainingMs > 0) continue;
      this.#presentationDelayWaiters.delete(waiter);
      waiter.signal?.removeEventListener("abort", waiter.abortListener!);
      waiter.resolve();
    }
  }

  private assertCanPrepareTransition(): void {
    this.assertReady();
    if (this.#modeRequestInProgress || this.#targetMode)
      throw new SceneLayoutError(
        `A scene layout game mode transition is already in progress${this.#targetMode ? ` to "${this.#targetMode}"` : " during target preparation"}.`,
      );
    if (this.playingPopupId())
      throw new SceneLayoutError(
        "Cannot change scene layout game mode while an award celebration is active.",
      );
  }

  private findTransition(modeId: string): SceneLayoutGameModeTransition {
    const modes = this.requireGameModes();
    const mode = modes.modes.find((candidate) => candidate.id === modeId);
    if (!mode)
      throw new SceneLayoutError(`Unknown scene layout game mode "${modeId}".`);
    const source = modes.modes.find(
      (candidate) => candidate.id === this.#stableMode,
    )!;
    const transition = (modes.transitions ?? []).find(
      (candidate) => candidate.from === source.id && candidate.to === mode.id,
    );
    if (!transition)
      throw new SceneLayoutError(
        `No direct scene transition exists from "${source.id}" to "${mode.id}".`,
      );
    return transition;
  }

  private async buildPreparedTransition(
    modeId: string,
    options: SceneLayoutGameModeRequestOptions,
    optionsSignature: string,
    onSpinePrepared?: (
      prepared: Extract<PreparedModeTransition, { readonly kind: "spine" }>,
    ) => void,
  ): Promise<PreparedModeTransition> {
    const transition = this.findTransition(modeId);
    const source = this.requireMode(this.#stableMode!);
    const target = this.requireMode(modeId);
    const geometry = materializeModeGeometry(this.#document, target.id);
    if (
      options.recreateReel !== undefined &&
      typeof options.recreateReel !== "boolean"
    )
      throw new SceneLayoutError(
        "recreateReel must be a boolean when provided.",
      );
    const recreateReel = options.recreateReel === true;
    const sourceBinding = this.resolveModeSymbolBinding(source);
    const targetBinding = this.resolveModeSymbolBinding(target);
    if (recreateReel && !targetBinding)
      throw new SceneLayoutError(
        `Scene layout game mode "${target.id}" has no symbol package to recreate.`,
      );
    const bindingChanged =
      sourceBinding?.id !== targetBinding?.id || recreateReel;
    if (this.#presentationOnly && bindingChanged)
      throw new SceneLayoutError(
        "Presentation-only scene layout runtime requires source and target modes to share one symbol package binding.",
      );
    const targetInput = options.reels?.main;
    if (!bindingChanged && targetInput)
      throw new SceneLayoutError(
        "Game modes sharing a symbol package must not receive reels.main input.",
      );
    if (!targetBinding && targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${target.id}" has no symbol package and must not receive reels.main input.`,
      );
    let prepared: PreparedModeTarget | null = null;
    try {
      if (bindingChanged && targetBinding)
        prepared = await this.prepareTargetReelEntry(
          targetBinding,
          targetInput,
          recreateReel,
        );
      const common = {
        spec: transition,
        geometry,
        source,
        target,
        prepared,
        bindingChanged,
        targetSymbolPackageId: targetBinding?.id ?? null,
        optionsSignature,
      };
      const overlay = transition.overlay;
      if ("kind" in overlay) return { ...common, kind: "none" as const };
      if ("fadeOutSeconds" in overlay) {
        const url = this.#resource.layout.videoUrls[overlay.resource.path];
        if (!url)
          throw new SceneLayoutError(
            `Scene transition video ${transition.from} -> ${transition.to} is unavailable.`,
          );
        const player = this.#createVideoTransitionPlayer({
          url,
          fadeOutSeconds: overlay.fadeOutSeconds,
        });
        try {
          await player.prepare();
          this.assertReady();
        } catch (error) {
          player.destroy();
          throw error;
        }
        return { ...common, kind: "video", player };
      }
      const playerResource =
        this.#resource.layout.spineResources[
          transitionResourceKey(transition.from, transition.to)
        ];
      if (!playerResource)
        throw new SceneLayoutError(
          `Scene transition resource ${transition.from} -> ${transition.to} is unavailable.`,
        );
      const player = this.#createTransitionPlayer({ resource: playerResource });
      try {
        await player.init();
        this.assertReady();
      } catch (error) {
        player.destroy();
        throw error;
      }
      const result = { ...common, kind: "spine" as const, player };
      onSpinePrepared?.(result);
      return result;
    } catch (error) {
      this.releasePreparedTarget(prepared);
      throw error;
    }
  }

  private async startSpineTransition(
    modeId: string,
    options: SceneLayoutGameModeRequestOptions,
    signature: string,
  ): Promise<void> {
    this.assertCanPrepareTransition();
    let prepared = this.#preparedTransition;
    let directlyStarted: Promise<void> | null = null;
    if (
      prepared?.kind !== "spine" ||
      prepared.target.id !== modeId ||
      prepared.optionsSignature !== signature
    ) {
      this.releasePreparedTransition(prepared);
      this.#preparedTransition = null;
      this.#modeRequestInProgress = true;
      try {
        prepared = await this.buildPreparedTransition(
          modeId,
          options,
          signature,
          (ready) => {
            directlyStarted = this.activatePreparedSpineRequest(
              ready,
              options.preludePopupStrings,
            );
          },
        );
      } finally {
        this.#modeRequestInProgress = false;
      }
    }
    if (prepared.kind !== "spine")
      throw new SceneLayoutError(
        "Prepared transition kind changed unexpectedly.",
      );
    if (directlyStarted) return await directlyStarted;
    return await this.activatePreparedSpineRequest(
      prepared,
      options.preludePopupStrings,
    );
  }

  private activatePreparedSpineRequest(
    prepared: Extract<PreparedModeTransition, { readonly kind: "spine" }>,
    popupStrings?: readonly SceneLayoutPopupStringInput[],
  ): Promise<void> {
    return "preludePopup" in prepared.spec && prepared.spec.preludePopup
      ? this.activatePreparedPrelude(
          prepared,
          prepared.spec.preludePopup,
          popupStrings,
        )
      : this.activatePreparedSpineTransition(prepared);
  }

  private activatePreparedPrelude(
    prepared: PreparedModeTransition,
    popupId: string,
    popupStrings?: readonly SceneLayoutPopupStringInput[],
  ): Promise<void> {
    this.#preparedTransition = null;
    const popup = this.getSpinePopup(popupId);
    let restorePopupStrings = () => {};
    let startingPopup = false;
    try {
      restorePopupStrings = applyPopupStringInputs(popup, popupStrings);
      popup.dismissImmediately();
      startingPopup = true;
      popup.start();
      this.#targetMode = prepared.target.id;
      this.#targetSymbolPackageId = prepared.targetSymbolPackageId;
      return new Promise<void>((resolve, reject) => {
        this.#activePrelude = {
          prepared,
          popupId,
          restorePopupStrings,
          phase: "popup",
          resolve,
          reject,
        };
        this.refreshPopupPointerInteraction();
      });
    } catch (error) {
      if (startingPopup) popup.dismissImmediately();
      restorePopupStrings();
      this.releasePreparedTransition(prepared);
      throw asSceneLayoutError(error);
    }
  }

  private async startNoneTransition(
    modeId: string,
    options: SceneLayoutGameModeRequestOptions,
    signature: string,
  ): Promise<void> {
    this.assertCanPrepareTransition();
    let prepared = this.#preparedTransition;
    if (
      prepared?.kind !== "none" ||
      prepared.target.id !== modeId ||
      prepared.optionsSignature !== signature
    ) {
      this.releasePreparedTransition(prepared);
      this.#preparedTransition = null;
      this.#modeRequestInProgress = true;
      try {
        prepared = await this.buildPreparedTransition(
          modeId,
          options,
          signature,
        );
      } finally {
        this.#modeRequestInProgress = false;
      }
    }
    if (prepared.kind !== "none")
      throw new SceneLayoutError(
        "Prepared transition kind changed unexpectedly.",
      );
    return prepared.spec.preludePopup
      ? this.activatePreparedPrelude(
          prepared,
          prepared.spec.preludePopup,
          options.preludePopupStrings,
        )
      : this.activatePreparedNoneTransition(prepared);
  }

  private async activatePreparedNoneTransition(
    prepared: Extract<PreparedModeTransition, { readonly kind: "none" }>,
  ): Promise<void> {
    this.#preparedTransition = null;
    this.#targetMode = prepared.target.id;
    this.#targetSymbolPackageId = prepared.targetSymbolPackageId;
    try {
      this.commitPreparedTarget(prepared);
      this.#stableMode = prepared.target.id;
      this.#displayedMode = prepared.target.id;
      this.#stableSymbolPackageId = this.#activeSymbolPackageId;
      this.#targetMode = null;
      this.#targetSymbolPackageId = null;
    } catch (error) {
      this.releasePreparedTarget(prepared.prepared);
      this.#targetMode = null;
      this.#targetSymbolPackageId = null;
      throw asSceneLayoutError(error);
    }
  }

  private async activatePreparedSpineTransition(
    prepared: Extract<PreparedModeTransition, { readonly kind: "spine" }>,
  ): Promise<void> {
    const overlay = prepared.spec.overlay;
    if (!("animation" in overlay))
      throw new SceneLayoutError("Prepared Spine transition schema mismatch.");
    this.#preparedTransition = null;
    let started = false;
    try {
      prepared.player.play({
        animationName: overlay.animation,
        loop: false,
      });
      this.#targetMode = prepared.target.id;
      this.#targetSymbolPackageId = prepared.targetSymbolPackageId;
      this.#transitionRoot.addChild(prepared.player.view);
      const snapshot = this.#layout.getSnapshot();
      const placement = overlay.placements[snapshot.variantId]!;
      prepared.player.view.position.set(
        (this.#manifest.coordinateOrigin ?? "top-left") === "center"
          ? snapshot.artSize.width / 2 + placement.x
          : placement.x,
        (this.#manifest.coordinateOrigin ?? "top-left") === "center"
          ? snapshot.artSize.height / 2 + placement.y
          : placement.y,
      );
      prepared.player.view.scale.set(placement.scale);
      started = true;
      return await new Promise<void>((resolve, reject) => {
        this.#activeTransition = {
          ...prepared,
          switched: false,
          switchEventCount: 0,
          resolve,
          reject,
        };
      });
    } catch (error) {
      if (!started) this.releasePreparedTransition(prepared);
      throw asSceneLayoutError(error);
    }
  }

  private async startPreparedVideoTransition(
    prepared: Extract<PreparedModeTransition, { readonly kind: "video" }>,
    playPromise: Promise<void>,
  ): Promise<void> {
    this.#modeRequestInProgress = true;
    let started = false;
    try {
      await playPromise;
      this.assertReady();
      if (this.#preparedTransition !== prepared)
        throw new SceneLayoutError(
          "Prepared video transition changed before playback started.",
        );
      this.#preparedTransition = null;
      this.#targetMode = prepared.target.id;
      this.#targetSymbolPackageId = prepared.targetSymbolPackageId;
      this.#videoBlackoutRoot.addChild(prepared.player.view);
      this.#videoBlackoutRoot.visible = true;
      this.#videoBlackoutRoot.alpha = 1;
      prepared.player.view.alpha = 1;
      if (!this.#viewportSize)
        throw new SceneLayoutError(
          "Scene layout viewport must be applied before a video transition.",
        );
      prepared.player.applyViewport(this.#viewportSize);
      this.redrawVideoBlackout(this.#viewportSize);
      started = true;
      return await new Promise<void>((resolve, reject) => {
        const active: Extract<
          ActiveModeTransition,
          { readonly kind: "video" }
        > = {
          ...prepared,
          switched: false,
          resolve,
          reject,
        };
        this.#activeTransition = active;
        try {
          this.#addressController.emit(
            formatGameLayoutRuntimeAddress(
              "transition",
              prepared.spec.from,
              prepared.spec.to,
              "effect",
              "video",
              "lifecycle",
              "started",
            ),
            Object.freeze({
              from: prepared.spec.from,
              to: prepared.spec.to,
            }),
          );
        } catch (error) {
          this.failActiveTransition(active, asSceneLayoutError(error));
        }
      });
    } catch (error) {
      if (this.#preparedTransition === prepared)
        this.#preparedTransition = null;
      if (!started) this.releasePreparedTransition(prepared);
      throw asSceneLayoutError(error);
    } finally {
      this.#modeRequestInProgress = false;
    }
  }

  private releasePreparedTransition(
    prepared: PreparedModeTransition | null,
  ): void {
    if (!prepared) return;
    if (prepared.kind !== "none") prepared.player.destroy();
    this.releasePreparedTarget(prepared.prepared);
  }

  private updateActiveTransition(deltaSeconds: number): void {
    const active = this.#activeTransition;
    if (!active) return;
    try {
      if (active.kind === "video") {
        this.updateActiveVideoTransition(active);
        return;
      }
      const result = active.player.update(deltaSeconds);
      const overlay = active.spec.overlay;
      if (!("switchEvent" in overlay))
        throw new SceneLayoutError("Active Spine transition schema mismatch.");
      for (const event of result.events) {
        if (event.name !== overlay.switchEvent) continue;
        active.switchEventCount += 1;
        if (active.switchEventCount !== 1)
          throw new SceneLayoutError(
            `Scene transition ${active.spec.from} -> ${active.spec.to} emitted switch event "${event.name}" more than once.`,
          );
        this.commitActiveTransition(active);
        this.#addressController.emit(
          formatGameLayoutRuntimeAddress(
            "transition",
            active.spec.from,
            active.spec.to,
            "effect",
            "spine",
            "event",
            event.name,
          ),
          Object.freeze({
            from: active.spec.from,
            to: active.spec.to,
            animation: overlay.animation,
            event: event.name,
          }),
        );
      }
      if (!result.completed) return;
      if (!active.switched)
        throw new SceneLayoutError(
          `Scene transition ${active.spec.from} -> ${active.spec.to} completed without switch event "${overlay.switchEvent}".`,
        );
      this.completeActiveTransition(active);
    } catch (error) {
      this.failActiveTransition(active, asSceneLayoutError(error));
    }
  }

  private updateActivePrelude(): void {
    const active = this.#activePrelude;
    if (!active) return;
    const popup = this.getSpinePopup(active.popupId);
    if (popup.getPhase() !== "complete") return;
    active.restorePopupStrings();
    if (active.prepared.kind === "video") {
      active.phase = "awaiting-video-start";
      return;
    }
    this.#activePrelude = null;
    this.refreshPopupPointerInteraction();
    const continuation =
      active.prepared.kind === "none"
        ? this.activatePreparedNoneTransition(active.prepared)
        : this.activatePreparedSpineTransition(active.prepared);
    void continuation.then(active.resolve, active.reject);
  }

  private failActivePrelude(
    active: ActiveModePrelude,
    error: SceneLayoutError,
  ): void {
    if (this.#activePrelude !== active) return;
    this.#activePrelude = null;
    this.refreshPopupPointerInteraction();
    this.getSpinePopup(active.popupId).dismissImmediately();
    active.restorePopupStrings();
    this.releasePreparedTransition(active.prepared);
    this.#targetMode = null;
    this.#targetSymbolPackageId = null;
    active.reject(error);
  }

  private refreshPopupPointerInteraction(): void {
    this.#popupRoot.eventMode =
      !this.#disposePopupInputBinding &&
      (this.#activePrelude || this.#activePopupId)
        ? "static"
        : "none";
  }

  private updateActiveVideoTransition(
    active: Extract<ActiveModeTransition, { readonly kind: "video" }>,
  ): void {
    if (active.player.fatalError) throw active.player.fatalError;
    const fadeProgress = this.videoFadeProgress(active);
    const overlay = active.spec.overlay;
    if (!("fadeOutSeconds" in overlay))
      throw new SceneLayoutError("Active video transition schema mismatch.");
    const fadeStart = active.player.durationSeconds - overlay.fadeOutSeconds;
    if (active.player.currentTimeSeconds >= fadeStart && !active.switched)
      this.commitActiveTransition(active);
    const alpha = 1 - fadeProgress;
    active.player.view.alpha = alpha;
    this.#videoBlackout.alpha = alpha;
    if (!active.player.ended) return;
    if (!active.switched) this.commitActiveTransition(active);
    this.completeActiveTransition(active);
  }

  private videoFadeProgress(
    active: Extract<ActiveModeTransition, { readonly kind: "video" }>,
  ): number {
    const overlay = active.spec.overlay;
    if (!("fadeOutSeconds" in overlay)) return 0;
    const fadeSeconds = overlay.fadeOutSeconds;
    const fadeStart = active.player.durationSeconds - fadeSeconds;
    return Math.max(
      0,
      Math.min(1, (active.player.currentTimeSeconds - fadeStart) / fadeSeconds),
    );
  }

  private redrawVideoBlackout(viewportSize: RenderViewportSize): void {
    this.#videoBlackout.clear();
    this.#videoBlackout
      .rect(0, 0, viewportSize.width, viewportSize.height)
      .fill({ color: 0x000000, alpha: 1 });
  }

  private commitActiveTransition(active: ActiveModeTransition): void {
    if (active.switched) return;
    this.commitPreparedTarget(active);
    active.switched = true;
  }

  private commitPreparedTarget(active: PreparedModeTransitionBase): void {
    this.commitModeGeometry(active.target.id, active.geometry);
    if (active.bindingChanged) {
      if (active.prepared) {
        this.activateReelEntry(active.prepared);
      } else {
        const previous = this.#reel;
        this.#reel = null;
        this.#catalog = null;
        this.#mainReelSceneCommitted = false;
        this.#reelRenderLayerController.detachAll();
        this.#reelRenderLayerRoot.parent?.removeChild(
          this.#reelRenderLayerRoot,
        );
        previous?.parent?.removeChild(previous);
        if (previous) previous.visible = false;
        this.#activeSymbolPackageId = null;
      }
    }
    this.commitModeVisibility(active.target);
    this.#displayedMode = active.target.id;
  }

  private completeActiveTransition(active: ActiveModeTransition): void {
    if (this.#activeTransition !== active) return;
    active.player.destroy();
    if (active.kind === "video") this.hideVideoBlackout();
    this.#stableMode = active.target.id;
    this.#displayedMode = active.target.id;
    this.#stableSymbolPackageId = this.#activeSymbolPackageId;
    this.#targetMode = null;
    this.#targetSymbolPackageId = null;
    this.#activeTransition = null;
    this.refreshCommittedGeometryPresentation();
    if (active.kind === "video") {
      try {
        this.#addressController.emit(
          formatGameLayoutRuntimeAddress(
            "transition",
            active.spec.from,
            active.spec.to,
            "effect",
            "video",
            "lifecycle",
            "ended",
          ),
          Object.freeze({ from: active.spec.from, to: active.spec.to }),
        );
      } catch (error) {
        active.reject(asSceneLayoutError(error));
        return;
      }
    }
    active.resolve();
  }

  private failActiveTransition(
    active: ActiveModeTransition,
    error: SceneLayoutError,
  ): void {
    if (this.#activeTransition !== active) return;
    active.player.destroy();
    if (active.kind === "video") this.hideVideoBlackout();
    if (!active.switched) this.releasePreparedTarget(active.prepared);
    else {
      this.#stableMode = active.target.id;
      this.#stableSymbolPackageId = this.#activeSymbolPackageId;
    }
    this.#targetMode = null;
    this.#targetSymbolPackageId = null;
    this.#activeTransition = null;
    if (active.switched) this.refreshCommittedGeometryPresentation();
    active.reject(error);
  }

  private createReelPresentation(
    resource: SymbolPackageResource,
    catalog: SymbolCatalogModel,
    binding: SceneLayoutSymbolPackageBinding,
  ): ReelPresentation {
    const geometry = this.#manifest.reels.main!;
    const reels = resource.gameConfig.getReels(binding.reelSet);
    const registry = createSymbolPackageReelRegistryFromCatalog(
      resource,
      catalog,
      { valueTextBindings: this.#symbolValueTextBindings },
    );
    if (binding.renderMode === "standard") {
      return new RenderReelSet({
        reels,
        registry,
        layout: createReelLayout({
          reelCount: geometry.columns,
          visibleRows: geometry.rows,
          cellWidth: geometry.cellSize.width,
          cellHeight: geometry.cellSize.height,
          columnGap: geometry.gap.x,
          rowGap: geometry.gap.y,
        }),
        ...(this.#reelPresentation?.kind === "standard"
          ? { bounceStrength: this.#reelPresentation.bounceStrength }
          : {}),
        ...(this.#areaSpinFunction
          ? { areaSpinFunction: this.#areaSpinFunction }
          : {}),
        ...(this.#reelPresentation?.kind === "standard"
          ? {
              reelSpin: {
                direction: this.#reelPresentation.direction,
                durationMs: this.#reelPresentation.baseDurationMs,
                speedSymbolsPerSecond:
                  this.#reelPresentation.speedSymbolsPerSecond,
                minimumSpinCycles: this.#reelPresentation.minimumSpinCycles,
              },
            }
          : {}),
      });
    }
    return new RenderGridCellReelSet({
      reels,
      registry,
      columns: geometry.columns,
      rows: geometry.rows,
      cellWidth: geometry.cellSize.width,
      cellHeight: geometry.cellSize.height,
      columnGap: geometry.gap.x,
      rowGap: geometry.gap.y,
      order: createGridCellOrder({
        columns: geometry.columns,
        rows: geometry.rows,
        mode: "top-down-left-right",
      }),
      ...(this.#reelPresentation?.kind === "grid-cell"
        ? { bounceStrength: this.#reelPresentation.bounceStrength }
        : {}),
      ...(this.#gridCellPresentation?.createEffectController
        ? {
            effectController:
              this.#gridCellPresentation.createEffectController(),
          }
        : {}),
      ...(this.#gridCellPresentation?.presentationValueResolver
        ? {
            presentationValueResolver:
              this.#gridCellPresentation.presentationValueResolver,
          }
        : {}),
      occurrenceEffectPlayerFactory:
        createSceneLayoutOccurrenceEffectPlayerFactory(this.#resource),
    });
  }

  private async prepareTargetReelEntry(
    binding: ResolvedSymbolBinding,
    input: SceneLayoutInitialReelScene | undefined,
    recreate: boolean,
  ): Promise<ReelEntry> {
    const retained = this.#reelEntries.get(binding.id);
    if (!recreate && retained && !input) {
      if (!retained.sceneCommitted)
        throw new SceneLayoutError(
          `Scene layout symbol package "${binding.id}" requires target reels.main input before its first activation.`,
        );
      return retained;
    }
    if (!recreate && retained && input && !retained.sceneCommitted) {
      this.applyReelScene(
        retained.reel,
        retained.resource,
        retained.binding,
        input,
      );
      retained.sceneCommitted = true;
      return retained;
    }
    if (!input)
      throw new SceneLayoutError(
        `Scene layout symbol package "${binding.id}" requires target reels.main input.`,
      );
    const catalog = await binding.resource.createCatalog();
    this.assertReady();
    const reel = this.createReelPresentation(
      binding.resource,
      catalog,
      binding.binding,
    );
    const candidate: ReelEntry = {
      ...binding,
      reel,
      catalog,
      sceneCommitted: false,
    };
    try {
      await this.prepareReelPresentation(reel);
      this.assertReady();
      this.applyReelScene(reel, binding.resource, binding.binding, input);
      candidate.sceneCommitted = true;
      reel.visible = false;
      return candidate;
    } catch (error) {
      reel.destroy({ children: true });
      throw error;
    }
  }

  private activateReelEntry(entry: ReelEntry): void {
    const retained = this.#reelEntries.get(entry.id);
    if (retained !== entry) {
      this.#reelEntries.set(entry.id, entry);
      if (retained) {
        retained.reel.parent?.removeChild(retained.reel);
        retained.reel.destroy({ children: true });
      }
    }
    const previous = this.#reel;
    this.attachReel(entry.reel);
    this.#reel = entry.reel;
    this.#catalog = entry.catalog;
    this.#mainReelSceneCommitted = entry.sceneCommitted;
    this.#activeSymbolPackageId = entry.id;
    if (previous && previous !== entry.reel && previous !== retained?.reel) {
      previous.parent?.removeChild(previous);
      previous.visible = false;
    }
  }

  private releasePreparedTarget(entry: PreparedModeTarget | null): void {
    if (!entry) return;
    if (this.#reelEntries.get(entry.id) === entry) return;
    if (this.#reel === entry.reel) return;
    entry.reel.destroy({ children: true });
  }

  private async prepareReelPresentation(reel: ReelPresentation): Promise<void> {
    if (reel instanceof RenderGridCellReelSet) {
      if (this.#createGridCellReel)
        reel.setOccurrenceEffectPlayerFactory(
          createSceneLayoutOccurrenceEffectPlayerFactory(this.#resource),
        );
      await reel.prepareEffects();
    }
  }

  private applyReelScene(
    reel: ReelPresentation,
    packageResource: SymbolPackageResource,
    binding: SceneLayoutSymbolPackageBinding,
    input: SceneLayoutInitialReelScene,
  ): void {
    const geometry = this.#manifest.reels.main;
    if (!geometry)
      throw new SceneLayoutError('Scene layout reel "main" is missing.');
    const scene = validateScene(
      input.scene,
      geometry.columns,
      geometry.rows,
      packageResource,
    );
    const reels = packageResource.gameConfig.getReels(binding.reelSet);
    const phases = validatePhases(input.localPhaseYs, geometry.columns, reels);
    const values = validateValues(
      input.presentationValues,
      geometry.columns,
      geometry.rows,
    );
    validateEmptyCellValues(scene, values);
    if (reel instanceof RenderGridCellReelSet) {
      reel.resetToScene(scene, phases, undefined, values);
      return;
    }
    reel.resetToVisibleScene(scene, phases);
    if (values) {
      for (let x = 0; x < geometry.columns; x += 1)
        reel.reels[x].resetToVisibleSymbols(scene[x], phases[x], values[x]);
    }
  }

  private attachReel(reel: ReelPresentation): void {
    const order = this.#manifest.reels.main?.order;
    if (order === undefined)
      throw new SceneLayoutError(
        "Scene layout reels.main.order is required for a bound reel.",
      );
    const insertionIndex = this.#manifest.nodes.filter(
      (node) => node.order < order,
    ).length;
    for (const overlay of this.#mainReelOverlays)
      overlay.parent?.removeChild(overlay);
    this.#layout.container.addChildAt(reel, insertionIndex);
    const grid = this.#layout.getReelGrid("main");
    reel.position.set(grid.artRect.x, grid.artRect.y);
    for (const [offset, overlay] of [...this.#mainReelOverlays].entries()) {
      this.#layout.container.addChildAt(
        overlay,
        this.#layout.container.getChildIndex(reel) + 1 + offset,
      );
      overlay.position.copyFrom(reel.position);
    }
    this.#reelRenderLayerRoot.parent?.removeChild(this.#reelRenderLayerRoot);
    this.#layout.container.addChildAt(
      this.#reelRenderLayerRoot,
      this.#layout.container.getChildIndex(reel) +
        1 +
        this.#mainReelOverlays.size,
    );
    this.#reelRenderLayerRoot.position.copyFrom(reel.position);
  }

  private createLayerController(
    view: Container,
    label: string,
    requireReel = false,
  ): RenderObjectLayerController {
    return createRenderObjectLayer({
      view,
      label,
      assertUsable: () => {
        this.assertReady();
        if (requireReel) this.requireReel("main");
      },
      createError: (message) => new SceneLayoutError(message),
    });
  }

  private hideVideoBlackout(): void {
    this.#videoBlackoutRoot.visible = false;
    this.#videoBlackoutRoot.alpha = 1;
    this.#videoBlackout.alpha = 1;
  }

  private resolveModeSymbolBinding(
    mode: SceneLayoutGameMode | null,
  ): ResolvedSymbolBinding | null {
    const legacyBinding = this.#manifest.symbolPackage;
    if (legacyBinding) {
      const resource = this.#resource.symbolPackage;
      if (!resource)
        throw new SceneLayoutError(
          "Scene layout legacy symbol package resource is unavailable.",
        );
      return {
        id: resource.packageManifest.id,
        binding: legacyBinding,
        resource,
      };
    }
    const id = mode?.symbolPackage;
    if (!id) return null;
    const binding = this.#manifest.symbolPackages?.[id];
    const resource = this.#resource.symbolPackages[id];
    if (!binding || !resource)
      throw new SceneLayoutError(
        `Scene layout symbol package "${id}" is unavailable.`,
      );
    return { id, binding, resource };
  }

  private resolveAllSymbolBindings(): readonly ResolvedSymbolBinding[] {
    if (this.#manifest.symbolPackage) {
      const binding = this.resolveModeSymbolBinding(null);
      return binding ? Object.freeze([binding]) : Object.freeze([]);
    }
    const ids =
      this.#document.version === 3
        ? this.#document.runtimeAllocation.package.symbolPackages
        : Object.keys(this.#manifest.symbolPackages ?? {}).sort((left, right) =>
            left.localeCompare(right, "en"),
          );
    return Object.freeze(
      ids.map((id) => {
        const binding = this.#manifest.symbolPackages?.[id];
        const resource = this.#resource.symbolPackages[id];
        if (!binding || !resource)
          throw new SceneLayoutError(
            `Scene layout symbol package "${id}" is unavailable.`,
          );
        return Object.freeze({ id, binding, resource });
      }),
    );
  }

  private commitModeVisibility(mode: SceneLayoutGameMode | null): void {
    const modes = this.#document.gameModes?.modes ?? [];
    const backgroundCandidates = new Set(
      modes.flatMap((candidate) =>
        Object.values(candidate.backgroundNodes ?? {}),
      ),
    );
    const activeBackgrounds = new Set(
      Object.values(mode?.backgroundNodes ?? {}),
    );
    for (const nodeId of backgroundCandidates)
      this.#layout.setNodeActive(nodeId, activeBackgrounds.has(nodeId));
    for (const node of this.#manifest.nodes)
      if (!backgroundCandidates.has(node.id))
        this.#layout.setNodeActive(
          node.id,
          node.gameMode === undefined || node.gameMode === mode?.id,
        );
    if (this.#reel)
      this.#reel.visible =
        this.#mainReelSceneCommitted && this.modeHasMainReel(mode?.id ?? null);
    this.#activeBackgroundNodes = Object.freeze([...activeBackgrounds].sort());
  }

  private modeHasMainReel(modeId: string | null): boolean {
    if (
      !modeId ||
      (this.#document.version !== 2 && this.#document.version !== 3)
    )
      return true;
    const mode = this.#document.gameModes.modes.find(
      (candidate) => candidate.id === modeId,
    );
    return Boolean(mode?.reelEnabled);
  }

  private requireReel(id: "main"): ReelPresentation {
    const reel = this.requirePreparedReel(id);
    if (!this.#mainReelSceneCommitted)
      throw new SceneLayoutError(
        'Scene layout reel presentation "main" has no committed initial scene.',
      );
    return reel;
  }

  private requirePreparedReel(id: "main"): ReelPresentation {
    if (id !== "main" || !this.#reel)
      throw new SceneLayoutError(
        `Scene layout reel presentation "${id}" is unavailable.`,
      );
    return this.#reel;
  }

  private recordMainReelLanding(x: number, y: number): void {
    const key = `${x}:${y}`;
    if (this.#mainReelLandingKeys.has(key)) return;
    this.#mainReelLandingKeys.add(key);
    this.#pendingMainReelLandingPositions.push(Object.freeze({ x, y }));
  }

  private recordMainReelStarted(x: number, y: number): void {
    const key = `${x}:${y}`;
    if (this.#mainReelStartedKeys.has(key)) return;
    this.#mainReelStartedKeys.add(key);
    this.#pendingMainReelStartedPositions.push(Object.freeze({ x, y }));
  }

  private recordMainReelActivation(x: number, y: number): void {
    const key = `${x}:${y}`;
    if (this.#mainReelActivationKeys.has(key)) return;
    this.#mainReelActivationKeys.add(key);
    this.#pendingMainReelActivationPositions.push(Object.freeze({ x, y }));
  }

  private clearMainReelLandingPositions(): void {
    this.#pendingMainReelStartedPositions.length = 0;
    this.#mainReelStartedKeys.clear();
    this.#pendingMainReelLandingPositions.length = 0;
    this.#mainReelLandingKeys.clear();
    this.#pendingMainReelActivationPositions.length = 0;
    this.#mainReelActivationKeys.clear();
  }

  private requireGameModes() {
    const gameModes = this.#document.gameModes;
    if (!gameModes)
      throw new SceneLayoutError(
        "Scene layout manifest does not declare gameModes.",
      );
    return gameModes;
  }

  private requireMode(id: string): SceneLayoutGameMode | SceneLayoutGameModeV2 {
    const mode = this.requireGameModes().modes.find(
      (candidate) => candidate.id === id,
    );
    if (!mode)
      throw new SceneLayoutError(`Unknown scene layout game mode "${id}".`);
    return mode;
  }

  private commitModeGeometry(
    modeId: string,
    preparedGeometry?: SceneLayoutManifestV1 | null,
  ): void {
    const effective =
      preparedGeometry === undefined
        ? materializeModeGeometry(this.#document, modeId)
        : preparedGeometry;
    if (!effective) return;
    this.#layout.commitPreparedGeometryManifest(effective);
    this.#manifest = effective;
    if (this.#reel) this.attachReel(this.#reel);
    if (!this.#activeTransition) this.refreshCommittedGeometryPresentation();
  }

  private refreshCommittedGeometryPresentation(): void {
    if (!this.#viewportSize) return;
    if (
      this.#artSpaceApplied &&
      this.#manifest.adaptation.mode === "maximized-focus"
    )
      this.applyArtSpace();
    else this.applyViewport(this.#viewportSize);
  }

  private playingPopupId(): string | null {
    for (const [id, popup] of this.#popups) if (popup.isPlaying()) return id;
    return null;
  }

  private assertReady(): void {
    this.assertAlive();
    if (!this.#initialized)
      throw new SceneLayoutError(
        "Scene layout package runtime has not initialized.",
      );
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw new SceneLayoutError("Scene layout package runtime was destroyed.");
  }
}

function materializeModeGeometry(
  document: SceneLayoutManifest,
  modeId: string,
): SceneLayoutManifestV1 | null {
  if (
    document.version !== 2 &&
    document.version !== 3 &&
    document.version !== 4
  )
    return null;
  return materializeSceneLayoutManifestForMode(document, modeId);
}

function validateScene(
  scene: readonly (readonly number[])[],
  columns: number,
  rows: number,
  resource: SymbolPackageResource,
): readonly (readonly number[])[] {
  if (!Array.isArray(scene) || scene.length !== columns)
    throw new SceneLayoutError(
      `Reel scene must be an x-first ${columns}x${rows} matrix.`,
    );
  const displayCodes = new Set(
    resource.displaySymbols.map((symbol) =>
      resource.gameConfig.getSymbolCode(symbol),
    ),
  );
  return Object.freeze(
    scene.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows)
        throw new SceneLayoutError(
          `Reel scene column ${x} must contain ${rows} rows.`,
        );
      return Object.freeze(
        column.map((code, y) => {
          if (
            !Number.isSafeInteger(code) ||
            (code !== -1 && !displayCodes.has(code))
          )
            throw new SceneLayoutError(
              `Reel scene[${x}][${y}] code ${String(code)} is not displayable and is not the -1 empty symbol.`,
            );
          return code;
        }),
      );
    }),
  );
}

function validateEmptyCellValues(
  scene: readonly (readonly number[])[],
  values: SymbolPresentationValueMatrix | undefined,
): void {
  if (!values) return;
  for (let x = 0; x < scene.length; x += 1)
    for (let y = 0; y < scene[x]!.length; y += 1)
      if (scene[x]![y] === -1 && values[x]![y] !== null)
        throw new SceneLayoutError(
          `presentationValues[${x}][${y}] must be null for an empty grid cell.`,
        );
}

function validateEmptyCellStates(
  scene: readonly (readonly number[])[],
  states: readonly (readonly string[])[] | undefined,
): void {
  if (!states) return;
  for (let x = 0; x < scene.length; x += 1)
    for (let y = 0; y < scene[x]!.length; y += 1)
      if (scene[x]![y] === -1)
        throw new SceneLayoutError(
          `landingStates[${x}][${y}] is unavailable for an empty symbol.`,
        );
}

function validatePhases(
  phases: readonly number[],
  columns: number,
  reels: LogicReels,
): readonly number[] {
  if (!Array.isArray(phases) || phases.length !== columns)
    throw new SceneLayoutError(`localPhaseYs must contain ${columns} values.`);
  return Object.freeze(
    phases.map((phase, x) => {
      if (!Number.isSafeInteger(phase))
        throw new SceneLayoutError(
          `localPhaseYs[${x}] must be a finite safe integer.`,
        );
      return reels.normalizeY(x, phase);
    }),
  );
}

function validateValues(
  values: SceneLayoutInitialReelScene["presentationValues"],
  columns: number,
  rows: number,
): SymbolPresentationValueMatrix | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length !== columns)
    throw new SceneLayoutError(
      `presentationValues must be an x-first ${columns}x${rows} matrix.`,
    );
  return Object.freeze(
    values.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows)
        throw new SceneLayoutError(
          `presentationValues column ${x} must contain ${rows} rows.`,
        );
      return Object.freeze(
        column.map((value, y) => {
          if (value !== null && (!Number.isSafeInteger(value) || value <= 0))
            throw new SceneLayoutError(
              `presentationValues[${x}][${y}] must be null or a positive safe integer.`,
            );
          return value;
        }),
      );
    }),
  );
}

function validateLandingStates(
  states: SceneLayoutMainReelSpinInput["landingStates"],
  columns: number,
  rows: number,
): readonly (readonly string[])[] | undefined {
  if (states === undefined) return undefined;
  if (!Array.isArray(states) || states.length !== columns)
    throw new SceneLayoutError(
      `landingStates must be an x-first ${columns}x${rows} matrix.`,
    );
  return Object.freeze(
    states.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows)
        throw new SceneLayoutError(
          `landingStates column ${x} must contain ${rows} rows.`,
        );
      return Object.freeze(
        column.map((state, y) => {
          if (typeof state !== "string" || state.length === 0)
            throw new SceneLayoutError(
              `landingStates[${x}][${y}] must be a non-empty string.`,
            );
          return state;
        }),
      );
    }),
  );
}

function requestOptionsSignature(
  options: SceneLayoutGameModeRequestOptions,
): string {
  return JSON.stringify({
    recreateReel: options.recreateReel === true,
    reels: options.reels ?? null,
  });
}

function applyPopupStringInputs(
  popup: SpinePopupRuntime,
  inputs: readonly SceneLayoutPopupStringInput[] | undefined,
): () => void {
  if (!inputs?.length) return () => {};
  const seen = new Set<string>();
  const snapshots: {
    readonly handle: PopupStringNodeHandle;
    readonly text: string;
    readonly overridden: boolean;
  }[] = [];
  for (const input of inputs) {
    const key = `${input.kind}\0${input.name}`;
    if (seen.has(key))
      throw new SceneLayoutError(
        `Popup string input duplicated: ${input.kind} "${input.name}".`,
      );
    seen.add(key);
    const handle =
      input.kind === "text"
        ? popup.getTextNode(input.name)
        : popup.getImageStringNode(input.name);
    snapshots.push({
      handle,
      text: handle.text,
      overridden: handle.overridden,
    });
  }
  try {
    for (let index = 0; index < inputs.length; index++)
      snapshots[index]!.handle.setText(inputs[index]!.text);
  } catch (error) {
    restorePopupStringHandles(snapshots);
    throw error;
  }
  let restored = false;
  return () => {
    if (restored) return;
    restored = true;
    restorePopupStringHandles(snapshots);
  };
}

function restorePopupStringHandles(
  snapshots: readonly {
    readonly handle: PopupStringNodeHandle;
    readonly text: string;
    readonly overridden: boolean;
  }[],
): void {
  for (let index = snapshots.length - 1; index >= 0; index--) {
    const snapshot = snapshots[index]!;
    if (snapshot.overridden) snapshot.handle.setText(snapshot.text);
    else snapshot.handle.resetText();
  }
}

async function settleAllInOrder(promises: readonly Promise<void>[]) {
  const results = await Promise.allSettled(promises);
  const failure = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failure) throw failure.reason;
}

function asSceneLayoutError(error: unknown): SceneLayoutError {
  return error instanceof SceneLayoutError
    ? error
    : new SceneLayoutError(
        error instanceof Error ? error.message : String(error),
      );
}
