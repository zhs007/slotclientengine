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
  readonly bounds?: { readonly width: number; readonly height: number };
  readonly provenance?: EditorResourceProvenance;
}

export interface EditorImageStringLayoutResource {
  readonly id: string;
  readonly kind: "image-string";
  readonly manifestPath: string;
  readonly manifest: ImageStringManifestV1;
  readonly assetPaths: readonly string[];
  readonly provenance?: EditorResourceProvenance;
}

export type EditorLayoutResource =
  | EditorImageLayoutResource
  | EditorSpineLayoutResource
  | EditorImageStringLayoutResource;

export interface EditorResourceReference {
  readonly nodeId: string;
  readonly role: "layer" | "background";
  readonly variants: readonly SceneLayoutVariantId[];
}

export function editorResourcePrimaryPath(
  resource: EditorLayoutResource,
): string {
  if (resource.kind === "image") return resource.path;
  if (resource.kind === "spine") return resource.skeleton;
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
  return [resource.manifestPath, ...resource.assetPaths];
}

export function editorResourceSize(
  resource: EditorLayoutResource,
): { readonly width: number; readonly height: number } | undefined {
  return resource.kind === "image"
    ? resource.size
    : resource.kind === "spine"
      ? resource.bounds
      : undefined;
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
