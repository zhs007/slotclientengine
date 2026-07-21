import {
  activeVariantIds,
  type EditorProject,
} from "../model/editor-project.js";
import {
  editorResourcePrimaryPath,
  type EditorLayoutResource,
  type EditorVideoLayoutResource,
} from "../model/editor-resource.js";
import { getLayoutResourceReferences } from "../model/resource-commands.js";
import type {
  LayoutResourceBindingContext,
  ResourcePickerState,
} from "./ui-session.js";

export interface LayoutResourcePickerCandidate {
  readonly resourceId: string;
  readonly kind: "image" | "spine" | "image-string";
  readonly primaryPath: string;
  readonly status: "ready" | "incomplete" | "error";
  readonly referenceCount: number;
  readonly summary: string;
  readonly disabledReason?: string;
}

export function createResourcePickerState(
  project: EditorProject,
  context: LayoutResourceBindingContext,
  preferredResourceId = "",
): ResourcePickerState {
  const selectedResourceId = project.resources.has(preferredResourceId)
    ? preferredResourceId
    : "";
  return {
    context,
    query: "",
    type: "all",
    selectedResourceId,
    nodeId:
      context.kind === "rebind-layer"
        ? context.nodeId
        : context.kind === "add-layer"
          ? selectedResourceId
          : "",
    variants:
      context.kind === "assign-background"
        ? [context.variant]
        : [...activeVariantIds(project)],
    defaultAnimation: "",
  };
}

export function getResourcePickerCandidates(
  project: EditorProject,
  state: Pick<ResourcePickerState, "context" | "query" | "type">,
): readonly LayoutResourcePickerCandidate[] {
  const query = state.query.trim().toLowerCase();
  return [...project.resources.values()]
    .filter((resource) => resource.kind !== "video")
    .filter((resource) => state.type === "all" || resource.kind === state.type)
    .filter((resource) => {
      if (!query) return true;
      return (
        resource.id.toLowerCase().includes(query) ||
        editorResourcePrimaryPath(resource).toLowerCase().includes(query)
      );
    })
    .map((resource) => candidateFromResource(project, resource, state.context))
    .sort((left, right) =>
      left.resourceId.localeCompare(right.resourceId, "en"),
    );
}

function candidateFromResource(
  project: EditorProject,
  resource: Exclude<EditorLayoutResource, EditorVideoLayoutResource>,
  context: LayoutResourceBindingContext,
): LayoutResourcePickerCandidate {
  const referenceCount = getLayoutResourceReferences(
    project,
    resource.id,
  ).length;
  const forbidden =
    context.kind === "assign-background" && resource.kind === "image-string";
  const needsArtSize =
    context.kind === "assign-background" &&
    resource.kind === "spine" &&
    (project.variants[context.variant].artSize.width <= 0 ||
      project.variants[context.variant].artSize.height <= 0);
  const summary =
    resource.kind === "image"
      ? `${resource.size.width}×${resource.size.height}`
      : resource.kind === "spine"
        ? `${resource.animationNames.length} animations${resource.bounds ? ` · export bounds ${resource.bounds.width}×${resource.bounds.height}（非 art size）` : " · 无 export bounds"}${needsArtSize ? " · 背景需手填 art size" : ""}`
        : `${Object.keys(resource.manifest.glyphs).length} glyphs · lineHeight ${resource.manifest.metrics.lineHeight}`;
  return Object.freeze({
    resourceId: resource.id,
    kind: resource.kind,
    primaryPath: editorResourcePrimaryPath(resource),
    status: needsArtSize ? "incomplete" : "ready",
    referenceCount,
    summary,
    ...(forbidden ? { disabledReason: "image-string 不能设为背景" } : {}),
  });
}
