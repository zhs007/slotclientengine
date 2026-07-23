export type SlotPlatformMode = "real" | "fun" | "replay";

export interface SlotPlatformInitialPreferences {
  readonly muted: boolean;
  readonly fastMode: boolean;
  readonly autoMode: boolean;
}

export interface SlotPlatformPresentation {
  readonly brandLabel: string;
  readonly currency: string;
  readonly locale: string;
}

export interface SlotPlatformBootstrapWarning {
  readonly code: string;
  readonly message: string;
}

export interface SlotPlatformBootstrapSnapshot {
  readonly platform: string;
  readonly mode: SlotPlatformMode;
  readonly gameCode: string;
  readonly businessCode: string;
  readonly language: string;
  readonly jurisdiction: string;
  readonly presentation: SlotPlatformPresentation;
  readonly initialPreferences: SlotPlatformInitialPreferences;
  readonly translations: Readonly<Record<string, string>>;
  readonly warnings: readonly SlotPlatformBootstrapWarning[];
}

export interface SlotPlatformBootstrapHandle {
  readonly snapshot: SlotPlatformBootstrapSnapshot;
  destroy(): void;
}

export interface SlotPlatformBootstrapProvider {
  prepare(signal: AbortSignal): Promise<SlotPlatformBootstrapHandle>;
}
