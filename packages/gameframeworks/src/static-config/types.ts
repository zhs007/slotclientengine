export interface SlotGameStaticSize {
  readonly width: number;
  readonly height: number;
}

export interface SlotGameStaticRect extends SlotGameStaticSize {
  readonly x: number;
  readonly y: number;
}

export interface SlotGameStaticPoint {
  readonly x: number;
  readonly y: number;
}

export interface SlotGameStaticMargin {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
}

export interface SlotGameStaticImageResource extends SlotGameStaticSize {
  readonly url: string;
}

export interface SlotGameStaticLiveConfig {
  readonly serverUrl: string;
  readonly gamecode: string;
  readonly rejectQueryParams: readonly string[];
}

export type SlotGameStaticReelDirection = "forward" | "reverse";

export interface SlotGameStaticBaseReelConfig {
  readonly reelsName: string;
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly direction: SlotGameStaticReelDirection;
  readonly minimumSpinCycles: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
}

export interface SlotGameStaticNormalReelConfig extends SlotGameStaticBaseReelConfig {
  readonly kind: "normal";
}

export interface SlotGameStaticGridCellReelConfig extends SlotGameStaticBaseReelConfig {
  readonly kind: "grid-cell";
}

export type SlotGameStaticReelConfig =
  | SlotGameStaticNormalReelConfig
  | SlotGameStaticGridCellReelConfig;

export interface SlotGameStaticSymbolsConfig {
  readonly manifest: unknown;
  readonly pngModules: Readonly<Record<string, string>>;
  readonly emptySymbols: readonly string[];
  readonly requireExplicitScale: boolean;
  readonly requiredStates: readonly string[];
}

export type SlotGameStaticArtVariantId = "landscape" | "portrait";

export interface SlotGameStaticFrameFocusRect extends SlotGameStaticSize {}

export interface SlotGameStaticConveyorConfig extends SlotGameStaticImageResource {
  readonly positionInFocusRect: SlotGameStaticPoint;
}

export interface SlotGameStaticArtVariant {
  readonly background: SlotGameStaticImageResource;
  readonly focusRect: SlotGameStaticRect;
  readonly frameFocusRect: SlotGameStaticFrameFocusRect;
  readonly minFocusMargin?: SlotGameStaticMargin;
  readonly mainReelBackgroundPositionInFocusRect: SlotGameStaticPoint;
  readonly conveyor?: SlotGameStaticConveyorConfig;
}

export interface SlotGameStaticOrientationFocusArtConfig {
  readonly mode: "orientation-focus";
  readonly variants: Readonly<
    Record<SlotGameStaticArtVariantId, SlotGameStaticArtVariant>
  >;
  readonly mainReelBackground: SlotGameStaticImageResource;
  readonly reelWindowInMainReelBackground: SlotGameStaticRect;
}

export type SlotGameStaticArtConfig = SlotGameStaticOrientationFocusArtConfig;

export interface SlotGameStaticSkinConfig {
  readonly label: string;
  readonly symbols: SlotGameStaticSymbolsConfig;
  readonly art: SlotGameStaticArtConfig;
}

export interface SlotGameStaticConfig {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly brandLabel: string;
  readonly live: SlotGameStaticLiveConfig;
  readonly supportedSkins: readonly string[];
  readonly gameConfig: unknown;
  readonly skins: Readonly<Record<string, SlotGameStaticSkinConfig>>;
  readonly reel: SlotGameStaticReelConfig;
}

export interface SlotGameStaticFramePolicyVariant {
  readonly maxDesignSize: SlotGameStaticSize;
  readonly focusRect: SlotGameStaticSize;
  readonly minFocusMargin?: SlotGameStaticMargin;
}

export interface SlotGameStaticFramePolicy {
  readonly mode: "orientation-focus";
  readonly variants: {
    readonly landscape: SlotGameStaticFramePolicyVariant;
    readonly portrait: SlotGameStaticFramePolicyVariant;
  };
}
