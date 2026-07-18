import { collectSceneLayoutAssetPaths } from "@slotclientengine/rendercore/scene-layout";
import { ObjectUrlRegistry } from "../io/object-url-registry.js";
import { exportLayoutZip } from "../io/exported-layout-zip.js";
import { importLayoutZip } from "../io/imported-layout-zip.js";
import { importSymbolsZip } from "../io/imported-symbol-package.js";
import {
  activeVariantIds,
  applySymbolPackageCellSize,
  cloneEditorProject,
  createNewEditorProject,
  editorProjectToManifest,
  editorProjectToPreviewManifest,
  manifestToEditorProject,
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
  replaceSpineResource,
  setLayerVariantVisibility,
  setNodeDefaultAnimation,
  suggestNodeId,
  uploadImageResource,
  uploadSpineResource,
} from "../model/resource-commands.js";
import {
  LayoutPreview,
  type SymbolPackagePreviewSnapshot,
} from "../preview/layout-preview.js";
import { PREVIEW_SIZE_PRESETS } from "../preview/preview-size.js";
import { layoutWorkspaceMarkup } from "./layout-workspace.js";
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
  #destroyed = false;
  #symbolPackageMetadata: SymbolPackagePreviewSnapshot | null = null;
  #symbolImportRequest = 0;
  #symbolImportBusy = false;
  #pickerTrigger: HTMLElement | null = null;
  #feedbackTimer: ReturnType<typeof setTimeout> | null = null;

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
    this.requireElement("[data-new-single]").addEventListener("click", () =>
      this.createProject("maximized-focus"),
    );
    this.requireElement("[data-new-dual]").addEventListener("click", () =>
      this.createProject("orientation-focus"),
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
    this.requireElement("[data-clear-symbols]").addEventListener("click", () =>
      this.clearSymbolsPackage(),
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
          this.renderSymbolsMetadata();
        } catch (error) {
          this.#store.setExternalError(error);
          this.renderSymbolsMetadata();
        }
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
    const drawer = this.requireElement(
      "[data-symbols-drawer]",
    ) as HTMLDetailsElement;
    drawer.addEventListener("toggle", () => {
      this.#session.symbolsDrawerOpen = drawer.open;
    });
    for (const preset of PREVIEW_SIZE_PRESETS) {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = preset.label;
      button.addEventListener("click", () =>
        this.setPreviewSize(preset.width, preset.height),
      );
      this.requireElement("[data-preview-presets]").append(button);
    }
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
    this.#session.activeTab = "assets";
    this.#session.selection = null;
    this.#session.expandedResourceIds.clear();
    this.#store.replace(createNewEditorProject(mode));
    this.showFeedback("已新建项目。先上传资源，再显式设置背景或添加图层。");
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
    this.syncThumbnailUrls(snapshot.project);
    for (const tab of this.#root.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    )) {
      const active = tab.dataset.workspaceTab === this.#session.activeTab;
      tab.setAttribute("aria-selected", String(active));
      tab.tabIndex = active ? 0 : -1;
    }
    const panel = this.requireElement("[data-workspace-panel]");
    panel.setAttribute("aria-labelledby", `tab-${this.#session.activeTab}`);
    panel.innerHTML =
      this.#session.activeTab === "assets"
        ? resourcesWorkspaceMarkup({
            project: snapshot.project,
            session: this.#session,
            thumbnailUrls: new Map(
              [...this.#thumbnailEntries].map(([id, entry]) => [id, entry.url]),
            ),
          })
        : this.#session.activeTab === "layout"
          ? layoutWorkspaceMarkup(snapshot.project, this.#session.selection)
          : projectWorkspaceMarkup(snapshot.project, snapshot.errors);
    this.bindWorkspaceActions(snapshot.project);
    this.restoreScrollPositions();
    this.restoreFocusToken(focusToken);
    this.renderPicker(snapshot.project);
    this.renderProjectStatus(snapshot);
  }

  private bindWorkspaceActions(project: EditorProject): void {
    const panel = this.requireElement("[data-workspace-panel]");
    panel
      .querySelector("[data-upload-images]")
      ?.addEventListener("click", () => void this.uploadImages());
    panel
      .querySelector("[data-upload-spine]")
      ?.addEventListener("click", () => void this.uploadSpine());
    const query = panel.querySelector<HTMLInputElement>(
      "[data-resource-query]",
    );
    query?.addEventListener("input", () => {
      this.#session.resourceQuery = query.value;
      this.renderWorkspace(this.#store.getSnapshot());
    });
    const type = panel.querySelector<HTMLSelectElement>("[data-resource-type]");
    type?.addEventListener("change", () => {
      this.#session.resourceType = type.value as "all" | "image" | "spine";
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
          const nodeId = project.variants[variant].backgroundNode;
          if (
            !window.confirm(`确认清除 ${variant} 背景 ${nodeId}？资源会保留。`)
          )
            return;
          this.runTransaction(
            (draft) => clearBackground(draft, variant),
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
          setPath(draft, path, Number(input.value));
          if (path.startsWith("reel.")) {
            for (const variant of activeVariantIds(draft)) {
              updateVariantFocusFromReel(draft, variant);
            }
          } else {
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
    if (selected && context.kind !== "rebind-layer") {
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
          ? `设置 ${state.context.variant} 背景`
          : `重绑图层 ${state.context.nodeId}`;
    dialog.innerHTML = `<div class="picker-shell"><header><div><span>Resource Picker</span><h2>${escapeHtml(contextLabel)}</h2></div><button type="button" data-picker-cancel aria-label="关闭资源选择器">×</button></header><div class="picker-toolbar"><label>搜索<input type="search" data-picker-query value="${escapeHtml(state.query)}" /></label><label>类型<select data-picker-type><option value="all">全部</option><option value="image" ${state.type === "image" ? "selected" : ""}>Image</option><option value="spine" ${state.type === "spine" ? "selected" : ""}>Spine</option></select></label><button type="button" data-picker-upload-image>上传新图片</button><button type="button" data-picker-upload-spine>上传新 Spine</button></div><div class="picker-body"><div class="picker-candidates" role="listbox" aria-label="可用资源">${candidates.map((candidate) => `<button type="button" role="option" data-picker-candidate="${escapeHtml(candidate.resourceId)}" aria-selected="${candidate.resourceId === state.selectedResourceId}" ${candidate.disabledReason ? "disabled" : ""}><span class="type-mark">${candidate.kind === "spine" ? "SP" : "IMG"}</span><span><strong>${escapeHtml(candidate.resourceId)}</strong><small title="${escapeHtml(candidate.primaryPath)}">${escapeHtml(candidate.primaryPath)}</small><small>${escapeHtml(candidate.summary)} · ${candidate.status} · 引用 ${candidate.referenceCount}</small></span></button>`).join("") || '<p class="empty-state">没有匹配资源；上传后仍需明确选择并确认。</p>'}</div><section class="picker-form">${selected ? `<p><strong>${escapeHtml(selected.id)}</strong><br/><span class="path">${escapeHtml(selected.kind === "image" ? selected.path : selected.skeleton)}</span></p>` : "<p>请选择一个 logical resource。</p>"}${state.context.kind !== "rebind-layer" ? `<label>node id<input data-picker-node-id value="${escapeHtml(state.nodeId)}" /></label>` : ""}${
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
          if (state.context.kind !== "rebind-layer") {
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
            variant: context.variant,
            resourceId: resource.id,
            nodeId: state.nodeId,
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
        const resource = await uploadImageResource({ project, file });
        lastResourceId = resource.id;
      }
      this.#store.replace(project);
      if (fromPicker && this.#session.picker) {
        this.#session.picker.selectedResourceId = lastResourceId;
        this.#session.picker.defaultAnimation = "";
        if (this.#session.picker.context.kind !== "rebind-layer") {
          this.#session.picker.nodeId = suggestNodeId(project, lastResourceId);
        }
        this.renderPicker(project);
      }
      this.showFeedback(`已加入 ${files.length} 个图片资源；未创建任何 node。`);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadSpine(fromPicker = false): Promise<void> {
    const files = await pickFiles(".json,.atlas,.png,.jpg,.jpeg,.webp", true);
    if (files.length === 0) return;
    try {
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      const resource = await uploadSpineResource({ project, files });
      this.#store.replace(project);
      if (fromPicker && this.#session.picker) {
        this.#session.picker.selectedResourceId = resource.id;
        this.#session.picker.defaultAnimation = "";
        if (this.#session.picker.context.kind !== "rebind-layer") {
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

  private async replaceResource(resourceId: string): Promise<void> {
    const current = this.#store.getSnapshot().project.resources.get(resourceId);
    if (!current) {
      this.#store.setExternalError(`未知资源：${resourceId}`);
      return;
    }
    const files = await pickFiles(
      current.kind === "image"
        ? ".png,.jpg,.jpeg,.webp"
        : ".json,.atlas,.png,.jpg,.jpeg,.webp",
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
        } else {
          await replaceSpineResource({
            project,
            resourceId,
            files,
            reinitializeBackgrounds,
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
    );
    if (!manifest) {
      this.#preview?.clear();
      return;
    }
    try {
      const assets = new Map(
        collectSceneLayoutAssetPaths(manifest).map((path) => {
          const bytes = snapshot.project.assets.get(path);
          if (!bytes) throw new Error(`预览缺少资源：${path}`);
          return [path, bytes] as const;
        }),
      );
      if (revision !== this.#previewRevision) return;
      await this.#preview?.setLayout(manifest, assets);
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
      );
      this.closePicker(false);
      this.#session.activeTab = "layout";
      this.#session.selection = defaultLayoutSelection(project);
      this.#session.expandedResourceIds.clear();
      this.#store.replace(project);
      this.showFeedback(`已导入 ${project.id}，资源库按完整素材签名重建。`);
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
        throw new Error("当前配置未通过校验，禁止导出。");
      const manifest = editorProjectToManifest(snapshot.project);
      const exported = await exportLayoutZip({
        manifest,
        assets: snapshot.project.assets,
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

  private async importSymbolsPackage(): Promise<void> {
    const files = await pickFiles(".zip,application/zip", false);
    if (files.length === 0) return;
    const request = ++this.#symbolImportRequest;
    this.#symbolImportBusy = true;
    this.renderSymbolsMetadata();
    let resource: Awaited<ReturnType<typeof importSymbolsZip>> | null = null;
    try {
      resource = await importSymbolsZip(
        new Uint8Array(await files[0].arrayBuffer()),
      );
      if (request !== this.#symbolImportRequest) {
        resource.destroy();
        return;
      }
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      applySymbolPackageCellSize(project, resource.packageManifest.cellSize);
      const preview = this.#preview;
      if (!preview) throw new Error("Symbols preview 尚未初始化。");
      const prepared = await preview.setSymbolPackage(resource, {
        columns: project.reel.columns,
        rows: project.reel.rows,
      });
      if (request !== this.#symbolImportRequest || !prepared) return;
      this.#symbolPackageMetadata = prepared;
      resource = null;
      this.#store.replace(project);
      this.renderSymbolsMetadata();
      this.showFeedback(
        "Symbols preview package 已导入；不会写入 layout ZIP。",
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

  private clearSymbolsPackage(): void {
    this.#symbolImportRequest += 1;
    this.#symbolImportBusy = false;
    this.#symbolPackageMetadata = null;
    void this.#preview?.setSymbolPackage(null);
    this.renderSymbolsMetadata();
    this.showFeedback(
      "Symbols preview package 已清除；layout cell size 保持不变。",
    );
  }

  private renderSymbolsMetadata(): void {
    const target = this.requireElement("[data-symbols-metadata]");
    const metadata = this.#symbolPackageMetadata;
    target.textContent = metadata
      ? `${metadata.packageId} · cell ${metadata.cellSize.width}×${metadata.cellSize.height} · ${metadata.displaySymbolCount} display symbols`
      : "未导入；layout ZIP 不会嵌入 symbol 资源。";
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
    this.requireElement("[data-randomize-symbols]").toggleAttribute(
      "disabled",
      !metadata || metadata.status !== "ready" || this.#symbolImportBusy,
    );
    this.requireElement("[data-symbols-scene]").textContent = metadata
      ? formatSymbolPreviewDiagnostic(metadata)
      : "等待导入 strict symbol-package v1 ZIP。";
    this.requireElement("[data-import-symbols]").toggleAttribute(
      "disabled",
      this.#symbolImportBusy,
    );
    this.requireElement("[data-clear-symbols]").toggleAttribute(
      "disabled",
      !metadata || this.#symbolImportBusy,
    );
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
      const fingerprint = byteFingerprint(resource.path, bytes);
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
  return `<main class="editor-shell"><header class="topbar"><div class="brand"><strong>Game Layout Editor</strong><span>scene-layout v1 · resource-first workspace</span></div><nav aria-label="项目操作"><button type="button" data-new-single>新建单背景</button><button type="button" data-new-dual>新建横竖双背景</button><button type="button" data-import>导入 ZIP</button><button type="button" class="primary" data-export>导出 ZIP</button></nav><output data-project-status></output></header><section class="workspace"><aside class="editor-pane"><div class="workspace-tabs" role="tablist" aria-label="编辑工作区"><button type="button" id="tab-assets" role="tab" data-workspace-tab="assets" aria-selected="true" aria-controls="workspace-panel">资源</button><button type="button" id="tab-layout" role="tab" data-workspace-tab="layout" aria-selected="false" aria-controls="workspace-panel" tabindex="-1">布局</button><button type="button" id="tab-project" role="tab" data-workspace-tab="project" aria-selected="false" aria-controls="workspace-panel" tabindex="-1">项目</button></div><section id="workspace-panel" role="tabpanel" data-workspace-panel aria-labelledby="tab-assets"></section></aside><section class="preview-column"><div class="preview-toolbar"><div data-preview-presets></div><label>宽 <input type="number" min="1" value="1920" data-preview-width /></label><label>高 <input type="number" min="1" value="1080" data-preview-height /></label><div class="zoom-controls"><button type="button" data-zoom-out aria-label="缩小">−</button><button type="button" data-zoom-reset><span data-zoom-label>100%</span></button><button type="button" data-zoom-in aria-label="放大">＋</button></div><label><input type="checkbox" checked data-guide-focus /> focus</label><label><input type="checkbox" checked data-guide-reel /> reel/cells</label></div><details class="symbols-drawer" data-symbols-drawer><summary>Symbols 预览</summary><div class="symbols-controls"><button type="button" data-import-symbols>导入 symbols ZIP</button><button type="button" data-clear-symbols disabled>清除 package</button><label>reel set <select data-reel-set disabled><option value="">未导入 package</option></select></label><button type="button" data-randomize-symbols disabled>重新随机</button><span data-symbols-metadata>未导入；layout ZIP 不会嵌入 symbol 资源。</span><output data-symbols-scene>等待导入 strict symbol-package v1 ZIP。</output></div></details><div class="preview-stage"><div class="preview-page" data-preview-host></div><button class="resize-handle" type="button" aria-label="拖动调整页面尺寸" data-resize-handle>◢</button></div><output class="diagnostics" data-preview-diagnostics></output></section></section><output class="feedback" aria-live="polite" data-feedback></output><aside class="error-panel" aria-live="assertive" data-errors></aside><dialog class="resource-picker" data-resource-picker aria-label="Resource Picker"></dialog></main>`;
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

function formatSymbolPreviewDiagnostic(
  preview: SymbolPackagePreviewSnapshot,
): string {
  const scene = preview.scene;
  if (!scene) return preview.message;
  const rows = Array.from({ length: scene.rows }, (_, y) =>
    scene.symbols.map((column) => column[y]).join(" "),
  );
  return `${preview.message} stops=[${scene.stopYs.join(", ")}] · ${rows.join(" / ")}`;
}

function byteFingerprint(path: string, bytes: Uint8Array): string {
  let hash = 2166136261;
  for (const byte of bytes) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `${path}:${bytes.length}:${hash >>> 0}`;
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
