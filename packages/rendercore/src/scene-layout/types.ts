import type { Container } from "pixi.js";
import type {
  AssetUrlManifest,
  VNIProjectConfig,
} from "@slotclientengine/vnicore";
import type { ImageStringResource } from "../image-string/index.js";
import type { SymbolPackageResource } from "../symbol/package.js";
import type {
  AwardCelebrationPlayer,
  PopupPackageResource,
} from "../popup/index.js";
import type {
  FocusedArtViewport,
  RenderViewportMargin,
  RenderViewportRect,
  RenderViewportSize,
} from "../viewport/index.js";

export type SceneLayoutVariantId = "default" | "landscape" | "portrait";
export type SceneLayoutCoordinateOrigin = "top-left" | "center";
export type SceneLayoutOrientationVariantId = Exclude<
  SceneLayoutVariantId,
  "default"
>;

export interface SceneLayoutScaledPlacement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface SceneLayoutNodePlacement extends SceneLayoutScaledPlacement {
  /** Clockwise rotation in degrees. Missing legacy values normalize to 0. */
  readonly rotation?: number;
  /** Normalized node-local rotation center. Missing legacy values normalize to 0.5/0.5. */
  readonly center?: Readonly<{ readonly x: number; readonly y: number }>;
}

export interface SceneLayoutImageResourceSpec {
  readonly kind: "image";
  readonly path: string;
  readonly size: RenderViewportSize;
}

export interface SceneLayoutSpineStateMachine {
  readonly initialState: string;
  readonly states: Readonly<Record<string, { readonly animation: string }>>;
  readonly transitions: readonly {
    readonly from: string;
    readonly to: string;
    readonly animation: string;
  }[];
}

export interface SceneLayoutSpineLoopResourceSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly textures: Readonly<Record<string, string>>;
  readonly defaultAnimation: string;
  readonly loop: boolean;
}

export interface SceneLayoutSpineStateMachineResourceSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly textures: Readonly<Record<string, string>>;
  readonly stateMachine: SceneLayoutSpineStateMachine;
}

export type SceneLayoutSpineResourceSpec =
  | SceneLayoutSpineLoopResourceSpec
  | SceneLayoutSpineStateMachineResourceSpec;

export interface SceneLayoutImageStringResourceSpec {
  readonly kind: "image-string";
  readonly manifest: string;
  readonly text: string;
  readonly anchor: { readonly x: number; readonly y: number };
}

export interface SceneLayoutVniResourceSpec {
  readonly kind: "vni";
  readonly project: string;
  readonly loop: boolean;
}

export type SceneLayoutNodeResourceSpec =
  | SceneLayoutImageResourceSpec
  | SceneLayoutSpineResourceSpec
  | SceneLayoutImageStringResourceSpec
  | SceneLayoutVniResourceSpec;

export interface SceneLayoutRuntimeSpineResourceSpec {
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly textures: Readonly<Record<string, string>>;
}

export interface SceneLayoutRuntimeImageStringResourceSpec {
  readonly kind: "image-string";
  readonly manifest: string;
}

export interface SceneLayoutRuntimeVniResourceSpec {
  readonly kind: "vni";
  readonly project: string;
}

export interface SceneLayoutRuntimeVideoResourceSpec {
  readonly kind: "video";
  readonly path: string;
  readonly mimeType: "video/mp4";
}

export type SceneLayoutRuntimeResourceSpec =
  | SceneLayoutImageResourceSpec
  | SceneLayoutRuntimeSpineResourceSpec
  | SceneLayoutRuntimeImageStringResourceSpec
  | SceneLayoutRuntimeVniResourceSpec
  | SceneLayoutRuntimeVideoResourceSpec;

export interface SceneLayoutNode {
  readonly id: string;
  readonly order: number;
  /** Missing means the ordinary node is visible in every game mode. */
  readonly gameMode?: string;
  readonly resource: SceneLayoutNodeResourceSpec;
  readonly placements: Readonly<
    Partial<Record<SceneLayoutVariantId, SceneLayoutNodePlacement>>
  >;
}

export interface SceneLayoutReelGrid {
  readonly order?: number;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: RenderViewportSize;
  readonly gap: { readonly x: number; readonly y: number };
  readonly placements: Readonly<
    Partial<
      Record<SceneLayoutVariantId, { readonly x: number; readonly y: number }>
    >
  >;
}

export interface SceneLayoutSymbolPackageBinding {
  readonly manifest: string;
  readonly reel: "main";
  readonly reelSet: string;
  readonly renderMode: "standard" | "grid-cell";
}

export interface SceneLayoutPopupBinding {
  readonly type: "award-celebration" | "spine";
  readonly manifest: string;
  /** Root presentation order. Missing legacy v1 values normalize to 2000. */
  readonly order: number;
  readonly placements: Readonly<
    Partial<Record<SceneLayoutVariantId, SceneLayoutScaledPlacement>>
  >;
}

export interface SceneLayoutGameMode {
  readonly id: string;
  readonly backgroundNodes?: Readonly<
    Partial<Record<SceneLayoutVariantId, string>>
  >;
  readonly nodeStates: Readonly<Record<string, string>>;
  readonly symbolPackage?: string;
  readonly awardCelebrationPopup?: string;
}

export interface SceneLayoutPrimaryAction {
  readonly kind: "request-game-mode";
  readonly targetMode: string;
}

interface SceneLayoutGameModeTransitionBase {
  readonly from: string;
  readonly to: string;
  readonly preludePopup?: string;
}

export interface SceneLayoutNoneGameModeTransition extends SceneLayoutGameModeTransitionBase {
  readonly overlay: { readonly kind: "none" };
}

export interface SceneLayoutSpineGameModeTransition extends SceneLayoutGameModeTransitionBase {
  readonly overlay: {
    readonly resource: {
      readonly kind: "spine";
      readonly skeleton: string;
      readonly atlas: string;
      readonly textures: Readonly<Record<string, string>>;
    };
    readonly animation: string;
    readonly switchEvent: string;
    readonly placements: Readonly<
      Partial<Record<SceneLayoutVariantId, SceneLayoutScaledPlacement>>
    >;
  };
}

export interface SceneLayoutVideoGameModeTransition extends SceneLayoutGameModeTransitionBase {
  readonly overlay: {
    readonly resource: {
      readonly kind: "video";
      readonly path: string;
      readonly mimeType: "video/mp4";
    };
    readonly fit: "contain";
    readonly fadeOutSeconds: number;
  };
}

export type SceneLayoutGameModeTransition =
  | SceneLayoutNoneGameModeTransition
  | SceneLayoutSpineGameModeTransition
  | SceneLayoutVideoGameModeTransition;

export interface SceneLayoutGameModes {
  readonly initialMode: string;
  readonly modes: readonly SceneLayoutGameMode[];
  readonly transitions?: readonly SceneLayoutGameModeTransition[];
}

export interface MaximizedFocusSceneLayoutAdaptation {
  readonly mode: "maximized-focus";
  readonly artSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly backgroundNode: string;
}

export interface OrientationFocusSceneLayoutVariant {
  readonly artSize: RenderViewportSize;
  readonly focusRect: RenderViewportRect;
  readonly frameFocusRect: RenderViewportSize;
  readonly minFocusMargin?: RenderViewportMargin;
  readonly backgroundNode: string;
}

export interface OrientationFocusSceneLayoutAdaptation {
  readonly mode: "orientation-focus";
  readonly variants: Readonly<
    Record<SceneLayoutOrientationVariantId, OrientationFocusSceneLayoutVariant>
  >;
}

export type SceneLayoutAdaptation =
  | MaximizedFocusSceneLayoutAdaptation
  | OrientationFocusSceneLayoutAdaptation;

export type SceneLayoutModeAdaptation =
  | Omit<MaximizedFocusSceneLayoutAdaptation, "backgroundNode">
  | {
      readonly mode: "orientation-focus";
      readonly variants: Readonly<
        Record<
          SceneLayoutOrientationVariantId,
          Omit<OrientationFocusSceneLayoutVariant, "backgroundNode">
        >
      >;
    };

export interface SceneLayoutGameModeV2 extends SceneLayoutGameMode {
  readonly backgroundNodes: Readonly<
    Partial<Record<SceneLayoutVariantId, string>>
  >;
  readonly adaptation: SceneLayoutModeAdaptation;
  readonly reelEnabled: boolean;
  readonly reelPlacements: Readonly<
    Partial<
      Record<
        string,
        Readonly<
          Partial<
            Record<
              SceneLayoutVariantId,
              { readonly x: number; readonly y: number }
            >
          >
        >
      >
    >
  >;
  readonly primaryAction?: SceneLayoutPrimaryAction;
}

export interface SceneLayoutGameModesV2 {
  readonly initialMode: string;
  readonly modes: readonly SceneLayoutGameModeV2[];
  readonly transitions?: readonly SceneLayoutGameModeTransition[];
}

export type SceneLayoutReelDefinition = Omit<SceneLayoutReelGrid, "placements">;

export interface SceneLayoutManifestV1 {
  readonly version: 1;
  readonly kind: "scene-layout";
  readonly id: string;
  readonly coordinateOrigin?: SceneLayoutCoordinateOrigin;
  readonly adaptation: SceneLayoutAdaptation;
  readonly nodes: readonly SceneLayoutNode[];
  readonly reels: Readonly<Record<string, SceneLayoutReelGrid>>;
  readonly symbolPackage?: SceneLayoutSymbolPackageBinding;
  readonly symbolPackages?: Readonly<
    Record<string, SceneLayoutSymbolPackageBinding>
  >;
  readonly popups?: Readonly<Record<string, SceneLayoutPopupBinding>>;
  readonly runtimeResources?: Readonly<
    Record<string, SceneLayoutRuntimeResourceSpec>
  >;
  readonly gameModes?: SceneLayoutGameModes;
}

export interface SceneLayoutManifestV2 {
  readonly version: 2;
  readonly kind: "scene-layout";
  readonly id: string;
  readonly coordinateOrigin?: SceneLayoutCoordinateOrigin;
  readonly nodes: readonly SceneLayoutNode[];
  readonly reels: Readonly<Record<string, SceneLayoutReelDefinition>>;
  readonly symbolPackage?: SceneLayoutSymbolPackageBinding;
  readonly symbolPackages?: Readonly<
    Record<string, SceneLayoutSymbolPackageBinding>
  >;
  readonly popups?: Readonly<Record<string, SceneLayoutPopupBinding>>;
  readonly runtimeResources?: Readonly<
    Record<string, SceneLayoutRuntimeResourceSpec>
  >;
  readonly gameModes: SceneLayoutGameModesV2;
}

export type SceneLayoutManifest = SceneLayoutManifestV1 | SceneLayoutManifestV2;
export type SceneLayoutManifestLatest = SceneLayoutManifestV2;

export type SceneLayoutRuntimeResource =
  | {
      readonly kind: "image";
      readonly url: string;
      readonly size: RenderViewportSize;
    }
  | ({ readonly kind: "spine" } & OfficialSpineRuntimeResource)
  | {
      readonly kind: "image-string";
      readonly resource: ImageStringResource;
    }
  | {
      readonly kind: "vni";
      readonly project: VNIProjectConfig;
      readonly assetUrls: AssetUrlManifest;
    }
  | {
      readonly kind: "video";
      readonly url: string;
      readonly mimeType: "video/mp4";
    };

interface OfficialSpineRuntimeResource {
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly textureUrls: Readonly<Record<string, string>>;
}

export interface SceneLayoutResource {
  readonly manifest: SceneLayoutManifestV1;
  readonly imageUrls: Readonly<Record<string, string>>;
  readonly spineResources: Readonly<
    Record<
      string,
      {
        readonly skeleton: unknown;
        readonly atlasText: string;
        readonly textureUrls: Readonly<Record<string, string>>;
      }
    >
  >;
  readonly imageStringResources: Readonly<Record<string, ImageStringResource>>;
  readonly vniResources: Readonly<
    Record<
      string,
      {
        readonly project: VNIProjectConfig;
        readonly assetUrls: AssetUrlManifest;
      }
    >
  >;
  readonly videoUrls: Readonly<Record<string, string>>;
  readonly runtimeResources: Readonly<
    Record<string, SceneLayoutRuntimeResource>
  >;
  destroy(): void;
}

export interface SceneLayoutPackageResource {
  readonly manifest: SceneLayoutManifest;
  readonly layout: SceneLayoutResource;
  readonly imageStrings: Readonly<Record<string, ImageStringResource>>;
  readonly symbolPackage: SymbolPackageResource | null;
  readonly symbolPackages: Readonly<Record<string, SymbolPackageResource>>;
  readonly popupPackages: Readonly<Record<string, PopupPackageResource>>;
  readonly runtimeResources: Readonly<
    Record<string, SceneLayoutRuntimeResource>
  >;
  getLoadedRuntimeResource<Kind extends SceneLayoutRuntimeResource["kind"]>(
    key: string,
    kind: Kind,
  ): Extract<SceneLayoutRuntimeResource, { readonly kind: Kind }> | null;
  loadRuntimeResource<Kind extends SceneLayoutRuntimeResource["kind"]>(
    key: string,
    kind: Kind,
  ): Promise<Extract<SceneLayoutRuntimeResource, { readonly kind: Kind }>>;
  destroy(): Promise<void> | void;
}

export type SceneLayoutLayerId = "layout" | "reel" | "transition" | "popup";
export type SceneLayoutNodeRenderLayerPlacement = "child" | "before" | "after";
export type SceneLayoutRenderLayerRef = string;

export type RenderAlignment =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

/** A point expressed in the manifest's configured authored coordinate space. */
export interface SceneLayoutPoint {
  readonly x: number;
  readonly y: number;
}

export type SceneLayoutPointSelector =
  | { readonly kind: "origin" }
  | { readonly kind: "art"; readonly align: RenderAlignment }
  | { readonly kind: "viewport"; readonly align: RenderAlignment };

interface SceneLayoutRenderObjectBase {
  readonly kind: SceneLayoutNodeResourceSpec["kind"];
  /** Resolves the authored node-local origin without exposing its Pixi node. */
  getAnchor(): import("../presentation/index.js").RenderAnchor;
  /** Program visibility is ANDed with authored variant/game-mode visibility. */
  setVisible(visible: boolean): void;
}

export interface SceneLayoutImageRenderObject extends SceneLayoutRenderObjectBase {
  readonly kind: "image";
}

export interface SceneLayoutSpineLoopRenderObject extends SceneLayoutRenderObjectBase {
  readonly kind: "spine";
  readonly playback: "loop";
  /** Restarts the manifest-declared default animation and loop policy. */
  play(): void;
}

export interface SceneLayoutSpineStateRenderObject extends SceneLayoutRenderObjectBase {
  readonly kind: "spine";
  readonly playback: "state";
  requestState(state: string): Promise<void>;
  canRequestState(state: string): boolean;
  getStateSnapshot(): SceneLayoutNodeStateSnapshot;
}

export interface SceneLayoutVniRenderObject extends SceneLayoutRenderObjectBase {
  readonly kind: "vni";
  /** Plays the manifest-declared VNI timeline using its owned player. */
  play(): void;
}

export interface SceneLayoutImageStringRenderObject extends SceneLayoutRenderObjectBase {
  readonly kind: "image-string";
  setText(text: string): void;
  getText(): string;
}

export type SceneLayoutRenderObject =
  | SceneLayoutImageRenderObject
  | SceneLayoutSpineLoopRenderObject
  | SceneLayoutSpineStateRenderObject
  | SceneLayoutVniRenderObject
  | SceneLayoutImageStringRenderObject;

export interface ResolvedSceneLayoutReelGrid {
  readonly id: string;
  readonly variantId: SceneLayoutVariantId;
  readonly columns: number;
  readonly rows: number;
  readonly cellSize: RenderViewportSize;
  readonly gap: { readonly x: number; readonly y: number };
  readonly stride: RenderViewportSize;
  readonly artRect: RenderViewportRect;
}

export interface SceneLayoutSnapshot extends FocusedArtViewport {
  readonly variantId: SceneLayoutVariantId;
  readonly reels: Readonly<
    Record<
      string,
      ResolvedSceneLayoutReelGrid & {
        readonly viewportRect: RenderViewportRect;
      }
    >
  >;
}

export interface SceneLayoutFrameViewport {
  readonly pageSize: RenderViewportSize;
  readonly frameDesignSize: RenderViewportSize;
  readonly scale: number;
  readonly cssSize: RenderViewportSize;
  readonly offsetX: number;
  readonly offsetY: number;
}

export type SceneLayoutFramePolicy =
  | {
      readonly mode: "maximized-focus";
      resolveViewportSize(pageSize: RenderViewportSize): RenderViewportSize;
    }
  | {
      readonly mode: "orientation-focus";
      readonly variants: Readonly<
        Record<
          SceneLayoutOrientationVariantId,
          {
            readonly maxDesignSize: RenderViewportSize;
            readonly focusRect: RenderViewportSize;
            readonly minFocusMargin?: RenderViewportMargin;
          }
        >
      >;
    };

export interface AttachChildOptions {
  readonly nodeId: string;
  readonly object: Container;
}

export interface AttachRelativeOptions extends AttachChildOptions {
  readonly placement: "before" | "after";
}

export interface SceneLayoutRuntime {
  readonly container: Container;
  init(): Promise<void>;
  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot;
  /**
   * Applies a maximized-focus layout in its complete authored art space.
   * This is for hosts that already own the outer viewport/focus transform.
   */
  applyArtSpace(): SceneLayoutSnapshot;
  applyGeometryManifest(
    manifest: SceneLayoutManifest,
  ): SceneLayoutSnapshot | null;
  update(deltaSeconds: number): void;
  getSnapshot(): SceneLayoutSnapshot;
  getLayoutPoint(selector: SceneLayoutPointSelector): SceneLayoutPoint;
  getLayoutAnchor(
    point: SceneLayoutPoint,
  ): import("../presentation/index.js").RenderAnchor;
  resolveLayoutAnchor(
    anchor: import("../presentation/index.js").RenderAnchor,
  ): SceneLayoutPoint;
  getNode(id: string): Container;
  /** Safe program attachment layer above authored layout nodes. */
  getRootRenderLayer(): import("../presentation/index.js").RenderObjectLayer;
  /** Safe exact named-node attachment layer. */
  getNodeRenderLayer(
    nodeId: string,
    placement?: SceneLayoutNodeRenderLayerPlacement,
  ): import("../presentation/index.js").RenderObjectLayer;
  /** Base runtimes expose layout/node refs; package runtimes add reel/area/popup refs. */
  getRenderLayer(
    ref: SceneLayoutRenderLayerRef,
  ): import("../presentation/index.js").RenderObjectLayer;
  /** Returns a stable borrowed capability façade for an authored node. */
  getRenderObject(nodeId: string): SceneLayoutRenderObject | null;
  attachChild(options: AttachChildOptions): () => void;
  attachRelative(options: AttachRelativeOptions): () => void;
  getReelGrid(id: string): ResolvedSceneLayoutReelGrid;
  getImageStringNodeNames(): readonly string[];
  setImageStringText(nodeId: string, text: string): void;
  getImageStringText(nodeId: string): string;
  requestNodeState(nodeId: string, state: string): Promise<void>;
  canRequestNodeState(nodeId: string, state: string): boolean;
  getNodeStateSnapshot(nodeId: string): SceneLayoutNodeStateSnapshot;
  /** @internal Package runtimes own mode-aware visibility; game apps must not call this. */
  setNodeActive(nodeId: string, active: boolean): void;
  destroy(): void;
}

export interface SceneLayoutNodeStateSnapshot {
  readonly stableState: string;
  readonly targetState: string | null;
  readonly phase: "stable" | "transitioning";
}

export interface SceneLayoutGameModeSnapshot {
  readonly stableMode: string;
  readonly displayedMode: string;
  readonly targetMode: string | null;
  readonly phase: "stable" | "transitioning";
  readonly transitionPhase:
    | "popup"
    | "awaiting-video-start"
    | "before-switch"
    | "after-switch"
    | null;
  readonly transition: { readonly from: string; readonly to: string } | null;
  readonly preparedTargetMode: string | null;
  readonly transitionKind: "none" | "spine" | "video" | null;
  readonly activePreludePopup: string | null;
  readonly mediaTimeSeconds: number | null;
  readonly mediaDurationSeconds: number | null;
  readonly fadeProgress: number | null;
  readonly stableSymbolPackage: string | null;
  readonly displayedSymbolPackage: string | null;
  readonly targetSymbolPackage: string | null;
  readonly activeBackgroundNodes: readonly string[];
}

export interface SceneLayoutGameModeRequestOptions {
  /** Explicitly rebuilds even when source and target use the same binding. */
  readonly recreateReel?: boolean;
  readonly reels?: Readonly<
    Partial<Record<"main", SceneLayoutInitialReelScene>>
  >;
  /** Final strings applied only for this request's transition prelude Popup. */
  readonly preludePopupStrings?: readonly SceneLayoutPopupStringInput[];
}

export type SceneLayoutPopupStringInput =
  | {
      readonly kind: "text";
      readonly name: string;
      readonly text: string;
    }
  | {
      readonly kind: "image-string";
      readonly name: string;
      readonly text: string;
    };

export interface SceneLayoutPopupInputBindingOptions {
  readonly canvas: EventTarget;
  readonly keyboardTarget: EventTarget;
  readonly onError: (error: unknown) => void;
}

export interface SceneLayoutInitialReelScene {
  readonly scene: readonly (readonly number[])[];
  readonly localPhaseYs: readonly number[];
  readonly presentationValues?: readonly (readonly (number | null)[])[];
}

export interface SceneLayoutGridCellSpinPlanStage {
  readonly targetScene: readonly (readonly number[])[];
  readonly order: readonly import("../reel/index.js").GridCellCoordinate[];
  createPlan(options?: {
    readonly positions?: readonly import("../reel/index.js").GridCellSpinPosition[];
    readonly timing?: import("../reel/index.js").GridCellReelSpinTiming;
    readonly dimming?: import("../reel/index.js").GridCellDimmingPattern;
    readonly dimmingActivatedAtStart?: boolean;
    readonly activation?: import("../reel/index.js").GridCellReelActivationPlanOptions;
    readonly effects?: import("../reel/index.js").GridCellReelEffectPlanOptions;
  }): import("../reel/index.js").GridCellReelSpinPlan;
}

export interface SceneLayoutMainReelSpinInput extends SceneLayoutInitialReelScene {
  readonly random: () => number;
  /** X-first state matrix applied inside each exact reel landing transaction. */
  readonly landingStates?: readonly (readonly string[])[];
  /** Optional game-owned extension invoked after common grid-cell input validation. */
  readonly buildGridCellSpinPlan?: (
    stage: SceneLayoutGridCellSpinPlanStage,
  ) => import("../reel/index.js").GridCellReelSpinPlan;
}

export interface SceneLayoutMainReelContinuousSpinInput {
  readonly positions?: readonly import("../reel/index.js").GridCellSpinPosition[];
  /** Optional local-only source for unique per-cell public-strip start phases. */
  readonly random?: () => number;
  readonly dimming?: import("../reel/index.js").GridCellDimmingPattern;
  readonly dimmingActivatedAtStart?: boolean;
}

export interface SceneLayoutPackageRuntime extends SceneLayoutRuntime {
  init(options?: {
    readonly reels?: Readonly<
      Partial<Record<"main", SceneLayoutInitialReelScene>>
    >;
  }): Promise<void>;
  /** True only after the first exact server-authorized main scene is committed. */
  hasCommittedMainReelScene(): boolean;
  /** Confirms that an ownership-transferred host reel has atomically committed its initial scene. */
  acknowledgeMainReelSceneCommit(): void;
  resetReelScene(reelId: "main", input: SceneLayoutInitialReelScene): void;
  /**
   * Starts the manifest-selected reel presentation against a server target
   * while retaining the package-owned public local reel strips.
   */
  spinMainReelToScene(input: SceneLayoutMainReelSpinInput): void;
  /** Starts targetless rolling from the active public local reel strips. */
  startMainReelContinuousSpin(
    input?: SceneLayoutMainReelContinuousSpinInput,
  ): void;
  /** Injects the exact response target into the active continuous spin. */
  settleMainReelContinuousSpin(input: SceneLayoutMainReelSpinInput): void;
  /** Cancels targetless rolling without fabricating a landing target. */
  cancelMainReelContinuousSpin(): void;
  /** Returns the instance-scoped symbol area; currently only "main" exists. */
  getSymbolArea(
    reelId: string,
  ): import("../reel/index.js").PresentableSymbolArea;
  /** Additive settled-symbol mutation capability; legacy symbol APIs remain compatible. */
  getSymbolMutationArea(
    reelId: string,
  ): import("../reel/index.js").SymbolMutationArea;
  /** Returns the instance-scoped standard ReelSpin; currently only "main" exists. */
  getReelSpin(reelId: string): import("../reel/index.js").ReelSpin;
  /** Returns the first-layer standard reel area with presentation-owned spin. */
  getReelArea(reelId: string): import("../reel/index.js").ReelArea;
  /** Additive active standard-reel session controller. */
  getReelSpinSessionController(
    reelId: string,
  ): import("../reel/index.js").ReelSpinSessionController;
  /** Returns an opaque anchor for an exact named Scene Layout node. */
  getNodeAnchor(id: string): import("../presentation/index.js").RenderAnchor;
  /** Returns an additive safe RenderObject layer without exposing its Container. */
  getRenderLayer(
    ref: SceneLayoutRenderLayerRef,
  ): import("../presentation/index.js").RenderObjectLayer;
  /** Creates a detached, caller-owned object from an exact program resource name. */
  createRenderObject(
    name: string,
  ): Promise<import("../presentation/index.js").RenderObject>;
  /** Creates a detached image-string-backed number object from an exact program resource name. */
  createImgNumberRenderObject(
    name: string,
    options: {
      readonly text: string;
      readonly anchor?: { readonly x: number; readonly y: number };
    },
  ): Promise<import("../presentation/index.js").ImgNumberRenderObject>;
  isMainReelSpinning(): boolean;
  requestMainReelSymbolStates(
    positions: readonly { readonly x: number; readonly y: number }[],
    state: string,
    transitionMode?: import("../symbol/index.js").SymbolStateTransitionMode,
  ): void;
  playMainReelSymbolStateBatch(
    requests: readonly import("../reel/index.js").VisibleSymbolStatePlaybackRequest[],
    options?: import("../reel/index.js").VisibleSymbolStatePlaybackBatchOptions,
  ): Promise<void>;
  setMainReelSymbolPresentationValue(
    x: number,
    y: number,
    value: number | null,
  ): void;
  setMainReelSymbolImageStringText(
    x: number,
    y: number,
    name: string,
    text: string,
  ): void;
  getMainReelSymbolImageStringText(x: number, y: number, name: string): string;
  transferMainReelSymbols(
    input: import("../reel/index.js").DirectVisibleOccurrenceTransferBatchInput,
  ): Promise<void>;
  dropMainReelOccurrences(
    input: import("../reel/index.js").DirectGridCellCascadeDropInput,
  ): Promise<void>;
  waitForPresentationDelay(
    durationMs: number,
    signal?: AbortSignal,
  ): Promise<void>;
  getMainReelVisibleOccurrence(
    x: number,
    y: number,
  ): import("../reel/index.js").VisibleOccurrenceHandle;
  runMainReelVisibleOccurrenceTransfer(
    input: import("../reel/index.js").VisibleOccurrenceTransferInput,
    choreography: (
      scope: import("../reel/index.js").VisibleOccurrenceTransferScope,
    ) => Promise<void>,
  ): Promise<void>;
  drainMainReelLandingPositions(): readonly {
    readonly x: number;
    readonly y: number;
  }[];
  drainMainReelStartedPositions(): readonly {
    readonly x: number;
    readonly y: number;
  }[];
  drainMainReelActivationPositions(): readonly {
    readonly x: number;
    readonly y: number;
  }[];
  applyMainReelSnapshot(input: SceneLayoutInitialReelScene): void;
  getMainReelSymbolStateSnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly import("../reel/index.js").RenderVisibleSymbolStateSnapshot[];
  getMainReelSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly import("../reel/index.js").RenderVisibleSymbolGeometrySnapshot[];
  hasMainReelSymbolStateCapability(
    position: { readonly x: number; readonly y: number },
    state: string,
  ): boolean;
  getMainReelSceneSnapshot(): readonly (readonly number[])[];
  getMainReelCascadeValues(): import("../reel/index.js").GridCellCascadeValueMatrix;
  releaseMainReelSymbols(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): void;
  removeMainReelSymbols(
    options: import("../reel/index.js").GridCellTerminalRemoveOptions,
  ): Promise<void>;
  setMainReelSymbolDimming(
    highlightedPositions: readonly {
      readonly x: number;
      readonly y: number;
    }[],
    dimmingAlpha: number,
  ): void;
  clearMainReelSymbolDimming(): void;
  startMainReelCascadeDrop(
    plan: import("../reel/index.js").GridCellCascadeDropPlan,
  ): void;
  startMainReelGridCellSpin(
    plan: import("../reel/index.js").GridCellReelSpinPlan,
    options?: import("../reel/index.js").RenderGridCellReelSetSpinOptions,
  ): void;
  startMainReelEffectSweep(
    plan: import("../reel/index.js").GridCellEffectSweepPlan,
  ): void;
  /** Attaches a borrowed reel-space overlay above the main reel and below transitions/popups. */
  attachMainReelOverlay(overlay: Container): () => void;
  getReelPresentation(reelId: "main"): Container;
  getAwardCelebrationPopup(id: string): AwardCelebrationPlayer;
  getSpinePopup(id: string): import("../popup/index.js").SpinePopupPlayer;
  /** Layout-only layer for hosts that own their business reel. */
  getBackgroundPresentation(): Container;
  /** Transition overlay layer for hosts that own their business reel. */
  getModeTransitionPresentation(): Container;
  /** Popup layer for hosts that own their business reel. */
  getPopupPresentation(): Container;
  /** Routes whole-canvas pointer and keyboard input through the active Popup. */
  bindPopupInput(options: SceneLayoutPopupInputBindingOptions): () => void;
  /** Performs the active Popup phase's single primary interaction. */
  requestPrimaryPopupInteraction(): import("../popup/index.js").PopupInteractionDispatchResult;
  /** Returns a borrowed package-owned layer. Callers must not destroy it. */
  getLayer(id: SceneLayoutLayerId): Container;
  /** Returns the manifest-declared mode ids in their stable declaration order. */
  getGameModeIds(): readonly string[];
  /** Returns the committed mode and any transition target without mutating playback. */
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
  /**
   * Selects a stable mode without playing its directed transition.
   * @internal Game Layout Editor authoring preview only.
   */
  selectAuthoringGameMode(
    modeId: string,
    options?: SceneLayoutGameModeRequestOptions,
  ): Promise<void>;
  /**
   * Prepares the complete target scene and transition media without changing
   * the displayed or stable mode. Video transitions must be prepared before
   * the trusted user gesture that calls requestGameMode().
   */
  prepareGameModeTransition(
    modeId: string,
    options?: SceneLayoutGameModeRequestOptions,
  ): Promise<void>;
  /** Cancels a prepared transition that has not started. */
  cancelPreparedGameModeTransition(): void;
  /**
   * Starts a prepared video transition. Call this directly from the trusted
   * pointer/click listener: the implementation invokes audible video.play()
   * synchronously before its first await. Spine transitions may prepare lazily.
   */
  requestGameMode(
    modeId: string,
    options?: SceneLayoutGameModeRequestOptions,
  ): Promise<void>;
  /** Starts the current mode's explicit primary action, if one is declared. */
  requestPrimaryGameModeAction(
    options?: SceneLayoutGameModeRequestOptions,
  ): Promise<void>;
  /** Starts a video held after a completed transition prelude. Call from a trusted gesture. */
  startPendingGameModeVideo(): Promise<void>;
  /** Requests the active transition prelude to finish at its production boundary. */
  requestDismissGameModePrelude(): void;
  /** Cancels an active transition prelude and keeps the stable source mode. */
  dismissGameModePreludeImmediately(): void;
  /** Starts the award-celebration popup explicitly bound to the current stable mode. */
  startAwardCelebrationForCurrentMode(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): void;
  /** Plays the current mode award celebration and resolves after its complete lifecycle. */
  playAwardCelebrationForCurrentMode(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): Promise<void>;
  /** Advances the active mode popup according to its production interaction contract. */
  requestAdvanceAwardCelebration(): void;
  /** Immediately clears the active mode popup and its pending end lifecycle. */
  dismissActiveAwardCelebrationImmediately(): void;
  /** Returns the active mode popup snapshot, or null when no popup is active. */
  getActiveAwardCelebrationSnapshot():
    | import("../popup/index.js").AwardCelebrationSnapshot
    | null;
}
