import {
  activeVariantIds,
  type EditorProject,
} from "../model/editor-project.js";
import {
  editorResourcePrimaryPath,
  type EditorLayoutResource,
} from "../model/editor-resource.js";
import { getLayoutResourceReferences } from "../model/resource-commands.js";
import type {
  LayoutResourceBindingContext,
  ResourcePickerState,
} from "./ui-session.js";

export interface LayoutResourcePickerCandidate {
  readonly resourceId: string;
  readonly kind: "image" | "spine";
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
      context.kind === "rebind-layer" ? context.nodeId : selectedResourceId,
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
  resource: EditorLayoutResource,
  context: LayoutResourceBindingContext,
): LayoutResourcePickerCandidate {
  const referenceCount = getLayoutResourceReferences(
    project,
    resource.id,
  ).length;
  const missingBounds = resource.kind === "spine" && !resource.bounds;
  const incomplete = context.kind === "assign-background" && missingBounds;
  const summary =
    resource.kind === "image"
      ? `${resource.size.width}×${resource.size.height}`
      : `${resource.animationNames.length} animations${resource.bounds ? ` · ${resource.bounds.width}×${resource.bounds.height}` : " · 无 bounds，背景需手填 art size"}`;
  return Object.freeze({
    resourceId: resource.id,
    kind: resource.kind,
    primaryPath: editorResourcePrimaryPath(resource),
    status: incomplete ? "incomplete" : "ready",
    referenceCount,
    summary,
  });
}
