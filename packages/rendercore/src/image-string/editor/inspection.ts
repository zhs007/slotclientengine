import type { ImageStringManifestV1 } from "../data/types.js";
import { compileImageStringManifest } from "../core/compiled.js";
import {
  createImageStringLayoutBuffer,
  layoutCompiledImageString,
  snapshotImageStringLayout,
} from "../core/layout.js";
import { inspectRenderImageString } from "../core/render-image-string.js";
import type { ImageStringSnapshot, RenderImageString } from "../core/types.js";

export type {
  ImageStringOccurrenceSnapshot,
  ImageStringRect,
  ImageStringSnapshot,
} from "../core/types.js";

export function inspectImageStringRenderer(
  renderer: RenderImageString,
): ImageStringSnapshot {
  return inspectRenderImageString(renderer);
}

export function layoutImageString(options: {
  readonly manifest: ImageStringManifestV1;
  readonly text: string;
  readonly anchor?: { readonly x: number; readonly y: number };
}): ImageStringSnapshot {
  const output = createImageStringLayoutBuffer();
  layoutCompiledImageString({
    compiled: compileImageStringManifest(options.manifest),
    text: options.text,
    anchor: options.anchor ?? { x: 0.5, y: 0.5 },
    output,
  });
  return snapshotImageStringLayout(output);
}
