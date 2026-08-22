import type { Container, Texture } from "pixi.js";
import type {
  AssetUrlManifest,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/data";
import type { ImageStringResource } from "../../image-string/core/index.js";
import type { OfficialSpinePlayerResource } from "../../spine/runtime-player.js";
import type { RenderObject } from "../../presentation/render-object.js";
import type {
  AwardTierId,
  PopupManifest,
  PopupSegment,
  PopupSize,
} from "../data/types.js";

export interface PopupStringNodeHandle {
  readonly kind: "text" | "image-string";
  readonly name: string;
  readonly index: number;
  readonly text: string;
  readonly overridden: boolean;
  setText(text: string): void;
  resetText(): void;
}
export type PopupStringNodeSelector = string | number;

export type PopupRuntimeStateTransition =
  | {
      readonly kind: "phase";
      readonly previous: string;
      readonly current: string;
    }
  | {
      readonly kind: "tier";
      readonly previous: string | null;
      readonly previousSegment: PopupSegment | null;
      readonly current: string | null;
      readonly currentSegment: PopupSegment | null;
    }
  | {
      readonly kind: "segment";
      readonly tier: string;
      readonly previous: PopupSegment;
      readonly current: PopupSegment;
    };
export type PopupRuntimeStateObserver = (
  transition: PopupRuntimeStateTransition,
) => void;

export interface PopupHostPlacement {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface PopupPresentationSnapshot {
  readonly viewportSize: PopupSize;
  readonly contentScale: number;
  readonly contentPosition: { readonly x: number; readonly y: number };
  readonly focusRectInViewport?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
}

export interface AwardCelebrationInput {
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
}
export type AwardCelebrationPhase =
  | "idle"
  | "counting"
  | "dismissing"
  | "complete";
export interface AwardCelebrationSnapshot {
  readonly phase: AwardCelebrationPhase;
  readonly activeTierId: AwardTierId | null;
  readonly activeSegment: PopupSegment | null;
  readonly displayedAmountRaw: number;
  readonly finalAmountRaw: number;
  readonly formattedAmount: string;
  readonly activeLayerCount: number;
  readonly endingLayerCount: number;
}

export interface PopupPreparedImage {
  readonly kind: "image";
  readonly texture: Texture;
}
export interface PopupPreparedImageString {
  readonly kind: "image-string";
  readonly resource: ImageStringResource;
}
export interface PopupPreparedFont {
  readonly kind: "font";
  readonly family: string;
}
export interface PopupPreparedVni {
  readonly kind: "vni";
  readonly project: VNIProjectConfig;
  readonly assetUrls: AssetUrlManifest;
}
export interface PopupPreparedSpine {
  readonly kind: "spine";
  readonly resource: OfficialSpinePlayerResource;
}
export type PopupPreparedResource =
  | PopupPreparedImage
  | PopupPreparedFont
  | PopupPreparedImageString
  | PopupPreparedVni
  | PopupPreparedSpine;

export interface PopupPackageResource<
  TManifest extends PopupManifest = PopupManifest,
> {
  readonly manifest: TManifest;
  readonly resources: Readonly<Record<string, PopupPreparedResource>>;
  destroy(): void | Promise<void>;
}

export interface AwardCelebrationRuntime {
  readonly container: Container;
  readonly textNodes: readonly PopupStringNodeHandle[];
  readonly imageStringNodes: readonly PopupStringNodeHandle[];
  applyViewport?(
    viewportSize: PopupSize,
    placement?: PopupHostPlacement,
  ): PopupPresentationSnapshot;
  init(): Promise<void>;
  start(input: AwardCelebrationInput): void;
  update(deltaSeconds: number): void;
  /** Advances to the next reachable amount/tier milestone; reaching the final amount starts graceful dismissal. */
  requestAdvance(): void;
  /** Commits the final amount and starts the graceful end lifecycle. */
  requestDismiss(): void;
  /** Immediately clears any active presentation. */
  dismissImmediately(): void;
  getPhase(): AwardCelebrationPhase;
  isPlaying(): boolean;
  getTextNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  getImageStringNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  destroy(): void;
}

export type SpinePopupPhase = "idle" | "start" | "loop" | "end" | "complete";
export interface SpinePopupSnapshot {
  readonly phase: SpinePopupPhase;
  readonly dismissRequested: boolean;
}
export interface SpinePopupRuntime {
  readonly container: Container;
  readonly textNodes: readonly PopupStringNodeHandle[];
  readonly imageStringNodes: readonly PopupStringNodeHandle[];
  applyViewport?(
    viewportSize: PopupSize,
    placement?: PopupHostPlacement,
  ): PopupPresentationSnapshot;
  init(): Promise<void>;
  start(text?: string): void;
  update(deltaSeconds: number): void;
  requestDismiss(): void;
  dismissImmediately(): void;
  getPhase(): SpinePopupPhase;
  isPlaying(): boolean;
  getTextNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  getImageStringNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  destroy(): void;
}

export type SingleStatePopupPhase = "idle" | "active" | "complete";
export interface SingleStatePopupSnapshot {
  readonly phase: SingleStatePopupPhase;
  readonly activeLayerCount: number;
}
export interface SingleStatePopupRuntime {
  readonly container: Container;
  readonly textNodes: readonly PopupStringNodeHandle[];
  readonly imageStringNodes: readonly PopupStringNodeHandle[];
  applyViewport?(
    viewportSize: PopupSize,
    placement?: PopupHostPlacement,
  ): PopupPresentationSnapshot;
  init(): Promise<void>;
  start(): void;
  update(deltaSeconds: number): void;
  requestDismiss(): void;
  dismissImmediately(): void;
  getPhase(): SingleStatePopupPhase;
  isPlaying(): boolean;
  getLayer(name: string): RenderObject;
  getTextNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  getImageStringNode(selector: PopupStringNodeSelector): PopupStringNodeHandle;
  destroy(): void;
}
