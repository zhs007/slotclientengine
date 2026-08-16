import type { ImageStringResource } from "../image-string/core/types.js";
import type {
  SymbolImageStringNodeSpec,
  SymbolImageStringSpecialValueImageSpec,
} from "../symbol/manifest.js";
import type { Texture } from "pixi.js";
import type { SymbolImageStringSpecialImageResource } from "./mapped-display.js";

export interface SymbolImageStringNodeResource {
  readonly spec: SymbolImageStringNodeSpec;
  readonly spineStates?: ReadonlySet<string>;
  readonly resource: ImageStringResource;
  readonly specialValueImages?: Readonly<
    Record<string, SymbolImageStringSpecialImageResource>
  >;
  readonly spinBlurProfile?: SymbolImageStringPreparedProfile;
}

export interface SymbolImageStringPreparedProfile {
  readonly resource: ImageStringResource;
  readonly specialValueImages?: Readonly<
    Record<string, SymbolImageStringSpecialImageResource>
  >;
}

export type SymbolImageStringResourceMap = Readonly<
  Record<string, readonly SymbolImageStringNodeResource[]>
>;

export interface SymbolImageStringResourcePool {
  readonly resources: ReadonlyMap<string, ImageStringResource>;
  readonly specialImages: ReadonlyMap<string, Texture>;
  get(resourcePath: string): ImageStringResource;
  getSpecialImage(imagePath: string): Texture;
  destroy(): Promise<void>;
}

export type { SymbolImageStringSpecialValueImageSpec };
