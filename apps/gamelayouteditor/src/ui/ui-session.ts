import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";
import {
  activeVariantIds,
  type EditorProject,
} from "../model/editor-project.js";

export type WorkspaceTab =
  | "assets"
  | "layout"
  | "transitions"
  | "symbols"
  | "bigwin"
  | "project";

export type LayoutSelection =
  | { readonly kind: "background"; readonly variant: SceneLayoutVariantId }
  | { readonly kind: "reel"; readonly reelId: "main" }
  | { readonly kind: "layer"; readonly nodeId: string };

export type LayoutResourceBindingContext =
  | { readonly kind: "add-layer" }
  | {
      readonly kind: "assign-background";
      readonly modeId: string;
      readonly variant: SceneLayoutVariantId;
    }
  | { readonly kind: "rebind-layer"; readonly nodeId: string };

export interface ResourcePickerState {
  context: LayoutResourceBindingContext;
  query: string;
  type: "all" | "image" | "spine" | "image-string";
  selectedResourceId: string;
  nodeId: string;
  variants: SceneLayoutVariantId[];
  defaultAnimation: string;
}

export interface EditorUiSession {
  activeTab: WorkspaceTab;
  selection: LayoutSelection | null;
  resourceQuery: string;
  resourceType: "all" | "image" | "spine" | "image-string" | "video";
  resourceStatus: "all" | "referenced" | "unused" | "error";
  expandedResourceIds: Set<string>;
  expandedInspectorSections: Set<string>;
  selectedTransitionKey: string | null;
  picker: ResourcePickerState | null;
}

export function createEditorUiSession(): EditorUiSession {
  return {
    activeTab: "assets",
    selection: null,
    resourceQuery: "",
    resourceType: "all",
    resourceStatus: "all",
    expandedResourceIds: new Set(),
    expandedInspectorSections: new Set(),
    selectedTransitionKey: null,
    picker: null,
  };
}

export function defaultLayoutSelection(
  project: EditorProject,
): LayoutSelection {
  for (const variant of activeVariantIds(project)) {
    if (project.variants[variant].backgroundNode) {
      return { kind: "background", variant };
    }
  }
  return { kind: "reel", reelId: "main" };
}

export function normalizeLayoutSelection(
  project: EditorProject,
  selection: LayoutSelection | null,
): LayoutSelection {
  if (!selection) return defaultLayoutSelection(project);
  if (selection.kind === "reel") return selection;
  if (selection.kind === "background") {
    return activeVariantIds(project).includes(selection.variant)
      ? selection
      : defaultLayoutSelection(project);
  }
  const node = project.nodes.find((item) => item.id === selection.nodeId);
  const background = project.gameModes.modes.some((mode) =>
    Object.values(mode.backgroundNodes).includes(selection.nodeId),
  );
  return node && !background ? selection : defaultLayoutSelection(project);
}

export function selectionKey(selection: LayoutSelection): string {
  if (selection.kind === "background") return `background:${selection.variant}`;
  if (selection.kind === "layer") return `layer:${selection.nodeId}`;
  return "reel:main";
}
