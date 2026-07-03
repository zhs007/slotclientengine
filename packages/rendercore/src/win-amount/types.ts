import type { Container } from "pixi.js";
import type {
  AssetUrlManifest,
  VNIProjectConfig,
} from "@slotclientengine/vnicore/core";

export interface WinAmountAnimationInput {
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
}

export interface WinAmountAnimationPoint {
  readonly x: number;
  readonly y: number;
}

export interface WinAmountAnimationRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface WinAmountAnimationLayout {
  readonly minorTextPosition: WinAmountAnimationPoint;
  readonly majorTextPosition: WinAmountAnimationPoint;
  readonly tierStageRect: WinAmountAnimationRect;
}

export interface WinAmountAnimationTextStyle {
  readonly minorFontSize: number;
  readonly majorFontSize: number;
  readonly fill: string;
  readonly stroke: string;
  readonly strokeWidth: number;
  readonly fontFamily?: string;
  readonly fontWeight?:
    | "normal"
    | "bold"
    | "bolder"
    | "lighter"
    | "100"
    | "200"
    | "300"
    | "400"
    | "500"
    | "600"
    | "700"
    | "800"
    | "900";
}

export interface WinAmountAnimationThresholdMultipliers {
  readonly minor: number;
  readonly big: number;
  readonly super: number;
  readonly mega: number;
}

export interface WinAmountAnimationTierConfig {
  readonly id: string;
  readonly thresholdMultiplier: number;
  readonly project: string;
  readonly durationSeconds: number;
  readonly loopStartTime: number;
  readonly loopEndTime: number;
  readonly keepParticlesAlive?: boolean;
}

export interface WinAmountAnimationTier extends WinAmountAnimationTierConfig {
  readonly project: string;
  readonly vniProject: VNIProjectConfig;
  readonly assetUrls: AssetUrlManifest;
  readonly keepParticlesAlive: boolean;
}

export interface CreateWinAmountAnimationTiersOptions {
  readonly tierConfigs: readonly WinAmountAnimationTierConfig[];
  readonly projectModules: Readonly<Record<string, unknown>>;
  readonly assetModules: Readonly<Record<string, string>>;
}

export interface WinAmountAnimationConfig {
  readonly formatter: (amountRaw: number) => string;
  readonly minorCountDurationSeconds: number;
  readonly majorCountDurationSeconds: number;
  readonly thresholdMultipliers: WinAmountAnimationThresholdMultipliers;
  readonly layout: WinAmountAnimationLayout;
  readonly textStyle: WinAmountAnimationTextStyle;
  readonly tiers: readonly WinAmountAnimationTier[];
}

export type WinAmountAnimationPhase =
  | "idle"
  | "minor-counting"
  | "major-counting"
  | "tier-counting"
  | "awaiting-dismiss"
  | "dismissing"
  | "complete";

export interface WinAmountAnimationUpdateResult {
  readonly completed: boolean;
  readonly phase: WinAmountAnimationPhase;
  readonly displayedAmountRaw: number;
  readonly activeTierId?: string;
}

export interface WinAmountAnimationPlayer {
  readonly container: Container;
  start(input: WinAmountAnimationInput): void;
  update(deltaSeconds: number): WinAmountAnimationUpdateResult;
  requestAdvance(): void;
  requestDismiss(): void;
  dismissImmediately(): void;
  applyLayout(layout: WinAmountAnimationLayout): void;
  isPlaying(): boolean;
  destroy(): void;
}
