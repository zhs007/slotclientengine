import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";
import type { ImageStringManifestV1 } from "@slotclientengine/rendercore/image-string";
import type { EditorResourceProvenance } from "@slotclientengine/browserartifactio";

export interface EditorImageLayoutResource {
  readonly id: string;
  readonly kind: "image";
  readonly path: string;
  readonly size: { readonly width: number; readonly height: number };
  readonly provenance?: EditorResourceProvenance;
}

export interface EditorSpineLayoutResource {
  readonly id: string;
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly textures: Readonly<Record<string, string>>;
  readonly animationNames: readonly string[];
  readonly animationEvents: Readonly<
    Record<string, readonly EditorSpineAnimationEvent[]>
  >;
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly provenance?: EditorResourceProvenance;
}

export interface EditorSpineAnimationEvent {
  readonly name: string;
  readonly time: number;
}

export interface EditorImageStringLayoutResource {
  readonly id: string;
  readonly kind: "image-string";
  readonly manifestPath: string;
  readonly manifest: ImageStringManifestV1;
  readonly assetPaths: readonly string[];
  readonly provenance?: EditorResourceProvenance;
}

export interface EditorVideoLayoutResource {
  readonly id: string;
  readonly kind: "video";
  readonly path: string;
  readonly mimeType: "video/mp4";
  readonly size: { readonly width: number; readonly height: number };
  readonly durationSeconds: number;
  readonly hasAudio: boolean | "unknown";
  readonly provenance?: EditorResourceProvenance;
}

export type EditorLayoutResource =
  | EditorImageLayoutResource
  | EditorSpineLayoutResource
  | EditorImageStringLayoutResource
  | EditorVideoLayoutResource;

export interface EditorResourceReference {
  readonly nodeId: string;
  readonly role: "layer" | "background" | "scene-transition";
  readonly variants: readonly SceneLayoutVariantId[];
}

export function editorResourcePrimaryPath(
  resource: EditorLayoutResource,
): string {
  if (resource.kind === "image") return resource.path;
  if (resource.kind === "spine") return resource.skeleton;
  if (resource.kind === "video") return resource.path;
  return resource.manifestPath;
}

export function editorResourcePaths(
  resource: EditorLayoutResource,
): readonly string[] {
  if (resource.kind === "image") return [resource.path];
  if (resource.kind === "spine")
    return [
      resource.skeleton,
      resource.atlas,
      ...Object.values(resource.textures),
    ];
  if (resource.kind === "video") return [resource.path];
  return [resource.manifestPath, ...resource.assetPaths];
}

export function editorResourceArtSize(
  resource: EditorLayoutResource,
): { readonly width: number; readonly height: number } | undefined {
  // A Spine skeleton header describes exported content bounds. It does not
  // declare the scene's art-space canvas, so only raster images are intrinsic.
  return resource.kind === "image" ? resource.size : undefined;
}

export function editorResourceSignature(
  resource: EditorLayoutResource,
): string {
  if (resource.kind === "image") {
    return JSON.stringify({
      kind: resource.kind,
      path: resource.path,
      size: resource.size,
    });
  }
  if (resource.kind === "image-string") {
    return JSON.stringify({
      kind: resource.kind,
      manifestPath: resource.manifestPath,
      manifest: resource.manifest,
      assetPaths: resource.assetPaths,
    });
  }
  if (resource.kind === "video") {
    return JSON.stringify({
      kind: resource.kind,
      path: resource.path,
      mimeType: resource.mimeType,
      size: resource.size,
      durationSeconds: resource.durationSeconds,
      hasAudio: resource.hasAudio,
    });
  }
  return JSON.stringify({
    kind: resource.kind,
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: Object.fromEntries(
      Object.entries(resource.textures).sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    ),
  });
}

export function readEditorSpineMetadata(bytes: Uint8Array): {
  readonly animationNames: readonly string[];
  readonly animationEvents: Readonly<
    Record<string, readonly EditorSpineAnimationEvent[]>
  >;
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly version: string;
} {
  let skeleton: {
    readonly skeleton?: {
      readonly spine?: unknown;
      readonly width?: unknown;
      readonly height?: unknown;
    };
    readonly animations?: Readonly<Record<string, unknown>>;
  };
  try {
    skeleton = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as typeof skeleton;
  } catch (error) {
    throw new Error(
      `Spine skeleton JSON 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const version = skeleton.skeleton?.spine;
  if (typeof version !== "string" || version.length === 0)
    throw new Error("Spine skeleton 缺少版本。");
  const animations = skeleton.animations ?? {};
  const animationEvents: Record<string, readonly EditorSpineAnimationEvent[]> =
    {};
  for (const [animationName, rawAnimation] of Object.entries(animations)) {
    const animation = isRecord(rawAnimation) ? rawAnimation : {};
    const rawEvents = Array.isArray(animation.events) ? animation.events : [];
    animationEvents[animationName] = Object.freeze(
      rawEvents.map((raw, index) => {
        if (!isRecord(raw) || typeof raw.name !== "string" || !raw.name)
          throw new Error(
            `Spine animation ${animationName} event[${index}] 缺少名称。`,
          );
        const time = raw.time === undefined ? 0 : raw.time;
        if (typeof time !== "number" || !Number.isFinite(time) || time < 0)
          throw new Error(
            `Spine animation ${animationName} event[${index}] time 无效。`,
          );
        return Object.freeze({ name: raw.name, time });
      }),
    );
  }
  const width = skeleton.skeleton?.width;
  const height = skeleton.skeleton?.height;
  const hasBounds =
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0;
  return Object.freeze({
    animationNames: Object.freeze(Object.keys(animations)),
    animationEvents: Object.freeze(animationEvents),
    ...(hasBounds ? { bounds: Object.freeze({ width, height }) } : {}),
    version,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
