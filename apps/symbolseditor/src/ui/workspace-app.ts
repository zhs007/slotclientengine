import { createSymbolPackageResource } from "@slotclientengine/rendercore/symbol";
import {
  createBoundedSourceIndex,
  ephemeralContentFingerprint,
} from "@slotclientengine/browserartifactio";
import {
  addCustomStateDefinition,
  addSymbolState,
  createFromGameConfig,
  cloneSymbolEditorProject,
  createPreviewSnapshot,
  deleteAsset,
  exportSnapshot,
  getAssetReferences,
  getIncludedSymbols,
  getSymbolResourceStatus,
  moveSymbolState,
  removeCustomStateDefinition,
  removeSymbolState,
  replaceAsset,
  setAllSymbolsIncluded,
  setCascadeWinPresentation,
  setStateVisual,
  setSymbolIncluded,
  setSymbolRenderPriority,
  setSymbolScale,
  setValuePresentation,
  installImageStringDependency,
  removeImageStringDependency,
  setSymbolImageStringNodes,
  uploadAssetBatch,
  type EditorAssetRecord,
  type EditorBaseVisual,
  type EditorStateVisual,
  type EditorSymbolDraft,
  type SymbolEditorProject,
} from "../model/editor-project.js";
import { importImageStringDependencyZip } from "../io/image-string-dependency.js";
import {
  SymbolEditorStore,
  type SymbolEditorStoreSnapshot,
} from "../model/editor-store.js";
import {
  createSnapshotFiles,
  exportSymbolPackageZip,
  importSymbolPackageZip,
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

interface ThumbnailEntry {
  readonly fingerprint: string;
  readonly url: string;
}

export class SymbolsEditorApp {
  readonly #root: HTMLElement;
  readonly #store = new SymbolEditorStore();
  readonly #session = new SymbolsEditorUiSession();
  readonly #thumbnails = new Map<string, ThumbnailEntry>();
  readonly #scrollPositions = new Map<string, number>();
  #preview: SymbolEditorPreview | null = null;
  #unsubscribe: (() => void) | null = null;
  #previewRequest = 0;
  #replacePath: string | null = null;
  #replaceImageStringId: string | null = null;
  #previewValue = 1;
  #pickerTrigger: HTMLElement | null = null;
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingFocusKey = "";
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
    this.requireElement("[data-import]").addEventListener("click", () =>
      this.requireInput("[data-import-input]").click(),
    );
    this.requireElement("[data-upload]").addEventListener("click", () =>
      this.requireInput("[data-upload-input]").click(),
    );
    this.requireElement("[data-upload-directory]").addEventListener(
      "click",
      () => this.requireInput("[data-directory-input]").click(),
    );
    this.requireElement("[data-import-image-string]").addEventListener(
      "click",
      () => this.requireInput("[data-image-string-input]").click(),
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
    this.requireElement("[data-import-input]").addEventListener(
      "change",
      (event) =>
        void this.importPackage(event.currentTarget as HTMLInputElement),
    );
    for (const selector of ["[data-upload-input]", "[data-directory-input]"]) {
      this.requireElement(selector).addEventListener(
        "change",
        (event) =>
          void this.uploadResources(event.currentTarget as HTMLInputElement),
      );
    }
    this.requireElement("[data-replace-input]").addEventListener(
      "change",
      (event) =>
        void this.replaceResource(event.currentTarget as HTMLInputElement),
    );
    this.requireElement("[data-image-string-input]").addEventListener(
      "change",
      (event) =>
        void this.importImageStringDependency(
          event.currentTarget as HTMLInputElement,
        ),
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
      this.requireElement("[data-upload-directory]"),
      this.requireElement("[data-import-image-string]"),
    ] as HTMLButtonElement[];
    if (!snapshot.project) {
      panel.innerHTML = `<div class="start-state"><h1>建立 Symbols 项目</h1><p>上传公开 gameconfig.json，或导入已有 symbols ZIP。</p></div>`;
      errors.textContent = "";
      exportButton.disabled = true;
      uploadButtons.forEach((button) => (button.disabled = true));
      this.requireElement("[data-preview-state]").innerHTML =
        "<option>normal</option>";
      this.#preview?.clearResource();
      this.closePicker(false);
      return;
    }
    uploadButtons.forEach((button) => (button.disabled = false));
    const project = snapshot.project;
    this.#session.normalize(project);
    this.reconcileThumbnails(project);
    panel.innerHTML = workspaceMarkup(project, this.#session, (path) =>
      this.thumbnailUrl(project, path),
    );
    errors.replaceChildren(
      ...snapshot.diagnostics.map((message) =>
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
        this.requireInput("[data-image-string-input]").click(),
      );
    panel
      .querySelectorAll<HTMLElement>("[data-replace-image-string]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#replaceImageStringId = button.dataset.replaceImageString!;
          this.requireInput("[data-image-string-input]").click();
        });
      });
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
      .querySelectorAll<HTMLElement>("[data-replace-asset]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#replacePath = button.dataset.replaceAsset!;
          this.requireInput("[data-replace-input]").click();
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
        if (visual.kind !== "spine" && visual.kind !== "vni") return;
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
          isBase && (visual.kind === "spine" || visual.kind === "vni")
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
          isBase && (visual.kind === "spine" || visual.kind === "vni")
            ? { ...visual, baseVisual: layered }
            : layered,
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
                target: { state: "", slot: "" },
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
              if (field === "target.state") {
                setObjectPath(
                  node as unknown as Record<string, unknown>,
                  "target",
                  { state: String(value), slot: "" },
                );
              } else {
                setObjectPath(
                  node as unknown as Record<string, unknown>,
                  field,
                  value,
                );
              }
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
              createEmptyValueImageStringBinding(),
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
      ?.addEventListener("click", () =>
        this.requireInput("[data-upload-input]").click(),
      );
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

  private async importPackage(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const imported = await importSymbolPackageZip(
        new Uint8Array(await file.arrayBuffer()),
        {
          loadTextures: false,
        },
      );
      try {
        this.#session.resetForImport(imported.project);
        this.#store.replace(imported.project);
        this.showSuccess("Symbols ZIP 已导入");
      } finally {
        imported.destroy();
      }
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadResources(input: HTMLInputElement): Promise<void> {
    const files = [...(input.files ?? [])];
    input.value = "";
    if (files.length === 0) return;
    try {
      createBoundedSourceIndex(files, {
        maxEntries: 4096,
        maxFileBytes: 50 * 1024 * 1024,
        maxTotalBytes: 500 * 1024 * 1024,
      });
      if (files.length === 1 && files[0]!.name.toLowerCase().endsWith(".zip")) {
        const dependency = await importImageStringDependencyZip(
          new Uint8Array(await files[0]!.arrayBuffer()),
        );
        this.#store.transact((draft) =>
          installImageStringDependency(draft, dependency),
        );
        this.showSuccess(
          `已识别并安装 image-string ${dependency.id}；尚未自动绑定。`,
        );
        this.render(this.#store.getSnapshot());
        return;
      }
      const values = await Promise.all(
        files.map(async (file) => ({
          path: file.webkitRelativePath || file.name,
          bytes: new Uint8Array(await file.arrayBuffer()),
        })),
      );
      const current = this.#store.getSnapshot().project;
      if (!current) throw new Error("请先创建或导入项目。");
      const candidate = cloneSymbolEditorProject(current);
      const batchId = uploadAssetBatch(candidate, values);
      const batch = candidate.assetLibrary.batches.find(
        (item) => item.id === batchId,
      )!;
      const records = batch.paths.map(
        (path) => candidate.assetLibrary.records.get(path)!,
      );
      validateResourceDiscovery(records);
      if (!confirmSymbolImportReview(records, files)) return;
      this.#store.replace(candidate);
      this.showSuccess(`已上传 ${files.length} 个资源；尚未自动绑定`);
      this.render(this.#store.getSnapshot());
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async importImageStringDependency(
    input: HTMLInputElement,
  ): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const dependency = await importImageStringDependencyZip(
        new Uint8Array(await file.arrayBuffer()),
      );
      const replaceId = this.#replaceImageStringId;
      this.#replaceImageStringId = null;
      if (replaceId && replaceId !== dependency.id) {
        throw new Error(
          `替换 dependency id 必须保持 ${replaceId}，实际为 ${dependency.id}。`,
        );
      }
      this.#store.transact((draft) =>
        installImageStringDependency(
          draft,
          dependency,
          replaceId ? "replace" : "import",
        ),
      );
      this.showSuccess(`已导入 ImgNumber dependency：${dependency.id}`);
    } catch (error) {
      this.#replaceImageStringId = null;
      this.#store.setExternalError(error);
    }
  }

  private async replaceResource(input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    const path = this.#replacePath;
    this.#replacePath = null;
    if (!file || !path) return;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      this.#store.transact((draft) => replaceAsset(draft, path, bytes));
      this.showSuccess(`已替换 ${path}`);
    } catch (error) {
      this.#store.setExternalError(error);
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
    if (!previewSnapshot) {
      await this.#preview.setResource(null, cells, this.#session.previewState);
      return;
    }
    try {
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
      this.updateZoom(this.#preview.getZoom());
    } catch {
      if (request === this.#previewRequest)
        await this.#preview.setResource(
          null,
          cells,
          this.#session.previewState,
        );
    }
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
      this.#scrollPositions.set(element.dataset.scrollKey!, element.scrollTop);
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
    ))
      element.scrollTop =
        this.#scrollPositions.get(element.dataset.scrollKey!) ?? 0;
    const key = this.#pendingFocusKey;
    this.#pendingFocusKey = "";
    if (key)
      queueMicrotask(() =>
        this.#root
          .querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(key)}"]`)
          ?.focus(),
      );
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
      <button data-new>新建（game config）</button><button data-import>导入 ZIP</button>
      <span class="toolbar-divider"></span>
      <button data-upload disabled>上传资源</button><button data-upload-directory disabled>上传文件夹</button>
      <button data-import-image-string disabled title="兼容入口；上传资源也会自动识别">导入 Imgnumber ZIP</button>
      <button class="primary" data-export disabled>导出 ZIP</button>
      <input hidden type="file" accept="application/json,.json" data-new-input>
      <input hidden type="file" accept=".zip,application/zip" data-import-input>
      <input hidden type="file" multiple accept=".png,.jpg,.jpeg,.webp,.json,.atlas,.zip,application/zip" data-upload-input>
      <input hidden type="file" multiple webkitdirectory data-directory-input>
      <input hidden type="file" data-replace-input>
      <input hidden type="file" accept=".zip,application/zip" data-image-string-input>
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
    .filter((record) => !record.path.startsWith("dependencies/image-strings/"))
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
        return `<article class="dependency-card"><div><strong>${escapeHtml(dependency.id)}</strong><small>${Object.keys(dependency.manifest.glyphs).length} glyphs · lineHeight ${dependency.manifest.metrics.lineHeight}</small><small>${references.length ? `引用：${references.map(escapeHtml).join("、")}` : "未引用"}</small></div><div class="button-row"><button data-replace-image-string="${escapeAttr(dependency.id)}">替换</button><button data-remove-image-string="${escapeAttr(dependency.id)}" ${references.length ? "disabled" : ""}>删除</button></div></article>`;
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
      <div class="button-row"><button data-replace-asset="${escapeAttr(record.path)}">替换</button><button data-delete-asset="${escapeAttr(record.path)}">删除</button></div>
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
    ["states", "状态"],
    ["image-string", "ImgNumber"],
    ["value", "Value"],
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
  return `<section class="image-string-editor"><div class="section-heading"><div><h2>Named image-string nodes</h2><p>每个节点绑定一个真实 Spine state 和 exact slot；预览输入不改 initialText。</p></div><button class="primary" data-add-image-string-node ${spineStates.length && dependencies.length ? "" : "disabled"}>增加节点</button></div>${
    symbol.imageStringNodes
      .map((node, index) => {
        const visual = symbol.states.get(node.target.state);
        const slots =
          visual?.kind === "spine"
            ? assetMetadataList(
                project.assetLibrary.records.get(visual.skeletonPath),
                "slotNames",
              )
            : [];
        const previewKey = `${symbol.symbol}\u0000${node.name}`;
        const previewText =
          session.imageStringPreviewTexts.get(previewKey) ?? node.initialText;
        return `<article class="node-card"><header><strong>${escapeHtml(node.name)}</strong><div class="button-row"><button data-image-string-node-action="up" data-image-string-node-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button><button data-image-string-node-action="down" data-image-string-node-index="${index}" ${index === symbol.imageStringNodes.length - 1 ? "disabled" : ""}>↓</button><button data-image-string-node-action="remove" data-image-string-node-index="${index}">删除</button></div></header>
        <label>Name <input data-image-string-node-field="name" data-image-string-node-index="${index}" value="${escapeAttr(node.name)}"></label>
        <label>Dependency <select data-image-string-node-field="resource" data-image-string-node-index="${index}"><option value="">请选择 dependency</option>${dependencies.map((dependency) => option(`./dependencies/image-strings/${dependency.id}/image-string.manifest.json`, dependency.id, node.resource.includes(`/image-strings/${dependency.id}/`))).join("")}</select></label>
        <div class="form-grid"><label>Target state <select data-image-string-node-field="target.state" data-image-string-node-index="${index}"><option value="">请选择 Spine state</option>${spineStates.map((state) => option(state, state, state === node.target.state)).join("")}</select></label><label>Exact slot <select data-image-string-node-field="target.slot" data-image-string-node-index="${index}"><option value="">请选择 slot</option>${slots.map((slot) => option(slot, slot, slot === node.target.slot)).join("")}</select></label></div>
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
    <dl class="summary-grid"><div><dt>Symbol</dt><dd>${escapeHtml(symbol.symbol)}</dd></div><div><dt>Numeric code</dt><dd>${symbol.code}</dd></div><div><dt>Normal</dt><dd>${visualKindLabel(normal?.kind ?? "missing")}</dd></div><div><dt>状态数</dt><dd>${symbol.states.size}</dd></div></dl>
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
  return `<section class="state-editor">
    <div class="state-nav-wrap sticky">
      <div class="state-nav" aria-label="Symbol states">${symbol.stateOrder.map((id) => stateNavItem(project, symbol, id, id === state)).join("")}</div>
      <div class="add-state-wrap"><button class="primary" data-toggle-add-state aria-expanded="${session.addStateOpen}">＋ 添加状态</button>${session.addStateOpen ? `<div class="add-state-menu" role="menu">${available.map((item) => `<button role="menuitem" data-add-state-id="${escapeAttr(item.id)}"><strong>${escapeHtml(item.id)}</strong><small>${item.phase} / ${item.playback}</small></button>`).join("") || '<p class="empty">全部项目状态均已添加。</p>'}</div>` : ""}</div>
    </div>
    <article class="single-state-inspector">
      <header><div><h2 data-focus-key="state-heading" tabindex="-1">${escapeHtml(state)}</h2><p>${definition.phase} / ${definition.playback}</p></div>${state === "normal" ? '<span class="lock-label">固定状态</span>' : `<div class="button-row"><button data-state-action="up" data-state="${escapeAttr(state)}" ${index <= 1 ? "disabled" : ""} aria-label="上移 ${escapeAttr(state)}">↑</button><button data-state-action="down" data-state="${escapeAttr(state)}" ${index >= symbol.stateOrder.length - 1 ? "disabled" : ""} aria-label="下移 ${escapeAttr(state)}">↓</button><button data-state-action="remove" data-state="${escapeAttr(state)}">删除</button></div>`}</header>
      <div class="explicit-state-note">${visual.kind === "empty" || visual.kind === "empty-state" ? "当前是 explicit empty：这是正式配置，不是 fallback。" : "当前 state 已配置资源。"}</div>
      <label>Visual kind <select data-visual-kind data-focus-key="visual-kind">${compatibleVisualKinds(
        symbol,
        state,
      )
        .map((kind) =>
          option(kind, visualKindLabel(kind), visual.kind === kind),
        )
        .join("")}</select></label>
      ${visualFieldsMarkup(project, symbol, state, visual, thumbnail)}
    </article>
  </section>`;
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
  const stateStatus = getStateVisualStatus(project, visual);
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
    return `<section class="empty-feature"><h2>Value presentation</h2><p>为带数值的 symbol 配置分档 Spine、reel state 与文字或图片数字。</p><button class="primary" data-enable-value>启用 Value presentation</button></section>`;
  return `<section class="value-editor"><div class="section-heading"><div><h2>Value presentation</h2><p>资源通过 Picker 绑定；tier 一次展开一个。</p></div><button data-disable-value>停用</button></div>
    <h3>Default values</h3><div class="compact-list">${value.defaultValues.map((candidate, index) => `<div class="form-row"><input data-value-field="defaultValues.${index}" data-value-type="number" type="number" min="1" step="1" value="${candidate}"><button data-value-action="move-default" data-value-index="${index}" data-direction="-1" aria-label="上移 value">↑</button><button data-value-action="move-default" data-value-index="${index}" data-direction="1" aria-label="下移 value">↓</button><button data-value-action="remove-default" data-value-index="${index}">删除</button></div>`).join("")}</div><div class="form-row"><input data-new-default type="number" min="1" step="1" value="1"><button data-value-action="add-default">增加 value</button></div>
    <h3>Reel normal</h3><div class="form-grid">${valueNumberField("reelStates.normal.width", value.reelStates.normal.width, "Width")}${valueNumberField("reelStates.normal.height", value.reelStates.normal.height, "Height")}</div>
    <h3>Spine tiers</h3><div class="tier-list">${value.tiers.map((tier, index) => valueTierMarkup(project, symbol, tier, index, session.expandedTier === index, thumbnail)).join("")}</div><button data-value-action="add-tier">增加 tier</button>
    ${valueNumberPresentationMarkup(project, symbol)}
  </section>`;
}

function valueNumberPresentationMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const value = symbol.valuePresentation!;
  const modeButtons = `<div class="button-row"><button data-value-action="text-type" data-text-type="font">Font</button><button data-value-action="text-type" data-text-type="image">完整数值图片</button><button data-value-action="text-type" data-text-type="image-string">ImgNumber（按 tier）</button></div>`;
  if (value.text.type === "image-string") {
    const dependencies = [...project.imageStringDependencies.values()].sort(
      (left, right) => left.id.localeCompare(right.id, "en"),
    );
    const cards = value.text.tiers
      .map((binding, index) => {
        const slots = valueTierSlotOptions(project, symbol, index);
        const tier = value.tiers[index];
        const lower = index === 0 ? 1 : value.tiers[index - 1]!.maxExclusive;
        const upper = tier?.maxExclusive;
        const ready =
          dependencies.some(
            (dependency) =>
              binding.resource ===
              `./dependencies/image-strings/${dependency.id}/image-string.manifest.json`,
          ) && slots.includes(binding.slot);
        const dependencyOptions = [
          `<option value="" ${binding.resource ? "" : "selected"}>未选择 dependency</option>`,
          ...dependencies.map((dependency) => {
            const resource = `./dependencies/image-strings/${dependency.id}/image-string.manifest.json`;
            return option(
              resource,
              dependency.id,
              binding.resource === resource,
            );
          }),
        ].join("");
        return `<article class="tier-card value-number-tier"><header><strong>Tier ${index + 1} · ${lower}..${upper === undefined ? "∞" : upper - 1}</strong><span class="status-${ready ? "ready" : "missing"}">${ready ? "就绪" : "未完成"}</span></header><label>ImgNumber dependency <select data-value-field="text.tiers.${index}.resource">${dependencyOptions}</select></label>${valueSelectField(`text.tiers.${index}.slot`, binding.slot, slots, "Tier skeleton slot")}<div class="form-grid">${valueNumberField(`text.tiers.${index}.anchor.x`, binding.anchor.x, "Anchor X")}${valueNumberField(`text.tiers.${index}.anchor.y`, binding.anchor.y, "Anchor Y")}${valueNumberField(`text.tiers.${index}.transform.x`, binding.transform.x, "X")}${valueNumberField(`text.tiers.${index}.transform.y`, binding.transform.y, "Y")}${valueNumberField(`text.tiers.${index}.transform.scale`, binding.transform.scale, "Scale")}</div><label><input data-value-field="text.tiers.${index}.followSlotColor" type="checkbox" ${binding.followSlotColor ? "checked" : ""}> Follow slot color</label></article>`;
      })
      .join("");
    return `<section class="number-presentation"><h3>Number presentation</h3>${modeButtons}<p>ImgNumber dependency、slot 与 layout 按已解析 tier index 独立配置，不复制阈值。</p><div class="tier-list">${cards}</div></section>`;
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
  const animations = assetMetadataList(
    project.assetLibrary.records.get(skeleton),
    "animationNames",
  );
  const ready = Boolean(
    skeleton && atlas && texture && tier.animation.playback.animationName,
  );
  return `<details class="tier-card" data-tier-index="${index}" ${expanded ? "open" : ""}><summary><strong>Tier ${index + 1}</strong><span>${index < (symbol.valuePresentation?.tiers.length ?? 0) - 1 ? `&lt; ${tier.maxExclusive}` : "unbounded"}</span><span class="status-${ready ? "ready" : "missing"}">${ready ? "就绪" : "未完成"}</span></summary><div class="tier-body">${index < symbol.valuePresentation!.tiers.length - 1 ? valueNumberField(`tiers.${index}.maxExclusive`, tier.maxExclusive!, "maxExclusive") : '<p class="empty">最终 tier 无上界</p>'}${resourceBindingMarkup("Skeleton", skeleton, { kind: "value-tier-resource", symbol: symbol.symbol, tierIndex: index, field: "skeleton" })}${resourceBindingMarkup("Atlas", atlas, { kind: "value-tier-resource", symbol: symbol.symbol, tierIndex: index, field: "atlas" })}${derivedResourceMarkup("Texture · 由 Atlas page 自动解析", texture, thumbnail(texture))}${valueSelectField(`tiers.${index}.animation.playback.animationName`, tier.animation.playback.animationName, animations, "Loop animation")}<details class="advanced-fields"><summary>Transform</summary><div class="form-grid">${valueNumberField(`tiers.${index}.animation.transform.x`, tier.animation.transform?.x ?? 0, "X")}${valueNumberField(`tiers.${index}.animation.transform.y`, tier.animation.transform?.y ?? 0, "Y")}${valueNumberField(`tiers.${index}.animation.transform.scale`, tier.animation.transform?.scale ?? 1, "Scale")}</div></details><div class="button-row"><button data-value-action="move-tier" data-value-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button data-value-action="move-tier" data-value-index="${index}" data-direction="1" ${index === symbol.valuePresentation!.tiers.length - 1 ? "disabled" : ""}>↓</button><button data-value-action="remove-tier" data-value-index="${index}">删除 tier</button></div></div></details>`;
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
  return `<form method="dialog" class="picker-shell" onsubmit="return false"><header><div><small>选择兼容资源</small><h2>${escapeHtml(getResourceBindingLabel(context))}</h2></div><button type="button" data-picker-cancel aria-label="关闭资源 Picker">×</button></header><div class="picker-toolbar"><input data-picker-query type="search" placeholder="搜索资源 path" value="${escapeAttr(query)}"><button type="button" data-picker-upload>上传新资源</button></div><p class="hint">上传只刷新候选，不会自动绑定。</p><div class="picker-list">${candidates.map((candidate) => `<button type="button" class="picker-row ${candidate.path === selectedPath ? "selected" : ""}" data-picker-candidate="${escapeAttr(candidate.path)}" ${candidate.status === "error" ? "disabled" : ""}><span class="asset-thumb">${thumbnail(candidate.path) ? `<img src="${escapeAttr(thumbnail(candidate.path)!)}" alt="">` : assetIcon(candidate.kind)}</span><span class="asset-main"><span class="path">${escapeHtml(candidate.path)}</span><small>${escapeHtml(candidate.summary)}</small>${candidate.disabledReason ? `<small class="inline-error">${escapeHtml(candidate.disabledReason)}</small>` : ""}</span><span>${candidate.path === selectedPath ? "当前选择" : candidate.status === "ready" ? "可用" : "错误"}</span></button>`).join("") || '<p class="empty">没有兼容资源。</p>'}</div><footer><button type="button" data-picker-cancel>取消</button><button type="button" class="primary" data-picker-confirm ${selectedReady ? "" : "disabled"}>确认绑定</button></footer></form>`;
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
    if (visual.kind === "empty" || visual.kind === "empty-state")
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
    return ["empty", "image", "layered-image", "spine", "vni"];
  const kinds = ["empty-state", "image", "spine", "vni", "static"];
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

function valueTierSlotOptions(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  tierIndex: number,
): readonly string[] {
  const tier = symbol.valuePresentation?.tiers[tierIndex];
  if (!tier) return [];
  return assetMetadataList(
    project.assetLibrary.records.get(
      tier.animation.skeleton.replace(/^\.\//u, ""),
    ),
    "slotNames",
  );
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
    return visual.kind === "image" ? visual.imagePath : "";
  if (context.kind === "normal-base-image")
    return (visual.kind === "spine" || visual.kind === "vni") &&
      visual.baseVisual?.kind === "image"
      ? visual.baseVisual.imagePath
      : "";
  if (context.kind === "spine-skeleton")
    return visual.kind === "spine" ? visual.skeletonPath : "";
  if (context.kind === "spine-atlas")
    return visual.kind === "spine" ? visual.atlasPath : "";
  if (context.kind === "vni-project")
    return visual.kind === "vni" ? visual.projectPath : "";
  const source =
    context.baseVisual && (visual.kind === "spine" || visual.kind === "vni")
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
  }
  if (paths.length === 0 || paths.some((path) => !path)) return "missing";
  for (const path of paths) {
    const record = project.assetLibrary.records.get(path);
    if (!record) return "missing";
    if (record.diagnostics.length > 0) return "error";
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

function validateResourceDiscovery(
  records: readonly EditorAssetRecord[],
): void {
  const diagnostics = records.flatMap((record) =>
    record.diagnostics.map((diagnostic) => `${record.path}: ${diagnostic}`),
  );
  if (diagnostics.length) throw new Error(diagnostics.join("\n"));
  const byDirectory = new Map<string, EditorAssetRecord[]>();
  for (const record of records) {
    const directory = record.path.includes("/")
      ? record.path.slice(0, record.path.lastIndexOf("/"))
      : "";
    const group = byDirectory.get(directory) ?? [];
    group.push(record);
    byDirectory.set(directory, group);
  }
  for (const [directory, group] of byDirectory) {
    const skeletons = group.filter(
      (record) => record.kind === "spine-skeleton",
    );
    const atlases = group.filter((record) => record.kind === "spine-atlas");
    if (skeletons.length || atlases.length) {
      if (skeletons.length !== 1 || atlases.length !== 1) {
        throw new Error(
          `目录 ${directory || "."} 的 Spine closure 存在歧义：${skeletons.length} skeleton / ${atlases.length} atlas。`,
        );
      }
      const pages = metadataList(atlases[0]!, "pageNames");
      for (const page of pages) {
        const matches = group.filter(
          (record) =>
            record.kind === "image" &&
            record.path.split("/").at(-1)?.toLocaleLowerCase("en-US") ===
              page.toLocaleLowerCase("en-US"),
        );
        if (matches.length !== 1)
          throw new Error(`Spine atlas page ${page} 缺失或大小写匹配歧义。`);
      }
    }
    for (const project of group.filter(
      (record) => record.kind === "vni-project",
    )) {
      for (const assetPath of metadataList(project, "assetPaths")) {
        const source = resolveReviewPath(project.path, assetPath);
        const matches = records.filter(
          (record) =>
            record.path.toLocaleLowerCase("en-US") ===
            source.toLocaleLowerCase("en-US"),
        );
        if (matches.length !== 1)
          throw new Error(`VNI asset ${assetPath} 缺失或大小写匹配歧义。`);
      }
    }
  }
}

function confirmSymbolImportReview(
  records: readonly EditorAssetRecord[],
  files: readonly File[],
): boolean {
  const confirm = globalThis.window?.confirm;
  if (typeof confirm !== "function") return true;
  const rows = records.map(
    (record) =>
      `${record.path} · ${record.kind} · ${metadataList(record, "assetPaths").length + metadataList(record, "pageNames").length} dependencies`,
  );
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return confirm.call(
    globalThis.window,
    `导入审查\n${rows.join("\n")}\n未消费文件 0 · ${files.length} files · ${total} bytes\n\n确认只加入资源库？`,
  );
}

function metadataList(record: EditorAssetRecord, key: string): string[] {
  const value = record.metadata?.[key];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function resolveReviewPath(base: string, reference: string): string {
  const stack = base.split("/").slice(0, -1);
  for (const segment of reference.split("/")) {
    if (segment === "..") stack.pop();
    else if (segment !== "." && segment) stack.push(segment);
  }
  return stack.join("/");
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
