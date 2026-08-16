import { ImageStringError } from "../data/errors.js";
import { assertImageStringText } from "../data/manifest.js";
import type { CompiledImageStringManifest } from "./compiled.js";
import type { ImageStringSnapshot } from "./types.js";

interface MutableOccurrence {
  character: string;
  path: string;
  x: number;
  y: number;
  width: number;
  height: number;
  advance: number;
  groupId: string | null;
}

export interface ImageStringLayoutBuffer {
  text: string;
  glyphCount: number;
  logicalWidth: number;
  logicalHeight: number;
  visualLeft: number;
  visualTop: number;
  visualWidth: number;
  visualHeight: number;
  anchorX: number;
  anchorY: number;
  readonly occurrences: MutableOccurrence[];
}

export function createImageStringLayoutBuffer(): ImageStringLayoutBuffer {
  return {
    text: "",
    glyphCount: 0,
    logicalWidth: 0,
    logicalHeight: 0,
    visualLeft: 0,
    visualTop: 0,
    visualWidth: 0,
    visualHeight: 0,
    anchorX: 0.5,
    anchorY: 0.5,
    occurrences: [],
  };
}

export function layoutCompiledImageString(options: {
  readonly compiled: CompiledImageStringManifest;
  readonly text: string;
  readonly anchor: { readonly x: number; readonly y: number };
  readonly output: ImageStringLayoutBuffer;
}): void {
  const anchor = validateImageStringAnchor(options.anchor);
  assertImageStringText(options.text);
  const output = options.output;
  let cursorX = 0;
  let visualLeft = Number.POSITIVE_INFINITY;
  let visualTop = Number.POSITIVE_INFINITY;
  let visualRight = Number.NEGATIVE_INFINITY;
  let visualBottom = Number.NEGATIVE_INFINITY;
  let index = 0;
  for (const character of options.text) {
    const glyph = options.compiled.glyphs.get(character);
    if (!glyph)
      throw new ImageStringError(
        `image-string text 缺少 glyph ${JSON.stringify(character)}。`,
      );
    if (index > 0) cursorX += options.compiled.manifest.metrics.letterSpacing;
    const x = cursorX + glyph.alignOffset + glyph.offsetX;
    const y = glyph.offsetY;
    visualLeft = Math.min(visualLeft, x);
    visualTop = Math.min(visualTop, y);
    visualRight = Math.max(visualRight, x + glyph.width);
    visualBottom = Math.max(visualBottom, y + glyph.height);
    let occurrence = output.occurrences[index];
    if (!occurrence) {
      occurrence = {
        character: "",
        path: "",
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        advance: 0,
        groupId: null,
      };
      output.occurrences.push(occurrence);
    }
    occurrence.character = character;
    occurrence.path = glyph.path;
    occurrence.x = x;
    occurrence.y = y;
    occurrence.width = glyph.width;
    occurrence.height = glyph.height;
    occurrence.advance = glyph.advance;
    occurrence.groupId = glyph.groupId;
    cursorX += glyph.advance;
    index += 1;
  }
  output.text = options.text;
  output.glyphCount = index;
  output.logicalWidth = cursorX;
  output.logicalHeight = options.compiled.manifest.metrics.lineHeight;
  output.visualLeft = index === 0 ? 0 : visualLeft;
  output.visualTop = index === 0 ? 0 : visualTop;
  output.visualWidth = index === 0 ? 0 : visualRight - visualLeft;
  output.visualHeight = index === 0 ? 0 : visualBottom - visualTop;
  output.anchorX = anchor.x;
  output.anchorY = anchor.y;
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
  )
    throw new ImageStringError("image-string anchor x/y 必须是 0..1 有限数。");
  return anchor;
}

export function snapshotImageStringLayout(
  layout: ImageStringLayoutBuffer,
): ImageStringSnapshot {
  return Object.freeze({
    text: layout.text,
    glyphCount: layout.glyphCount,
    logicalBounds: Object.freeze({
      x: 0,
      y: 0,
      width: layout.logicalWidth,
      height: layout.logicalHeight,
    }),
    visualBounds:
      layout.glyphCount === 0
        ? null
        : Object.freeze({
            x: layout.visualLeft,
            y: layout.visualTop,
            width: layout.visualWidth,
            height: layout.visualHeight,
          }),
    anchor: Object.freeze({ x: layout.anchorX, y: layout.anchorY }),
    occurrences: Object.freeze(
      layout.occurrences
        .slice(0, layout.glyphCount)
        .map((occurrence) => Object.freeze({ ...occurrence })),
    ),
  });
}

export function snapshotImageStringGeometry(
  layout: ImageStringLayoutBuffer,
): Readonly<{
  logicalBounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }>;
  visualBounds: Readonly<{
    x: number;
    y: number;
    width: number;
    height: number;
  }> | null;
  anchor: Readonly<{ x: number; y: number }>;
}> {
  return Object.freeze({
    logicalBounds: Object.freeze({
      x: 0,
      y: 0,
      width: layout.logicalWidth,
      height: layout.logicalHeight,
    }),
    visualBounds:
      layout.glyphCount === 0
        ? null
        : Object.freeze({
            x: layout.visualLeft,
            y: layout.visualTop,
            width: layout.visualWidth,
            height: layout.visualHeight,
          }),
    anchor: Object.freeze({ x: layout.anchorX, y: layout.anchorY }),
  });
}
