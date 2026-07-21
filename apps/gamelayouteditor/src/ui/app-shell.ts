import {
  collectSceneLayoutAssetPaths,
  type SceneLayoutGameModeSnapshot,
  type SceneLayoutVariantId,
} from "@slotclientengine/rendercore/scene-layout";
import {
  createBoundedSourceIndex,
  ephemeralContentFingerprint,
  suggestLogicalResourceId,
} from "@slotclientengine/browserartifactio";
import { ObjectUrlRegistry } from "../io/object-url-registry.js";
import { exportLayoutZip } from "../io/exported-layout-zip.js";
import { importLayoutZip } from "../io/imported-layout-zip.js";
import { importSymbolsZipWithFiles } from "../io/imported-symbol-package.js";
import { importPopupPackageZip } from "../io/imported-popup-package.js";
import {
  createSymbolPackageResource,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol";
import {
  activeVariantIds,
  cloneEditorProject,
  createNewEditorProject,
  editorProjectToManifest,
  editorProjectToPreviewManifest,
  manifestToEditorProject,
  setVariantArtSizeDimension,
  updateVariantFocusFromReel,
  type EditorProject,
} from "../model/editor-project.js";
import {
  EditorStore,
  type EditorStoreSnapshot,
} from "../model/editor-store.js";
import {
  addLayerFromResource,
  assignBackgroundResource,
  clearBackground,
  deleteLayoutResource,
  moveLayer,
  rebindLayerResource,
  removeLayer,
  renameNode,
  replaceImageResource,
  replaceImageStringResource,
  replaceSpineResource,
  replaceVideoResource,
  setLayerVariantVisibility,
  setImageStringLayerAnchor,
  setImageStringLayerText,
  setNodeDefaultAnimation,
  suggestNodeId,
  importImageStringZip,
  uploadImageResource,
  uploadSpineResource,
  uploadVideoResource,
} from "../model/resource-commands.js";
import {
  addGameMode,
  bindGameModeSymbols,
  bindGameModePopup,
  deleteGameMode,
  deletePopupDependency,
  importPopupDependency,
  importSymbolDependency,
  deleteSymbolDependency,
  replaceSymbolDependency,
  replacePopupDependency,
  renameGameMode,
  createGameModeTransition,
  deleteGameModeTransition,
  setGameModeTransitionAnimation,
  setGameModeTransitionEvent,
  setGameModeTransitionPlacement,
  setGameModeTransitionResource,
  setGameModeTransitionKind,
  setGameModeVideoTransitionFadeOut,
  setGameModeVideoTransitionResource,
  setInitialGameMode,
  setPopupPlacement,
} from "../model/game-mode-commands.js";
import {
  LayoutPreview,
  type SymbolPackagePreviewSnapshot,
} from "../preview/layout-preview.js";
import { PREVIEW_SIZE_PRESETS } from "../preview/preview-size.js";
import type { SymbolOtherScenePreviewBinding } from "../preview/other-scene-preview.js";
import { layoutWorkspaceMarkup } from "./layout-workspace.js";
import {
  transitionKey,
  transitionsWorkspaceMarkup,
  updateTransitionRuntimeUi,
} from "./transitions-workspace.js";
import { symbolsWorkspaceMarkup } from "./symbols-workspace.js";
import { bigWinWorkspaceMarkup } from "./bigwin-workspace.js";
import { projectWorkspaceMarkup } from "./project-workspace.js";
import {
  createResourcePickerState,
  getResourcePickerCandidates,
} from "./resource-picker.js";
import { resourcesWorkspaceMarkup } from "./resources-workspace.js";
import {
  createEditorUiSession,
  defaultLayoutSelection,
  normalizeLayoutSelection,
  type LayoutResourceBindingContext,
  type LayoutSelection,
  type WorkspaceTab,
} from "./ui-session.js";
import { escapeHtml } from "./ui-markup.js";
import {
  editorResourcePaths,
  type EditorLayoutResource,
} from "../model/editor-resource.js";

export class GameLayoutEditorApp {
  readonly #root: HTMLElement;
  readonly #store = new EditorStore(createNewEditorProject("maximized-focus"));
  readonly #session = createEditorUiSession();
  readonly #thumbnailUrls = new ObjectUrlRegistry();
  readonly #thumbnailEntries = new Map<
    string,
    { readonly fingerprint: string; readonly url: string }
  >();
  readonly #scrollPositions = new Map<string, number>();
  #preview: LayoutPreview | null = null;
  #unsubscribe: (() => void) | null = null;
  #previewRevision = 0;
  #previewModeRequest = 0;
  #previewModeFrame: number | null = null;
  #previewModeBusy = false;
  #destroyed = false;
  #symbolPackageMetadata: SymbolPackagePreviewSnapshot | null = null;
  #symbolImportRequest = 0;
  #symbolImportBusy = false;
  #pickerTrigger: HTMLElement | null = null;
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  #selectedGameMode = "BaseGame";
  #selectedPreviewMode = "BaseGame";
  #followEditMode = true;
  #selectedSymbolId: string | null = null;
  #selectedPopupId: string | null = null;

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  async init(): Promise<void> {
    this.#root.innerHTML = shellMarkup();
    const previewHost = this.requireElement("[data-preview-host]");
    const diagnostics = this.requireElement("[data-preview-diagnostics]");
    this.#preview = new LayoutPreview(previewHost, diagnostics);
    await this.#preview.init();
    this.bindStaticActions();
    this.#unsubscribe = this.#store.subscribe((snapshot) => {
      this.renderWorkspace(snapshot);
      this.syncSymbolPreviewGrid(snapshot.project);
      void this.refreshPreview(snapshot);
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#previewModeRequest += 1;
    this.stopPreviewModeMonitor();
    this.#previewModeBusy = false;
    this.#symbolImportRequest += 1;
    this.#symbolImportBusy = false;
    if (this.#feedbackTimer) clearTimeout(this.#feedbackTimer);
    this.closePicker(false);
    this.#unsubscribe?.();
    this.#preview?.destroy();
    this.#thumbnailUrls.destroy();
    this.#thumbnailEntries.clear();
    this.#root.replaceChildren();
  }

  private bindStaticActions(): void {
    const newDialog = this.requireElement(
      "[data-new-project-dialog]",
    ) as HTMLDialogElement;
    this.requireElement("[data-new-project]").addEventListener("click", () =>
      typeof newDialog.showModal === "function"
        ? newDialog.showModal()
        : newDialog.setAttribute("open", ""),
    );
    this.requireElement("[data-cancel-new-project]").addEventListener(
      "click",
      () =>
        typeof newDialog.close === "function"
          ? newDialog.close()
          : newDialog.removeAttribute("open"),
    );
    this.requireElement("[data-confirm-new-project]").addEventListener(
      "click",
      () => {
        const mode = this.#root.querySelector<HTMLInputElement>(
          '[name="new-project-mode"]:checked',
        )?.value as EditorProject["mode"] | undefined;
        if (!mode) return;
        this.createProject(mode);
        if (typeof newDialog.close === "function") newDialog.close();
        else newDialog.removeAttribute("open");
      },
    );
    const modeDialog = this.requireElement(
      "[data-mode-dialog]",
    ) as HTMLDialogElement;
    this.requireElement("[data-manage-modes]").addEventListener("click", () =>
      typeof modeDialog.showModal === "function"
        ? modeDialog.showModal()
        : modeDialog.setAttribute("open", ""),
    );
    this.requireElement("[data-close-mode-dialog]").addEventListener(
      "click",
      () =>
        typeof modeDialog.close === "function"
          ? modeDialog.close()
          : modeDialog.removeAttribute("open"),
    );
    this.requireElement("[data-import]").addEventListener("click", () => {
      void this.importZip();
    });
    this.requireElement("[data-export]").addEventListener("click", () => {
      void this.exportZip();
    });
    const tabs = [
      ...this.#root.querySelectorAll<HTMLButtonElement>('[role="tab"]'),
    ];
    tabs.forEach((tab, index) => {
      tab.addEventListener("click", () =>
        this.setActiveTab(tab.dataset.workspaceTab as WorkspaceTab),
      );
      tab.addEventListener("keydown", (event) => {
        let target = index;
        if (event.key === "ArrowLeft")
          target = (index - 1 + tabs.length) % tabs.length;
        else if (event.key === "ArrowRight") target = (index + 1) % tabs.length;
        else if (event.key === "Home") target = 0;
        else if (event.key === "End") target = tabs.length - 1;
        else return;
        event.preventDefault();
        tabs[target].focus();
        this.setActiveTab(tabs[target].dataset.workspaceTab as WorkspaceTab);
      });
    });
    this.requireElement("[data-import-symbols]").addEventListener(
      "click",
      () => void this.importSymbolsPackage(),
    );
    this.requireElement("[data-replace-symbols]").addEventListener(
      "click",
      () => {
        if (!this.#selectedSymbolId) {
          this.#store.setExternalError(
            new Error("尚未选择要替换的 Symbols dependency。"),
          );
          return;
        }
        void this.importSymbolsPackage(this.#selectedSymbolId);
      },
    );
    this.requireElement("[data-clear-symbols]").addEventListener("click", () =>
      this.clearSymbolsPackage(),
    );
    this.requireSelect("[data-symbol-dependency]").addEventListener(
      "change",
      (event) => {
        this.#selectedSymbolId =
          (event.currentTarget as HTMLSelectElement).value || null;
        void this.restoreProjectSymbolDependency(
          this.#store.getSnapshot().project,
          this.#selectedSymbolId,
        );
      },
    );
    this.requireSelect("[data-mode-symbols]").addEventListener(
      "change",
      (event) => {
        const id = (event.currentTarget as HTMLSelectElement).value || null;
        if (!id) {
          this.runTransaction((project) =>
            bindGameModeSymbols(project, this.#selectedGameMode, null),
          );
          return;
        }
        this.#selectedSymbolId = id;
        void this.bindSelectedSymbolDependencyToMode(id);
      },
    );
    this.requireElement("[data-import-popup]").addEventListener(
      "click",
      () => void this.importPopupPackage(),
    );
    this.requireElement("[data-replace-popup]").addEventListener(
      "click",
      () => {
        if (!this.#selectedPopupId) {
          this.#store.setExternalError(
            new Error("尚未选择要替换的 Popup dependency。"),
          );
          return;
        }
        void this.importPopupPackage(this.#selectedPopupId);
      },
    );
    this.requireSelect("[data-game-mode]").addEventListener(
      "change",
      (event) => {
        this.#selectedGameMode = (
          event.currentTarget as HTMLSelectElement
        ).value;
        if (this.#followEditMode) {
          this.#selectedPreviewMode = this.#selectedGameMode;
          void this.requestPreviewMode(this.#selectedPreviewMode);
        }
        this.renderWorkspace(this.#store.getSnapshot());
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.requireSelect("[data-preview-game-mode]").addEventListener(
      "change",
      (event) => {
        this.#selectedPreviewMode = (
          event.currentTarget as HTMLSelectElement
        ).value;
      },
    );
    this.requireInput("[data-follow-edit-mode]").addEventListener(
      "change",
      (event) => {
        this.#followEditMode = (
          event.currentTarget as HTMLInputElement
        ).checked;
        if (this.#followEditMode) {
          this.#selectedPreviewMode = this.#selectedGameMode;
          void this.requestPreviewMode(this.#selectedPreviewMode);
        }
      },
    );
    this.requireElement("[data-request-preview-mode]").addEventListener(
      "click",
      () => void this.requestPreviewMode(this.#selectedPreviewMode),
    );
    this.requireElement("[data-add-game-mode]").addEventListener(
      "click",
      () => {
        const id = this.requireInput("[data-new-game-mode]").value;
        this.runTransaction((project) => addGameMode(project, id));
        this.#selectedGameMode = id;
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.requireElement("[data-rename-game-mode]").addEventListener(
      "click",
      () => {
        const id = this.requireInput("[data-new-game-mode]").value;
        const previous = this.#selectedGameMode;
        this.runTransaction((project) => renameGameMode(project, previous, id));
        this.#selectedGameMode = id;
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.requireElement("[data-set-initial-mode]").addEventListener(
      "click",
      () =>
        this.runTransaction((project) =>
          setInitialGameMode(project, this.#selectedGameMode),
        ),
    );
    this.requireElement("[data-delete-game-mode]").addEventListener(
      "click",
      () => {
        const removed = this.#selectedGameMode;
        this.runTransaction((project) => deleteGameMode(project, removed));
        this.#selectedGameMode =
          this.#store.getSnapshot().project.gameModes.initialMode;
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.requireSelect("[data-mode-popup]").addEventListener(
      "change",
      (event) =>
        this.runTransaction((project) =>
          bindGameModePopup(
            project,
            this.#selectedGameMode,
            (event.currentTarget as HTMLSelectElement).value || null,
          ),
        ),
    );
    this.requireSelect("[data-popup-dependency]").addEventListener(
      "change",
      (event) => {
        this.#selectedPopupId =
          (event.currentTarget as HTMLSelectElement).value || null;
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.requireElement("[data-clear-popup]").addEventListener("click", () => {
      if (!this.#selectedPopupId) return;
      this.runTransaction((project) =>
        deletePopupDependency(project, this.#selectedPopupId!),
      );
      this.#selectedPopupId = null;
    });
    this.requireElement("[data-play-popup]").addEventListener("click", () => {
      try {
        this.#preview?.playAwardCelebration({
          betAmountRaw: Number(this.requireInput("[data-popup-bet]").value),
          winAmountRaw: Number(this.requireInput("[data-popup-win]").value),
        });
        this.renderPopupControls(this.#store.getSnapshot());
      } catch (error) {
        this.#store.setExternalError(error);
      }
    });
    this.requireElement("[data-advance-popup]").addEventListener(
      "click",
      () => {
        try {
          this.#preview?.advanceAwardCelebration();
          this.renderPopupControls(this.#store.getSnapshot());
        } catch (error) {
          this.#store.setExternalError(error);
        }
      },
    );
    this.requireElement("[data-dismiss-popup]").addEventListener(
      "click",
      () => {
        this.#preview?.dismissAwardCelebrationImmediately();
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-popup-placement]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          this.#store.transact((project) => {
            if (!this.#selectedPopupId)
              throw new Error("尚未选择 popup dependency。");
            const dependency = project.popupDependencies.get(
              this.#selectedPopupId,
            );
            if (!dependency) throw new Error("尚未选择 popup dependency。");
            const variant = input.dataset
              .popupPlacement as SceneLayoutVariantId;
            if (!activeVariantIds(project).includes(variant)) return;
            const placement = dependency.placements[variant];
            if (!placement)
              throw new Error(`popup placement ${variant} 缺失。`);
            const field = input.dataset.popupPlacementField as
              | "x"
              | "y"
              | "scale";
            const next = { ...placement, [field]: Number(input.value) };
            setPopupPlacement(project, this.#selectedPopupId, variant, next);
          });
        }),
      );
    this.requireSelect("[data-reel-set]").addEventListener(
      "change",
      (event) => {
        try {
          const name = (event.currentTarget as HTMLSelectElement).value;
          if (!name) throw new Error("请选择 reel set。");
          this.#symbolImportRequest += 1;
          this.#symbolPackageMetadata =
            this.#preview?.setSelectedReelSet(name) ?? null;
          this.#store.transact((draft) => {
            const mode = draft.gameModes.modes.find(
              (candidate) => candidate.id === this.#selectedGameMode,
            );
            if (!mode?.symbols)
              throw new Error("当前主状态尚未绑定 Symbols dependency。");
            mode.symbols.reelSet = name;
          });
          this.renderSymbolsMetadata();
        } catch (error) {
          this.#store.setExternalError(error);
          this.renderSymbolsMetadata();
        }
      },
    );
    this.requireSelect("[data-symbol-render-mode]").addEventListener(
      "change",
      (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value as
          | "standard"
          | "grid-cell";
        this.runTransaction((draft) => {
          const mode = draft.gameModes.modes.find(
            (candidate) => candidate.id === this.#selectedGameMode,
          );
          if (!mode?.symbols)
            throw new Error("当前主状态尚未绑定 Symbols dependency。");
          mode.symbols.renderMode = value;
        });
      },
    );
    this.requireElement("[data-randomize-symbols]").addEventListener(
      "click",
      () => {
        try {
          this.#symbolImportRequest += 1;
          this.#symbolPackageMetadata =
            this.#preview?.randomizeSymbols() ?? null;
          this.renderSymbolsMetadata();
        } catch (error) {
          this.#store.setExternalError(error);
        }
      },
    );
    const resolution = this.requireSelect("[data-preview-resolution]");
    resolution.replaceChildren(
      ...PREVIEW_SIZE_PRESETS.map((preset) => {
        const option = document.createElement("option");
        option.value = `${preset.width}x${preset.height}`;
        option.textContent = preset.label;
        return option;
      }),
      Object.assign(document.createElement("option"), {
        value: "custom",
        textContent: "自定义",
      }),
    );
    resolution.addEventListener("change", () => {
      if (resolution.value === "custom") return;
      const [width, height] = resolution.value.split("x").map(Number);
      this.setPreviewSize(width, height);
    });
    const width = this.requireInput("[data-preview-width]");
    const height = this.requireInput("[data-preview-height]");
    const applyCustom = () =>
      this.setPreviewSize(Number(width.value), Number(height.value));
    width.addEventListener("change", applyCustom);
    height.addEventListener("change", applyCustom);
    this.requireElement("[data-zoom-out]").addEventListener("click", () => {
      this.#preview?.setZoom((this.#preview?.zoom ?? 1) - 0.1);
      this.syncZoomLabel();
    });
    this.requireElement("[data-zoom-reset]").addEventListener("click", () => {
      this.#preview?.setZoom(1);
      this.syncZoomLabel();
    });
    this.requireElement("[data-zoom-in]").addEventListener("click", () => {
      this.#preview?.setZoom((this.#preview?.zoom ?? 1) + 0.1);
      this.syncZoomLabel();
    });
    const focusGuide = this.requireInput("[data-guide-focus]");
    const reelGuide = this.requireInput("[data-guide-reel]");
    const updateGuides = () =>
      this.#preview?.setGuideVisibility({
        showFocus: focusGuide.checked,
        showReels: reelGuide.checked,
      });
    focusGuide.addEventListener("change", updateGuides);
    reelGuide.addEventListener("change", updateGuides);
    this.bindResizeHandle();
    this.bindPickerActions();
  }

  private createProject(mode: EditorProject["mode"]): void {
    this.closePicker(false);
    this.resetSymbolsForProjectReplace();
    this.#session.activeTab = "assets";
    this.#session.selection = null;
    this.#session.expandedResourceIds.clear();
    this.#session.expandedInspectorSections.clear();
    this.#selectedGameMode = "BaseGame";
    this.#selectedPreviewMode = "BaseGame";
    this.#selectedSymbolId = null;
    this.#selectedPopupId = null;
    this.#store.replace(createNewEditorProject(mode));
    this.showFeedback("已新建项目。先上传资源，再显式设置背景或添加图层。");
  }

  private async requestPreviewMode(modeId: string): Promise<void> {
    const request = ++this.#previewModeRequest;
    try {
      if (!this.#preview?.getGameModeSnapshot())
        throw new Error(
          "当前配置尚未形成可切换的 package preview；请先修复项目错误。",
        );
      this.#previewModeBusy = true;
      const pending = this.#preview?.requestGameMode(modeId);
      this.startPreviewModeMonitor(request);
      await pending;
      if (request !== this.#previewModeRequest || this.#destroyed) return;
      this.#selectedPreviewMode = modeId;
    } catch (error) {
      if (request === this.#previewModeRequest && !this.#destroyed)
        this.#store.setExternalError(error);
    } finally {
      if (request === this.#previewModeRequest && !this.#destroyed) {
        this.#previewModeBusy = false;
        this.stopPreviewModeMonitor();
        this.renderWorkspace(this.#store.getSnapshot());
      }
    }
  }

  private async preparePreviewMode(modeId: string): Promise<void> {
    const request = ++this.#previewModeRequest;
    this.#previewModeBusy = false;
    this.stopPreviewModeMonitor();
    try {
      if (!this.#preview?.getGameModeSnapshot())
        throw new Error(
          "当前配置尚未形成可预加载的 package preview；请先修复项目错误。",
        );
      await this.#preview.prepareGameModeTransition(modeId);
      if (request !== this.#previewModeRequest || this.#destroyed) return;
      this.showFeedback(`转场目标 ${modeId} 已预加载，可由真实点击直接播放。`);
    } catch (error) {
      if (request === this.#previewModeRequest && !this.#destroyed)
        this.#store.setExternalError(error);
    } finally {
      if (request === this.#previewModeRequest && !this.#destroyed)
        this.renderWorkspace(this.#store.getSnapshot());
    }
  }

  private startPreviewModeMonitor(request: number): void {
    this.stopPreviewModeMonitor();
    const update = (): void => {
      if (request !== this.#previewModeRequest || this.#destroyed) {
        this.#previewModeFrame = null;
        return;
      }
      this.renderPreviewModeProgress();
      this.#previewModeFrame = window.requestAnimationFrame(update);
    };
    this.renderPreviewModeProgress();
    this.#previewModeFrame = window.requestAnimationFrame(update);
  }

  private stopPreviewModeMonitor(): void {
    if (this.#previewModeFrame === null) return;
    window.cancelAnimationFrame(this.#previewModeFrame);
    this.#previewModeFrame = null;
  }

  private renderPreviewModeProgress(): void {
    const project = this.#store.getSnapshot().project;
    const modeSnapshot = this.#preview?.getGameModeSnapshot() ?? null;
    this.renderPreviewRuntimeControls(project, modeSnapshot);
    if (this.#session.activeTab === "transitions")
      updateTransitionRuntimeUi(
        this.requireElement("[data-workspace-panel]"),
        modeSnapshot,
        this.#previewModeBusy || modeSnapshot?.phase === "transitioning",
      );
  }

  private async bindSelectedSymbolDependencyToMode(id: string): Promise<void> {
    try {
      const project = this.#store.getSnapshot().project;
      if (this.#symbolPackageMetadata?.packageId !== id)
        await this.restoreProjectSymbolDependency(project, id);
      const metadata = this.#symbolPackageMetadata;
      if (!metadata || metadata.packageId !== id || metadata.status !== "ready")
        throw new Error(`Symbols ${id} 必须先显式选择兼容 reel set。`);
      if (
        metadata.cellSize.width !== project.reel.cellWidth ||
        metadata.cellSize.height !== project.reel.cellHeight
      )
        throw new Error(
          `Symbols ${id} cellSize ${metadata.cellSize.width}x${metadata.cellSize.height} 与 main ${project.reel.cellWidth}x${project.reel.cellHeight} 不一致。`,
        );
      this.runTransaction((draft) =>
        bindGameModeSymbols(draft, this.#selectedGameMode, {
          packageId: id,
          reelSet: metadata.selectedReelSet!,
          renderMode:
            draft.gameModes.modes.find(
              (mode) => mode.id === this.#selectedGameMode,
            )?.symbols?.renderMode ?? "standard",
        }),
      );
    } catch (error) {
      this.#store.setExternalError(error);
      this.renderSymbolsMetadata();
    }
  }

  private setActiveTab(tab: WorkspaceTab): void {
    if (this.#session.activeTab === tab) return;
    this.captureScrollPositions();
    this.#session.activeTab = tab;
    if (tab === "layout") {
      this.#session.selection = normalizeLayoutSelection(
        this.#store.getSnapshot().project,
        this.#session.selection,
      );
    }
    this.renderWorkspace(this.#store.getSnapshot());
  }

  private renderWorkspace(snapshot: EditorStoreSnapshot): void {
    this.captureScrollPositions();
    const focusToken = this.captureFocusToken();
    this.#session.selection = normalizeLayoutSelection(
      snapshot.project,
      this.#session.selection,
    );
    if (
      this.#session.selectedTransitionKey &&
      !snapshot.project.gameModes.transitions.some(
        (transition) =>
          transitionKey(transition) === this.#session.selectedTransitionKey,
      )
    )
      this.#session.selectedTransitionKey = null;
    this.#session.selectedTransitionKey ??= snapshot.project.gameModes
      .transitions[0]
      ? transitionKey(snapshot.project.gameModes.transitions[0])
      : null;
    this.syncThumbnailUrls(snapshot.project);
    for (const tab of this.#root.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    )) {
      const active = tab.dataset.workspaceTab === this.#session.activeTab;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    const panel = this.requireElement("[data-workspace-panel]");
    const symbolsPanel = this.requireElement("[data-symbols-workspace]");
    const bigWinPanel = this.requireElement("[data-bigwin-workspace]");
    const fixedTab =
      this.#session.activeTab === "symbols" ||
      this.#session.activeTab === "bigwin";
    panel.hidden = fixedTab;
    symbolsPanel.hidden = this.#session.activeTab !== "symbols";
    bigWinPanel.hidden = this.#session.activeTab !== "bigwin";
    panel.setAttribute("aria-labelledby", `tab-${this.#session.activeTab}`);
    if (!fixedTab)
      panel.innerHTML =
        this.#session.activeTab === "assets"
          ? resourcesWorkspaceMarkup({
              project: snapshot.project,
              session: this.#session,
              thumbnailUrls: new Map(
                [...this.#thumbnailEntries].map(([id, entry]) => [
                  id,
                  entry.url,
                ]),
              ),
            })
          : this.#session.activeTab === "layout"
            ? layoutWorkspaceMarkup(
                snapshot.project,
                this.#session.selection,
                this.#selectedGameMode,
                this.#session,
              )
            : this.#session.activeTab === "transitions"
              ? transitionsWorkspaceMarkup({
                  project: snapshot.project,
                  selectedKey: this.#session.selectedTransitionKey,
                  snapshot: this.#preview?.getGameModeSnapshot() ?? null,
                })
              : projectWorkspaceMarkup(snapshot.project, snapshot.errors);
    if (!fixedTab) this.bindWorkspaceActions(snapshot.project);
    panel
      .querySelectorAll<HTMLDetailsElement>("[data-inspector-section]")
      .forEach((details) =>
        details.addEventListener("toggle", () => {
          const key = details.dataset.inspectorSection!;
          if (details.open) this.#session.expandedInspectorSections.add(key);
          else this.#session.expandedInspectorSections.delete(key);
        }),
      );
    this.restoreScrollPositions();
    this.restoreFocusToken(focusToken);
    this.renderPicker(snapshot.project);
    this.renderProjectStatus(snapshot);
    this.renderPopupControls(snapshot);
    this.renderSymbolsMetadata();
  }

  private renderPopupControls(snapshot: EditorStoreSnapshot): void {
    const project = snapshot.project;
    if (
      !project.gameModes.modes.some(
        (mode) => mode.id === this.#selectedGameMode,
      )
    )
      this.#selectedGameMode = project.gameModes.initialMode;
    if (
      !project.gameModes.modes.some(
        (mode) => mode.id === this.#selectedPreviewMode,
      )
    )
      this.#selectedPreviewMode = project.gameModes.initialMode;
    if (
      this.#selectedPopupId &&
      !project.popupDependencies.has(this.#selectedPopupId)
    )
      this.#selectedPopupId = null;
    this.#selectedPopupId ??=
      project.popupDependencies.keys().next().value ?? null;

    const modeSelect = this.requireSelect("[data-game-mode]");
    modeSelect.replaceChildren(
      ...project.gameModes.modes.map((mode) => {
        const option = document.createElement("option");
        option.value = mode.id;
        option.textContent = `${mode.id}${mode.id === project.gameModes.initialMode ? " (initial)" : ""}`;
        option.selected = mode.id === this.#selectedGameMode;
        return option;
      }),
    );
    const mode = project.gameModes.modes.find(
      (candidate) => candidate.id === this.#selectedGameMode,
    )!;
    const previewModeSelect = this.requireSelect("[data-preview-game-mode]");
    previewModeSelect.replaceChildren(
      ...project.gameModes.modes.map((candidate) => {
        const option = document.createElement("option");
        option.value = candidate.id;
        option.textContent = candidate.id;
        option.selected = candidate.id === this.#selectedPreviewMode;
        return option;
      }),
    );
    const popupSelect = this.requireSelect("[data-mode-popup]");
    const none = document.createElement("option");
    none.value = "";
    none.textContent = "无庆祝效果";
    popupSelect.replaceChildren(none);
    for (const id of project.popupDependencies.keys()) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = id;
      popupSelect.append(option);
    }
    popupSelect.value = mode.awardCelebrationPopupId ?? "";

    const dependencySelect = this.requireSelect("[data-popup-dependency]");
    const dependencyPlaceholder = document.createElement("option");
    dependencyPlaceholder.value = "";
    dependencyPlaceholder.textContent = "未选择";
    dependencySelect.replaceChildren(dependencyPlaceholder);
    for (const id of project.popupDependencies.keys()) {
      const option = document.createElement("option");
      option.value = id;
      option.textContent = id;
      dependencySelect.append(option);
    }
    dependencySelect.value = this.#selectedPopupId ?? "";

    const dependency = this.#selectedPopupId
      ? project.popupDependencies.get(this.#selectedPopupId)
      : undefined;
    const references = dependency
      ? project.gameModes.modes
          .filter(
            (candidate) => candidate.awardCelebrationPopupId === dependency.id,
          )
          .map((candidate) => candidate.id)
      : [];
    const totalBytes = dependency
      ? [...dependency.files.values()].reduce(
          (sum, bytes) => sum + bytes.byteLength,
          0,
        )
      : 0;
    this.requireElement("[data-popup-metadata]").textContent = dependency
      ? `${dependency.id} · ${dependency.files.size} files · ${totalBytes} bytes · 引用：${references.join(", ") || "无"}`
      : "未导入 Popup dependency。";
    for (const input of this.#root.querySelectorAll<HTMLInputElement>(
      "[data-popup-placement]",
    )) {
      const variant = input.dataset.popupPlacement as SceneLayoutVariantId;
      const placement = dependency?.placements[variant];
      const field = input.dataset.popupPlacementField as "x" | "y" | "scale";
      input.disabled = !placement;
      input.value = String(placement?.[field] ?? (field === "scale" ? 1 : 0));
    }

    const stateTarget = this.requireElement("[data-mode-node-states]");
    stateTarget.innerHTML =
      '<span class="hint">稳定场景保持独立 loop；有向切换在“转场”工作区配置。</span>';
    const modeSnapshot = this.#preview?.getGameModeSnapshot?.() ?? null;
    this.renderPreviewRuntimeControls(project, modeSnapshot);
  }

  private renderPreviewRuntimeControls(
    project: EditorProject,
    modeSnapshot: SceneLayoutGameModeSnapshot | null,
  ): void {
    const mode = project.gameModes.modes.find(
      (candidate) => candidate.id === this.#selectedGameMode,
    )!;
    const modeSelect = this.requireSelect("[data-game-mode]");
    const previewModeSelect = this.requireSelect("[data-preview-game-mode]");
    const popupSelect = this.requireSelect("[data-mode-popup]");
    const popupSnapshot = this.#preview?.getActiveAwardCelebrationSnapshot?.();
    const transitioning = Boolean(
      this.#previewModeBusy || modeSnapshot?.phase === "transitioning",
    );
    const popupActive = Boolean(
      popupSnapshot && !["idle", "complete"].includes(popupSnapshot.phase),
    );
    const hasPreviewEdge = Boolean(
      modeSnapshot &&
      project.gameModes.transitions.some(
        (transition) =>
          transition.fromModeId === modeSnapshot.stableMode &&
          transition.toModeId === this.#selectedPreviewMode,
      ),
    );
    modeSelect.disabled = transitioning || popupActive;
    previewModeSelect.disabled = Boolean(
      !modeSnapshot || transitioning || popupActive,
    );
    (
      this.requireElement("[data-request-preview-mode]") as HTMLButtonElement
    ).disabled = Boolean(
      !modeSnapshot || transitioning || popupActive || !hasPreviewEdge,
    );
    popupSelect.disabled = transitioning;
    const stableMode = project.gameModes.modes.find(
      (candidate) => candidate.id === modeSnapshot?.stableMode,
    );
    (this.requireElement("[data-play-popup]") as HTMLButtonElement).disabled =
      Boolean(transitioning || !stableMode?.awardCelebrationPopupId);
    (
      this.requireElement("[data-advance-popup]") as HTMLButtonElement
    ).disabled = !popupActive;
    (
      this.requireElement("[data-dismiss-popup]") as HTMLButtonElement
    ).disabled = !popupActive;
    this.requireElement("[data-popup-runtime-status]").textContent =
      modeSnapshot
        ? `mode ${modeSnapshot.phase}: stable=${modeSnapshot.stableMode} displayed=${modeSnapshot.displayedMode}${modeSnapshot.targetMode ? ` target=${modeSnapshot.targetMode} ${modeSnapshot.transitionPhase}` : ""} · popup=${mode.awardCelebrationPopupId ?? "无"}${popupSnapshot ? ` · ${popupSnapshot.phase}/${popupSnapshot.activeTierId ?? "none"}/${popupSnapshot.activeSegment ?? "none"}` : ""}`
        : `mode=${mode.id} · popup=${mode.awardCelebrationPopupId ?? "无"}`;
    this.requireElement("[data-main-state-status]").textContent = modeSnapshot
      ? `${modeSnapshot.phase} · stable=${modeSnapshot.stableMode} · displayed=${modeSnapshot.displayedMode}${modeSnapshot.targetMode ? ` · target=${modeSnapshot.targetMode} · ${modeSnapshot.transitionPhase}` : ""} · initial=${project.gameModes.initialMode}`
      : `initial=${project.gameModes.initialMode} · preview 未就绪`;
  }

  private bindWorkspaceActions(project: EditorProject): void {
    const panel = this.requireElement("[data-workspace-panel]");
    panel
      .querySelectorAll<HTMLButtonElement>("[data-transition-key]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#session.selectedTransitionKey = button.dataset.transitionKey!;
          this.renderWorkspace(this.#store.getSnapshot());
        }),
      );
    panel
      .querySelector<HTMLButtonElement>("[data-create-transition]")
      ?.addEventListener("click", () => {
        const from = panel.querySelector<HTMLSelectElement>(
          "[data-new-transition-from]",
        )?.value;
        const to = panel.querySelector<HTMLSelectElement>(
          "[data-new-transition-to]",
        )?.value;
        if (!from || !to) {
          this.#store.setExternalError(
            new Error("新建转场必须明确选择 from 与 to。"),
          );
          return;
        }
        this.#session.selectedTransitionKey = `${from}::${to}`;
        this.runTransaction(
          (draft) => createGameModeTransition(draft, from, to),
          `已创建转场 ${from} -> ${to}。`,
        );
      });
    panel
      .querySelector<HTMLSelectElement>("[data-transition-kind]")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value as
          | "spine"
          | "video";
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          setGameModeTransitionKind(draft, transition, value);
        });
      });
    panel
      .querySelector<HTMLSelectElement>("[data-transition-resource]")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          setGameModeTransitionResource(draft, transition, value);
        });
      });
    panel
      .querySelector<HTMLSelectElement>("[data-transition-video-resource]")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          setGameModeVideoTransitionResource(draft, transition, value);
        });
      });
    panel
      .querySelector<HTMLInputElement>("[data-transition-fade]")
      ?.addEventListener("change", (event) => {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          setGameModeVideoTransitionFadeOut(draft, transition, value);
        });
      });
    panel
      .querySelector<HTMLSelectElement>("[data-transition-animation]")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          setGameModeTransitionAnimation(draft, transition, value);
        });
      });
    panel
      .querySelector<HTMLSelectElement>("[data-transition-event]")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value;
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          setGameModeTransitionEvent(draft, transition, value);
        });
      });
    panel
      .querySelector<HTMLButtonElement>("[data-delete-transition]")
      ?.addEventListener("click", () => {
        const selected = project.gameModes.transitions.find(
          (candidate) =>
            transitionKey(candidate) === this.#session.selectedTransitionKey,
        );
        if (!selected) return;
        this.runTransaction((draft) =>
          deleteGameModeTransition(
            draft,
            selected.fromModeId,
            selected.toModeId,
          ),
        );
      });
    panel
      .querySelector<HTMLButtonElement>("[data-prepare-transition]")
      ?.addEventListener("click", () => {
        const selected = project.gameModes.transitions.find(
          (candidate) =>
            transitionKey(candidate) === this.#session.selectedTransitionKey,
        );
        if (selected) void this.preparePreviewMode(selected.toModeId);
      });
    panel
      .querySelector<HTMLButtonElement>("[data-cancel-prepared-transition]")
      ?.addEventListener("click", () => {
        try {
          this.#preview?.cancelPreparedGameModeTransition();
          this.renderWorkspace(this.#store.getSnapshot());
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    panel
      .querySelector<HTMLButtonElement>("[data-play-transition]")
      ?.addEventListener("click", () => {
        const selected = project.gameModes.transitions.find(
          (candidate) =>
            transitionKey(candidate) === this.#session.selectedTransitionKey,
        );
        if (selected) void this.requestPreviewMode(selected.toModeId);
      });
    panel
      .querySelector("[data-upload-resources]")
      ?.addEventListener("click", () => void this.uploadResources(false));
    panel
      .querySelector("[data-upload-folder]")
      ?.addEventListener("click", () => void this.uploadResources(true));
    const query = panel.querySelector<HTMLInputElement>(
      "[data-resource-query]",
    );
    query?.addEventListener("input", () => {
      this.#session.resourceQuery = query.value;
      this.renderWorkspace(this.#store.getSnapshot());
    });
    const type = panel.querySelector<HTMLSelectElement>("[data-resource-type]");
    type?.addEventListener("change", () => {
      this.#session.resourceType = type.value as
        | "all"
        | "image"
        | "spine"
        | "image-string"
        | "video";
      this.renderWorkspace(this.#store.getSnapshot());
    });
    const status = panel.querySelector<HTMLSelectElement>(
      "[data-resource-status]",
    );
    status?.addEventListener("change", () => {
      this.#session.resourceStatus = status.value as
        | "all"
        | "referenced"
        | "unused"
        | "error";
      this.renderWorkspace(this.#store.getSnapshot());
    });
    panel
      .querySelectorAll<HTMLButtonElement>("[data-toggle-resource]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const id = button.dataset.toggleResource!;
          if (this.#session.expandedResourceIds.has(id))
            this.#session.expandedResourceIds.delete(id);
          else this.#session.expandedResourceIds.add(id);
          this.renderWorkspace(this.#store.getSnapshot());
        }),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-resource-add-layer]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openPicker(
            { kind: "add-layer" },
            button,
            button.dataset.resourceAddLayer,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-resource-background]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openPicker(
            {
              kind: "assign-background",
              modeId: this.#selectedGameMode,
              variant: button.dataset.resourceBackground as
                | "default"
                | "landscape"
                | "portrait",
            },
            button,
            button.dataset.resourceId,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-delete-resource]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const id = button.dataset.deleteResource!;
          if (!window.confirm(`确认删除未引用资源 ${id} 及其精确 bytes？`))
            return;
          this.runTransaction(
            (draft) => deleteLayoutResource(draft, id),
            `已删除资源 ${id}。`,
          );
        }),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-replace-resource]")
      .forEach((button) =>
        button.addEventListener(
          "click",
          () => void this.replaceResource(button.dataset.replaceResource!),
        ),
      );
    panel
      .querySelector("[data-open-add-layer]")
      ?.addEventListener("click", (event) =>
        this.openPicker(
          { kind: "add-layer" },
          event.currentTarget as HTMLElement,
        ),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-outline-key]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.selectOutline(button.dataset.outlineKey!),
        ),
      );
    const outline = panel.querySelector<HTMLElement>("[data-outline-list]");
    outline?.addEventListener("keydown", (event) =>
      this.handleOutlineKeydown(event),
    );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-choose-background]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openPicker(
            {
              kind: "assign-background",
              modeId: this.#selectedGameMode,
              variant: button.dataset.chooseBackground as
                | "default"
                | "landscape"
                | "portrait",
            },
            button,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-clear-background]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const variant = button.dataset.clearBackground as
            | "default"
            | "landscape"
            | "portrait";
          const nodeId = project.gameModes.modes.find(
            (mode) => mode.id === this.#selectedGameMode,
          )?.backgroundNodes[variant];
          if (
            !window.confirm(`确认清除 ${variant} 背景 ${nodeId}？资源会保留。`)
          )
            return;
          this.runTransaction(
            (draft) => clearBackground(draft, this.#selectedGameMode, variant),
            `已清除 ${variant} 背景；资源仍保留。`,
          );
        }),
      );
    panel
      .querySelectorAll<HTMLInputElement>("[data-node-id]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          const previous = input.dataset.nodeId!;
          const next = input.value;
          const wasSelectedLayer =
            this.#session.selection?.kind === "layer" &&
            this.#session.selection.nodeId === previous;
          try {
            this.#store.transact((draft) => renameNode(draft, previous, next));
            if (wasSelectedLayer) {
              this.#session.selection = { kind: "layer", nodeId: next };
            }
            this.renderWorkspace(this.#store.getSnapshot());
            this.showFeedback(`节点已重命名为 ${next}。`);
          } catch (error) {
            this.#store.setExternalError(error);
          }
        }),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-rebind-layer]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.openPicker(
            { kind: "rebind-layer", nodeId: button.dataset.rebindLayer! },
            button,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-move-layer]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          if (this.#session.selection?.kind !== "layer") return;
          const nodeId = this.#session.selection.nodeId;
          const direction = Number(button.dataset.moveLayer) as -1 | 1;
          this.runTransaction(
            (draft) => moveLayer(draft, nodeId, direction),
            "图层顺序已更新。",
          );
        }),
      );
    panel
      .querySelectorAll<HTMLSelectElement>("[data-layer-animation]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.runTransaction(
            (draft) =>
              setNodeDefaultAnimation(
                draft,
                select.dataset.layerAnimation!,
                select.value,
              ),
            `已设置 animation ${select.value}。`,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLInputElement>("[data-image-string-text]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.runTransaction((draft) =>
            setImageStringLayerText(
              draft,
              input.dataset.imageStringText!,
              input.value,
            ),
          ),
        ),
      );
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-image-string-anchor-x],[data-image-string-anchor-y]",
    )) {
      input.addEventListener("change", () => {
        const nodeId =
          input.dataset.imageStringAnchorX ?? input.dataset.imageStringAnchorY!;
        const node = this.#store
          .getSnapshot()
          .project.nodes.find((item) => item.id === nodeId)!;
        const xInput = panel.querySelector<HTMLInputElement>(
          `[data-image-string-anchor-x="${cssEscape(nodeId)}"]`,
        )!;
        const yInput = panel.querySelector<HTMLInputElement>(
          `[data-image-string-anchor-y="${cssEscape(nodeId)}"]`,
        )!;
        this.runTransaction((draft) =>
          setImageStringLayerAnchor(draft, node.id, {
            x: Number(xInput.value),
            y: Number(yInput.value),
          }),
        );
      });
    }
    panel
      .querySelectorAll<HTMLInputElement>("[data-layer-visible]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.runTransaction(
            (draft) =>
              setLayerVariantVisibility(
                draft,
                input.dataset.layerNodeId!,
                input.dataset.layerVisible as "landscape" | "portrait",
                input.checked,
              ),
            input.checked
              ? `${input.dataset.layerVisible} placement 已以固定初值创建。`
              : `${input.dataset.layerVisible} placement 已删除。`,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLButtonElement>("[data-remove-layer]")
      .forEach((button) =>
        button.addEventListener("click", () =>
          this.removeSelectedLayer(button.dataset.removeLayer!),
        ),
      );
    panel.querySelectorAll<HTMLInputElement>("[data-number]").forEach((input) =>
      input.addEventListener("change", () => {
        this.runTransaction((draft) => {
          const path = input.dataset.number!;
          const artSizeMatch =
            /^variants\.(default|landscape|portrait)\.artSize\.(width|height)$/u.exec(
              path,
            );
          const transitionPlacementMatch =
            /^transition\.(default|landscape|portrait)\.(x|y|scale)$/u.exec(
              path,
            );
          if (transitionPlacementMatch) {
            const transition = draft.gameModes.transitions.find(
              (candidate) =>
                transitionKey(candidate) ===
                this.#session.selectedTransitionKey,
            );
            if (!transition) throw new Error("所选转场已不存在。");
            if (transition.kind !== "spine")
              throw new Error("video 转场没有 art-space placement。");
            const variant = transitionPlacementMatch[1] as SceneLayoutVariantId;
            const field = transitionPlacementMatch[2] as "x" | "y" | "scale";
            const current = transition.placements[variant] ?? {
              x: 0,
              y: 0,
              scale: 1,
            };
            setGameModeTransitionPlacement(draft, transition, variant, {
              ...current,
              [field]: Number(input.value),
            });
          } else if (artSizeMatch) {
            setVariantArtSizeDimension(
              draft,
              artSizeMatch[1] as "default" | "landscape" | "portrait",
              artSizeMatch[2] as "width" | "height",
              Number(input.value),
            );
          } else {
            setPath(draft, path, Number(input.value));
          }
          if (path.startsWith("reel.")) {
            for (const variant of activeVariantIds(draft)) {
              updateVariantFocusFromReel(draft, variant);
            }
          } else if (!artSizeMatch && !transitionPlacementMatch) {
            const match =
              /^variants\.(default|landscape|portrait)\.(focusOffsets|artSize)\./u.exec(
                path,
              );
            if (match) {
              updateVariantFocusFromReel(
                draft,
                match[1] as "default" | "landscape" | "portrait",
              );
            }
          }
        });
      }),
    );
    panel
      .querySelector<HTMLInputElement>("[data-project-id]")
      ?.addEventListener("change", (event) =>
        this.runTransaction((draft) => {
          draft.id = (event.currentTarget as HTMLInputElement).value;
        }),
      );
  }

  private selectOutline(key: string): void {
    this.#session.selection = parseSelectionKey(key);
    this.renderWorkspace(this.#store.getSnapshot());
  }

  private handleOutlineKeydown(event: KeyboardEvent): void {
    const rows = [
      ...this.#root.querySelectorAll<HTMLButtonElement>("[data-outline-key]"),
    ];
    if (rows.length === 0) return;
    const current = rows.findIndex(
      (row) => row.getAttribute("aria-selected") === "true",
    );
    let target = current < 0 ? 0 : current;
    if (event.key === "ArrowDown")
      target = Math.min(rows.length - 1, target + 1);
    else if (event.key === "ArrowUp") target = Math.max(0, target - 1);
    else if (event.key === "Home") target = 0;
    else if (event.key === "End") target = rows.length - 1;
    else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      rows[Math.max(0, current)].click();
      return;
    } else return;
    event.preventDefault();
    this.selectOutline(rows[target].dataset.outlineKey!);
    this.requireElement("[data-outline-list]").focus();
  }

  private removeSelectedLayer(nodeId: string): void {
    if (!window.confirm(`确认删除图层 ${nodeId}？资源不会删除。`)) return;
    const project = this.#store.getSnapshot().project;
    const backgroundIds = new Set(
      activeVariantIds(project).map(
        (variant) => project.variants[variant].backgroundNode,
      ),
    );
    const layers = project.nodes
      .filter((node) => !backgroundIds.has(node.id))
      .sort((left, right) => left.order - right.order);
    const index = layers.findIndex((node) => node.id === nodeId);
    const next = layers[index + 1] ?? layers[index - 1];
    try {
      this.#store.transact((draft) => removeLayer(draft, nodeId));
      this.#session.selection = next
        ? { kind: "layer", nodeId: next.id }
        : { kind: "reel", reelId: "main" };
      this.showFeedback(`已删除图层 ${nodeId}；资源仍保留。`);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private openPicker(
    context: LayoutResourceBindingContext,
    trigger: HTMLElement,
    preferredResourceId = "",
  ): void {
    this.#pickerTrigger = trigger;
    this.#session.picker = createResourcePickerState(
      this.#store.getSnapshot().project,
      context,
      preferredResourceId,
    );
    const selected = this.#session.picker.selectedResourceId;
    if (selected && context.kind === "add-layer") {
      this.#session.picker.nodeId = suggestNodeId(
        this.#store.getSnapshot().project,
        selected,
      );
    }
    this.renderPicker(this.#store.getSnapshot().project, true);
  }

  private renderPicker(project: EditorProject, focus = false): void {
    const dialog = this.requireElement(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    const state = this.#session.picker;
    if (!state) {
      if (dialog.open) dialog.close();
      dialog.replaceChildren();
      return;
    }
    const candidates = getResourcePickerCandidates(project, state);
    const selected = project.resources.get(state.selectedResourceId);
    const contextLabel =
      state.context.kind === "add-layer"
        ? "添加图层"
        : state.context.kind === "assign-background"
          ? `设置 ${state.context.modeId} / ${state.context.variant} 背景`
          : `重绑图层 ${state.context.nodeId}`;
    dialog.innerHTML = `<div class="picker-shell"><header><div><span>Resource Picker</span><h2>${escapeHtml(contextLabel)}</h2></div><button type="button" data-picker-cancel aria-label="关闭资源选择器">×</button></header><div class="picker-toolbar"><label>搜索<input type="search" data-picker-query value="${escapeHtml(state.query)}" /></label><label>类型<select data-picker-type><option value="all">全部</option><option value="image" ${state.type === "image" ? "selected" : ""}>Image</option><option value="spine" ${state.type === "spine" ? "selected" : ""}>Spine</option><option value="image-string" ${state.type === "image-string" ? "selected" : ""}>Image String</option></select></label><button type="button" data-picker-upload-image>上传新图片</button><button type="button" data-picker-upload-spine>上传新 Spine</button></div><div class="picker-body"><div class="picker-candidates" role="listbox" aria-label="可用资源">${candidates.map((candidate) => `<button type="button" role="option" data-picker-candidate="${escapeHtml(candidate.resourceId)}" aria-selected="${candidate.resourceId === state.selectedResourceId}" ${candidate.disabledReason ? `disabled title="${escapeHtml(candidate.disabledReason)}"` : ""}><span class="type-mark">${candidate.kind === "spine" ? "SP" : candidate.kind === "image-string" ? "TXT" : "IMG"}</span><span><strong>${escapeHtml(candidate.resourceId)}</strong><small title="${escapeHtml(candidate.primaryPath)}">${escapeHtml(candidate.primaryPath)}</small><small>${escapeHtml(candidate.summary)} · ${candidate.status} · 引用 ${candidate.referenceCount}</small></span></button>`).join("") || '<p class="empty-state">没有匹配资源；上传后仍需明确选择并确认。</p>'}</div><section class="picker-form">${selected ? `<p><strong>${escapeHtml(selected.id)}</strong><br/><span class="path">${escapeHtml(editorResourcePaths(selected)[0]!)}</span></p>` : "<p>请选择一个 logical resource。</p>"}${state.context.kind === "add-layer" ? `<label>node id<input data-picker-node-id value="${escapeHtml(state.nodeId)}" /></label>` : state.context.kind === "assign-background" ? `<p class="hint">背景 node id 将按 ${escapeHtml(state.context.modeId)} / ${escapeHtml(state.context.variant)} 稳定生成。</p>` : ""}${
      state.context.kind === "add-layer" && project.mode === "orientation-focus"
        ? activeVariantIds(project)
            .map(
              (variant) =>
                `<label class="visibility"><input type="checkbox" data-picker-variant="${variant}" ${state.variants.includes(variant) ? "checked" : ""}/> ${variant} 初始可见</label>`,
            )
            .join("")
        : ""
    }${selected?.kind === "spine" ? `<label>default animation<select data-picker-animation><option value="">必须明确选择</option>${selected.animationNames.map((name) => `<option value="${escapeHtml(name)}" ${state.defaultAnimation === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>` : ""}<p class="hint">初始 placement 固定为 { x: 0, y: 0, scale: 1 }。不会按文件名或唯一候选自动绑定。</p></section></div><footer><button type="button" data-picker-cancel>取消</button><button type="button" class="primary" data-picker-confirm ${selected ? "" : "disabled"}>确认</button></footer></div>`;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    this.bindPickerDynamicActions(project);
    if (focus)
      queueMicrotask(() =>
        dialog.querySelector<HTMLInputElement>("[data-picker-query]")?.focus(),
      );
  }

  private bindPickerActions(): void {
    const dialog = this.requireElement(
      "[data-resource-picker]",
    ) as HTMLDialogElement;
    dialog.addEventListener("cancel", (event) => {
      event.preventDefault();
      this.closePicker();
    });
    dialog.addEventListener("keydown", (event) => {
      if (event.key !== "Tab") return;
      const focusable = [
        ...dialog.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex="0"]',
        ),
      ];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    });
  }

  private bindPickerDynamicActions(project: EditorProject): void {
    const dialog = this.requireElement("[data-resource-picker]");
    const state = this.#session.picker;
    if (!state) return;
    dialog
      .querySelectorAll("[data-picker-cancel]")
      .forEach((button) =>
        button.addEventListener("click", () => this.closePicker()),
      );
    const query = dialog.querySelector<HTMLInputElement>(
      "[data-picker-query]",
    )!;
    query.addEventListener("input", () => {
      state.query = query.value;
      this.renderPicker(project, true);
    });
    const type = dialog.querySelector<HTMLSelectElement>("[data-picker-type]")!;
    type.addEventListener("change", () => {
      state.type = type.value as typeof state.type;
      if (
        state.selectedResourceId &&
        state.type !== "all" &&
        project.resources.get(state.selectedResourceId)?.kind !== state.type
      ) {
        state.selectedResourceId = "";
        state.defaultAnimation = "";
      }
      this.renderPicker(project, true);
    });
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-picker-candidate]")
      .forEach((button) => {
        const select = () => {
          state.selectedResourceId = button.dataset.pickerCandidate!;
          state.defaultAnimation = "";
          if (state.context.kind === "add-layer") {
            state.nodeId = suggestNodeId(project, state.selectedResourceId);
          }
          this.renderPicker(project);
        };
        button.addEventListener("click", select);
        button.addEventListener("dblclick", () => {
          select();
          void this.confirmPicker();
        });
      });
    dialog
      .querySelector<HTMLInputElement>("[data-picker-node-id]")
      ?.addEventListener("input", (event) => {
        state.nodeId = (event.currentTarget as HTMLInputElement).value;
      });
    dialog
      .querySelectorAll<HTMLInputElement>("[data-picker-variant]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          const variant = input.dataset.pickerVariant as
            | "landscape"
            | "portrait";
          state.variants = input.checked
            ? [...new Set([...state.variants, variant])]
            : state.variants.filter((item) => item !== variant);
        }),
      );
    dialog
      .querySelector<HTMLSelectElement>("[data-picker-animation]")
      ?.addEventListener("change", (event) => {
        state.defaultAnimation = (
          event.currentTarget as HTMLSelectElement
        ).value;
      });
    dialog
      .querySelector("[data-picker-upload-image]")
      ?.addEventListener("click", () => void this.uploadImages(true));
    dialog
      .querySelector("[data-picker-upload-spine]")
      ?.addEventListener("click", () => void this.uploadSpine(true));
    dialog
      .querySelector("[data-picker-confirm]")
      ?.addEventListener("click", () => void this.confirmPicker());
  }

  private async confirmPicker(): Promise<void> {
    const state = this.#session.picker;
    if (!state) return;
    const project = this.#store.getSnapshot().project;
    const resource = project.resources.get(state.selectedResourceId);
    if (!resource) {
      this.#store.setExternalError(
        "Picker 目标资源已被删除或替换，请重新选择。",
      );
      this.renderPicker(project);
      return;
    }
    try {
      if (state.context.kind === "add-layer") {
        let nodeId = state.nodeId;
        this.#store.transact((draft) => {
          const node = addLayerFromResource({
            project: draft,
            resourceId: resource.id,
            nodeId,
            variants: state.variants,
            ...(resource.kind === "spine"
              ? { defaultAnimation: state.defaultAnimation }
              : {}),
          });
          nodeId = node.id;
        });
        this.#session.activeTab = "layout";
        this.#session.selection = { kind: "layer", nodeId };
        this.closePicker(false);
        this.renderWorkspace(this.#store.getSnapshot());
        this.showFeedback(
          `已添加图层 ${nodeId}，资源 ${resource.id} 保持可复用。`,
        );
        queueMicrotask(() =>
          this.#root
            .querySelector<HTMLElement>("[data-inspector-heading]")
            ?.focus(),
        );
        return;
      }
      if (state.context.kind === "rebind-layer") {
        const context = state.context;
        this.#store.transact((draft) =>
          rebindLayerResource({
            project: draft,
            nodeId: context.nodeId,
            resourceId: resource.id,
            ...(resource.kind === "spine"
              ? { defaultAnimation: state.defaultAnimation }
              : {}),
          }),
        );
        this.#session.activeTab = "layout";
        this.#session.selection = {
          kind: "layer",
          nodeId: context.nodeId,
        };
        this.closePicker(false);
        this.renderWorkspace(this.#store.getSnapshot());
        this.showFeedback(`图层 ${context.nodeId} 已重绑到 ${resource.id}。`);
        return;
      }
      const context = state.context;
      const assign = (reinitialize: boolean) =>
        this.#store.transact((draft) =>
          assignBackgroundResource({
            project: draft,
            modeId: context.modeId,
            variant: context.variant,
            resourceId: resource.id,
            ...(resource.kind === "spine"
              ? { defaultAnimation: state.defaultAnimation }
              : {}),
            reinitialize,
          }),
        );
      try {
        assign(false);
      } catch (error) {
        if (
          error instanceof Error &&
          /必须明确选择使用新尺寸并重新初始化/u.test(error.message) &&
          window.confirm(
            `${error.message}\n\n确认使用新尺寸并重新初始化 art / reel / focus？`,
          )
        ) {
          assign(true);
        } else {
          throw error;
        }
      }
      this.#session.activeTab = "layout";
      this.#session.selection = {
        kind: "background",
        variant: context.variant,
      };
      this.closePicker(false);
      this.renderWorkspace(this.#store.getSnapshot());
      this.showFeedback(`已设置 ${context.variant} 背景为 ${resource.id}。`);
    } catch (error) {
      this.#store.setExternalError(error);
      this.renderPicker(this.#store.getSnapshot().project);
    }
  }

  private closePicker(restoreFocus = true): void {
    const dialog = this.#root.querySelector<HTMLDialogElement>(
      "[data-resource-picker]",
    );
    this.#session.picker = null;
    if (dialog?.open) dialog.close();
    dialog?.replaceChildren();
    if (restoreFocus) this.#pickerTrigger?.focus();
    this.#pickerTrigger = null;
  }

  private async uploadImages(fromPicker = false): Promise<void> {
    const files = await pickFiles(".png,.jpg,.jpeg,.webp", true);
    if (files.length === 0) return;
    try {
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      let lastResourceId = "";
      for (const file of files) {
        const resourceId = defaultLogicalId(project, file.name);
        const resource = await uploadImageResource({
          project,
          file,
          resourceId,
        });
        lastResourceId = resource.id;
      }
      if (!confirmImportReview(project, [lastResourceId], files)) return;
      this.#store.replace(project);
      if (fromPicker && this.#session.picker) {
        this.#session.picker.selectedResourceId = lastResourceId;
        this.#session.picker.defaultAnimation = "";
        if (this.#session.picker.context.kind === "add-layer") {
          this.#session.picker.nodeId = suggestNodeId(project, lastResourceId);
        }
        this.renderPicker(project);
      }
      this.showFeedback(`已加入 ${files.length} 个图片资源；未创建任何 node。`);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadResources(directory: boolean): Promise<void> {
    const files = await pickFiles(
      ".png,.jpg,.jpeg,.webp,.json,.atlas,.mp4,video/mp4,.zip,application/zip",
      true,
      directory,
    );
    if (files.length === 0) return;
    try {
      createBoundedSourceIndex(files, {
        maxEntries: 4096,
        maxFileBytes: 50 * 1024 * 1024,
        maxTotalBytes: 500 * 1024 * 1024,
      });
    } catch (error) {
      this.#store.setExternalError(error);
      return;
    }
    if (files.length === 1 && files[0]!.name.toLowerCase().endsWith(".zip")) {
      try {
        const project = cloneEditorProject(this.#store.getSnapshot().project);
        const resource = importImageStringZip({
          project,
          zipBytes: new Uint8Array(await files[0]!.arrayBuffer()),
        });
        if (!confirmImportReview(project, [resource.id], files)) return;
        this.#store.replace(project);
        this.showFeedback(
          `导入审查确认 image-string ${resource.id}；未创建任何 node。`,
        );
      } catch (error) {
        this.#store.setExternalError(error);
      }
      return;
    }
    if (files.every((file) => file.name.toLowerCase().endsWith(".mp4"))) {
      try {
        const project = cloneEditorProject(this.#store.getSnapshot().project);
        const imported: string[] = [];
        for (const file of files) {
          const resourceId = defaultLogicalId(project, file.name);
          imported.push(
            (await uploadVideoResource({ project, file, resourceId })).id,
          );
        }
        if (!confirmImportReview(project, imported, files)) return;
        this.#store.replace(project);
        this.showFeedback(
          `导入审查确认 ${files.length} 个 video logical resources；仅可用于黑场视频转场。`,
        );
      } catch (error) {
        this.#store.setExternalError(error);
      }
      return;
    }
    if (files.every((file) => /\.(?:png|jpe?g|webp)$/iu.test(file.name))) {
      try {
        const project = cloneEditorProject(this.#store.getSnapshot().project);
        const imported: string[] = [];
        for (const file of files) {
          const resourceId = defaultLogicalId(project, file.name);
          imported.push(
            (await uploadImageResource({ project, file, resourceId })).id,
          );
        }
        if (!confirmImportReview(project, imported, files)) return;
        this.#store.replace(project);
        this.showFeedback(
          `导入审查确认 ${files.length} 个 image logical resources；未创建任何 node。`,
        );
      } catch (error) {
        this.#store.setExternalError(error);
      }
      return;
    }
    try {
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      const groups = groupSourceFiles(files);
      const imported: string[] = [];
      for (const group of groups) {
        if (group.every((file) => file.name.toLowerCase().endsWith(".mp4"))) {
          for (const file of group) {
            const resourceId = defaultLogicalId(project, file.name);
            imported.push(
              (await uploadVideoResource({ project, file, resourceId })).id,
            );
          }
        } else if (
          group.every((file) => /\.(?:png|jpe?g|webp)$/iu.test(file.name))
        ) {
          for (const file of group) {
            const resourceId = defaultLogicalId(project, file.name);
            imported.push(
              (await uploadImageResource({ project, file, resourceId })).id,
            );
          }
        } else {
          const primary = group.find((file) =>
            file.name.toLowerCase().endsWith(".json"),
          );
          const resourceId = defaultLogicalId(
            project,
            primary?.name ?? group[0]!.name,
          );
          imported.push(
            (await uploadSpineResource({ project, files: group, resourceId }))
              .id,
          );
        }
      }
      if (!confirmImportReview(project, imported, files)) return;
      this.#store.replace(project);
      this.showFeedback(
        `导入审查确认 ${imported.join(", ")}；未创建任何 node。`,
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadSpine(fromPicker = false): Promise<void> {
    const files = await pickFiles(".json,.atlas,.png,.jpg,.jpeg,.webp", true);
    if (files.length === 0) return;
    try {
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      const primary = files.find((file) =>
        file.name.toLowerCase().endsWith(".json"),
      );
      const resourceId = defaultLogicalId(
        project,
        primary?.name ?? files[0]!.name,
      );
      const resource = await uploadSpineResource({
        project,
        files,
        resourceId,
      });
      if (!confirmImportReview(project, [resource.id], files)) return;
      this.#store.replace(project);
      if (fromPicker && this.#session.picker) {
        this.#session.picker.selectedResourceId = resource.id;
        this.#session.picker.defaultAnimation = "";
        if (this.#session.picker.context.kind === "add-layer") {
          this.#session.picker.nodeId = suggestNodeId(project, resource.id);
        }
        this.renderPicker(project);
      }
      this.showFeedback(
        "已加入 1 个完整 Spine logical resource；未创建任何 node。",
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadImageString(): Promise<void> {
    const files = await pickFiles(".zip,application/zip", false);
    if (files.length === 0) return;
    try {
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      const resource = importImageStringZip({
        project,
        zipBytes: new Uint8Array(await files[0].arrayBuffer()),
      });
      if (!confirmImportReview(project, [resource.id], files)) return;
      this.#store.replace(project);
      this.showFeedback(
        `已加入 image-string ${resource.id}；可复用创建多个独立字符串图层。`,
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async replaceResource(resourceId: string): Promise<void> {
    const current = this.#store.getSnapshot().project.resources.get(resourceId);
    if (!current) {
      this.#store.setExternalError(`未知资源：${resourceId}`);
      return;
    }
    const files = await pickFiles(
      current.kind === "image"
        ? ".png,.jpg,.jpeg,.webp"
        : current.kind === "spine"
          ? ".json,.atlas,.png,.jpg,.jpeg,.webp"
          : current.kind === "video"
            ? ".mp4,video/mp4"
            : ".zip,application/zip",
      current.kind === "spine",
    );
    if (files.length === 0) return;
    try {
      const commit = async (reinitializeBackgrounds: boolean) => {
        const project = cloneEditorProject(this.#store.getSnapshot().project);
        if (current.kind === "image") {
          if (files.length !== 1)
            throw new Error("image 替换必须选择一个文件。");
          await replaceImageResource({
            project,
            resourceId,
            file: files[0],
            reinitializeBackgrounds,
          });
        } else if (current.kind === "spine") {
          await replaceSpineResource({
            project,
            resourceId,
            files,
            reinitializeBackgrounds,
          });
        } else if (current.kind === "video") {
          if (files.length !== 1)
            throw new Error("video 替换必须选择一个 MP4。");
          await replaceVideoResource({
            project,
            resourceId,
            file: files[0],
          });
        } else {
          if (files.length !== 1)
            throw new Error("image-string 替换必须选择一个 ZIP。");
          replaceImageStringResource({
            project,
            resourceId,
            zipBytes: new Uint8Array(await files[0].arrayBuffer()),
          });
        }
        this.#store.replace(project);
      };
      try {
        await commit(false);
      } catch (error) {
        if (
          error instanceof Error &&
          /必须明确选择使用新尺寸并重新初始化|背景替换尺寸不一致/u.test(
            error.message,
          ) &&
          window.confirm(
            `${error.message}\n\n确认原子替换并重新初始化全部背景引用？`,
          )
        ) {
          await commit(true);
        } else {
          throw error;
        }
      }
      this.showFeedback(`资源 ${resourceId} 已原子替换，全部引用同步生效。`);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async refreshPreview(snapshot: EditorStoreSnapshot): Promise<void> {
    this.#previewModeRequest += 1;
    this.#previewModeBusy = false;
    this.stopPreviewModeMonitor();
    const revision = ++this.#previewRevision;
    const preferredVariant =
      snapshot.project.mode === "maximized-focus"
        ? "default"
        : (this.#preview?.pageSize.height ?? 0) >
            (this.#preview?.pageSize.width ?? 0)
          ? "portrait"
          : "landscape";
    const manifest = editorProjectToPreviewManifest(
      snapshot.project,
      preferredVariant,
      snapshot.project.gameModes.modes.some((mode) => Boolean(mode.symbols)),
    );
    if (!manifest) {
      this.#preview?.clear();
      return;
    }
    try {
      const paths = new Set(collectSceneLayoutAssetPaths(manifest));
      for (const node of manifest.nodes) {
        if (node.resource.kind !== "image-string") continue;
        const manifestPath = node.resource.manifest;
        const resource = [...snapshot.project.resources.values()].find(
          (candidate) =>
            candidate.kind === "image-string" &&
            candidate.manifestPath === manifestPath,
        );
        if (resource)
          for (const path of editorResourcePaths(resource)) paths.add(path);
      }
      const assets = new Map(
        [...paths].map((path) => {
          const symbolEntry = [...snapshot.project.symbolDependencies].find(
            ([id]) => path.startsWith(`dependencies/symbols/${id}/`),
          );
          const symbolPrefix = symbolEntry
            ? `dependencies/symbols/${symbolEntry[0]}/`
            : "";
          const popupEntry = [...snapshot.project.popupDependencies].find(
            ([id]) => path.startsWith(`dependencies/popups/${id}/`),
          );
          const popupPrefix = popupEntry
            ? `dependencies/popups/${popupEntry[0]}/`
            : "";
          const bytes =
            snapshot.project.assets.get(path) ??
            (symbolPrefix && path.startsWith(symbolPrefix)
              ? symbolEntry?.[1].files.get(path.slice(symbolPrefix.length))
              : popupPrefix && path.startsWith(popupPrefix)
                ? popupEntry?.[1].files.get(path.slice(popupPrefix.length))
                : undefined);
          if (!bytes) throw new Error(`预览缺少资源：${path}`);
          return [path, bytes] as const;
        }),
      );
      for (const id of Object.keys(manifest.symbolPackages ?? {})) {
        const dependency = snapshot.project.symbolDependencies.get(id);
        if (!dependency) throw new Error(`预览缺少 Symbols dependency：${id}`);
        const prefix = `dependencies/symbols/${id}/`;
        for (const [path, bytes] of dependency.files)
          assets.set(`${prefix}${path}`, bytes);
      }
      for (const id of Object.keys(manifest.popups ?? {})) {
        const dependency = snapshot.project.popupDependencies.get(id);
        if (!dependency) throw new Error(`预览缺少 Popup dependency：${id}`);
        const prefix = `dependencies/popups/${id}/`;
        for (const [path, bytes] of dependency.files)
          assets.set(`${prefix}${path}`, bytes);
      }
      if (revision !== this.#previewRevision) return;
      await this.#preview?.setLayout(manifest, assets);
      if (revision === this.#previewRevision)
        this.renderPopupControls(this.#store.getSnapshot());
    } catch (error) {
      if (revision === this.#previewRevision) {
        this.#preview?.clear();
        this.#store.setExternalError(error);
      }
    }
  }

  private async importZip(): Promise<void> {
    const files = await pickFiles(".zip,application/zip", false);
    if (files.length === 0) return;
    let imported: Awaited<ReturnType<typeof importLayoutZip>> | null = null;
    try {
      imported = await importLayoutZip(
        new Uint8Array(await files[0].arrayBuffer()),
      );
      const project = manifestToEditorProject(
        imported.manifest,
        imported.assets,
        imported.videoMetadata,
      );
      this.closePicker(false);
      this.resetSymbolsForProjectReplace();
      this.#session.activeTab = "layout";
      this.#session.selection = defaultLayoutSelection(project);
      this.#session.expandedResourceIds.clear();
      this.#session.expandedInspectorSections.clear();
      this.#selectedGameMode = project.gameModes.initialMode;
      this.#selectedPreviewMode = project.gameModes.initialMode;
      this.#selectedSymbolId =
        project.gameModes.modes.find(
          (mode) => mode.id === project.gameModes.initialMode,
        )?.symbols?.packageId ??
        project.symbolDependencies.keys().next().value ??
        null;
      this.#selectedPopupId =
        project.popupDependencies.keys().next().value ?? null;
      this.#store.replace(project);
      if (this.#selectedSymbolId)
        await this.restoreProjectSymbolDependency(
          project,
          this.#selectedSymbolId,
        );
      this.showFeedback(
        imported.manifest.gameModes
          ? `已导入 ${project.id}，资源库按完整素材签名重建。`
          : `已导入 ${project.id}；旧 layout 已升级，导出后将显式保存 gameModes。`,
      );
    } catch (error) {
      this.#store.setExternalError(error);
    } finally {
      imported?.destroy();
    }
  }

  private async exportZip(): Promise<void> {
    try {
      const snapshot = this.#store.getSnapshot();
      if (snapshot.errors.length > 0)
        throw new Error(
          `当前配置未通过校验，禁止导出：${snapshot.errors.join("；")}`,
        );
      const manifest = editorProjectToManifest(snapshot.project);
      const exported = await exportLayoutZip({
        manifest,
        assets: snapshot.project.assets,
        ...(snapshot.project.symbolDependencies.size
          ? {
              symbolFilesById: new Map(
                [...snapshot.project.symbolDependencies].map(
                  ([id, dependency]) => [id, dependency.files],
                ),
              ),
            }
          : {}),
        ...(snapshot.project.popupDependencies.size
          ? {
              popupFilesById: new Map(
                [...snapshot.project.popupDependencies].map(
                  ([id, dependency]) => [id, dependency.files],
                ),
              ),
            }
          : {}),
      });
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.click();
      queueMicrotask(() => URL.revokeObjectURL(url));
      const unused =
        snapshot.project.resources.size -
        new Set(snapshot.project.nodes.map((node) => node.resourceId)).size;
      this.showFeedback(
        `已导出 ${exported.fileName}；${unused} 个未引用资源未写入 ZIP。`,
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async importSymbolsPackage(replaceId?: string): Promise<void> {
    const files = await pickFiles(".zip,application/zip", false);
    if (files.length === 0) return;
    const request = ++this.#symbolImportRequest;
    this.#symbolImportBusy = true;
    this.renderSymbolsMetadata();
    let resource:
      | Awaited<ReturnType<typeof importSymbolsZipWithFiles>>["resource"]
      | null = null;
    try {
      const imported = await importSymbolsZipWithFiles(
        new Uint8Array(await files[0].arrayBuffer()),
      );
      resource = imported.resource;
      if (request !== this.#symbolImportRequest) {
        resource.destroy();
        return;
      }
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      if (replaceId) replaceSymbolDependency(project, replaceId, imported);
      else importSymbolDependency(project, imported);
      const preview = this.#preview;
      if (!preview) throw new Error("Symbols preview 尚未初始化。");
      const prepared = await preview.setSymbolPackage(resource, {
        columns: project.reel.columns,
        rows: project.reel.rows,
      });
      if (request !== this.#symbolImportRequest || !prepared) return;
      this.#symbolPackageMetadata = prepared;
      this.#selectedSymbolId = resource.packageManifest.id;
      resource = null;
      this.#store.replace(project);
      this.renderSymbolsMetadata();
      this.showFeedback(
        replaceId
          ? `已替换 Symbols ${replaceId}；主状态引用保持不变。`
          : "Symbols dependency 已导入 library；尚未自动绑定当前主状态。",
      );
    } catch (error) {
      resource?.destroy();
      this.#store.setExternalError(error);
    } finally {
      if (request === this.#symbolImportRequest) {
        this.#symbolImportBusy = false;
        this.renderSymbolsMetadata();
      }
    }
  }

  private async importPopupPackage(replaceId?: string): Promise<void> {
    const files = await pickFiles(".zip,application/zip", false);
    if (files.length === 0) return;
    try {
      const imported = await importPopupPackageZip(
        new Uint8Array(await files[0].arrayBuffer()),
      );
      this.#store.transact((project) =>
        replaceId
          ? replacePopupDependency(project, replaceId, imported)
          : importPopupDependency(project, imported),
      );
      this.#selectedPopupId = imported.manifest.id;
      this.showFeedback(
        replaceId
          ? `已替换 popup ${imported.manifest.id}；模式引用与 placement 已保留。`
          : `已导入 popup ${imported.manifest.id}；尚未自动绑定任何游戏模式。`,
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private clearSymbolsPackage(): void {
    if (!this.#selectedSymbolId) return;
    try {
      this.#store.transact((draft) =>
        deleteSymbolDependency(draft, this.#selectedSymbolId!),
      );
    } catch (error) {
      this.#store.setExternalError(error);
      return;
    }
    this.#symbolImportRequest += 1;
    this.#symbolImportBusy = false;
    this.#symbolPackageMetadata = null;
    void this.#preview?.setSymbolPackage(null);
    this.#selectedSymbolId = null;
    this.renderSymbolsMetadata();
    this.showFeedback(
      "Symbols preview package 已清除；layout cell size 保持不变。",
    );
  }

  private resetSymbolsForProjectReplace(): void {
    this.#symbolImportRequest += 1;
    this.#symbolImportBusy = false;
    this.#symbolPackageMetadata = null;
    void this.#preview?.setSymbolPackage(null);
  }

  private async restoreProjectSymbolDependency(
    project: EditorProject,
    dependencyId: string | null,
  ): Promise<void> {
    const dependency = dependencyId
      ? project.symbolDependencies.get(dependencyId)
      : undefined;
    const preview = this.#preview;
    if (!dependency || !preview) return;
    const manifestBytes = dependency.files.get("symbols.package.json");
    if (!manifestBytes) throw new Error("symbols dependency 缺少 manifest。");
    const packageManifest = parseSymbolPackageManifest(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
      ),
    );
    const resource = await createSymbolPackageResource({
      packageManifest,
      files: dependency.files,
    });
    const prepared = await preview.setSymbolPackage(resource, {
      columns: project.reel.columns,
      rows: project.reel.rows,
    });
    const modeBinding = project.gameModes.modes.find(
      (mode) => mode.id === this.#selectedGameMode,
    )?.symbols;
    this.#symbolPackageMetadata =
      modeBinding?.packageId === dependency.packageId &&
      modeBinding.reelSet &&
      prepared?.selectedReelSet !== modeBinding.reelSet
        ? preview.setSelectedReelSet(modeBinding.reelSet)
        : prepared;
    this.renderSymbolsMetadata();
    await this.refreshPreview(this.#store.getSnapshot());
  }

  private renderSymbolsMetadata(): void {
    const project = this.#store.getSnapshot().project;
    const mode = project.gameModes.modes.find(
      (candidate) => candidate.id === this.#selectedGameMode,
    )!;
    if (
      this.#selectedSymbolId &&
      !project.symbolDependencies.has(this.#selectedSymbolId)
    )
      this.#selectedSymbolId = null;
    this.#selectedSymbolId ??=
      mode.symbols?.packageId ??
      project.symbolDependencies.keys().next().value ??
      null;
    const dependencySelect = this.requireSelect("[data-symbol-dependency]");
    dependencySelect.replaceChildren(
      Object.assign(document.createElement("option"), {
        value: "",
        textContent: "未选择",
      }),
      ...[...project.symbolDependencies.keys()].map((id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = id;
        option.selected = id === this.#selectedSymbolId;
        return option;
      }),
    );
    dependencySelect.value = this.#selectedSymbolId ?? "";
    const modeSelect = this.requireSelect("[data-mode-symbols]");
    modeSelect.replaceChildren(
      Object.assign(document.createElement("option"), {
        value: "",
        textContent: "无",
      }),
      ...[...project.symbolDependencies.keys()].map((id) => {
        const option = document.createElement("option");
        option.value = id;
        option.textContent = id;
        return option;
      }),
    );
    modeSelect.value = mode.symbols?.packageId ?? "";
    const target = this.requireElement("[data-symbols-metadata]");
    const metadata = this.#symbolPackageMetadata;
    target.textContent = metadata
      ? `${metadata.packageId} · cell ${metadata.cellSize.width}×${metadata.cellSize.height} · ${metadata.displaySymbolCount} display symbols`
      : this.#selectedSymbolId
        ? `已选择 ${this.#selectedSymbolId}，等待加载 metadata。`
        : "未导入 Symbols dependency。";
    const selector = this.requireSelect("[data-reel-set]");
    const placeholder = document.createElement("option");
    placeholder.value = "";
    placeholder.textContent = metadata
      ? metadata.status === "pending-selection"
        ? "请选择 reel set"
        : "无可用 reel set"
      : "未导入 package";
    selector.replaceChildren(placeholder);
    for (const info of metadata?.reelSets ?? []) {
      const option = document.createElement("option");
      option.value = info.name;
      option.textContent = `${info.name} · ${info.reelCount} reels${info.compatible ? "" : ` · 不可用：${info.reason ?? "不兼容"}`}`;
      option.disabled = !info.compatible;
      option.selected = info.name === metadata?.selectedReelSet;
      selector.append(option);
    }
    selector.disabled = !metadata || this.#symbolImportBusy;
    const renderMode = this.requireSelect("[data-symbol-render-mode]");
    renderMode.value = mode.symbols?.renderMode ?? "standard";
    renderMode.disabled = !mode.symbols || this.#symbolImportBusy;
    this.requireElement("[data-randomize-symbols]").toggleAttribute(
      "disabled",
      !metadata || metadata.status !== "ready" || this.#symbolImportBusy,
    );
    this.requireElement("[data-symbols-scene]").textContent = metadata
      ? formatSymbolPreviewDiagnostic(metadata)
      : "等待导入 strict symbol-package v1 ZIP。";
    this.renderOtherSceneBindings(metadata);
    this.requireElement("[data-import-symbols]").toggleAttribute(
      "disabled",
      this.#symbolImportBusy,
    );
    this.requireElement("[data-clear-symbols]").toggleAttribute(
      "disabled",
      !this.#selectedSymbolId || this.#symbolImportBusy,
    );
    this.requireElement("[data-replace-symbols]").toggleAttribute(
      "disabled",
      !this.#selectedSymbolId || this.#symbolImportBusy,
    );
  }

  private renderOtherSceneBindings(
    metadata: SymbolPackagePreviewSnapshot | null,
  ): void {
    const host = this.requireElement("[data-other-scene-bindings]");
    if (!metadata) {
      host.innerHTML = "<p>导入 package 后可按 symbol 配置数值预览。</p>";
      return;
    }
    const bindings = metadata.bindings ?? [];
    const availableTargets = metadata.availableTargets ?? {};
    const tableNames = metadata.numberWeightTableNames ?? [];
    const bindingBySymbol = new Map(
      bindings.map((binding) => [binding.symbol, binding]),
    );
    const rows = Object.entries(availableTargets)
      .filter(([, targets]) => targets.length > 0)
      .map(([symbol, targets]) => {
        const binding = bindingBySymbol.get(symbol);
        const target = binding?.target ?? targets[0]!;
        const source =
          binding?.source ??
          (tableNames.length > 0
            ? {
                kind: "number-weight-table" as const,
                tableName: tableNames[0]!,
              }
            : { kind: "fixed-number" as const, value: 1 });
        return `<div class="other-scene-row" data-other-scene-row="${escapeHtml(symbol)}"><label><input type="checkbox" data-binding-enabled ${binding ? "checked" : ""}> ${escapeHtml(symbol)}</label><select data-binding-target>${targets
          .map((candidate) => {
            const value =
              candidate.kind === "image-string-node"
                ? `node:${candidate.name}`
                : "legacy";
            const selected =
              candidate.kind === "image-string-node" &&
              target.kind === "image-string-node"
                ? candidate.name === target.name
                : candidate.kind === target.kind;
            return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(value)}</option>`;
          })
          .join(
            "",
          )}</select><select data-binding-source-kind><option value="number-weight-table" ${source.kind === "number-weight-table" ? "selected" : ""} ${tableNames.length === 0 ? "disabled" : ""}>权重表</option><option value="fixed-number" ${source.kind === "fixed-number" ? "selected" : ""}>固定值</option></select><select data-binding-table ${tableNames.length === 0 ? "disabled" : ""}>${tableNames.map((name) => `<option value="${escapeHtml(name)}" ${source.kind === "number-weight-table" && source.tableName === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><input data-binding-fixed type="number" min="1" step="1" value="${source.kind === "fixed-number" ? source.value : 1}"></div>`;
      });
    host.innerHTML = `<h3>数值 / otherScene</h3>${rows.join("") || "<p>package 没有命名节点或 legacy value target。</p>"}<small>${tableNames.length ? `可用表：${tableNames.map(escapeHtml).join("、")}` : "game config 未声明 numberWeightTables；仍可使用固定值。"}</small>`;
    host
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
      .forEach((input) =>
        input.addEventListener("change", () => this.commitOtherSceneBindings()),
      );
  }

  private commitOtherSceneBindings(): void {
    try {
      const bindings: SymbolOtherScenePreviewBinding[] = [];
      for (const row of this.#root.querySelectorAll<HTMLElement>(
        "[data-other-scene-row]",
      )) {
        if (
          !row.querySelector<HTMLInputElement>("[data-binding-enabled]")
            ?.checked
        )
          continue;
        const symbol = row.dataset.otherSceneRow!;
        const targetValue = row.querySelector<HTMLSelectElement>(
          "[data-binding-target]",
        )!.value;
        const sourceKind = row.querySelector<HTMLSelectElement>(
          "[data-binding-source-kind]",
        )!.value;
        const target: SymbolOtherScenePreviewBinding["target"] =
          targetValue === "legacy"
            ? { kind: "legacy-presentation-value" }
            : {
                kind: "image-string-node",
                name: targetValue.slice("node:".length),
              };
        const source: SymbolOtherScenePreviewBinding["source"] =
          sourceKind === "number-weight-table"
            ? {
                kind: "number-weight-table",
                tableName: row.querySelector<HTMLSelectElement>(
                  "[data-binding-table]",
                )!.value,
              }
            : {
                kind: "fixed-number",
                value: Number(
                  row.querySelector<HTMLInputElement>("[data-binding-fixed]")!
                    .value,
                ),
              };
        bindings.push({ symbol, target, source });
      }
      this.#symbolPackageMetadata =
        this.#preview?.setOtherSceneBindings(bindings) ?? null;
      this.renderSymbolsMetadata();
    } catch (error) {
      this.#store.setExternalError(error);
      this.renderSymbolsMetadata();
    }
  }

  private syncSymbolPreviewGrid(project: EditorProject): void {
    if (!this.#symbolPackageMetadata || this.#symbolImportBusy) return;
    if (
      !Number.isSafeInteger(project.reel.columns) ||
      project.reel.columns <= 0 ||
      !Number.isSafeInteger(project.reel.rows) ||
      project.reel.rows <= 0
    )
      return;
    try {
      this.#symbolPackageMetadata =
        this.#preview?.setSymbolGrid({
          columns: project.reel.columns,
          rows: project.reel.rows,
        }) ?? null;
      this.renderSymbolsMetadata();
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private setPreviewSize(width: number, height: number): void {
    try {
      this.#preview?.setPageSize({ width, height });
      this.requireInput("[data-preview-width]").value = String(width);
      this.requireInput("[data-preview-height]").value = String(height);
      const preset = PREVIEW_SIZE_PRESETS.find(
        (candidate) => candidate.width === width && candidate.height === height,
      );
      this.requireSelect("[data-preview-resolution]").value = preset
        ? `${preset.width}x${preset.height}`
        : "custom";
      void this.refreshPreview(this.#store.getSnapshot());
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private bindResizeHandle(): void {
    const handle = this.requireElement("[data-resize-handle]");
    handle.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      const origin = this.#preview?.pageSize ?? { width: 1920, height: 1080 };
      const startX = event.clientX;
      const startY = event.clientY;
      const move = (moveEvent: PointerEvent) => {
        this.setPreviewSize(
          Math.max(
            200,
            Math.round(origin.width + (moveEvent.clientX - startX) * 3),
          ),
          Math.max(
            200,
            Math.round(origin.height + (moveEvent.clientY - startY) * 3),
          ),
        );
      };
      const end = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", end);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", end);
    });
  }

  private syncZoomLabel(): void {
    this.requireElement("[data-zoom-label]").textContent =
      `${Math.round((this.#preview?.zoom ?? 1) * 100)}%`;
  }

  private runTransaction(
    update: (draft: EditorProject) => void,
    successMessage?: string,
  ): void {
    try {
      this.#store.transact(update);
      if (successMessage) this.showFeedback(successMessage);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private showFeedback(message: string): void {
    const target = this.requireElement("[data-feedback]");
    target.textContent = message;
    if (this.#feedbackTimer) clearTimeout(this.#feedbackTimer);
    this.#feedbackTimer = setTimeout(() => {
      if (!this.#destroyed) target.textContent = "";
    }, 4500);
  }

  private renderProjectStatus(snapshot: EditorStoreSnapshot): void {
    this.requireElement("[data-project-status]").textContent =
      `${snapshot.project.id} · ${snapshot.project.mode} · ${snapshot.project.resources.size} resources · ${snapshot.project.nodes.length} nodes · ${snapshot.errors.length ? `${snapshot.errors.length} diagnostics` : "strict ready"}`;
    const errors = this.requireElement("[data-errors]");
    errors.replaceChildren(
      ...snapshot.errors.map((message) => {
        const item = document.createElement("div");
        item.textContent = message;
        return item;
      }),
    );
  }

  private syncThumbnailUrls(project: EditorProject): void {
    const desired = new Set<string>();
    for (const resource of project.resources.values()) {
      if (resource.kind !== "image") continue;
      desired.add(resource.id);
      const bytes = project.assets.get(resource.path);
      if (!bytes) continue;
      const fingerprint = `${resource.path}:${ephemeralContentFingerprint(bytes)}`;
      const current = this.#thumbnailEntries.get(resource.id);
      if (current?.fingerprint === fingerprint) continue;
      if (current) this.#thumbnailUrls.revoke(current.url);
      const url = this.#thumbnailUrls.create(
        new Blob([bytes as BlobPart], { type: mimeType(resource.path) }),
      );
      this.#thumbnailEntries.set(resource.id, { fingerprint, url });
    }
    for (const [id, entry] of this.#thumbnailEntries) {
      if (desired.has(id)) continue;
      this.#thumbnailUrls.revoke(entry.url);
      this.#thumbnailEntries.delete(id);
    }
  }

  private captureScrollPositions(): void {
    for (const [key, selector] of [
      [`${this.#session.activeTab}:main`, "[data-workspace-panel]"],
      ["assets:list", "[data-resource-list]"],
      ["layout:outline", ".outline-list"],
      ["layout:inspector", ".inspector"],
    ] as const) {
      const element = this.#root.querySelector<HTMLElement>(selector);
      if (element) this.#scrollPositions.set(key, element.scrollTop);
    }
  }

  private restoreScrollPositions(): void {
    for (const [key, selector] of [
      [`${this.#session.activeTab}:main`, "[data-workspace-panel]"],
      ["assets:list", "[data-resource-list]"],
      ["layout:outline", ".outline-list"],
      ["layout:inspector", ".inspector"],
    ] as const) {
      const value = this.#scrollPositions.get(key);
      const element = this.#root.querySelector<HTMLElement>(selector);
      if (value !== undefined && element) element.scrollTop = value;
    }
  }

  private captureFocusToken(): string | null {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !this.#root.contains(active)) return null;
    for (const attribute of [
      "data-number",
      "data-resource-query",
      "data-project-id",
      "data-node-id",
      "data-outline-key",
    ]) {
      const value = active.getAttribute(attribute);
      if (value !== null) return `[${attribute}="${cssEscape(value)}"]`;
    }
    return null;
  }

  private restoreFocusToken(token: string | null): void {
    if (!token) return;
    queueMicrotask(() => this.#root.querySelector<HTMLElement>(token)?.focus());
  }

  private requireElement(selector: string): HTMLElement {
    const element = this.#root.querySelector<HTMLElement>(selector);
    if (!element) throw new Error(`缺少 UI element：${selector}`);
    return element;
  }

  private requireInput(selector: string): HTMLInputElement {
    const input = this.#root.querySelector<HTMLInputElement>(selector);
    if (!input) throw new Error(`缺少 UI input：${selector}`);
    return input;
  }

  private requireSelect(selector: string): HTMLSelectElement {
    const select = this.#root.querySelector<HTMLSelectElement>(selector);
    if (!select) throw new Error(`缺少 UI select：${selector}`);
    return select;
  }
}

function shellMarkup(): string {
  return `<main class="editor-shell"><header class="topbar"><div class="brand"><strong>Game Layout Editor</strong><span>scene-layout v1 · state workspaces</span></div><nav aria-label="项目操作"><button type="button" data-new-project>新建项目</button><button type="button" data-import>导入 ZIP</button><button type="button" class="primary" data-export>导出 ZIP</button></nav><output data-project-status></output></header><section class="workspace"><aside class="editor-pane"><section class="state-bar"><label>主状态<select data-game-mode></select></label><button type="button" data-manage-modes>管理状态</button><output data-main-state-status></output></section><div class="workspace-tabs" role="tablist" aria-label="编辑工作区">${(
    [
      ["assets", "资源"],
      ["layout", "布局"],
      ["transitions", "转场"],
      ["symbols", "Symbols"],
      ["bigwin", "BigWin"],
      ["project", "项目"],
    ] as const
  )
    .map(
      ([id, label], index) =>
        `<button type="button" id="tab-${id}" role="tab" data-workspace-tab="${id}" aria-selected="${index === 0}" aria-controls="workspace-panel" ${index ? 'tabindex="-1"' : ""}>${label}</button>`,
    )
    .join(
      "",
    )}</div><section id="workspace-panel" role="tabpanel" data-workspace-panel aria-labelledby="tab-assets"></section><div data-symbols-workspace hidden>${symbolsWorkspaceMarkup()}</div><div data-bigwin-workspace hidden>${bigWinWorkspaceMarkup()}</div></aside><section class="preview-column"><div class="preview-toolbar"><label>分辨率<select data-preview-resolution></select></label><label>宽<input type="number" min="1" value="1920" data-preview-width /></label><label>高<input type="number" min="1" value="1080" data-preview-height /></label><label>预览状态<select data-preview-game-mode></select></label><button type="button" data-request-preview-mode>切换到该状态</button><label><input type="checkbox" checked data-follow-edit-mode />跟随编辑状态</label><div class="zoom-controls"><button type="button" data-zoom-out aria-label="缩小">−</button><button type="button" data-zoom-reset><span data-zoom-label>100%</span></button><button type="button" data-zoom-in aria-label="放大">＋</button></div><label><input type="checkbox" checked data-guide-focus /> focus</label><label><input type="checkbox" checked data-guide-reel /> reel/cells</label></div><div class="preview-stage"><div class="preview-page" data-preview-host></div><button class="resize-handle" type="button" aria-label="拖动调整页面尺寸" data-resize-handle>◢</button></div><output class="diagnostics" data-preview-diagnostics></output></section></section><output class="feedback" aria-live="polite" data-feedback></output><aside class="error-panel" aria-live="assertive" data-errors></aside><dialog data-new-project-dialog aria-label="新建项目"><form method="dialog"><h2>新建项目</h2><label><input type="radio" name="new-project-mode" value="maximized-focus" checked />单背景适配（maximized-focus）</label><label><input type="radio" name="new-project-mode" value="orientation-focus" />横竖双背景适配（orientation-focus）</label><div class="button-row"><button type="button" data-cancel-new-project>取消</button><button type="button" class="primary" data-confirm-new-project>创建</button></div></form></dialog><dialog data-mode-dialog aria-label="管理主状态"><section><h2>管理主状态</h2><label>状态 id<input data-new-game-mode value="FreeGame" /></label><div class="button-row"><button type="button" data-add-game-mode>添加</button><button type="button" data-rename-game-mode>重命名当前</button><button type="button" data-set-initial-mode>设为 initial</button><button type="button" class="danger" data-delete-game-mode>删除当前</button></div><div data-mode-node-states></div><button type="button" data-close-mode-dialog>完成</button></section></dialog><dialog class="resource-picker" data-resource-picker aria-label="Resource Picker"></dialog></main>`;
}

function parseSelectionKey(key: string): LayoutSelection {
  if (key === "reel:main") return { kind: "reel", reelId: "main" };
  if (key.startsWith("background:")) {
    return {
      kind: "background",
      variant: key.slice("background:".length) as
        | "default"
        | "landscape"
        | "portrait",
    };
  }
  if (key.startsWith("layer:")) {
    return { kind: "layer", nodeId: key.slice("layer:".length) };
  }
  throw new Error(`未知 outline selection：${key}`);
}

function setPath(target: object, path: string, value: number): void {
  const parts = path.split(".");
  let current = target as Record<string, unknown>;
  for (const part of parts.slice(0, -1)) {
    const next = current[part];
    if (!next || typeof next !== "object")
      throw new Error(`无效字段路径：${path}`);
    current = next as Record<string, unknown>;
  }
  current[parts.at(-1)!] = value;
}

function pickFiles(
  accept: string,
  multiple: boolean,
  directory = false,
): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    if (directory) input.setAttribute("webkitdirectory", "");
    input.addEventListener("change", () => resolve([...(input.files ?? [])]), {
      once: true,
    });
    input.click();
  });
}

function defaultLogicalId(project: EditorProject, sourceName: string): string {
  const suggestion = suggestLogicalResourceId(sourceName);
  if (!suggestion)
    throw new Error(`无法从文件名生成 logical resource id：${sourceName}`);
  if (!project.resources.has(suggestion)) return suggestion;
  let suffix = 2;
  while (project.resources.has(`${suggestion}-${suffix}`)) suffix += 1;
  return `${suggestion}-${suffix}`;
}

function confirmImportReview(
  project: EditorProject,
  resourceIds: readonly string[],
  files: readonly File[],
): boolean {
  const confirm = globalThis.window?.confirm;
  if (typeof confirm !== "function") return true;
  const rows = resourceIds.map((id) => {
    const resource = project.resources.get(id)!;
    return `${id} · ${resource.kind} · ${editorResourcePrimaryPathForReview(resource)} · dependencies ${Math.max(0, editorResourcePaths(resource).length - 1)}`;
  });
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return confirm.call(
    globalThis.window,
    `导入审查\n${rows.join("\n")}\n未消费文件 0 · ${files.length} files · ${total} bytes\n\n确认只加入资源库？`,
  );
}

function editorResourcePrimaryPathForReview(
  resource: EditorLayoutResource,
): string {
  return editorResourcePaths(resource)[0] ?? "";
}

function groupSourceFiles(files: readonly File[]): readonly File[][] {
  if (!files.some((file) => file.webkitRelativePath)) return [[...files]];
  const groups = new Map<string, File[]>();
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const directory = path.includes("/")
      ? path.slice(0, path.lastIndexOf("/"))
      : "";
    const group = groups.get(directory) ?? [];
    group.push(file);
    groups.set(directory, group);
  }
  return Object.freeze(
    [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([, group]) => group),
  );
}

function formatSymbolPreviewDiagnostic(
  preview: SymbolPackagePreviewSnapshot,
): string {
  const scene = preview.scene;
  if (!scene) return preview.message;
  const rows = Array.from({ length: scene.rows }, (_, y) =>
    scene.symbols.map((column) => column[y]).join(" "),
  );
  const otherRows = preview.otherScene
    ? Array.from({ length: scene.rows }, (_, y) =>
        preview.otherScene!.matrix.map((column) => column[y]).join(" "),
      )
    : [];
  return `${preview.message} stops=[${scene.stopYs.join(", ")}] · scene=${rows.join(" / ")} · mappings=${preview.bindings?.length ?? 0} · otherScene=${otherRows.join(" / ")}`;
}

function mimeType(path: string): string {
  if (path.endsWith(".png")) return "image/png";
  if (path.endsWith(".jpg") || path.endsWith(".jpeg")) return "image/jpeg";
  if (path.endsWith(".webp")) return "image/webp";
  return "application/octet-stream";
}

function cssEscape(value: string): string {
  return value.replace(/["\\]/gu, "\\$&");
}
