import type { SymbolEditorProject } from "../model/editor-project.js";
import type { ResourceBindingContext } from "./resource-picker.js";

export type WorkspaceTab = "assets" | "symbols" | "project";
export type SymbolInspectorTab =
  | "basic"
  | "states"
  | "image-string"
  | "value"
  | "cascade";
export type AssetStatusFilter = "all" | "referenced" | "unused" | "error";
export type AssetKindFilter = "all" | "image" | "spine" | "vni" | "other";
export type AssetGroupMode = "batch" | "kind";
export type SymbolStatusFilter = "all" | "included" | "incomplete" | "error";

export interface AssetPickerState {
  readonly context: ResourceBindingContext;
  readonly currentPath?: string;
  query: string;
  selectedPath?: string;
}

export class SymbolsEditorUiSession {
  workspace: WorkspaceTab = "assets";
  inspector: SymbolInspectorTab = "basic";
  selectedSymbol = "";
  selectedState = "normal";
  previewState = "normal";
  assetQuery = "";
  assetKind: AssetKindFilter = "all";
  assetStatus: AssetStatusFilter = "all";
  assetGroup: AssetGroupMode = "batch";
  symbolQuery = "";
  symbolStatus: SymbolStatusFilter = "all";
  expandedAssets = new Set<string>();
  expandedTier = 0;
  addStateOpen = false;
  picker: AssetPickerState | null = null;
  transientMessage = "";
  imageStringPreviewTexts = new Map<string, string>();

  resetForNewProject(project: SymbolEditorProject): void {
    this.resetProjectState(project);
    this.workspace = "assets";
  }

  resetForImport(project: SymbolEditorProject): void {
    this.resetProjectState(project);
    this.workspace = "symbols";
  }

  normalize(project: SymbolEditorProject): void {
    const symbols = [...project.symbols.values()].sort(
      (left, right) => left.code - right.code,
    );
    if (!this.selectedSymbol || !project.symbols.has(this.selectedSymbol)) {
      this.selectedSymbol =
        symbols.find((symbol) => symbol.included)?.symbol ??
        symbols[0]?.symbol ??
        "";
    }
    const symbol = project.symbols.get(this.selectedSymbol);
    if (!symbol?.states.has(this.selectedState)) this.selectedState = "normal";
    if (
      !project.stateDefinitions.some(
        (definition) => definition.id === this.previewState,
      )
    ) {
      this.previewState = "normal";
    }
    this.expandedAssets = new Set(
      [...this.expandedAssets].filter((path) =>
        project.assetLibrary.records.has(path),
      ),
    );
    if (symbol?.valuePresentation) {
      this.expandedTier = Math.min(
        this.expandedTier,
        symbol.valuePresentation.tiers.length - 1,
      );
    } else {
      this.expandedTier = 0;
    }
    if (this.picker && !isBindingTargetAvailable(project, this.picker.context))
      this.picker = null;
  }

  private resetProjectState(project: SymbolEditorProject): void {
    this.inspector = "basic";
    this.selectedSymbol = "";
    this.selectedState = "normal";
    this.previewState = "normal";
    this.assetQuery = "";
    this.assetKind = "all";
    this.assetStatus = "all";
    this.assetGroup = "batch";
    this.symbolQuery = "";
    this.symbolStatus = "all";
    this.expandedAssets.clear();
    this.expandedTier = 0;
    this.addStateOpen = false;
    this.picker = null;
    this.transientMessage = "";
    this.imageStringPreviewTexts.clear();
    this.normalize(project);
  }
}

function isBindingTargetAvailable(
  project: SymbolEditorProject,
  context: ResourceBindingContext,
): boolean {
  const symbol = project.symbols.get(context.symbol);
  if (!symbol) return false;
  if (context.kind === "value-tier-resource")
    return context.tierIndex < (symbol.valuePresentation?.tiers.length ?? 0);
  return symbol.states.has(context.state);
}
