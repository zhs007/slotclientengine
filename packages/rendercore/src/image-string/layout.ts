import { ImageStringError } from "./errors.js";
import { validateImageStringText } from "./manifest.js";
import type { ImageStringManifestV1, ImageStringSnapshot } from "./types.js";

export function layoutImageString(options: {
  readonly manifest: ImageStringManifestV1;
  readonly text: string;
  readonly anchor?: { readonly x: number; readonly y: number };
}): ImageStringSnapshot {
  const anchor = validateImageStringAnchor(
    options.anchor ?? { x: 0.5, y: 0.5 },
  );
  const characters = validateImageStringText(options.text, options.manifest);
  const groupByCharacter = new Map<
    string,
    ImageStringManifestV1["fixedAdvanceGroups"][number]
  >();
  for (const group of options.manifest.fixedAdvanceGroups)
    for (const character of group.characters)
      groupByCharacter.set(character, group);
  let cursorX = 0;
  let visualLeft = Number.POSITIVE_INFINITY;
  let visualTop = Number.POSITIVE_INFINITY;
  let visualRight = Number.NEGATIVE_INFINITY;
  let visualBottom = Number.NEGATIVE_INFINITY;
  const occurrences = characters.map((character, index) => {
    const glyph = options.manifest.glyphs[character];
    const group = groupByCharacter.get(character);
    const advance = group?.advanceWidth ?? glyph.size.width;
    const alignOffset =
      group?.align === "center"
        ? (advance - glyph.size.width) / 2
        : group?.align === "end"
          ? advance - glyph.size.width
          : 0;
    const x = cursorX + alignOffset + glyph.offset.x;
    const y = glyph.offset.y;
    visualLeft = Math.min(visualLeft, x);
    visualTop = Math.min(visualTop, y);
    visualRight = Math.max(visualRight, x + glyph.size.width);
    visualBottom = Math.max(visualBottom, y + glyph.size.height);
    cursorX += advance;
    if (index < characters.length - 1)
      cursorX += options.manifest.metrics.letterSpacing;
    return Object.freeze({
      character,
      path: glyph.path,
      x,
      y,
      width: glyph.size.width,
      height: glyph.size.height,
      advance,
      groupId: group?.id ?? null,
    });
  });
  return Object.freeze({
    text: options.text,
    glyphCount: characters.length,
    logicalBounds: Object.freeze({
      x: 0,
      y: 0,
      width: cursorX,
      height: options.manifest.metrics.lineHeight,
    }),
    visualBounds:
      occurrences.length === 0
        ? null
        : Object.freeze({
            x: visualLeft,
            y: visualTop,
            width: visualRight - visualLeft,
            height: visualBottom - visualTop,
          }),
    anchor,
    occurrences: Object.freeze(occurrences),
  });
}

export function validateImageStringAnchor(anchor: {
  readonly x: number;
  readonly y: number;
}): Readonly<{ x: number; y: number }> {
  if (
    !anchor ||
    !Number.isFinite(anchor.x) ||
    !Number.isFinite(anchor.y) ||
    anchor.x < 0 ||
    anchor.x > 1 ||
    anchor.y < 0 ||
    anchor.y > 1
  ) {
    throw new ImageStringError("image-string anchor x/y 必须是 0..1 有限数。");
  }
  return Object.freeze({ x: anchor.x, y: anchor.y });
}
