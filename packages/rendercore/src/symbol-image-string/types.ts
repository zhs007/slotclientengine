import type { ImageStringResource } from "../image-string/types.js";
import type { SymbolImageStringNodeSpec } from "../symbol/manifest.js";

export interface SymbolImageStringNodeResource {
  readonly spec: SymbolImageStringNodeSpec;
  readonly resource: ImageStringResource;
}

export type SymbolImageStringResourceMap = Readonly<
  Record<string, readonly SymbolImageStringNodeResource[]>
>;

export interface SymbolImageStringResourcePool {
  readonly resources: ReadonlyMap<string, ImageStringResource>;
  get(resourcePath: string): ImageStringResource;
  destroy(): Promise<void>;
}
