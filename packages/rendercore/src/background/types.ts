import type { Container } from "pixi.js";

export interface BackgroundSize {
  readonly width: number;
  readonly height: number;
}

export interface BackgroundRect extends BackgroundSize {
  readonly x: number;
  readonly y: number;
}

export interface SpineBackgroundTransform {
  readonly x: number;
  readonly y: number;
  readonly scale: number;
}

export interface SpineBackgroundStateSpec {
  readonly animation: string;
}

export interface SpineBackgroundTransitionSpec {
  readonly from: string;
  readonly to: string;
  readonly animation: string;
}

export interface ParsedSpineBackgroundManifest {
  readonly version: 1;
  readonly kind: "spine";
  readonly artSize: BackgroundSize;
  readonly adaptation: {
    readonly mode: "maximized-focus";
    readonly focusRect: BackgroundRect;
  };
  readonly resource: {
    readonly skeleton: string;
    readonly atlas: string;
    readonly textures: Readonly<Record<string, string>>;
    readonly transform: SpineBackgroundTransform;
  };
  readonly initialState: string;
  readonly states: Readonly<Record<string, SpineBackgroundStateSpec>>;
  readonly transitions: readonly SpineBackgroundTransitionSpec[];
}

export interface SpineBackgroundResource {
  readonly manifest: ParsedSpineBackgroundManifest;
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly textureUrls: Readonly<Record<string, string>>;
  readonly atlasPages: readonly string[];
}

export interface SpineBackgroundSnapshot {
  readonly stableState: string;
  readonly targetState: string | null;
  readonly phase: "stable" | "transitioning";
}

export interface SpineBackgroundPlayer {
  readonly container: Container;
  init(): Promise<void>;
  update(deltaSeconds: number): void;
  requestState(state: string): Promise<void>;
  getSnapshot(): SpineBackgroundSnapshot;
  destroy(): void;
}
