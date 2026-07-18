import type { Container, Texture } from "pixi.js";

export interface ImageStringGlyphSpec {
  readonly path: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly offset: { readonly x: number; readonly y: number };
}

export interface ImageStringFixedAdvanceGroup {
  readonly id: string;
  readonly characters: readonly string[];
  readonly advanceWidth: number;
  readonly align: "start" | "center" | "end";
}

export interface ImageStringManifestV1 {
  readonly version: 1;
  readonly kind: "image-string";
  readonly id: string;
  readonly metrics: {
    readonly lineHeight: number;
    readonly letterSpacing: number;
  };
  readonly glyphs: Readonly<Record<string, ImageStringGlyphSpec>>;
  readonly fixedAdvanceGroups: readonly ImageStringFixedAdvanceGroup[];
}

export interface ImageStringResource {
  readonly manifest: ImageStringManifestV1;
  readonly textures: Readonly<Record<string, Texture>>;
  readonly destroyed: boolean;
  assertUsable(): void;
  destroy(): Promise<void>;
}

export interface ImageStringRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ImageStringOccurrenceSnapshot {
  readonly character: string;
  readonly path: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly advance: number;
  readonly groupId: string | null;
}

export interface ImageStringSnapshot {
  readonly text: string;
  readonly glyphCount: number;
  readonly logicalBounds: ImageStringRect;
  readonly visualBounds: ImageStringRect | null;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly occurrences: readonly ImageStringOccurrenceSnapshot[];
}

export interface RenderImageString {
  readonly container: Container;
  setText(text: string): void;
  setAnchor(anchor: { readonly x: number; readonly y: number }): void;
  getSnapshot(): ImageStringSnapshot;
  destroy(): void;
}
