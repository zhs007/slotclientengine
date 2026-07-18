import { assertVNIProject } from "@slotclientengine/vnicore/core";
import {
  AtlasAttachmentLoader,
  SkeletonJson,
  TextureAtlas,
} from "@esotericsoftware/spine-pixi-v8";
import { SymbolAssetError } from "./errors.js";
import { readSupportedSpineSkeletonVersion } from "./spine-version.js";

export interface SymbolVniProjectMetadata {
  readonly schemaVersion: string;
  readonly durationSeconds: number;
  readonly stage: Readonly<{ width: number; height: number }>;
  readonly assetPaths: readonly string[];
}

export interface SymbolSpineSkeletonMetadata {
  readonly version: string;
  readonly animationNames: readonly string[];
  readonly slotNames: readonly string[];
}

export interface SymbolSpineAtlasMetadata {
  readonly pageNames: readonly string[];
}

export function inspectSymbolVniProject(
  value: unknown,
): SymbolVniProjectMetadata {
  const project = assertVNIProject(value);
  return Object.freeze({
    schemaVersion: project.schemaVersion,
    durationSeconds: project.stage.duration,
    stage: Object.freeze({
      width: project.stage.width,
      height: project.stage.height,
    }),
    assetPaths: Object.freeze(project.assets.map((asset) => asset.path)),
  });
}

export function inspectSymbolSpineSkeleton(
  value: unknown,
): SymbolSpineSkeletonMetadata {
  readSupportedSpineSkeletonVersion(value);
  const record = assertRecord(value, "Spine skeleton");
  const skeletonHeader = assertRecord(record.skeleton, "Spine skeleton header");
  if (typeof skeletonHeader.spine !== "string") {
    throw new SymbolAssetError("Spine skeleton header.spine must be a string.");
  }
  const animations = assertRecord(
    record.animations,
    "Spine skeleton animations",
  );
  if (!Array.isArray(record.slots)) {
    throw new SymbolAssetError("Spine skeleton slots must be an array.");
  }
  const slotNames = record.slots.map((slot, index) => {
    const slotRecord = assertRecord(slot, `Spine skeleton slots[${index}]`);
    if (typeof slotRecord.name !== "string" || slotRecord.name.length === 0) {
      throw new SymbolAssetError(
        `Spine skeleton slots[${index}].name must be a non-empty string.`,
      );
    }
    return slotRecord.name;
  });
  return Object.freeze({
    version: skeletonHeader.spine,
    animationNames: Object.freeze(Object.keys(animations)),
    slotNames: Object.freeze(slotNames),
  });
}

export function inspectSymbolSpineAtlas(
  atlasText: string,
): SymbolSpineAtlasMetadata {
  let atlas: TextureAtlas;
  try {
    atlas = new TextureAtlas(atlasText);
  } catch (error) {
    throw new SymbolAssetError(
      `Spine atlas failed to parse: ${formatError(error)}.`,
    );
  }
  const pageNames = atlas.pages.map((page) => page.name).filter(Boolean);
  if (pageNames.length !== atlas.pages.length || pageNames.length === 0) {
    throw new SymbolAssetError("Spine atlas must contain named pages.");
  }
  return Object.freeze({ pageNames: Object.freeze(pageNames) });
}

export function inspectSymbolSpineBundle(options: {
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly texturePath: string;
}): Readonly<{
  skeleton: SymbolSpineSkeletonMetadata;
  atlas: SymbolSpineAtlasMetadata;
}> {
  const skeleton = inspectSymbolSpineSkeleton(options.skeleton);
  const atlasMetadata = inspectSymbolSpineAtlas(options.atlasText);
  if (atlasMetadata.pageNames.length !== 1) {
    throw new SymbolAssetError(
      "Spine symbol schema currently supports exactly one atlas page.",
    );
  }
  const textureName = fileName(options.texturePath);
  if (atlasMetadata.pageNames[0] !== textureName) {
    throw new SymbolAssetError(
      `Spine atlas page "${atlasMetadata.pageNames[0]}" must match texture "${textureName}".`,
    );
  }
  try {
    const atlas = new TextureAtlas(options.atlasText);
    new SkeletonJson(new AtlasAttachmentLoader(atlas)).readSkeletonData(
      options.skeleton,
    );
  } catch (error) {
    throw new SymbolAssetError(
      `Spine skeleton/atlas combination failed to parse: ${formatError(error)}.`,
    );
  }
  return Object.freeze({ skeleton, atlas: atlasMetadata });
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new SymbolAssetError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function fileName(path: string): string {
  const value = path.replaceAll("\\", "/").split("/").at(-1);
  if (!value) throw new SymbolAssetError(`Invalid texture path: ${path}.`);
  return value;
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
