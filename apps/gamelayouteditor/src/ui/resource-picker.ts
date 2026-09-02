import {
  ordinaryLayerVariantIds,
  type EditorProject,
} from "../model/editor-project.js";
import {
  editorResourcePrimaryPath,
  type EditorLayoutResource,
  type EditorAudioLayoutResource,
  type EditorJsonLayoutResource,
  type EditorVideoLayoutResource,
} from "../model/editor-resource.js";
import { getLayoutResourceReferences } from "../model/resource-commands.js";
import type {
  LayoutResourceBindingContext,
  ResourcePickerState,
} from "./ui-session.js";

export interface LayoutResourcePickerCandidate {
  readonly resourceId: string;
  readonly kind: "image" | "spine" | "vni" | "image-string";
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
  const state: ResourcePickerState = {
    context,
    query: "",
    type:
      context.kind === "add-radio" || context.kind === "rebind-radio"
        ? "image"
        : "all",
    selectedResourceId,
    secondaryResourceId: "",
    nodeId:
      context.kind === "rebind-layer" || context.kind === "rebind-radio"
        ? context.nodeId
        : selectedResourceId,
    variants: [...ordinaryLayerVariantIds],
    defaultAnimation: "",
  };
  state.defaultAnimation = preferredResourcePickerAnimation(
    project,
    state,
    selectedResourceId,
  );
  return state;
}

export function preferredResourcePickerAnimation(
  project: EditorProject,
  state: Pick<ResourcePickerState, "context">,
  resourceId: string,
): string {
  const resource = project.resources.get(resourceId);
  if (resource?.kind !== "spine") return "";
  let nodeId: string | undefined;
  if (state.context.kind === "rebind-layer") nodeId = state.context.nodeId;
  const node = nodeId
    ? project.nodes.find((candidate) => candidate.id === nodeId)
    : undefined;
  const animation =
    node?.playback?.kind === "loop" ? node.playback.animation : "";
  return resource.animationNames.includes(animation) ? animation : "";
}

export function getResourcePickerCandidates(
  project: EditorProject,
  state: Pick<ResourcePickerState, "context" | "query" | "type">,
): readonly LayoutResourcePickerCandidate[] {
  const query = state.query.trim().toLowerCase();
  return [...project.resources.values()]
    .filter(
      (
        resource,
      ): resource is Exclude<
        EditorLayoutResource,
        | EditorVideoLayoutResource
        | EditorAudioLayoutResource
        | EditorJsonLayoutResource
      > =>
        resource.kind !== "video" &&
        resource.kind !== "audio" &&
        resource.kind !== "json",
    )
    .filter((resource) =>
      state.context.kind === "add-radio" ||
      state.context.kind === "rebind-radio"
        ? resource.kind === "image"
        : true,
    )
    .filter((resource) => state.type === "all" || resource.kind === state.type)
    .filter((resource) => {
      if (!query) return true;
      return (
        resource.id.toLowerCase().includes(query) ||
        editorResourcePrimaryPath(resource).toLowerCase().includes(query)
      );
    })
    .map((resource) => candidateFromResource(project, resource))
    .sort((left, right) =>
      left.resourceId.localeCompare(right.resourceId, "en"),
    );
}

function candidateFromResource(
  project: EditorProject,
  resource: Exclude<
    EditorLayoutResource,
    | EditorVideoLayoutResource
    | EditorAudioLayoutResource
    | EditorJsonLayoutResource
  >,
): LayoutResourcePickerCandidate {
  const referenceCount = getLayoutResourceReferences(
    project,
    resource.id,
  ).length;
  const summary =
    resource.kind === "image"
      ? `${resource.size.width}×${resource.size.height}`
      : resource.kind === "spine"
        ? `${resource.animationNames.length} animations${resource.bounds ? ` · export bounds ${resource.bounds.width}×${resource.bounds.height}` : " · 无 export bounds"}`
        : resource.kind === "vni"
          ? `${resource.project.stage.width}×${resource.project.stage.height} · ${resource.project.stage.duration}s · ${resource.assetPaths.length} assets`
          : `${Object.keys(resource.manifest.glyphs).length} glyphs · lineHeight ${resource.manifest.metrics.lineHeight}`;
  return Object.freeze({
    resourceId: resource.id,
    kind: resource.kind,
    primaryPath: editorResourcePrimaryPath(resource),
    status: "ready",
    referenceCount,
    summary,
  });
}
