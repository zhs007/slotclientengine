import {
  editorProjectToManifest,
  editorProjectToPreviewManifest,
  cloneEditorProject,
  createNewEditorProject,
  applySymbolPackageCellSize,
  manifestToEditorProject,
  updateVariantFocusFromReel,
  type EditorProject,
} from "../model/editor-project.js";
import { collectSceneLayoutAssetPaths } from "@slotclientengine/rendercore/scene-layout";
import {
  EditorStore,
  type EditorStoreSnapshot,
} from "../model/editor-store.js";
import {
  addImageFileToProject,
  addSpineFilesToProject,
  removeNodeFromProject,
} from "../model/validation.js";
import { exportLayoutZip } from "../io/exported-layout-zip.js";
import { importLayoutZip } from "../io/imported-layout-zip.js";
import { importSymbolsZip } from "../io/imported-symbol-package.js";
import {
  LayoutPreview,
  type SymbolPackagePreviewSnapshot,
} from "../preview/layout-preview.js";
import { PREVIEW_SIZE_PRESETS } from "../preview/preview-size.js";

export class GameLayoutEditorApp {
  readonly #root: HTMLElement;
  readonly #store = new EditorStore(createNewEditorProject("maximized-focus"));
  #preview: LayoutPreview | null = null;
  #unsubscribe: (() => void) | null = null;
  #previewRevision = 0;
  #destroyed = false;
  #symbolPackageMetadata: SymbolPackagePreviewSnapshot | null = null;
  #symbolImportRequest = 0;
  #symbolImportBusy = false;

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
      this.renderConfiguration(snapshot);
      this.syncSymbolPreviewGrid(snapshot.project);
      void this.refreshPreview(snapshot);
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#symbolImportRequest += 1;
    this.#symbolImportBusy = false;
    this.#unsubscribe?.();
    this.#preview?.destroy();
    this.#root.replaceChildren();
  }

  private bindStaticActions(): void {
    this.requireElement("[data-new-single]").addEventListener("click", () => {
      this.#store.replace(createNewEditorProject("maximized-focus"));
    });
    this.requireElement("[data-new-dual]").addEventListener("click", () => {
      this.#store.replace(createNewEditorProject("orientation-focus"));
    });
    this.requireElement("[data-import]").addEventListener("click", () => {
      void this.importZip();
    });
    this.requireElement("[data-export]").addEventListener("click", () => {
      void this.exportZip();
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
  }

  private renderConfiguration(snapshot: EditorStoreSnapshot): void {
    const panel = this.requireElement("[data-config-panel]");
    const openDetails = new Set(
      [
        ...panel.querySelectorAll<HTMLDetailsElement>(
          "details[data-details-key]",
        ),
      ]
        .filter((details) => details.open)
        .map((details) => details.dataset.detailsKey!),
    );
    panel.innerHTML = configurationMarkup(snapshot.project);
    for (const details of panel.querySelectorAll<HTMLDetailsElement>(
      "details[data-details-key]",
    )) {
      details.open = openDetails.has(details.dataset.detailsKey!);
    }
    const errors = this.requireElement("[data-errors]");
    errors.replaceChildren(
      ...snapshot.errors.map((message) => {
        const item = document.createElement("div");
        item.textContent = message;
        return item;
      }),
    );
    this.requireInput("[data-project-id]").addEventListener(
      "change",
      (event) => {
        this.#store.transact((draft) => {
          draft.id = (event.currentTarget as HTMLInputElement).value;
        });
      },
    );
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-number]",
    )) {
      input.addEventListener("change", () => {
        this.#store.transact((draft) => {
          const path = input.dataset.number!;
          setPath(draft, path, Number(input.value));
          if (path.startsWith("reel.")) {
            const variants =
              draft.mode === "maximized-focus"
                ? (["default"] as const)
                : (["landscape", "portrait"] as const);
            for (const variant of variants) {
              updateVariantFocusFromReel(draft, variant);
            }
          } else {
            const variantMatch = path.match(
              /^variants\.(default|landscape|portrait)\.(focusOffsets|artSize)\./,
            );
            if (variantMatch) {
              updateVariantFocusFromReel(
                draft,
                variantMatch[1] as "default" | "landscape" | "portrait",
              );
            }
          }
        });
      });
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>(
      "[data-bg-image]",
    )) {
      button.addEventListener(
        "click",
        () => void this.uploadImage(button.dataset.bgImage!, true),
      );
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>(
      "[data-bg-spine]",
    )) {
      button.addEventListener(
        "click",
        () => void this.uploadSpine(button.dataset.bgSpine!, true),
      );
    }
    panel
      .querySelector<HTMLButtonElement>("[data-add-image]")
      ?.addEventListener("click", () => void this.uploadImage("layer", false));
    panel
      .querySelector<HTMLButtonElement>("[data-add-spine]")
      ?.addEventListener("click", () => void this.uploadSpine("layer", false));
    for (const input of panel.querySelectorAll<HTMLInputElement>(
      "[data-visible]",
    )) {
      input.addEventListener("change", () => {
        const index = Number(input.dataset.nodeIndex);
        const variant = input.dataset.visible! as "landscape" | "portrait";
        this.#store.transact((draft) => {
          const node = draft.nodes[index];
          if (input.checked)
            node.placements[variant] = { x: 0, y: 0, scale: 1 };
          else delete node.placements[variant];
        });
      });
    }
    for (const select of panel.querySelectorAll<HTMLSelectElement>(
      "[data-animation]",
    )) {
      select.addEventListener("change", () => {
        const index = Number(select.dataset.animation);
        this.#store.transact((draft) => {
          const resource = draft.nodes[index].resource;
          if (resource.kind !== "spine") throw new Error("节点不是 Spine。");
          draft.nodes[index].resource = {
            ...resource,
            defaultAnimation: select.value,
          };
        });
      });
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>(
      "[data-delete-node]",
    )) {
      button.addEventListener("click", () => {
        try {
          this.#store.transact((draft) =>
            removeNodeFromProject(draft, button.dataset.deleteNode!),
          );
        } catch (error) {
          this.#store.setExternalError(error);
        }
      });
    }
    for (const button of panel.querySelectorAll<HTMLButtonElement>(
      "[data-move-node]",
    )) {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.nodeIndex);
        const direction = Number(button.dataset.moveNode);
        this.#store.transact((draft) => {
          const target = index + direction;
          if (target < 0 || target >= draft.nodes.length) return;
          const first = draft.nodes[index];
          const second = draft.nodes[target];
          [first.order, second.order] = [second.order, first.order];
          draft.nodes.sort((left, right) => left.order - right.order);
        });
      });
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

  private async uploadImage(
    variantValue: string,
    background: boolean,
  ): Promise<void> {
    const files = await pickFiles(".png,.jpg,.jpeg,.webp", false);
    if (files.length === 0) return;
    try {
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      const variants = background
        ? [variantValue as "default" | "landscape" | "portrait"]
        : project.mode === "maximized-focus"
          ? (["default"] as const)
          : (["landscape", "portrait"] as const);
      await addImageFileToProject({
        project,
        file: files[0],
        variants,
        ...(background ? { backgroundVariant: variants[0] } : {}),
      });
      this.#store.replace(project);
    } catch (error) {
      this.#store.setExternalError(error);
    }
  }

  private async uploadSpine(
    variantValue: string,
    background: boolean,
  ): Promise<void> {
    const files = await pickFiles(".json,.atlas,.png,.jpg,.jpeg,.webp", true);
    if (files.length === 0) return;
    try {
      const project = cloneEditorProject(this.#store.getSnapshot().project);
      const variants = background
        ? [variantValue as "default" | "landscape" | "portrait"]
        : project.mode === "maximized-focus"
          ? (["default"] as const)
          : (["landscape", "portrait"] as const);
      await addSpineFilesToProject({
        project,
        files,
        variants,
        ...(background ? { backgroundVariant: variants[0] } : {}),
      });
      this.#store.replace(project);
    } catch (error) {
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
      );
      this.#store.replace(project);
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
      const exported = await exportLayoutZip({
        manifest: editorProjectToManifest(snapshot.project),
        assets: snapshot.project.assets,
      });
      const url = URL.createObjectURL(exported.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = exported.fileName;
      anchor.click();
      queueMicrotask(() => URL.revokeObjectURL(url));
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
    const sceneTarget = this.requireElement("[data-symbols-scene]");
    sceneTarget.textContent = metadata
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
    ) {
      return;
    }
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
  return `
    <main class="editor-shell">
      <header class="topbar">
        <div><strong>Game Layout Editor</strong><span>scene-layout v1</span></div>
        <nav aria-label="项目操作">
          <button type="button" data-new-single>新建单背景</button>
          <button type="button" data-new-dual>新建横竖双背景</button>
          <button type="button" data-import>导入 zip</button>
          <button type="button" class="primary" data-export>导出 zip</button>
        </nav>
      </header>
      <section class="workspace">
        <aside class="config-panel" data-config-panel></aside>
        <section class="preview-column">
          <div class="preview-toolbar">
            <div data-preview-presets></div>
            <label>宽 <input type="number" min="1" value="1920" data-preview-width /></label>
            <label>高 <input type="number" min="1" value="1080" data-preview-height /></label>
            <div class="zoom-controls">
              <button type="button" data-zoom-out aria-label="缩小">−</button>
              <button type="button" data-zoom-reset><span data-zoom-label>100%</span></button>
              <button type="button" data-zoom-in aria-label="放大">＋</button>
            </div>
            <label><input type="checkbox" checked data-guide-focus /> focus</label>
            <label><input type="checkbox" checked data-guide-reel /> reel/cells</label>
          </div>
          <div class="preview-stage">
            <div class="preview-page" data-preview-host></div>
            <button class="resize-handle" type="button" aria-label="拖动调整页面尺寸" data-resize-handle>◢</button>
          </div>
          <output class="diagnostics" data-preview-diagnostics></output>
        </section>
      </section>
      <aside class="symbols-panel">
        <strong>Symbols 预览包</strong>
        <button type="button" data-import-symbols>导入 symbols ZIP</button>
        <button type="button" data-clear-symbols disabled>清除 symbols package</button>
        <label>reel set <select data-reel-set disabled><option value="">未导入 package</option></select></label>
        <button type="button" data-randomize-symbols disabled>重新随机</button>
        <span data-symbols-metadata>未导入；layout ZIP 不会嵌入 symbol 资源。</span>
        <output data-symbols-scene>等待导入 strict symbol-package v1 ZIP。</output>
      </aside>
      <aside class="error-panel" aria-live="polite" data-errors></aside>
    </main>`;
}

function configurationMarkup(project: EditorProject): string {
  const variants =
    project.mode === "maximized-focus"
      ? ["default"]
      : ["landscape", "portrait"];
  return `
    ${variants.map((variant) => variantMarkup(project, variant as "default" | "landscape" | "portrait")).join("")}
    ${reelMarkup(project, variants as Array<"default" | "landscape" | "portrait">)}
    ${layersMarkup(project, variants as Array<"default" | "landscape" | "portrait">)}
    <section class="panel-section">
      <details data-details-key="project">
        <summary>高级：项目与导出标识</summary>
        <label>project id <input data-project-id value="${escapeHtml(project.id)}" /></label>
        <p class="hint">模式：${project.mode} · 数据仅保存在当前内存</p>
      </details>
    </section>
  `;
}

function variantMarkup(
  project: EditorProject,
  variantId: "default" | "landscape" | "portrait",
): string {
  const variant = project.variants[variantId];
  const prefix = `variants.${variantId}`;
  return `
    <section class="panel-section">
      <h2>第一步：${variantId} 背景</h2>
      <div class="upload-row">
        <button type="button" data-bg-image="${variantId}" ${variant.backgroundNode ? "disabled" : ""}>上传图片背景</button>
        <button type="button" data-bg-spine="${variantId}" ${variant.backgroundNode ? "disabled" : ""}>上传 Spine 背景</button>
      </div>
      <p class="hint">${variant.backgroundNode ? `已加载 ${escapeHtml(variant.backgroundNode)}，右侧可立即预览。` : "上传后自动读取尺寸、居中主转轮，并生成 focus。"}</p>
      <details data-details-key="variant-${variantId}">
        <summary>高级：art / focus 参数</summary>
        ${sizeFields("art size", `${prefix}.artSize`, variant.artSize)}
        ${focusOffsetFields(prefix, variant.focusOffsets)}
        <p class="derived">实际 focus rect：${variant.focusRect.x}, ${variant.focusRect.y}, ${variant.focusRect.width}, ${variant.focusRect.height}</p>
        ${project.mode === "orientation-focus" ? sizeFields("frame focus rect", `${prefix}.frameFocusRect`, variant.frameFocusRect) + marginFields(prefix, variant.minFocusMargin) : ""}
      </details>
    </section>`;
}

function reelMarkup(
  project: EditorProject,
  variants: Array<"default" | "landscape" | "portrait">,
): string {
  const reel = project.reel;
  const width = reel.columns * reel.cellWidth + (reel.columns - 1) * reel.gapX;
  const height = reel.rows * reel.cellHeight + (reel.rows - 1) * reel.gapY;
  return `
    <section class="panel-section">
      <h2>第二步：主转轮 main</h2>
      <div class="field-grid">
        ${numberField("列", "reel.columns", reel.columns)}
        ${numberField("行", "reel.rows", reel.rows)}
      </div>
      <p class="derived">默认 5 × 3 · 当前尺寸：${width} × ${height} · focus 自动外扩 60</p>
      <details data-details-key="reel-main">
        <summary>高级：cell、gap 与位置</summary>
        <div class="field-grid">
          ${numberField("cell W", "reel.cellWidth", reel.cellWidth)}
          ${numberField("cell H", "reel.cellHeight", reel.cellHeight)}
          ${numberField("gap X", "reel.gapX", reel.gapX)}
          ${numberField("gap Y", "reel.gapY", reel.gapY)}
        </div>
        ${variants
          .map((variant) => {
            const placement = reel.placements[variant] ?? { x: 0, y: 0 };
            return `<fieldset><legend>${variant} art-space position</legend><div class="field-grid">${numberField("x", `reel.placements.${variant}.x`, placement.x)}${numberField("y", `reel.placements.${variant}.y`, placement.y)}</div></fieldset>`;
          })
          .join("")}
      </details>
    </section>`;
}

function layersMarkup(
  project: EditorProject,
  variants: Array<"default" | "landscape" | "portrait">,
): string {
  return `
    <section class="panel-section">
      <div class="section-title"><h2>图层</h2><div><button type="button" data-add-image>＋ 图片</button><button type="button" data-add-spine>＋ Spine</button></div></div>
      ${
        project.nodes
          .map((node, index) => {
            const referenced = Object.values(project.variants).some(
              (variant) => variant.backgroundNode === node.id,
            );
            return `<article class="layer-card">
          <header><strong>${escapeHtml(node.id)}</strong><span>${node.resource.kind} · order ${node.order}</span></header>
          <div class="layer-actions"><button type="button" data-move-node="-1" data-node-index="${index}" ${index === 0 ? "disabled" : ""}>上移</button><button type="button" data-move-node="1" data-node-index="${index}" ${index === project.nodes.length - 1 ? "disabled" : ""}>下移</button><button type="button" data-delete-node="${escapeHtml(node.id)}" ${referenced ? 'disabled title="背景引用中"' : ""}>删除</button></div>
          ${numberField("order", `nodes.${index}.order`, node.order)}
          ${node.resource.kind === "spine" ? animationField(node, index) : `<p class="hint">${escapeHtml(node.resource.path)} · ${node.resource.size.width}×${node.resource.size.height}</p>`}
          ${variants.map((variant) => placementFields(node, index, variant, project.mode)).join("")}
        </article>`;
          })
          .join("") ||
        '<p class="hint">请先上传背景；不会生成 placeholder。</p>'
      }
    </section>`;
}

function animationField(
  node: EditorProject["nodes"][number],
  index: number,
): string {
  if (node.resource.kind !== "spine") return "";
  const resource = node.resource;
  return `<label>default loop animation<select data-animation="${index}"><option value="">请选择（大小写精确）</option>${(node.animationNames ?? []).map((name) => `<option value="${escapeHtml(name)}" ${name === resource.defaultAnimation ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>`;
}

function placementFields(
  node: EditorProject["nodes"][number],
  index: number,
  variant: "default" | "landscape" | "portrait",
  mode: EditorProject["mode"],
): string {
  const placement = node.placements[variant];
  const visibility =
    mode === "orientation-focus"
      ? `<label class="visibility"><input type="checkbox" data-visible="${variant}" data-node-index="${index}" ${placement ? "checked" : ""} /> ${variant} 可见</label>`
      : `<span class="visibility">default 可见</span>`;
  if (!placement) return `<fieldset><legend>${visibility}</legend></fieldset>`;
  return `<fieldset><legend>${visibility}</legend><div class="field-grid">${numberField("x", `nodes.${index}.placements.${variant}.x`, placement.x)}${numberField("y", `nodes.${index}.placements.${variant}.y`, placement.y)}${numberField("scale", `nodes.${index}.placements.${variant}.scale`, placement.scale, 0.01)}</div></fieldset>`;
}

function sizeFields(
  label: string,
  path: string,
  value: { width: number; height: number },
): string {
  return `<fieldset><legend>${label}</legend><div class="field-grid">${numberField("width", `${path}.width`, value.width)}${numberField("height", `${path}.height`, value.height)}</div></fieldset>`;
}
function focusOffsetFields(
  prefix: string,
  value: { left: number; top: number; right: number; bottom: number },
): string {
  return `<fieldset><legend>focus rect（相对主转轴四边）</legend><div class="field-grid">${numberField("左 x1", `${prefix}.focusOffsets.left`, value.left)}${numberField("上 y1", `${prefix}.focusOffsets.top`, value.top)}${numberField("右 x2", `${prefix}.focusOffsets.right`, value.right)}${numberField("下 y2", `${prefix}.focusOffsets.bottom`, value.bottom)}</div><p class="hint">默认 -60, -60, 60, 60；超出 art 的部分会自动封顶。</p></fieldset>`;
}
function marginFields(
  prefix: string,
  value: { left: number; right: number; top: number; bottom: number },
): string {
  return `<fieldset><legend>min focus margin（可选，0 表示省略）</legend><div class="field-grid">${numberField("left", `${prefix}.minFocusMargin.left`, value.left)}${numberField("right", `${prefix}.minFocusMargin.right`, value.right)}${numberField("top", `${prefix}.minFocusMargin.top`, value.top)}${numberField("bottom", `${prefix}.minFocusMargin.bottom`, value.bottom)}</div></fieldset>`;
}
function numberField(
  label: string,
  path: string,
  value: number,
  step = 1,
): string {
  return `<label>${label}<input type="number" step="${step}" data-number="${path}" value="${value}" /></label>`;
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

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        character
      ]!,
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
  return `${preview.message} stops=[${scene.stopYs.join(", ")}] · ${rows.join(" / ")}`;
}
