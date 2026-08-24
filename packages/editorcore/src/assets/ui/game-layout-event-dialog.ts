import type { EditorAssetsController } from "../core/index.js";
import {
  createEditorGameLayoutEventItem,
  inspectEditorGameLayoutEventCatalog,
  validateEditorGameLayoutEventGroup,
  type EditorGameLayoutEventCatalog,
  type EditorGameLayoutEventGroup,
  type EditorGameLayoutEventItem,
} from "../adapters/game-layout-events.js";

export interface EditorConfiguredGameLayoutEventItem<
  TConfiguration,
> extends EditorGameLayoutEventItem {
  readonly configuration?: TConfiguration;
}

export interface EditorConfiguredGameLayoutEventGroup<
  TConfiguration,
> extends Omit<EditorGameLayoutEventGroup, "events"> {
  readonly events: readonly EditorConfiguredGameLayoutEventItem<TConfiguration>[];
}

export interface EditorGameLayoutEventConfigurationAdapter<TConfiguration> {
  create(
    entry: EditorGameLayoutEventCatalog["entries"][number],
  ): TConfiguration;
  clone(value: TConfiguration): TConfiguration;
  mount(
    root: HTMLElement,
    options: {
      readonly entry: EditorGameLayoutEventCatalog["entries"][number];
      readonly value: TConfiguration;
      readonly setValue: (value: TConfiguration) => void;
    },
  ): void | (() => void);
  validate(
    value: TConfiguration,
    entry: EditorGameLayoutEventCatalog["entries"][number],
  ): void;
  summarize?(value: TConfiguration): string;
}

export interface EditorGameLayoutEventDialog<TConfiguration = never> {
  readonly element: HTMLDialogElement;
  readonly trigger: HTMLButtonElement;
  open(): void;
  close(): void;
  setValue(
    value: EditorConfiguredGameLayoutEventGroup<TConfiguration> | null,
  ): void;
  destroy(): void;
}

export interface EditorGameLayoutEventPickerDialog {
  readonly element: HTMLDialogElement;
  readonly trigger: HTMLButtonElement;
  open(): void;
  close(): void;
  setValue(value: EditorGameLayoutEventItem | null): void;
  destroy(): void;
}

export interface MountEditorGameLayoutEventDialogOptions<
  TProject,
  TConfiguration = never,
> {
  readonly root: HTMLElement;
  readonly controller?: EditorAssetsController<TProject>;
  readonly sources?: readonly {
    readonly key: string;
    readonly label: string;
  }[];
  readonly subscribe?: (listener: () => void) => () => void;
  readonly value?: EditorConfiguredGameLayoutEventGroup<TConfiguration> | null;
  readonly title?: string;
  readonly triggerLabel?: string;
  readonly inspectCatalog?: (
    rootKey: string,
  ) => EditorGameLayoutEventCatalog | Promise<EditorGameLayoutEventCatalog>;
  readonly configuration?: EditorGameLayoutEventConfigurationAdapter<TConfiguration>;
  readonly selectionMode?: "group" | "single";
  readonly onConfirm: (
    value: EditorConfiguredGameLayoutEventGroup<TConfiguration>,
  ) => void | Promise<void>;
}

export interface MountEditorGameLayoutEventPickerDialogOptions<TProject> {
  readonly root: HTMLElement;
  readonly rootKey: string;
  readonly controller?: EditorAssetsController<TProject>;
  readonly sources?: readonly {
    readonly key: string;
    readonly label: string;
  }[];
  readonly subscribe?: (listener: () => void) => () => void;
  readonly value?: EditorGameLayoutEventItem | null;
  readonly title?: string;
  readonly triggerLabel?: string;
  readonly inspectCatalog?: (
    rootKey: string,
  ) => EditorGameLayoutEventCatalog | Promise<EditorGameLayoutEventCatalog>;
  readonly onConfirm: (
    value: EditorGameLayoutEventItem,
  ) => void | Promise<void>;
}

interface ProgressiveSelection {
  family: string | null;
  facets: { key: string; value: string }[];
  query: string;
}

export function mountEditorGameLayoutEventDialog<
  TProject,
  TConfiguration = never,
>(
  options: MountEditorGameLayoutEventDialogOptions<TProject, TConfiguration>,
): EditorGameLayoutEventDialog<TConfiguration> {
  if (!options.controller && !options.sources)
    throw new Error("Editor Event Dialog 需要 controller 或固定 sources。");
  const singleSelection = options.selectionMode === "single";
  const cloneConfiguration = (
    value: TConfiguration | undefined,
  ): TConfiguration | undefined =>
    value === undefined
      ? undefined
      : options.configuration
        ? options.configuration.clone(value)
        : structuredClone(value);
  const cloneDialogGroup = (
    value: EditorConfiguredGameLayoutEventGroup<TConfiguration> | null,
  ) =>
    value
      ? {
          rootKey: value.rootKey,
          events: value.events.map((item) => ({
            address: item.address,
            descriptor: item.descriptor,
            ...(item.configuration === undefined
              ? {}
              : { configuration: cloneConfiguration(item.configuration) }),
          })),
        }
      : null;
  let destroyed = false;
  let hostValue = cloneDialogGroup(options.value ?? null);
  let draft = cloneDialogGroup(hostValue) ?? { rootKey: "", events: [] };
  let catalog: EditorGameLayoutEventCatalog | null = null;
  let catalogError = "";
  let loading = false;
  let loadGeneration = 0;
  let editorActive = false;
  let editIndex: number | null = null;
  let pendingRootKey = "";
  let selection: ProgressiveSelection = emptySelection();
  let status = "";
  let confirming = false;
  let rowConfiguration: TConfiguration | undefined;
  let disposeConfiguration: (() => void) | null = null;

  options.root.classList.add("editor-event-dialog-host");
  options.root.innerHTML = `
    <button class="editor-event-dialog-trigger" type="button">${escapeHtml(options.triggerLabel ?? "编辑 Events")}</button>
    <dialog class="editor-event-dialog" aria-label="${escapeHtml(options.title ?? "Event 组")}">
      <form class="editor-event-dialog-frame" method="dialog">
        <header class="editor-event-dialog-bar">
          <strong>${escapeHtml(options.title ?? "Event 组")}</strong>
          <button type="button" data-event-close aria-label="关闭 Event 编辑器">关闭</button>
        </header>
        <div class="editor-event-dialog-body"></div>
        <footer class="editor-event-dialog-footer">
          <p data-event-status role="status"></p>
          <button type="button" data-event-cancel>取消</button>
          <button type="button" data-event-confirm ${singleSelection ? "hidden" : ""}>确认</button>
        </footer>
      </form>
    </dialog>`;
  const trigger = required<HTMLButtonElement>(
    options.root,
    ".editor-event-dialog-trigger",
  );
  const element = required<HTMLDialogElement>(
    options.root,
    ".editor-event-dialog",
  );
  const body = required<HTMLElement>(element, ".editor-event-dialog-body");
  const statusElement = required<HTMLElement>(element, "[data-event-status]");
  const confirmButton = required<HTMLButtonElement>(
    element,
    "[data-event-confirm]",
  );
  const closeButton = required<HTMLButtonElement>(
    element,
    "[data-event-close]",
  );
  const cancelButton = required<HTMLButtonElement>(
    element,
    "[data-event-cancel]",
  );

  const inspectCatalog =
    options.inspectCatalog ??
    ((rootKey: string) =>
      inspectEditorGameLayoutEventCatalog(
        options.controller!.snapshot,
        rootKey,
      ));

  const open = () => {
    assertAlive();
    draft = cloneDialogGroup(hostValue) ?? { rootKey: "", events: [] };
    resetRowEditor();
    pendingRootKey = "";
    status = "";
    catalog = null;
    catalogError = "";
    render();
    void loadCatalog();
    if (typeof element.showModal === "function") element.showModal();
    else element.setAttribute("open", "");
  };
  const close = () => {
    if (destroyed) return;
    loadGeneration += 1;
    if (typeof element.close === "function" && element.open) element.close();
    else element.removeAttribute("open");
    trigger.focus();
  };
  const onCancel = (event: Event) => {
    event.preventDefault();
    close();
  };
  const onRootChange = (nextRootKey: string) => {
    if (nextRootKey === draft.rootKey) return;
    if (draft.events.length) {
      pendingRootKey = nextRootKey;
      status = "切换 Game Layout 会清空当前 event；请明确确认。";
      render();
      return;
    }
    switchRoot(nextRootKey);
  };
  const switchRoot = (nextRootKey: string) => {
    draft = { rootKey: nextRootKey, events: [] };
    pendingRootKey = "";
    resetRowEditor();
    catalog = null;
    catalogError = "";
    status = "";
    render();
    void loadCatalog();
  };
  const onBodyChange = (event: Event) => {
    const target = event.target;
    if (
      target instanceof HTMLSelectElement &&
      target.matches("[data-event-root]")
    )
      onRootChange(target.value);
  };
  const onBodyInput = (event: Event) => {
    const target = event.target;
    if (
      !(target instanceof HTMLInputElement) ||
      !target.matches("[data-event-search]")
    )
      return;
    selection.query = target.value;
    render();
    const search = body.querySelector<HTMLInputElement>("[data-event-search]");
    search?.focus();
    search?.setSelectionRange(search.value.length, search.value.length);
  };
  const onBodyClick = (event: Event) => {
    const button = (event.target as Element).closest<HTMLButtonElement>(
      "button[data-event-action]",
    );
    if (!button) return;
    const action = button.dataset.eventAction;
    if (action === "copy") {
      const address = button.dataset.address;
      if (!address) return;
      void copyAddress(address);
      return;
    }
    if (action === "confirm-root-change") {
      switchRoot(pendingRootKey);
      return;
    }
    if (action === "cancel-root-change") {
      pendingRootKey = "";
      status = "";
      render();
      return;
    }
    if (action === "add") {
      editorActive = true;
      editIndex = null;
      selection = emptySelection();
      status = "";
      render();
      return;
    }
    const index = Number(button.dataset.index);
    if (action === "edit" && Number.isSafeInteger(index)) {
      const item = draft.events[index];
      const entry = catalog?.entries.find(
        ({ descriptor }) => descriptor.address === item?.address,
      );
      if (!entry) {
        status = `该 event 已不属于当前 ZIP，请移除后重新添加：${item?.address ?? ""}`;
        render();
        return;
      }
      editorActive = true;
      editIndex = index;
      selection = {
        family: entry.family,
        facets: entry.facets.map(({ key, value }) => ({ key, value })),
        query: "",
      };
      rowConfiguration = cloneConfiguration(item?.configuration);
      status = "";
      render();
      return;
    }
    if (action === "remove" && Number.isSafeInteger(index)) {
      draft.events.splice(index, 1);
      resetRowEditor();
      status = "";
      render();
      return;
    }
    if (action === "family") {
      rowConfiguration = undefined;
      selection = {
        family: button.dataset.value ?? null,
        facets: [],
        query: "",
      };
      render();
      return;
    }
    if (action === "pick") {
      const next = nextFacet();
      const value = button.dataset.value;
      if (!next || value === undefined) return;
      selection.facets.push({ key: next.key, value });
      rowConfiguration = undefined;
      selection.query = "";
      render();
      return;
    }
    if (action === "family-back") {
      rowConfiguration = undefined;
      selection = emptySelection();
      render();
      return;
    }
    if (action === "truncate") {
      const count = Number(button.dataset.count);
      if (!Number.isSafeInteger(count) || count < 0) return;
      selection.facets.splice(count);
      rowConfiguration = undefined;
      selection.query = "";
      render();
      return;
    }
    if (action === "cancel-row") {
      resetRowEditor();
      render();
      return;
    }
    if (action === "save-row") saveRow();
  };
  const onConfirm = async () => {
    if (confirming || !catalog || !draft.rootKey || invalidEvents().length)
      return;
    if (editorActive) {
      status = "请先保存或取消正在编辑的 event。";
      render();
      return;
    }
    confirming = true;
    render();
    try {
      const validated = validateEditorGameLayoutEventGroup(catalog, {
        rootKey: draft.rootKey,
        events: draft.events,
      });
      const value = {
        rootKey: validated.rootKey,
        events: validated.events.map((item) => {
          const source = draft.events.find(
            (candidate) => candidate.address === item.address,
          );
          return {
            ...item,
            ...(source?.configuration === undefined
              ? {}
              : {
                  configuration: cloneConfiguration(source.configuration),
                }),
          };
        }),
      };
      await options.onConfirm(value);
      hostValue = cloneDialogGroup(value);
      close();
    } catch (error) {
      status = formatError(error);
    } finally {
      confirming = false;
      if (!destroyed) render();
    }
  };

  function saveRow(): void {
    const entry = selectedEntry();
    if (!entry) {
      status = "event 选择尚未完成。";
      render();
      return;
    }
    const duplicate = draft.events.findIndex(
      (item, index) =>
        item.address === entry.descriptor.address && index !== editIndex,
    );
    if (duplicate >= 0) {
      status = `该 event 已在第 ${duplicate + 1} 项中。`;
      render();
      return;
    }
    try {
      const item = createEditorGameLayoutEventItem(entry);
      if (options.configuration) {
        if (rowConfiguration === undefined)
          rowConfiguration = options.configuration.create(entry);
        options.configuration.validate(rowConfiguration, entry);
      }
      const configured = {
        ...item,
        ...(rowConfiguration === undefined
          ? {}
          : { configuration: cloneConfiguration(rowConfiguration) }),
      };
      if (singleSelection) {
        draft.events = [configured];
        resetRowEditor();
        status = "";
        render();
        void onConfirm();
        return;
      }
      if (editIndex === null) draft.events.push(configured);
      else draft.events[editIndex] = configured;
      resetRowEditor();
      status = "";
      render();
    } catch (error) {
      status = formatError(error);
      render();
    }
  }

  async function loadCatalog(): Promise<void> {
    const rootKey = draft.rootKey;
    const generation = ++loadGeneration;
    catalog = null;
    catalogError = "";
    if (!rootKey) {
      loading = false;
      render();
      return;
    }
    loading = true;
    render();
    try {
      const next = await inspectCatalog(rootKey);
      if (generation !== loadGeneration || destroyed) return;
      if (next.rootKey !== rootKey)
        throw new Error(`event catalog root 不匹配：${next.rootKey}`);
      catalog = next;
      activateSingleSelection();
      status = invalidEvents().length
        ? "ZIP 已更新；红色 event 已失效，请移除或重新选择。"
        : "";
    } catch (error) {
      if (generation !== loadGeneration || destroyed) return;
      catalogError = formatError(error);
    } finally {
      if (generation === loadGeneration && !destroyed) {
        loading = false;
        render();
      }
    }
  }

  function activateSingleSelection(): void {
    if (!singleSelection || !catalog) return;
    const item = draft.events[0];
    const entry = catalog.entries.find(
      ({ descriptor }) => descriptor.address === item?.address,
    );
    editorActive = true;
    editIndex = entry ? 0 : null;
    selection = entry
      ? {
          family: entry.family,
          facets: entry.facets.map(({ key, value }) => ({ key, value })),
          query: "",
        }
      : emptySelection();
    rowConfiguration = cloneConfiguration(item?.configuration);
  }

  async function copyAddress(address: string): Promise<void> {
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error("当前浏览器不可使用 Clipboard API。");
      await navigator.clipboard.writeText(address);
      status = "已复制 canonical event address。";
    } catch (error) {
      status = formatError(error);
    }
    if (!destroyed) render();
  }

  function render(): void {
    disposeConfiguration?.();
    disposeConfiguration = null;
    const roots = options.sources
      ? [...options.sources].sort((left, right) => compare(left.key, right.key))
      : [...options.controller!.snapshot.catalog.roots.values()]
          .filter(({ kind }) => kind === "game-layout")
          .map(({ key }) => ({ key, label: key }))
          .sort((left, right) => compare(left.key, right.key));
    const invalid = new Set(invalidEvents());
    body.innerHTML = `
      <section class="editor-event-source">
        <label>Game Layout ZIP
          <select data-event-root ${editorActive || loading ? "disabled" : ""}>
            <option value="">请选择已导入的 Game Layout</option>
            ${roots.map((root) => `<option value="${escapeHtml(root.key)}" ${root.key === draft.rootKey ? "selected" : ""}>${escapeHtml(root.label)}</option>`).join("")}
          </select>
        </label>
        <span>${catalog ? `${catalog.entries.length} 个可侦听 event` : loading ? "正在检查完整 ZIP…" : catalogError ? "ZIP 检查失败" : "event 完全由所选 ZIP 决定"}</span>
      </section>
      ${pendingRootKey ? `<section class="editor-event-warning">切换到 <code>${escapeHtml(pendingRootKey || "未选择")}</code> 将移除组内全部 event。<button type="button" data-event-action="confirm-root-change">清空并切换</button><button type="button" data-event-action="cancel-root-change">保留当前组</button></section>` : ""}
      ${catalogError ? `<section class="editor-event-error"><strong>无法读取 Game Layout event</strong><p>${escapeHtml(catalogError)}</p></section>` : ""}
      <div class="editor-event-workspace ${singleSelection ? "single" : ""}">
        ${
          singleSelection
            ? ""
            : `<section class="editor-event-list" aria-label="Event 列表">
          <header><strong>Event 组</strong><span>${draft.events.length} 项</span><button type="button" data-event-action="add" ${!catalog || editorActive ? "disabled" : ""}>添加 Event</button></header>
          <ol>
            ${draft.events.map((item, index) => renderEventRow(item, index, invalid.has(item.address))).join("") || `<li class="editor-event-empty">尚未添加 event。</li>`}
          </ol>
        </section>`
        }
        <section class="editor-event-editor" aria-label="渐进式 Event 选择器">
          ${renderProgressiveEditor()}
        </section>
      </div>`;
    const selected = selectedEntry();
    const configurationRoot = body.querySelector<HTMLElement>(
      "[data-event-configuration]",
    );
    if (selected && configurationRoot && options.configuration) {
      rowConfiguration ??= options.configuration.create(selected);
      disposeConfiguration =
        options.configuration.mount(configurationRoot, {
          entry: selected,
          value: rowConfiguration,
          setValue(value) {
            rowConfiguration = value;
          },
        }) ?? null;
    }
    statusElement.textContent = status;
    confirmButton.disabled =
      confirming || loading || !catalog || !draft.rootKey || invalid.size > 0;
    confirmButton.textContent = confirming ? "正在确认…" : "确认";
  }

  function renderEventRow(
    item: EditorConfiguredGameLayoutEventItem<TConfiguration>,
    index: number,
    invalid: boolean,
  ): string {
    const entry = catalog?.entries.find(
      ({ descriptor }) => descriptor.address === item.address,
    );
    const summary = entry
      ? entry.facets
          .map(({ key, value }) => `${facetLabel(key)}: ${value}`)
          .join(" · ")
      : "当前 ZIP 中不存在";
    const configuredSummary =
      item.configuration !== undefined && options.configuration?.summarize
        ? options.configuration.summarize(item.configuration)
        : "";
    return `<li class="editor-event-row ${invalid ? "invalid" : ""}">
      <div><strong>${index + 1}. ${escapeHtml(entry ? familyLabel(entry.family) : "失效 Event")}</strong><span>${escapeHtml(summary)}</span>${configuredSummary ? `<span>${escapeHtml(configuredSummary)}</span>` : ""}<code>${escapeHtml(item.address)}</code></div>
      <button type="button" data-event-action="copy" data-address="${escapeHtml(item.address)}">复制</button>
      <button type="button" data-event-action="edit" data-index="${index}" ${!catalog || editorActive ? "disabled" : ""}>修改</button>
      <button type="button" data-event-action="remove" data-index="${index}" ${editorActive ? "disabled" : ""}>移除</button>
    </li>`;
  }

  function renderProgressiveEditor(): string {
    if (!draft.rootKey)
      return `<div class="editor-event-placeholder">先选择一个 Game Layout ZIP。</div>`;
    if (loading)
      return `<div class="editor-event-placeholder">正在严格检查 ZIP 与嵌套 manifest…</div>`;
    if (!catalog)
      return `<div class="editor-event-placeholder">修复 ZIP 检查错误后才能选择 event。</div>`;
    if (!editorActive)
      return `<div class="editor-event-placeholder">${singleSelection ? "正在准备 Event 选择器…" : "从左侧添加或修改一个 event。选择器每次只展开一个层级。"}</div>`;
    const families = [...new Set(catalog.entries.map(({ family }) => family))];
    const breadcrumbs = selection.family
      ? `<button type="button" data-event-action="family-back">${escapeHtml(familyLabel(selection.family))}</button>${selection.facets.map((facet, index) => `<button type="button" data-event-action="truncate" data-count="${index}">${escapeHtml(facetLabel(facet.key))}: ${escapeHtml(facet.value)}</button>`).join("")}`
      : "";
    const selected = selectedEntry();
    const next = nextFacet();
    return `<header><strong>${singleSelection ? "选择 Event" : editIndex === null ? "添加 Event" : `修改第 ${editIndex + 1} 项`}</strong>${singleSelection ? "" : '<button type="button" data-event-action="cancel-row">取消编辑</button>'}</header>
      <nav class="editor-event-breadcrumbs" aria-label="当前选择路径">${breadcrumbs || "尚未选择类型"}</nav>
      ${!selection.family ? `<div class="editor-event-choices"><h3>选择 Event 类型</h3>${families.map((family) => `<button type="button" data-event-action="family" data-value="${escapeHtml(family)}"><strong>${escapeHtml(familyLabel(family))}</strong><span>${catalog!.entries.filter((entry) => entry.family === family).length} 个选项</span></button>`).join("")}</div>` : selected ? `<div class="editor-event-result"><strong>选择完成</strong><code>${escapeHtml(selected.descriptor.address)}</code><button type="button" data-event-action="copy" data-address="${escapeHtml(selected.descriptor.address)}">复制 canonical address</button><dl>${selected.facets.map(({ key, value }) => `<dt>${escapeHtml(facetLabel(key))}</dt><dd>${escapeHtml(value)}</dd>`).join("")}</dl></div>${options.configuration ? '<section class="editor-event-configuration" data-event-configuration></section>' : ""}` : next ? renderNextFacet(next) : `<div class="editor-event-error">当前选择路径无法唯一确定 event。</div>`}
      <footer><button type="button" data-event-action="save-row" ${selected ? "" : "disabled"}>${singleSelection ? "选定 Event" : editIndex === null ? "添加到组" : "保存修改"}</button></footer>`;
  }

  function renderNextFacet(next: { key: string; values: string[] }): string {
    const query = selection.query.trim().toLocaleLowerCase();
    const values = query
      ? next.values.filter((value) => value.toLocaleLowerCase().includes(query))
      : next.values;
    return `<div class="editor-event-choices"><h3>选择${escapeHtml(facetLabel(next.key))}</h3>
      ${next.values.length > 8 ? `<input type="search" data-event-search value="${escapeHtml(selection.query)}" placeholder="筛选 ${escapeHtml(facetLabel(next.key))}" />` : ""}
      <div class="editor-event-choice-scroll">${values.map((value) => `<button type="button" data-event-action="pick" data-value="${escapeHtml(value)}"><strong>${escapeHtml(value)}</strong><span>${countAfter(next.key, value)} 个后续</span></button>`).join("") || `<p>没有匹配项。</p>`}</div>
    </div>`;
  }

  function candidates() {
    if (!catalog || !selection.family) return [];
    return catalog.entries.filter(
      (entry) =>
        entry.family === selection.family &&
        selection.facets.every(
          (facet, index) =>
            entry.facets[index]?.key === facet.key &&
            entry.facets[index]?.value === facet.value,
        ),
    );
  }
  function selectedEntry() {
    const matches = candidates().filter(
      (entry) => entry.facets.length === selection.facets.length,
    );
    return matches.length === 1 ? matches[0]! : null;
  }
  function nextFacet(): { key: string; values: string[] } | null {
    const matches = candidates().filter(
      (entry) => entry.facets.length > selection.facets.length,
    );
    if (!matches.length) return null;
    const keys = new Set(
      matches.map((entry) => entry.facets[selection.facets.length]!.key),
    );
    if (keys.size !== 1) return null;
    const key = [...keys][0]!;
    return {
      key,
      values: [
        ...new Set(
          matches.map((entry) => entry.facets[selection.facets.length]!.value),
        ),
      ].sort(compare),
    };
  }
  function countAfter(key: string, value: string): number {
    const index = selection.facets.length;
    return candidates().filter(
      (entry) =>
        entry.facets[index]?.key === key &&
        entry.facets[index]?.value === value,
    ).length;
  }
  function invalidEvents(): string[] {
    if (!catalog) return [];
    const available = new Set(
      catalog.entries.map(({ descriptor }) => descriptor.address),
    );
    return draft.events
      .filter((item) => !available.has(item.address))
      .map((item) => item.address);
  }
  function resetRowEditor(): void {
    editorActive = false;
    editIndex = null;
    selection = emptySelection();
    rowConfiguration = undefined;
  }

  const subscribe =
    options.subscribe ??
    (options.controller
      ? (listener: () => void) => options.controller!.subscribe(listener)
      : () => () => {});
  const unsubscribe = subscribe(() => {
    if (!element.open || !draft.rootKey) {
      render();
      return;
    }
    resetRowEditor();
    void loadCatalog();
  });
  trigger.addEventListener("click", open);
  closeButton.addEventListener("click", close);
  cancelButton.addEventListener("click", close);
  confirmButton.addEventListener("click", () => void onConfirm());
  element.addEventListener("cancel", onCancel);
  body.addEventListener("change", onBodyChange);
  body.addEventListener("input", onBodyInput);
  body.addEventListener("click", onBodyClick);
  render();

  const api: EditorGameLayoutEventDialog<TConfiguration> = {
    element,
    trigger,
    open,
    close,
    setValue(value) {
      assertAlive();
      hostValue = cloneDialogGroup(value);
    },
    destroy() {
      if (destroyed) return;
      close();
      destroyed = true;
      disposeConfiguration?.();
      unsubscribe();
      trigger.removeEventListener("click", open);
      closeButton.removeEventListener("click", close);
      cancelButton.removeEventListener("click", close);
      element.removeEventListener("cancel", onCancel);
      body.removeEventListener("change", onBodyChange);
      body.removeEventListener("input", onBodyInput);
      body.removeEventListener("click", onBodyClick);
      options.root.replaceChildren();
      options.root.classList.remove("editor-event-dialog-host");
    },
  };
  return Object.freeze(api);

  function assertAlive(): void {
    if (destroyed) throw new Error("EditorGameLayoutEventDialog 已销毁。");
  }
}

export function mountEditorGameLayoutEventPickerDialog<TProject>(
  options: MountEditorGameLayoutEventPickerDialogOptions<TProject>,
): EditorGameLayoutEventPickerDialog {
  const groupDialog = mountEditorGameLayoutEventDialog<TProject>({
    root: options.root,
    ...(options.controller ? { controller: options.controller } : {}),
    ...(options.sources ? { sources: options.sources } : {}),
    ...(options.subscribe ? { subscribe: options.subscribe } : {}),
    value: {
      rootKey: options.rootKey,
      events: options.value ? [options.value] : [],
    },
    title: options.title ?? "选择 Event",
    triggerLabel: options.triggerLabel ?? "选择 Event",
    ...(options.inspectCatalog
      ? { inspectCatalog: options.inspectCatalog }
      : {}),
    selectionMode: "single",
    async onConfirm(value) {
      const selected = value.events[0];
      if (!selected) throw new Error("Event 选择器没有选定 event。");
      await options.onConfirm(selected);
    },
  });
  return Object.freeze({
    element: groupDialog.element,
    trigger: groupDialog.trigger,
    open: groupDialog.open,
    close: groupDialog.close,
    setValue(value: EditorGameLayoutEventItem | null) {
      groupDialog.setValue({
        rootKey: options.rootKey,
        events: value ? [value] : [],
      });
    },
    destroy: groupDialog.destroy,
  });
}

function emptySelection(): ProgressiveSelection {
  return { family: null, facets: [], query: "" };
}

function familyLabel(value: string): string {
  return FAMILY_LABELS[value] ?? value;
}

function facetLabel(value: string): string {
  return FACET_LABELS[value] ?? value;
}

const FAMILY_LABELS: Readonly<Record<string, string>> = Object.freeze({
  variant: "画面变体",
  "node-animation": "节点动画",
  "symbol-state": "Symbol 状态",
  "mode-state": "游戏模式状态",
  "mode-bgm": "模式 BGM",
  "transition-lifecycle": "模式切换",
  "transition-effect-event": "切换特效 Event",
  "transition-effect-lifecycle": "切换特效生命周期",
  "popup-session": "Popup 会话",
  "popup-phase": "Popup 阶段",
  "popup-tier": "Popup Tier",
  "popup-segment": "Popup Segment",
  "audio-music": "音乐生命周期",
  "resource-animation": "Runtime 动画资源",
});

const FACET_LABELS: Readonly<Record<string, string>> = Object.freeze({
  event: "Event",
  node: "节点",
  animation: "动画",
  lifecycle: "生命周期",
  "symbol-package": "Symbol 包",
  symbol: "Symbol",
  state: "状态",
  scope: "位置范围",
  x: "列",
  y: "行",
  edge: "时机",
  mode: "游戏模式",
  music: "音乐",
  from: "来源模式",
  to: "目标模式",
  effect: "特效",
  popup: "Popup",
  session: "会话状态",
  phase: "阶段",
  tier: "Tier",
  segment: "Segment",
  resource: "Runtime 资源",
});

function required<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Editor Event Dialog 缺少元素：${selector}`);
  return element;
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function escapeHtml(value: unknown): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
