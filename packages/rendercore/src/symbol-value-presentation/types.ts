import type { Container } from "pixi.js";
import type { RenderVisibleSymbolGeometrySnapshot } from "../reel/types.js";
import type {
  SymbolManifestAnimationPlaybackSpec,
  SymbolManifestSpineAnimationSpec,
  SymbolValuePresentationTextSpec,
} from "../symbol/manifest.js";

export interface SymbolValuePresentationItem {
  readonly x: number;
  readonly y: number;
  readonly symbol: string;
  readonly symbolCode: number;
  readonly value: number;
}

export interface SymbolValuePresentationTierResource {
  readonly maxExclusive?: number;
  readonly spec: SymbolManifestSpineAnimationSpec;
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly textureUrl: string;
  readonly atlasPage: string;
}

export interface SymbolValuePresentationResource {
  readonly symbol: string;
  readonly defaultValues: readonly number[];
  readonly activeSpineAnimations: Readonly<
    Partial<Record<string, SymbolManifestAnimationPlaybackSpec>>
  >;
  readonly tiers: readonly SymbolValuePresentationTierResource[];
  readonly text: SymbolValuePresentationTextSpec;
  readonly textImageUrls: Readonly<Record<number, string>>;
}

export type SymbolValuePresentationResourceMap = Readonly<
  Record<string, SymbolValuePresentationResource>
>;

export interface SymbolValueGeometryTarget {
  getVisibleSymbolGeometrySnapshots(
    positions: readonly { readonly x: number; readonly y: number }[],
  ): readonly RenderVisibleSymbolGeometrySnapshot[];
}

export interface PreparedSymbolValuePresentation {
  readonly itemCount: number;
  readonly items: readonly SymbolValuePresentationItem[];
}

export type SymbolValuePresentationPhase =
  | "idle"
  | "preparing"
  | "visible"
  | "destroyed";

export interface SymbolValuePresentationSnapshot {
  readonly phase: SymbolValuePresentationPhase;
  readonly activeCount: number;
  readonly items: readonly {
    readonly x: number;
    readonly y: number;
    readonly symbol: string;
    readonly symbolCode: number;
    readonly value: number;
    readonly tierIndex: number;
    readonly skeleton: string;
    readonly text: string;
  }[];
}

export interface SymbolValuePresenter {
  readonly container: Container;
  prepare(
    items: readonly SymbolValuePresentationItem[],
  ): Promise<PreparedSymbolValuePresentation>;
  discard(prepared: PreparedSymbolValuePresentation): void;
  show(prepared: PreparedSymbolValuePresentation): void;
  update(deltaSeconds: number): void;
  clear(): void;
  getSnapshot(): SymbolValuePresentationSnapshot;
  destroy(): void;
}
