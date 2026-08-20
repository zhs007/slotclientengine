import type { SourceFileLike } from "@slotclientengine/browserartifactio";
import {
  computeEditorAssetUsage,
  projectEditorAssetTree,
  type EditorAssetsController,
} from "../core/index.js";
import type {
  EditorAssetExportArtifact,
  EditorAssetFilter,
  EditorAssetImportPreparation,
  EditorAssetImportResolution,
  EditorAssetRootKind,
  EditorAssetTreeOccurrence,
} from "../data/index.js";
import {
  createDefaultEditorAssetPreview,
  type EditorAssetPreviewFactory,
  type EditorAssetPreviewHandle,
} from "./default-preview.js";

export interface EditorAssetsView {
  readonly element: HTMLElement;
  setActive(active: boolean): void;
  destroy(): void;
}

export interface MountEditorAssetsViewOptions<TProject> {
  readonly controller: EditorAssetsController<TProject>;
  readonly root: HTMLElement;
  readonly title?: string;
  readonly rowHeight?: number;
  readonly overscan?: number;
  readonly previewFactory?: EditorAssetPreviewFactory<TProject>;
  readonly download?: (artifact: EditorAssetExportArtifact) => void;
}

export function mountEditorAssetsView<TProject>(
  options: MountEditorAssetsViewOptions<TProject>,
): EditorAssetsView {
  const rowHeight = options.rowHeight ?? 44;
  const overscan = options.overscan ?? 8;
  const previewFactory =
    options.previewFactory ?? createDefaultEditorAssetPreview<TProject>;
  const download = options.download ?? downloadArtifact;
  let destroyed = false;
  let active = true;
  let query = "";
  let status: EditorAssetFilter["status"] = "all";
  let kind = "all" as "all" | EditorAssetRootKind;
  let selectedId: string | null = null;
  let markingRootKey: string | null = null;
  let expanded = new Set<string>();
  let visibleRows: readonly EditorAssetTreeOccurrence[] = [];
  let pendingFiles: readonly SourceFileLike[] = [];
  let preparation: EditorAssetImportPreparation | null = null;
  let preview: EditorAssetPreviewHandle | null = null;
  let previewGeneration = 0;
  let unsubscribe: () => void = () => {};
  let dragging = false;

  options.root.classList.add("editor-assets-host");
  options.root.innerHTML = `
    <section class="editor-assets" aria-label="${escapeHtml(options.title ?? "Assets")}">
      <header class="editor-assets-toolbar">
        <div><h2>${escapeHtml(options.title ?? "Assets")}</h2><span data-assets-count></span></div>
        <label class="editor-assets-import">导入 Assets<input data-assets-input type="file" multiple hidden /></label>
        <input data-assets-search type="search" placeholder="搜索名称或 key" aria-label="搜索 Assets" />
        <select data-assets-kind aria-label="按类型筛选">
          <option value="all">全部类型</option>
          ${["image", "audio", "video", "spine", "vni", "image-string", "popup", "symbols", "game-layout", "text", "binary"].map((value) => `<option value="${value}">${value}</option>`).join("")}
        </select>
        <select data-assets-status aria-label="按使用状态筛选">
          <option value="all">全部状态</option><option value="used">已使用</option>
          <option value="programmatic">程序使用</option><option value="unused">未使用</option>
        </select>
      </header>
      <div class="editor-assets-body">
        <div class="editor-assets-tree" role="treegrid" tabindex="0" aria-label="Asset tree">
          <div class="editor-assets-spacer"><div class="editor-assets-rows"></div></div>
        </div>
        <div class="editor-assets-splitter" role="separator" tabindex="0" aria-label="调整 Asset tree 宽度" aria-orientation="vertical" aria-valuemin="220" aria-valuemax="720" aria-valuenow="300"></div>
        <aside class="editor-assets-inspector"><div class="editor-assets-empty">选择一个 Asset 查看详情</div></aside>
      </div>
      <div class="editor-assets-message" data-assets-message role="status"></div>
      <div class="editor-assets-review" data-assets-review hidden></div>
    </section>`;

  const body = required<HTMLElement>(options.root, ".editor-assets-body");
  const tree = required<HTMLElement>(options.root, ".editor-assets-tree");
  const splitter = required<HTMLElement>(
    options.root,
    ".editor-assets-splitter",
  );
  const spacer = required<HTMLElement>(options.root, ".editor-assets-spacer");
  const rowsElement = required<HTMLElement>(
    options.root,
    ".editor-assets-rows",
  );
  const inspector = required<HTMLElement>(
    options.root,
    ".editor-assets-inspector",
  );
  const message = required<HTMLElement>(options.root, "[data-assets-message]");
  const reviewElement = required<HTMLElement>(
    options.root,
    "[data-assets-review]",
  );
  const fileInput = required<HTMLInputElement>(
    options.root,
    "[data-assets-input]",
  );
  const searchInput = required<HTMLInputElement>(
    options.root,
    "[data-assets-search]",
  );
  const kindSelect = required<HTMLSelectElement>(
    options.root,
    "[data-assets-kind]",
  );
  const statusSelect = required<HTMLSelectElement>(
    options.root,
    "[data-assets-status]",
  );

  const onInput = async () => {
    const files = [...(fileInput.files ?? [])];
    fileInput.value = "";
    if (!files.length) return;
    pendingFiles = files;
    await prepare({});
  };
  const onSearch = (event: Event) => {
    query = (event.target as HTMLInputElement).value;
    render();
  };
  const onKind = (event: Event) => {
    kind = (event.target as HTMLSelectElement).value as typeof kind;
    render();
  };
  const onStatus = (event: Event) => {
    status = (event.target as HTMLSelectElement).value as typeof status;
    render();
  };
  const onScroll = () => renderRows();
  const onClick = (event: MouseEvent) => void handleClick(event);
  const onKeyDown = (event: KeyboardEvent) => handleTreeKey(event);
  const onSplitterDown = (event: PointerEvent) => {
    if (event.button !== 0 || stackedLayout()) return;
    dragging = true;
    splitter.setPointerCapture?.(event.pointerId);
    setTreeWidth(event.clientX - body.getBoundingClientRect().left);
    event.preventDefault();
  };
  const onSplitterMove = (event: PointerEvent) => {
    if (dragging)
      setTreeWidth(event.clientX - body.getBoundingClientRect().left);
  };
  const onSplitterUp = (event: PointerEvent) => {
    if (!dragging) return;
    dragging = false;
    splitter.releasePointerCapture?.(event.pointerId);
  };
  const onSplitterKey = (event: KeyboardEvent) => {
    if (stackedLayout() || !["ArrowLeft", "ArrowRight"].includes(event.key))
      return;
    const current =
      Number.parseFloat(
        getComputedStyle(body).getPropertyValue("--assets-tree-width"),
      ) || 300;
    setTreeWidth(current + (event.key === "ArrowLeft" ? -16 : 16));
    event.preventDefault();
  };

  fileInput.addEventListener("change", onInput);
  searchInput.addEventListener("input", onSearch);
  kindSelect.addEventListener("change", onKind);
  statusSelect.addEventListener("change", onStatus);
  tree.addEventListener("scroll", onScroll);
  options.root.addEventListener("click", onClick);
  tree.addEventListener("keydown", onKeyDown);
  splitter.addEventListener("pointerdown", onSplitterDown);
  splitter.addEventListener("pointermove", onSplitterMove);
  splitter.addEventListener("pointerup", onSplitterUp);
  splitter.addEventListener("pointercancel", onSplitterUp);
  splitter.addEventListener("keydown", onSplitterKey);
  unsubscribe = options.controller.subscribe(render);
  render();

  return Object.freeze({
    element: options.root,
    setActive(next: boolean) {
      if (destroyed || active === next) return;
      active = next;
      if (!active) {
        cancelPreparation();
        void destroyPreview();
      } else render();
    },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      active = false;
      unsubscribe();
      cancelPreparation();
      void destroyPreview();
      fileInput.removeEventListener("change", onInput);
      searchInput.removeEventListener("input", onSearch);
      kindSelect.removeEventListener("change", onKind);
      statusSelect.removeEventListener("change", onStatus);
      tree.removeEventListener("scroll", onScroll);
      options.root.removeEventListener("click", onClick);
      tree.removeEventListener("keydown", onKeyDown);
      splitter.removeEventListener("pointerdown", onSplitterDown);
      splitter.removeEventListener("pointermove", onSplitterMove);
      splitter.removeEventListener("pointerup", onSplitterUp);
      splitter.removeEventListener("pointercancel", onSplitterUp);
      splitter.removeEventListener("keydown", onSplitterKey);
      options.root.replaceChildren();
      options.root.classList.remove("editor-assets-host");
    },
  });

  async function prepare(selections: Readonly<Record<string, string>>) {
    setMessage("正在解析和校验导入内容…", "loading");
    try {
      preparation = await options.controller.prepareImport(
        pendingFiles,
        selections,
      );
      renderReview(preparation);
      setMessage(
        preparation.blockingErrors.length
          ? "导入需要处理 profile 或错误。"
          : "导入已准备，请检查 review。",
        preparation.blockingErrors.length ? "error" : "ready",
      );
    } catch (error) {
      preparation = null;
      reviewElement.hidden = true;
      setMessage(formatError(error), "error");
    }
  }

  function render() {
    if (destroyed || !active) return;
    const snapshot = options.controller.snapshot;
    const usage = computeEditorAssetUsage({
      catalog: snapshot.catalog,
      project: snapshot.project,
      host: options.controller.host,
    });
    const kinds = kind === "all" ? undefined : new Set([kind]);
    visibleRows = projectEditorAssetTree({
      catalog: snapshot.catalog,
      expanded,
      usage,
      filter: { query, status, ...(kinds ? { kinds } : {}) },
    });
    required<HTMLElement>(options.root, "[data-assets-count]").textContent =
      `${snapshot.catalog.roots.size} roots · ${snapshot.workspace.entries.size} logical files`;
    spacer.style.height = `${visibleRows.length * rowHeight}px`;
    renderRows();
    renderInspector();
  }

  function renderRows() {
    const viewport = tree.clientHeight || 480;
    const start = Math.max(
      0,
      Math.floor(tree.scrollTop / rowHeight) - overscan,
    );
    const end = Math.min(
      visibleRows.length,
      Math.ceil((tree.scrollTop + viewport) / rowHeight) + overscan,
    );
    rowsElement.style.transform = `translateY(${start * rowHeight}px)`;
    const usage = computeEditorAssetUsage({
      catalog: options.controller.snapshot.catalog,
      project: options.controller.snapshot.project,
      host: options.controller.host,
    });
    rowsElement.innerHTML = visibleRows
      .slice(start, end)
      .map((row) => {
        const state = usage.byNodeId.get(row.node.id);
        const selected = row.id === selectedId;
        return `<div class="editor-assets-row${selected ? " selected" : ""}" role="row" data-occurrence-id="${escapeHtml(row.id)}" aria-selected="${selected}" style="height:${rowHeight}px;padding-inline-start:${12 + row.depth * 20}px">
          <button type="button" class="editor-assets-expander" data-expand="${escapeHtml(row.id)}" ${row.hasChildren ? `aria-expanded="${expanded.has(row.id)}"` : "disabled"}>${row.hasChildren ? (expanded.has(row.id) ? "−" : "+") : "·"}</button>
          <button type="button" class="editor-assets-select" data-select="${escapeHtml(row.id)}"><strong>${escapeHtml(row.node.label)}</strong><small>${escapeHtml(row.node.kind)}</small></button>
          <span class="editor-assets-usage">${state?.programBindings.length ? "程序" : state?.exported ? "使用" : "未使用"}</span>
        </div>`;
      })
      .join("");
  }

  function renderInspector() {
    void destroyPreview();
    const row = visibleRows.find(({ id }) => id === selectedId);
    if (!row) {
      inspector.innerHTML =
        '<div class="editor-assets-empty">选择一个 Asset 查看详情</div>';
      return;
    }
    const snapshot = options.controller.snapshot;
    const root = snapshot.catalog.roots.get(row.rootKey)!;
    const usage = computeEditorAssetUsage({
      catalog: snapshot.catalog,
      project: snapshot.project,
      host: options.controller.host,
    }).byRootKey.get(root.key);
    const binding = usage?.programBindings[0];
    const isRoot = row.depth === 0;
    const marking = markingRootKey === root.key && !binding;
    inspector.innerHTML = `<div class="editor-assets-inspector-content">
      <dl class="editor-assets-summary">
        <dt>名称</dt><dd>${escapeHtml(row.node.label)}</dd>
        <dt>Root</dt><dd>${escapeHtml(root.key)}</dd>
        <dt>类型</dt><dd>${escapeHtml(row.node.kind)}</dd>
      </dl>
      ${isRoot ? '<section class="editor-assets-preview-region" data-preview><p>正在准备预览…</p></section>' : '<p class="editor-assets-internal">内部 leaf 只读；如需独立复用，请重新导入顶层 asset。</p>'}
      ${
        isRoot
          ? `<div class="editor-assets-inspector-actions">
        <div class="editor-assets-program-action">
          ${binding ? `<label>程序 key<input data-program-name value="${escapeHtml(binding.name)}" /></label><button type="button" data-program-save="${escapeHtml(root.key)}">保存程序 key</button><button type="button" data-program-cancel="${escapeHtml(root.key)}">取消标记</button>` : marking ? `<label>程序 key<input data-program-name value="" placeholder="输入程序 key" autofocus /></label><button type="button" data-program-confirm="${escapeHtml(root.key)}">确认标记</button><button type="button" data-program-abort>取消</button>` : `<label>程序 key<input value="" placeholder="标记后可编辑" disabled /></label><button type="button" data-program-begin="${escapeHtml(root.key)}">标记为程序使用</button>`}
        </div>
        <button type="button" data-root-export="${escapeHtml(root.key)}">导出</button>
        <button class="danger" type="button" data-root-delete="${escapeHtml(root.key)}">删除</button>
      </div>`
          : ""
      }
    </div>`;
    if (isRoot) void mountPreview(root.key);
  }

  async function mountPreview(rootKey: string): Promise<void> {
    const generation = ++previewGeneration;
    const element = inspector.querySelector<HTMLElement>("[data-preview]");
    if (!element || !active || destroyed) return;
    try {
      const candidate = await previewFactory({
        snapshot: options.controller.snapshot,
        rootKey,
        element,
      });
      if (generation !== previewGeneration || !active || destroyed) {
        await candidate.destroy();
        return;
      }
      preview = candidate;
    } catch (error) {
      if (generation !== previewGeneration || !element.isConnected) return;
      element.innerHTML = `<p class="editor-assets-preview-error">${escapeHtml(formatError(error))}</p>`;
    }
  }

  async function destroyPreview(): Promise<void> {
    previewGeneration += 1;
    const current = preview;
    preview = null;
    if (current) await current.destroy();
  }

  function renderReview(value: EditorAssetImportPreparation) {
    reviewElement.hidden = false;
    const profileGroups = groupProfiles(value.profiles);
    reviewElement.innerHTML = `<div class="editor-assets-review-card" role="dialog" aria-modal="true" aria-label="Asset import review">
      <h3>导入 Review</h3>
      ${[...profileGroups].map(([container, profiles]) => `<label>${escapeHtml(container)} profile<select data-profile-container="${escapeHtml(container)}"><option value="">请选择</option>${profiles.map((profile) => `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.label)} · ${profile.byteLength} bytes</option>`).join("")}</select></label>`).join("")}
      ${value.blockingErrors.length ? `<ul class="editor-assets-errors">${value.blockingErrors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : ""}
      <div class="editor-assets-review-list">${value.review.items.map((item, index) => `<div><strong>${escapeHtml(item.targetKey)}</strong><span>${item.action} · ${item.incoming.byteLength} bytes</span>${item.action === "overwrite" ? `<select data-resolution="${index}"><option value="">请选择</option><option value="overwrite">覆盖</option><option value="keep-both">保留两份</option></select>` : ""}</div>`).join("")}</div>
      <div class="editor-assets-review-actions"><button type="button" data-review-cancel>取消</button><button type="button" data-review-profile>应用 Profile</button><button type="button" data-review-commit ${value.blockingErrors.length ? "disabled" : ""}>提交</button></div>
    </div>`;
  }

  async function handleClick(event: MouseEvent) {
    const target = event.target as HTMLElement;
    const expandButton = target.closest<HTMLElement>("[data-expand]");
    if (expandButton && !expandButton.hasAttribute("disabled")) {
      const id = expandButton.dataset.expand!;
      expanded = new Set(expanded);
      if (expanded.has(id)) expanded.delete(id);
      else expanded.add(id);
      render();
      return;
    }
    const selectButton = target.closest<HTMLElement>("[data-select]");
    if (selectButton) {
      selectedId = selectButton.dataset.select!;
      markingRootKey = null;
      render();
      return;
    }
    if (target.closest("[data-review-cancel]")) {
      cancelPreparation();
      setMessage("已取消导入。", "ready");
      return;
    }
    if (target.closest("[data-review-profile]")) {
      const selections = Object.fromEntries(
        [
          ...reviewElement.querySelectorAll<HTMLSelectElement>(
            "[data-profile-container]",
          ),
        ]
          .filter(({ value }) => value)
          .map((select) => [select.dataset.profileContainer!, select.value]),
      );
      await prepare(selections);
      return;
    }
    if (target.closest("[data-review-commit]")) {
      if (!preparation) return;
      const resolutions: EditorAssetImportResolution[] = [
        ...reviewElement.querySelectorAll<HTMLSelectElement>(
          "[data-resolution]",
        ),
      ]
        .filter(({ value }) => value)
        .map((select) => ({
          itemIndex: Number(select.dataset.resolution),
          resolution: select.value as EditorAssetImportResolution["resolution"],
        }));
      try {
        await options.controller.commitImport(preparation, resolutions);
        cancelPreparation();
        setMessage("Assets 已原子提交。", "ready");
      } catch (error) {
        setMessage(formatError(error), "error");
      }
      return;
    }
    const begin = target.closest<HTMLElement>("[data-program-begin]");
    if (begin) {
      markingRootKey = begin.dataset.programBegin!;
      renderInspector();
      inspector.querySelector<HTMLInputElement>("[data-program-name]")?.focus();
      return;
    }
    if (target.closest("[data-program-abort]")) {
      markingRootKey = null;
      renderInspector();
      return;
    }
    const programButton = target.closest<HTMLElement>(
      "[data-program-confirm], [data-program-save]",
    );
    if (programButton) {
      const value = required<HTMLInputElement>(
        inspector,
        "[data-program-name]",
      ).value.trim();
      if (!value) {
        setMessage("程序键不能为空。", "error");
        return;
      }
      const rootKey =
        programButton.dataset.programConfirm ??
        programButton.dataset.programSave!;
      try {
        await options.controller.setProgramBinding(rootKey, value);
        markingRootKey = null;
        setMessage("程序 binding 已保存。", "ready");
      } catch (error) {
        setMessage(formatError(error), "error");
      }
      return;
    }
    const programCancel = target.closest<HTMLElement>("[data-program-cancel]");
    if (programCancel) {
      try {
        await options.controller.setProgramBinding(
          programCancel.dataset.programCancel!,
          null,
        );
        setMessage("程序 binding 已取消。", "ready");
      } catch (error) {
        setMessage(formatError(error), "error");
      }
      return;
    }
    const exportButton =
      target.closest<HTMLButtonElement>("[data-root-export]");
    if (exportButton) {
      exportButton.disabled = true;
      setMessage("正在校验并导出 Asset…", "loading");
      try {
        const exported = await options.controller.exportRoot(
          exportButton.dataset.rootExport!,
        );
        download(exported);
        setMessage(`已导出 ${exported.filename}。`, "ready");
      } catch (error) {
        setMessage(formatError(error), "error");
      } finally {
        exportButton.disabled = false;
      }
      return;
    }
    const deleteButton = target.closest<HTMLElement>("[data-root-delete]");
    if (deleteButton) {
      try {
        await options.controller.deleteRoot(deleteButton.dataset.rootDelete!);
        selectedId = null;
        markingRootKey = null;
        setMessage("Asset root 已删除。", "ready");
      } catch (error) {
        setMessage(formatError(error), "error");
      }
    }
  }

  function handleTreeKey(event: KeyboardEvent) {
    if (!visibleRows.length) return;
    let index = visibleRows.findIndex(({ id }) => id === selectedId);
    if (event.key === "ArrowDown")
      index = Math.min(visibleRows.length - 1, index + 1);
    else if (event.key === "ArrowUp")
      index = Math.max(0, index < 0 ? 0 : index - 1);
    else if (
      event.key === "ArrowRight" &&
      index >= 0 &&
      visibleRows[index]!.hasChildren
    )
      expanded = new Set(expanded).add(visibleRows[index]!.id);
    else if (event.key === "ArrowLeft" && index >= 0) {
      expanded = new Set(expanded);
      expanded.delete(visibleRows[index]!.id);
    } else return;
    event.preventDefault();
    if (index >= 0) selectedId = visibleRows[index]!.id;
    render();
  }

  function setTreeWidth(requested: number): void {
    const width = body.clientWidth || 960;
    const maximum = Math.max(220, Math.min(720, width - 320, width * 0.55));
    const next = Math.round(Math.min(maximum, Math.max(220, requested)));
    body.style.setProperty("--assets-tree-width", `${next}px`);
    splitter.setAttribute("aria-valuemax", String(Math.round(maximum)));
    splitter.setAttribute("aria-valuenow", String(next));
  }

  function stackedLayout(): boolean {
    return globalThis.matchMedia?.("(max-width: 840px)").matches ?? false;
  }

  function cancelPreparation(): void {
    preparation = null;
    pendingFiles = [];
    reviewElement.hidden = true;
    reviewElement.replaceChildren();
  }

  function setMessage(text: string, state: "loading" | "ready" | "error") {
    message.textContent = text;
    message.dataset.state = state;
  }
}

function downloadArtifact(artifact: EditorAssetExportArtifact): void {
  const url = URL.createObjectURL(
    new Blob([artifact.bytes.slice().buffer], { type: artifact.mediaType }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = artifact.filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function required<T extends Element>(root: ParentNode, selector: string): T {
  const value = root.querySelector<T>(selector);
  if (!value) throw new Error(`EditorAssetsView 缺少元素：${selector}`);
  return value;
}

function groupProfiles(
  profiles: EditorAssetImportPreparation["profiles"],
): Map<string, EditorAssetImportPreparation["profiles"]> {
  const output = new Map<string, EditorAssetImportPreparation["profiles"]>();
  for (const profile of profiles)
    output.set(profile.containerName, [
      ...(output.get(profile.containerName) ?? []),
      profile,
    ]);
  return output;
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
