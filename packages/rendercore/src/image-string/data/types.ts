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
