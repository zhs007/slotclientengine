import type { Container, Texture } from "pixi.js";
import type { ImageStringManifestV1 } from "../data/types.js";

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
  setResource(resource: ImageStringResource, text?: string): void;
  setText(text: string): void;
  setAnchor(anchor: { readonly x: number; readonly y: number }): void;
  getText(): string;
  getGeometry(): Readonly<{
    logicalBounds: ImageStringRect;
    visualBounds: ImageStringRect | null;
    anchor: Readonly<{ x: number; y: number }>;
  }>;
  destroy(): void;
}
