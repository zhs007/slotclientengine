import type { Container } from "pixi.js";
import type {
  AssetUrlManifest,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/data";
import type { ImageStringResource } from "../image-string/core/index.js";
import type { SceneLayoutJsonData } from "./data/json-data.js";
import type { SymbolPackageResource } from "../symbol/package.js";
import type { PopupPackageResource } from "../popup/core/types.js";
import type { PopupAmountFormatter } from "../popup/data/types.js";
import type {
  ResolvedAudioEffect,
  ResolvedAudioEventTrack,
  ResolvedAudioMusic,
} from "@slotclientengine/audiocore/core";
import type { GameLayoutRuntimeAddress } from "./data/runtime-address.js";
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

export interface SceneLayoutRuntimeJsonResourceSpec {
  readonly kind: "json";
  readonly path: string;
}

export type SceneLayoutRuntimeResourceSpec =
  | SceneLayoutImageResourceSpec
  | SceneLayoutRuntimeSpineResourceSpec
  | SceneLayoutRuntimeImageStringResourceSpec
  | SceneLayoutRuntimeVniResourceSpec
  | SceneLayoutRuntimeVideoResourceSpec
  | SceneLayoutRuntimeJsonResourceSpec;

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
  readonly type: "award-celebration" | "spine" | "single-state";
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

export interface SceneLayoutGameModeV4 extends SceneLayoutGameModeV2 {
  /** Optional loop BGM name from the root audio catalog. */
  readonly bgm?: string;
}

export interface SceneLayoutGameModesV2 {
  readonly initialMode: string;
  readonly modes: readonly SceneLayoutGameModeV2[];
  readonly transitions?: readonly SceneLayoutGameModeTransition[];
}

export interface SceneLayoutGameModesV4 extends Omit<
  SceneLayoutGameModesV2,
  "modes"
> {
  readonly modes: readonly SceneLayoutGameModeV4[];
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

export interface SceneLayoutRuntimeAllocationMode {
  readonly variants: Readonly<
    Partial<
      Record<SceneLayoutVariantId, { readonly activeNodes: readonly string[] }>
    >
  >;
  readonly symbolPackage: string | null;
  readonly awardCelebrationPopup: string | null;
}

export interface SceneLayoutRuntimeAllocationV1 {
  readonly version: 1;
  readonly package: {
    readonly nodes: readonly string[];
    readonly symbolPackages: readonly string[];
    readonly popups: readonly string[];
  };
  readonly onDemand: {
    readonly transitions: readonly string[];
    readonly runtimeResources: readonly string[];
  };
  readonly modes: Readonly<Record<string, SceneLayoutRuntimeAllocationMode>>;
}

export interface SceneLayoutManifestV3 extends Omit<
  SceneLayoutManifestV2,
  "version"
> {
  readonly version: 3;
  readonly runtimeAllocation: SceneLayoutRuntimeAllocationV1;
}

export interface SceneLayoutManifestV4 extends Omit<
  SceneLayoutManifestV3,
  "version" | "gameModes"
> {
  readonly version: 4;
  readonly gameModes: SceneLayoutGameModesV4;
  readonly audio: import("@slotclientengine/audiocore/data").AudioCatalogManifestV1;
}

export interface SceneLayoutEventAudioBindingV1 {
  readonly event: GameLayoutRuntimeAddress;
  readonly audio: import("@slotclientengine/audiocore/data").AudioEventTrackBindingV1;
  readonly endEvent?: GameLayoutRuntimeAddress;
}

export interface SceneLayoutEventAudioV1 {
  readonly version: 1;
  readonly ignoreLegacyAudio: boolean;
  readonly bindings: readonly SceneLayoutEventAudioBindingV1[];
}

export interface SceneLayoutManifestV5 extends Omit<
  SceneLayoutManifestV4,
  "version"
> {
  readonly version: 5;
  readonly eventAudio: SceneLayoutEventAudioV1;
}

export type SceneLayoutManifestModern =
  | SceneLayoutManifestV2
  | SceneLayoutManifestV3
  | SceneLayoutManifestV4
  | SceneLayoutManifestV5;
export type SceneLayoutManifest =
  | SceneLayoutManifestV1
  | SceneLayoutManifestModern;
export type SceneLayoutManifestLatest = SceneLayoutManifestV5;

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
    }
  | {
      readonly kind: "json";
      readonly value: SceneLayoutJsonData;
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
  /** Initial-mode v1-compatible view preserved for existing host inspection. */
  readonly manifest: SceneLayoutManifestV1;
  /** Canonical latest document used by package runtime allocation and activation. */
  readonly runtimeManifest: SceneLayoutManifestLatest;
  readonly layout: SceneLayoutResource;
  readonly imageStrings: Readonly<Record<string, ImageStringResource>>;
  readonly symbolPackage: SymbolPackageResource | null;
  readonly symbolPackages: Readonly<Record<string, SymbolPackageResource>>;
  /** Parsed Popup catalogs; delivery resources expose these before image preparation. */
  readonly popupManifests?: Readonly<
    Record<string, PopupPackageResource["manifest"]>
  >;
  /** Eager Popup resources for legacy packages; delivery may keep this initially empty. */
  readonly popupPackages: Readonly<Record<string, PopupPackageResource>>;
  getLoadedPopupPackage?(id: string): PopupPackageResource | null;
  loadPopupPackage?(id: string): Promise<PopupPackageResource>;
  /** Fully-qualified effect routes aggregated at the Scene Layout boundary. */
  readonly audioEffects: Readonly<Record<string, ResolvedAudioEffect>>;
  readonly audioMusic: Readonly<Record<string, ResolvedAudioMusic>>;
  readonly audioEventTracks: Readonly<Record<string, ResolvedAudioEventTrack>>;
  readonly programmaticAudioEffects: ReadonlySet<string>;
  readonly runtimeResources: Readonly<
    Record<string, SceneLayoutRuntimeResource>
  >;
  /** Present only for CDN delivery resources split by ownership chunk. */
  readonly delivery?: SceneLayoutDeliveryResource;
  getLoadedRuntimeResource<Kind extends SceneLayoutRuntimeResource["kind"]>(
    key: string,
    kind: Kind,
  ): Extract<SceneLayoutRuntimeResource, { readonly kind: Kind }> | null;
  loadRuntimeResource<Kind extends SceneLayoutRuntimeResource["kind"]>(
    key: string,
    kind: Kind,
  ): Promise<Extract<SceneLayoutRuntimeResource, { readonly kind: Kind }>>;
  loadJsonData(key: string): Promise<SceneLayoutJsonData>;
  destroy(): Promise<void> | void;
}

export interface SceneLayoutDeliveryResource {
  isGameModeReady(modeId: string): boolean;
  loadGameMode(modeId: string): Promise<void>;
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
  /** Animates owner-controlled program properties on the host runtime clock. */
  readonly motion: SceneLayoutRenderObjectMotion;
  /** Program visibility is ANDed with authored variant/game-mode visibility. */
  setVisible(visible: boolean): void;
  /** Returns an exact opaque Spine slot or VNI text-layer parent. */
  getChildLayer(
    ref: import("../presentation/index.js").RenderObjectChildLayerRef,
  ): import("../presentation/index.js").RenderObjectLayer;
}

export type SceneLayoutRenderObjectMotionAxis = "x" | "y" | "both";
export type SceneLayoutRenderObjectMotionSelfAlignment =
  | RenderAlignment
  | "origin";

export interface SceneLayoutRenderObjectMotionTarget {
  readonly anchor: import("../presentation/index.js").RenderAnchor;
  readonly selfAlign: SceneLayoutRenderObjectMotionSelfAlignment;
  readonly axis: SceneLayoutRenderObjectMotionAxis;
  readonly offset?: SceneLayoutPoint;
}

export interface SceneLayoutRenderObjectMotionOptions extends SceneLayoutRenderObjectMotionTarget {
  readonly durationSeconds: number;
  readonly easing?: import("../presentation/index.js").RenderObjectMotionEasing;
  readonly signal?: AbortSignal;
}

export interface SceneLayoutRenderObjectPropertyAnimation {
  readonly position?: SceneLayoutRenderObjectMotionTarget;
  readonly opacity?: number;
  /** Multipliers applied to the authored placement scale. */
  readonly scale?: import("../presentation/index.js").RenderScale;
  /** Clockwise degrees added to the authored placement rotation. */
  readonly rotationDegrees?: number;
  readonly durationSeconds: number;
  readonly easing?: import("../presentation/index.js").RenderObjectMotionEasing;
  readonly signal?: AbortSignal;
}

export interface SceneLayoutRenderObjectMotion {
  getHomeAnchor(): import("../presentation/index.js").RenderAnchor;
  snap(target: SceneLayoutRenderObjectMotionTarget): void;
  move(options: SceneLayoutRenderObjectMotionOptions): Promise<void>;
  animate(animation: SceneLayoutRenderObjectPropertyAnimation): Promise<void>;
  fadeIn(
    options: import("../presentation/index.js").RenderObjectFadeOptions,
  ): Promise<void>;
  fadeOut(
    options: import("../presentation/index.js").RenderObjectFadeOptions,
  ): Promise<void>;
  cancel(): void;
  reset(): void;
}

export interface SceneLayoutImageRenderObject extends SceneLayoutRenderObjectBase {
  readonly kind: "image";
}

export interface SceneLayoutSpineLoopRenderObject extends SceneLayoutRenderObjectBase {
  readonly kind: "spine";
  readonly playback: "loop";
  /** Restarts the manifest-declared default animation and loop policy. */
  play(): void;
  /** Plays an exact animation and resolves at its once/first-loop boundary. */
  playAnimation(
    animationName: string,
    options?: SceneLayoutSpineAnimationPlayOptions,
  ): Promise<void>;
  /** Stops exact program playback and rejects its pending completion. */
  stopAnimation(): void;
  /** Atomically replaces this authored Spine node's caller-owned slot objects. */
  bindSlotObjects(
    bindings: readonly SceneLayoutSpineSlotObjectBinding[],
  ): SceneLayoutSpineSlotObjectAttachment;
}

export interface SceneLayoutSpineAnimationPlayOptions {
  readonly signal?: AbortSignal;
  readonly loop?: boolean;
}

export interface SceneLayoutSpineSlotObjectBinding {
  readonly slot: string;
  readonly object: import("../presentation/index.js").RenderObject;
  readonly followSlotColor?: boolean;
}

export interface SceneLayoutSpineSlotObjectAttachment {
  detach(): void;
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

export interface SceneLayoutGameModePrepareOptions {
  /** Explicitly rebuilds even when source and target use the same binding. */
  readonly recreateReel?: boolean;
  readonly reels?: Readonly<
    Partial<Record<"main", SceneLayoutInitialReelScene>>
  >;
}

export interface SceneLayoutGameModeRequestOptions extends SceneLayoutGameModePrepareOptions {
  /** Commits the target mode without playing its Popup or transition effect. */
  readonly immediate?: boolean;
  /** Final strings applied only for this request's transition prelude Popup. */
  readonly preludePopupStrings?: readonly SceneLayoutPopupStringInput[];
}

export interface SceneLayoutAwardCelebrationPlayInput {
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  /** Formats each floored raw amount for this playback only. */
  readonly formatMoney: PopupAmountFormatter;
  /** Multiplies only the amount motion duration; values below 1 play it faster. */
  readonly amountDurationScale?: number;
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

export type SceneLayoutPopupOpenRequest =
  | {
      readonly address: import("./data/runtime-address.js").GameLayoutRuntimeAddress;
      readonly type: "award-celebration";
      readonly instanceId?: string;
      readonly betAmountRaw: number;
      readonly winAmountRaw: number;
    }
  | {
      readonly address: import("./data/runtime-address.js").GameLayoutRuntimeAddress;
      readonly type: "spine";
      readonly instanceId?: string;
      readonly text?: string;
    }
  | {
      readonly address: import("./data/runtime-address.js").GameLayoutRuntimeAddress;
      readonly type: "single-state";
      readonly instanceId?: string;
    };

export interface SceneLayoutPopupSession {
  readonly address: import("./data/runtime-address.js").GameLayoutRuntimeAddress;
  readonly type: SceneLayoutPopupBinding["type"];
  /** Canonical live identity when the request supplied instanceId. */
  readonly instanceAddress:
    | import("./data/runtime-address.js").GameLayoutRuntimeAddress
    | null;
  /** Current scheduler-owned lifecycle state for this exact request. */
  readonly state: SceneLayoutPopupSessionState;
  /** Resolves after this queued request becomes active and reaches its first stable presentation. */
  readonly presented: Promise<void>;
  /** Resolves after this exact request closes or is cancelled; runtime destruction rejects it. */
  readonly finished: Promise<void>;
  /** Closes only this exact session. A stale session never closes a later Popup. */
  close(options?: SceneLayoutPopupCloseOptions): Promise<void>;
  /** Cancels a queued request or immediately closes this exact active session. */
  cancel(): Promise<void>;
}

export type SceneLayoutPopupSessionState =
  | "queued"
  | "opening"
  | "active"
  | "closing"
  | "finished"
  | "cancelled"
  | "failed";

export interface SceneLayoutPopupCloseOptions {
  readonly behavior?: "complete" | "immediate";
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
  /** Optional x-first public visual reel strips used only by this grid-cell spin. */
  readonly localReels?: readonly (readonly number[])[];
  /** X-first state matrix applied inside each exact reel landing transaction. */
  readonly landingStates?: readonly (readonly string[])[];
  /** Optional game-owned extension invoked after common grid-cell input validation. */
  readonly buildGridCellSpinPlan?: (
    stage: SceneLayoutGridCellSpinPlanStage,
  ) => import("../reel/index.js").GridCellReelSpinPlan;
}

export interface SceneLayoutMainReelContinuousSpinInput {
  readonly positions?: readonly import("../reel/index.js").GridCellSpinPosition[];
  /** Optional x-first public visual reel strips used only by this grid-cell roll. */
  readonly localReels?: readonly (readonly number[])[];
  /** Optional local-only source for unique per-cell public-strip start phases. */
  readonly random?: () => number;
  readonly dimming?: import("../reel/index.js").GridCellDimmingPattern;
  readonly dimmingActivatedAtStart?: boolean;
}

/** A package-scoped camera contribution composed with other active sessions. */
export interface SceneLayoutCameraEffectTarget {
  /** Uniform scene zoom. One is neutral and values below one are rejected. */
  readonly zoomScale: number;
  /** Maximum horizontal shake displacement in viewport pixels. */
  readonly shakeX: number;
  /** Maximum vertical shake displacement in viewport pixels. */
  readonly shakeY: number;
  /** Oscillation frequency used while either shake displacement is non-zero. */
  readonly shakeFrequencyHz: number;
  /** Time used to interpolate from the current contribution to this target. */
  readonly transitionSeconds: number;
}

export interface SceneLayoutCameraEffectSession {
  /** Retargets this owner without disturbing other active camera owners. */
  setTarget(target: SceneLayoutCameraEffectTarget): void;
  /** Smoothly returns this owner to neutral and resolves after ownership is released. */
  finish(options?: { readonly durationSeconds?: number }): Promise<void>;
  /** Immediately releases this owner's contribution. */
  cancel(): void;
}

export interface SceneLayoutPackageRuntime extends SceneLayoutRuntime {
  /** Canonical owner-first lookup, capability, and event subscription SPI. */
  readonly addresses: import("./core/runtime-address.js").GameLayoutRuntimeAddresses;
  init(options?: {
    readonly reels?: Readonly<
      Partial<Record<"main", SceneLayoutInitialReelScene>>
    >;
  }): Promise<void>;
  /** Plays a Game Layout allowlisted global route such as `award.coin`. */
  playEffect(
    route: string,
  ): import("@slotclientengine/audiocore/core").AudioPlaybackHandle;
  /** Idempotently cancels delayed and active instances for an allowlisted route. */
  stopEffect(route: string): void;
  /** Must be called from a valid browser user gesture before audible preview/game playback. */
  unlockAudio(): Promise<void>;
  setAudioMuted(muted: boolean): void;
  setMusicVolume(volume: number): void;
  setEffectVolume(volume: number): void;
  /** Starts an independently owned camera contribution on the main scene only. */
  startCameraEffect(
    target: SceneLayoutCameraEffectTarget,
    options?: { readonly signal?: AbortSignal },
  ): SceneLayoutCameraEffectSession;
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
    options?: { readonly instanceId?: string },
  ): Promise<import("../presentation/index.js").RenderObject>;
  /** Creates a detached, fixed-capacity trail from an exact image resource. */
  createParticleTrailRenderObject(
    name: string,
    options: {
      readonly emitter: import("../presentation/index.js").RenderAnchor;
      readonly config: import("../presentation/index.js").ParticleTrailConfig;
    },
  ): Promise<import("../presentation/index.js").ParticleTrailRenderObject>;
  /** Creates a detached image-string-backed number object from an exact program resource name. */
  createImgNumberRenderObject(
    name: string,
    options: {
      readonly text: string;
      readonly instanceId?: string;
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
    requests: readonly SceneLayoutMainReelSymbolStatePlaybackRequest[],
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
  /** @deprecated Use openPopup()/closePopup(); retained for editor diagnostics and migration only. */
  getAwardCelebrationPopup(
    id: string,
  ): import("../popup/core/types.js").AwardCelebrationRuntime;
  /** @deprecated Use openPopup()/closePopup(); retained for editor diagnostics and migration only. */
  getSpinePopup(id: string): import("../popup/core/types.js").SpinePopupRuntime;
  /** @deprecated Use openPopup()/closePopup(); retained for editor diagnostics and migration only. */
  getSingleStatePopup(
    id: string,
  ): import("../popup/core/types.js").SingleStatePopupRuntime;
  /** Layout-only layer for hosts that own their business reel. */
  getBackgroundPresentation(): Container;
  /** Transition overlay layer for hosts that own their business reel. */
  getModeTransitionPresentation(): Container;
  /** Popup layer for hosts that own their business reel. */
  getPopupPresentation(): Container;
  /** Routes whole-canvas pointer and keyboard input through the active Popup. */
  bindPopupInput(options: SceneLayoutPopupInputBindingOptions): () => void;
  /** Performs the active Popup phase's single primary interaction. */
  requestPrimaryPopupInteraction(): import("../popup/input-binding.js").PopupInteractionDispatchResult;
  /** Opens one exact exported Popup only when no Popup work is active or queued. */
  openPopup(request: SceneLayoutPopupOpenRequest): SceneLayoutPopupSession;
  /** Queues one exact exported Popup behind all previously requested Popup lifecycles. */
  enqueuePopup(request: SceneLayoutPopupOpenRequest): SceneLayoutPopupSession;
  /** Requests or immediately performs closure of the one active Popup. */
  closePopup(options?: SceneLayoutPopupCloseOptions): Promise<void>;
  /** Allocation-free query for the one active Popup owner address. */
  getActivePopupAddress():
    | import("./data/runtime-address.js").GameLayoutRuntimeAddress
    | null;
  /** Returns a borrowed package-owned layer. Callers must not destroy it. */
  getLayer(id: SceneLayoutLayerId): Container;
  /** Returns the manifest-declared mode ids in their stable declaration order. */
  getGameModeIds(): readonly string[];
  /** Allocation-free committed mode query for game runtime hot paths. */
  getStableGameMode(): string;
  /** Allocation-free transition phase query for game runtime hot paths. */
  getGameModePhase(): "stable" | "transitioning";
  /** @deprecated Editor diagnostics should use SceneLayoutPackageRuntimeInspector. */
  getGameModeSnapshot(): SceneLayoutGameModeSnapshot;
  /**
   * Selects a stable mode without playing its directed transition.
   * @internal Game Layout Editor authoring preview only.
   */
  selectAuthoringGameMode(
    modeId: string,
    options?: SceneLayoutGameModePrepareOptions,
  ): Promise<void>;
  /**
   * Prepares the complete target scene and transition media without changing
   * the displayed or stable mode. Video transitions must be prepared before
   * the trusted user gesture that calls requestGameMode().
   */
  prepareGameModeTransition(
    modeId: string,
    options?: SceneLayoutGameModePrepareOptions,
  ): Promise<void>;
  /** Cancels a prepared transition that has not started. */
  cancelPreparedGameModeTransition(): void;
  /**
   * Starts a prepared video transition. Call normal video requests directly
   * from the trusted pointer/click listener: the implementation invokes audible
   * video.play() synchronously before its first await. Spine transitions may
   * prepare lazily. immediate skips all transition presentation.
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
  /** Queues the award-celebration popup explicitly bound to the current stable mode. */
  startAwardCelebrationForCurrentMode(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): void;
  /** Plays the current mode award celebration and resolves after its complete lifecycle. */
  playAwardCelebrationForCurrentMode(
    input: SceneLayoutAwardCelebrationPlayInput,
  ): Promise<void>;
  /** Advances the active mode popup according to its production interaction contract. */
  requestAdvanceAwardCelebration(): void;
  /** Immediately clears the active mode popup and its pending end lifecycle. */
  dismissActiveAwardCelebrationImmediately(): void;
  /** Returns the active mode popup phase without constructing a diagnostic snapshot. */
  getActiveAwardCelebrationPhase():
    | import("../popup/core/types.js").AwardCelebrationPhase
    | null;
}

export type SceneLayoutMainReelSymbolStatePlaybackRequest =
  import("../reel/index.js").VisibleSymbolStatePlaybackRequest & {
    /** Event identity override; omitted resolves the lowest symbol code in positions. */
    readonly symbol?: string;
  };
