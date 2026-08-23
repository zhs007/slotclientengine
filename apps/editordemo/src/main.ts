import "@slotclientengine/editorcore/assets/ui.css";
import { createEmptyEditorAssetWorkspace } from "@slotclientengine/editorresource";
import { createDefaultEditorAssetsController } from "@slotclientengine/editorcore/assets/adapters";
import type { EditorAssetsController } from "@slotclientengine/editorcore/assets/core";
import type {
  EditorAssetCatalog,
  EditorAssetsSnapshot,
} from "@slotclientengine/editorcore/assets/data";
import {
  mountEditorAssetsDialog,
  mountEditorGameLayoutEventDialog,
  type EditorAssetsDialog,
  type EditorGameLayoutEventDialog,
} from "@slotclientengine/editorcore/assets/ui";
import type { EditorGameLayoutEventGroup } from "@slotclientengine/editorcore/assets/adapters";
import {
  createDemoProjectArchive,
  openDemoProjectArchive,
} from "./demo-project.js";
import {
  createEmptyDemoProject,
  demoProjectHost,
  type DemoProject,
} from "./host.js";
import "./styles.css";

const app = requiredElement("app");
app.innerHTML = `
  <main class="demo-shell">
    <header class="demo-header">
      <div>
        <p class="demo-eyebrow">packages/editorcore</p>
        <h1>统一 Assets 模块实验场</h1>
        <p>这里仅验证共享数据、导入、树形 UI、使用状态与工程 ZIP；不加载正式 editor。</p>
      </div>
      <div class="demo-actions">
        <button type="button" data-action="save">导出 Demo 工程</button>
        <label>打开 Demo 工程<input data-project-input type="file" accept=".zip,application/zip" hidden /></label>
        <button type="button" data-action="fixture">加载 10,000 条 fixture</button>
        <button type="button" data-action="reset">清空</button>
      </div>
    </header>
    <p class="demo-status" data-status role="status">先在 Assets 管理中导入 Gamelayout Editor ZIP，再编辑 Event 组。</p>
    <section class="demo-tools" aria-label="EditorCore Dialog 实验入口">
      <div data-workspace></div>
      <div data-event-workspace></div>
    </section>
    <section class="demo-event-result" data-event-result aria-label="当前 Event 组"></section>
  </main>`;

const workspaceElement = requiredQuery<HTMLElement>(app, "[data-workspace]");
const statusElement = requiredQuery<HTMLElement>(app, "[data-status]");
const eventWorkspaceElement = requiredQuery<HTMLElement>(
  app,
  "[data-event-workspace]",
);
const eventResultElement = requiredQuery<HTMLElement>(
  app,
  "[data-event-result]",
);
const projectInput = requiredQuery<HTMLInputElement>(
  app,
  "[data-project-input]",
);
let controller: EditorAssetsController<DemoProject>;
let dialog: EditorAssetsDialog;
let eventDialog: EditorGameLayoutEventDialog;
let eventGroup: EditorGameLayoutEventGroup | null = null;

mount();

app.addEventListener("click", (event) => {
  const button = (event.target as Element).closest<HTMLButtonElement>(
    "button[data-action]",
  );
  if (!button) return;
  void runAction(button.dataset.action ?? "");
});
projectInput.addEventListener("change", () => void openProject());

async function runAction(action: string): Promise<void> {
  try {
    if (action === "save") {
      const bytes = createDemoProjectArchive(controller);
      download(bytes, "editorcore-assets-demo.zip");
      setStatus(
        `已导出 ${controller.snapshot.catalog.roots.size} 个根 Asset。`,
      );
      return;
    }
    if (action === "fixture") {
      mount(createLargeFixture(10_000));
      setStatus(
        "已加载 10,000 条无 payload 的 UI 性能 fixture；不要用于导出。",
        true,
      );
      return;
    }
    if (action === "reset") {
      mount();
      setStatus("已清空 Demo 工程。");
      return;
    }
    throw new Error(`未知 demo action：${action}`);
  } catch (error) {
    setStatus(formatError(error), true);
  }
}

async function openProject(): Promise<void> {
  const file = projectInput.files?.[0];
  projectInput.value = "";
  if (!file) return;
  try {
    const snapshot = await openDemoProjectArchive(
      new Uint8Array(await file.arrayBuffer()),
    );
    mount(snapshot);
    setStatus(`已打开 ${snapshot.catalog.roots.size} 个根 Asset。`);
  } catch (error) {
    setStatus(formatError(error), true);
  }
}

function mount(initial?: EditorAssetsSnapshot<DemoProject>): void {
  eventDialog?.destroy();
  dialog?.destroy();
  controller?.destroy();
  controller = createDefaultEditorAssetsController({
    project: initial?.project ?? createEmptyDemoProject(),
    host: demoProjectHost,
    ...(initial ? { initial } : {}),
  });
  dialog = mountEditorAssetsDialog({
    controller,
    root: workspaceElement,
    title: "Assets",
    triggerLabel: "Assets 管理",
  });
  eventGroup = null;
  eventDialog = mountEditorGameLayoutEventDialog({
    controller,
    root: eventWorkspaceElement,
    title: "Game Layout Event 组",
    triggerLabel: "编辑 Event 组",
    value: eventGroup,
    onConfirm(value) {
      eventGroup = value;
      eventDialog.setValue(value);
      renderEventGroup();
      setStatus(`已确认 ${value.events.length} 个 Event。`);
    },
  });
  renderEventGroup();
}

function renderEventGroup(): void {
  if (!eventGroup) {
    eventResultElement.innerHTML = `<strong>当前 Event 组</strong><p>尚未创建。导入 Game Layout ZIP 后打开“编辑 Event 组”。</p>`;
    return;
  }
  eventResultElement.innerHTML = `<strong>当前 Event 组 · ${escapeHtml(eventGroup.rootKey)}</strong>
    <ol>${eventGroup.events.map((item) => `<li><code>${escapeHtml(item.address)}</code></li>`).join("") || "<li>空组</li>"}</ol>`;
}

function createLargeFixture(count: number): EditorAssetsSnapshot<DemoProject> {
  const roots = new Map();
  const nodes = new Map();
  for (let index = 0; index < count; index += 1) {
    const key = `fixture-${String(index).padStart(5, "0")}.png`;
    const id = `root:image:${key}`;
    const node = Object.freeze({
      id,
      kind: "image" as const,
      key,
      label: key,
      metadata: Object.freeze({ fixture: true }),
    });
    nodes.set(id, node);
    roots.set(
      key,
      Object.freeze({
        key,
        kind: "image" as const,
        nodeId: id,
        owner: `fixture:${key}`,
        exactKeys: Object.freeze([key]),
      }),
    );
  }
  const catalog: EditorAssetCatalog = Object.freeze({
    roots,
    nodes,
    relations: Object.freeze([]),
  });
  return Object.freeze({
    workspace: createEmptyEditorAssetWorkspace(),
    catalog,
    project: createEmptyDemoProject(),
  });
}

function download(bytes: Uint8Array, filename: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const url = URL.createObjectURL(
    new Blob([copy.buffer], { type: "application/zip" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function setStatus(message: string, error = false): void {
  statusElement.textContent = message;
  statusElement.classList.toggle("is-error", error);
}

function requiredElement(id: string): HTMLElement {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少 #${id}。`);
  return element;
}

function requiredQuery<T extends Element>(
  root: ParentNode,
  selector: string,
): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`缺少 ${selector}。`);
  return element;
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
