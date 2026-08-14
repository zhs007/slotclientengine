import {
  type SceneLayoutGameModeSnapshot,
  type SceneLayoutVariantId,
} from "@slotclientengine/rendercore/scene-layout";
import {
  createBoundedSourceIndex,
  ephemeralContentFingerprint,
  extractBoundedZip,
} from "@slotclientengine/browserartifactio";
import { normalizeEditorPackageZipEntries } from "@slotclientengine/editorresource";
import {
  assertCanonicalUploadFileNames,
  canonicalizeUploadFileName,
} from "../io/filename-policy.js";
import { ObjectUrlRegistry } from "../io/object-url-registry.js";
import { exportLayoutZip } from "../io/exported-layout-zip.js";
import {
  importLayoutZip,
  LAYOUT_ZIP_LIMITS,
} from "../io/imported-layout-zip.js";
import { importSymbolsZipWithFiles } from "../io/imported-symbol-package.js";
import {
  findPopupSpineAssetConflicts,
  importPopupPackageZip,
  type LayoutSpineAssetForPopupReview,
  type PopupSpineAssetConflict,
} from "../io/imported-popup-package.js";
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
import { convertProjectCoordinateOrigin } from "../model/coordinate-origin.js";
import {
  EditorStore,
  type EditorStoreSnapshot,
} from "../model/editor-store.js";
import {
  addLayerFromResource,
  assignBackgroundResource,
  bindRuntimeResource,
  clearBackground,
  deleteLayoutResource,
  getLayoutResourceReferences,
  moveLayer,
  rebindLayerResource,
  removeLayer,
  renameNode,
  replaceImageResource,
  replaceImageStringResource,
  replaceSpineResource,
  replaceVideoResource,
  setLayerVariantVisibility,
  setLayerGameMode,
  setImageStringLayerAnchor,
  setImageStringLayerText,
  setNodeDefaultAnimation,
  setNodePlaybackLoop,
  suggestNodeId,
  importImageStringZip,
  importVniBundle,
  inspectVniBundleProfiles,
  getRuntimeResourceKey,
  normalizeRuntimeResourceKey,
  uploadImageResource,
  uploadSpineResources,
  uploadVideoResource,
  unbindRuntimeResource,
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
  setGameModeTransitionPreludePopup,
  setGameModeTransitionResource,
  setGameModeTransitionKind,
  setGameModeVideoTransitionFadeOut,
  setGameModeVideoTransitionResource,
  setInitialGameMode,
  setPopupOrder,
  setPopupPlacement,
  setSpinePopupRegistered,
} from "../model/game-mode-commands.js";
import { setNodeOrder, setReelOrder } from "../model/layer-order.js";
import {
  LayoutPreview,
  type SymbolPackagePreviewSnapshot,
} from "../preview/layout-preview.js";
import { PREVIEW_SIZE_PRESETS } from "../preview/preview-size.js";
import { collectLayoutPreviewAssetPaths } from "./preview-asset-paths.js";
import type { SymbolOtherScenePreviewBinding } from "../preview/other-scene-preview.js";
import { layoutWorkspaceMarkup } from "./layout-workspace.js";
import {
  transitionKey,
  transitionUiStateText,
  transitionsWorkspaceMarkup,
  updateTransitionRuntimeUi,
} from "./transitions-workspace.js";
import { symbolsWorkspaceMarkup } from "./symbols-workspace.js";
import { bigWinWorkspaceMarkup } from "./bigwin-workspace.js";
import { projectWorkspaceMarkup } from "./project-workspace.js";
import {
  createResourcePickerState,
  getResourcePickerCandidates,
  preferredResourcePickerAnimation,
} from "./resource-picker.js";
import { resourcesWorkspaceMarkup } from "./resources-workspace.js";
import {
  createEditorUiSession,
  defaultLayoutSelection,
  normalizeLayoutSelection,
  type LayoutResourceBindingContext,
  type LayoutSelection,
  type OtherSceneBindingDraft,
  type WorkspaceTab,
} from "./ui-session.js";
import {
  normalizeStateManagerSelection,
  stateManagerDialogMarkup,
} from "./state-manager-dialog.js";
import { ResourcePickerPreview } from "../preview/resource-picker-preview.js";
import { escapeHtml } from "./ui-markup.js";
import {
  editorResourcePaths,
  type EditorLayoutResource,
} from "../model/editor-resource.js";

interface FocusSnapshot {
  readonly selector: string;
  readonly selectionStart: number | null;
  readonly selectionEnd: number | null;
  readonly selectionDirection: "forward" | "backward" | "none" | null;
}

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
  readonly #resourcePickerPreview = new ResourcePickerPreview();
  #preview: LayoutPreview | null = null;
  #unsubscribe: (() => void) | null = null;
  #previewRevision = 0;
  #previewReadyProjectRevision = -1;
  #lastPreviewProjectRevision = -1;
  #previewModeRequest = 0;
  #previewPrepareRequest = 0;
  #previewPrepareIdentity: string | null = null;
  #previewPrepareChain: Promise<void> = Promise.resolve();
  #previewModeFrame: number | null = null;
  #previewModeBusy = false;
  #destroyed = false;
  #symbolPackageMetadata: SymbolPackagePreviewSnapshot | null = null;
  #symbolImportBusy = false;
  #pickerTrigger: HTMLElement | null = null;
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  #selectedGameMode = "BaseGame";
  #selectedPreviewMode = "BaseGame";
  #followEditMode = true;
  #selectedSymbolId: string | null = null;
  #selectedPopupId: string | null = null;
  #modeDialogNewId = "";
  #modeDialogRenameId = "";
  #modeDialogFeedback = "";

  constructor(root: HTMLElement) {
    this.#root = root;
  }

  async init(): Promise<void> {
    this.#root.innerHTML = shellMarkup();
    const previewHost = this.requireElement("[data-preview-host]");
    const diagnostics = this.requireElement("[data-preview-diagnostics]");
    this.#preview = new LayoutPreview(previewHost, diagnostics, {
      onPopupInputError: (error) => this.#store.setExternalError(error),
    });
    await this.#preview.init();
    this.bindStaticActions();
    this.#unsubscribe = this.#store.subscribe((snapshot) => {
      this.renderWorkspace(snapshot);
      this.syncSymbolPreviewGrid(snapshot.project);
      if (snapshot.revision !== this.#lastPreviewProjectRevision) {
        const previousRevision = this.#lastPreviewProjectRevision;
        this.#lastPreviewProjectRevision = snapshot.revision;
        if (
          snapshot.changeKind === "geometry" &&
          this.#previewReadyProjectRevision === previousRevision
        )
          void this.refreshPreviewGeometry(snapshot);
        else void this.refreshPreview(snapshot);
      }
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#previewModeRequest += 1;
    this.#previewPrepareRequest += 1;
    this.#previewPrepareIdentity = null;
    this.stopPreviewModeMonitor();
    this.#previewModeBusy = false;
    this.#symbolImportBusy = false;
    if (this.#feedbackTimer) clearTimeout(this.#feedbackTimer);
    this.closePicker(false);
    this.#unsubscribe?.();
    this.#preview?.destroy();
    this.#resourcePickerPreview.destroy();
    this.#thumbnailUrls.destroy();
    this.#thumbnailEntries.clear();
    this.#root.replaceChildren();
  }

  private bindStaticActions(): void {
    const newDialog = this.requireElement(
      "[data-new-project-dialog]",
    ) as HTMLDialogElement;
    const newProjectMode = this.requireSelect("[data-new-project-mode]");
    const confirmNewProject = this.requireElement(
      "[data-confirm-new-project]",
    ) as HTMLButtonElement;
    const resetNewProjectDialog = (): void => {
      newProjectMode.value = "";
      confirmNewProject.disabled = true;
    };
    this.requireElement("[data-new-project]").addEventListener("click", () => {
      resetNewProjectDialog();
      if (typeof newDialog.showModal === "function") newDialog.showModal();
      else newDialog.setAttribute("open", "");
    });
    newProjectMode.addEventListener("change", () => {
      confirmNewProject.disabled = newProjectMode.value === "";
    });
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
        const mode = newProjectMode.value as EditorProject["mode"] | "";
        if (!mode) return;
        this.createProject(mode);
        if (typeof newDialog.close === "function") newDialog.close();
        else newDialog.removeAttribute("open");
      },
    );
    const modeDialog = this.requireElement(
      "[data-mode-dialog]",
    ) as HTMLDialogElement;
    this.requireElement("[data-manage-modes]").addEventListener("click", () => {
      const project = this.#store.getSnapshot().project;
      this.#selectedGameMode = normalizeStateManagerSelection(
        project,
        this.#selectedGameMode,
      );
      this.#modeDialogNewId = "";
      this.#modeDialogRenameId = this.#selectedGameMode;
      this.#modeDialogFeedback = "";
      this.renderModeDialog(project);
      if (typeof modeDialog.showModal === "function") modeDialog.showModal();
      else modeDialog.setAttribute("open", "");
    });
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
    this.requireSelect("[data-game-mode]").addEventListener(
      "change",
      (event) => {
        this.#selectedGameMode = (
          event.currentTarget as HTMLSelectElement
        ).value;
        if (this.#followEditMode) {
          this.#selectedPreviewMode = this.#selectedGameMode;
        }
        this.reconcileSelectedTransitionForTarget();
        this.renderWorkspace(this.#store.getSnapshot());
        this.renderPopupControls(this.#store.getSnapshot());
        if (this.#followEditMode)
          void this.selectAuthoringPreviewMode(this.#selectedGameMode);
        else void this.ensurePreviewTransitionPrepared();
      },
    );
    this.requireSelect("[data-preview-game-mode]").addEventListener(
      "change",
      (event) => {
        this.#selectedPreviewMode = (
          event.currentTarget as HTMLSelectElement
        ).value;
        this.reconcileSelectedTransitionForTarget();
        this.renderPreviewRuntimeControls(
          this.#store.getSnapshot().project,
          this.#preview?.getGameModeSnapshot() ?? null,
        );
        void this.ensurePreviewTransitionPrepared();
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
          this.reconcileSelectedTransitionForTarget();
          this.renderPreviewRuntimeControls(
            this.#store.getSnapshot().project,
            this.#preview?.getGameModeSnapshot() ?? null,
          );
          void this.selectAuthoringPreviewMode(this.#selectedGameMode);
        }
      },
    );
    this.requireElement("[data-request-preview-mode]").addEventListener(
      "click",
      () => this.requestPreviewMode(this.#selectedPreviewMode),
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
    this.requireInput("[data-popup-order]").addEventListener(
      "change",
      (event) => {
        const popupId = this.#selectedPopupId;
        if (!popupId) {
          this.#store.setExternalError(
            new Error("尚未选择 popup dependency。"),
          );
          return;
        }
        this.runTransaction((project) =>
          setPopupOrder(
            project,
            popupId,
            Number((event.currentTarget as HTMLInputElement).value),
          ),
        );
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.requireElement("[data-register-popup]").addEventListener(
      "click",
      () => {
        if (!this.#selectedPopupId) return;
        this.runTransaction((project) =>
          setSpinePopupRegistered(
            project,
            this.#selectedPopupId!,
            !project.registeredSpinePopupIds.has(this.#selectedPopupId!),
          ),
        );
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.requireElement("[data-clear-popup]").addEventListener("click", () => {
      if (!this.#selectedPopupId) return;
      const removedPopupId = this.#selectedPopupId;
      if (
        !this.runTransaction((project) =>
          deletePopupDependency(project, removedPopupId),
        )
      )
        return;
      for (const key of this.#session.popupPlacementDrafts.keys()) {
        if (key.startsWith(`${removedPopupId}\u0000`))
          this.#session.popupPlacementDrafts.delete(key);
      }
      this.#selectedPopupId = null;
      this.renderPopupControls(this.#store.getSnapshot());
    });
    this.requireElement("[data-play-popup]").addEventListener("click", () => {
      try {
        const dependency = this.#selectedPopupId
          ? this.#store
              .getSnapshot()
              .project.popupDependencies.get(this.#selectedPopupId)
          : undefined;
        if (dependency?.type === "spine") {
          const prompt = this.requireInput("[data-popup-prompt]").value;
          this.#preview?.playSpinePopup(
            dependency.id,
            prompt.length ? prompt : undefined,
          );
        } else
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
          const dependency = this.#selectedPopupId
            ? this.#store
                .getSnapshot()
                .project.popupDependencies.get(this.#selectedPopupId)
            : undefined;
          if (dependency?.type === "spine")
            this.#preview?.requestDismissSpinePopup(dependency.id);
          else this.#preview?.advanceAwardCelebration();
          this.renderPopupControls(this.#store.getSnapshot());
        } catch (error) {
          this.#store.setExternalError(error);
        }
      },
    );
    this.requireElement("[data-dismiss-popup]").addEventListener(
      "click",
      () => {
        const dependency = this.#selectedPopupId
          ? this.#store
              .getSnapshot()
              .project.popupDependencies.get(this.#selectedPopupId)
          : undefined;
        if (dependency?.type === "spine")
          this.#preview?.dismissSpinePopupImmediately(dependency.id);
        else this.#preview?.dismissAwardCelebrationImmediately();
        this.renderPopupControls(this.#store.getSnapshot());
      },
    );
    this.#root
      .querySelectorAll<HTMLInputElement>("[data-popup-placement]")
      .forEach((input) => {
        input.addEventListener("input", () => {
          if (!this.#selectedPopupId || input.disabled) return;
          this.#session.popupPlacementDrafts.set(
            popupPlacementDraftKey(
              this.#selectedPopupId,
              input.dataset.popupPlacement as SceneLayoutVariantId,
              input.dataset.popupPlacementField as "x" | "y" | "scale",
            ),
            input.value,
          );
        });
        input.addEventListener("change", () => {
          const popupId = this.#selectedPopupId;
          const variant = input.dataset.popupPlacement as SceneLayoutVariantId;
          const field = input.dataset.popupPlacementField as
            | "x"
            | "y"
            | "scale";
          if (!popupId) {
            this.#store.setExternalError(
              new Error("尚未选择 popup dependency。"),
            );
            return;
          }
          const key = popupPlacementDraftKey(popupId, variant, field);
          const committed = this.runTransaction((project) => {
            const dependency = project.popupDependencies.get(popupId);
            if (!dependency) throw new Error("尚未选择 popup dependency。");
            if (!activeVariantIds(project).includes(variant)) return;
            const placement = dependency.placements[variant];
            if (!placement)
              throw new Error(`popup placement ${variant} 缺失。`);
            const next = { ...placement, [field]: Number(input.value) };
            setPopupPlacement(project, popupId, variant, next);
          });
          if (committed) {
            this.#session.popupPlacementDrafts.delete(key);
            this.renderPopupControls(this.#store.getSnapshot());
          }
        });
      });
    this.requireSelect("[data-reel-set]").addEventListener(
      "change",
      (event) => {
        try {
          const name = (event.currentTarget as HTMLSelectElement).value;
          if (!name) throw new Error("请选择 reel set。");
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
    this.resetTransientDraftsForProjectReplace();
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

  private async selectAuthoringPreviewMode(
    modeId: string,
    syncPreviewTarget = true,
  ): Promise<void> {
    const preview = this.#preview;
    const projectRevision = this.#store.getSnapshot().revision;
    const snapshot = preview?.getGameModeSnapshot() ?? null;
    if (
      !preview ||
      !snapshot ||
      this.#previewReadyProjectRevision !== projectRevision
    )
      return;
    if (this.#previewModeBusy || snapshot.phase === "transitioning") {
      this.#store.setExternalError(
        new Error("真实转场进行中，暂时不能切换编辑预览状态。"),
      );
      return;
    }
    const request = ++this.#previewModeRequest;
    this.#previewPrepareRequest += 1;
    this.#previewPrepareIdentity = null;
    this.#previewModeBusy = true;
    this.#session.previewTransition = {
      phase: "idle",
      message: `正在切换编辑预览到 ${modeId}。`,
    };
    this.renderPreviewModeProgress();
    try {
      await preview.selectAuthoringGameMode(modeId);
      if (request !== this.#previewModeRequest || this.#destroyed) return;
      const settled = preview.getGameModeSnapshot();
      if (
        !settled ||
        settled.phase !== "stable" ||
        settled.stableMode !== modeId ||
        settled.displayedMode !== modeId
      )
        throw new Error(`编辑预览未稳定在目标状态 ${modeId}。`);
      if (syncPreviewTarget) this.#selectedPreviewMode = modeId;
      this.#session.previewTransition = {
        phase: "complete",
        stableMode: modeId,
      };
      this.#store.clearExternalError();
    } catch (error) {
      if (request !== this.#previewModeRequest || this.#destroyed) return;
      this.#session.previewTransition = {
        phase: "error",
        message: formatUiError(error),
      };
      this.#store.setExternalError(error);
    } finally {
      if (request === this.#previewModeRequest && !this.#destroyed) {
        this.#previewModeBusy = false;
        this.renderWorkspace(this.#store.getSnapshot());
        this.renderPopupControls(this.#store.getSnapshot());
        await this.ensurePreviewTransitionPrepared();
      }
    }
  }

  private requestPreviewMode(modeId: string): void {
    const preview = this.#preview;
    const snapshot = preview?.getGameModeSnapshot() ?? null;
    const state = this.#session.previewTransition;
    if (
      !preview ||
      !snapshot ||
      state.phase !== "ready" ||
      state.from !== snapshot.stableMode ||
      state.to !== modeId
    ) {
      const error = new Error("当前转场尚未准备完成，不能发起状态切换。");
      this.#session.previewTransition = {
        phase: "error",
        message: error.message,
      };
      this.#store.setExternalError(error);
      return;
    }

    const request = ++this.#previewModeRequest;
    this.#previewPrepareRequest += 1;
    this.#previewPrepareIdentity = null;
    this.#previewModeBusy = true;
    this.#session.previewTransition = {
      phase: "starting",
      from: state.from,
      to: state.to,
      kind: state.kind,
    };
    this.renderPreviewModeProgress();

    // Keep this invocation in the trusted click/pointer call stack. In
    // particular, do not await preparation before calling requestGameMode().
    const pending = preview.requestGameMode(modeId);
    this.startPreviewModeMonitor(request);
    void pending
      .then(() => {
        if (request !== this.#previewModeRequest || this.#destroyed) return;
        const settled = preview.getGameModeSnapshot();
        if (
          !settled ||
          settled.phase !== "stable" ||
          settled.stableMode !== modeId ||
          settled.displayedMode !== modeId
        )
          throw new Error(
            `转场 promise 已完成，但 preview 未稳定在目标状态 ${modeId}。`,
          );
        this.#selectedPreviewMode = settled.stableMode;
        if (this.#followEditMode) this.#selectedGameMode = settled.stableMode;
        this.#session.previewTransition = {
          phase: "complete",
          stableMode: this.#selectedPreviewMode,
        };
        this.#store.clearExternalError();
      })
      .catch((error: unknown) => {
        if (request !== this.#previewModeRequest || this.#destroyed) return;
        this.#session.previewTransition = {
          phase: "error",
          message: formatUiError(error),
        };
        this.#store.setExternalError(error);
      })
      .finally(() => {
        if (request !== this.#previewModeRequest || this.#destroyed) return;
        this.#previewModeBusy = false;
        this.stopPreviewModeMonitor();
        this.renderWorkspace(this.#store.getSnapshot());
      });
  }

  private requestPreviewPopupInteraction(): void {
    try {
      const result = this.#preview?.requestPrimaryPopupInteraction();
      if (!result?.handled)
        throw new Error("当前 preview 没有可处理的 Popup 操作。");
      if (result.completion)
        void result.completion.catch((error) => {
          this.#store.setExternalError(error);
        });
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private reconcileSelectedTransitionForTarget(): void {
    const snapshot = this.#preview?.getGameModeSnapshot();
    if (!snapshot || snapshot.phase !== "stable") return;
    const edge = this.#store
      .getSnapshot()
      .project.gameModes.transitions.find(
        (candidate) =>
          candidate.fromModeId === snapshot.stableMode &&
          candidate.toModeId === this.#selectedPreviewMode,
      );
    if (edge) this.#session.selectedTransitionKey = transitionKey(edge);
  }

  private ensurePreviewTransitionPrepared(): Promise<void> {
    if (this.#destroyed || this.#previewModeBusy) return Promise.resolve();
    const storeSnapshot = this.#store.getSnapshot();
    const project = storeSnapshot.project;
    const runtimeSnapshot = this.#preview?.getGameModeSnapshot() ?? null;
    const target = this.#selectedPreviewMode;
    let idleMessage: string | null = null;
    if (!runtimeSnapshot) {
      idleMessage =
        storeSnapshot.errors[0] ??
        "当前配置尚未形成可切换的 package preview；请先修复项目错误。";
    } else if (this.#previewReadyProjectRevision !== storeSnapshot.revision) {
      idleMessage = "正在重建当前项目预览。";
    } else if (target === runtimeSnapshot.stableMode) {
      idleMessage = `当前已是 ${target}`;
    }
    const edge = idleMessage
      ? undefined
      : project.gameModes.transitions.find(
          (candidate) =>
            candidate.fromModeId === runtimeSnapshot!.stableMode &&
            candidate.toModeId === target,
        );
    if (!idleMessage && !edge)
      idleMessage = `缺少 ${runtimeSnapshot!.stableMode} → ${target} 直接有向转场`;
    if (idleMessage) {
      this.#previewPrepareRequest += 1;
      this.#previewPrepareIdentity = null;
      if (
        runtimeSnapshot?.phase === "stable" &&
        runtimeSnapshot.preparedTargetMode
      ) {
        try {
          this.#preview?.cancelPreparedGameModeTransition();
        } catch (error) {
          this.#session.previewTransition = {
            phase: "error",
            message: formatUiError(error),
          };
          this.renderPreviewModeProgress();
          return Promise.resolve();
        }
      }
      this.#session.previewTransition = {
        phase: "idle",
        message: idleMessage,
      };
      this.renderPreviewModeProgress();
      return Promise.resolve();
    }

    const source = runtimeSnapshot!.stableMode;
    const kind = edge!.kind;
    const identity = `${this.#previewRevision}:${storeSnapshot.revision}:${source}:${target}:${kind}`;
    if (
      this.#previewPrepareIdentity === identity &&
      ["preparing", "ready"].includes(this.#session.previewTransition.phase)
    )
      return this.#previewPrepareChain;
    if (
      runtimeSnapshot!.preparedTargetMode === target &&
      runtimeSnapshot!.transitionKind === kind
    ) {
      this.#previewPrepareIdentity = identity;
      this.#session.previewTransition = {
        phase: "ready",
        from: source,
        to: target,
        kind,
      };
      this.renderWorkspace(this.#store.getSnapshot());
      return Promise.resolve();
    }

    const request = ++this.#previewPrepareRequest;
    const previewRevision = this.#previewRevision;
    this.#previewPrepareIdentity = identity;
    this.#session.previewTransition = {
      phase: "preparing",
      from: source,
      to: target,
      kind,
    };
    this.renderWorkspace(storeSnapshot);
    const preview = this.#preview!;
    const job = this.#previewPrepareChain
      .catch(() => undefined)
      .then(async () => {
        if (
          request !== this.#previewPrepareRequest ||
          previewRevision !== this.#previewRevision ||
          this.#destroyed
        )
          return;
        const before = preview.getGameModeSnapshot();
        if (before?.preparedTargetMode)
          preview.cancelPreparedGameModeTransition();
        await preview.prepareGameModeTransition(target);
        if (
          request !== this.#previewPrepareRequest ||
          previewRevision !== this.#previewRevision ||
          this.#destroyed
        ) {
          if (previewRevision === this.#previewRevision) {
            const stale = preview.getGameModeSnapshot();
            if (
              stale?.phase === "stable" &&
              stale.preparedTargetMode === target
            )
              preview.cancelPreparedGameModeTransition();
          }
          return;
        }
        const prepared = preview.getGameModeSnapshot();
        if (
          prepared?.stableMode !== source ||
          prepared.preparedTargetMode !== target ||
          prepared.transitionKind !== kind
        )
          throw new Error(
            `转场 ${source} → ${target} prepare snapshot 不匹配。`,
          );
        this.#session.previewTransition = {
          phase: "ready",
          from: source,
          to: target,
          kind,
        };
        this.#store.clearExternalError();
        this.renderWorkspace(this.#store.getSnapshot());
      })
      .catch((error: unknown) => {
        if (request !== this.#previewPrepareRequest || this.#destroyed) return;
        this.#previewPrepareIdentity = null;
        this.#session.previewTransition = {
          phase: "error",
          message: formatUiError(error),
        };
        this.#store.setExternalError(error);
        this.renderWorkspace(this.#store.getSnapshot());
      });
    this.#previewPrepareChain = job;
    return job;
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
    if (
      modeSnapshot?.phase === "transitioning" &&
      modeSnapshot.transition &&
      modeSnapshot.transitionPhase &&
      modeSnapshot.transitionKind
    ) {
      this.#session.previewTransition = {
        phase: "transitioning",
        from: modeSnapshot.transition.from,
        to: modeSnapshot.transition.to,
        kind: modeSnapshot.transitionKind,
        boundary: modeSnapshot.transitionPhase,
      };
    }
    this.renderPreviewRuntimeControls(project, modeSnapshot);
    if (this.#session.activeTab === "transitions")
      updateTransitionRuntimeUi(
        this.requireElement("[data-workspace-panel]"),
        modeSnapshot,
        this.#session.previewTransition,
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
    const focusSnapshot = this.captureFocusSnapshot();
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
    const modeIds = new Set(
      snapshot.project.gameModes.modes.map((mode) => mode.id),
    );
    if (!modeIds.has(this.#session.newTransitionFromModeId))
      this.#session.newTransitionFromModeId = "";
    if (!modeIds.has(this.#session.newTransitionToModeId))
      this.#session.newTransitionToModeId = "";
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
                this.#preview?.getCurrentVariantId() ?? null,
              )
            : this.#session.activeTab === "transitions"
              ? transitionsWorkspaceMarkup({
                  project: snapshot.project,
                  selectedKey: this.#session.selectedTransitionKey,
                  newFromModeId: this.#session.newTransitionFromModeId,
                  newToModeId: this.#session.newTransitionToModeId,
                  snapshot: this.#preview?.getGameModeSnapshot() ?? null,
                  uiState: this.#session.previewTransition,
                })
              : projectWorkspaceMarkup(snapshot.project, snapshot.errors);
    if (this.#session.activeTab === "transitions") {
      const from = panel.querySelector<HTMLSelectElement>(
        "[data-new-transition-from]",
      );
      const to = panel.querySelector<HTMLSelectElement>(
        "[data-new-transition-to]",
      );
      if (from) from.value = this.#session.newTransitionFromModeId;
      if (to) to.value = this.#session.newTransitionToModeId;
    }
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
    this.restoreFocusSnapshot(focusSnapshot);
    this.renderPicker(snapshot.project);
    const modeDialog =
      this.#root.querySelector<HTMLDialogElement>("[data-mode-dialog]");
    if (modeDialog?.open || modeDialog?.hasAttribute("open"))
      this.renderModeDialog(snapshot.project);
    this.renderProjectStatus(snapshot);
    this.renderPopupControls(snapshot);
    this.renderSymbolsMetadata();
    this.syncPreviewSelection();
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
    for (const [id, dependency] of project.popupDependencies) {
      if (dependency.type !== "award-celebration") continue;
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
      ? dependency.keys.reduce(
          (sum, key) => sum + (project.assets.get(key)?.byteLength ?? 0),
          0,
        )
      : 0;
    const registerButton = this.requireElement(
      "[data-register-popup]",
    ) as HTMLButtonElement;
    registerButton.disabled = dependency?.type !== "spine";
    registerButton.textContent = dependency
      ? project.registeredSpinePopupIds.has(dependency.id)
        ? "取消注册 Spine Popup"
        : "注册 Spine Popup"
      : "注册 Spine Popup";
    this.requireElement("[data-popup-metadata]").textContent = dependency
      ? `${dependency.id} · ${dependency.type} · ${dependency.keys.length} files · ${totalBytes} bytes · ${dependency.type === "spine" ? `Scene Layout：${project.registeredSpinePopupIds.has(dependency.id) ? "已注册" : "未注册"}` : `引用：${references.join(", ") || "无"}`}`
      : "未导入 Popup dependency。";
    const popupOrderInput = this.requireInput("[data-popup-order]");
    popupOrderInput.disabled = !dependency;
    popupOrderInput.value = String(dependency?.order ?? 2000);
    for (const input of this.#root.querySelectorAll<HTMLInputElement>(
      "[data-popup-placement]",
    )) {
      const variant = input.dataset.popupPlacement as SceneLayoutVariantId;
      const placement = dependency?.placements[variant];
      const field = input.dataset.popupPlacementField as "x" | "y" | "scale";
      input.disabled = !placement;
      const draftKey = this.#selectedPopupId
        ? popupPlacementDraftKey(this.#selectedPopupId, variant, field)
        : null;
      if (!placement && draftKey)
        this.#session.popupPlacementDrafts.delete(draftKey);
      input.value =
        (draftKey
          ? this.#session.popupPlacementDrafts.get(draftKey)
          : undefined) ??
        String(placement?.[field] ?? (field === "scale" ? 1 : 0));
    }

    const modeSnapshot = this.#preview?.getGameModeSnapshot?.() ?? null;
    this.renderPreviewRuntimeControls(project, modeSnapshot);
  }

  private renderModeDialog(project: EditorProject): void {
    const dialog =
      this.#root.querySelector<HTMLDialogElement>("[data-mode-dialog]");
    if (!dialog) return;
    this.#selectedGameMode = normalizeStateManagerSelection(
      project,
      this.#selectedGameMode,
    );
    dialog.innerHTML = stateManagerDialogMarkup({
      project,
      selectedModeId: this.#selectedGameMode,
      newModeId: this.#modeDialogNewId,
      renameModeId: this.#modeDialogRenameId,
      feedback: this.#modeDialogFeedback,
    });
    const close = (): void => {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    };
    dialog
      .querySelector<HTMLButtonElement>("[data-close-mode-dialog]")!
      .addEventListener("click", close);
    dialog
      .querySelector<HTMLInputElement>("[data-new-game-mode]")!
      .addEventListener("input", (event) => {
        this.#modeDialogNewId = (event.currentTarget as HTMLInputElement).value;
      });
    dialog
      .querySelector<HTMLInputElement>("[data-rename-game-mode-input]")!
      .addEventListener("input", (event) => {
        this.#modeDialogRenameId = (
          event.currentTarget as HTMLInputElement
        ).value;
      });
    dialog
      .querySelectorAll<HTMLButtonElement>("[data-select-game-mode]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#selectedGameMode = button.dataset.selectGameMode!;
          this.#modeDialogRenameId = this.#selectedGameMode;
          this.#modeDialogFeedback = `已选择状态 ${this.#selectedGameMode}`;
          if (this.#followEditMode)
            this.#selectedPreviewMode = this.#selectedGameMode;
          this.renderWorkspace(this.#store.getSnapshot());
          if (this.#followEditMode)
            void this.selectAuthoringPreviewMode(this.#selectedGameMode);
          else void this.ensurePreviewTransitionPrepared();
        }),
      );
    dialog
      .querySelector<HTMLButtonElement>("[data-add-game-mode]")!
      .addEventListener("click", () => {
        const id = this.#modeDialogNewId;
        if (!this.runTransaction((draft) => addGameMode(draft, id))) {
          this.#modeDialogFeedback =
            this.#store.getSnapshot().externalError ?? "新建状态失败。";
          this.renderModeDialog(this.#store.getSnapshot().project);
          return;
        }
        this.#selectedGameMode = id;
        this.#modeDialogNewId = "";
        this.#modeDialogRenameId = id;
        this.#modeDialogFeedback = `已创建状态 ${id}`;
        if (this.#followEditMode) this.#selectedPreviewMode = id;
        this.renderWorkspace(this.#store.getSnapshot());
      });
    dialog
      .querySelector<HTMLButtonElement>("[data-rename-game-mode]")!
      .addEventListener("click", () => {
        const previous = this.#selectedGameMode;
        const next = this.#modeDialogRenameId;
        if (
          !this.runTransaction((draft) => renameGameMode(draft, previous, next))
        ) {
          this.#modeDialogFeedback =
            this.#store.getSnapshot().externalError ?? "重命名状态失败。";
          this.renderModeDialog(this.#store.getSnapshot().project);
          return;
        }
        this.#selectedGameMode = next;
        if (this.#selectedPreviewMode === previous)
          this.#selectedPreviewMode = next;
        this.#modeDialogFeedback = `已将状态 ${previous} 重命名为 ${next}`;
        this.renderWorkspace(this.#store.getSnapshot());
      });
    dialog
      .querySelector<HTMLButtonElement>("[data-set-initial-mode]")!
      .addEventListener("click", () => {
        if (
          !this.runTransaction((draft) =>
            setInitialGameMode(draft, this.#selectedGameMode),
          )
        ) {
          this.#modeDialogFeedback =
            this.#store.getSnapshot().externalError ?? "设置 initial 失败。";
          this.renderModeDialog(this.#store.getSnapshot().project);
          return;
        }
        this.#modeDialogFeedback = `已将 ${this.#selectedGameMode} 设为 initial`;
        this.renderWorkspace(this.#store.getSnapshot());
      });
    dialog
      .querySelector<HTMLButtonElement>("[data-delete-game-mode]")!
      .addEventListener("click", () => {
        const removed = this.#selectedGameMode;
        if (!this.runTransaction((draft) => deleteGameMode(draft, removed))) {
          this.#modeDialogFeedback =
            this.#store.getSnapshot().externalError ?? "删除状态失败。";
          this.renderModeDialog(this.#store.getSnapshot().project);
          return;
        }
        const next = this.#store.getSnapshot().project.gameModes.initialMode;
        this.#selectedGameMode = next;
        if (this.#selectedPreviewMode === removed)
          this.#selectedPreviewMode = next;
        this.#modeDialogRenameId = next;
        this.#modeDialogFeedback = `已删除状态 ${removed}`;
        this.renderWorkspace(this.#store.getSnapshot());
      });
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
    const selectedDependency = this.#selectedPopupId
      ? project.popupDependencies.get(this.#selectedPopupId)
      : undefined;
    const selectedSpineReady = Boolean(
      selectedDependency?.type === "spine" &&
      project.registeredSpinePopupIds.has(selectedDependency.id),
    );
    const transitioning = Boolean(
      this.#previewModeBusy || modeSnapshot?.phase === "transitioning",
    );
    const popupActive = Boolean(
      popupSnapshot && !["idle", "complete"].includes(popupSnapshot.phase),
    );
    const transitionReady = Boolean(
      modeSnapshot &&
      this.#session.previewTransition.phase === "ready" &&
      this.#session.previewTransition.from === modeSnapshot.stableMode &&
      this.#session.previewTransition.to === this.#selectedPreviewMode,
    );
    modeSelect.disabled = transitioning || popupActive;
    previewModeSelect.disabled = Boolean(
      !modeSnapshot || transitioning || popupActive,
    );
    (
      this.requireElement("[data-request-preview-mode]") as HTMLButtonElement
    ).disabled = Boolean(
      !modeSnapshot || transitioning || popupActive || !transitionReady,
    );
    popupSelect.disabled = transitioning;
    const stableMode = project.gameModes.modes.find(
      (candidate) => candidate.id === modeSnapshot?.stableMode,
    );
    (this.requireElement("[data-play-popup]") as HTMLButtonElement).disabled =
      Boolean(
        transitioning ||
        (!stableMode?.awardCelebrationPopupId && !selectedSpineReady),
      );
    (
      this.requireElement("[data-advance-popup]") as HTMLButtonElement
    ).disabled = !popupActive && !selectedSpineReady;
    (
      this.requireElement("[data-dismiss-popup]") as HTMLButtonElement
    ).disabled = !popupActive && !selectedSpineReady;
    this.requireElement("[data-popup-runtime-status]").textContent =
      selectedSpineReady
        ? `spine popup ${selectedDependency!.id} · 已注册，可独立播放`
        : modeSnapshot
          ? `mode ${modeSnapshot.phase}: stable=${modeSnapshot.stableMode} displayed=${modeSnapshot.displayedMode}${modeSnapshot.targetMode ? ` target=${modeSnapshot.targetMode} ${modeSnapshot.transitionPhase}` : ""} · popup=${stableMode?.awardCelebrationPopupId ?? "无"}${popupSnapshot ? ` · ${popupSnapshot.phase}/${popupSnapshot.activeTierId ?? "none"}/${popupSnapshot.activeSegment ?? "none"}` : ""}`
          : `mode=${mode.id} · popup=${mode.awardCelebrationPopupId ?? "无"}`;
    const transitionStatus = transitionUiStateText(
      this.#session.previewTransition,
      modeSnapshot,
    );
    this.requireElement("[data-preview-transition-status]").textContent =
      transitionStatus;
    this.requireElement("[data-main-state-status]").textContent =
      `${transitionStatus} · initial=${project.gameModes.initialMode}`;
  }

  private bindWorkspaceActions(project: EditorProject): void {
    const panel = this.requireElement("[data-workspace-panel]");
    panel
      .querySelector<HTMLSelectElement>("[data-new-transition-from]")
      ?.addEventListener("change", (event) => {
        this.#session.newTransitionFromModeId = (
          event.currentTarget as HTMLSelectElement
        ).value;
      });
    panel
      .querySelector<HTMLSelectElement>("[data-new-transition-to]")
      ?.addEventListener("change", (event) => {
        this.#session.newTransitionToModeId = (
          event.currentTarget as HTMLSelectElement
        ).value;
      });
    panel
      .querySelectorAll<HTMLButtonElement>("[data-transition-key]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          this.#session.selectedTransitionKey = button.dataset.transitionKey!;
          const transition = project.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (transition) this.#selectedPreviewMode = transition.toModeId;
          this.renderWorkspace(this.#store.getSnapshot());
          void this.ensurePreviewTransitionPrepared();
        }),
      );
    panel
      .querySelector<HTMLButtonElement>("[data-create-transition]")
      ?.addEventListener("click", () => {
        this.#session.newTransitionFromModeId =
          panel.querySelector<HTMLSelectElement>("[data-new-transition-from]")
            ?.value ?? "";
        this.#session.newTransitionToModeId =
          panel.querySelector<HTMLSelectElement>("[data-new-transition-to]")
            ?.value ?? "";
        const from = this.#session.newTransitionFromModeId;
        const to = this.#session.newTransitionToModeId;
        if (!from || !to) {
          this.#store.setExternalError(
            new Error("新建转场必须明确选择 from 与 to。"),
          );
          return;
        }
        if (
          !this.runTransaction(
            (draft) => createGameModeTransition(draft, from, to),
            `已创建转场 ${from} -> ${to}。`,
          )
        )
          return;
        this.#session.selectedTransitionKey = `${from}::${to}`;
        this.#selectedPreviewMode = to;
        this.#session.newTransitionFromModeId = "";
        this.#session.newTransitionToModeId = "";
        this.renderWorkspace(this.#store.getSnapshot());
      });
    panel
      .querySelector<HTMLSelectElement>("[data-transition-kind]")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value as
          | "none"
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
      .querySelector<HTMLSelectElement>("[data-transition-prelude-popup]")
      ?.addEventListener("change", (event) => {
        const value = (event.currentTarget as HTMLSelectElement).value || null;
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          setGameModeTransitionPreludePopup(draft, transition, value);
        });
      });
    panel
      .querySelector<HTMLInputElement>("[data-transition-popup-order]")
      ?.addEventListener("change", (event) => {
        const value = Number((event.currentTarget as HTMLInputElement).value);
        this.runTransaction((draft) => {
          const transition = draft.gameModes.transitions.find(
            (candidate) =>
              transitionKey(candidate) === this.#session.selectedTransitionKey,
          );
          if (!transition) throw new Error("所选转场已不存在。");
          if (!transition.preludePopupId)
            throw new Error("当前转场未配置前置 Popup。");
          setPopupOrder(draft, transition.preludePopupId, value);
        });
      });
    panel
      .querySelectorAll<HTMLInputElement>("[data-transition-popup-placement]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          const variant = input.dataset
            .transitionPopupPlacement as SceneLayoutVariantId;
          const field = input.dataset.transitionPopupPlacementField as
            | "x"
            | "y"
            | "scale";
          this.runTransaction((draft) => {
            const transition = draft.gameModes.transitions.find(
              (candidate) =>
                transitionKey(candidate) ===
                this.#session.selectedTransitionKey,
            );
            if (!transition) throw new Error("所选转场已不存在。");
            if (!transition.preludePopupId)
              throw new Error("当前转场未配置前置 Popup。");
            const dependency = draft.popupDependencies.get(
              transition.preludePopupId,
            );
            const placement = dependency?.placements[variant];
            if (!dependency || !placement)
              throw new Error(`Popup ${variant} placement 缺失。`);
            setPopupPlacement(draft, dependency.id, variant, {
              ...placement,
              [field]: Number(input.value),
            });
          });
        }),
      );
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
      .querySelector<HTMLButtonElement>("[data-request-transition]")
      ?.addEventListener("click", () => {
        if (
          this.#preview?.getGameModeSnapshot()?.transitionPhase ===
          "awaiting-video-start"
        ) {
          this.requestPreviewPopupInteraction();
          return;
        }
        this.requestPreviewMode(this.#selectedPreviewMode);
      });
    panel
      .querySelector<HTMLButtonElement>("[data-dismiss-transition-prelude]")
      ?.addEventListener("click", () => {
        this.requestPreviewPopupInteraction();
      });
    panel
      .querySelector("[data-upload-resources]")
      ?.addEventListener("click", () => void this.uploadResources(false));
    const query = panel.querySelector<HTMLInputElement>(
      "[data-resource-query]",
    );
    query?.addEventListener("input", (event) => {
      this.#session.resourceQuery = query.value;
      if ((event as InputEvent).isComposing) return;
      this.renderWorkspace(this.#store.getSnapshot());
    });
    query?.addEventListener("compositionend", () => {
      this.#session.resourceQuery = query.value;
      this.renderWorkspace(this.#store.getSnapshot());
    });
    const type = panel.querySelector<HTMLSelectElement>("[data-resource-type]");
    type?.addEventListener("change", () => {
      this.#session.resourceType = type.value as
        | "all"
        | "image"
        | "spine"
        | "vni"
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
        | "runtime"
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
      .querySelectorAll<HTMLButtonElement>("[data-runtime-resource-action]")
      .forEach((button) =>
        button.addEventListener("click", () => {
          const resourceId = button.dataset.runtimeResourceAction!;
          const project = this.#store.getSnapshot().project;
          const current = getRuntimeResourceKey(project, resourceId);
          if (current) {
            this.runTransaction(
              (draft) => unbindRuntimeResource(draft, resourceId),
              `已取消程序资源 ${current}；若无 Scene 引用将不再导出。`,
            );
            return;
          }
          const input = [
            ...panel.querySelectorAll<HTMLInputElement>(
              "[data-runtime-resource-key]",
            ),
          ].find(
            (candidate) => candidate.dataset.runtimeResourceKey === resourceId,
          );
          const key = normalizeRuntimeResourceKey(input?.value ?? "");
          this.runTransaction(
            (draft) => bindRuntimeResource(draft, resourceId, key),
            `已将资源 ${resourceId} 绑定为程序资源 ${key}。`,
          );
        }),
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
      .querySelectorAll<HTMLInputElement>("[data-layer-loop]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.runTransaction(
            (draft) =>
              setNodePlaybackLoop(
                draft,
                input.dataset.layerLoop!,
                input.checked,
              ),
            input.checked ? "已启用循环播放。" : "已关闭循环播放。",
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
      .querySelectorAll<HTMLInputElement>("[data-layer-global]")
      .forEach((input) =>
        input.addEventListener("change", () =>
          this.runTransaction(
            (draft) =>
              setLayerGameMode(
                draft,
                input.dataset.layerGlobal!,
                input.checked ? null : this.#selectedGameMode,
              ),
            input.checked
              ? "图层已设为所有状态有效。"
              : `图层已绑定状态 ${this.#selectedGameMode}。`,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLSelectElement>("[data-layer-game-mode]")
      .forEach((select) =>
        select.addEventListener("change", () =>
          this.runTransaction(
            (draft) =>
              setLayerGameMode(
                draft,
                select.dataset.layerGameMode!,
                select.value,
              ),
            `图层已绑定状态 ${select.value}。`,
          ),
        ),
      );
    panel
      .querySelectorAll<HTMLInputElement>("[data-layer-visible]")
      .forEach((input) =>
        input.addEventListener("change", () => {
          const node = project.nodes.find(
            (candidate) => candidate.id === input.dataset.layerNodeId,
          );
          const remembered = Boolean(
            node?.hiddenPlacements?.[
              input.dataset.layerVisible as "landscape" | "portrait"
            ],
          );
          this.runTransaction(
            (draft) =>
              setLayerVariantVisibility(
                draft,
                input.dataset.layerNodeId!,
                input.dataset.layerVisible as "landscape" | "portrait",
                input.checked,
              ),
            input.checked
              ? remembered
                ? `${input.dataset.layerVisible} placement 已恢复此前编辑值。`
                : `${input.dataset.layerVisible} placement 已以固定初值创建。`
              : `${input.dataset.layerVisible} placement 已隐藏并保留编辑值。`,
          );
        }),
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
          const nodeTransformMatch =
            /^nodes\.(\d+)\.placements\.(default|landscape|portrait)\.(rotation|center\.[xy])$/u.exec(
              path,
            );
          const nodeOrderMatch = /^nodes\.(\d+)\.order$/u.exec(path);
          if (nodeTransformMatch) {
            const node = draft.nodes[Number(nodeTransformMatch[1])];
            const placement =
              node?.placements[nodeTransformMatch[2] as SceneLayoutVariantId];
            if (!placement) throw new Error(`无效字段路径：${path}`);
            placement.rotation ??= 0;
            placement.center ??= { x: 0.5, y: 0.5 };
          }
          const transitionPlacementMatch =
            /^transition\.(default|landscape|portrait)\.(x|y|scale)$/u.exec(
              path,
            );
          if (nodeOrderMatch) {
            const node = draft.nodes[Number(nodeOrderMatch[1])];
            if (!node) throw new Error(`无效字段路径：${path}`);
            setNodeOrder(draft, node.id, Number(input.value));
          } else if (path === "reel.order") {
            setReelOrder(draft, Number(input.value));
          } else if (transitionPlacementMatch) {
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
    panel
      .querySelector<HTMLButtonElement>("[data-toggle-coordinate-origin]")
      ?.addEventListener("click", (event) => {
        const target = (event.currentTarget as HTMLButtonElement).dataset
          .toggleCoordinateOrigin as "top-left" | "center";
        if (
          !window.confirm(
            `确认切换为${target === "center" ? "中心" : "左上角"}坐标？现有 art-space 坐标会统一转换。`,
          )
        )
          return;
        this.runTransaction(
          (draft) => convertProjectCoordinateOrigin(draft, target),
          `全局坐标类型已切换为 ${target}。`,
        );
      });
  }

  private selectOutline(key: string): void {
    this.#session.selection = parseSelectionKey(key);
    this.renderWorkspace(this.#store.getSnapshot());
  }

  private syncPreviewSelection(): void {
    const selection = this.#session.selection;
    this.#preview?.setSelectedLayer(
      selection?.kind === "layer" ? selection.nodeId : null,
    );
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
    const focusSnapshot = dialog.contains(document.activeElement)
      ? this.captureFocusSnapshot()
      : null;
    const state = this.#session.picker;
    if (!state) {
      this.#resourcePickerPreview.clear();
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
    const needsSpineBackgroundArtSize =
      state.context.kind === "assign-background" &&
      selected?.kind === "spine" &&
      (project.variants[state.context.variant].artSize.width <= 0 ||
        project.variants[state.context.variant].artSize.height <= 0);
    const backgroundArtSizeFields = needsSpineBackgroundArtSize
      ? `<fieldset><legend>背景 art size（必填）</legend><p class="hint">这是完整背景画布尺寸，不从 Spine export bounds 或 atlas texture 猜测。</p><label>width<input type="number" min="1" step="1" data-picker-art-width value="${Number.isFinite(state.backgroundArtSize.width) && state.backgroundArtSize.width > 0 ? state.backgroundArtSize.width : ""}" /></label><label>height<input type="number" min="1" step="1" data-picker-art-height value="${Number.isFinite(state.backgroundArtSize.height) && state.backgroundArtSize.height > 0 ? state.backgroundArtSize.height : ""}" /></label></fieldset>`
      : "";
    const placementHint =
      state.context.kind === "assign-background"
        ? "背景初始 placement 按完整 art size 居中，scale 为 1。不会按文件名或唯一候选自动绑定。"
        : state.context.kind === "add-layer" && selected?.kind === "spine"
          ? "普通 Spine 以骨架原点放在当前画布中心，不需要填写骨架大小；scale 为 1。"
          : state.context.kind === "add-layer"
            ? "初始 placement 为 { x: 0, y: 0, scale: 1 }。不会按文件名或唯一候选自动绑定。"
            : "重绑资源会保留已有 placement，并尽可能保留兼容的播放配置。";
    dialog.innerHTML = `<div class="picker-shell"><header><div><span>Resource Picker</span><h2>${escapeHtml(contextLabel)}</h2></div><button type="button" data-picker-cancel aria-label="关闭资源选择器">×</button></header><div class="picker-toolbar"><label>搜索<input type="search" data-picker-query value="${escapeHtml(state.query)}" /></label><label>类型<select data-picker-type><option value="all">全部</option><option value="image" ${state.type === "image" ? "selected" : ""}>Image</option><option value="spine" ${state.type === "spine" ? "selected" : ""}>Spine</option><option value="vni" ${state.type === "vni" ? "selected" : ""}>VNI</option><option value="image-string" ${state.type === "image-string" ? "selected" : ""}>Image String</option></select></label><button type="button" data-picker-import>导入资源 / ZIP</button></div><div class="picker-body"><div class="picker-candidates" role="listbox" aria-label="可用资源">${candidates.map((candidate) => `<button type="button" role="option" data-picker-candidate="${escapeHtml(candidate.resourceId)}" aria-selected="${candidate.resourceId === state.selectedResourceId}" ${candidate.disabledReason ? `disabled title="${escapeHtml(candidate.disabledReason)}"` : ""}><span class="type-mark">${candidate.kind === "spine" ? "SP" : candidate.kind === "vni" ? "VNI" : candidate.kind === "image-string" ? "TXT" : "IMG"}</span><span><strong>${escapeHtml(candidate.resourceId)}</strong><small title="${escapeHtml(candidate.primaryPath)}">${escapeHtml(candidate.primaryPath)}</small><small>${escapeHtml(candidate.summary)} · ${candidate.status} · 引用 ${candidate.referenceCount}</small></span></button>`).join("") || '<p class="empty-state">没有匹配资源；导入后仍需明确选择并确认。</p>'}</div><section class="picker-form"><div class="picker-resource-preview" data-picker-preview aria-live="polite"></div>${selected ? `<p><strong>${escapeHtml(selected.id)}</strong><br/><span class="path">${escapeHtml(editorResourcePaths(selected)[0]!)}</span></p>` : "<p>请选择一个 filename-key resource。</p>"}${state.context.kind === "add-layer" ? `<label>node id<input data-picker-node-id value="${escapeHtml(state.nodeId)}" /></label>` : state.context.kind === "assign-background" ? `<p class="hint">背景 node id 将按 ${escapeHtml(state.context.modeId)} / ${escapeHtml(state.context.variant)} 稳定生成。</p>` : ""}${
      state.context.kind === "add-layer" && project.mode === "orientation-focus"
        ? activeVariantIds(project)
            .map(
              (variant) =>
                `<label class="visibility"><input type="checkbox" data-picker-variant="${variant}" ${state.variants.includes(variant) ? "checked" : ""}/> ${variant} 初始可见</label>`,
            )
            .join("")
        : ""
    }${backgroundArtSizeFields}${selected?.kind === "spine" ? `<label>default animation<select data-picker-animation><option value="">必须明确选择</option>${selected.animationNames.map((name) => `<option value="${escapeHtml(name)}" ${state.defaultAnimation === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>` : ""}<p class="hint">${escapeHtml(placementHint)}</p></section></div><footer><button type="button" data-picker-cancel>取消</button><button type="button" class="primary" data-picker-confirm ${selected ? "" : "disabled"}>确认</button></footer></div>`;
    if (!dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    }
    void this.#resourcePickerPreview.show({
      host: dialog.querySelector<HTMLElement>("[data-picker-preview]")!,
      project,
      resource: selected,
      animation: state.defaultAnimation,
    });
    this.bindPickerDynamicActions(project);
    if (focusSnapshot) this.restoreFocusSnapshot(focusSnapshot);
    else if (focus)
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
    query.addEventListener("input", (event) => {
      state.query = query.value;
      if ((event as InputEvent).isComposing) return;
      this.renderPicker(project, true);
    });
    query.addEventListener("compositionend", () => {
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
          state.defaultAnimation = preferredResourcePickerAnimation(
            project,
            state,
            state.selectedResourceId,
          );
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
        this.renderPicker(project);
      });
    dialog
      .querySelector<HTMLInputElement>("[data-picker-art-width]")
      ?.addEventListener("input", (event) => {
        state.backgroundArtSize.width = (
          event.currentTarget as HTMLInputElement
        ).valueAsNumber;
      });
    dialog
      .querySelector<HTMLInputElement>("[data-picker-art-height]")
      ?.addEventListener("input", (event) => {
        state.backgroundArtSize.height = (
          event.currentTarget as HTMLInputElement
        ).valueAsNumber;
      });
    dialog
      .querySelector("[data-picker-import]")
      ?.addEventListener("click", () => void this.uploadResources(true));
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
              ? { defaultAnimation: state.defaultAnimation || undefined }
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
      const needsSpineBackgroundArtSize =
        resource.kind === "spine" &&
        (project.variants[context.variant].artSize.width <= 0 ||
          project.variants[context.variant].artSize.height <= 0);
      if (
        needsSpineBackgroundArtSize &&
        (!Number.isFinite(state.backgroundArtSize.width) ||
          state.backgroundArtSize.width <= 0 ||
          !Number.isFinite(state.backgroundArtSize.height) ||
          state.backgroundArtSize.height <= 0)
      ) {
        throw new Error(
          "Spine 背景必须明确填写完整 art size 的 width 和 height（有限正数）。",
        );
      }
      this.#store.transact((draft) => {
        if (needsSpineBackgroundArtSize) {
          setVariantArtSizeDimension(
            draft,
            context.variant,
            "width",
            state.backgroundArtSize.width,
          );
          setVariantArtSizeDimension(
            draft,
            context.variant,
            "height",
            state.backgroundArtSize.height,
          );
        }
        assignBackgroundResource({
          project: draft,
          modeId: context.modeId,
          variant: context.variant,
          resourceId: resource.id,
          ...(resource.kind === "spine"
            ? { defaultAnimation: state.defaultAnimation || undefined }
            : {}),
        });
      });
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
    this.#resourcePickerPreview.clear();
    if (dialog?.open) dialog.close();
    dialog?.replaceChildren();
    if (restoreFocus) this.#pickerTrigger?.focus();
    this.#pickerTrigger = null;
  }

  private async uploadResources(fromPicker = false): Promise<void> {
    const files = await pickFiles(
      ".png,.jpg,.jpeg,.webp,.json,.atlas,.mp4,video/mp4,.zip,application/zip",
      true,
    );
    if (files.length === 0) return;
    try {
      assertCanonicalUploadFileNames(files);
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
        const zipBytes = new Uint8Array(await files[0]!.arrayBuffer());
        const entries = normalizeEditorPackageZipEntries(
          extractBoundedZip(zipBytes, {
            limits: LAYOUT_ZIP_LIMITS,
          }),
          [
            "symbols.package.json",
            "popup.manifest.json",
            "image-string.manifest.json",
            "layout.manifest.json",
            "manifest.json",
          ],
        );
        if (entries.has("symbols.package.json")) {
          const imported = await importSymbolsZipWithFiles(zipBytes);
          if (
            project.symbolDependencies.has(imported.resource.packageManifest.id)
          )
            replaceSymbolDependency(
              project,
              imported.resource.packageManifest.id,
              imported,
            );
          else importSymbolDependency(project, imported);
          if (
            !confirmDependencyImportReview("Symbols", imported.files, files)
          ) {
            imported.resource.destroy();
            return;
          }
          this.#store.replace(project);
          this.#selectedSymbolId = imported.resource.packageManifest.id;
          this.#symbolPackageMetadata =
            (await this.#preview?.setSymbolPackage(imported.resource, {
              columns: project.reel.columns,
              rows: project.reel.rows,
            })) ?? null;
          this.renderSymbolsMetadata();
          this.showFeedback(
            `已通过统一导入器提交 Symbols ${this.#selectedSymbolId}。`,
          );
          return;
        }
        if (entries.has("popup.manifest.json")) {
          const imported = await importPopupPackageZip(zipBytes);
          const conflicts = await findPopupSpineAssetConflicts({
            imported,
            layoutAssets: collectLayoutSpineAssetsForPopupReview(project),
          });
          if (
            !confirmDependencyImportReview(
              "Popup",
              imported.files,
              files,
              conflicts,
            )
          )
            return;
          if (project.popupDependencies.has(imported.manifest.id))
            replacePopupDependency(project, imported.manifest.id, imported);
          else importPopupDependency(project, imported);
          this.#store.replace(project);
          this.#selectedPopupId = imported.manifest.id;
          this.showFeedback(
            `已通过统一导入器提交 Popup ${this.#selectedPopupId}。`,
          );
          return;
        }
        if (entries.has("manifest.json")) {
          const profiles = inspectVniBundleProfiles(zipBytes);
          if (!profiles)
            throw new Error("VNI bundle ZIP 缺少 runtime profile。");
          let selectedProfileId = profiles[0]?.id;
          if (profiles.length > 1) {
            const choice = window.prompt(
              `该 VNI bundle 含多个 runtime，请输入 profile id：\n${profiles.map(({ id, label }) => `${id}: ${label}`).join("\n")}`,
              profiles[0]?.id,
            );
            if (choice === null) return;
            selectedProfileId = choice.trim();
          }
          const resource = await importVniBundle({
            project,
            zipBytes,
            selectedProfileId,
          });
          if (!confirmImportReview(project, [resource.id], files)) return;
          this.#store.replace(project);
          this.selectImportedPickerResource(project, resource.id, fromPicker);
          this.showFeedback(
            `导入审查确认 VNI ${resource.id}；未创建任何 node。`,
          );
          return;
        }
        const resource = await importImageStringZip({
          project,
          zipBytes,
        });
        if (!confirmImportReview(project, [resource.id], files)) return;
        this.#store.replace(project);
        this.selectImportedPickerResource(project, resource.id, fromPicker);
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
          const resourceId = defaultResourceKey(project, file.name);
          imported.push(
            (await uploadVideoResource({ project, file, resourceId })).id,
          );
        }
        if (!confirmImportReview(project, imported, files)) return;
        this.#store.replace(project);
        this.selectImportedPickerResource(
          project,
          imported.at(-1) ?? "",
          fromPicker,
        );
        this.showFeedback(
          `导入审查确认 ${files.length} 个 video filename-key resources；仅可用于黑场视频转场。`,
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
          const resourceId = defaultResourceKey(project, file.name);
          imported.push(
            (await uploadImageResource({ project, file, resourceId })).id,
          );
        }
        if (!confirmImportReview(project, imported, files)) return;
        this.#store.replace(project);
        this.selectImportedPickerResource(
          project,
          imported.at(-1) ?? "",
          fromPicker,
        );
        this.showFeedback(
          `导入审查确认 ${files.length} 个 image filename-key resources；未创建任何 node。`,
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
            const resourceId = defaultResourceKey(project, file.name);
            imported.push(
              (await uploadVideoResource({ project, file, resourceId })).id,
            );
          }
        } else if (
          group.every((file) => /\.(?:png|jpe?g|webp)$/iu.test(file.name))
        ) {
          for (const file of group) {
            const resourceId = defaultResourceKey(project, file.name);
            imported.push(
              (await uploadImageResource({ project, file, resourceId })).id,
            );
          }
        } else {
          imported.push(
            ...(await uploadSpineResources({ project, files: group })).map(
              ({ id }) => id,
            ),
          );
        }
      }
      if (!confirmImportReview(project, imported, files)) return;
      this.#store.replace(project);
      this.selectImportedPickerResource(
        project,
        imported.at(-1) ?? "",
        fromPicker,
      );
      this.showFeedback(
        `导入审查确认 ${imported.join(", ")}；未创建任何 node。`,
      );
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private selectImportedPickerResource(
    project: EditorProject,
    resourceKey: string,
    fromPicker: boolean,
  ): void {
    if (!fromPicker || !resourceKey || !this.#session.picker) return;
    this.#session.picker.selectedResourceId = resourceKey;
    this.#session.picker.defaultAnimation = preferredResourcePickerAnimation(
      project,
      this.#session.picker,
      resourceKey,
    );
    if (this.#session.picker.context.kind === "add-layer")
      this.#session.picker.nodeId = suggestNodeId(project, resourceKey);
    this.renderPicker(project);
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
      const commit = async () => {
        const project = cloneEditorProject(this.#store.getSnapshot().project);
        if (current.kind === "image") {
          if (files.length !== 1)
            throw new Error("image 替换必须选择一个文件。");
          await replaceImageResource({
            project,
            resourceId,
            file: files[0],
          });
        } else if (current.kind === "spine") {
          await replaceSpineResource({
            project,
            resourceId,
            files,
          });
        } else if (current.kind === "video") {
          if (files.length !== 1)
            throw new Error("video 替换必须选择一个 MP4。");
          await replaceVideoResource({
            project,
            resourceId,
            file: files[0],
          });
        } else if (current.kind === "vni") {
          if (files.length !== 1)
            throw new Error("VNI 替换必须选择一个 bundle ZIP。");
          const zipBytes = new Uint8Array(await files[0].arrayBuffer());
          const profiles = inspectVniBundleProfiles(zipBytes);
          if (!profiles) throw new Error("VNI bundle ZIP 缺少 manifest.json。");
          let selectedProfileId = profiles[0]?.id;
          if (profiles.length > 1) {
            const choice = window.prompt(
              `该 VNI bundle 含多个 runtime，请输入 profile id：\n${profiles.map(({ id, label }) => `${id}: ${label}`).join("\n")}`,
              profiles.find(({ id }) => `${id}.json` === resourceId)?.id ??
                profiles[0]?.id,
            );
            if (choice === null) throw new Error("已取消 VNI 替换。");
            selectedProfileId = choice.trim();
          }
          const imported = await importVniBundle({
            project,
            zipBytes,
            selectedProfileId,
          });
          if (imported.id !== resourceId)
            throw new Error(
              `VNI 替换必须保持 project filename key：期望 ${resourceId}，实际 ${imported.id}。`,
            );
        } else {
          if (files.length !== 1)
            throw new Error("image-string 替换必须选择一个 ZIP。");
          await replaceImageStringResource({
            project,
            resourceId,
            zipBytes: new Uint8Array(await files[0].arrayBuffer()),
          });
        }
        this.#store.replace(project);
      };
      await commit();
      this.showFeedback(`资源 ${resourceId} 已原子替换，全部引用同步生效。`);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async refreshPreview(snapshot: EditorStoreSnapshot): Promise<void> {
    this.#previewModeRequest += 1;
    this.#previewPrepareRequest += 1;
    this.#previewPrepareIdentity = null;
    this.#previewPrepareChain = Promise.resolve();
    this.#previewReadyProjectRevision = -1;
    this.#previewModeBusy = false;
    this.stopPreviewModeMonitor();
    this.#session.previewTransition = {
      phase: "idle",
      message: "正在重建当前项目预览。",
    };
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
      this.#session.previewTransition = {
        phase: "error",
        message:
          snapshot.errors[0] ??
          "当前配置尚未形成可切换的 package preview；请先修复项目错误。",
      };
      this.renderWorkspace(this.#store.getSnapshot());
      return;
    }
    try {
      const paths = collectLayoutPreviewAssetPaths(snapshot.project, manifest);
      const assets = new Map(
        [...paths].map((path) => {
          const bytes = snapshot.project.assets.get(path);
          if (!bytes) throw new Error(`预览缺少资源：${path}`);
          return [path, bytes] as const;
        }),
      );
      if (revision !== this.#previewRevision) return;
      await this.#preview?.setLayout(manifest, assets);
      if (revision === this.#previewRevision) {
        this.#previewReadyProjectRevision = snapshot.revision;
        if (this.#followEditMode) {
          await this.selectAuthoringPreviewMode(this.#selectedGameMode, false);
          return;
        }
        this.reconcileSelectedTransitionForTarget();
        this.renderPopupControls(this.#store.getSnapshot());
        await this.ensurePreviewTransitionPrepared();
      }
    } catch (error) {
      if (revision === this.#previewRevision) {
        this.#session.previewTransition = {
          phase: "error",
          message: formatUiError(error),
        };
        this.#preview?.clear();
        this.#store.setExternalError(error);
      }
    }
  }

  private async refreshPreviewGeometry(
    snapshot: EditorStoreSnapshot,
  ): Promise<void> {
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
      await this.refreshPreview(snapshot);
      return;
    }
    try {
      this.#preview?.applyGeometryManifest(manifest);
      this.#previewReadyProjectRevision = snapshot.revision;
      this.renderPopupControls(this.#store.getSnapshot());
      await this.ensurePreviewTransitionPrepared();
    } catch (error) {
      this.#session.previewTransition = {
        phase: "error",
        message: formatUiError(error),
      };
      this.#store.setExternalError(error);
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
      this.resetTransientDraftsForProjectReplace();
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
      const importMessage = imported.manifest.gameModes
        ? `已导入 ${project.id}，资源库按完整素材签名重建。`
        : `已导入 ${project.id}；旧 layout 已升级，导出后将显式保存 gameModes。`;
      const renameMessage = imported.nodeIdRenames.length
        ? ` Node ID 已迁移：${imported.nodeIdRenames
            .map(({ from, to }) => `${from}→${to}`)
            .join("，")}。`
        : "";
      this.showFeedback(`${importMessage}${renameMessage}`);
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
                  ([id, dependency]) => [
                    id,
                    dependencyFiles(
                      snapshot.project,
                      dependency.rootKey,
                      dependency.keys,
                      "symbols.package.json",
                    ),
                  ],
                ),
              ),
            }
          : {}),
        ...(snapshot.project.popupDependencies.size
          ? {
              popupFilesById: new Map(
                [...snapshot.project.popupDependencies].map(
                  ([id, dependency]) => [
                    id,
                    dependencyFiles(
                      snapshot.project,
                      dependency.rootKey,
                      dependency.keys,
                      "popup.manifest.json",
                    ),
                  ],
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
      const unused = [...snapshot.project.resources.keys()].filter(
        (resourceId) =>
          getLayoutResourceReferences(snapshot.project, resourceId).length ===
            0 && getRuntimeResourceKey(snapshot.project, resourceId) === null,
      ).length;
      this.showFeedback(
        `已导出 ${exported.fileName}；${unused} 个未引用资源未写入 ZIP。`,
      );
      this.#store.clearExternalError();
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private clearSymbolsPackage(): void {
    if (!this.#selectedSymbolId) return;
    const removedPackageId = this.#selectedSymbolId;
    try {
      this.#store.transact((draft) =>
        deleteSymbolDependency(draft, this.#selectedSymbolId!),
      );
    } catch (error) {
      this.#store.setExternalError(error);
      return;
    }
    this.#symbolImportBusy = false;
    this.#symbolPackageMetadata = null;
    void this.#preview?.setSymbolPackage(null);
    this.#selectedSymbolId = null;
    for (const key of this.#session.otherSceneDrafts.keys()) {
      if (key.startsWith(`${removedPackageId}\u0000`))
        this.#session.otherSceneDrafts.delete(key);
    }
    this.renderSymbolsMetadata();
    this.showFeedback(
      "Symbols preview package 已清除；layout cell size 保持不变。",
    );
  }

  private resetSymbolsForProjectReplace(): void {
    this.#symbolImportBusy = false;
    this.#symbolPackageMetadata = null;
    void this.#preview?.setSymbolPackage(null);
  }

  private resetTransientDraftsForProjectReplace(): void {
    this.#session.selectedTransitionKey = null;
    this.#session.newTransitionFromModeId = "";
    this.#session.newTransitionToModeId = "";
    this.#session.otherSceneDrafts.clear();
    this.#session.popupPlacementDrafts.clear();
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
    const files = dependencyFiles(
      project,
      dependency.rootKey,
      dependency.keys,
      "symbols.package.json",
    );
    const manifestBytes = files.get("symbols.package.json");
    if (!manifestBytes) throw new Error("symbols dependency 缺少 manifest。");
    const packageManifest = parseSymbolPackageManifest(
      JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes),
      ),
    );
    const resource = await createSymbolPackageResource({
      packageManifest,
      files,
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
    this.requireElement("[data-clear-symbols]").toggleAttribute(
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
    const availableSymbols = new Set(Object.keys(availableTargets));
    for (const key of this.#session.otherSceneDrafts.keys()) {
      const [packageId, symbol] = key.split("\u0000");
      if (packageId === metadata.packageId && !availableSymbols.has(symbol!))
        this.#session.otherSceneDrafts.delete(key);
    }
    const rows = Object.entries(availableTargets)
      .filter(([, targets]) => targets.length > 0)
      .map(([symbol, targets]) => {
        const binding = bindingBySymbol.get(symbol);
        const key = otherSceneDraftKey(metadata.packageId, symbol);
        const existing = this.#session.otherSceneDrafts.get(key);
        const initialSource = binding?.source;
        const draft: OtherSceneBindingDraft = existing ?? {
          enabled: Boolean(binding),
          target: binding?.target ?? targets[0]!,
          sourceKind:
            initialSource?.kind ??
            (tableNames.length > 0 ? "number-weight-table" : "fixed-number"),
          tableName:
            initialSource?.kind === "number-weight-table"
              ? initialSource.tableName
              : (tableNames[0] ?? ""),
          fixedNumber:
            initialSource?.kind === "fixed-number"
              ? String(initialSource.value)
              : "1",
        };
        if (
          !targets.some(
            (candidate) =>
              otherSceneTargetKey(candidate) ===
              otherSceneTargetKey(draft.target),
          )
        )
          draft.target = targets[0]!;
        if (!tableNames.includes(draft.tableName))
          draft.tableName = tableNames[0] ?? "";
        if (
          tableNames.length === 0 &&
          draft.sourceKind === "number-weight-table"
        )
          draft.sourceKind = "fixed-number";
        this.#session.otherSceneDrafts.set(key, draft);
        return `<div class="other-scene-row" data-other-scene-row="${escapeHtml(symbol)}"><label><input type="checkbox" data-binding-enabled ${draft.enabled ? "checked" : ""}> ${escapeHtml(symbol)}</label><select data-binding-target>${targets
          .map((candidate) => {
            const value = otherSceneTargetKey(candidate);
            const selected = value === otherSceneTargetKey(draft.target);
            return `<option value="${escapeHtml(value)}" ${selected ? "selected" : ""}>${escapeHtml(value)}</option>`;
          })
          .join(
            "",
          )}</select><select data-binding-source-kind><option value="number-weight-table" ${draft.sourceKind === "number-weight-table" ? "selected" : ""} ${tableNames.length === 0 ? "disabled" : ""}>权重表</option><option value="fixed-number" ${draft.sourceKind === "fixed-number" ? "selected" : ""}>固定值</option></select><select data-binding-table ${tableNames.length === 0 ? "disabled" : ""}>${tableNames.map((name) => `<option value="${escapeHtml(name)}" ${draft.tableName === name ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select><input data-binding-fixed type="number" min="1" step="1" value="${escapeHtml(draft.fixedNumber)}"></div>`;
      });
    host.innerHTML = `<h3>数值 / otherScene</h3>${rows.join("") || "<p>package 没有命名节点或 legacy value target。</p>"}<small>${tableNames.length ? `可用表：${tableNames.map(escapeHtml).join("、")}` : "game config 未声明 numberWeightTables；仍可使用固定值。"}</small>`;
    host
      .querySelectorAll<HTMLInputElement>("[data-binding-fixed]")
      .forEach((input) =>
        input.addEventListener("input", () => {
          const symbol = input.closest<HTMLElement>("[data-other-scene-row]")
            ?.dataset.otherSceneRow;
          if (!symbol) return;
          const draft = this.#session.otherSceneDrafts.get(
            otherSceneDraftKey(metadata.packageId, symbol),
          );
          if (draft) draft.fixedNumber = input.value;
        }),
      );
    host
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("input, select")
      .forEach((input) =>
        input.addEventListener("change", () => this.commitOtherSceneBindings()),
      );
  }

  private commitOtherSceneBindings(): void {
    try {
      const metadata = this.#symbolPackageMetadata;
      if (!metadata) throw new Error("Symbols metadata 尚未就绪。");
      const bindings: SymbolOtherScenePreviewBinding[] = [];
      for (const row of this.#root.querySelectorAll<HTMLElement>(
        "[data-other-scene-row]",
      )) {
        const symbol = row.dataset.otherSceneRow!;
        const targetValue = row.querySelector<HTMLSelectElement>(
          "[data-binding-target]",
        )!.value;
        const sourceKind = row.querySelector<HTMLSelectElement>(
          "[data-binding-source-kind]",
        )!.value as SymbolOtherScenePreviewBinding["source"]["kind"];
        const target: SymbolOtherScenePreviewBinding["target"] =
          targetValue === "legacy"
            ? { kind: "legacy-presentation-value" }
            : {
                kind: "image-string-node",
                name: targetValue.slice("node:".length),
              };
        const draft: OtherSceneBindingDraft = {
          enabled: row.querySelector<HTMLInputElement>(
            "[data-binding-enabled]",
          )!.checked,
          target,
          sourceKind,
          tableName: row.querySelector<HTMLSelectElement>(
            "[data-binding-table]",
          )!.value,
          fixedNumber: row.querySelector<HTMLInputElement>(
            "[data-binding-fixed]",
          )!.value,
        };
        this.#session.otherSceneDrafts.set(
          otherSceneDraftKey(metadata.packageId, symbol),
          draft,
        );
        if (!draft.enabled) continue;
        const source: SymbolOtherScenePreviewBinding["source"] =
          sourceKind === "number-weight-table"
            ? {
                kind: "number-weight-table",
                tableName: draft.tableName,
              }
            : {
                kind: "fixed-number",
                value: Number(draft.fixedNumber),
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
  ): boolean {
    try {
      this.#store.transact(update);
      if (successMessage) this.showFeedback(successMessage);
      return true;
    } catch (error) {
      this.#store.setExternalError(error);
      return false;
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
    const messages = [
      ...snapshot.errors,
      ...(snapshot.externalError ? [snapshot.externalError] : []),
    ];
    errors.replaceChildren(
      ...messages.map((message) => {
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

  private captureFocusSnapshot(): FocusSnapshot | null {
    const active = document.activeElement as HTMLElement | null;
    if (!active || !this.#root.contains(active)) return null;
    const dataAttributes = [...active.attributes].filter((attribute) =>
      attribute.name.startsWith("data-"),
    );
    if (dataAttributes.length === 0) return null;
    const elementSelector = `${active.tagName.toLowerCase()}${dataAttributes
      .map((attribute) => `[${attribute.name}="${cssEscape(attribute.value)}"]`)
      .join("")}`;
    let selector =
      this.#root.querySelectorAll(elementSelector).length === 1
        ? elementSelector
        : null;
    for (
      let ancestor = active.parentElement;
      !selector && ancestor && ancestor !== this.#root;
      ancestor = ancestor.parentElement
    ) {
      const attributes = [...ancestor.attributes].filter((attribute) =>
        attribute.name.startsWith("data-"),
      );
      if (attributes.length === 0) continue;
      const ancestorSelector = `${ancestor.tagName.toLowerCase()}${attributes
        .map(
          (attribute) => `[${attribute.name}="${cssEscape(attribute.value)}"]`,
        )
        .join("")}`;
      const candidate = `${ancestorSelector} ${elementSelector}`;
      if (this.#root.querySelectorAll(candidate).length === 1)
        selector = candidate;
    }
    if (!selector) return null;
    const selectable =
      active instanceof HTMLInputElement ||
      active instanceof HTMLTextAreaElement
        ? active
        : null;
    return {
      selector,
      selectionStart: selectable?.selectionStart ?? null,
      selectionEnd: selectable?.selectionEnd ?? null,
      selectionDirection: selectable?.selectionDirection ?? null,
    };
  }

  private restoreFocusSnapshot(snapshot: FocusSnapshot | null): void {
    if (!snapshot) return;
    queueMicrotask(() => {
      const target = this.#root.querySelector<HTMLElement>(snapshot.selector);
      target?.focus();
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement
      ) {
        if (
          snapshot.selectionStart !== null &&
          snapshot.selectionEnd !== null
        ) {
          try {
            target.setSelectionRange(
              snapshot.selectionStart,
              snapshot.selectionEnd,
              snapshot.selectionDirection ?? undefined,
            );
          } catch {
            // Number inputs and some browser-native controls do not expose a
            // selectable text range; focus restoration still applies.
          }
        }
      }
    });
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
    )}</div><section id="workspace-panel" role="tabpanel" data-workspace-panel aria-labelledby="tab-assets"></section><div data-symbols-workspace hidden>${symbolsWorkspaceMarkup()}</div><div data-bigwin-workspace hidden>${bigWinWorkspaceMarkup()}</div></aside><section class="preview-column"><div class="preview-toolbar"><label>分辨率<select data-preview-resolution></select></label><label>宽<input type="number" min="1" value="1920" data-preview-width /></label><label>高<input type="number" min="1" value="1080" data-preview-height /></label><label>预览状态<select data-preview-game-mode></select></label><button type="button" data-request-preview-mode>切换到该状态</button><output data-preview-transition-status aria-live="polite"></output><label><input type="checkbox" checked data-follow-edit-mode />跟随编辑状态</label><div class="zoom-controls"><button type="button" data-zoom-out aria-label="缩小">−</button><button type="button" data-zoom-reset><span data-zoom-label>100%</span></button><button type="button" data-zoom-in aria-label="放大">＋</button></div><label><input type="checkbox" checked data-guide-focus /> focus</label><label><input type="checkbox" checked data-guide-reel /> reel/cells</label></div><div class="preview-stage"><div class="preview-page" data-preview-host></div><button class="resize-handle" type="button" aria-label="拖动调整页面尺寸" data-resize-handle>◢</button></div><output class="diagnostics" data-preview-diagnostics></output></section></section><output class="feedback" aria-live="polite" data-feedback></output><aside class="error-panel" aria-live="assertive" data-errors></aside><dialog data-new-project-dialog aria-label="新建项目"><form method="dialog"><h2>新建项目</h2><label>适配模式<select data-new-project-mode><option value="">请选择适配模式</option><option value="maximized-focus">单背景适配（maximized-focus）</option><option value="orientation-focus">横竖双背景适配（orientation-focus）</option></select></label><div class="button-row"><button type="button" data-cancel-new-project>取消</button><button type="button" class="primary" data-confirm-new-project disabled>创建</button></div></form></dialog><dialog data-mode-dialog aria-label="管理主状态"></dialog><dialog class="resource-picker" data-resource-picker aria-label="Resource Picker"></dialog></main>`;
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

function formatUiError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.addEventListener("change", () => resolve([...(input.files ?? [])]), {
      once: true,
    });
    input.click();
  });
}

function defaultResourceKey(
  _project: EditorProject,
  sourceName: string,
): string {
  return canonicalizeUploadFileName(sourceName);
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

function confirmDependencyImportReview(
  kind: "Symbols" | "Popup",
  dependencyFiles: ReadonlyMap<string, Uint8Array>,
  sourceFiles: readonly File[],
  popupSpineConflicts: readonly PopupSpineAssetConflict[] = [],
): boolean {
  const confirm = globalThis.window?.confirm;
  if (typeof confirm !== "function") return true;
  const bytes = [...dependencyFiles.values()].reduce(
    (sum, value) => sum + value.byteLength,
    0,
  );
  const conflictReview = popupSpineConflicts.length
    ? `\n\n检测到 Popup Spine 与 Layout Spine 同名但 SHA-256 不同：\n${popupSpineConflicts
        .map(
          (conflict) =>
            `${conflict.layoutResourceId} · ${conflict.layoutAssetKey} [${conflict.layoutSha256}] <- ${conflict.popupResourceKey} · ${conflict.popupAssetKey} [${conflict.popupSha256}]`,
        )
        .join(
          "\n",
        )}\n\n取消：不导入，可先手动替换 Layout Spine 整组。\n确定：保留 Layout 现有资源，继续作为独立 Popup package 导入。`
    : "";
  return confirm.call(
    globalThis.window,
    `导入审查\n${kind} · ${dependencyFiles.size} filename keys · ${bytes} bytes\n${sourceFiles.length} source file(s)${conflictReview}\n\n确认提交到同一扁平资源库？`,
  );
}

function collectLayoutSpineAssetsForPopupReview(
  project: EditorProject,
): readonly LayoutSpineAssetForPopupReview[] {
  const result: LayoutSpineAssetForPopupReview[] = [];
  for (const resource of project.resources.values()) {
    if (resource.kind !== "spine") continue;
    const assets = [
      { kind: "atlas" as const, key: resource.atlas },
      ...Object.values(resource.textures).map((key) => ({
        kind: "texture" as const,
        key,
      })),
    ];
    const seen = new Set<string>();
    for (const asset of assets) {
      const identity = `${asset.kind}\u0000${asset.key}`;
      if (seen.has(identity)) continue;
      seen.add(identity);
      const bytes = project.assets.get(asset.key);
      if (!bytes)
        throw new Error(
          `Layout Spine ${resource.id} 导入审查缺少资源：${asset.key}`,
        );
      result.push(
        Object.freeze({
          resourceId: resource.id,
          kind: asset.kind,
          key: asset.key,
          bytes,
        }),
      );
    }
  }
  return Object.freeze(result);
}

function editorResourcePrimaryPathForReview(
  resource: EditorLayoutResource,
): string {
  return editorResourcePaths(resource)[0] ?? "";
}

function dependencyFiles(
  project: EditorProject,
  rootKey: string,
  keys: readonly string[],
  sentinel: "symbols.package.json" | "popup.manifest.json",
): ReadonlyMap<string, Uint8Array> {
  return new Map(
    keys.map((key) => {
      const bytes = project.assets.get(key);
      if (!bytes) throw new Error(`dependency 缺少全局资源：${key}`);
      return [key === rootKey ? sentinel : key, bytes.slice()] as const;
    }),
  );
}

function groupSourceFiles(files: readonly File[]): readonly File[][] {
  return Object.freeze([[...files]]);
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

function popupPlacementDraftKey(
  popupId: string,
  variant: SceneLayoutVariantId,
  field: "x" | "y" | "scale",
): string {
  return `${popupId}\u0000${variant}\u0000${field}`;
}

function otherSceneDraftKey(packageId: string, symbol: string): string {
  return `${packageId}\u0000${symbol}`;
}

function otherSceneTargetKey(
  target: SymbolOtherScenePreviewBinding["target"],
): string {
  return target.kind === "image-string-node" ? `node:${target.name}` : "legacy";
}
