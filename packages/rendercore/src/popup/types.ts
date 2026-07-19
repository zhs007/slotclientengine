import type { Container, Texture } from "pixi.js";
import type { ImageStringResource } from "../image-string/index.js";
import type { OfficialSpinePlayerResource } from "../spine/runtime-player.js";
import type {
  AssetUrlManifest,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

export type PopupSegment = "start" | "loop" | "end";
export type AwardTierId =
  | "base"
  | "standard"
  | "bigwin"
  | "superwin"
  | "megawin";

export interface PopupAmountFormat {
  readonly rawScale: number;
  readonly fractionDigits: number;
  readonly useGrouping: boolean;
  readonly groupSeparator: string;
  readonly decimalSeparator: string;
  readonly prefix: string;
  readonly suffix: string;
  readonly rounding: "floor";
}

export type PopupResourceSpec =
  | { readonly kind: "image"; readonly path: string; readonly size: PopupSize }
  | { readonly kind: "image-string"; readonly manifest: string }
  | { readonly kind: "vni"; readonly project: string }
  | {
      readonly kind: "spine";
      readonly skeleton: string;
      readonly atlas: string;
      readonly textures: Readonly<Record<string, string>>;
    };

export interface PopupSize {
  readonly width: number;
  readonly height: number;
}
export interface PopupTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}
export interface PopupAnchor {
  readonly x: number;
  readonly y: number;
}
export interface PopupLayerBase {
  readonly id: string;
  readonly order: number;
  readonly resource: string;
  readonly transform: PopupTransform;
}
export type PopupLayer =
  | (PopupLayerBase & {
      readonly kind: "image";
      readonly anchor: PopupAnchor;
      readonly visibleSegments: readonly PopupSegment[];
    })
  | (PopupLayerBase & {
      readonly kind: "image-string";
      readonly binding: "win-amount";
      readonly anchor: PopupAnchor;
      readonly visibleSegments: readonly PopupSegment[];
    })
  | (PopupLayerBase & {
      readonly kind: "vni";
      readonly playback: {
        readonly mode: "segmented";
        readonly loopStartTime: number;
        readonly loopEndTime: number;
        readonly keepParticlesAlive: boolean;
      };
    })
  | (PopupLayerBase & {
      readonly kind: "spine";
      readonly playback: {
        readonly mode: "segmented-animations";
        readonly startAnimation: string;
        readonly loopAnimation: string;
        readonly endAnimation: string;
      };
    });

export interface AwardTierPresentation {
  readonly countDurationSeconds: number;
  readonly layers: readonly PopupLayer[];
}
export interface AwardCelebrationTier extends AwardTierPresentation {
  readonly id: "bigwin" | "superwin" | "megawin";
  readonly thresholdMultiplier: number;
}
export interface AwardCelebrationSpec {
  readonly base: AwardTierPresentation;
  readonly standard: AwardTierPresentation;
  readonly celebrationTiers: readonly AwardCelebrationTier[];
}

export interface PopupManifestV1 {
  readonly version: 1;
  readonly kind: "popup";
  readonly id: string;
  readonly type: "award-celebration";
  readonly designViewport: PopupSize;
  readonly amountFormat: PopupAmountFormat;
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
  readonly awardCelebration: AwardCelebrationSpec;
}

export interface AwardCelebrationInput {
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
}
export type AwardCelebrationPhase =
  | "idle"
  | "counting"
  | "awaiting-dismiss"
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
  | PopupPreparedImageString
  | PopupPreparedVni
  | PopupPreparedSpine;

export interface PopupPackageResource {
  readonly manifest: PopupManifestV1;
  readonly resources: Readonly<Record<string, PopupPreparedResource>>;
  destroy(): void | Promise<void>;
}

export interface AwardCelebrationPlayer {
  readonly container: Container;
  init(): Promise<void>;
  start(input: AwardCelebrationInput): void;
  update(deltaSeconds: number): AwardCelebrationSnapshot;
  requestAdvance(): void;
  requestDismiss(): void;
  dismissImmediately(): void;
  getSnapshot(): AwardCelebrationSnapshot;
  isPlaying(): boolean;
  destroy(): void;
}
