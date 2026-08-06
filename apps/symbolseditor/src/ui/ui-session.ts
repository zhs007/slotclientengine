import type {
  EditorSymbolDraft,
  SymbolEditorProject,
} from "../model/editor-project.js";
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
  tierPreviewValues = new Map<string, number>();
  activePreviewTiers = new Map<string, number>();

  getTierPreviewValue(
    project: SymbolEditorProject,
    symbolName: string,
    tierIndex: number,
  ): number {
    const symbol = project.symbols.get(symbolName);
    const presentation = symbol?.valuePresentation;
    const tier = presentation?.tiers[tierIndex];
    if (!presentation || !tier)
      throw new Error(
        `Symbol ${symbolName} 的预览档位 ${tierIndex + 1} 不存在。`,
      );
    const key = tierPreviewKey(symbolName, tierIndex);
    const current = this.tierPreviewValues.get(key);
    if (
      current !== undefined &&
      isTierPreviewValueValid(presentation, tierIndex, current)
    )
      return current;
    const derived = deriveTierPreviewValue(presentation, tierIndex);
    this.tierPreviewValues.set(key, derived);
    return derived;
  }

  setTierPreviewValue(
    project: SymbolEditorProject,
    symbolName: string,
    tierIndex: number,
    value: number,
  ): void {
    const presentation = project.symbols.get(symbolName)?.valuePresentation;
    if (!presentation?.tiers[tierIndex])
      throw new Error(
        `Symbol ${symbolName} 的预览档位 ${tierIndex + 1} 不存在。`,
      );
    if (!isTierPreviewValueValid(presentation, tierIndex, value)) {
      throw new Error(
        `预览数值必须是 Tier ${tierIndex + 1} 区间 ${formatTierPreviewRange(presentation, tierIndex)} 内的 positive safe integer。`,
      );
    }
    this.tierPreviewValues.set(tierPreviewKey(symbolName, tierIndex), value);
    this.activePreviewTiers.set(symbolName, tierIndex);
  }

  getActivePreviewTier(
    project: SymbolEditorProject,
    symbolName: string,
  ): number {
    const presentation = project.symbols.get(symbolName)?.valuePresentation;
    if (!presentation) throw new Error(`Symbol ${symbolName} 没有档位配置。`);
    const current = this.activePreviewTiers.get(symbolName);
    if (current !== undefined && presentation.tiers[current]) return current;
    const defaultValue = presentation.defaultValues[0]!;
    const derived = presentation.tiers.findIndex((_tier, index) =>
      isTierPreviewValueValid(presentation, index, defaultValue),
    );
    const tierIndex = derived < 0 ? 0 : derived;
    this.activePreviewTiers.set(symbolName, tierIndex);
    return tierIndex;
  }

  getPreviewValue(project: SymbolEditorProject, symbolName: string): number {
    return this.getTierPreviewValue(
      project,
      symbolName,
      this.getActivePreviewTier(project, symbolName),
    );
  }

  moveTierPreview(symbolName: string, index: number, direction: number): void {
    const next = index + direction;
    if (index < 0 || next < 0) return;
    const currentKey = tierPreviewKey(symbolName, index);
    const nextKey = tierPreviewKey(symbolName, next);
    const current = this.tierPreviewValues.get(currentKey);
    const nextValue = this.tierPreviewValues.get(nextKey);
    if (nextValue === undefined) this.tierPreviewValues.delete(currentKey);
    else this.tierPreviewValues.set(currentKey, nextValue);
    if (current === undefined) this.tierPreviewValues.delete(nextKey);
    else this.tierPreviewValues.set(nextKey, current);
    const active = this.activePreviewTiers.get(symbolName);
    if (active === index) this.activePreviewTiers.set(symbolName, next);
    else if (active === next) this.activePreviewTiers.set(symbolName, index);
  }

  removeTierPreview(
    symbolName: string,
    index: number,
    previousTierCount: number,
  ): void {
    for (
      let tierIndex = index;
      tierIndex < previousTierCount - 1;
      tierIndex += 1
    ) {
      const next = this.tierPreviewValues.get(
        tierPreviewKey(symbolName, tierIndex + 1),
      );
      const key = tierPreviewKey(symbolName, tierIndex);
      if (next === undefined) this.tierPreviewValues.delete(key);
      else this.tierPreviewValues.set(key, next);
    }
    this.tierPreviewValues.delete(
      tierPreviewKey(symbolName, previousTierCount - 1),
    );
    const active = this.activePreviewTiers.get(symbolName);
    if (active === undefined) return;
    if (active > index) this.activePreviewTiers.set(symbolName, active - 1);
    else if (active === index)
      this.activePreviewTiers.set(
        symbolName,
        Math.max(0, Math.min(index, previousTierCount - 2)),
      );
  }

  clearTierPreview(symbolName: string): void {
    this.activePreviewTiers.delete(symbolName);
    const prefix = `${symbolName}\u0000`;
    for (const key of this.tierPreviewValues.keys())
      if (key.startsWith(prefix)) this.tierPreviewValues.delete(key);
  }

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
    this.normalizeTierPreviews(project);
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
    this.tierPreviewValues.clear();
    this.activePreviewTiers.clear();
    this.normalize(project);
  }

  private normalizeTierPreviews(project: SymbolEditorProject): void {
    const validKeys = new Set<string>();
    const valueSymbols = new Set<string>();
    for (const symbol of project.symbols.values()) {
      const presentation = symbol.valuePresentation;
      if (!presentation) continue;
      valueSymbols.add(symbol.symbol);
      for (let index = 0; index < presentation.tiers.length; index += 1) {
        const key = tierPreviewKey(symbol.symbol, index);
        validKeys.add(key);
        const current = this.tierPreviewValues.get(key);
        if (
          current !== undefined &&
          !isTierPreviewValueValid(presentation, index, current)
        ) {
          this.tierPreviewValues.delete(key);
        }
      }
      const active = this.activePreviewTiers.get(symbol.symbol);
      if (active !== undefined && !presentation.tiers[active])
        this.activePreviewTiers.delete(symbol.symbol);
    }
    for (const key of this.tierPreviewValues.keys())
      if (!validKeys.has(key)) this.tierPreviewValues.delete(key);
    for (const symbolName of this.activePreviewTiers.keys())
      if (!valueSymbols.has(symbolName))
        this.activePreviewTiers.delete(symbolName);
  }
}

function tierPreviewKey(symbolName: string, tierIndex: number): string {
  return `${symbolName}\u0000${tierIndex}`;
}

function isTierPreviewValueValid(
  presentation: NonNullable<EditorSymbolDraft["valuePresentation"]>,
  tierIndex: number,
  value: number,
): boolean {
  if (!Number.isSafeInteger(value) || value <= 0) return false;
  const lower =
    tierIndex === 0 ? 1 : presentation.tiers[tierIndex - 1]!.maxExclusive!;
  const upper = presentation.tiers[tierIndex]?.maxExclusive;
  return value >= lower && (upper === undefined || value < upper);
}

function deriveTierPreviewValue(
  presentation: NonNullable<EditorSymbolDraft["valuePresentation"]>,
  tierIndex: number,
): number {
  return (
    presentation.defaultValues.find((value) =>
      isTierPreviewValueValid(presentation, tierIndex, value),
    ) ??
    (tierIndex === 0 ? 1 : presentation.tiers[tierIndex - 1]!.maxExclusive!)
  );
}

function formatTierPreviewRange(
  presentation: NonNullable<EditorSymbolDraft["valuePresentation"]>,
  tierIndex: number,
): string {
  const lower =
    tierIndex === 0 ? 1 : presentation.tiers[tierIndex - 1]!.maxExclusive!;
  const upper = presentation.tiers[tierIndex]?.maxExclusive;
  return upper === undefined ? `[${lower}, +∞)` : `[${lower}, ${upper})`;
}

function isBindingTargetAvailable(
  project: SymbolEditorProject,
  context: ResourceBindingContext,
): boolean {
  const symbol = project.symbols.get(context.symbol);
  if (!symbol) return false;
  if (context.kind === "image-string-special-image")
    return Boolean(
      symbol.imageStringNodes[context.nodeIndex]?.specialValueImages?.[
        context.mappingIndex
      ],
    );
  if (context.kind === "value-image-string-special-image")
    if (symbol.valuePresentation?.text.type === "image-string") {
      const text = symbol.valuePresentation.text;
      return Boolean(
        ("tierResources" in text ? text : text.tiers[context.tierIndex])
          ?.specialValueImages?.[context.mappingIndex],
      );
    } else return false;
  if (context.kind === "value-tier-resource")
    return context.tierIndex < (symbol.valuePresentation?.tiers.length ?? 0);
  return symbol.states.has(context.state);
}
