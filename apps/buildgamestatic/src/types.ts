export interface BuildGameStaticCliOptions {
  readonly inputPath: string;
  readonly outPath: string;
  readonly loadingOutPath?: string;
  readonly gameId: string;
  readonly rootDir?: string;
  readonly check: boolean;
}

export interface BuildGameStaticResolvedOptions {
  readonly inputPath: string;
  readonly outPath: string;
  readonly loadingOutPath?: string;
  readonly gameId: string;
  readonly rootDir: string;
  readonly check: boolean;
}

export interface BuildGameStaticResult {
  readonly outputPath: string;
  readonly generated: string;
  readonly changed: boolean;
  readonly loadingOutputPath?: string;
  readonly loadingGenerated?: string;
  readonly loadingChanged?: boolean;
  readonly checked: boolean;
}

export interface GameStaticYamlConfig {
  readonly schemaVersion: 1;
  readonly gameId: string;
  readonly brandLabel: string;
  readonly live: GameStaticYamlLiveConfig;
  readonly supportedSkins: readonly string[];
  readonly gameConfig: string;
  readonly reel: GameStaticYamlReelConfig;
  readonly skins: Readonly<Record<string, GameStaticYamlSkinConfig>>;
  readonly loading?: GameStaticYamlLoadingConfig;
}

export interface GameStaticYamlLiveConfig {
  readonly serverUrl: string;
  readonly gamecode: string;
  readonly rejectQueryParams: readonly string[];
}

export interface GameStaticYamlReelConfig {
  readonly kind: "normal";
  readonly reelsName: string;
  readonly reelCount: number;
  readonly visibleRows: number;
  readonly direction: "forward" | "reverse";
  readonly minimumSpinCycles: number;
  readonly baseDurationMs: number;
  readonly speedSymbolsPerSecond: number;
  readonly startDelayMs: number;
  readonly stopDelayMs: number;
}

export interface GameStaticYamlSize {
  readonly width: number;
  readonly height: number;
}

export interface GameStaticYamlRect extends GameStaticYamlSize {
  readonly x: number;
  readonly y: number;
}

export interface GameStaticYamlPoint {
  readonly x: number;
  readonly y: number;
}

export interface GameStaticYamlMargin {
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
}

export interface GameStaticYamlImage extends GameStaticYamlSize {
  readonly path: string;
}

export interface GameStaticYamlConveyor extends GameStaticYamlImage {
  readonly positionInFocusRect: GameStaticYamlPoint;
}

export interface GameStaticYamlReelArea extends GameStaticYamlRect {
  readonly reelCount: number;
  readonly reelGap: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface GameStaticYamlSkinConfig {
  readonly label: string;
  readonly symbols: GameStaticYamlSymbolsConfig;
  readonly art: GameStaticYamlArtConfig;
}

export interface GameStaticYamlSymbolsConfig {
  readonly manifest: string;
  readonly pngGlob: string;
  readonly vniProjectGlob?: string;
  readonly vniAssetGlob?: string;
  readonly emptySymbols: readonly string[];
  readonly requireExplicitScale: boolean;
  readonly requiredStates: readonly string[];
}

export interface GameStaticYamlArtVariant {
  readonly background: GameStaticYamlImage;
  readonly focusRect: GameStaticYamlRect;
  readonly frameFocusRect: GameStaticYamlSize;
  readonly minFocusMargin?: GameStaticYamlMargin;
  readonly mainReelBackgroundPositionInFocusRect: GameStaticYamlPoint;
  readonly conveyor?: GameStaticYamlConveyor;
}

export interface GameStaticYamlArtConfig {
  readonly mode: "orientation-focus";
  readonly variants: Readonly<
    Record<"landscape" | "portrait", GameStaticYamlArtVariant>
  >;
  readonly mainReelBackground: GameStaticYamlImage;
  readonly reelAreaInMainReelBackground: GameStaticYamlReelArea;
}

export interface GameStaticYamlLoadingConfig {
  readonly resources: readonly GameStaticYamlLoadingResource[];
}

export type GameStaticYamlLoadingResource =
  | {
      readonly id: string;
      readonly path: string;
      readonly kind?: string;
      readonly weight?: number;
    }
  | {
      readonly id: string;
      readonly glob: string;
      readonly kind?: string;
      readonly weight?: number;
    };
