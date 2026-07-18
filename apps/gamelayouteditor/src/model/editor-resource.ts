import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";

export interface EditorImageLayoutResource {
  readonly id: string;
  readonly kind: "image";
  readonly path: string;
  readonly size: { readonly width: number; readonly height: number };
}

export interface EditorSpineLayoutResource {
  readonly id: string;
  readonly kind: "spine";
  readonly skeleton: string;
  readonly atlas: string;
  readonly textures: Readonly<Record<string, string>>;
  readonly animationNames: readonly string[];
  readonly bounds?: { readonly width: number; readonly height: number };
}

export type EditorLayoutResource =
  | EditorImageLayoutResource
  | EditorSpineLayoutResource;

export interface EditorResourceReference {
  readonly nodeId: string;
  readonly role: "layer" | "background";
  readonly variants: readonly SceneLayoutVariantId[];
}

export function editorResourcePrimaryPath(
  resource: EditorLayoutResource,
): string {
  return resource.kind === "image" ? resource.path : resource.skeleton;
}

export function editorResourcePaths(
  resource: EditorLayoutResource,
): readonly string[] {
  return resource.kind === "image"
    ? [resource.path]
    : [resource.skeleton, resource.atlas, ...Object.values(resource.textures)];
}

export function editorResourceSize(
  resource: EditorLayoutResource,
): { readonly width: number; readonly height: number } | undefined {
  return resource.kind === "image" ? resource.size : resource.bounds;
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
