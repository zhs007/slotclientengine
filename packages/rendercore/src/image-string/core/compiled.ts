import type { ImageStringManifestV1 } from "../data/types.js";
import type { ImageStringResource } from "./types.js";

export interface CompiledImageStringGlyph {
  readonly path: string;
  readonly width: number;
  readonly height: number;
  readonly offsetX: number;
  readonly offsetY: number;
  readonly advance: number;
  readonly alignOffset: number;
  readonly groupId: string | null;
}

export interface CompiledImageStringManifest {
  readonly manifest: ImageStringManifestV1;
  readonly glyphs: ReadonlyMap<string, CompiledImageStringGlyph>;
}

const compiledResources = new WeakMap<
  ImageStringResource,
  CompiledImageStringManifest
>();

export function compileImageStringManifest(
  manifest: ImageStringManifestV1,
): CompiledImageStringManifest {
  const groups = new Map<
    string,
    ImageStringManifestV1["fixedAdvanceGroups"][number]
  >();
  for (const group of manifest.fixedAdvanceGroups)
    for (const character of group.characters) groups.set(character, group);
  const glyphs = new Map<string, CompiledImageStringGlyph>();
  for (const [character, glyph] of Object.entries(manifest.glyphs)) {
    const group = groups.get(character);
    const advance = group?.advanceWidth ?? glyph.size.width;
    const alignOffset =
      group?.align === "center"
        ? (advance - glyph.size.width) / 2
        : group?.align === "end"
          ? advance - glyph.size.width
          : 0;
    glyphs.set(
      character,
      Object.freeze({
        path: glyph.path,
        width: glyph.size.width,
        height: glyph.size.height,
        offsetX: glyph.offset.x,
        offsetY: glyph.offset.y,
        advance,
        alignOffset,
        groupId: group?.id ?? null,
      }),
    );
  }
  return Object.freeze({ manifest, glyphs });
}

export function getCompiledImageStringResource(
  resource: ImageStringResource,
): CompiledImageStringManifest {
  let compiled = compiledResources.get(resource);
  if (!compiled) {
    compiled = compileImageStringManifest(resource.manifest);
    compiledResources.set(resource, compiled);
  }
  return compiled;
}
