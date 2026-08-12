import type { LogicReels } from "@slotclientengine/logiccore";
import { Container, Graphics, Rectangle } from "pixi.js";
import {
  bindPopupInteractionInput,
  createAwardCelebrationPlayer,
  createSpinePopupPlayer,
  handledPopupInteraction,
  unhandledPopupInteraction,
  type AwardCelebrationPlayer,
  type PopupInteractionDispatchResult,
  type SpinePopupPlayer,
} from "../popup/index.js";
import {
  RenderGridCellReelSet,
  RenderReelSet,
  createGridCellOrder,
  createGridCellReelSpinPlan,
  createReelLayout,
  createReelSpinPlan,
  createShuffledGridCellReelOffsetMatrix,
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
} from "./manifest.js";
import { transitionResourceKey } from "./resource.js";
import { createSceneLayoutRuntime } from "./runtime.js";
import {
  createSceneLayoutTransitionVideoPlayer,
  type SceneLayoutTransitionVideoPlayer,
} from "./video-transition-player.js";
import type {
  AttachChildOptions,
  AttachRelativeOptions,
  ResolvedSceneLayoutReelGrid,
  SceneLayoutGameMode,
  SceneLayoutGameModeTransition,
  SceneLayoutGameModeRequestOptions,
  SceneLayoutGameModeSnapshot,
  SceneLayoutInitialReelScene,
  SceneLayoutGridCellSpinPlanStage,
  SceneLayoutMainReelContinuousSpinInput,
  SceneLayoutMainReelSpinInput,
  SceneLayoutNodeStateSnapshot,
  SceneLayoutPackageResource,
  SceneLayoutPackageRuntime,
  SceneLayoutPopupInputBindingOptions,
  SceneLayoutLayerId,
  SceneLayoutSnapshot,
  SceneLayoutSymbolPackageBinding,
} from "./types.js";
import type { SlotReelPresentationProfileV1 } from "./template-presentation.js";
import { createSceneLayoutOccurrenceEffectPlayerFactory } from "./occurrence-effect-player.js";

type ReelPresentation = RenderReelSet | RenderGridCellReelSet;

interface PreparedModeTarget {
  readonly reel: ReelPresentation;
  readonly catalog: SymbolCatalogModel;
}

interface PreparedModeTransitionBase {
  spec: SceneLayoutGameModeTransition;
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
  phase: "popup" | "awaiting-video-start";
  readonly resolve: () => void;
  readonly reject: (error: SceneLayoutError) => void;
}

export function createSceneLayoutPackageRuntime(options: {
  readonly resource: SceneLayoutPackageResource;
  /**
   * Keeps mode/background/transition/popup ownership in this runtime while
   * allowing a host to retain its existing business reel.
   */
  readonly presentationOnly?: boolean;
  readonly reelPresentation?: SlotReelPresentationProfileV1;
  readonly areaSpinFunction?: import("../reel/index.js").AreaSpinFunction;
  readonly gridCellPresentation?: {
    readonly createEffectController?: () => import("../reel/index.js").GridCellEffectController;
    readonly presentationValueResolver?: import("../reel/index.js").GridCellSymbolPresentationValueResolver;
  };
  /** Typed factory for a business-configured grid-cell reel transferred to package ownership. */
  readonly createGridCellReel?: () => RenderGridCellReelSet;
  /** The host advances an injected main reel and drains its update result. */
  readonly hostUpdatesMainReel?: boolean;
  readonly formatPopupAmount?: import("../popup/index.js").PopupAmountFormatter;
  readonly createTransitionPlayer?: (options: {
    readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
  }) => RendercoreSpinePlayer;
  readonly createSpinePopupPlayer?: (options: {
    readonly resource: SceneLayoutPackageResource["popupPackages"][string];
  }) => SpinePopupPlayer;
  readonly createVideoTransitionPlayer?: (options: {
    readonly url: string;
    readonly fadeOutSeconds: number;
  }) => SceneLayoutTransitionVideoPlayer;
}): SceneLayoutPackageRuntime {
  return new DefaultSceneLayoutPackageRuntime(
    options.resource,
    options.presentationOnly === true,
    options.reelPresentation,
    options.areaSpinFunction,
    options.gridCellPresentation,
    options.createGridCellReel,
    options.hostUpdatesMainReel === true,
    options.formatPopupAmount,
    options.createTransitionPlayer,
    options.createSpinePopupPlayer,
    options.createVideoTransitionPlayer,
  );
}

class DefaultSceneLayoutPackageRuntime implements SceneLayoutPackageRuntime {
  readonly container: Container;
  readonly #resource: SceneLayoutPackageResource;
  readonly #presentationOnly: boolean;
  #manifest: SceneLayoutPackageResource["manifest"];
  readonly #layout;
  readonly #reelPresentation: SlotReelPresentationProfileV1 | null;
  readonly #areaSpinFunction:
    | import("../reel/index.js").AreaSpinFunction
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
    | import("../popup/index.js").PopupAmountFormatter
    | undefined;
  readonly #createTransitionPlayer: (options: {
    readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
  }) => RendercoreSpinePlayer;
  readonly #createSpinePopupPlayer: (options: {
    readonly resource: SceneLayoutPackageResource["popupPackages"][string];
  }) => SpinePopupPlayer;
  readonly #createVideoTransitionPlayer: (options: {
    readonly url: string;
    readonly fadeOutSeconds: number;
  }) => SceneLayoutTransitionVideoPlayer;
  readonly #popupRoot = new Container();
  readonly #transitionRoot = new Container();
  readonly #videoBlackoutRoot = new Container();
  readonly #videoBlackout = new Graphics();
  #reel: ReelPresentation | null = null;
  #mainReelSceneCommitted = false;
  readonly #mainReelOverlays = new Set<Container>();
  #catalog: SymbolCatalogModel | null = null;
  #activeSymbolPackageId: string | null = null;
  #stableSymbolPackageId: string | null = null;
  #targetSymbolPackageId: string | null = null;
  #activeBackgroundNodes: readonly string[] = Object.freeze([]);
  readonly #popups = new Map<string, AwardCelebrationPlayer>();
  readonly #spinePopups = new Map<string, SpinePopupPlayer>();
  #initialized = false;
  #initializing = false;
  #destroyed = false;
  readonly #presentationDelayWaiters =
    new Set<PackagePresentationDelayWaiter>();
  #stableMode: string | null = null;
  #displayedMode: string | null = null;
  #targetMode: string | null = null;
  #modeRequestInProgress = false;
  #activeTransition: ActiveModeTransition | null = null;
  #activePrelude: ActiveModePrelude | null = null;
  #preparedTransition: PreparedModeTransition | null = null;
  #activePopupId: string | null = null;
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
    gridCellPresentation:
      | {
          readonly createEffectController?: () => import("../reel/index.js").GridCellEffectController;
          readonly presentationValueResolver?: import("../reel/index.js").GridCellSymbolPresentationValueResolver;
        }
      | undefined,
    createGridCellReel: (() => RenderGridCellReelSet) | undefined,
    hostUpdatesMainReel: boolean,
    formatPopupAmount:
      | import("../popup/index.js").PopupAmountFormatter
      | undefined,
    createTransitionPlayer:
      | ((options: {
          readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
        }) => RendercoreSpinePlayer)
      | undefined,
    spinePopupPlayerFactory:
      | ((options: {
          readonly resource: SceneLayoutPackageResource["popupPackages"][string];
        }) => SpinePopupPlayer)
      | undefined,
    createVideoTransitionPlayer:
      | ((options: {
          readonly url: string;
          readonly fadeOutSeconds: number;
        }) => SceneLayoutTransitionVideoPlayer)
      | undefined,
  ) {
    this.#resource = resource;
    this.#presentationOnly = presentationOnly;
    this.#manifest = resource.manifest;
    this.#areaSpinFunction = areaSpinFunction;
    this.#reelPresentation = reelPresentation ?? null;
    this.#gridCellPresentation = gridCellPresentation;
    this.#createGridCellReel = createGridCellReel;
    this.#hostUpdatesMainReel = hostUpdatesMainReel;
    this.#formatPopupAmount = formatPopupAmount;
    this.#layout = createSceneLayoutRuntime({ resource: resource.layout });
    this.#createTransitionPlayer =
      createTransitionPlayer ??
      ((options) =>
        createOfficialSpinePlayer({
          resource: options.resource,
          createError: (message) => new SceneLayoutError(message),
        }));
    this.#createSpinePopupPlayer =
      spinePopupPlayerFactory ?? createSpinePopupPlayer;
    this.#createVideoTransitionPlayer =
      createVideoTransitionPlayer ?? createSceneLayoutTransitionVideoPlayer;
    this.container = new Container();
    this.container.label = `scene-layout-package:${resource.manifest.id}`;
    this.#popupRoot.label = "scene-layout-popup-root";
    this.#popupRoot.sortableChildren = true;
    this.#popupRoot.eventMode = "none";
    this.#popupRoot.on("pointerdown", this.#onPopupPointerDown);
    this.#transitionRoot.label = "scene-transition-overlay";
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
      const initialModeId = this.#manifest.gameModes?.initialMode ?? null;
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
      const reelPromise = Promise.resolve().then(async () => {
        if (!activeBinding || this.#presentationOnly) return;
        const symbolPackage = activeBinding.resource;
        if (this.#createGridCellReel) {
          if (activeBinding.binding.renderMode !== "grid-cell")
            throw new SceneLayoutError(
              "Injected grid-cell reel requires a grid-cell symbol binding.",
            );
          this.#reel = this.#createGridCellReel();
          this.#catalog = null;
          return;
        }
        this.#catalog = await symbolPackage.createCatalog();
        this.assertAlive();
        this.#reel = this.createReelPresentation(
          symbolPackage,
          this.#catalog,
          activeBinding.binding,
        );
        await this.prepareReelPresentation(this.#reel);
        this.assertAlive();
      });
      const popupEntries = Object.entries(this.#resource.popupPackages).map(
        ([id, resource]) => {
          const popup =
            resource.manifest.type === "spine"
              ? this.#createSpinePopupPlayer({ resource })
              : createAwardCelebrationPlayer({
                  resource,
                  formatAmount: this.#formatPopupAmount,
                });
          if (resource.manifest.type === "spine")
            this.#spinePopups.set(id, popup as SpinePopupPlayer);
          else this.#popups.set(id, popup as AwardCelebrationPlayer);
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
        reelPromise,
        ...popupEntries.map((entry) => entry.initPromise),
      ]);
      this.assertAlive();
      this.commitModeVisibility(initialMode);
      if (activeBinding && !this.#presentationOnly) {
        const initial = options.reels?.main;
        const symbolPackage = activeBinding.resource;
        const reel = this.#reel;
        if (!reel)
          throw new SceneLayoutError(
            "Scene layout active reel preparation completed without a reel.",
          );
        this.attachReel(reel);
        if (initial) {
          this.applyReelScene(
            reel,
            symbolPackage,
            activeBinding.binding,
            initial,
          );
          this.#mainReelSceneCommitted = true;
        } else {
          reel.visible = false;
        }
        this.#activeSymbolPackageId = activeBinding.id;
        this.#stableSymbolPackageId = activeBinding.id;
      } else if (activeBinding) {
        this.#activeSymbolPackageId = activeBinding.id;
        this.#stableSymbolPackageId = activeBinding.id;
      }
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
    const manifest = parseSceneLayoutManifest(manifestValue);
    assertSceneLayoutGeometryCompatible(this.#manifest, manifest);
    const prepared = this.#preparedTransition;
    const nextPreparedSpec = prepared
      ? manifest.gameModes?.transitions?.find(
          (candidate) =>
            candidate.from === prepared.spec.from &&
            candidate.to === prepared.spec.to,
        )
      : null;
    if (prepared && !nextPreparedSpec)
      throw new SceneLayoutError(
        "Prepared scene transition is missing from geometry update.",
      );
    this.#layout.applyGeometryManifest(manifest);
    this.#manifest = manifest;
    if (prepared && nextPreparedSpec) prepared.spec = nextPreparedSpec;
    return this.#viewportSize
      ? this.#artSpaceApplied
        ? this.applyArtSpace()
        : this.applyViewport(this.#viewportSize)
      : null;
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    this.updatePresentationDelayWaiters(deltaSeconds);
    this.#layout.update(deltaSeconds);
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
    for (const popup of this.#popups.values())
      if (popup.isPlaying()) popup.update(deltaSeconds);
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
    this.updateActivePrelude();
    this.updateActiveTransition(deltaSeconds);
    if (
      this.#activePopupId &&
      !this.#popups.get(this.#activePopupId)?.isPlaying()
    ) {
      this.#activePopupId = null;
      this.refreshPopupPointerInteraction();
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
    const current = reel.getVisibleScene();
    const currentValues = reel
      .getCascadeValues()
      .map((column) =>
        Object.freeze(column.map((value) => (value === -1 ? null : value))),
      );
    const replacements: import("../reel/index.js").PreparedVisibleOccurrenceReplacement[] =
      [];
    try {
      for (let x = 0; x < geometry.columns; x++)
        for (let y = 0; y < geometry.rows; y++)
          if (current[x]![y] !== scene[x]![y])
            replacements.push(
              reel.prepareVisibleOccurrenceReplacement({
                x,
                y,
                outputCode: scene[x]![y]!,
                outputPresentationValue: values?.[x]?.[y] ?? null,
              }),
            );
      for (const replacement of replacements) replacement.commit();
      for (let x = 0; x < geometry.columns; x++)
        for (let y = 0; y < geometry.rows; y++)
          if (current[x]![y] === scene[x]![y])
            reel.setVisibleSymbolPresentationValue(
              x,
              y,
              values?.[x]?.[y] ?? null,
            );
    } catch (error) {
      for (const replacement of replacements) replacement.rollback();
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
      this.clearMainReelLandingPositions();
      reel.startContinuous({
        direction: profile.direction,
        speedSymbolsPerSecond: profile.timing.speedSymbolsPerSecond,
        startStepMs: profile.timing.startStepMs,
        ...(input.positions ? { positions: input.positions } : {}),
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
    const landingStates = validateLandingStates(
      input.landingStates,
      geometry.columns,
      geometry.rows,
    );
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
    const reel = this.requireReel("main");
    return reel instanceof RenderGridCellReelSet
      ? reel.getSnapshot().spinning
      : reel.getSnapshot().spinning;
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
    return this.requireReel("main").playVisibleSymbolStateBatch(
      requests,
      options,
    );
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

  prepareMainReelVisibleOccurrenceReplacement(options: {
    readonly x: number;
    readonly y: number;
    readonly outputCode: number;
    readonly outputPresentationValue: number | null;
  }) {
    this.assertReady();
    return this.requireReel("main").prepareVisibleOccurrenceReplacement(
      options,
    );
  }

  prepareMainReelVisibleOccurrenceTransferBatch(options: {
    readonly transfers: readonly import("../reel/index.js").GridCellVisibleOccurrenceTransfer[];
  }) {
    this.assertReady();
    const reel = this.requireReel("main");
    if (!(reel instanceof RenderGridCellReelSet))
      throw new SceneLayoutError(
        "Visible occurrence transfer requires a grid-cell main reel.",
      );
    return reel.prepareVisibleOccurrenceTransferBatch(options);
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

  getAwardCelebrationPopup(id: string): AwardCelebrationPlayer {
    this.assertReady();
    const popup = this.#popups.get(id);
    if (!popup)
      throw new SceneLayoutError(
        `Scene layout award celebration popup "${id}" is unavailable.`,
      );
    return popup;
  }

  getSpinePopup(id: string): SpinePopupPlayer {
    this.assertReady();
    const popup = this.#spinePopups.get(id);
    if (!popup)
      throw new SceneLayoutError(
        `Scene layout Spine popup "${id}" is unavailable.`,
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

  getGameModeIds(): readonly string[] {
    this.assertReady();
    return Object.freeze(this.requireGameModes().modes.map((mode) => mode.id));
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
    if (bindingChanged && targetBinding && !targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${target.id}" requires target reels.main input.`,
      );
    if (!targetBinding && targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${target.id}" has no symbol package and must not receive reels.main input.`,
      );
    this.#modeRequestInProgress = true;
    let prepared: PreparedModeTarget | null = null;
    try {
      if (bindingChanged && targetBinding) {
        const catalog = await targetBinding.resource.createCatalog();
        this.assertReady();
        const reel = this.createReelPresentation(
          targetBinding.resource,
          catalog,
          targetBinding.binding,
        );
        try {
          await this.prepareReelPresentation(reel);
          this.assertReady();
          this.applyReelScene(
            reel,
            targetBinding.resource,
            targetBinding.binding,
            targetInput!,
          );
        } catch (error) {
          reel.destroy({ children: true });
          throw error;
        }
        prepared = { reel, catalog };
      }
      this.commitModeVisibility(target);
      if (bindingChanged) {
        const previous = this.#reel;
        if (prepared) {
          this.attachReel(prepared.reel);
          this.#reel = prepared.reel;
          this.#catalog = prepared.catalog;
          this.#mainReelSceneCommitted = true;
        } else {
          this.#reel = null;
          this.#catalog = null;
          this.#mainReelSceneCommitted = false;
        }
        prepared = null;
        this.#activeSymbolPackageId = targetBinding?.id ?? null;
        previous?.parent?.removeChild(previous);
        previous?.destroy({ children: true });
      }
      this.#stableMode = target.id;
      this.#displayedMode = target.id;
      this.#stableSymbolPackageId = this.#activeSymbolPackageId;
    } catch (error) {
      prepared?.reel.destroy({ children: true });
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
        if (options.reels?.main)
          throw new SceneLayoutError(
            "Current game mode must not receive a redundant reels.main input.",
          );
        return Promise.resolve();
      }
      transition = this.findTransition(modeId);
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
        return this.activatePreparedPrelude(prepared, transition.preludePopup);
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
  }

  getActiveAwardCelebrationSnapshot() {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) return null;
    return this.getAwardCelebrationPopup(id).getSnapshot();
  }

  getSnapshot(): SceneLayoutSnapshot {
    this.assertReady();
    return this.#layout.getSnapshot();
  }

  getNode(id: string): Container {
    this.assertReady();
    return this.#layout.getNode(id);
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
    for (const waiter of this.#presentationDelayWaiters) {
      waiter.signal?.removeEventListener("abort", waiter.abortListener!);
      waiter.reject(
        new SceneLayoutError("Presentation delay runtime was destroyed."),
      );
    }
    this.#presentationDelayWaiters.clear();
    this.#disposePopupInputBinding?.();
    this.#disposePopupInputBinding = null;
    this.releasePreparedTransition(this.#preparedTransition);
    this.#preparedTransition = null;
    if (this.#activeTransition) {
      const active = this.#activeTransition;
      this.#activeTransition = null;
      active.player.destroy();
      if (!active.switched) active.prepared?.reel.destroy({ children: true });
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
      this.releasePreparedTransition(active.prepared);
      active.reject(
        new SceneLayoutError(
          "Scene layout package runtime was destroyed during a game mode transition prelude.",
        ),
      );
    }
    this.#reel?.destroy({ children: true });
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
    this.#videoBlackoutRoot.removeChildren();
    this.#videoBlackout.destroy();
    this.#layout.destroy();
    this.#resource.destroy();
    this.#initialized = false;
    this.#stableMode = null;
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
    if (bindingChanged && targetBinding && !targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${target.id}" requires target reels.main input.`,
      );
    if (!targetBinding && targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${target.id}" has no symbol package and must not receive reels.main input.`,
      );
    let prepared: PreparedModeTarget | null = null;
    try {
      if (bindingChanged && targetBinding) {
        const catalog = await targetBinding.resource.createCatalog();
        this.assertAlive();
        const reel = this.createReelPresentation(
          targetBinding.resource,
          catalog,
          targetBinding.binding,
        );
        try {
          await this.prepareReelPresentation(reel);
          this.assertAlive();
          this.applyReelScene(
            reel,
            targetBinding.resource,
            targetBinding.binding,
            targetInput!,
          );
        } catch (error) {
          reel.destroy({ children: true });
          throw error;
        }
        prepared = { reel, catalog };
      }
      const common = {
        spec: transition,
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
      prepared?.reel.destroy({ children: true });
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
            directlyStarted = this.activatePreparedSpineRequest(ready);
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
    return await this.activatePreparedSpineRequest(prepared);
  }

  private activatePreparedSpineRequest(
    prepared: Extract<PreparedModeTransition, { readonly kind: "spine" }>,
  ): Promise<void> {
    return "preludePopup" in prepared.spec && prepared.spec.preludePopup
      ? this.activatePreparedPrelude(prepared, prepared.spec.preludePopup)
      : this.activatePreparedSpineTransition(prepared);
  }

  private activatePreparedPrelude(
    prepared: PreparedModeTransition,
    popupId: string,
  ): Promise<void> {
    this.#preparedTransition = null;
    const popup = this.getSpinePopup(popupId);
    try {
      popup.dismissImmediately();
      popup.start();
      this.#targetMode = prepared.target.id;
      this.#targetSymbolPackageId = prepared.targetSymbolPackageId;
      return new Promise<void>((resolve, reject) => {
        this.#activePrelude = {
          prepared,
          popupId,
          phase: "popup",
          resolve,
          reject,
        };
        this.refreshPopupPointerInteraction();
      });
    } catch (error) {
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
      ? this.activatePreparedPrelude(prepared, prepared.spec.preludePopup)
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
      prepared.prepared?.reel.destroy({ children: true });
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
        this.#activeTransition = {
          ...prepared,
          switched: false,
          resolve,
          reject,
        };
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
    prepared.prepared?.reel.destroy({ children: true });
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
    if (popup.getSnapshot().phase !== "complete") return;
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
    this.commitModeVisibility(active.target);
    if (active.bindingChanged) {
      const previous = this.#reel;
      if (active.prepared) {
        this.attachReel(active.prepared.reel);
        this.#reel = active.prepared.reel;
        this.#catalog = active.prepared.catalog;
        this.#mainReelSceneCommitted = true;
      } else {
        this.#reel = null;
        this.#catalog = null;
        this.#mainReelSceneCommitted = false;
      }
      this.#activeSymbolPackageId = this.#targetSymbolPackageId;
      if (previous) {
        previous.parent?.removeChild(previous);
        previous.destroy({ children: true });
      }
    }
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
    active.resolve();
  }

  private failActiveTransition(
    active: ActiveModeTransition,
    error: SceneLayoutError,
  ): void {
    if (this.#activeTransition !== active) return;
    active.player.destroy();
    if (active.kind === "video") this.hideVideoBlackout();
    if (!active.switched) active.prepared?.reel.destroy({ children: true });
    else {
      this.#stableMode = active.target.id;
      this.#stableSymbolPackageId = this.#activeSymbolPackageId;
    }
    this.#targetMode = null;
    this.#targetSymbolPackageId = null;
    this.#activeTransition = null;
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
    this.#layout.container.addChildAt(reel, insertionIndex);
    const grid = this.#layout.getReelGrid("main");
    reel.position.set(grid.artRect.x, grid.artRect.y);
  }

  private hideVideoBlackout(): void {
    this.#videoBlackoutRoot.visible = false;
    this.#videoBlackoutRoot.alpha = 1;
    this.#videoBlackout.alpha = 1;
  }

  private resolveModeSymbolBinding(mode: SceneLayoutGameMode | null): {
    readonly id: string;
    readonly binding: SceneLayoutSymbolPackageBinding;
    readonly resource: SymbolPackageResource;
  } | null {
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

  private commitModeVisibility(mode: SceneLayoutGameMode | null): void {
    const modes = this.#manifest.gameModes?.modes ?? [];
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
    this.#activeBackgroundNodes = Object.freeze([...activeBackgrounds].sort());
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
    const gameModes = this.#manifest.gameModes;
    if (!gameModes)
      throw new SceneLayoutError(
        "Scene layout manifest does not declare gameModes.",
      );
    return gameModes;
  }

  private requireMode(id: string): SceneLayoutGameMode {
    const mode = this.requireGameModes().modes.find(
      (candidate) => candidate.id === id,
    );
    if (!mode)
      throw new SceneLayoutError(`Unknown scene layout game mode "${id}".`);
    return mode;
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
          if (!Number.isSafeInteger(code) || !displayCodes.has(code))
            throw new SceneLayoutError(
              `Reel scene[${x}][${y}] code ${String(code)} is not displayable.`,
            );
          return code;
        }),
      );
    }),
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
