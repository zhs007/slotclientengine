import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout/data";
import type { EditorProject } from "../model/editor-project.js";
import type { SymbolOtherScenePreviewBinding } from "../preview/other-scene-preview.js";

export type WorkspaceTab =
  "assets" | "layout" | "transitions" | "symbols" | "bigwin" | "project";

export type LayoutSelection =
  | { readonly kind: "reel"; readonly reelId: "main" }
  | { readonly kind: "layer"; readonly nodeId: string };

export type LayoutResourceBindingContext =
  | { readonly kind: "add-layer" }
  | { readonly kind: "add-radio" }
  | { readonly kind: "add-step-slider" }
  | { readonly kind: "rebind-layer"; readonly nodeId: string }
  | {
      readonly kind: "rebind-radio";
      readonly nodeId: string;
      readonly state: "off" | "on";
    }
  | {
      readonly kind: "rebind-step-slider";
      readonly nodeId: string;
      readonly role: "track" | "thumb";
    };

export interface ResourcePickerState {
  context: LayoutResourceBindingContext;
  query: string;
  type: "all" | "image" | "spine" | "vni" | "image-string";
  selectedResourceId: string;
  secondaryResourceId: string;
  nodeId: string;
  variants: SceneLayoutVariantId[];
  defaultAnimation: string;
  steps: number;
  snapDurationSeconds: number;
}

export interface EditorUiSession {
  activeTab: WorkspaceTab;
  selection: LayoutSelection | null;
  resourceQuery: string;
  resourceType:
    | "all"
    | "image"
    | "spine"
    | "vni"
    | "image-string"
    | "json"
    | "video"
    | "audio";
  resourceStatus: "all" | "referenced" | "runtime" | "unused" | "error";
  expandedResourceIds: Set<string>;
  expandedInspectorSections: Set<string>;
  selectedTransitionKey: string | null;
  newTransitionFromModeId: string;
  newTransitionToModeId: string;
  previewTransition: PreviewTransitionUiState;
  otherSceneDrafts: Map<string, OtherSceneBindingDraft>;
  popupPlacementDrafts: Map<string, string>;
  picker: ResourcePickerState | null;
}

export interface OtherSceneBindingDraft {
  enabled: boolean;
  target: SymbolOtherScenePreviewBinding["target"];
  sourceKind: SymbolOtherScenePreviewBinding["source"]["kind"];
  tableName: string;
  fixedNumber: string;
}

export type PreviewTransitionKind = "none" | "spine" | "video";

export type PreviewTransitionUiState =
  | { readonly phase: "idle"; readonly message: string }
  | {
      readonly phase: "preparing" | "ready" | "starting";
      readonly from: string;
      readonly to: string;
      readonly kind: PreviewTransitionKind;
    }
  | {
      readonly phase: "transitioning";
      readonly from: string;
      readonly to: string;
      readonly kind: PreviewTransitionKind;
      readonly boundary:
        "popup" | "awaiting-video-start" | "before-switch" | "after-switch";
    }
  | { readonly phase: "complete"; readonly stableMode: string }
  | { readonly phase: "error"; readonly message: string };

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
    newTransitionFromModeId: "",
    newTransitionToModeId: "",
    previewTransition: { phase: "idle", message: "请选择预览目标状态。" },
    otherSceneDrafts: new Map(),
    popupPlacementDrafts: new Map(),
    picker: null,
  };
}

export function defaultLayoutSelection(
  _project: EditorProject,
): LayoutSelection {
  return { kind: "reel", reelId: "main" };
}

export function normalizeLayoutSelection(
  project: EditorProject,
  selection: LayoutSelection | null,
): LayoutSelection {
  if (!selection) return defaultLayoutSelection(project);
  if (selection.kind === "reel") return selection;
  const node = project.nodes.find((item) => item.id === selection.nodeId);
  return node ? selection : defaultLayoutSelection(project);
}

export function selectionKey(selection: LayoutSelection): string {
  if (selection.kind === "layer") return `layer:${selection.nodeId}`;
  return "reel:main";
}
