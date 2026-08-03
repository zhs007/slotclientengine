import {
  createSymbolPackageResource,
  type GeneratedSymbolStateTextureId,
} from "@slotclientengine/rendercore/symbol";
import {
  createBoundedSourceIndex,
  ephemeralContentFingerprint,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import {
  ingestEditorResourceSources,
  normalizeEditorPackageZipEntries,
  type EditorImportSourceFile,
} from "@slotclientengine/editorresource";
import {
  addCustomStateDefinition,
  addSymbolState,
  createFromGameConfig,
  createPreviewSnapshot,
  deleteAsset,
  exportSnapshot,
  getAssetReferences,
  getIncludedSymbols,
  getSymbolResourceStatus,
  moveSymbolState,
  removeCustomStateDefinition,
  removeSymbolState,
  setAllSymbolsIncluded,
  setCascadeWinPresentation,
  setStateVisual,
  setSymbolIncluded,
  setSymbolRenderPriority,
  setSymbolScale,
  setValuePresentation,
  installImageStringDependency,
  removeImageStringDependency,
  renameImportedImageStringDependency,
  setSymbolImageStringNodes,
  type EditorAssetRecord,
  type EditorBaseVisual,
  type EditorStateVisual,
  type EditorSymbolDraft,
  type SymbolEditorProject,
} from "../model/editor-project.js";
import {
  commitSymbolResourceImport,
  prepareSymbolResourceImport,
} from "../model/resource-import.js";
import { importImageStringDependencyZip } from "../io/image-string-dependency.js";
import {
  decodeBrowserImage,
  encodeBrowserPng,
} from "../io/browser-image-codec.js";
import {
  applyStateTextureImageBinding,
  generateStateTextureImportSource,
  getStateTextureGenerationAvailability,
  isGeneratedStateTextureId,
} from "../model/state-texture-generation.js";
import {
  SymbolEditorStore,
  type SymbolEditorStoreSnapshot,
} from "../model/editor-store.js";
import {
  createSnapshotFiles,
  exportSymbolPackageZip,
  importSymbolPackageZip,
  SYMBOL_ZIP_LIMITS,
} from "../io/symbol-package-zip.js";
import {
  SymbolEditorPreview,
  type SymbolPreviewCell,
} from "../preview/symbol-preview.js";
import {
  applyResourceBinding,
  getDefaultSpineAtlasBinding,
  getEditorAssetDiagnostics,
  getResourceBindingLabel,
  getResourcePickerCandidates,
  type ResourceBindingContext,
} from "./resource-picker.js";
import {
  SymbolsEditorUiSession,
  type SymbolStatusFilter,
  type SymbolInspectorTab,
  type WorkspaceTab,
} from "./ui-session.js";
import { requestSymbolImportReview } from "./import-review-dialog.js";

interface ThumbnailEntry {
  readonly fingerprint: string;
  readonly url: string;
}

type UploadIntent =
  | { readonly kind: "ordinary" }
  | {
      readonly kind: "state-image";
      readonly symbol: string;
      readonly state: GeneratedSymbolStateTextureId;
    };

interface ScrollPosition {
  readonly left: number;
  readonly top: number;
}

interface OrdinaryImportOutcome {
  readonly changed: number;
  readonly boundPath?: string;
  readonly clearedAnimations: readonly {
    readonly location: string;
    readonly animationName: string;
  }[];
}

export class SymbolsEditorApp {
  readonly #root: HTMLElement;
  readonly #store = new SymbolEditorStore();
  readonly #session = new SymbolsEditorUiSession();
  readonly #thumbnails = new Map<string, ThumbnailEntry>();
  readonly #scrollPositions = new Map<string, ScrollPosition>();
  #preview: SymbolEditorPreview | null = null;
  #unsubscribe: (() => void) | null = null;
  #previewRequest = 0;
  #importRequest = 0;
  #importing = false;
  #previewError = "";
  #previewValue = 1;
  #pickerTrigger: HTMLElement | null = null;
  #uploadIntent: UploadIntent = { kind: "ordinary" };
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingFocusKey = "";
  #pendingVisibleState = "";
  #destroyed = false;

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  async init(): Promise<void> {
    this.#root.innerHTML = shellMarkup();
    this.#preview = new SymbolEditorPreview(
      this.requireElement("[data-preview]"),
    );
    await this.#preview.init();
    this.bindToolbar();
    this.#unsubscribe = this.#store.subscribe((snapshot) => {
      this.render(snapshot);
      void this.refreshPreview(snapshot);
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#unsubscribe?.();
    this.#unsubscribe = null;
    this.#previewRequest += 1;
    this.#importRequest += 1;
    this.#preview?.destroy();
    this.#preview = null;
    this.closePicker(false);
    if (this.#feedbackTimer) clearTimeout(this.#feedbackTimer);
    for (const entry of this.#thumbnails.values())
      URL.revokeObjectURL(entry.url);
    this.#thumbnails.clear();
    this.#root.replaceChildren();
  }

  private bindToolbar(): void {
    this.requireElement("[data-new]").addEventListener("click", () =>
      this.requireInput("[data-new-input]").click(),
    );
    this.requireElement("[data-upload]").addEventListener("click", () =>
      this.openUploadInput({ kind: "ordinary" }),
    );
    this.requireElement("[data-export]").addEventListener(
      "click",
      () => void this.exportPackage(),
    );
    this.requireElement("[data-new-input]").addEventListener(
      "change",
      (event) =>
        void this.createProject(event.currentTarget as HTMLInputElement),
    );
    this.requireElement("[data-upload-input]").addEventListener(
      "change",
      (event) => {
        const intent = this.#uploadIntent;
        this.#uploadIntent = { kind: "ordinary" };
        void this.uploadResources(
          event.currentTarget as HTMLInputElement,
          intent,
        );
      },
    );
    this.requireElement("[data-upload-input]").addEventListener(
      "cancel",
      () => {
        this.#uploadIntent = { kind: "ordinary" };
      },
    );
    this.requireElement("[data-replay]").addEventListener("click", () =>
      this.#preview?.replay(),
    );
    this.requireElement("[data-fit]").addEventListener("click", () =>
      this.updateZoom(this.#preview?.fitAll() ?? 1),
    );
    this.requireElement("[data-zoom-out]").addEventListener("click", () =>
      this.updateZoom(
        this.#preview?.setZoom((this.#preview.getZoom() ?? 1) / 1.2) ?? 1,
      ),
    );
    this.requireElement("[data-zoom-in]").addEventListener("click", () =>
      this.updateZoom(
        this.#preview?.setZoom((this.#preview.getZoom() ?? 1) * 1.2) ?? 1,
      ),
    );
    this.requireElement("[data-zoom]").addEventListener("input", (event) => {
      const zoom = Number((event.currentTarget as HTMLInputElement).value);
      this.updateZoom(this.#preview?.setZoom(zoom) ?? zoom);
    });
    this.requireElement("[data-preview-state]").addEventListener(
      "change",
      (event) => {
        this.#session.previewState = (
          event.currentTarget as HTMLSelectElement
        ).value;
        const project = this.#store.getSnapshot().project;
        const selected = project?.symbols.get(this.#session.selectedSymbol);
        if (
          this.#session.inspector === "states" &&
          selected?.states.has(this.#session.previewState)
        ) {
          this.#session.selectedState = this.#session.previewState;
          this.#pendingVisibleState = this.#session.selectedState;
        }
        const snapshot = this.#store.getSnapshot();
        this.render(snapshot);
        void this.refreshPreview(snapshot);
      },
    );
    this.requireElement("[data-preview-value]").addEventListener(
      "change",
      (event) => {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        if (Number.isSafeInteger(value) && value > 0)
          this.#previewValue = value;
        void this.refreshPreview(this.#store.getSnapshot());
      },
    );
  }

  private render(snapshot: SymbolEditorStoreSnapshot): void {
    if (this.#destroyed) return;
    this.captureViewState();
    const panel = this.requireElement("[data-project-panel]");
    const errors = this.requireElement("[data-errors]");
    const exportButton = this.requireElement(
      "[data-export]",
    ) as HTMLButtonElement;
    const uploadButtons = [
      this.requireElement("[data-upload]"),
    ] as HTMLButtonElement[];
    if (!snapshot.project) {
      panel.innerHTML = `<div class="start-state"><h1>建立 Symbols 项目</h1><p>上传公开 gameconfig.json，或导入已有 symbols ZIP。</p></div>`;
      errors.textContent = "";
      exportButton.disabled = true;
      uploadButtons.forEach((button) => (button.disabled = this.#importing));
      this.requireElement("[data-preview-state]").innerHTML =
        "<option>normal</option>";
      this.#preview?.clearResource();
      this.closePicker(false);
      return;
    }
    uploadButtons.forEach((button) => (button.disabled = this.#importing));
    const project = snapshot.project;
    this.#session.normalize(project);
    this.reconcileThumbnails(project);
    panel.innerHTML = workspaceMarkup(project, this.#session, (path) =>
      this.thumbnailUrl(project, path),
    );
    errors.replaceChildren(
      ...[
        ...snapshot.diagnostics,
        ...(this.#previewError
          ? [`Symbols 预览初始化失败：${this.#previewError}`]
          : []),
      ].map((message) =>
        Object.assign(document.createElement("div"), { textContent: message }),
      ),
    );
    try {
      exportSnapshot(project);
      exportButton.disabled = false;
      exportButton.title = "";
    } catch (error) {
      exportButton.disabled = true;
      exportButton.title = formatError(error);
    }
    const stateSelect = this.requireElement(
      "[data-preview-state]",
    ) as HTMLSelectElement;
    stateSelect.innerHTML = project.stateDefinitions
      .map((definition) =>
        option(
          definition.id,
          definition.id,
          definition.id === this.#session.previewState,
        ),
      )
      .join("");
    stateSelect.value = this.#session.previewState;
    this.bindWorkspaceControls(panel, project);
    this.renderPicker(project);
    this.restoreViewState();
  }

  private bindWorkspaceControls(
    panel: HTMLElement,
    project: SymbolEditorProject,
  ): void {
    this.bindTabs(panel, "[data-workspace-tab]", (value) => {
      this.#session.workspace = value as WorkspaceTab;
      this.#session.addStateOpen = false;
      this.render(this.#store.getSnapshot());
    });
    panel
      .querySelector<HTMLElement>("[data-start-symbols]")
      ?.addEventListener("click", () => {
        this.#session.workspace = "symbols";
        this.render(this.#store.getSnapshot());
      });
    this.bindAssetControls(panel, project);
    this.bindSymbolControls(panel, project);
    this.bindProjectControls(panel);
  }

  private bindTabs(
    panel: HTMLElement,
    selector: string,
    activate: (value: string) => void,
  ): void {
    const tabs = [...panel.querySelectorAll<HTMLElement>(selector)];
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () => activate(tab.dataset.tabValue!));
      tab.addEventListener("keydown", (event) => {
        const key = (event as KeyboardEvent).key;
        let next = index;
        if (key === "ArrowRight" || key === "ArrowDown")
          next = (index + 1) % tabs.length;
        else if (key === "ArrowLeft" || key === "ArrowUp")
          next = (index - 1 + tabs.length) % tabs.length;
        else if (key === "Home") next = 0;
        else if (key === "End") next = tabs.length - 1;
        else return;
        event.preventDefault();
        this.#pendingFocusKey = `${selector.includes("workspace") ? "workspace" : "inspector"}-tab-${tabs[next]!.dataset.tabValue}`;
        activate(tabs[next]!.dataset.tabValue!);
      });
    });
  }

  private bindAssetControls(
    panel: HTMLElement,
    project: SymbolEditorProject,
  ): void {
    const rerender = () => this.render(this.#store.getSnapshot());
    panel
      .querySelector<HTMLElement>("[data-import-image-string-inline]")
      ?.addEventListener("click", () =>
        this.openUploadInput({ kind: "ordinary" }),
      );
    panel
      .querySelectorAll<HTMLElement>("[data-remove-image-string]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) =>
              removeImageStringDependency(
                draft,
                button.dataset.removeImageString!,
              ),
            );
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelector<HTMLInputElement>("[data-asset-query]")
      ?.addEventListener("input", (event) => {
        this.#session.assetQuery = (
          event.currentTarget as HTMLInputElement
        ).value;
        rerender();
      });
    for (const [selector, key] of [
      ["[data-asset-kind]", "assetKind"],
      ["[data-asset-status]", "assetStatus"],
      ["[data-asset-group]", "assetGroup"],
    ] as const) {
      panel
        .querySelector<HTMLSelectElement>(selector)
        ?.addEventListener("change", (event) => {
          (this.#session as unknown as Record<string, string>)[key] = (
            event.currentTarget as HTMLSelectElement
          ).value;
          rerender();
        });
    }
    panel
      .querySelectorAll<HTMLDetailsElement>("[data-asset-details]")
      .forEach((details) => {
        details.addEventListener("toggle", () => {
          const path = details.dataset.assetDetails!;
          if (details.open) this.#session.expandedAssets.add(path);
          else this.#session.expandedAssets.delete(path);
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-delete-asset]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) =>
              deleteAsset(draft, button.dataset.deleteAsset!),
            );
            this.showSuccess(`已删除 ${button.dataset.deleteAsset}`);
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-asset-reference]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const [symbol, state] = button.dataset.assetReference!.split(".");
          if (symbol && project.symbols.has(symbol))
            this.#session.selectedSymbol = symbol;
          if (state && project.symbols.get(symbol ?? "")?.states.has(state)) {
            this.#session.selectedState = state;
            this.#session.previewState = state;
            this.#pendingVisibleState = state;
          }
          this.#session.workspace = "symbols";
          this.#session.inspector = "states";
          this.render(this.#store.getSnapshot());
        });
      });
  }

  private bindSymbolControls(
    panel: HTMLElement,
    project: SymbolEditorProject,
  ): void {
    this.bindTabs(panel, "[data-inspector-tab]", (value) => {
      this.#session.inspector = value as SymbolInspectorTab;
      this.#session.addStateOpen = false;
      this.render(this.#store.getSnapshot());
    });
    panel
      .querySelector<HTMLInputElement>("[data-symbol-query]")
      ?.addEventListener("input", (event) => {
        this.#session.symbolQuery = (
          event.currentTarget as HTMLInputElement
        ).value;
        this.render(this.#store.getSnapshot());
      });
    panel
      .querySelector<HTMLSelectElement>("[data-symbol-status]")
      ?.addEventListener("change", (event) => {
        this.#session.symbolStatus = (event.currentTarget as HTMLSelectElement)
          .value as SymbolStatusFilter;
        this.render(this.#store.getSnapshot());
      });
    panel
      .querySelectorAll<HTMLElement>("[data-select-mode]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          this.#store.transact((draft) =>
            setAllSymbolsIncluded(
              draft,
              button.dataset.selectMode as "all" | "none" | "invert",
            ),
          ),
        );
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-symbol-included]")
      .forEach((input) => {
        input.addEventListener("change", () =>
          this.#store.transact((draft) =>
            setSymbolIncluded(
              draft,
              input.dataset.symbolIncluded!,
              input.checked,
            ),
          ),
        );
      });
    panel
      .querySelectorAll<HTMLElement>("[data-edit-symbol]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#session.selectedSymbol = button.dataset.editSymbol!;
          const symbol = project.symbols.get(this.#session.selectedSymbol);
          if (!symbol?.states.has(this.#session.selectedState))
            this.#session.selectedState = "normal";
          this.#pendingVisibleState = this.#session.selectedState;
          this.render(this.#store.getSnapshot());
        });
      });
    this.bindInput(panel, "[data-symbol-scale]", (input) =>
      this.#store.transact((draft) =>
        setSymbolScale(
          draft,
          this.#session.selectedSymbol,
          Number(input.value),
        ),
      ),
    );
    this.bindInput(panel, "[data-symbol-priority]", (input) =>
      this.#store.transact((draft) =>
        setSymbolRenderPriority(
          draft,
          this.#session.selectedSymbol,
          Number(input.value),
        ),
      ),
    );
    panel
      .querySelector<HTMLElement>("[data-toggle-add-state]")
      ?.addEventListener("click", () => {
        this.#session.addStateOpen = !this.#session.addStateOpen;
        this.render(this.#store.getSnapshot());
      });
    panel
      .querySelectorAll<HTMLElement>("[data-add-state-id]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const state = button.dataset.addStateId!;
          try {
            this.#store.transact((draft) =>
              addSymbolState(draft, this.#session.selectedSymbol, state),
            );
            this.#session.selectedState = state;
            this.#session.previewState = state;
            this.#session.addStateOpen = false;
            this.#pendingFocusKey = "visual-kind";
            this.#pendingVisibleState = state;
            this.showSuccess(
              `已为 ${this.#session.selectedSymbol} 添加 ${state} 状态`,
            );
            const snapshot = this.#store.getSnapshot();
            this.render(snapshot);
            void this.refreshPreview(snapshot);
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-select-state]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#session.selectedState = button.dataset.selectState!;
          this.#session.previewState = this.#session.selectedState;
          this.#pendingVisibleState = this.#session.selectedState;
          const snapshot = this.#store.getSnapshot();
          this.render(snapshot);
          void this.refreshPreview(snapshot);
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-state-action]")
      .forEach((button) => {
        button.addEventListener("click", () => this.runStateAction(button));
      });
    panel
      .querySelectorAll<HTMLElement>("[data-generate-state-texture]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          const state = button.dataset.generateStateTexture;
          if (state && isGeneratedStateTextureId(state))
            void this.generateStateTexture(state);
        });
      });
    panel
      .querySelector<HTMLSelectElement>("[data-visual-kind]")
      ?.addEventListener("change", (event) => {
        const select = event.currentTarget as HTMLSelectElement;
        try {
          this.#store.transact((draft) =>
            setStateVisual(
              draft,
              this.#session.selectedSymbol,
              this.#session.selectedState,
              defaultVisualForKind(
                draft,
                this.#session.selectedSymbol,
                this.#session.selectedState,
                select.value,
              ),
            ),
          );
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelector<HTMLSelectElement>("[data-base-kind]")
      ?.addEventListener("change", (event) =>
        this.updateBaseVisualKind(
          (event.currentTarget as HTMLSelectElement).value,
        ),
      );
    panel
      .querySelectorAll<HTMLSelectElement>("[data-visual-field]")
      .forEach((select) => {
        select.addEventListener("change", () =>
          this.updateVisualField(select.dataset.visualField!, select.value),
        );
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-visual-number]")
      .forEach((input) => {
        input.addEventListener("change", () =>
          this.updateVisualField(
            input.dataset.visualNumber!,
            Number(input.value),
          ),
        );
      });
    panel
      .querySelectorAll<HTMLElement>("[data-open-picker]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          this.openPicker(parseContext(button.dataset.openPicker!), button),
        );
      });
    panel
      .querySelectorAll<HTMLElement>("[data-clear-resource]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            const context = parseContext(button.dataset.clearResource!);
            this.#store.transact((draft) =>
              applyResourceBinding(draft, context, ""),
            );
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-layer-action]")
      .forEach((button) => {
        button.addEventListener("click", () => this.runLayerAction(button));
      });
    panel
      .querySelector<HTMLSelectElement>("[data-composite-base]")
      ?.addEventListener("change", (event) =>
        this.updateCompositeBase(
          (event.currentTarget as HTMLSelectElement).value,
        ),
      );
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-composite-layer-field]")
      .forEach((input) => {
        input.addEventListener("change", () =>
          this.updateCompositeLayerField(
            Number(input.dataset.compositeLayerIndex),
            input.dataset.compositeLayerField!,
            input instanceof HTMLInputElement && input.type === "number"
              ? Number(input.value)
              : input.value,
          ),
        );
      });
    panel
      .querySelectorAll<HTMLElement>("[data-composite-layer-action]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          this.runCompositeLayerAction(button),
        );
      });
    this.bindValueControls(panel);
    this.bindImageStringControls(panel);
    this.bindCascadeControls(panel);
    panel
      .querySelectorAll<HTMLDetailsElement>("[data-tier-index]")
      .forEach((details) => {
        details.addEventListener("toggle", () => {
          if (details.open) {
            this.#session.expandedTier = Number(details.dataset.tierIndex);
            panel
              .querySelectorAll<HTMLDetailsElement>("[data-tier-index]")
              .forEach((candidate) => {
                if (candidate !== details) candidate.open = false;
              });
          }
        });
      });
  }

  private bindProjectControls(panel: HTMLElement): void {
    this.bindInput(panel, "[data-project-id]", (input) =>
      this.#store.transact((draft) => {
        draft.id = input.value.trim();
      }),
    );
    for (const key of ["width", "height"] as const) {
      this.bindInput(panel, `[data-cell-${key}]`, (input) =>
        this.#store.transact((draft) => {
          draft.cellSize[key] = Number(input.value);
        }),
      );
    }
    panel
      .querySelector<HTMLElement>("[data-add-custom]")
      ?.addEventListener("click", () => {
        const id =
          panel.querySelector<HTMLInputElement>("[data-custom-id]")!.value;
        const lifecycle = panel.querySelector<HTMLSelectElement>(
          "[data-custom-lifecycle]",
        )!.value;
        try {
          this.#store.transact((draft) =>
            addCustomStateDefinition(
              draft,
              lifecycle === "once"
                ? { id, phase: "once", playback: "once" }
                : { id, phase: "stable", playback: "loop" },
            ),
          );
          this.showSuccess(`已添加项目状态 ${id}`);
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<HTMLElement>("[data-remove-custom]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) =>
              removeCustomStateDefinition(draft, button.dataset.removeCustom!),
            );
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
  }

  private runStateAction(button: HTMLElement): void {
    const state = button.dataset.state!;
    const symbolBefore = this.#store
      .getSnapshot()
      .project?.symbols.get(this.#session.selectedSymbol);
    const oldIndex = symbolBefore?.stateOrder.indexOf(state) ?? -1;
    const action = button.dataset.stateAction;
    try {
      this.#store.transact((draft) => {
        if (action === "remove")
          removeSymbolState(draft, this.#session.selectedSymbol, state);
        else
          moveSymbolState(
            draft,
            this.#session.selectedSymbol,
            state,
            action === "up" ? -1 : 1,
          );
      });
      if (action === "remove") {
        const states = this.#store
          .getSnapshot()
          .project?.symbols.get(this.#session.selectedSymbol)?.stateOrder ?? [
          "normal",
        ];
        this.#session.selectedState =
          states[Math.min(oldIndex, states.length - 1)] ??
          states.at(-1) ??
          "normal";
        this.#pendingVisibleState = this.#session.selectedState;
        if (this.#session.previewState === state)
          this.#session.previewState = this.#session.selectedState;
        const snapshot = this.#store.getSnapshot();
        this.render(snapshot);
        void this.refreshPreview(snapshot);
      }
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private updateBaseVisualKind(kind: string): void {
    try {
      this.#store.transact((draft) => {
        const visual = draft.symbols
          .get(this.#session.selectedSymbol)!
          .states.get(this.#session.selectedState)!;
        if (
          visual.kind !== "spine" &&
          visual.kind !== "vni" &&
          visual.kind !== "composite"
        )
          return;
        const baseVisual: EditorBaseVisual =
          kind === "image"
            ? { kind: "image", imagePath: "" }
            : kind === "layered-image"
              ? {
                  kind: "layered-image",
                  layers: [{ index: 0, texturePath: "", keyframePaths: [] }],
                }
              : {
                  kind: "empty",
                  width: draft.cellSize.width,
                  height: draft.cellSize.height,
                };
        setStateVisual(
          draft,
          this.#session.selectedSymbol,
          this.#session.selectedState,
          {
            ...visual,
            baseVisual,
          },
        );
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private updateVisualField(field: string, value: unknown): void {
    try {
      this.#store.transact((draft) => {
        const visual = draft.symbols
          .get(this.#session.selectedSymbol)!
          .states.get(this.#session.selectedState)!;
        const next = structuredClone(visual) as unknown as Record<
          string,
          unknown
        >;
        if (field.startsWith("transform.")) {
          const key = field.slice("transform.".length);
          const transform =
            next.transform && typeof next.transform === "object"
              ? (next.transform as Record<string, unknown>)
              : {};
          transform[key] = value;
          next.transform = transform;
        } else next[field] = value;
        setStateVisual(
          draft,
          this.#session.selectedSymbol,
          this.#session.selectedState,
          next as unknown as EditorStateVisual,
        );
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private runLayerAction(button: HTMLElement): void {
    try {
      this.#store.transact((draft) => {
        const state = this.#session.selectedState;
        const visual = draft.symbols
          .get(this.#session.selectedSymbol)!
          .states.get(state)!;
        const isBase = button.dataset.baseVisual === "true";
        const source =
          isBase &&
          (visual.kind === "spine" ||
            visual.kind === "vni" ||
            visual.kind === "composite")
            ? visual.baseVisual
            : visual;
        if (source?.kind !== "layered-image") return;
        const layers = source.layers.map((layer) => ({
          index: layer.index,
          texturePath: layer.texturePath,
          keyframePaths: [...layer.keyframePaths],
        }));
        const action = button.dataset.layerAction!;
        const layerIndex = Number(button.dataset.layerIndex);
        if (action === "add-layer")
          layers.push({
            index: layers.length,
            texturePath: "",
            keyframePaths: [],
          });
        else if (action === "remove-layer") {
          if (layers.length <= 1)
            throw new Error("layered image 至少保留一个 layer。");
          layers.splice(layerIndex, 1);
          layers.forEach((layer, index) => (layer.index = index));
        } else if (action === "add-keyframe")
          layers[layerIndex]!.keyframePaths.push("");
        else
          layers[layerIndex]!.keyframePaths.splice(
            Number(button.dataset.keyframeIndex),
            1,
          );
        const layered = { kind: "layered-image" as const, layers };
        setStateVisual(
          draft,
          this.#session.selectedSymbol,
          state,
          isBase &&
            (visual.kind === "spine" ||
              visual.kind === "vni" ||
              visual.kind === "composite")
            ? { ...visual, baseVisual: layered }
            : layered,
        );
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private updateCompositeBase(base: string): void {
    try {
      this.#store.transact((draft) => {
        const visual = draft.symbols
          .get(this.#session.selectedSymbol)!
          .states.get(this.#session.selectedState)!;
        if (visual.kind !== "composite") return;
        setStateVisual(
          draft,
          this.#session.selectedSymbol,
          this.#session.selectedState,
          {
            ...visual,
            base: base === "stateTexture" ? "stateTexture" : "normal",
            ...(base === "stateTexture" && !visual.stateTexturePath
              ? { stateTexturePath: "" }
              : {}),
          },
        );
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private updateCompositeLayerField(
    index: number,
    field: string,
    value: unknown,
  ): void {
    try {
      this.#store.transact((draft) => {
        const visual = draft.symbols
          .get(this.#session.selectedSymbol)!
          .states.get(this.#session.selectedState)!;
        if (visual.kind !== "composite" || !visual.layers[index]) return;
        const layers = [...visual.layers];
        const layer = layers[index]!;
        if (field === "id" || field === "placement") {
          layers[index] = { ...layer, [field]: value } as typeof layer;
        } else if (field === "kind") {
          const atlas = getDefaultSpineAtlasBinding(draft);
          layers[index] = {
            ...layer,
            animation:
              value === "vni"
                ? { kind: "vni", projectPath: "", startTime: 0, endTime: 1 }
                : {
                    kind: "spine",
                    skeletonPath: "",
                    atlasPath: atlas?.atlasPath ?? "",
                    texturePath: atlas?.texturePath ?? "",
                    animationName: "",
                  },
          };
        } else {
          const animation = structuredClone(
            layer.animation,
          ) as unknown as Record<string, unknown>;
          if (field.startsWith("transform.")) {
            const transform =
              animation.transform && typeof animation.transform === "object"
                ? (animation.transform as Record<string, unknown>)
                : {};
            transform[field.slice("transform.".length)] = value;
            animation.transform = transform;
          } else animation[field] = value;
          layers[index] = {
            ...layer,
            animation: animation as typeof layer.animation,
          };
        }
        setStateVisual(
          draft,
          this.#session.selectedSymbol,
          this.#session.selectedState,
          { ...visual, layers },
        );
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private runCompositeLayerAction(button: HTMLElement): void {
    try {
      this.#store.transact((draft) => {
        const visual = draft.symbols
          .get(this.#session.selectedSymbol)!
          .states.get(this.#session.selectedState)!;
        if (visual.kind !== "composite") return;
        const layers = [...visual.layers];
        const action = button.dataset.compositeLayerAction;
        const index = Number(button.dataset.compositeLayerIndex);
        if (action === "add") {
          const atlas = getDefaultSpineAtlasBinding(draft);
          const used = new Set(layers.map((layer) => layer.id));
          let suffix = layers.length + 1;
          while (used.has(`layer-${suffix}`)) suffix += 1;
          layers.push({
            id: `layer-${suffix}`,
            placement: "overlay",
            animation: {
              kind: "spine",
              skeletonPath: "",
              atlasPath: atlas?.atlasPath ?? "",
              texturePath: atlas?.texturePath ?? "",
              animationName: "",
            },
          });
        } else if (action === "remove") {
          if (layers.length <= 1)
            throw new Error("composite 至少保留一个动画 layer。");
          layers.splice(index, 1);
        } else {
          const target = index + (action === "up" ? -1 : 1);
          if (target < 0 || target >= layers.length) return;
          [layers[index], layers[target]] = [layers[target]!, layers[index]!];
        }
        setStateVisual(
          draft,
          this.#session.selectedSymbol,
          this.#session.selectedState,
          { ...visual, layers },
        );
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private bindCascadeControls(panel: HTMLElement): void {
    panel
      .querySelector<HTMLSelectElement>("[data-cascade-mode]")
      ?.addEventListener("change", (event) => {
        const mode = (event.currentTarget as HTMLSelectElement).value;
        try {
          this.#store.transact((draft) => {
            const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
            if (!mode) {
              setCascadeWinPresentation(draft, symbol.symbol, undefined);
              return;
            }
            const once = compatibleStates(draft, symbol, "once");
            const loop = compatibleStates(draft, symbol, "loop");
            if (mode === "group") {
              if (once.length < 2)
                throw new Error("group mode 需要至少两个 once state。");
              setCascadeWinPresentation(draft, symbol.symbol, {
                order: 0,
                playback: {
                  mode: "group",
                  winState: once[0]!,
                  removeState: once[1]!,
                },
                summary: { mode: "groupAmount" },
              });
            } else {
              if (once.length < 3 || loop.length < 1)
                throw new Error(
                  "sequentialCollect 需要三个 once state 和一个 loop state。",
                );
              setCascadeWinPresentation(draft, symbol.symbol, {
                order: 0,
                playback: {
                  mode: "sequentialCollect",
                  startState: once[0]!,
                  loopState: loop[0]!,
                  collectState: once[1]!,
                  removeState: once[2]!,
                },
                summary: { mode: "itemAmount" },
              });
            }
          });
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-cascade-field]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
              const current = symbol.cascadeWinPresentation;
              if (!current) return;
              const field = input.dataset.cascadeField!;
              setCascadeWinPresentation(
                draft,
                symbol.symbol,
                field === "order"
                  ? { ...current, order: Number(input.value) }
                  : {
                      ...current,
                      playback: {
                        ...current.playback,
                        [field]: input.value,
                      } as typeof current.playback,
                    },
              );
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
  }

  private bindValueControls(panel: HTMLElement): void {
    panel
      .querySelector<HTMLElement>("[data-enable-value]")
      ?.addEventListener("click", () => {
        try {
          this.#store.transact((draft) =>
            setValuePresentation(
              draft,
              this.#session.selectedSymbol,
              createEmptyValuePresentation(draft),
            ),
          );
          this.#session.expandedTier = 0;
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelector<HTMLSelectElement>("[data-tier-normal-animation]")
      ?.addEventListener("change", (event) => {
        try {
          this.#store.transact((draft) => {
            const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
            if (!symbol.valuePresentation) return;
            const value = structuredClone(symbol.valuePresentation);
            for (const tier of value.tiers) {
              (
                tier.animation.playback as { animationName: string }
              ).animationName = (
                event.currentTarget as HTMLSelectElement
              ).value;
            }
            setValuePresentation(draft, symbol.symbol, value);
          });
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-shared-value-text-field]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
              const presentation = symbol.valuePresentation;
              if (!presentation || presentation.text.type !== "image-string")
                return;
              const value = structuredClone(presentation);
              if (value.text.type !== "image-string") return;
              const next =
                input instanceof HTMLInputElement && input.type === "checkbox"
                  ? input.checked
                  : input instanceof HTMLInputElement && input.type === "number"
                    ? Number(input.value)
                    : input.value;
              for (const binding of value.text.tiers) {
                setObjectPath(
                  binding as unknown as Record<string, unknown>,
                  input.dataset.sharedValueTextField!,
                  next,
                );
              }
              setValuePresentation(draft, symbol.symbol, value);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelector<HTMLElement>("[data-disable-value]")
      ?.addEventListener("click", () => {
        try {
          this.#store.transact((draft) =>
            setValuePresentation(
              draft,
              this.#session.selectedSymbol,
              undefined,
            ),
          );
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-value-field]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
              if (!symbol.valuePresentation) return;
              const value = structuredClone(
                symbol.valuePresentation,
              ) as unknown as Record<string, unknown>;
              setObjectPath(
                value,
                input.dataset.valueField!,
                input instanceof HTMLInputElement && input.type === "checkbox"
                  ? input.checked
                  : input.dataset.valueType === "number"
                    ? Number(input.value)
                    : input.value,
              );
              setValuePresentation(draft, symbol.symbol, value as never);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-value-action]")
      .forEach((button) => {
        button.addEventListener("click", () =>
          this.runValueAction(button, panel),
        );
      });
  }

  private bindImageStringControls(panel: HTMLElement): void {
    const symbolName = this.#session.selectedSymbol;
    panel
      .querySelector<HTMLElement>("[data-add-image-string-node]")
      ?.addEventListener("click", () => {
        try {
          this.#store.transact((draft) => {
            const symbol = draft.symbols.get(symbolName)!;
            if (
              draft.imageStringDependencies.size === 0 ||
              !symbol.stateOrder.some(
                (state) => symbol.states.get(state)?.kind === "spine",
              )
            ) {
              throw new Error(
                "新增节点前必须先导入 Imgnumber ZIP，并配置至少一个 Spine state。",
              );
            }
            let suffix = 1;
            let name = "image-value";
            while (symbol.imageStringNodes.some((node) => node.name === name)) {
              suffix += 1;
              name = `image-value-${suffix}`;
            }
            setSymbolImageStringNodes(draft, symbolName, [
              ...symbol.imageStringNodes,
              {
                name,
                resource: "",
                targets: [{ state: "", slot: "" }],
                initialText: "",
                anchor: { x: 0.5, y: 0.5 },
                transform: { x: 0, y: 0, scale: 1 },
                followSlotColor: true,
              },
            ]);
          });
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<HTMLElement>("[data-image-string-node-action]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(symbolName)!;
              const nodes = structuredClone(symbol.imageStringNodes);
              const index = Number(button.dataset.imageStringNodeIndex);
              const action = button.dataset.imageStringNodeAction;
              if (action === "remove") nodes.splice(index, 1);
              else moveArrayItem(nodes, index, action === "up" ? -1 : 1);
              setSymbolImageStringNodes(draft, symbolName, nodes);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-image-string-node-field]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(symbolName)!;
              const nodes = structuredClone(symbol.imageStringNodes);
              const node = nodes[Number(input.dataset.imageStringNodeIndex)]!;
              const field = input.dataset.imageStringNodeField!;
              const value =
                input instanceof HTMLInputElement && input.type === "checkbox"
                  ? input.checked
                  : input instanceof HTMLInputElement && input.type === "number"
                    ? Number(input.value)
                    : input.value;
              setObjectPath(
                node as unknown as Record<string, unknown>,
                field,
                value,
              );
              setSymbolImageStringNodes(draft, symbolName, nodes);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-image-string-target-add]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(symbolName)!;
              const nodes = structuredClone(symbol.imageStringNodes);
              const nodeIndex = Number(button.dataset.imageStringTargetAdd);
              const node = nodes[nodeIndex]!;
              nodes[nodeIndex] = {
                ...node,
                targets: [...node.targets, { state: "", slot: "" }],
              };
              setSymbolImageStringNodes(draft, symbolName, nodes);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-image-string-target-remove]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(symbolName)!;
              const nodes = structuredClone(symbol.imageStringNodes);
              const nodeIndex = Number(button.dataset.imageStringNodeIndex);
              const targetIndex = Number(
                button.dataset.imageStringTargetRemove,
              );
              const node = nodes[nodeIndex]!;
              if (node.targets.length <= 1) {
                throw new Error("ImgNumber 节点必须至少保留一个 target。");
              }
              nodes[nodeIndex] = {
                ...node,
                targets: node.targets.filter(
                  (_target, index) => index !== targetIndex,
                ),
              };
              setSymbolImageStringNodes(draft, symbolName, nodes);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLSelectElement>("[data-image-string-target-field]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(symbolName)!;
              const nodes = structuredClone(symbol.imageStringNodes);
              const nodeIndex = Number(input.dataset.imageStringNodeIndex);
              const targetIndex = Number(input.dataset.imageStringTargetIndex);
              const node = nodes[nodeIndex]!;
              const target = node.targets[targetIndex]!;
              const field = input.dataset.imageStringTargetField;
              const nextTarget =
                field === "state"
                  ? { state: input.value, slot: "" }
                  : field === "slot"
                    ? { ...target, slot: input.value }
                    : target;
              nodes[nodeIndex] = {
                ...node,
                targets: node.targets.map((candidate, index) =>
                  index === targetIndex ? nextTarget : candidate,
                ),
              };
              setSymbolImageStringNodes(draft, symbolName, nodes);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-image-string-preview]")
      .forEach((input) => {
        input.addEventListener("input", () => {
          const key = `${symbolName}\u0000${input.dataset.imageStringPreview}`;
          this.#session.imageStringPreviewTexts.set(key, input.value);
          void this.refreshPreview(this.#store.getSnapshot());
        });
      });
  }

  private runValueAction(button: HTMLElement, panel: HTMLElement): void {
    try {
      this.#store.transact((draft) => {
        const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
        if (!symbol.valuePresentation) return;
        const value = structuredClone(symbol.valuePresentation) as unknown as {
          defaultValues: number[];
          tiers: Array<Record<string, unknown>>;
          text: Record<string, unknown>;
        };
        const action = button.dataset.valueAction!;
        const index = Number(button.dataset.valueIndex);
        if (action === "add-default") {
          const candidate = Number(
            panel.querySelector<HTMLInputElement>("[data-new-default]")!.value,
          );
          if (
            !Number.isSafeInteger(candidate) ||
            candidate <= 0 ||
            value.defaultValues.includes(candidate)
          )
            throw new Error(
              "default value 必须是未重复的 positive safe integer。",
            );
          value.defaultValues.push(candidate);
        } else if (action === "remove-default") {
          if (value.defaultValues.length <= 1)
            throw new Error("defaultValues 不能为空。");
          value.defaultValues.splice(index, 1);
        } else if (action === "move-default")
          moveArrayItem(
            value.defaultValues,
            index,
            Number(button.dataset.direction),
          );
        else if (action === "add-tier") {
          const previous = value.tiers.at(-1)!;
          const priorMax =
            value.tiers.length > 1
              ? Number(value.tiers.at(-2)?.maxExclusive ?? 0)
              : 0;
          previous.maxExclusive = Math.max(
            priorMax + 1,
            priorMax === 0 ? 10 : priorMax * 10,
          );
          const clone = structuredClone(previous);
          delete clone.maxExclusive;
          value.tiers.push(clone);
          if (value.text.type === "image-string") {
            (value.text.tiers as Array<Record<string, unknown>>).push(
              structuredClone(
                (value.text.tiers as Array<Record<string, unknown>>)[0] ??
                  createEmptyValueImageStringBinding(),
              ),
            );
          }
          this.#session.expandedTier = value.tiers.length - 1;
        } else if (action === "remove-tier") {
          if (value.tiers.length <= 1)
            throw new Error("valuePresentation 至少保留一个 tier。");
          value.tiers.splice(index, 1);
          if (value.text.type === "image-string") {
            (value.text.tiers as unknown[]).splice(index, 1);
          }
          delete value.tiers.at(-1)!.maxExclusive;
        } else if (action === "move-tier") {
          const boundaries = value.tiers
            .slice(0, -1)
            .map((tier) => Number(tier.maxExclusive));
          moveArrayItem(value.tiers, index, Number(button.dataset.direction));
          if (value.text.type === "image-string") {
            moveArrayItem(
              value.text.tiers as unknown[],
              index,
              Number(button.dataset.direction),
            );
          }
          value.tiers.forEach((tier, tierIndex) => {
            if (tierIndex === value.tiers.length - 1) delete tier.maxExclusive;
            else tier.maxExclusive = boundaries[tierIndex];
          });
          this.#session.expandedTier = Math.max(
            0,
            Math.min(
              value.tiers.length - 1,
              index + Number(button.dataset.direction),
            ),
          );
        } else if (action === "text-type") {
          const slots = valueSlotOptions(draft, symbol);
          value.text =
            button.dataset.textType === "image-string"
              ? {
                  type: "image-string",
                  tiers: value.tiers.map(() =>
                    createEmptyValueImageStringBinding(),
                  ),
                }
              : button.dataset.textType === "image"
                ? {
                    type: "image",
                    slot: slots[0] ?? "",
                    x: 0,
                    y: 0,
                    prefix: "./",
                  }
                : {
                    type: "font",
                    slot: slots[0] ?? "",
                    x: 0,
                    y: 0,
                    fontFamily: "Arial",
                    fontSize: 24,
                    fontWeight: "700",
                    fill: "#ffffff",
                    stroke: "#000000",
                    strokeWidth: 1,
                  };
        }
        setValuePresentation(draft, symbol.symbol, value as never);
      });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private openPicker(
    context: ResourceBindingContext,
    trigger: HTMLElement,
  ): void {
    const project = this.#store.getSnapshot().project;
    if (!project) return;
    try {
      const currentPath = getCurrentResourcePath(project, context);
      getResourcePickerCandidates(project, context);
      this.#pickerTrigger = trigger;
      this.#session.picker = {
        context,
        currentPath,
        query: "",
        selectedPath: currentPath,
      };
      this.renderPicker(project);
      const dialog = this.requireElement(
        "[data-resource-picker]",
      ) as HTMLDialogElement;
      if (typeof dialog.showModal === "function" && !dialog.open)
        dialog.showModal();
      else dialog.setAttribute("open", "");
      queueMicrotask(() =>
        dialog.querySelector<HTMLInputElement>("[data-picker-query]")?.focus(),
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private renderPicker(project: SymbolEditorProject): void {
    const dialog = this.requireElement(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    const picker = this.#session.picker;
    if (!picker) {
      if (dialog.open) this.closePicker(false);
      return;
    }
    const candidates = getResourcePickerCandidates(
      project,
      picker.context,
      picker.query,
    );
    dialog.innerHTML = resourcePickerMarkup(
      picker.context,
      picker.query,
      picker.selectedPath,
      candidates,
      (path) => this.thumbnailUrl(project, path),
    );
    dialog
      .querySelector<HTMLInputElement>("[data-picker-query]")
      ?.addEventListener("input", (event) => {
        picker.query = (event.currentTarget as HTMLInputElement).value;
        this.renderPicker(project);
        queueMicrotask(() => {
          const input = dialog.querySelector<HTMLInputElement>(
            "[data-picker-query]",
          );
          input?.focus();
          input?.setSelectionRange(input.value.length, input.value.length);
        });
      });
    dialog
      .querySelectorAll<HTMLElement>("[data-picker-candidate]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          picker.selectedPath = button.dataset.pickerCandidate!;
          dialog
            .querySelectorAll<HTMLElement>("[data-picker-candidate]")
            .forEach((candidate) =>
              candidate.classList.toggle("selected", candidate === button),
            );
          const confirm = dialog.querySelector<HTMLButtonElement>(
            "[data-picker-confirm]",
          );
          if (confirm) confirm.disabled = false;
        });
        button.addEventListener("dblclick", () => {
          picker.selectedPath = button.dataset.pickerCandidate!;
          this.confirmPicker();
        });
        button.addEventListener("keydown", (event) => {
          if ((event as KeyboardEvent).key === "Enter") {
            event.preventDefault();
            picker.selectedPath = button.dataset.pickerCandidate!;
            this.confirmPicker();
          }
        });
      });
    dialog
      .querySelector<HTMLElement>("[data-picker-cancel]")
      ?.addEventListener("click", () => this.closePicker(true));
    dialog
      .querySelector<HTMLElement>("[data-picker-confirm]")
      ?.addEventListener("click", () => this.confirmPicker());
    dialog
      .querySelector<HTMLElement>("[data-picker-upload]")
      ?.addEventListener("click", () => {
        const context = picker.context;
        this.openUploadInput(
          context.kind === "state-image" &&
            isGeneratedStateTextureId(context.state)
            ? {
                kind: "state-image",
                symbol: context.symbol,
                state: context.state,
              }
            : { kind: "ordinary" },
        );
      });
    dialog.addEventListener(
      "cancel",
      (event) => {
        event.preventDefault();
        this.closePicker(true);
      },
      { once: true },
    );
  }

  private confirmPicker(): void {
    const picker = this.#session.picker;
    if (!picker?.selectedPath) return;
    try {
      this.#store.transact((draft) =>
        applyResourceBinding(draft, picker.context, picker.selectedPath!),
      );
      this.closePicker(true);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private closePicker(restoreFocus: boolean): void {
    const dialog = this.#root.querySelector<HTMLDialogElement>(
      "[data-resource-picker]",
    );
    if (dialog?.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
    this.#session.picker = null;
    if (restoreFocus) this.#pickerTrigger?.focus();
    this.#pickerTrigger = null;
  }

  private openUploadInput(intent: UploadIntent): void {
    if (this.#importing) return;
    const input = this.requireInput("[data-upload-input]");
    input.value = "";
    this.#uploadIntent = intent;
    input.click();
  }

  private suspendPickerDialog(): boolean {
    const dialog = this.#root.querySelector<HTMLDialogElement>(
      "[data-resource-picker]",
    );
    if (!dialog?.open) return false;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
    return true;
  }

  private resumePickerDialog(): void {
    const project = this.#store.getSnapshot().project;
    if (!project || !this.#session.picker || this.#destroyed) return;
    this.renderPicker(project);
    const dialog = this.requireElement(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    if (typeof dialog.showModal === "function" && !dialog.open)
      dialog.showModal();
    else dialog.setAttribute("open", "");
    queueMicrotask(() =>
      dialog.querySelector<HTMLInputElement>("[data-picker-query]")?.focus(),
    );
  }

  private async createProject(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const project = createFromGameConfig({
        rawGameConfig: JSON.parse(await file.text()),
        fileName: file.name,
      });
      this.#session.resetForNewProject(project);
      this.#store.replace(project);
      this.showSuccess("项目已创建，可先上传资源，再进入 Symbols 绑定");
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadResources(
    input: HTMLInputElement,
    intent: UploadIntent,
  ): Promise<void> {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length === 0) return;
    if (this.#importing) return;
    this.#importing = true;
    this.requireElement("[data-upload]").setAttribute("disabled", "");
    const request = ++this.#importRequest;
    this.showSuccess(`正在读取 ${files.length} 个 source…`);
    try {
      if (
        intent.kind === "state-image" &&
        (files.length !== 1 ||
          files[0]!.name.toLocaleLowerCase("en-US").endsWith(".zip"))
      ) {
        throw new Error("state 图片“上传并使用”只接受一张普通图片文件。");
      }
      createBoundedSourceIndex(files, {
        maxEntries: 4096,
        maxFileBytes: 50 * 1024 * 1024,
        maxTotalBytes: 500 * 1024 * 1024,
      });
      const inspectedZips = await Promise.all(
        files
          .filter((file) => file.name.toLowerCase().endsWith(".zip"))
          .map(async (file) => {
            const bytes = new Uint8Array(await file.arrayBuffer());
            const entries = normalizeEditorPackageZipEntries(
              extractBoundedZip(bytes, { limits: SYMBOL_ZIP_LIMITS }),
              ["symbols.package.json", "image-string.manifest.json"],
            );
            return { file, bytes, entries };
          }),
      );
      const projectZip = inspectedZips.find(({ entries }) =>
        entries.has("symbols.package.json"),
      );
      if (projectZip) {
        if (intent.kind !== "ordinary")
          throw new Error("Symbols project ZIP 不能绑定到单个 state。");
        if (files.length !== 1)
          throw new Error(
            "Symbols project ZIP 必须单独打开，不能与资源混合导入。",
          );
        const confirmed =
          typeof globalThis.window?.confirm !== "function" ||
          globalThis.window.confirm(
            `打开 Symbols 项目\n${projectZip.file.name} · ${projectZip.file.size} bytes\n\n确认原子替换当前项目？`,
          );
        if (!confirmed) {
          this.showSuccess("已取消 Symbols 项目导入");
          return;
        }
        this.showSuccess("正在验证 Symbols project 与 exact closure…");
        const imported = await importSymbolPackageZip(projectZip.bytes, {
          loadTextures: false,
        });
        try {
          if (request !== this.#importRequest) return;
          this.#previewError = "";
          this.#session.resetForImport(imported.project);
          this.#store.replace(imported.project);
          this.showSuccess(
            `Symbols 项目 ${imported.project.id} 已加载，正在准备预览…`,
          );
        } finally {
          imported.destroy();
        }
        return;
      }
      const imageStringZip = inspectedZips.find(({ entries }) =>
        entries.has("image-string.manifest.json"),
      );
      if (imageStringZip) {
        if (intent.kind !== "ordinary")
          throw new Error("ImgNumber ZIP 不能绑定到 state 图片。");
        if (files.length !== 1) throw new Error("ImgNumber ZIP 必须单独导入。");
        let dependency = await importImageStringDependencyZip(
          imageStringZip.bytes,
        );
        const currentProject = this.#store.getSnapshot().project;
        if (currentProject?.imageStringDependencies.has(dependency.id)) {
          const nextId = globalThis.window.prompt(
            `image-string id ${dependency.id} 已存在。请输入新的唯一 id：`,
            `${dependency.id}-2`,
          );
          if (nextId === null) return;
          dependency = renameImportedImageStringDependency(
            dependency,
            nextId.trim(),
          );
        }
        this.#store.transact((draft) =>
          installImageStringDependency(draft, dependency),
        );
        this.showSuccess(
          `已识别并安装 image-string ${dependency.id}；尚未自动绑定。`,
        );
        return;
      }

      const snapshot = this.#store.getSnapshot();
      const current = snapshot.project;
      if (!current) throw new Error("请先创建或导入项目。");
      this.showSuccess("正在展开资源并计算同名冲突…");
      const sources = await ingestEditorResourceSources({
        files,
        limits: {
          files: {
            maxEntries: 4096,
            maxFileBytes: 50 * 1024 * 1024,
            maxTotalBytes: 500 * 1024 * 1024,
          },
          zip: SYMBOL_ZIP_LIMITS,
        },
      });
      const outcome = await this.importOrdinarySources({
        project: current,
        baseRevision: snapshot.revision,
        sources,
        request,
        ...(intent.kind === "state-image" ? { binding: intent } : {}),
      });
      if (!outcome) return;
      this.showSuccess(
        outcome.boundPath
          ? `已上传并使用 ${outcome.boundPath}`
          : outcome.clearedAnimations.length === 0
            ? `已上传 ${outcome.changed} 个资源；现有配置保持不变`
            : `已上传 ${outcome.changed} 个资源；已清空 ${outcome.clearedAnimations.length} 个不存在的 Spine 动画：${outcome.clearedAnimations.map(({ location, animationName }) => `${location}（${animationName}）`).join("、")}`,
      );
      this.render(this.#store.getSnapshot());
    } catch (error) {
      if (request === this.#importRequest) this.#store.setExternalError(error);
    } finally {
      if (request === this.#importRequest) {
        this.#importing = false;
        if (!this.#destroyed)
          this.requireElement("[data-upload]").removeAttribute("disabled");
      }
    }
  }

  private async importOrdinarySources(options: {
    readonly project: SymbolEditorProject;
    readonly baseRevision: number;
    readonly sources: readonly EditorImportSourceFile[];
    readonly request: number;
    readonly binding?: Extract<UploadIntent, { readonly kind: "state-image" }>;
  }): Promise<OrdinaryImportOutcome | null> {
    const prepared = await prepareSymbolResourceImport({
      project: options.project,
      sources: options.sources,
    });
    if (options.request !== this.#importRequest) return null;
    if (
      options.binding &&
      (options.sources.length !== 1 ||
        prepared.records.length !== 1 ||
        prepared.records[0]?.kind !== "image")
    ) {
      throw new Error("state 图片“上传并使用”必须解析为唯一一张有效图片。");
    }
    const hasConflicts = prepared.review.items.some(
      ({ action }) => action === "overwrite" || action === "rename-required",
    );
    const suspended = hasConflicts && this.suspendPickerDialog();
    try {
      const resolutions = hasConflicts
        ? await requestSymbolImportReview(this.#root, prepared.review, {
            keepBothDisabledItemIndexes: new Set(
              prepared.review.items.flatMap((_, index) =>
                prepared.records[index]?.kind === "image" ? [] : [index],
              ),
            ),
          })
        : [];
      if (!resolutions) {
        this.showSuccess("已取消资源导入，项目未修改");
        return null;
      }
      if (options.request !== this.#importRequest) return null;
      if (this.#store.getSnapshot().revision !== options.baseRevision)
        throw new Error("资源处理期间项目已变化，请基于最新项目重试。");
      this.showSuccess("正在复验现有配置并原子提交…");
      let boundPath: string | undefined;
      const result = await commitSymbolResourceImport({
        project: options.project,
        prepared,
        resolutions,
        ...(options.binding
          ? {
              mutateCandidate: (candidate, review) => {
                const item = review.items[0];
                if (!item)
                  throw new Error("state 图片导入没有 resolved review item。");
                boundPath = item.targetKey;
                applyStateTextureImageBinding(
                  candidate,
                  options.binding!.symbol,
                  options.binding!.state,
                  boundPath,
                );
              },
            }
          : {}),
      });
      if (options.request !== this.#importRequest) return null;
      this.#store.replace(result.project);
      if (boundPath && this.#session.picker) {
        this.#session.picker = {
          ...this.#session.picker,
          currentPath: boundPath,
          selectedPath: boundPath,
        };
      }
      return Object.freeze({
        changed: result.review.items.filter(({ action }) => action !== "noop")
          .length,
        ...(boundPath ? { boundPath } : {}),
        clearedAnimations: result.clearedAnimations,
      });
    } finally {
      if (suspended) this.resumePickerDialog();
    }
  }

  private async generateStateTexture(
    state: GeneratedSymbolStateTextureId,
  ): Promise<void> {
    if (this.#importing) return;
    const snapshot = this.#store.getSnapshot();
    if (!snapshot.project) return;
    this.#importing = true;
    this.requireElement("[data-upload]").setAttribute("disabled", "");
    const request = ++this.#importRequest;
    const symbol = this.#session.selectedSymbol;
    this.showSuccess(
      `正在为 ${symbol} 生成 ${state === "spinBlur" ? "模糊图" : "disable 图"}…`,
    );
    try {
      const source = await generateStateTextureImportSource({
        project: snapshot.project,
        symbol,
        state,
        codec: { decode: decodeBrowserImage, encodePng: encodeBrowserPng },
      });
      const outcome = await this.importOrdinarySources({
        project: snapshot.project,
        baseRevision: snapshot.revision,
        sources: [
          {
            sourcePath: source.key,
            key: source.key,
            bytes: source.bytes,
            container: "file",
            containerName: "browser-generation",
          },
        ],
        request,
        binding: { kind: "state-image", symbol, state },
      });
      if (!outcome?.boundPath) return;
      this.#session.previewState = state;
      this.showSuccess(
        `已为 ${symbol} 生成并使用 ${state}：${outcome.boundPath}`,
      );
      const current = this.#store.getSnapshot();
      this.render(current);
      void this.refreshPreview(current);
    } catch (error) {
      if (request === this.#importRequest) this.#store.setExternalError(error);
    } finally {
      if (request === this.#importRequest) {
        this.#importing = false;
        if (!this.#destroyed)
          this.requireElement("[data-upload]").removeAttribute("disabled");
      }
    }
  }

  private async exportPackage(): Promise<void> {
    const project = this.#store.getSnapshot().project;
    if (!project) return;
    try {
      const exported = await exportSymbolPackageZip(project);
      const url = URL.createObjectURL(exported.blob);
      try {
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exported.fileName;
        anchor.click();
      } finally {
        URL.revokeObjectURL(url);
      }
      this.showSuccess(`已触发导出 ${exported.fileName}`);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async refreshPreview(
    snapshot: SymbolEditorStoreSnapshot,
  ): Promise<void> {
    const request = ++this.#previewRequest;
    const project = snapshot.project;
    if (!project || !this.#preview) return;
    const cells = createPreviewCells(
      project,
      this.#session.previewState,
      this.#previewValue,
      this.#session.imageStringPreviewTexts,
    );
    const previewSnapshot = createPreviewSnapshot(project);
    try {
      if (!previewSnapshot) {
        await this.#preview.setResource(
          null,
          cells,
          this.#session.previewState,
        );
        this.clearPreviewError();
        return;
      }
      const resource = await createSymbolPackageResource({
        packageManifest: previewSnapshot.packageManifest,
        files: createSnapshotFiles(previewSnapshot),
      });
      if (request !== this.#previewRequest) {
        resource.destroy();
        return;
      }
      await this.#preview.setResource(
        resource,
        cells,
        this.#session.previewState,
      );
      this.clearPreviewError();
      this.updateZoom(this.#preview.getZoom());
    } catch (error) {
      if (request === this.#previewRequest) {
        this.#previewError = formatError(error);
        try {
          await this.#preview.setResource(
            null,
            cells,
            this.#session.previewState,
          );
        } catch (fallbackError) {
          this.#previewError += `；清理失败：${formatError(fallbackError)}`;
        }
        const errors = this.#root.querySelector<HTMLElement>("[data-errors]");
        if (errors) {
          const message = document.createElement("div");
          message.textContent = `Symbols 预览初始化失败：${this.#previewError}`;
          const retry = document.createElement("button");
          retry.type = "button";
          retry.dataset.previewRetry = "";
          retry.textContent = "重试预览";
          retry.addEventListener("click", () =>
            this.refreshPreview(this.#store.getSnapshot()),
          );
          errors.replaceChildren(message, retry);
        }
      }
    }
  }

  private clearPreviewError(): void {
    if (!this.#previewError) return;
    this.#previewError = "";
    const errors = this.#root.querySelector<HTMLElement>("[data-errors]");
    if (errors)
      errors.replaceChildren(
        ...this.#store.getSnapshot().diagnostics.map((message) =>
          Object.assign(document.createElement("div"), {
            textContent: message,
          }),
        ),
      );
  }

  private showSuccess(message: string): void {
    this.#session.transientMessage = message;
    const region = this.#root.querySelector<HTMLElement>("[data-feedback]");
    if (region) region.textContent = message;
    if (this.#feedbackTimer) clearTimeout(this.#feedbackTimer);
    this.#feedbackTimer = setTimeout(() => {
      this.#session.transientMessage = "";
      const current = this.#root.querySelector<HTMLElement>("[data-feedback]");
      if (current) current.textContent = "";
    }, 3200);
  }

  private updateZoom(value: number): void {
    const slider = this.requireElement("[data-zoom]") as HTMLInputElement;
    slider.value = String(value);
    this.requireElement("[data-zoom-label]").textContent =
      `${Math.round(value * 100)}%`;
  }

  private captureViewState(): void {
    for (const element of this.#root.querySelectorAll<HTMLElement>(
      "[data-scroll-key]",
    ))
      this.#scrollPositions.set(
        element.dataset.scrollKey!,
        Object.freeze({ left: element.scrollLeft, top: element.scrollTop }),
      );
    const active = document.activeElement as HTMLElement | null;
    if (
      !this.#pendingFocusKey &&
      active &&
      this.#root.contains(active) &&
      active.dataset.focusKey
    )
      this.#pendingFocusKey = active.dataset.focusKey;
  }

  private restoreViewState(): void {
    for (const element of this.#root.querySelectorAll<HTMLElement>(
      "[data-scroll-key]",
    )) {
      const position = this.#scrollPositions.get(element.dataset.scrollKey!);
      element.scrollLeft = position?.left ?? 0;
      element.scrollTop = position?.top ?? 0;
    }
    const key = this.#pendingFocusKey;
    this.#pendingFocusKey = "";
    if (key)
      queueMicrotask(() =>
        this.#root
          .querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)
          ?.focus(),
      );
    const visibleState = this.#pendingVisibleState;
    this.#pendingVisibleState = "";
    if (visibleState)
      queueMicrotask(() => {
        const selected = [
          ...this.#root.querySelectorAll<HTMLElement>("[data-select-state]"),
        ].find((element) => element.dataset.selectState === visibleState);
        selected?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      });
  }

  private reconcileThumbnails(project: SymbolEditorProject): void {
    for (const [path, entry] of this.#thumbnails) {
      const record = project.assetLibrary.records.get(path);
      if (
        !record ||
        record.kind !== "image" ||
        ephemeralContentFingerprint(record.bytes) !== entry.fingerprint
      ) {
        URL.revokeObjectURL(entry.url);
        this.#thumbnails.delete(path);
      }
    }
  }

  private thumbnailUrl(
    project: SymbolEditorProject,
    path: string,
  ): string | undefined {
    const record = project.assetLibrary.records.get(path);
    if (!record || record.kind !== "image") return undefined;
    const current = this.#thumbnails.get(path);
    const nextFingerprint = ephemeralContentFingerprint(record.bytes);
    if (current?.fingerprint === nextFingerprint) return current.url;
    if (current) URL.revokeObjectURL(current.url);
    const url = URL.createObjectURL(new Blob([record.bytes as BlobPart]));
    this.#thumbnails.set(path, { fingerprint: nextFingerprint, url });
    return url;
  }

  private bindInput(
    root: HTMLElement,
    selector: string,
    callback: (input: HTMLInputElement) => void,
  ): void {
    root
      .querySelector<HTMLInputElement>(selector)
      ?.addEventListener("change", (event) => {
        try {
          callback(event.currentTarget as HTMLInputElement);
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
  }

  private requireElement(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`缺少 UI element：${selector}`);
    return element;
  }

  private requireInput(selector: string): HTMLInputElement {
    return this.requireElement(selector) as HTMLInputElement;
  }
}

function shellMarkup(): string {
  return `<main class="app-shell">
    <header class="toolbar">
      <strong>Symbols Editor</strong>
      <button data-new>新建（game config）</button>
      <span class="toolbar-divider"></span>
      <button data-upload>导入资源 / ZIP</button>
      <button class="primary" data-export disabled>导出 ZIP</button>
      <input hidden type="file" accept="application/json,.json" data-new-input>
      <input hidden type="file" multiple accept=".png,.jpg,.jpeg,.webp,.json,.atlas,.zip,application/zip" data-upload-input>
    </header>
    <div class="feedback" data-feedback aria-live="polite"></div>
    <div class="errors" data-errors role="alert"></div>
    <section class="workspace">
      <aside class="panel" data-project-panel></aside>
      <section class="preview-panel" aria-label="全部 display symbols 预览">
        <div class="preview-toolbar">
          <label>预览 state <select data-preview-state><option>normal</option></select></label>
          <button data-replay>Replay</button>
          <label>Value <input data-preview-value type="number" min="1" step="1" value="1"></label>
          <button data-fit>适配全部</button><button data-zoom-out aria-label="缩小">−</button>
          <input data-zoom aria-label="预览缩放" type="range" min="0.25" max="4" step="0.05" value="1">
          <button data-zoom-in aria-label="放大">＋</button><span data-zoom-label>100%</span>
        </div>
        <div class="preview" data-preview></div>
      </section>
    </section>
    <dialog class="resource-picker" data-resource-picker></dialog>
  </main>`;
}

function workspaceMarkup(
  project: SymbolEditorProject,
  session: SymbolsEditorUiSession,
  thumbnail: (path: string) => string | undefined,
): string {
  const tabs: Array<[WorkspaceTab, string]> = [
    ["assets", "资源"],
    ["symbols", "Symbols"],
    ["project", "项目配置"],
  ];
  const body =
    session.workspace === "assets"
      ? assetsWorkspaceMarkup(project, session, thumbnail)
      : session.workspace === "symbols"
        ? symbolsWorkspaceMarkup(project, session, thumbnail)
        : projectWorkspaceMarkup(project);
  return `<div class="workspace-tabs" role="tablist" aria-label="编辑工作区">
    ${tabs.map(([id, label]) => tabMarkup(id, label, session.workspace === id, "workspace")).join("")}
  </div>
  <div id="workspace-${session.workspace}" class="workspace-body" role="tabpanel" aria-labelledby="workspace-tab-${session.workspace}" data-scroll-key="workspace-${session.workspace}">${body}</div>`;
}

function assetsWorkspaceMarkup(
  project: SymbolEditorProject,
  session: SymbolsEditorUiSession,
  thumbnail: (path: string) => string | undefined,
): string {
  const references = getAssetReferences(project);
  const refCounts = new Map<string, number>();
  for (const ref of references)
    refCounts.set(ref.path, (refCounts.get(ref.path) ?? 0) + 1);
  const records = [...project.assetLibrary.records.values()]
    .filter((record) => record.kind !== "image-string-manifest")
    .filter((record) => {
      const query = session.assetQuery.trim().toLowerCase();
      const referenced = (refCounts.get(record.path) ?? 0) > 0;
      const diagnostics = getEditorAssetDiagnostics(project, record.path);
      const kindMatches =
        session.assetKind === "all" ||
        session.assetKind === record.kind ||
        (session.assetKind === "spine" && record.kind.startsWith("spine-")) ||
        (session.assetKind === "vni" && record.kind === "vni-project") ||
        (session.assetKind === "other" &&
          !["image", "spine-skeleton", "spine-atlas", "vni-project"].includes(
            record.kind,
          ));
      const statusMatches =
        session.assetStatus === "all" ||
        (session.assetStatus === "error" && diagnostics.length > 0) ||
        (session.assetStatus === "referenced" && referenced) ||
        (session.assetStatus === "unused" &&
          !referenced &&
          diagnostics.length === 0);
      return (
        kindMatches &&
        statusMatches &&
        `${record.path} ${record.kind} ${diagnostics.join(" ")}`
          .toLowerCase()
          .includes(query)
      );
    });
  const groups = groupAssets(project, records, session.assetGroup);
  const dependencyMarkup = `<section class="dependency-library"><div class="section-heading"><div><h2>ImgNumber dependencies</h2><p>Standalone ZIP 作为一个逻辑资源管理，glyph 不需要逐个绑定。</p></div><button data-import-image-string-inline>导入 Imgnumber ZIP</button></div><div class="dependency-list">${
    [...project.imageStringDependencies.values()]
      .map((dependency) => {
        const references = [...project.symbols.values()].flatMap((symbol) => [
          ...symbol.imageStringNodes
            .filter((node) =>
              node.resource.includes(`/image-strings/${dependency.id}/`),
            )
            .map((node) => `${symbol.symbol}.imageStringNodes.${node.name}`),
          ...(symbol.valuePresentation?.text.type === "image-string"
            ? symbol.valuePresentation.text.tiers.flatMap((binding, index) =>
                binding.resource.includes(`/image-strings/${dependency.id}/`)
                  ? [`${symbol.symbol}.valuePresentation.text.tiers[${index}]`]
                  : [],
              )
            : []),
        ]);
        return `<article class="dependency-card"><div><strong>image-string.manifest.json</strong><small>${Object.keys(dependency.manifest.glyphs).length} glyphs · lineHeight ${dependency.manifest.metrics.lineHeight}</small><small>${references.length ? `引用：${references.map(escapeHtml).join("、")}` : "未引用"}</small></div><div class="button-row"><button data-remove-image-string="${escapeAttr(dependency.id)}" ${references.length ? "disabled" : ""}>删除</button></div></article>`;
      })
      .join("") || '<p class="empty">尚未导入 Imgnumber ZIP。</p>'
  }</div></section>`;
  return `<section class="workspace-intro">
      <div><h1>资源</h1><p>先上传，再由 Picker 显式绑定；上传不会按文件名自动匹配。</p></div>
      <button class="primary" data-start-symbols>开始配置 Symbols</button>
    </section>
    ${dependencyMarkup}
    <div class="filter-toolbar sticky">
      <input data-asset-query data-focus-key="asset-query" type="search" placeholder="搜索 path / type / diagnostics" value="${escapeAttr(session.assetQuery)}">
      <select data-asset-kind aria-label="资源类型">${selectOptions(
        [
          ["all", "全部类型"],
          ["image", "Image"],
          ["spine", "Spine"],
          ["vni", "VNI"],
          ["other", "其它"],
        ],
        session.assetKind,
      )}</select>
      <select data-asset-status aria-label="资源状态">${selectOptions(
        [
          ["all", "全部状态"],
          ["referenced", "已引用"],
          ["unused", "未使用"],
          ["error", "错误"],
        ],
        session.assetStatus,
      )}</select>
      <select data-asset-group aria-label="资源分组">${selectOptions(
        [
          ["batch", "按上传批次"],
          ["kind", "按资源类型"],
        ],
        session.assetGroup,
      )}</select>
    </div>
    <div class="asset-list" data-scroll-key="asset-list">
      ${
        groups
          .map(
            ([label, items], groupIndex) =>
              `<details class="asset-group" ${groupIndex === 0 ? "open" : ""}><summary>${escapeHtml(label)} · ${items.length}</summary>${items
                .map((record) =>
                  assetRowMarkup(
                    record,
                    references.filter((ref) => ref.path === record.path),
                    session.expandedAssets.has(record.path),
                    thumbnail(record.path),
                    getEditorAssetDiagnostics(project, record.path),
                  ),
                )
                .join("")}</details>`,
          )
          .join("") ||
        `<p class="empty">${project.assetLibrary.records.size === 0 ? "资源库为空；explicit empty 项目仍可导出。" : "没有符合筛选条件的资源。"}</p>`
      }
    </div>`;
}

function assetRowMarkup(
  record: EditorAssetRecord,
  references: readonly { readonly location: string }[],
  expanded: boolean,
  thumbnail?: string,
  diagnostics: readonly string[] = record.diagnostics,
): string {
  const status = diagnostics.length
    ? "错误"
    : references.length
      ? "已引用"
      : "未使用";
  const statusClass = diagnostics.length
    ? "error"
    : references.length
      ? "ready"
      : "unused";
  const dependencies = assetMetadataList(record, "assetPaths");
  return `<details class="asset-row asset-${statusClass}" data-asset-details="${escapeAttr(record.path)}" ${expanded ? "open" : ""}>
    <summary>
      <span class="asset-thumb">${thumbnail ? `<img src="${escapeAttr(thumbnail)}" alt="">` : `<span aria-hidden="true">${assetIcon(record.kind)}</span>`}</span>
      <span class="asset-main"><span class="path" title="${escapeAttr(record.path)}">${escapeHtml(record.path)}</span><small>${record.kind} · ${formatBytes(record.size)} · ${status}</small></span>
      <span class="status-text status-${statusClass}">${status}</span>
    </summary>
    <div class="asset-detail">
      ${metadataSummary(record) ? `<p>${escapeHtml(metadataSummary(record))}</p>` : ""}
      ${dependencies.length ? `<p>直接依赖：${dependencies.map(escapeHtml).join("、")}</p>` : ""}
      ${diagnostics.map((item) => `<div class="inline-error">${escapeHtml(item)}</div>`).join("")}
      <div class="refs">${references.map((ref) => `<button data-asset-reference="${escapeAttr(ref.location)}">${escapeHtml(ref.location)}</button>`).join("") || "0 references"}</div>
      <div class="button-row"><button data-delete-asset="${escapeAttr(record.path)}">删除</button></div>
    </div>
  </details>`;
}

function symbolsWorkspaceMarkup(
  project: SymbolEditorProject,
  session: SymbolsEditorUiSession,
  thumbnail: (path: string) => string | undefined,
): string {
  const all = [...project.symbols.values()].sort(
    (left, right) => left.code - right.code,
  );
  const query = session.symbolQuery.trim().toLowerCase();
  const symbols = all.filter((symbol) => {
    const status = getSymbolResourceStatus(project, symbol.symbol);
    const error = Boolean(status.error);
    const incomplete = !status.ready && !error;
    return (
      `${symbol.code} ${symbol.symbol}`.toLowerCase().includes(query) &&
      (session.symbolStatus === "all" ||
        (session.symbolStatus === "included" && symbol.included) ||
        (session.symbolStatus === "error" && error) ||
        (session.symbolStatus === "incomplete" && incomplete))
    );
  });
  const selected = project.symbols.get(session.selectedSymbol) ?? all[0];
  return `<div class="symbols-layout">
    <aside class="symbol-rail">
      <div class="rail-toolbar sticky">
        <div class="button-row"><button data-select-mode="all">全选</button><button data-select-mode="none">全不选</button><button data-select-mode="invert">反选</button></div>
        <input data-symbol-query data-focus-key="symbol-query" type="search" placeholder="搜索 symbol / code" value="${escapeAttr(session.symbolQuery)}">
        <select data-symbol-status aria-label="Symbol 状态">${selectOptions(
          [
            ["all", "全部"],
            ["included", "Included"],
            ["incomplete", "Incomplete"],
            ["error", "Error"],
          ],
          session.symbolStatus,
        )}</select>
      </div>
      <div class="symbol-list" data-scroll-key="symbol-rail">${symbols.map((symbol) => symbolRailRow(project, symbol, session.selectedSymbol)).join("") || '<p class="empty">无匹配 symbol。</p>'}</div>
    </aside>
    <section class="inspector">${selected ? inspectorMarkup(project, selected, session, thumbnail) : '<p class="empty">没有 symbol。</p>'}</section>
  </div>`;
}

function symbolRailRow(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  selected: string,
): string {
  const resource = getSymbolResourceStatus(project, symbol.symbol);
  const state = resource.ready
    ? "ready"
    : resource.error
      ? "error"
      : "incomplete";
  const label =
    state === "ready" ? "就绪" : state === "error" ? "错误" : "未完成";
  return `<div class="symbol-row ${symbol.symbol === selected ? "selected" : ""}">
    <input type="checkbox" aria-label="包含 ${escapeAttr(symbol.symbol)}" data-symbol-included="${escapeAttr(symbol.symbol)}" ${symbol.included ? "checked" : ""}>
    <button class="symbol-select" data-edit-symbol="${escapeAttr(symbol.symbol)}" aria-current="${symbol.symbol === selected ? "true" : "false"}"><span class="symbol-code">${symbol.code}</span><strong>${escapeHtml(symbol.symbol)}</strong><small>${symbol.states.size} states</small></button>
    <span class="symbol-status status-${state}" aria-label="${label}">${label}</span>
  </div>`;
}

function inspectorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  session: SymbolsEditorUiSession,
  thumbnail: (path: string) => string | undefined,
): string {
  const tabs: Array<[SymbolInspectorTab, string]> = [
    ["basic", "基础"],
    ["value", "档位"],
    ["states", "状态"],
    ["image-string", "ImgNumber"],
    ["cascade", "Cascade"],
  ];
  const content =
    session.inspector === "basic"
      ? basicInspectorMarkup(project, symbol)
      : session.inspector === "states"
        ? statesInspectorMarkup(project, symbol, session, thumbnail)
        : session.inspector === "image-string"
          ? imageStringInspectorMarkup(project, symbol, session)
          : session.inspector === "value"
            ? valueInspectorMarkup(project, symbol, session, thumbnail)
            : cascadeInspectorMarkup(project, symbol);
  return `<header class="inspector-heading"><div><small>当前 symbol</small><h1>${escapeHtml(symbol.symbol)} <span>· code ${symbol.code}</span></h1></div><span class="included-badge">${symbol.included ? "Included" : "Excluded"}</span></header>
    <div class="inspector-tabs" role="tablist" aria-label="Symbol Inspector">
      ${tabs.map(([id, label]) => tabMarkup(id, label, session.inspector === id, "inspector")).join("")}
    </div>
    <div id="inspector-${session.inspector}" class="inspector-body" role="tabpanel" aria-labelledby="inspector-tab-${session.inspector}" data-scroll-key="inspector">${content}</div>`;
}

function imageStringInspectorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  session: SymbolsEditorUiSession,
): string {
  const spineStates = symbol.stateOrder.filter(
    (state) => symbol.states.get(state)?.kind === "spine",
  );
  const dependencies = [...project.imageStringDependencies.values()];
  return `<section class="image-string-editor"><div class="section-heading"><div><h2>Named image-string nodes</h2><p>每个节点绑定一个或多个真实 Spine state/exact slot；同一 renderer 跨 state 复用，预览输入不改 initialText。</p></div><button class="primary" data-add-image-string-node ${spineStates.length && dependencies.length ? "" : "disabled"}>增加节点</button></div>${
    symbol.imageStringNodes
      .map((node, index) => {
        const previewKey = `${symbol.symbol}\u0000${node.name}`;
        const previewText =
          session.imageStringPreviewTexts.get(previewKey) ?? node.initialText;
        return `<article class="node-card"><header><strong>${escapeHtml(node.name)}</strong><div class="button-row"><button data-image-string-node-action="up" data-image-string-node-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button><button data-image-string-node-action="down" data-image-string-node-index="${index}" ${index === symbol.imageStringNodes.length - 1 ? "disabled" : ""}>↓</button><button data-image-string-node-action="remove" data-image-string-node-index="${index}">删除</button></div></header>
        <label>Name <input data-image-string-node-field="name" data-image-string-node-index="${index}" value="${escapeAttr(node.name)}"></label>
        <label>Dependency <select data-image-string-node-field="resource" data-image-string-node-index="${index}"><option value="">请选择 dependency</option>${dependencies.map((dependency) => option(`./${dependency.rootKey}`, `${dependency.id} · ${dependency.rootKey}`, node.resource === `./${dependency.rootKey}`)).join("")}</select></label>
        <fieldset><legend>State targets</legend>${node.targets
          .map((target, targetIndex) => {
            const visual = symbol.states.get(target.state);
            const slots =
              visual?.kind === "spine"
                ? assetMetadataList(
                    project.assetLibrary.records.get(visual.skeletonPath),
                    "slotNames",
                  )
                : [];
            return `<div class="form-grid"><label>Target state <select data-image-string-target-field="state" data-image-string-node-index="${index}" data-image-string-target-index="${targetIndex}"><option value="">请选择 Spine state</option>${spineStates.map((state) => option(state, state, state === target.state)).join("")}</select></label><label>Exact slot <select data-image-string-target-field="slot" data-image-string-node-index="${index}" data-image-string-target-index="${targetIndex}"><option value="">请选择 slot</option>${slots.map((slot) => option(slot, slot, slot === target.slot)).join("")}</select></label><button type="button" data-image-string-target-remove="${targetIndex}" data-image-string-node-index="${index}" ${node.targets.length === 1 ? "disabled" : ""}>删除 target</button></div>`;
          })
          .join(
            "",
          )}<button type="button" data-image-string-target-add="${index}">增加 target</button></fieldset>
        <label>Initial text <input data-image-string-node-field="initialText" data-image-string-node-index="${index}" value="${escapeAttr(node.initialText)}"></label>
        <div class="form-grid"><label>Anchor X <input type="number" min="0" max="1" step="0.01" data-image-string-node-field="anchor.x" data-image-string-node-index="${index}" value="${node.anchor.x}"></label><label>Anchor Y <input type="number" min="0" max="1" step="0.01" data-image-string-node-field="anchor.y" data-image-string-node-index="${index}" value="${node.anchor.y}"></label><label>X <input type="number" step="0.1" data-image-string-node-field="transform.x" data-image-string-node-index="${index}" value="${node.transform.x}"></label><label>Y <input type="number" step="0.1" data-image-string-node-field="transform.y" data-image-string-node-index="${index}" value="${node.transform.y}"></label><label>Scale <input type="number" min="0.01" step="0.01" data-image-string-node-field="transform.scale" data-image-string-node-index="${index}" value="${node.transform.scale}"></label></div>
        <label class="check-row"><input type="checkbox" data-image-string-node-field="followSlotColor" data-image-string-node-index="${index}" ${node.followSlotColor ? "checked" : ""}> Follow slot color</label>
        <label>Manual preview string <input data-image-string-preview="${escapeAttr(node.name)}" value="${escapeAttr(previewText)}"></label>
      </article>`;
      })
      .join("") ||
    '<p class="empty">尚未配置命名 image-string 节点。先导入 dependency，并为 symbol 配置 Spine state。</p>'
  }</section>`;
}

function basicInspectorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const status = getSymbolResourceStatus(project, symbol.symbol);
  const normal = symbol.states.get("normal");
  return `<section class="inspector-section"><h2>基础属性</h2>
    <dl class="summary-grid"><div><dt>Symbol</dt><dd>${escapeHtml(symbol.symbol)}</dd></div><div><dt>Numeric code</dt><dd>${symbol.code}</dd></div><div><dt>Normal</dt><dd>${symbol.valuePresentation ? "档位 Spine" : visualKindLabel(normal?.kind ?? "missing")}</dd></div><div><dt>状态数</dt><dd>${symbol.states.size}</dd></div></dl>
    <label class="check-row"><input type="checkbox" data-symbol-included="${escapeAttr(symbol.symbol)}" ${symbol.included ? "checked" : ""}> Included</label>
    <div class="form-grid"><label>Scale <input data-symbol-scale data-focus-key="symbol-scale" type="number" min="0.01" step="0.01" value="${symbol.scale}"></label><label>Render priority <input data-symbol-priority type="number" min="0" step="1" value="${symbol.renderPriority}"></label></div>
    <div class="completeness ${status.ready ? "ready-box" : "error-box"}"><strong>${status.ready ? "配置就绪" : "配置未完成"}</strong>${status.error ? `<p>${escapeHtml(status.error)}</p>` : ""}${status.missing.length ? `<p>缺少：${status.missing.map(escapeHtml).join("、")}</p>` : ""}</div>
  </section>`;
}

function statesInspectorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  session: SymbolsEditorUiSession,
  thumbnail: (path: string) => string | undefined,
): string {
  const available = project.stateDefinitions.filter(
    (definition) => !symbol.states.has(definition.id),
  );
  const state = symbol.states.has(session.selectedState)
    ? session.selectedState
    : "normal";
  const visual = symbol.states.get(state)!;
  const definition = project.stateDefinitions.find(
    (item) => item.id === state,
  )!;
  const index = symbol.stateOrder.indexOf(state);
  const tiered = Boolean(symbol.valuePresentation);
  const tieredNormal = tiered && state === "normal";
  const tieredAnimated =
    tiered && (state === "normal" || definition.playback !== "static");
  const stateFields = tieredNormal
    ? tierNormalAnimationMarkup(project, symbol)
    : visualFieldsMarkup(project, symbol, state, visual, thumbnail);
  const generation =
    state === "normal"
      ? stateTextureGenerationMarkup(project, symbol.symbol)
      : "";
  return `<section class="state-editor">
    <div class="state-nav-wrap sticky">
      <div class="state-nav" aria-label="Symbol states" data-scroll-key="state-nav-${escapeAttr(symbol.symbol)}">${symbol.stateOrder.map((id) => stateNavItem(project, symbol, id, id === state)).join("")}</div>
      <div class="add-state-wrap"><button class="primary" data-toggle-add-state aria-expanded="${session.addStateOpen}">＋ 添加状态</button>${session.addStateOpen ? `<div class="add-state-menu" role="menu">${available.map((item) => `<button role="menuitem" data-add-state-id="${escapeAttr(item.id)}"><strong>${escapeHtml(item.id)}</strong><small>${item.phase} / ${item.playback}</small></button>`).join("") || '<p class="empty">全部项目状态均已添加。</p>'}</div>` : ""}</div>
    </div>
    <article class="single-state-inspector">
      <header><div><h2 data-focus-key="state-heading" tabindex="-1">${escapeHtml(state)}</h2><p>${definition.phase} / ${definition.playback}</p></div>${state === "normal" ? '<span class="lock-label">固定状态</span>' : `<div class="button-row"><button data-state-action="up" data-state="${escapeAttr(state)}" ${index <= 1 ? "disabled" : ""} aria-label="上移 ${escapeAttr(state)}">↑</button><button data-state-action="down" data-state="${escapeAttr(state)}" ${index >= symbol.stateOrder.length - 1 ? "disabled" : ""} aria-label="下移 ${escapeAttr(state)}">↓</button><button data-state-action="remove" data-state="${escapeAttr(state)}">删除</button></div>`}</header>
      <div class="explicit-state-note">${tieredNormal ? "normal 使用当前数值解析出的 Spine 档位；这里只统一选择一次动画。" : tieredAnimated ? "该状态统一切换当前 Spine 档位上的同名动画。" : tiered ? "该 reel state 使用独立静态图片，不进入 Spine 档位动画。" : visual.kind === "empty" || visual.kind === "empty-state" ? "当前是 explicit empty：这是正式配置，不是 fallback。" : "当前 state 已配置资源。"}</div>
      ${generation}
      ${
        tiered
          ? `<div class="derived-field"><span>Visual kind</span><strong>${tieredAnimated ? "Active Spine（全部档位）" : "独立静态图片"}</strong><small>由档位与 state lifecycle 固定</small></div>`
          : `<label>Visual kind <select data-visual-kind data-focus-key="visual-kind">${compatibleVisualKinds(
              symbol,
              state,
            )
              .map((kind) =>
                option(kind, visualKindLabel(kind), visual.kind === kind),
              )
              .join("")}</select></label>`
      }
      ${stateFields}
    </article>
  </section>`;
}

function stateTextureGenerationMarkup(
  project: SymbolEditorProject,
  symbol: string,
): string {
  const actions: Array<[GeneratedSymbolStateTextureId, string]> = [
    ["spinBlur", "生成模糊图"],
    ["disabled", "生成 disable 图"],
  ];
  return `<section class="state-texture-generation"><div><strong>从 normal 图片生成</strong><small>完全在浏览器本地处理；每次只更新当前 symbol 的一个目标 state。</small></div><div class="button-row">${actions
    .map(([state, label]) => {
      const availability = getStateTextureGenerationAvailability(
        project,
        symbol,
        state,
      );
      return `<button type="button" data-generate-state-texture="${state}" ${availability.ready ? "" : "disabled"} title="${escapeAttr(availability.ready ? `输出 ${availability.targetKey}` : availability.reason)}">${label}</button>`;
    })
    .join("")}</div></section>`;
}

function stateNavItem(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  state: string,
  selected: boolean,
): string {
  const definition = project.stateDefinitions.find(
    (item) => item.id === state,
  )!;
  const visual = symbol.states.get(state)!;
  const stateStatus =
    symbol.valuePresentation && state === "normal"
      ? getTierNormalStatus(project, symbol)
      : getStateVisualStatus(project, visual);
  const label =
    stateStatus === "configured"
      ? "已配置"
      : stateStatus === "empty"
        ? "空"
        : stateStatus === "error"
          ? "错误"
          : "缺资源";
  return `<button class="state-nav-item ${selected ? "selected" : ""}" data-select-state="${escapeAttr(state)}" aria-pressed="${selected}"><strong>${escapeHtml(state)}</strong><small>${definition.phase}/${definition.playback}</small><span class="status-${stateStatus}">${label}</span></button>`;
}

function visualFieldsMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  state: string,
  visual: EditorStateVisual,
  thumbnail: (path: string) => string | undefined,
): string {
  if (visual.kind === "image")
    return resourceBindingMarkup(
      "Image",
      visual.imagePath,
      { kind: "state-image", symbol: symbol.symbol, state },
      thumbnail(visual.imagePath),
    );
  if (visual.kind === "spine") {
    const animations = assetMetadataList(
      project.assetLibrary.records.get(visual.skeletonPath),
      "animationNames",
    );
    return `${state === "normal" ? baseVisualMarkup(project, symbol, visual.baseVisual, thumbnail) : ""}
      ${resourceBindingMarkup("Skeleton", visual.skeletonPath, { kind: "spine-skeleton", symbol: symbol.symbol, state })}
      ${resourceBindingMarkup("Atlas", visual.atlasPath, { kind: "spine-atlas", symbol: symbol.symbol, state })}
      ${derivedResourceMarkup("Texture · 由 Atlas page 自动解析", visual.texturePath, thumbnail(visual.texturePath))}
      ${selectField("animationName", "Animation", visual.animationName, animations)}
      <details class="advanced-fields"><summary>Transform</summary><div class="form-grid">${numberField("transform.x", "X", visual.transform?.x ?? 0)}${numberField("transform.y", "Y", visual.transform?.y ?? 0)}${numberField("transform.scale", "Scale", visual.transform?.scale ?? 1)}</div></details>`;
  }
  if (visual.kind === "vni")
    return `${state === "normal" ? baseVisualMarkup(project, symbol, visual.baseVisual, thumbnail) : ""}${resourceBindingMarkup("VNI project", visual.projectPath, { kind: "vni-project", symbol: symbol.symbol, state })}<div class="form-grid">${numberField("startTime", "Start", visual.startTime)}${numberField("endTime", "End", visual.endTime)}</div>`;
  if (visual.kind === "composite")
    return compositeVisualMarkup(project, symbol, state, visual, thumbnail);
  if (visual.kind === "activeSpine")
    return selectField(
      "animationName",
      "Tier animation intersection",
      visual.animationName,
      activeSpineAnimationOptions(project, symbol),
    );
  if (visual.kind === "layered-image")
    return layeredImageMarkup(symbol.symbol, state, visual, false, thumbnail);
  if ("durationSeconds" in visual)
    return numberField(
      "durationSeconds",
      "Duration seconds",
      visual.durationSeconds,
    );
  if (visual.kind === "empty")
    return `<p class="empty">transparent ${visual.width} × ${visual.height}</p>`;
  return "";
}

function compositeVisualMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  state: string,
  visual: Extract<EditorStateVisual, { kind: "composite" }>,
  thumbnail: (path: string) => string | undefined,
): string {
  const base =
    state === "normal"
      ? baseVisualMarkup(project, symbol, visual.baseVisual, thumbnail)
      : `<section class="base-visual"><h3>Base visual</h3><label>来源 <select data-composite-base>${option("normal", "沿用 normal", visual.base === "normal")}${option("stateTexture", "当前 state 图片", visual.base === "stateTexture")}</select></label>${visual.base === "stateTexture" ? resourceBindingMarkup("State image", visual.stateTexturePath ?? "", { kind: "state-image", symbol: symbol.symbol, state }, thumbnail(visual.stateTexturePath ?? "")) : '<p class="empty">明确沿用 normal 图标。</p>'}</section>`;
  const layers = visual.layers
    .map((layer, index) => {
      const animation = layer.animation;
      const fields =
        animation.kind === "spine"
          ? (() => {
              const animations = assetMetadataList(
                project.assetLibrary.records.get(animation.skeletonPath),
                "animationNames",
              );
              return `${resourceBindingMarkup("Skeleton", animation.skeletonPath, { kind: "spine-skeleton", symbol: symbol.symbol, state, compositeLayerIndex: index })}${resourceBindingMarkup("Atlas", animation.atlasPath, { kind: "spine-atlas", symbol: symbol.symbol, state, compositeLayerIndex: index })}${derivedResourceMarkup("Texture · 由 Atlas page 自动解析", animation.texturePath, thumbnail(animation.texturePath))}<label>Animation <select data-composite-layer-field="animationName" data-composite-layer-index="${index}"><option value="">选择动画…</option>${animations.map((name) => option(name, name, name === animation.animationName)).join("")}</select></label><details class="advanced-fields"><summary>Transform</summary><div class="form-grid">${compositeNumberField(index, "transform.x", "X", animation.transform?.x ?? 0)}${compositeNumberField(index, "transform.y", "Y", animation.transform?.y ?? 0)}${compositeNumberField(index, "transform.scale", "Scale", animation.transform?.scale ?? 1)}</div></details>`;
            })()
          : `${resourceBindingMarkup("VNI project", animation.projectPath, { kind: "vni-project", symbol: symbol.symbol, state, compositeLayerIndex: index })}<div class="form-grid">${compositeNumberField(index, "startTime", "Start", animation.startTime)}${compositeNumberField(index, "endTime", "End", animation.endTime)}</div>`;
      return `<article class="layer-card composite-layer-card"><header><strong>Animation layer ${index + 1}</strong><div class="button-row"><button data-composite-layer-action="up" data-composite-layer-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button><button data-composite-layer-action="down" data-composite-layer-index="${index}" ${index === visual.layers.length - 1 ? "disabled" : ""}>↓</button><button data-composite-layer-action="remove" data-composite-layer-index="${index}" ${visual.layers.length === 1 ? "disabled" : ""}>删除</button></div></header><div class="form-grid"><label>Layer id <input data-composite-layer-field="id" data-composite-layer-index="${index}" value="${escapeAttr(layer.id)}"></label><label>位置 <select data-composite-layer-field="placement" data-composite-layer-index="${index}">${option("underlay", "图标下方", layer.placement === "underlay")}${option("overlay", "图标上方", layer.placement === "overlay")}</select></label><label>动画类型 <select data-composite-layer-field="kind" data-composite-layer-index="${index}">${option("spine", "Spine 4.3", animation.kind === "spine")}${option("vni", "VNI", animation.kind === "vni")}</select></label></div>${fields}</article>`;
    })
    .join("");
  return `${base}<section class="composite-layer-list"><div class="section-heading"><div><h3>附加动画层</h3><p>underlay 在图标下方，overlay 在图标上方；同组按列表顺序叠放。</p></div><button data-composite-layer-action="add">增加动画层</button></div>${layers}</section>`;
}

function compositeNumberField(
  index: number,
  field: string,
  label: string,
  value: number,
): string {
  return `<label>${label} <input data-composite-layer-field="${escapeAttr(field)}" data-composite-layer-index="${index}" type="number" step="0.01" value="${value}"></label>`;
}

function tierNormalAnimationMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const names = symbol.valuePresentation!.tiers.map(
    (tier) => tier.animation.playback.animationName,
  );
  const current = new Set(names).size === 1 ? (names[0] ?? "") : "";
  return `<label>Normal animation（全部档位） <select data-tier-normal-animation><option value="">选择共同动画…</option>${activeSpineAnimationOptions(
    project,
    symbol,
  )
    .map((name) => option(name, name, name === current))
    .join("")}</select></label>`;
}

function baseVisualMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  base: EditorBaseVisual | undefined,
  thumbnail: (path: string) => string | undefined,
): string {
  const visual = base ?? {
    kind: "empty",
    width: project.cellSize.width,
    height: project.cellSize.height,
  };
  return `<div class="base-visual"><h3>Normal base visual</h3><label>类型 <select data-base-kind>${["empty", "image", "layered-image"].map((kind) => option(kind, visualKindLabel(kind), visual.kind === kind)).join("")}</select></label>${visual.kind === "image" ? resourceBindingMarkup("Base image", visual.imagePath, { kind: "normal-base-image", symbol: symbol.symbol, state: "normal" }, thumbnail(visual.imagePath)) : visual.kind === "layered-image" ? layeredImageMarkup(symbol.symbol, "normal", visual, true, thumbnail) : `<p class="empty">显式 empty base visual</p>`}</div>`;
}

function layeredImageMarkup(
  symbol: string,
  state: string,
  visual: Extract<EditorStateVisual, { kind: "layered-image" }>,
  baseVisual: boolean,
  thumbnail: (path: string) => string | undefined,
): string {
  return `<div class="layer-list">${visual.layers.map((layer, layerIndex) => `<article class="layer-card"><header><strong>Layer ${layer.index}</strong><button data-layer-action="remove-layer" data-layer-index="${layerIndex}" data-base-visual="${baseVisual}">删除 layer</button></header>${resourceBindingMarkup("Texture", layer.texturePath, { kind: "layer-texture", symbol, state, layerIndex, baseVisual }, thumbnail(layer.texturePath))}${layer.keyframePaths.map((path, keyframeIndex) => `<div class="keyframe-row">${resourceBindingMarkup(`Keyframe ${keyframeIndex + 1}`, path, { kind: "layer-texture", symbol, state, layerIndex, keyframeIndex, baseVisual }, thumbnail(path))}<button data-layer-action="remove-keyframe" data-layer-index="${layerIndex}" data-keyframe-index="${keyframeIndex}" data-base-visual="${baseVisual}">删除 keyframe</button></div>`).join("")}<button data-layer-action="add-keyframe" data-layer-index="${layerIndex}" data-base-visual="${baseVisual}">增加 keyframe</button></article>`).join("")}<button data-layer-action="add-layer" data-base-visual="${baseVisual}">增加 layer</button></div>`;
}

function resourceBindingMarkup(
  label: string,
  path: string,
  context: ResourceBindingContext,
  thumbnail?: string,
): string {
  const serialized = escapeAttr(JSON.stringify(context));
  return `<div class="resource-binding"><span class="binding-label">${escapeHtml(label)}</span><span class="binding-thumb">${thumbnail ? `<img src="${escapeAttr(thumbnail)}" alt="">` : assetIcon(context.kind.includes("image") || context.kind.includes("texture") ? "image" : context.kind.includes("spine") ? "spine-skeleton" : "vni-project")}</span><span class="binding-path" title="${escapeAttr(path || "未选择")}">${escapeHtml(path || "未选择资源")}</span><button data-open-picker="${serialized}">${path ? "更换" : "选择"}</button><button data-clear-resource="${serialized}" ${path ? "" : "disabled"}>清除</button></div>`;
}

function derivedResourceMarkup(
  label: string,
  path: string,
  thumbnail?: string,
): string {
  return `<div class="resource-binding derived-resource"><span class="binding-label">${escapeHtml(label)}</span><span class="binding-thumb">${thumbnail ? `<img src="${escapeAttr(thumbnail)}" alt="">` : assetIcon("image")}</span><span class="binding-path" title="${escapeAttr(path || "等待 Atlas")}">${escapeHtml(path || "等待 Atlas")}</span></div>`;
}

function valueInspectorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  session: SymbolsEditorUiSession,
  thumbnail: (path: string) => string | undefined,
): string {
  const value = symbol.valuePresentation;
  if (!value)
    return `<section class="empty-feature"><h2>Spine 档位</h2><p>先按数值范围配置各档 Spine 资源，再到“状态”中为全部档位统一选择动画。</p><button class="primary" data-enable-value>启用 Spine 档位</button></section>`;
  return `<section class="value-editor"><div class="section-heading"><div><h2>Spine 档位</h2><p>每档只配置 skeleton / atlas / texture 与阈值；状态动画在下一步统一配置。</p></div><button data-disable-value>停用</button></div>
    <h3>Default values</h3><div class="compact-list">${value.defaultValues.map((candidate, index) => `<div class="form-row"><input data-value-field="defaultValues.${index}" data-value-type="number" type="number" min="1" step="1" value="${candidate}"><button data-value-action="move-default" data-value-index="${index}" data-direction="-1" aria-label="上移 value">↑</button><button data-value-action="move-default" data-value-index="${index}" data-direction="1" aria-label="下移 value">↓</button><button data-value-action="remove-default" data-value-index="${index}">删除</button></div>`).join("")}</div><div class="form-row"><input data-new-default type="number" min="1" step="1" value="1"><button data-value-action="add-default">增加 value</button></div>
    <h3>Reel normal</h3><div class="form-grid">${valueNumberField("reelStates.normal.width", value.reelStates.normal.width, "Width")}${valueNumberField("reelStates.normal.height", value.reelStates.normal.height, "Height")}</div>
    <h3>Spine tiers</h3><div class="tier-list">${value.tiers.map((tier, index) => valueTierMarkup(project, symbol, tier, index, session.expandedTier === index, thumbnail)).join("")}</div><button data-value-action="add-tier">增加 tier</button>
    <p class="hint">档位资源完成后，进入“状态”统一选择 normal / win / remove 等动画；静态模糊图在对应状态单独配置。</p>
    ${valueNumberPresentationMarkup(project, symbol)}
  </section>`;
}

function valueNumberPresentationMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const value = symbol.valuePresentation!;
  const modeButtons = `<div class="button-row"><button data-value-action="text-type" data-text-type="font">Font</button><button data-value-action="text-type" data-text-type="image">完整数值图片</button><button data-value-action="text-type" data-text-type="image-string">ImgNumber（共享节点）</button></div>`;
  if (value.text.type === "image-string") {
    const dependencies = [...project.imageStringDependencies.values()].sort(
      (left, right) => left.id.localeCompare(right.id, "en"),
    );
    const binding = value.text.tiers[0]!;
    const slots = valueSlotOptions(project, symbol);
    const ready =
      dependencies.length > 0 &&
      binding.resource === "./image-string.manifest.json" &&
      slots.includes(binding.slot);
    const dependencyOptions = [
      `<option value="" ${binding.resource ? "" : "selected"}>未选择 dependency</option>`,
      ...dependencies.map(() =>
        option(
          "./image-string.manifest.json",
          "image-string.manifest.json",
          binding.resource === "./image-string.manifest.json",
        ),
      ),
    ].join("");
    return `<section class="number-presentation"><h3>Number presentation</h3>${modeButtons}<p>所有 Spine 档位共用一个 ImgNumber dependency、共同 slot 和中心对齐配置；导出时按稳定 manifest schema 精确物化到每档。</p><article class="tier-card value-number-tier"><header><strong>共享 ImgNumber 节点</strong><span class="status-${ready ? "ready" : "missing"}">${ready ? "就绪" : "未完成"}</span></header><label>ImgNumber dependency <select data-shared-value-text-field="resource">${dependencyOptions}</select></label>${sharedValueSelectField("slot", binding.slot, slots, "全部档位共同 slot")}<div class="derived-field"><span>Alignment</span><strong>动态内容中心对齐</strong><small>字符串变长后仍以实际宽高中心对齐 Spine slot</small></div><div class="form-grid">${sharedValueNumberField("transform.x", binding.transform.x, "X")}${sharedValueNumberField("transform.y", binding.transform.y, "Y")}${sharedValueNumberField("transform.scale", binding.transform.scale, "Scale")}</div><label><input data-shared-value-text-field="followSlotColor" type="checkbox" ${binding.followSlotColor ? "checked" : ""}> Follow slot color</label></article></section>`;
  }
  const slots = valueSlotOptions(project, symbol);
  const common = `${valueSelectField("text.slot", value.text.slot, slots, "Slot intersection")}<div class="form-grid">${valueNumberField("text.x", value.text.x, "X")}${valueNumberField("text.y", value.text.y, "Y")}</div>`;
  if (value.text.type === "image") {
    const imageText = value.text;
    if ("images" in imageText) {
      const closure = value.defaultValues
        .map((candidate) => {
          const reference = imageText.images[String(candidate)] ?? "";
          const path = reference.replace(/^\.\//u, "");
          return `<small>${escapeHtml(reference || `${candidate} · 未映射`)} · ${path && project.assetLibrary.records.has(path) ? "已找到" : "缺失"}</small>`;
        })
        .join("");
      return `<section class="number-presentation"><h3>Number presentation</h3>${modeButtons}${common}<p>完整数值图片已物化为显式 content-addressed mapping。</p><div class="closure-list">${closure}</div></section>`;
    }
    const prefixes = [
      "./",
      ...new Set(
        assetsOfKind(project, "image").map(
          (path) =>
            `./${path.includes("/") ? `${path.slice(0, path.lastIndexOf("/") + 1)}` : ""}`,
        ),
      ),
    ];
    const closure = value.defaultValues
      .map((candidate) => {
        const path =
          imageText.prefix.replace(/^\.\//u, "") + candidate + ".png";
        return `<small>${escapeHtml(`${imageText.prefix}${candidate}.png`)} · ${project.assetLibrary.records.has(path) ? "已找到" : "缺失"}</small>`;
      })
      .join("");
    return `<section class="number-presentation"><h3>Number presentation</h3>${modeButtons}${common}${valueSelectField("text.prefix", imageText.prefix, prefixes, "Image prefix")}<div class="closure-list">${closure}</div></section>`;
  }
  return `<section class="number-presentation"><h3>Number presentation</h3>${modeButtons}${common}<div class="form-grid">${valueTextField("text.fontFamily", value.text.fontFamily, "Font family")}${valueNumberField("text.fontSize", value.text.fontSize, "Font size")}${valueTextField("text.fontWeight", value.text.fontWeight, "Font weight")}${valueTextField("text.fill", value.text.fill, "Fill")}${valueTextField("text.stroke", value.text.stroke, "Stroke")}${valueNumberField("text.strokeWidth", value.text.strokeWidth, "Stroke width")}</div></section>`;
}

function valueTierMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  tier: NonNullable<EditorSymbolDraft["valuePresentation"]>["tiers"][number],
  index: number,
  expanded: boolean,
  thumbnail: (path: string) => string | undefined,
): string {
  const skeleton = tier.animation.skeleton.replace(/^\.\//u, "");
  const atlas = tier.animation.atlas.replace(/^\.\//u, "");
  const texture = tier.animation.texture.replace(/^\.\//u, "");
  const ready = Boolean(skeleton && atlas && texture);
  return `<details class="tier-card" data-tier-index="${index}" ${expanded ? "open" : ""}><summary><strong>Tier ${index + 1}</strong><span>${index < (symbol.valuePresentation?.tiers.length ?? 0) - 1 ? `&lt; ${tier.maxExclusive}` : "unbounded"}</span><span class="status-${ready ? "ready" : "missing"}">${ready ? "资源就绪" : "未完成"}</span></summary><div class="tier-body">${index < symbol.valuePresentation!.tiers.length - 1 ? valueNumberField(`tiers.${index}.maxExclusive`, tier.maxExclusive!, "maxExclusive") : '<p class="empty">最终 tier 无上界</p>'}${resourceBindingMarkup("Skeleton", skeleton, { kind: "value-tier-resource", symbol: symbol.symbol, tierIndex: index, field: "skeleton" })}${resourceBindingMarkup("Atlas", atlas, { kind: "value-tier-resource", symbol: symbol.symbol, tierIndex: index, field: "atlas" })}${derivedResourceMarkup("Texture · 由 Atlas page 自动解析", texture, thumbnail(texture))}<details class="advanced-fields"><summary>Transform</summary><div class="form-grid">${valueNumberField(`tiers.${index}.animation.transform.x`, tier.animation.transform?.x ?? 0, "X")}${valueNumberField(`tiers.${index}.animation.transform.y`, tier.animation.transform?.y ?? 0, "Y")}${valueNumberField(`tiers.${index}.animation.transform.scale`, tier.animation.transform?.scale ?? 1, "Scale")}</div></details><div class="button-row"><button data-value-action="move-tier" data-value-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button data-value-action="move-tier" data-value-index="${index}" data-direction="1" ${index === symbol.valuePresentation!.tiers.length - 1 ? "disabled" : ""}>↓</button><button data-value-action="remove-tier" data-value-index="${index}">删除 tier</button></div></div></details>`;
}

function cascadeInspectorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const cascade = symbol.cascadeWinPresentation;
  const mode = cascade?.playback.mode ?? "";
  let fields = "";
  if (cascade) {
    fields += `<label>Order <input data-cascade-field="order" type="number" min="0" step="1" value="${cascade.order}"></label>`;
    for (const [field, value] of Object.entries(cascade.playback)) {
      if (field === "mode") continue;
      const expected = field === "loopState" ? "loop" : "once";
      fields += `<label>${escapeHtml(field)} <select data-cascade-field="${escapeAttr(field)}">${compatibleStates(
        project,
        symbol,
        expected,
      )
        .map((state) => option(state, state, state === value))
        .join("")}</select></label>`;
    }
    fields += `<div class="derived-field"><span>Summary mode</span><strong>${cascade.summary.mode}</strong><small>由 playback mode 派生</small></div>`;
  }
  return `<section class="cascade-editor"><h2>Cascade presentation</h2><p>只编辑 manifest 编排；右侧预览仍只播放单一 state。</p><label>Mode <select data-cascade-mode><option value="" ${!mode ? "selected" : ""}>未启用</option>${option("group", "group", mode === "group")}${option("sequentialCollect", "sequentialCollect", mode === "sequentialCollect")}</select></label>${mode ? fields : '<div class="empty-feature"><p>选择 mode 后显示其所需字段；候选受 state lifecycle 约束。</p></div>'}</section>`;
}

function projectWorkspaceMarkup(project: SymbolEditorProject): string {
  return `<section class="project-config"><div class="section-heading"><div><h1>项目配置</h1><p>全局内容独立于单个 symbol Inspector。</p></div></div><div class="form-grid"><label>Package / project id <input data-project-id data-focus-key="project-id" value="${escapeAttr(project.id)}"></label><label>Cell width <input data-cell-width type="number" min="1" value="${project.cellSize.width}"></label><label>Cell height <input data-cell-height type="number" min="1" value="${project.cellSize.height}"></label></div>
    <h2>项目状态定义</h2><div class="definition-list">${project.stateDefinitions.map((item) => `<div class="definition-row"><code>${escapeHtml(item.id)}</code><small>${item.phase} / ${item.playback}</small><span>${item.source === "custom" ? "Custom" : "Built-in"}</span>${item.source === "custom" ? `<button data-remove-custom="${escapeAttr(item.id)}">删除</button>` : ""}</div>`).join("")}</div><div class="form-row add-definition"><input data-custom-id placeholder="custom state id"><select data-custom-lifecycle><option value="once">once / once</option><option value="loop">stable / loop</option></select><button class="primary" data-add-custom>增加 custom state</button></div>
    <details class="advanced-summary"><summary>Legacy 导入兼容数据</summary><p>这些字段只为无损 round-trip 保留，不是现代 state texture 生成配置。</p><pre>${escapeHtml(JSON.stringify({ textureStateOrder: project.legacyTextureStateOrder, settings: project.legacyStateSettings }, null, 2))}</pre></details>
    <details class="advanced-summary"><summary>高级导出摘要</summary><dl class="summary-grid"><div><dt>Game config</dt><dd>${escapeHtml(project.gameConfigFileName)}</dd></div><div><dt>Symbols</dt><dd>${project.symbols.size}</dd></div><div><dt>Included</dt><dd>${getIncludedSymbols(project).length}</dd></div><div><dt>Library resources</dt><dd>${project.assetLibrary.records.size}</dd></div></dl><p>UI Tab、筛选、选择和展开状态不进入 ZIP。</p></details>
  </section>`;
}

function resourcePickerMarkup(
  context: ResourceBindingContext,
  query: string,
  selectedPath: string | undefined,
  candidates: ReturnType<typeof getResourcePickerCandidates>,
  thumbnail: (path: string) => string | undefined,
): string {
  const selectedReady = candidates.some(
    (candidate) =>
      candidate.path === selectedPath && candidate.status === "ready",
  );
  const uploadAndUse =
    context.kind === "state-image" && isGeneratedStateTextureId(context.state);
  return `<form method="dialog" class="picker-shell" onsubmit="return false"><header><div><small>选择兼容资源</small><h2>${escapeHtml(getResourceBindingLabel(context))}</h2></div><button type="button" data-picker-cancel aria-label="关闭资源 Picker">×</button></header><div class="picker-toolbar"><input data-picker-query type="search" placeholder="搜索资源 path" value="${escapeAttr(query)}"><button type="button" data-picker-upload>${uploadAndUse ? "上传并使用" : "上传新资源"}</button></div><p class="hint">${uploadAndUse ? "单图通过同名审查后直接绑定当前 state；后一次成功操作生效。" : "上传只刷新候选，不会自动绑定。"}</p><div class="picker-list">${candidates.map((candidate) => `<button type="button" class="picker-row ${candidate.path === selectedPath ? "selected" : ""}" data-picker-candidate="${escapeAttr(candidate.path)}" ${candidate.status === "error" ? "disabled" : ""}><span class="asset-thumb">${thumbnail(candidate.path) ? `<img src="${escapeAttr(thumbnail(candidate.path)!)}" alt="">` : assetIcon(candidate.kind)}</span><span class="asset-main"><span class="path">${escapeHtml(candidate.path)}</span><small>${escapeHtml(candidate.summary)}</small>${candidate.disabledReason ? `<small class="inline-error">${escapeHtml(candidate.disabledReason)}</small>` : ""}</span><span>${candidate.path === selectedPath ? "当前选择" : candidate.status === "ready" ? "可用" : "错误"}</span></button>`).join("") || '<p class="empty">没有兼容资源。</p>'}</div><footer><button type="button" data-picker-cancel>取消</button><button type="button" class="primary" data-picker-confirm ${selectedReady ? "" : "disabled"}>确认绑定</button></footer></form>`;
}

function createPreviewCells(
  project: SymbolEditorProject,
  state: string,
  previewValue: number,
  previewTexts: ReadonlyMap<string, string> = new Map(),
): readonly SymbolPreviewCell[] {
  return getIncludedSymbols(project).map((symbol) => {
    const visual = symbol.states.get(state);
    if (!visual)
      return { symbol: symbol.symbol, code: symbol.code, status: "missing" };
    if (
      (visual.kind === "empty" || visual.kind === "empty-state") &&
      !(state === "normal" && symbol.valuePresentation)
    )
      return { symbol: symbol.symbol, code: symbol.code, status: "empty" };
    const status = getSymbolResourceStatus(project, symbol.symbol);
    if (!status.ready)
      return {
        symbol: symbol.symbol,
        code: symbol.code,
        status: "error",
        message: status.error ?? status.missing.join(", "),
      };
    return {
      symbol: symbol.symbol,
      code: symbol.code,
      status: "configured",
      ...(symbol.valuePresentation ? { value: previewValue } : {}),
      ...(symbol.imageStringNodes.length > 0
        ? {
            imageStringTexts: Object.freeze(
              Object.fromEntries(
                symbol.imageStringNodes.map((node) => [
                  node.name,
                  previewTexts.get(`${symbol.symbol}\u0000${node.name}`) ??
                    node.initialText,
                ]),
              ),
            ),
          }
        : {}),
    };
  });
}

function compatibleVisualKinds(
  symbol: EditorSymbolDraft,
  state: string,
): readonly string[] {
  if (state === "normal")
    return ["empty", "image", "layered-image", "spine", "vni", "composite"];
  const kinds = ["empty-state", "image", "spine", "vni", "composite", "static"];
  if (state === "appear" || state === "win") kinds.push("builtin");
  if (symbol.valuePresentation) kinds.push("activeSpine");
  return kinds;
}

function defaultVisualForKind(
  project: SymbolEditorProject,
  symbolName: string,
  state: string,
  kind: string,
): EditorStateVisual {
  if (kind === "empty")
    return {
      kind,
      width: project.cellSize.width,
      height: project.cellSize.height,
    };
  if (kind === "empty-state") return { kind, durationSeconds: 1 / 60 };
  if (kind === "image") return { kind, imagePath: "" };
  if (kind === "layered-image")
    return { kind, layers: [{ index: 0, texturePath: "", keyframePaths: [] }] };
  if (kind === "spine") {
    const atlasBinding = getDefaultSpineAtlasBinding(project);
    return {
      kind,
      ...(state === "normal"
        ? {
            baseVisual: {
              kind: "empty",
              width: project.cellSize.width,
              height: project.cellSize.height,
            } as EditorBaseVisual,
          }
        : {}),
      skeletonPath: "",
      atlasPath: atlasBinding?.atlasPath ?? "",
      texturePath: atlasBinding?.texturePath ?? "",
      animationName: "",
    };
  }
  if (kind === "vni")
    return {
      kind,
      ...(state === "normal"
        ? {
            baseVisual: {
              kind: "empty",
              width: project.cellSize.width,
              height: project.cellSize.height,
            } as EditorBaseVisual,
          }
        : {}),
      projectPath: "",
      startTime: 0,
      endTime: 1,
    };
  if (kind === "activeSpine")
    return {
      kind,
      animationName:
        activeSpineAnimationOptions(
          project,
          project.symbols.get(symbolName),
        )[0] ?? "",
    };
  if (kind === "composite") {
    const current = project.symbols.get(symbolName)?.states.get(state);
    const baseVisual: EditorBaseVisual =
      state === "normal"
        ? current?.kind === "spine" || current?.kind === "vni"
          ? (current.baseVisual ?? {
              kind: "empty",
              width: project.cellSize.width,
              height: project.cellSize.height,
            })
          : current?.kind === "composite"
            ? (current.baseVisual ?? {
                kind: "empty",
                width: project.cellSize.width,
                height: project.cellSize.height,
              })
            : current?.kind === "image" ||
                current?.kind === "layered-image" ||
                current?.kind === "empty"
              ? current
              : {
                  kind: "empty",
                  width: project.cellSize.width,
                  height: project.cellSize.height,
                }
        : {
            kind: "empty",
            width: project.cellSize.width,
            height: project.cellSize.height,
          };
    const atlas = getDefaultSpineAtlasBinding(project);
    return {
      kind: "composite",
      base: "normal",
      ...(state === "normal" ? { baseVisual } : {}),
      layers: [
        {
          id: "layer-1",
          placement: "overlay",
          animation: {
            kind: "spine",
            skeletonPath: "",
            atlasPath: atlas?.atlasPath ?? "",
            texturePath: atlas?.texturePath ?? "",
            animationName: "",
          },
        },
      ],
    };
  }
  if (kind === "builtin")
    return { kind, durationSeconds: state === "win" ? 0.58 : 0.42 };
  return { kind: "static", durationSeconds: 1 / 60 };
}

function compatibleStates(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  playback: string,
): readonly string[] {
  return symbol.stateOrder.filter((state) => {
    const definition = project.stateDefinitions.find(
      (item) => item.id === state,
    );
    const visual = symbol.states.get(state);
    return (
      definition?.playback === playback &&
      visual !== undefined &&
      (playback !== "loop" ||
        visual.kind === "vni" ||
        visual.kind === "spine" ||
        visual.kind === "composite" ||
        visual.kind === "activeSpine")
    );
  });
}

function createEmptyValuePresentation(project: SymbolEditorProject) {
  const atlasBinding = getDefaultSpineAtlasBinding(project);
  return {
    defaultValues: [1],
    reelStates: {
      normal: {
        kind: "transparent" as const,
        width: project.cellSize.width,
        height: project.cellSize.height,
      },
      states: {},
    },
    tiers: [
      {
        animation: {
          kind: "spine" as const,
          skeleton: "",
          atlas: atlasBinding ? `./${atlasBinding.atlasPath}` : "",
          texture: atlasBinding ? `./${atlasBinding.texturePath}` : "",
          playback: {
            mode: "animation" as const,
            animationName: "",
            loop: true as const,
          },
        },
      },
    ],
    text: {
      type: "font" as const,
      slot: "",
      x: 0,
      y: 0,
      fontFamily: "Arial",
      fontSize: 24,
      fontWeight: "700",
      fill: "#ffffff",
      stroke: "#000000",
      strokeWidth: 1,
    },
  };
}

function createEmptyValueImageStringBinding() {
  return {
    resource: "",
    slot: "",
    anchor: { x: 0.5, y: 0.5 },
    transform: { x: 0, y: 0, scale: 1 },
    followSlotColor: true,
  };
}

function activeSpineAnimationOptions(
  project: SymbolEditorProject,
  symbol?: EditorSymbolDraft,
): readonly string[] {
  const sets = (symbol?.valuePresentation?.tiers ?? []).map(
    (tier) =>
      new Set(
        assetMetadataList(
          project.assetLibrary.records.get(
            tier.animation.skeleton.replace(/^\.\//u, ""),
          ),
          "animationNames",
        ),
      ),
  );
  if (!sets.length) return [];
  return [...sets[0]!].filter((name) => sets.every((set) => set.has(name)));
}

function valueSlotOptions(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): readonly string[] {
  const sets = (symbol.valuePresentation?.tiers ?? []).map(
    (tier) =>
      new Set(
        assetMetadataList(
          project.assetLibrary.records.get(
            tier.animation.skeleton.replace(/^\.\//u, ""),
          ),
          "slotNames",
        ),
      ),
  );
  if (!sets.length) return [];
  return [...sets[0]!].filter((name) => sets.every((set) => set.has(name)));
}

function getCurrentResourcePath(
  project: SymbolEditorProject,
  context: ResourceBindingContext,
): string {
  const symbol = project.symbols.get(context.symbol)!;
  if (context.kind === "value-tier-resource")
    return symbol.valuePresentation!.tiers[context.tierIndex]!.animation[
      context.field
    ].replace(/^\.\//u, "");
  const visual = symbol.states.get(context.state)!;
  if (context.kind === "state-image")
    return visual.kind === "image"
      ? visual.imagePath
      : visual.kind === "composite"
        ? (visual.stateTexturePath ?? "")
        : "";
  if (context.kind === "normal-base-image")
    return (visual.kind === "spine" ||
      visual.kind === "vni" ||
      visual.kind === "composite") &&
      visual.baseVisual?.kind === "image"
      ? visual.baseVisual.imagePath
      : "";
  if (
    (context.kind === "spine-skeleton" ||
      context.kind === "spine-atlas" ||
      context.kind === "vni-project") &&
    visual.kind === "composite" &&
    context.compositeLayerIndex !== undefined
  ) {
    const animation = visual.layers[context.compositeLayerIndex]?.animation;
    if (context.kind === "spine-skeleton")
      return animation?.kind === "spine" ? animation.skeletonPath : "";
    if (context.kind === "spine-atlas")
      return animation?.kind === "spine" ? animation.atlasPath : "";
    return animation?.kind === "vni" ? animation.projectPath : "";
  }
  if (context.kind === "spine-skeleton")
    return visual.kind === "spine" ? visual.skeletonPath : "";
  if (context.kind === "spine-atlas")
    return visual.kind === "spine" ? visual.atlasPath : "";
  if (context.kind === "vni-project")
    return visual.kind === "vni" ? visual.projectPath : "";
  const source =
    context.baseVisual &&
    (visual.kind === "spine" ||
      visual.kind === "vni" ||
      visual.kind === "composite")
      ? visual.baseVisual
      : visual;
  if (source?.kind !== "layered-image") return "";
  const layer = source.layers[context.layerIndex];
  return context.keyframeIndex === undefined
    ? (layer?.texturePath ?? "")
    : (layer?.keyframePaths[context.keyframeIndex] ?? "");
}

function groupAssets(
  project: SymbolEditorProject,
  records: readonly EditorAssetRecord[],
  mode: string,
): Array<[string, EditorAssetRecord[]]> {
  if (mode !== "kind") {
    return [...project.assetLibrary.batches]
      .reverse()
      .map(
        (batch) =>
          [
            `${batch.label} · ${batch.id}`,
            records.filter((record) => record.uploadBatchId === batch.id),
          ] as [string, EditorAssetRecord[]],
      )
      .filter(([, group]) => group.length > 0);
  }
  const map = new Map<string, EditorAssetRecord[]>();
  for (const record of records) {
    const group = map.get(record.kind) ?? [];
    group.push(record);
    map.set(record.kind, group);
  }
  return [...map.entries()];
}

function getStateVisualStatus(
  project: SymbolEditorProject,
  visual: EditorStateVisual,
): "empty" | "configured" | "missing" | "error" {
  if (visual.kind === "empty" || visual.kind === "empty-state") return "empty";
  if (visual.kind === "static" || visual.kind === "builtin")
    return "configured";
  if (visual.kind === "activeSpine")
    return visual.animationName ? "configured" : "missing";
  const paths: string[] = [];
  if (visual.kind === "image") paths.push(visual.imagePath);
  else if (visual.kind === "layered-image") {
    for (const layer of visual.layers)
      paths.push(layer.texturePath, ...layer.keyframePaths);
  } else if (visual.kind === "spine") {
    paths.push(visual.skeletonPath, visual.atlasPath, visual.texturePath);
    if (!visual.animationName) return "missing";
    collectBaseVisualPaths(visual.baseVisual, paths);
  } else if (visual.kind === "vni") {
    paths.push(visual.projectPath);
    collectBaseVisualPaths(visual.baseVisual, paths);
  } else if (visual.kind === "composite") {
    if (visual.layers.length === 0) return "missing";
    if (visual.base === "stateTexture")
      paths.push(visual.stateTexturePath ?? "");
    else collectBaseVisualPaths(visual.baseVisual, paths);
    for (const layer of visual.layers) {
      if (!layer.id) return "missing";
      if (layer.animation.kind === "spine") {
        paths.push(
          layer.animation.skeletonPath,
          layer.animation.atlasPath,
          layer.animation.texturePath,
        );
        if (!layer.animation.animationName) return "missing";
      } else paths.push(layer.animation.projectPath);
    }
  }
  if (paths.length === 0 || paths.some((path) => !path)) return "missing";
  for (const path of paths) {
    const record = project.assetLibrary.records.get(path);
    if (!record) return "missing";
    if (record.diagnostics.length > 0) return "error";
  }
  return "configured";
}

function getTierNormalStatus(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): "configured" | "missing" | "error" {
  const tiers = symbol.valuePresentation?.tiers ?? [];
  if (tiers.length === 0) return "missing";
  const names = new Set(
    tiers.map((tier) => tier.animation.playback.animationName),
  );
  if (names.size !== 1 || !tiers[0]!.animation.playback.animationName)
    return "missing";
  for (const tier of tiers) {
    for (const path of [
      tier.animation.skeleton,
      tier.animation.atlas,
      tier.animation.texture,
    ]) {
      const record = project.assetLibrary.records.get(
        path.replace(/^\.\//u, ""),
      );
      if (!record) return "missing";
      if (record.diagnostics.length > 0) return "error";
    }
  }
  return "configured";
}

function collectBaseVisualPaths(
  visual: EditorBaseVisual | undefined,
  paths: string[],
): void {
  if (!visual || visual.kind === "empty") return;
  if (visual.kind === "image") paths.push(visual.imagePath);
  else {
    for (const layer of visual.layers)
      paths.push(layer.texturePath, ...layer.keyframePaths);
  }
}

function assetsOfKind(
  project: SymbolEditorProject,
  kind: EditorAssetRecord["kind"],
): string[] {
  return [...project.assetLibrary.records.values()]
    .filter((record) => record.kind === kind && !record.diagnostics.length)
    .map((record) => record.path)
    .sort((left, right) => left.localeCompare(right, "en"));
}

function assetMetadataList(
  record: EditorAssetRecord | undefined,
  key: string,
): readonly string[] {
  const value = record?.metadata?.[key];
  return Array.isArray(value) ? (value as string[]) : [];
}

function tabMarkup(
  id: string,
  label: string,
  active: boolean,
  group: string,
): string {
  return `<button id="${group}-tab-${id}" role="tab" aria-selected="${active}" aria-controls="${group}-${id}" tabindex="${active ? "0" : "-1"}" data-focus-key="${group}-tab-${id}" data-${group}-tab data-tab-value="${id}">${label}</button>`;
}

function selectField(
  field: string,
  label: string,
  current: string,
  values: readonly string[],
): string {
  return `<label>${escapeHtml(label)} <select data-visual-field="${escapeAttr(field)}"><option value="">选择…</option>${values.map((value) => option(value, value, value === current)).join("")}</select></label>`;
}

function numberField(field: string, label: string, value: number): string {
  return `<label>${escapeHtml(label)} <input data-visual-number="${escapeAttr(field)}" type="number" step="0.01" value="${value}"></label>`;
}

function valueNumberField(field: string, value: number, label: string): string {
  return `<label>${escapeHtml(label)} <input data-value-field="${escapeAttr(field)}" data-value-type="number" type="number" step="0.01" value="${value}"></label>`;
}

function valueTextField(field: string, value: string, label: string): string {
  return `<label>${escapeHtml(label)} <input data-value-field="${escapeAttr(field)}" value="${escapeAttr(value)}"></label>`;
}

function valueSelectField(
  field: string,
  current: string,
  values: readonly string[],
  label: string,
): string {
  return `<label>${escapeHtml(label)} <select data-value-field="${escapeAttr(field)}"><option value="">选择…</option>${values.map((value) => option(value, value, value === current)).join("")}</select></label>`;
}

function sharedValueSelectField(
  field: string,
  current: string,
  values: readonly string[],
  label: string,
): string {
  return `<label>${escapeHtml(label)} <select data-shared-value-text-field="${escapeAttr(field)}"><option value="">选择…</option>${values.map((value) => option(value, value, value === current)).join("")}</select></label>`;
}

function sharedValueNumberField(
  field: string,
  value: number,
  label: string,
): string {
  return `<label>${escapeHtml(label)} <input data-shared-value-text-field="${escapeAttr(field)}" type="number" step="0.01" value="${value}"></label>`;
}

function setObjectPath(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".");
  let current: Record<string | number, unknown> = target;
  for (const segment of segments.slice(0, -1)) {
    const key = /^\d+$/u.test(segment) ? Number(segment) : segment;
    let next = current[key];
    if (!next || typeof next !== "object") {
      next = {};
      current[key] = next;
    }
    current = next as Record<string | number, unknown>;
  }
  const last = segments.at(-1)!;
  current[/^\d+$/u.test(last) ? Number(last) : last] = value;
}

function moveArrayItem<T>(items: T[], index: number, direction: number): void {
  const next = index + direction;
  if (index < 0 || next < 0 || next >= items.length) return;
  [items[index], items[next]] = [items[next]!, items[index]!];
}

function selectOptions(
  options: ReadonlyArray<readonly [string, string]>,
  selected: string,
): string {
  return options
    .map(([value, label]) => option(value, label, value === selected))
    .join("");
}

function option(value: string, label: string, selected = false): string {
  return `<option value="${escapeAttr(value)}" ${selected ? "selected" : ""}>${escapeHtml(label)}</option>`;
}

function visualKindLabel(kind: string): string {
  return (
    (
      {
        empty: "空（transparent normal）",
        "empty-state": "空（显式 state）",
        image: "图片",
        "layered-image": "分层图片",
        spine: "Spine 4.3",
        vni: "VNI",
        static: "Static",
        builtin: "Builtin",
        activeSpine: "Active Spine",
        composite: "多图层动画",
        missing: "未配置",
      } as Record<string, string>
    )[kind] ?? kind
  );
}

function assetIcon(kind: string): string {
  if (kind === "image") return "IMG";
  if (kind.startsWith("spine")) return "SPN";
  if (kind.startsWith("vni")) return "VNI";
  if (kind.includes("json")) return "JSON";
  return "FILE";
}

function metadataSummary(record: EditorAssetRecord): string {
  const animations = assetMetadataList(record, "animationNames");
  const slots = assetMetadataList(record, "slotNames");
  const pages = assetMetadataList(record, "pageNames");
  return [
    animations.length ? `${animations.length} animations` : "",
    slots.length ? `${slots.length} slots` : "",
    pages.length ? `${pages.length} atlas pages` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KiB`;
  return `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function metadataList(record: EditorAssetRecord, key: string): string[] {
  const value = record.metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function parseContext(value: string): ResourceBindingContext {
  return JSON.parse(value) as ResourceBindingContext;
}

function escapeHtml(value: unknown): string {
  return String(value).replace(
    /[&<>"']/gu,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
  );
}

function escapeAttr(value: unknown): string {
  return escapeHtml(value).replace(/`/gu, "&#96;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
