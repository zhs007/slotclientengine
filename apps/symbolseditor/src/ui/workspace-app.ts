import {
  createSymbolPackageResource,
  type GeneratedSymbolStateTextureId,
} from "@slotclientengine/rendercore/symbol/editor";
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
import type {
  AudioEffectBindingV1,
  AudioMediaType,
} from "@slotclientengine/audiocore/data";
import {
  addCustomStateDefinition,
  addStateAnimationLayer,
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
  setStateAfterComplete,
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
  generateAndBindImageStringSpinBlur,
  generateAndBindValueImageStringSpinBlur,
  getImageStringSpinBlurAvailability,
  getValueImageStringSpinBlurAvailability,
} from "../model/image-string-spin-blur-generation.js";
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
  createSymbolVniBundleImportSources,
  inspectSymbolVniBundleProfiles,
  type SymbolVniRuntimeProfile,
} from "../io/vni-bundle-import.js";
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
  readonly rewrittenTextures: readonly {
    readonly location: string;
    readonly previousTexturePath: string;
    readonly texturePath: string;
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
  #pickerTrigger: HTMLElement | null = null;
  #uploadIntent: UploadIntent = { kind: "ordinary" };
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  #pendingFocusKey = "";
  #pendingVisibleState = "";
  #cancelVniProfileChoice: (() => void) | null = null;
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
    this.#cancelVniProfileChoice?.();
    this.#cancelVniProfileChoice = null;
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
    panel
      .querySelector<HTMLElement>("[data-add-animation-layer]")
      ?.addEventListener("click", () => this.addAnimationLayer());
    this.bindValueControls(panel);
    this.bindImageStringControls(panel);
    this.bindCascadeControls(panel);
    this.bindStateAudioControls(panel);
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
    const audioPreviewSymbol = panel.querySelector<HTMLSelectElement>(
      "[data-audio-preview-symbol]",
    );
    audioPreviewSymbol?.addEventListener("change", () => {
      this.#session.audioPreviewSymbol = audioPreviewSymbol.value;
      this.render(this.#store.getSnapshot());
    });
    panel
      .querySelector<HTMLElement>("[data-add-custom]")
      ?.addEventListener("click", () => {
        const id =
          panel.querySelector<HTMLInputElement>("[data-custom-id]")!.value;
        const lifecycle = panel.querySelector<HTMLSelectElement>(
          "[data-custom-lifecycle]",
        )!.value;
        const afterComplete = panel.querySelector<HTMLSelectElement>(
          "[data-custom-after-complete]",
        )!.value as "return-to-default" | "terminal";
        try {
          this.#store.transact((draft) =>
            addCustomStateDefinition(
              draft,
              lifecycle === "once"
                ? { id, phase: "once", playback: "once", afterComplete }
                : { id, phase: "stable", playback: "loop" },
            ),
          );
          this.showSuccess(`已添加项目状态 ${id}`);
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<HTMLSelectElement>("[data-state-after-complete]")
      .forEach((select) => {
        select.addEventListener("change", () => {
          try {
            this.#store.transact((draft) =>
              setStateAfterComplete(
                draft,
                select.dataset.stateAfterComplete!,
                select.value as "return-to-default" | "terminal",
              ),
            );
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
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

  private bindStateAudioControls(panel: HTMLElement): void {
    panel
      .querySelector<HTMLElement>("[data-add-state-audio]")
      ?.addEventListener("click", () => {
        try {
          const path = panel.querySelector<HTMLSelectElement>(
            "[data-new-state-audio-path]",
          )!.value;
          const requestedName = panel
            .querySelector<HTMLInputElement>("[data-new-state-audio-name]")!
            .value.trim();
          const playback = panel.querySelector<HTMLSelectElement>(
            "[data-new-state-audio-playback]",
          )!.value as "once" | "loop";
          const offsetSeconds = Number(
            panel.querySelector<HTMLInputElement>(
              "[data-new-state-audio-delay]",
            )!.value,
          );
          const focus = panel.querySelector<HTMLSelectElement>(
            "[data-new-state-audio-bgm]",
          )!.value;
          this.#store.transact((draft) => {
            const symbol = draft.symbols.get(this.#session.selectedSymbol);
            if (!symbol?.states.has(this.#session.selectedState))
              throw new Error("当前 Symbol 状态不存在。");
            const record = draft.assetLibrary.records.get(path);
            if (!record || record.kind !== "audio" || record.diagnostics.length)
              throw new Error("必须选择一个可用音频资源。");
            const mediaType = record.metadata?.mediaType;
            if (typeof mediaType !== "string")
              throw new Error("音频资源缺少 mediaType。");
            if (!Number.isFinite(offsetSeconds) || offsetSeconds < 0)
              throw new Error("延迟必须是非负数。");
            const fallbackName = `${symbol.symbol}-${this.#session.selectedState}-${audioPathStem(path)}`;
            const name = allocateAudioEffectName(
              draft.audio.effects,
              requestedName || fallbackName,
            );
            draft.audio = {
              ...draft.audio,
              effects: [
                ...draft.audio.effects,
                createAudioEffect(
                  name,
                  path,
                  mediaType as AudioMediaType,
                  playback,
                  offsetSeconds,
                  focus,
                ),
              ],
            };
            symbol.audioCues = [
              ...symbol.audioCues,
              { state: this.#session.selectedState, effect: name },
            ];
          });
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelectorAll<
        HTMLInputElement | HTMLSelectElement
      >("[data-state-audio-field]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const effect = getOwnedStateAudioEffect(
                draft,
                this.#session.selectedSymbol,
                this.#session.selectedState,
                input.dataset.stateAudioEffect!,
              );
              const field = input.dataset.stateAudioField;
              if (field === "playback") {
                effect.playback = input.value as "once" | "loop";
                effect.voices.maxConcurrent =
                  effect.playback === "loop" ? 1 : 4;
              } else if (field === "delay") {
                const delay = Number(input.value);
                if (!Number.isFinite(delay) || delay < 0)
                  throw new Error("延迟必须是非负数。");
                effect.offsetSeconds = delay;
              } else if (field === "bgm") {
                effect.bgm = audioFocus(input.value);
              } else if (field === "asset") {
                const record = draft.assetLibrary.records.get(input.value);
                if (
                  !record ||
                  record.kind !== "audio" ||
                  record.diagnostics.length
                )
                  throw new Error("必须选择一个可用音频资源。");
                const mediaType = record.metadata?.mediaType;
                if (typeof mediaType !== "string")
                  throw new Error("音频资源缺少 mediaType。");
                effect.asset = {
                  sources: [
                    {
                      path: input.value,
                      mediaType: mediaType as AudioMediaType,
                    },
                  ],
                };
              }
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-remove-state-audio]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#store.transact((draft) => {
            const symbol = draft.symbols.get(this.#session.selectedSymbol);
            if (!symbol) throw new Error("当前 Symbol 不存在。");
            const effectName = button.dataset.removeStateAudio!;
            symbol.audioCues = symbol.audioCues.filter(
              (cue) =>
                cue.state !== this.#session.selectedState ||
                cue.effect !== effectName,
            );
            if (!isAudioEffectReferenced(draft, effectName)) {
              draft.audio = {
                ...draft.audio,
                effects: draft.audio.effects.filter(
                  (effect) => effect.name !== effectName,
                ),
              };
            }
          });
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

  private addAnimationLayer(): void {
    try {
      this.#store.transact((draft) => {
        const visual = draft.symbols
          .get(this.#session.selectedSymbol)!
          .states.get(this.#session.selectedState)!;
        const used = new Set(
          visual.kind === "composite"
            ? visual.layers.map((layer) => layer.id)
            : visual.kind === "spine" || visual.kind === "vni"
              ? ["layer-1"]
              : [],
        );
        let suffix = used.size + 1;
        while (used.has(`layer-${suffix}`)) suffix += 1;
        const atlas = getDefaultSpineAtlasBinding(draft);
        addStateAnimationLayer(
          draft,
          this.#session.selectedSymbol,
          this.#session.selectedState,
          {
            id: `layer-${suffix}`,
            placement: "overlay",
            animation: {
              kind: "spine",
              skeletonPath: "",
              atlasPath: atlas?.atlasPath ?? "",
              texturePath: atlas?.texturePath ?? "",
              animationName: "",
            },
          },
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
      .querySelectorAll<HTMLInputElement>("[data-value-preview]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          const snapshot = this.#store.getSnapshot();
          if (!snapshot.project) return;
          try {
            this.#session.setPreviewValue(
              snapshot.project,
              this.#session.selectedSymbol,
              Number(input.value),
            );
            this.render(snapshot);
            void this.refreshPreview(snapshot);
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
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
      .querySelectorAll<HTMLElement>("[data-value-special-add]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
              const value = structuredClone(symbol.valuePresentation!);
              if (value.text.type !== "image-string") return;
              const binding =
                "tierResources" in value.text
                  ? value.text
                  : value.text.tiers[Number(button.dataset.valueSpecialAdd)];
              if (!binding) throw new Error("ImgNumber 档位不存在。");
              const mappings = [...(binding.specialValueImages ?? [])];
              (
                binding as unknown as { specialValueImages: unknown[] }
              ).specialValueImages = [
                ...mappings,
                { value: nextSpecialValue(mappings), image: "" },
              ];
              setValuePresentation(draft, symbol.symbol, value);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        }),
      );
    panel
      .querySelectorAll<HTMLElement>("[data-value-special-remove]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#store.transact((draft) => {
            const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
            const value = structuredClone(symbol.valuePresentation!);
            if (value.text.type !== "image-string") return;
            const binding =
              "tierResources" in value.text
                ? value.text
                : value.text.tiers[Number(button.dataset.valueTierIndex)];
            if (!binding) throw new Error("ImgNumber 档位不存在。");
            (
              binding as unknown as { specialValueImages: unknown[] }
            ).specialValueImages = (binding.specialValueImages ?? []).filter(
              (_mapping, index) =>
                index !== Number(button.dataset.valueSpecialRemove),
            );
            setValuePresentation(draft, symbol.symbol, value);
          });
        });
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-value-special-value]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(this.#session.selectedSymbol)!;
              const value = structuredClone(symbol.valuePresentation!);
              if (value.text.type !== "image-string") return;
              const mapping = (
                "tierResources" in value.text
                  ? value.text
                  : value.text.tiers[Number(input.dataset.valueTierIndex)]
              )?.specialValueImages?.[Number(input.dataset.valueSpecialValue)];
              if (!mapping) throw new Error("ImgNumber 特殊值映射不存在。");
              (mapping as { value: number }).value = Number(input.value);
              setValuePresentation(draft, symbol.symbol, value);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
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
      >("[data-value-image-string-field]")
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
              const tierIndex = Number(input.dataset.valueTierIndex);
              const next =
                input instanceof HTMLInputElement && input.type === "checkbox"
                  ? input.checked
                  : input instanceof HTMLInputElement && input.type === "number"
                    ? Number(input.value)
                    : input.value;
              const field = input.dataset.valueImageStringField!;
              if ("tierResources" in value.text && field === "resource") {
                (value.text.tierResources as string[])[tierIndex] =
                  String(next);
              } else {
                const binding =
                  "tierResources" in value.text
                    ? value.text
                    : value.text.tiers[tierIndex];
                if (!binding) throw new Error("ImgNumber 档位不存在。");
                setObjectPath(
                  binding as unknown as Record<string, unknown>,
                  field,
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
          const symbolName = this.#session.selectedSymbol;
          this.#store.transact((draft) => {
            setValuePresentation(draft, symbolName, undefined);
            this.#session.clearPreviewValue(symbolName);
          });
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
              symbol.stateOrder.length === 0
            ) {
              throw new Error(
                "新增节点前必须先导入 Imgnumber ZIP，并配置至少一个 state。",
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
                ...(symbol.stateOrder.some((state) =>
                  isImageStringSpineTarget(symbol, state),
                )
                  ? { spineSlot: "" }
                  : {}),
                targets: [],
                initialText: "",
                specialValueImages: [],
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
                targets: [...node.targets, { state: "" }],
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
                  ? isImageStringSpineTarget(symbol, input.value)
                    ? { state: input.value, slot: "" }
                    : { state: input.value }
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
      .querySelectorAll<HTMLElement>("[data-image-string-special-add]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          try {
            this.#store.transact((draft) => {
              const symbol = draft.symbols.get(symbolName)!;
              const nodes = structuredClone(symbol.imageStringNodes);
              const node = nodes[Number(button.dataset.imageStringSpecialAdd)]!;
              const mappings = [...(node.specialValueImages ?? [])];
              (
                node as unknown as { specialValueImages: unknown[] }
              ).specialValueImages = [
                ...mappings,
                { value: nextSpecialValue(mappings), image: "" },
              ];
              setSymbolImageStringNodes(draft, symbolName, nodes);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-image-string-special-remove]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          this.#store.transact((draft) => {
            const nodes = structuredClone(
              draft.symbols.get(symbolName)!.imageStringNodes,
            );
            const node = nodes[Number(button.dataset.imageStringNodeIndex)]!;
            (
              node as unknown as { specialValueImages: unknown[] }
            ).specialValueImages = (node.specialValueImages ?? []).filter(
              (_mapping, index) =>
                index !== Number(button.dataset.imageStringSpecialRemove),
            );
            setSymbolImageStringNodes(draft, symbolName, nodes);
          });
        });
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-image-string-special-value]")
      .forEach((input) => {
        input.addEventListener("change", () => {
          try {
            this.#store.transact((draft) => {
              const nodes = structuredClone(
                draft.symbols.get(symbolName)!.imageStringNodes,
              );
              const node = nodes[Number(input.dataset.imageStringNodeIndex)]!;
              const mapping =
                node.specialValueImages?.[
                  Number(input.dataset.imageStringSpecialValue)
                ];
              if (!mapping) throw new Error("ImgNumber 特殊值映射不存在。");
              (mapping as { value: number }).value = Number(input.value);
              setSymbolImageStringNodes(draft, symbolName, nodes);
            });
          } catch (error) {
            this.#store.setExternalError(error);
          }
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-generate-image-string-spin-blur]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          void this.generateImageStringSpinBlur(
            Number(button.dataset.generateImageStringSpinBlur),
          );
        });
      });
    panel
      .querySelectorAll<HTMLElement>("[data-generate-value-spin-blur]")
      .forEach((button) => {
        button.addEventListener("click", () => {
          void this.generateValueImageStringSpinBlur(
            Number(button.dataset.generateValueSpinBlur),
          );
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

  private async generateImageStringSpinBlur(nodeIndex: number): Promise<void> {
    if (this.#importing) return;
    const snapshot = this.#store.getSnapshot();
    if (!snapshot.project) return;
    this.#importing = true;
    this.requireElement("[data-upload]").setAttribute("disabled", "");
    const request = ++this.#importRequest;
    const symbol = this.#session.selectedSymbol;
    this.showSuccess(`正在为 ${symbol} 的 ImgNumber 生成模糊资源…`);
    try {
      const result = await generateAndBindImageStringSpinBlur({
        project: snapshot.project,
        symbol,
        nodeIndex,
        codec: { decode: decodeBrowserImage, encodePng: encodeBrowserPng },
      });
      if (request !== this.#importRequest) return;
      if (this.#store.getSnapshot().revision !== snapshot.revision)
        throw new Error("生成期间项目已变化，请基于最新项目重试。");
      this.#store.replace(result.project);
      this.#session.previewState = "spinBlur";
      this.showSuccess(
        result.generatedImageCount === 0
          ? `已复用并绑定模糊 ImgNumber：${result.dependencyId}`
          : `已生成 ${result.generatedImageCount} 张图片，并为 ${result.boundNodeCount} 个 node 绑定模糊 ImgNumber。`,
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

  private async generateValueImageStringSpinBlur(
    tierIndex: number,
  ): Promise<void> {
    if (this.#importing) return;
    const snapshot = this.#store.getSnapshot();
    if (!snapshot.project) return;
    this.#importing = true;
    this.requireElement("[data-upload]").setAttribute("disabled", "");
    const request = ++this.#importRequest;
    const symbol = this.#session.selectedSymbol;
    this.showSuccess(
      `正在为 ${symbol} 的 Tier ${tierIndex + 1} ImgNumber 生成模糊资源…`,
    );
    try {
      const result = await generateAndBindValueImageStringSpinBlur({
        project: snapshot.project,
        symbol,
        tierIndex,
        codec: { decode: decodeBrowserImage, encodePng: encodeBrowserPng },
      });
      if (request !== this.#importRequest) return;
      if (this.#store.getSnapshot().revision !== snapshot.revision) {
        throw new Error("生成期间项目已变化，请基于最新项目重试。");
      }
      this.#store.replace(result.project);
      this.#session.previewState = "spinBlur";
      this.showSuccess(
        result.generatedImageCount === 0
          ? `已复用并绑定 Tier ${tierIndex + 1} 模糊 ImgNumber：${result.dependencyId}`
          : `已生成 ${result.generatedImageCount} 张图片并绑定 Tier ${tierIndex + 1} 模糊 ImgNumber。`,
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
            if ("tierResources" in value.text)
              (value.text.tierResources as string[]).push("");
            else
              (value.text.tiers as Array<Record<string, unknown>>).push(
                createEmptyValueImageStringBinding(),
              );
            if (
              "tierResources" in value.text &&
              Array.isArray(value.text.tierSpinBlurProfiles)
            ) {
              (value.text.tierSpinBlurProfiles as unknown[]).push(null);
            }
          }
          this.#session.expandedTier = value.tiers.length - 1;
        } else if (action === "remove-tier") {
          if (value.tiers.length <= 1)
            throw new Error("valuePresentation 至少保留一个 tier。");
          value.tiers.splice(index, 1);
          if (value.text.type === "image-string") {
            if ("tierResources" in value.text)
              (value.text.tierResources as unknown[]).splice(index, 1);
            else (value.text.tiers as unknown[]).splice(index, 1);
            if (
              "tierResources" in value.text &&
              Array.isArray(value.text.tierSpinBlurProfiles)
            ) {
              (value.text.tierSpinBlurProfiles as unknown[]).splice(index, 1);
            }
          }
          delete value.tiers.at(-1)!.maxExclusive;
        } else if (action === "move-tier") {
          const boundaries = value.tiers
            .slice(0, -1)
            .map((tier) => Number(tier.maxExclusive));
          moveArrayItem(value.tiers, index, Number(button.dataset.direction));
          if (value.text.type === "image-string") {
            moveArrayItem(
              ("tierResources" in value.text
                ? value.text.tierResources
                : value.text.tiers) as unknown[],
              index,
              Number(button.dataset.direction),
            );
            if (
              "tierResources" in value.text &&
              Array.isArray(value.text.tierSpinBlurProfiles)
            ) {
              moveArrayItem(
                value.text.tierSpinBlurProfiles as unknown[],
                index,
                Number(button.dataset.direction),
              );
            }
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
                  tierResources: value.tiers.map(() => ""),
                  slot: slots[0] ?? "",
                  anchor: { x: 0.5, y: 0.5 },
                  transform: { x: 0, y: 0, scale: 1 },
                  followSlotColor: true,
                  specialValueImages: [],
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
              [
                "symbols.package.json",
                "image-string.manifest.json",
                "manifest.json",
              ],
            );
            const vniProfiles = inspectSymbolVniBundleProfiles(entries);
            return { file, bytes, entries, vniProfiles };
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
      const vniProfileSelections = new Map<File, string>();
      for (const { file, vniProfiles } of inspectedZips) {
        if (!vniProfiles) continue;
        const selected =
          vniProfiles.length === 1
            ? vniProfiles[0]!.id
            : await this.chooseVniRuntimeProfile(file.name, vniProfiles);
        if (!selected) {
          this.showSuccess("已取消 VNI runtime 选择，项目未修改");
          return;
        }
        if (request !== this.#importRequest) return;
        vniProfileSelections.set(file, selected);
      }
      const vniFiles = new Set(vniProfileSelections.keys());
      const ordinaryFiles = files.filter((file) => !vniFiles.has(file));
      const ordinarySources = ordinaryFiles.length
        ? await ingestEditorResourceSources({
            files: ordinaryFiles,
            limits: {
              files: {
                maxEntries: 4096,
                maxFileBytes: 50 * 1024 * 1024,
                maxTotalBytes: 500 * 1024 * 1024,
              },
              zip: SYMBOL_ZIP_LIMITS,
            },
          })
        : [];
      const vniSources = inspectedZips.flatMap(
        ({ file, entries, vniProfiles }) => {
          if (!vniProfiles) return [];
          return createSymbolVniBundleImportSources({
            entries,
            containerName: file.name,
            selectedProfileId: vniProfileSelections.get(file),
          });
        },
      );
      const sources = Object.freeze([...ordinarySources, ...vniSources]);
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
          : outcome.clearedAnimations.length > 0
            ? `已上传 ${outcome.changed} 个资源；已清空 ${outcome.clearedAnimations.length} 个不存在的 Spine 动画：${outcome.clearedAnimations.map(({ location, animationName }) => `${location}（${animationName}）`).join("、")}`
            : outcome.rewrittenTextures.length > 0
              ? `已上传 ${outcome.changed} 个资源；现有动画配置保持不变，已同步 ${outcome.rewrittenTextures.length} 个 Atlas page 引用：${outcome.rewrittenTextures.map(({ location, previousTexturePath, texturePath }) => `${location}（${previousTexturePath} → ${texturePath}）`).join("、")}`
              : `已上传 ${outcome.changed} 个资源；现有配置保持不变`,
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

  private chooseVniRuntimeProfile(
    fileName: string,
    profiles: readonly SymbolVniRuntimeProfile[],
  ): Promise<string | null> {
    const dialog = this.requireElement(
      "[data-vni-runtime-choice]",
    ) as HTMLDialogElement;
    const description = this.requireElement("[data-vni-runtime-description]");
    const select = this.requireElement(
      "[data-vni-runtime-select]",
    ) as HTMLSelectElement;
    const confirm = this.requireElement(
      "[data-vni-runtime-confirm]",
    ) as HTMLButtonElement;
    const cancel = this.requireElement(
      "[data-vni-runtime-cancel]",
    ) as HTMLButtonElement;
    description.textContent = `${fileName} 包含多个 purpose=runtime 的运行发布包，请明确选择本次导入版本。`;
    select.replaceChildren(
      ...profiles.map((profile) => {
        const option = document.createElement("option");
        option.value = profile.id;
        option.textContent = `${profile.label} · ${profile.id} · ${profile.assetScale * 100}% · ${formatBytes(profile.byteLength)}`;
        return option;
      }),
    );
    return new Promise((resolve) => {
      let finished = false;
      const finish = (value: string | null) => {
        if (finished) return;
        finished = true;
        confirm.onclick = null;
        cancel.onclick = null;
        dialog.removeEventListener("cancel", onDialogCancel);
        if (dialog.open) {
          if (typeof dialog.close === "function") dialog.close();
          else dialog.removeAttribute("open");
        }
        if (this.#cancelVniProfileChoice === cancelChoice)
          this.#cancelVniProfileChoice = null;
        resolve(value);
      };
      const onDialogCancel = (event: Event) => {
        event.preventDefault();
        finish(null);
      };
      const cancelChoice = () => finish(null);
      this.#cancelVniProfileChoice?.();
      this.#cancelVniProfileChoice = cancelChoice;
      confirm.onclick = () => finish(select.value);
      cancel.onclick = () => finish(null);
      dialog.addEventListener("cancel", onDialogCancel);
      if (typeof dialog.showModal === "function" && !dialog.open)
        dialog.showModal();
      else dialog.setAttribute("open", "");
    });
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
        rewrittenTextures: result.rewrittenTextures,
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
    this.#preview.configureAudio?.(project, this.#session.audioPreviewSymbol);
    const cells = createPreviewCells(
      project,
      this.#session.previewState,
      (symbol) => this.#session.getPreviewValue(project, symbol),
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
      this.#preview.playAudioCue?.(this.#session.previewState);
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
      <input hidden type="file" multiple accept=".png,.jpg,.jpeg,.webp,.json,.atlas,.zip,.mp3,.ogg,.wav,.m4a,.aac,.webm,application/zip,audio/mpeg,audio/ogg,audio/wav,audio/mp4,audio/aac,audio/webm" data-upload-input>
    </header>
    <div class="feedback" data-feedback aria-live="polite"></div>
    <div class="errors" data-errors role="alert"></div>
    <section class="workspace">
      <aside class="panel" data-project-panel></aside>
      <section class="preview-panel" aria-label="全部 display symbols 预览">
        <div class="preview-toolbar">
          <label>预览 state <select data-preview-state><option>normal</option></select></label>
          <button data-replay>Replay</button>
          <button data-fit>适配全部</button><button data-zoom-out aria-label="缩小">−</button>
          <input data-zoom aria-label="预览缩放" type="range" min="0.25" max="4" step="0.05" value="1">
          <button data-zoom-in aria-label="放大">＋</button><span data-zoom-label>100%</span>
        </div>
        <div class="preview" data-preview></div>
      </section>
    </section>
    <dialog class="resource-picker" data-resource-picker></dialog>
    <dialog class="vni-runtime-dialog" data-vni-runtime-choice>
      <div class="vni-runtime-shell">
        <header><div><small>VNI export bundle</small><h2>选择 VNI runtime</h2></div></header>
        <p data-vni-runtime-description></p>
        <label>运行版本<select data-vni-runtime-select></select></label>
        <footer><button type="button" data-vni-runtime-cancel>取消导入</button><button type="button" class="primary" data-vni-runtime-confirm>确认 runtime</button></footer>
      </div>
    </dialog>
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
        : projectWorkspaceMarkup(project, session);
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
            ? "tierResources" in symbol.valuePresentation.text
              ? symbol.valuePresentation.text.tierResources.flatMap(
                  (resource, index) =>
                    resource === dependency.rootKey ||
                    resource === `./${dependency.rootKey}`
                      ? [
                          `${symbol.symbol}.valuePresentation.text.tierResources[${index}]`,
                        ]
                      : [],
                )
              : symbol.valuePresentation.text.tiers.flatMap((binding, index) =>
                  binding.resource === dependency.rootKey ||
                  binding.resource === `./${dependency.rootKey}`
                    ? [
                        `${symbol.symbol}.valuePresentation.text.tiers[${index}]`,
                      ]
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
            ? valueInspectorMarkup(project, symbol, session)
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
  const targetStates = symbol.stateOrder;
  const dependencies = [...project.imageStringDependencies.values()];
  return `<section class="image-string-editor"><div class="section-heading"><div><h2>Named image-string nodes</h2><p>Spine 只配置 Normal slot；全部 Spine state 由动画控制。非 Spine state 可单独选择顶层显示。</p></div><button class="primary" data-add-image-string-node ${targetStates.length && dependencies.length ? "" : "disabled"}>增加节点</button></div>${
    symbol.imageStringNodes
      .map((node, index) => {
        const previewKey = `${symbol.symbol}\u0000${node.name}`;
        const previewText =
          session.imageStringPreviewTexts.get(previewKey) ?? node.initialText;
        const sharedSpine = node.spineSlot !== undefined;
        const commonSlots = getSharedSpineSlotOptions(project, symbol);
        const exactTargetStates = sharedSpine
          ? targetStates.filter(
              (state) => !isImageStringSpineTarget(symbol, state),
            )
          : targetStates;
        const blurAvailability = getImageStringSpinBlurAvailability(
          project,
          symbol.symbol,
          index,
        );
        const blurMarkup = `<section class="state-texture-generation"><div><strong>spinBlur ImgNumber</strong><small>${escapeHtml(
          blurAvailability.ready
            ? blurAvailability.alreadyBound
              ? "已绑定派生模糊 dependency；runtime 将在同一 instance 内切换 assets。"
              : "将在浏览器本地生成，已有同源派生 dependency 时直接复用。"
            : blurAvailability.reason,
        )}</small></div><button type="button" data-generate-image-string-spin-blur="${index}" ${blurAvailability.ready && !blurAvailability.alreadyBound ? "" : "disabled"}>${blurAvailability.ready && blurAvailability.alreadyBound ? "已生成并使用" : "生成并使用模糊 ImgNumber"}</button></section>`;
        return `<article class="node-card"><header><strong>${escapeHtml(node.name)}</strong><div class="button-row"><button data-image-string-node-action="up" data-image-string-node-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button><button data-image-string-node-action="down" data-image-string-node-index="${index}" ${index === symbol.imageStringNodes.length - 1 ? "disabled" : ""}>↓</button><button data-image-string-node-action="remove" data-image-string-node-index="${index}">删除</button></div></header>
        <label>Name <input data-image-string-node-field="name" data-image-string-node-index="${index}" value="${escapeAttr(node.name)}"></label>
        <label>Dependency <select data-image-string-node-field="resource" data-image-string-node-index="${index}"><option value="">请选择 dependency</option>${dependencies.map((dependency) => option(`./${dependency.rootKey}`, `${dependency.id} · ${dependency.rootKey}`, node.resource === `./${dependency.rootKey}`)).join("")}</select></label>
        ${sharedSpine ? `<fieldset><legend>Normal 共享配置</legend><label>Exact slot <select data-image-string-node-field="spineSlot" data-image-string-node-index="${index}"><option value="">请选择 slot</option>${commonSlots.map((slot) => option(slot, slot, slot === node.spineSlot)).join("")}</select></label><div class="derived-field"><span>Spine states</span><strong>全部使用同名 slot</strong><small>显示、移动与弹出由 Spine animation 决定</small></div></fieldset>` : '<p class="hint">Legacy：保留逐 Spine state exact slot 配置。</p>'}
        <fieldset><legend>State targets</legend>${node.targets
          .map((target, targetIndex) => {
            const visual = symbol.states.get(target.state);
            const spineTarget = isImageStringSpineTarget(symbol, target.state);
            const slots =
              symbol.valuePresentation && target.state === "normal"
                ? valueSlotOptions(project, symbol)
                : visual?.kind === "spine"
                  ? assetMetadataList(
                      project.assetLibrary.records.get(visual.skeletonPath),
                      "slotNames",
                    )
                  : [];
            return `<div class="form-grid"><label>Target state <select data-image-string-target-field="state" data-image-string-node-index="${index}" data-image-string-target-index="${targetIndex}"><option value="">请选择 state</option>${exactTargetStates.map((state) => option(state, state, state === target.state)).join("")}</select></label>${spineTarget ? `<label>Exact slot <select data-image-string-target-field="slot" data-image-string-node-index="${index}" data-image-string-target-index="${targetIndex}"><option value="">请选择 slot</option>${slots.map((slot) => option(slot, slot, slot === target.slot)).join("")}</select></label>` : '<span class="derived-field"><span>Attachment</span><strong>顶层 ImgNumber 图层</strong></span>'}<button type="button" data-image-string-target-remove="${targetIndex}" data-image-string-node-index="${index}">删除 target</button></div>`;
          })
          .join(
            "",
          )}<button type="button" data-image-string-target-add="${index}" ${exactTargetStates.length ? "" : "disabled"}>增加非 Spine target</button></fieldset>
        ${blurMarkup}
        <fieldset><legend>特殊数值图片</legend><p class="hint">完全匹配该整数时显示整张图片；未匹配的值继续按 glyph 渲染。</p>${(node.specialValueImages ?? []).map((mapping, mappingIndex) => `<div class="form-grid"><label>Value <input type="number" step="1" data-image-string-special-value="${mappingIndex}" data-image-string-node-index="${index}" value="${mapping.value}"></label>${resourceBindingMarkup("Image", mapping.image.replace(/^\.\//u, ""), { kind: "image-string-special-image", symbol: symbol.symbol, nodeIndex: index, mappingIndex })}<button type="button" data-image-string-special-remove="${mappingIndex}" data-image-string-node-index="${index}">删除映射</button></div>`).join("")}<button type="button" data-image-string-special-add="${index}">增加映射</button></fieldset>
        <label>Initial text <input data-image-string-node-field="initialText" data-image-string-node-index="${index}" value="${escapeAttr(node.initialText)}"></label>
        <div class="form-grid"><label>Anchor X <input type="number" min="0" max="1" step="0.01" data-image-string-node-field="anchor.x" data-image-string-node-index="${index}" value="${node.anchor.x}"></label><label>Anchor Y <input type="number" min="0" max="1" step="0.01" data-image-string-node-field="anchor.y" data-image-string-node-index="${index}" value="${node.anchor.y}"></label><label>X <input type="number" step="0.1" data-image-string-node-field="transform.x" data-image-string-node-index="${index}" value="${node.transform.x}"></label><label>Y <input type="number" step="0.1" data-image-string-node-field="transform.y" data-image-string-node-index="${index}" value="${node.transform.y}"></label><label>Scale <input type="number" min="0.01" step="0.01" data-image-string-node-field="transform.scale" data-image-string-node-index="${index}" value="${node.transform.scale}"></label></div>
        <label class="check-row"><input type="checkbox" data-image-string-node-field="followSlotColor" data-image-string-node-index="${index}" ${node.followSlotColor ? "checked" : ""}> Follow slot color</label>
        <label>Manual preview string <input data-image-string-preview="${escapeAttr(node.name)}" value="${escapeAttr(previewText)}"></label>
      </article>`;
      })
      .join("") ||
    '<p class="empty">尚未配置命名 image-string 节点。先导入 dependency，并为 symbol 配置 state。</p>'
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
    : `${visualFieldsMarkup(project, symbol, state, visual, thumbnail)}${addAnimationLayerMarkup(symbol, state, visual)}`;
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
      ${symbolStateAudioMarkup(project, symbol, state)}
    </article>
  </section>`;
}

function symbolStateAudioMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  state: string,
): string {
  const audioAssets = [...project.assetLibrary.records.values()].filter(
    (record) => record.kind === "audio" && record.diagnostics.length === 0,
  );
  const effects = new Map(
    project.audio.effects.map((effect) => [effect.name, effect]),
  );
  const cards = symbol.audioCues
    .filter((cue) => cue.state === state)
    .map((cue) => effects.get(cue.effect))
    .filter((effect): effect is AudioEffectBindingV1 => Boolean(effect))
    .map(
      (
        effect,
      ) => `<article class="asset-card audio-effect-card" data-state-audio-card="${escapeAttr(effect.name)}">
        <header><div><strong>${escapeHtml(effect.name)}</strong><small>进入 ${escapeHtml(state)} 时触发</small></div><button type="button" data-remove-state-audio="${escapeAttr(effect.name)}">删除</button></header>
        <div class="form-grid">
          <label>音频资源 <select data-state-audio-field="asset" data-state-audio-effect="${escapeAttr(effect.name)}">${audioAssets.map((record) => option(record.path, record.path, record.path === effect.asset.sources[0]?.path)).join("")}</select></label>
          <label>播放 <select data-state-audio-field="playback" data-state-audio-effect="${escapeAttr(effect.name)}">${option("once", "once", effect.playback === "once")}${option("loop", "loop", effect.playback === "loop")}</select></label>
          <label>延迟（秒）<input type="number" min="0" step="0.01" value="${effect.offsetSeconds}" data-state-audio-field="delay" data-state-audio-effect="${escapeAttr(effect.name)}"></label>
          <label>BGM <select data-state-audio-field="bgm" data-state-audio-effect="${escapeAttr(effect.name)}">${option("keep", "keep", effect.bgm.kind === "keep")}${option("duck", "duck", effect.bgm.kind === "duck")}${option("pause", "pause", effect.bgm.kind === "pause")}</select></label>
        </div>
      </article>`,
    )
    .join("");
  return `<section class="audio-config state-audio-config"><div class="section-heading"><div><h3>状态音效</h3><p>只属于 ${escapeHtml(symbol.symbol)} / ${escapeHtml(state)}；可像图层一样添加多条，并按各自延迟触发。</p></div><span>${cards ? `${symbol.audioCues.filter((cue) => cue.state === state).length} 条` : "未配置"}</span></div>
    <div class="state-audio-list">${cards || '<p class="empty">当前状态没有音效。</p>'}</div>
    <div class="form-row"><input data-new-state-audio-name placeholder="局部名称（可选）"><select data-new-state-audio-path><option value="">选择音频资源</option>${audioAssets.map((record) => `<option value="${escapeAttr(record.path)}">${escapeHtml(record.path)}</option>`).join("")}</select><select data-new-state-audio-playback><option value="once">once</option><option value="loop">loop</option></select><input data-new-state-audio-delay type="number" min="0" step="0.01" value="0" aria-label="延迟秒"><select data-new-state-audio-bgm><option value="keep">BGM keep</option><option value="duck">BGM duck</option><option value="pause">BGM pause</option></select><button type="button" data-add-state-audio ${audioAssets.length ? "" : "disabled"}>添加到当前状态</button></div>
    ${audioAssets.length ? "" : '<p class="hint">请先在“资源”页导入音频文件。</p>'}
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
              return `${resourceBindingMarkup("Skeleton", animation.skeletonPath, { kind: "spine-skeleton", symbol: symbol.symbol, state, compositeLayerIndex: index })}${resourceBindingMarkup("Atlas", animation.atlasPath, { kind: "spine-atlas", symbol: symbol.symbol, state, compositeLayerIndex: index })}<label>Animation <select data-composite-layer-field="animationName" data-composite-layer-index="${index}"><option value="">选择动画…</option>${animations.map((name) => option(name, name, name === animation.animationName)).join("")}</select></label><details class="advanced-fields"><summary>Transform</summary><div class="form-grid">${compositeNumberField(index, "transform.x", "X", animation.transform?.x ?? 0)}${compositeNumberField(index, "transform.y", "Y", animation.transform?.y ?? 0)}${compositeNumberField(index, "transform.scale", "Scale", animation.transform?.scale ?? 1)}</div></details>`;
            })()
          : `${resourceBindingMarkup("VNI project", animation.projectPath, { kind: "vni-project", symbol: symbol.symbol, state, compositeLayerIndex: index })}<div class="form-grid">${compositeNumberField(index, "startTime", "Start", animation.startTime)}${compositeNumberField(index, "endTime", "End", animation.endTime)}</div>`;
      return `<article class="layer-card composite-layer-card"><header><strong>Animation layer ${index + 1}</strong><div class="button-row"><button data-composite-layer-action="up" data-composite-layer-index="${index}" ${index === 0 ? "disabled" : ""}>↑</button><button data-composite-layer-action="down" data-composite-layer-index="${index}" ${index === visual.layers.length - 1 ? "disabled" : ""}>↓</button><button data-composite-layer-action="remove" data-composite-layer-index="${index}" ${visual.layers.length === 1 ? "disabled" : ""}>删除</button></div></header><div class="form-grid"><label>Layer id <input data-composite-layer-field="id" data-composite-layer-index="${index}" value="${escapeAttr(layer.id)}"></label><label>位置 <select data-composite-layer-field="placement" data-composite-layer-index="${index}">${option("underlay", "图标下方", layer.placement === "underlay")}${option("overlay", "图标上方", layer.placement === "overlay")}</select></label><label>动画类型 <select data-composite-layer-field="kind" data-composite-layer-index="${index}">${option("spine", "Spine 4.3", animation.kind === "spine")}${option("vni", "VNI", animation.kind === "vni")}</select></label></div>${fields}</article>`;
    })
    .join("");
  return `${base}<section class="composite-layer-list"><div class="section-heading"><div><h3>附加动画层</h3><p>underlay 在图标下方，overlay 在图标上方；同组按列表顺序叠放。</p></div><button data-composite-layer-action="add">增加动画层</button></div>${layers}</section>`;
}

function addAnimationLayerMarkup(
  symbol: EditorSymbolDraft,
  state: string,
  visual: EditorStateVisual,
): string {
  if (visual.kind === "composite" || symbol.valuePresentation) return "";
  const supported =
    visual.kind === "spine" ||
    visual.kind === "vni" ||
    visual.kind === "image" ||
    (state === "normal" &&
      (visual.kind === "empty" || visual.kind === "layered-image"));
  if (!supported) return "";
  const retained =
    visual.kind === "spine" || visual.kind === "vni"
      ? "现有动画会保留为第一层。"
      : "现有图标会原样保留为 base。";
  return `<section class="composite-layer-list"><div class="section-heading"><div><h3>附加动画层</h3><p>${retained}无需切换 Visual kind。</p></div><button data-add-animation-layer>增加动画层</button></div></section>`;
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

function valueInspectorMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  session: SymbolsEditorUiSession,
): string {
  const value = symbol.valuePresentation;
  if (!value)
    return `<section class="empty-feature"><h2>Spine 档位</h2><p>先按数值范围配置各档 Spine 资源，再到“状态”中为全部档位统一选择动画。</p><button class="primary" data-enable-value>启用 Spine 档位</button></section>`;
  const previewValue = session.getPreviewValue(project, symbol.symbol);
  const activePreviewTier = session.getActivePreviewTier(
    project,
    symbol.symbol,
  );
  return `<section class="value-editor"><div class="section-heading"><div><h2>Spine 档位</h2><p>每档只配置 skeleton / atlas 与阈值；atlas pages 自动确定贴图资源，状态动画在下一步统一配置。</p></div><button data-disable-value>停用</button></div>
    <section class="tier-preview active"><label>预览数值 <input data-value-preview type="number" min="1" step="1" value="${previewValue}"></label><span class="status-ready">当前命中 Tier ${activePreviewTier + 1}</span><small>输入一个数值，由档位阈值自动选择 Spine 与 ImgNumber；仅当前编辑会话生效</small></section>
    <h3>Default values</h3><div class="compact-list">${value.defaultValues.map((candidate, index) => `<div class="form-row"><input data-value-field="defaultValues.${index}" data-value-type="number" type="number" min="1" step="1" value="${candidate}"><button data-value-action="move-default" data-value-index="${index}" data-direction="-1" aria-label="上移 value">↑</button><button data-value-action="move-default" data-value-index="${index}" data-direction="1" aria-label="下移 value">↓</button><button data-value-action="remove-default" data-value-index="${index}">删除</button></div>`).join("")}</div><div class="form-row"><input data-new-default type="number" min="1" step="1" value="1"><button data-value-action="add-default">增加 value</button></div>
    <h3>Reel normal</h3><div class="form-grid">${valueNumberField("reelStates.normal.width", value.reelStates.normal.width, "Width")}${valueNumberField("reelStates.normal.height", value.reelStates.normal.height, "Height")}</div>
    <h3>Spine tiers</h3><div class="tier-list">${value.tiers.map((tier, index) => valueTierMarkup(project, symbol, tier, index, index === activePreviewTier, session.expandedTier === index)).join("")}</div><button data-value-action="add-tier">增加 tier</button>
    <p class="hint">档位资源完成后，进入“状态”统一选择 normal / win / remove 等动画；静态模糊图在对应状态单独配置。</p>
    ${valueNumberPresentationMarkup(project, symbol)}
  </section>`;
}

function valueNumberPresentationMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): string {
  const value = symbol.valuePresentation!;
  const modeButtons = `<div class="button-row"><button data-value-action="text-type" data-text-type="font">Font</button><button data-value-action="text-type" data-text-type="image">完整数值图片</button><button data-value-action="text-type" data-text-type="image-string">ImgNumber（每档独立）</button></div>`;
  if (value.text.type === "image-string") {
    if ("tierResources" in value.text) {
      const text = value.text;
      const slots = valueSlotOptions(project, symbol);
      const specialsReady = (text.specialValueImages ?? []).every((mapping) =>
        Boolean(
          mapping.image &&
          project.assetLibrary.records.has(mapping.image.replace(/^\.\//u, "")),
        ),
      );
      const normalReady = slots.includes(text.slot) && specialsReady;
      const normalCard = `<article class="tier-card value-number-tier"><header><strong>Normal 共享配置</strong><span class="status-${normalReady ? "ready" : "missing"}">${normalReady ? "就绪" : "未完成"}</span></header>${tierValueSelectField(0, "slot", text.slot, slots, "所有 Spine 档位共用 slot")}<div class="derived-field"><span>状态控制</span><strong>所有 Spine state 使用同名 slot</strong><small>显示、移动与弹出时机完全由 Spine animation 决定</small></div><div class="form-grid">${tierValueNumberField(0, "transform.x", text.transform.x, "X")}${tierValueNumberField(0, "transform.y", text.transform.y, "Y")}${tierValueNumberField(0, "transform.scale", text.transform.scale, "Scale")}</div><label><input data-value-image-string-field="followSlotColor" data-value-tier-index="0" type="checkbox" ${text.followSlotColor ? "checked" : ""}> Follow slot color</label><fieldset><legend>特殊数值图片</legend><p class="hint">共享给全部档位；未命中值使用当前档位 glyph。</p>${(text.specialValueImages ?? []).map((mapping, mappingIndex) => `<div class="form-grid"><label>Value <input type="number" step="1" data-value-special-value="${mappingIndex}" data-value-tier-index="0" value="${mapping.value}"></label>${resourceBindingMarkup("Image", mapping.image.replace(/^\.\//u, ""), { kind: "value-image-string-special-image", symbol: symbol.symbol, tierIndex: 0, mappingIndex })}<button type="button" data-value-special-remove="${mappingIndex}" data-value-tier-index="0">删除映射</button></div>`).join("")}<button type="button" data-value-special-add="0">增加映射</button></fieldset></article>`;
      return `<section class="number-presentation"><h3>ImgNumber 共享 Normal 配置</h3>${modeButtons}<p>每档 JSON 与模糊状态在对应 Spine 档位内编辑；slot、位置、颜色与特殊值只在此配置一次。</p><div class="tier-list">${normalCard}</div></section>`;
    }
    return `<section class="number-presentation"><h3>Number presentation</h3>${modeButtons}<p class="hint">Legacy：各档原有独立 dependency、slot 与显示配置已放回对应 Spine 档位卡，不自动迁移或广播。</p></section>`;
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
  activePreview: boolean,
  expanded: boolean,
): string {
  const skeleton = tier.animation.skeleton.replace(/^\.\//u, "");
  const atlas = tier.animation.atlas.replace(/^\.\//u, "");
  const ready = Boolean(skeleton && atlas && tier.animation.texture);
  return `<details class="tier-card ${activePreview ? "active-preview" : ""}" data-tier-index="${index}" ${expanded ? "open" : ""}><summary><strong>Tier ${index + 1}</strong><span>${index < (symbol.valuePresentation?.tiers.length ?? 0) - 1 ? `&lt; ${tier.maxExclusive}` : "unbounded"}</span>${activePreview ? '<span class="status-ready">当前预览档位</span>' : ""}<span class="status-${ready ? "ready" : "missing"}">${ready ? "Spine 就绪" : "Spine 未完成"}</span></summary><div class="tier-body">${index < symbol.valuePresentation!.tiers.length - 1 ? valueNumberField(`tiers.${index}.maxExclusive`, tier.maxExclusive!, "maxExclusive") : '<p class="empty">最终 tier 无上界</p>'}${resourceBindingMarkup("Skeleton", skeleton, { kind: "value-tier-resource", symbol: symbol.symbol, tierIndex: index, field: "skeleton" })}${resourceBindingMarkup("Atlas", atlas, { kind: "value-tier-resource", symbol: symbol.symbol, tierIndex: index, field: "atlas" })}${valueTierImageStringMarkup(project, symbol, index)}<details class="advanced-fields"><summary>Spine Transform</summary><div class="form-grid">${valueNumberField(`tiers.${index}.animation.transform.x`, tier.animation.transform?.x ?? 0, "X")}${valueNumberField(`tiers.${index}.animation.transform.y`, tier.animation.transform?.y ?? 0, "Y")}${valueNumberField(`tiers.${index}.animation.transform.scale`, tier.animation.transform?.scale ?? 1, "Scale")}</div></details><div class="button-row"><button data-value-action="move-tier" data-value-index="${index}" data-direction="-1" ${index === 0 ? "disabled" : ""}>↑</button><button data-value-action="move-tier" data-value-index="${index}" data-direction="1" ${index === symbol.valuePresentation!.tiers.length - 1 ? "disabled" : ""}>↓</button><button data-value-action="remove-tier" data-value-index="${index}">删除 tier</button></div></div></details>`;
}

function valueTierImageStringMarkup(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
  tierIndex: number,
): string {
  const text = symbol.valuePresentation?.text;
  if (text?.type !== "image-string") return "";
  const dependencies = [...project.imageStringDependencies.values()].sort(
    (left, right) => left.id.localeCompare(right.id, "en"),
  );
  const binding =
    "tierResources" in text
      ? {
          resource: text.tierResources[tierIndex] ?? "",
          spinBlurProfile: text.tierSpinBlurProfiles?.[tierIndex] ?? undefined,
        }
      : text.tiers[tierIndex];
  if (!binding) return '<p class="status-missing">ImgNumber 档位缺失</p>';
  const dependency = dependencies.find(
    (candidate) =>
      binding.resource === candidate.rootKey ||
      binding.resource === `./${candidate.rootKey}`,
  );
  const dependencyOptions = [
    `<option value="" ${binding.resource ? "" : "selected"}>未选择 dependency</option>`,
    ...dependencies.map((candidate) =>
      option(
        `./${candidate.rootKey}`,
        `${candidate.id} · ${candidate.rootKey}`,
        binding.resource === candidate.rootKey ||
          binding.resource === `./${candidate.rootKey}`,
      ),
    ),
  ].join("");
  const availability = getValueImageStringSpinBlurAvailability(
    project,
    symbol.symbol,
    tierIndex,
  );
  const blurBound = Boolean(binding.spinBlurProfile);
  const blurStatus = availability.ready
    ? blurBound
      ? "已绑定模糊 profile"
      : "可生成并绑定"
    : availability.reason;
  const blurButtonDisabled =
    !availability.ready || availability.alreadyBound ? "disabled" : "";
  const sharedMarkup = `<section class="value-tier-imgnumber"><header><strong>Tier ${tierIndex + 1} ImgNumber</strong><span class="status-${dependency ? "ready" : "missing"}">${dependency ? "Normal 就绪" : "Normal 未完成"}</span><span class="status-${blurBound ? "ready" : "missing"}">${blurBound ? "spinBlur 已绑定" : "spinBlur 未绑定"}</span></header><label>Normal ImgNumber dependency <select data-value-image-string-field="resource" data-value-tier-index="${tierIndex}">${dependencyOptions}</select></label><section class="state-texture-generation"><div><strong>spinBlur ImgNumber</strong><small>${escapeHtml(blurStatus)}</small></div><button type="button" data-generate-value-spin-blur="${tierIndex}" ${blurButtonDisabled}>${blurBound ? "已生成并绑定" : "生成并绑定模糊 ImgNumber"}</button></section>`;
  if ("tierResources" in text) return `${sharedMarkup}</section>`;
  const legacy = text.tiers[tierIndex]!;
  const slots = valueTierSlotOptions(project, symbol, tierIndex);
  return `${sharedMarkup}${tierValueSelectField(tierIndex, "slot", legacy.slot, slots, `Tier ${tierIndex + 1} slot`)}<div class="derived-field"><span>Alignment</span><strong>动态内容中心对齐</strong></div><div class="form-grid">${tierValueNumberField(tierIndex, "transform.x", legacy.transform.x, "X")}${tierValueNumberField(tierIndex, "transform.y", legacy.transform.y, "Y")}${tierValueNumberField(tierIndex, "transform.scale", legacy.transform.scale, "Scale")}</div><label><input data-value-image-string-field="followSlotColor" data-value-tier-index="${tierIndex}" type="checkbox" ${legacy.followSlotColor ? "checked" : ""}> Follow slot color</label><fieldset><legend>特殊数值图片</legend>${(legacy.specialValueImages ?? []).map((mapping, mappingIndex) => `<div class="form-grid"><label>Value <input type="number" step="1" data-value-special-value="${mappingIndex}" data-value-tier-index="${tierIndex}" value="${mapping.value}"></label>${resourceBindingMarkup("Image", mapping.image.replace(/^\.\//u, ""), { kind: "value-image-string-special-image", symbol: symbol.symbol, tierIndex, mappingIndex })}<button type="button" data-value-special-remove="${mappingIndex}" data-value-tier-index="${tierIndex}">删除映射</button></div>`).join("")}<button type="button" data-value-special-add="${tierIndex}">增加映射</button></fieldset></section>`;
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

function projectWorkspaceMarkup(
  project: SymbolEditorProject,
  session: SymbolsEditorUiSession,
): string {
  return `<section class="project-config"><div class="section-heading"><div><h1>项目配置</h1><p>全局内容独立于单个 symbol Inspector。</p></div></div><div class="form-grid"><label>Package / project id <input data-project-id data-focus-key="project-id" value="${escapeAttr(project.id)}"></label><label>Cell width <input data-cell-width type="number" min="1" value="${project.cellSize.width}"></label><label>Cell height <input data-cell-height type="number" min="1" value="${project.cellSize.height}"></label></div>
    <section class="audio-config"><h2>音频预览</h2><p>音效在“Symbols → 状态”中按单个 Symbol 的单个状态配置，可为同一状态添加多条。这里仅选择哪个 Symbol 可以发声。</p><label>试听 Symbol（单选）<select data-audio-preview-symbol>${[
      ...project.symbols.values(),
    ]
      .filter((symbol) => symbol.included)
      .map(
        (symbol) =>
          `<option value="${escapeAttr(symbol.symbol)}" ${symbol.symbol === session.audioPreviewSymbol ? "selected" : ""}>${escapeHtml(symbol.symbol)}</option>`,
      )
      .join(
        "",
      )}</select></label><p class="hint">该选择只控制声音 sink；画面仍可同时预览全部 Symbol。当前项目共 ${project.audio.effects.length} 条状态音效。</p></section>
    <h2>项目状态定义</h2><div class="definition-list">${project.stateDefinitions.map((item) => `<div class="definition-row"><code>${escapeHtml(item.id)}</code><small>${item.phase} / ${item.playback}</small><span>${item.source === "custom" ? "Custom" : "Built-in"}</span>${item.afterComplete ? `<label>完成后 <select data-state-after-complete="${escapeAttr(item.id)}">${option("return-to-default", "回到 normal", item.afterComplete === "return-to-default")}${option("terminal", "停在终止帧", item.afterComplete === "terminal")}</select></label>` : ""}${item.source === "custom" ? `<button data-remove-custom="${escapeAttr(item.id)}">删除</button>` : ""}</div>`).join("")}</div><div class="form-row add-definition"><input data-custom-id placeholder="custom state id"><select data-custom-lifecycle><option value="once">once / once</option><option value="loop">stable / loop</option></select><select data-custom-after-complete><option value="return-to-default">完成后回到 normal</option><option value="terminal">完成后停在终止帧</option></select><button class="primary" data-add-custom>增加 custom state</button></div>
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
  previewValueForSymbol: (symbol: string) => number,
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
      ...(symbol.valuePresentation
        ? { value: previewValueForSymbol(symbol.symbol) }
        : {}),
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
  const currentIsComposite = symbol.states.get(state)?.kind === "composite";
  if (state === "normal")
    return [
      "empty",
      "image",
      "layered-image",
      "spine",
      "vni",
      ...(currentIsComposite ? ["composite"] : []),
    ];
  const kinds = ["empty-state", "image", "spine", "vni", "static"];
  if (currentIsComposite) kinds.push("composite");
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
    specialValueImages: [],
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

export function getSharedSpineSlotOptions(
  project: SymbolEditorProject,
  symbol: EditorSymbolDraft,
): readonly string[] {
  if (symbol.valuePresentation) return valueSlotOptions(project, symbol);
  const sets = symbol.stateOrder.flatMap((state) => {
    const visual = symbol.states.get(state);
    return visual?.kind === "spine"
      ? [
          new Set(
            assetMetadataList(
              project.assetLibrary.records.get(visual.skeletonPath),
              "slotNames",
            ),
          ),
        ]
      : [];
  });
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

function isImageStringSpineTarget(
  symbol: EditorSymbolDraft,
  state: string,
): boolean {
  return (
    (state === "normal" && Boolean(symbol.valuePresentation)) ||
    symbol.states.get(state)?.kind === "spine" ||
    symbol.states.get(state)?.kind === "activeSpine"
  );
}

function nextSpecialValue(
  mappings: readonly { readonly value: number }[],
): number {
  const used = new Set(mappings.map((mapping) => mapping.value));
  let candidate = 0;
  while (used.has(candidate)) candidate += 1;
  return candidate;
}

function getCurrentResourcePath(
  project: SymbolEditorProject,
  context: ResourceBindingContext,
): string {
  const symbol = project.symbols.get(context.symbol)!;
  if (context.kind === "image-string-special-image")
    return (
      symbol.imageStringNodes[context.nodeIndex]?.specialValueImages?.[
        context.mappingIndex
      ]?.image.replace(/^\.\//u, "") ?? ""
    );
  if (context.kind === "value-image-string-special-image")
    return symbol.valuePresentation?.text.type === "image-string"
      ? (("tierResources" in symbol.valuePresentation.text
          ? symbol.valuePresentation.text
          : symbol.valuePresentation.text.tiers[context.tierIndex]
        )?.specialValueImages?.[context.mappingIndex]?.image.replace(
          /^\.\//u,
          "",
        ) ?? "")
      : "";
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

function tierValueSelectField(
  tierIndex: number,
  field: string,
  current: string,
  values: readonly string[],
  label: string,
): string {
  return `<label>${escapeHtml(label)} <select data-value-image-string-field="${escapeAttr(field)}" data-value-tier-index="${tierIndex}"><option value="">选择…</option>${values.map((value) => option(value, value, value === current)).join("")}</select></label>`;
}

function tierValueNumberField(
  tierIndex: number,
  field: string,
  value: number,
  label: string,
): string {
  return `<label>${escapeHtml(label)} <input data-value-image-string-field="${escapeAttr(field)}" data-value-tier-index="${tierIndex}" type="number" step="0.01" value="${value}"></label>`;
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

type MutableAudioEffect = {
  -readonly [Key in keyof AudioEffectBindingV1]: AudioEffectBindingV1[Key];
} & {
  voices: {
    maxConcurrent: number;
    overflow: "reject" | "restart-oldest";
  };
};

function audioFocus(value: string): AudioEffectBindingV1["bgm"] {
  if (value === "duck")
    return {
      kind: "duck",
      targetGain: 0.35,
      attackSeconds: 0.2,
      releaseSeconds: 0.5,
    };
  if (value === "pause")
    return { kind: "pause", fadeOutSeconds: 0.2, fadeInSeconds: 0.5 };
  return { kind: "keep" };
}

function createAudioEffect(
  name: string,
  path: string,
  mediaType: AudioMediaType,
  playback: "once" | "loop",
  offsetSeconds: number,
  focus: string,
): AudioEffectBindingV1 {
  return {
    name,
    asset: { sources: [{ path, mediaType }] },
    playback,
    offsetSeconds,
    voices: {
      maxConcurrent: playback === "loop" ? 1 : 4,
      overflow: "restart-oldest",
    },
    bgm: audioFocus(focus),
  };
}

function audioPathStem(path: string): string {
  return (
    path
      .split("/")
      .at(-1)
      ?.replace(/\.[^.]+$/u, "") || "audio"
  );
}

function normalizeAudioEffectName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, "-")
      .replace(/^-+|-+$/gu, "") || "audio"
  );
}

function allocateAudioEffectName(
  effects: readonly AudioEffectBindingV1[],
  requested: string,
): string {
  const base = normalizeAudioEffectName(requested);
  const names = new Set(effects.map((effect) => effect.name));
  if (!names.has(base)) return base;
  let suffix = 2;
  while (names.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}

function isAudioEffectReferenced(
  project: SymbolEditorProject,
  effectName: string,
): boolean {
  return [...project.symbols.values()].some((symbol) =>
    symbol.audioCues.some((cue) => cue.effect === effectName),
  );
}

function getOwnedStateAudioEffect(
  project: SymbolEditorProject,
  symbolName: string,
  state: string,
  effectName: string,
): MutableAudioEffect {
  const symbol = project.symbols.get(symbolName);
  if (!symbol) throw new Error(`Symbol 不存在：${symbolName}`);
  const source = project.audio.effects.find(
    (effect) => effect.name === effectName,
  );
  if (!source) throw new Error(`音效不存在：${effectName}`);
  const referenceCount = [...project.symbols.values()].reduce(
    (total, candidate) =>
      total +
      candidate.audioCues.filter((cue) => cue.effect === effectName).length,
    0,
  );
  if (referenceCount <= 1) return source as MutableAudioEffect;
  const ownedName = allocateAudioEffectName(
    project.audio.effects,
    `${effectName}-${symbolName}-${state}`,
  );
  const owned = structuredClone({ ...source, name: ownedName });
  project.audio = {
    ...project.audio,
    effects: [...project.audio.effects, owned],
  };
  symbol.audioCues = symbol.audioCues.map((cue) =>
    cue.state === state && cue.effect === effectName
      ? { ...cue, effect: ownedName }
      : cue,
  );
  return owned as MutableAudioEffect;
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
