import type { SourceFileLike } from "@slotclientengine/browserartifactio";
import {
  computeEditorAssetUsage,
  projectEditorAssetTree,
  type EditorAssetsController,
} from "../core/index.js";
import type {
  EditorAssetFilter,
  EditorAssetImportPreparation,
  EditorAssetImportResolution,
  EditorAssetRootKind,
  EditorAssetTreeOccurrence,
} from "../data/index.js";

export interface EditorAssetsView {
  readonly element: HTMLElement;
  destroy(): void;
}

export interface MountEditorAssetsViewOptions<TProject> {
  readonly controller: EditorAssetsController<TProject>;
  readonly root: HTMLElement;
  readonly title?: string;
  readonly rowHeight?: number;
  readonly overscan?: number;
}

export function mountEditorAssetsView<TProject>(
  options: MountEditorAssetsViewOptions<TProject>,
): EditorAssetsView {
  const rowHeight = options.rowHeight ?? 44;
  const overscan = options.overscan ?? 8;
  let destroyed = false;
  let query = "";
  let status: EditorAssetFilter["status"] = "all";
  let kind = "all" as "all" | EditorAssetRootKind;
  let selectedId: string | null = null;
  let expanded = new Set<string>();
  let visibleRows: readonly EditorAssetTreeOccurrence[] = [];
  let pendingFiles: readonly SourceFileLike[] = [];
  let preparation: EditorAssetImportPreparation | null = null;
  let previewUrl: string | null = null;
  let unsubscribe: () => void = () => {};

  options.root.classList.add("editor-assets-host");
  options.root.innerHTML = `
    <section class="editor-assets" aria-label="${escapeHtml(options.title ?? "Assets")}">
      <header class="editor-assets-toolbar">
        <div><h2>${escapeHtml(options.title ?? "Assets")}</h2><span data-assets-count></span></div>
        <label class="editor-assets-import">导入 Assets<input data-assets-input type="file" multiple hidden /></label>
        <input data-assets-search type="search" placeholder="搜索名称或 key" aria-label="搜索 Assets" />
        <select data-assets-kind aria-label="按类型筛选">
          <option value="all">全部类型</option>
          ${["image", "audio", "video", "spine", "vni", "image-string", "popup", "symbols", "game-layout"].map((value) => `<option value="${value}">${value}</option>`).join("")}
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
        <aside class="editor-assets-inspector"><div class="editor-assets-empty">选择一个 Asset 查看详情</div></aside>
      </div>
      <div class="editor-assets-message" data-assets-message role="status"></div>
      <div class="editor-assets-review" data-assets-review hidden></div>
    </section>`;

  const tree = required<HTMLElement>(options.root, ".editor-assets-tree");
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
  const onKeyDown = (event: KeyboardEvent) => handleKey(event);

  fileInput.addEventListener("change", onInput);
  searchInput.addEventListener("input", onSearch);
  kindSelect.addEventListener("change", onKind);
  statusSelect.addEventListener("change", onStatus);
  tree.addEventListener("scroll", onScroll);
  options.root.addEventListener("click", onClick);
  tree.addEventListener("keydown", onKeyDown);
  unsubscribe = options.controller.subscribe(render);
  render();

  return Object.freeze({
    element: options.root,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribe();
      revokePreview();
      fileInput.removeEventListener("change", onInput);
      searchInput.removeEventListener("input", onSearch);
      kindSelect.removeEventListener("change", onKind);
      statusSelect.removeEventListener("change", onStatus);
      tree.removeEventListener("scroll", onScroll);
      options.root.removeEventListener("click", onClick);
      tree.removeEventListener("keydown", onKeyDown);
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
    if (destroyed) return;
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
    revokePreview();
    const row = visibleRows.find(({ id }) => id === selectedId);
    if (!row) {
      inspector.innerHTML =
        '<div class="editor-assets-empty">选择一个 Asset 查看详情</div>';
      return;
    }
    const snapshot = options.controller.snapshot;
    const root = snapshot.catalog.roots.get(row.rootKey)!;
    const entry = snapshot.workspace.entries.get(row.node.key);
    const usage = computeEditorAssetUsage({
      catalog: snapshot.catalog,
      project: snapshot.project,
      host: options.controller.host,
    });
    const nodeUsage = usage.byNodeId.get(row.node.id);
    const isRoot = row.depth === 0;
    let preview = "";
    if (entry && ["image", "audio", "video"].includes(root.kind)) {
      previewUrl = URL.createObjectURL(
        new Blob([entry.bytes as BlobPart], { type: entry.mediaType }),
      );
      preview =
        root.kind === "image"
          ? `<img class="editor-assets-preview" src="${previewUrl}" alt="" />`
          : root.kind === "audio"
            ? `<audio class="editor-assets-preview" controls src="${previewUrl}"></audio>`
            : `<video class="editor-assets-preview" controls src="${previewUrl}"></video>`;
    }
    inspector.innerHTML = `<h3>${escapeHtml(row.node.label)}</h3>
      <span class="editor-assets-kind">${escapeHtml(row.node.kind)}</span>${preview}
      <dl><dt>Root</dt><dd>${escapeHtml(row.rootKey)}</dd><dt>Owner</dt><dd>${escapeHtml(root.owner)}</dd>
      <dt>Logical key</dt><dd>${escapeHtml(row.node.key)}</dd>
      ${entry ? `<dt>SHA-256</dt><dd class="hash">${entry.sha256}</dd><dt>Bytes</dt><dd>${entry.byteLength}</dd>` : ""}
      <dt>使用</dt><dd>${nodeUsage?.directReferences.map(({ location }) => escapeHtml(location)).join("、") || "无"}</dd>
      <dt>程序</dt><dd>${nodeUsage?.programBindings.map(({ name }) => escapeHtml(name)).join("、") || "无"}</dd></dl>
      ${Object.keys(row.node.metadata).length ? `<pre>${escapeHtml(JSON.stringify(row.node.metadata, null, 2))}</pre>` : ""}
      ${isRoot ? `<div class="editor-assets-inspector-actions"><label>程序键<input data-program-name value="${escapeHtml(nodeUsage?.programBindings[0]?.name ?? "")}" /></label><button type="button" data-program-save="${escapeHtml(root.key)}">保存程序标记</button><button class="danger" type="button" data-root-delete="${escapeHtml(root.key)}">删除 Root</button></div>` : '<p class="editor-assets-internal">内部 leaf 只读；如需独立复用，请重新导入顶层 asset。</p>'}`;
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
      render();
      return;
    }
    if (target.closest("[data-review-cancel]")) {
      preparation = null;
      pendingFiles = [];
      reviewElement.hidden = true;
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
        preparation = null;
        pendingFiles = [];
        reviewElement.hidden = true;
        setMessage("Assets 已原子提交。", "ready");
      } catch (error) {
        setMessage(formatError(error), "error");
      }
      return;
    }
    const deleteButton = target.closest<HTMLElement>("[data-root-delete]");
    if (deleteButton) {
      try {
        await options.controller.deleteRoot(deleteButton.dataset.rootDelete!);
        selectedId = null;
        setMessage("Asset root 已删除。", "ready");
      } catch (error) {
        setMessage(formatError(error), "error");
      }
      return;
    }
    const programButton = target.closest<HTMLElement>("[data-program-save]");
    if (programButton) {
      const value = required<HTMLInputElement>(
        inspector,
        "[data-program-name]",
      ).value.trim();
      try {
        await options.controller.setProgramBinding(
          programButton.dataset.programSave!,
          value || null,
        );
        setMessage(
          value ? "程序 binding 已保存。" : "程序 binding 已取消。",
          "ready",
        );
      } catch (error) {
        setMessage(formatError(error), "error");
      }
    }
  }

  function handleKey(event: KeyboardEvent) {
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
    ) {
      expanded = new Set(expanded).add(visibleRows[index]!.id);
    } else if (event.key === "ArrowLeft" && index >= 0) {
      expanded = new Set(expanded);
      expanded.delete(visibleRows[index]!.id);
    } else return;
    event.preventDefault();
    if (index >= 0) selectedId = visibleRows[index]!.id;
    render();
  }

  function revokePreview() {
    if (!previewUrl) return;
    URL.revokeObjectURL(previewUrl);
    previewUrl = null;
  }

  function setMessage(text: string, state: "loading" | "ready" | "error") {
    message.textContent = text;
    message.dataset.state = state;
  }
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
