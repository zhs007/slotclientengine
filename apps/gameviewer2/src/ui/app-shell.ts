import {
  createDefaultSceneOtherSceneFlowProject,
  inspectSceneOtherSceneFlowPackage,
  inspectSceneOtherSceneFlowReadiness,
  parseSceneOtherSceneFlowProject,
  rollOtherSceneValues,
  rollSceneFromPublicReels,
  type SceneOtherSceneFlowPackageSummary,
  type SceneOtherSceneFlowProjectV1,
} from "@slotclientengine/rendercore/scene-layout";
import {
  downloadProject,
  parseGameViewer2ProjectFile,
} from "../model/project.js";
import { launchRuntimeWindow } from "../runtime/launch-channel.js";

type Mutable<T> = {
  -readonly [P in keyof T]: T[P] extends readonly (infer U)[]
    ? Mutable<U>[]
    : T[P] extends object
      ? Mutable<T[P]>
      : T[P];
};

interface EditorState {
  layoutBytes: Uint8Array | null;
  summary: SceneOtherSceneFlowPackageSummary | null;
  flow: SceneOtherSceneFlowProjectV1 | null;
  projectHash: string | null;
  tab: "scenes" | "states";
  selectedChoreography: string | null;
  status: string;
  error: boolean;
}

export function createGameViewer2AppShell(root: HTMLElement): void {
  const state: EditorState = {
    layoutBytes: null,
    summary: null,
    flow: null,
    projectHash: null,
    tab: "scenes",
    selectedChoreography: null,
    status: "请先导入 Game Layout Editor 的 production ZIP。",
    error: false,
  };

  const render = (): void => {
    root.innerHTML = shellHtml(state);
    bindFileInput(root, "layout-file", async (file) => {
      await perform(state, render, async () => {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const summary = await inspectSceneOtherSceneFlowPackage({
          layoutZipBytes: bytes,
        });
        state.layoutBytes = bytes;
        state.summary = summary;
        if (
          !state.flow ||
          (state.projectHash && state.projectHash !== summary.sha256)
        ) {
          state.flow = createDefaultSceneOtherSceneFlowProject({ summary });
          state.projectHash = summary.sha256;
        }
        state.selectedChoreography = state.flow.choreographies[0]?.id ?? null;
        state.status = `${summary.layoutId} · ${summary.columns}×${summary.rows} · ${summary.renderMode}`;
      });
    });
    bindFileInput(root, "project-file", async (file) => {
      await perform(state, render, async () => {
        const parsed = parseGameViewer2ProjectFile(
          JSON.parse(await file.text()),
        );
        if (state.summary && parsed.layoutSha256 !== state.summary.sha256)
          throw new Error("项目引用的 layout hash 与当前 ZIP 不一致。");
        state.flow = parsed.flow;
        state.projectHash = parsed.layoutSha256;
        state.selectedChoreography = parsed.flow.choreographies[0]!.id;
        state.status = "本地项目已导入；预览前会重新执行完整校验。";
      });
    });
    root.querySelectorAll<HTMLElement>("[data-action]").forEach((element) => {
      element.addEventListener(
        "click",
        () =>
          void handleAction(
            element.dataset.action!,
            element,
            state,
            render,
          ).catch((error: unknown) => {
            state.status =
              error instanceof Error ? error.message : String(error);
            state.error = true;
            render();
          }),
      );
    });
    root
      .querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-edit]")
      .forEach((element) => {
        element.addEventListener("change", () =>
          handleEdit(element, state, render),
        );
      });
  };
  render();
}

async function handleAction(
  action: string,
  element: HTMLElement,
  state: EditorState,
  render: () => void,
): Promise<void> {
  if (action === "tab-scenes" || action === "tab-states") {
    state.tab = action === "tab-scenes" ? "scenes" : "states";
    render();
    return;
  }
  if (!state.flow || !state.summary) return;
  const draft = structuredClone(
    state.flow,
  ) as Mutable<SceneOtherSceneFlowProjectV1>;
  if (action === "export") {
    downloadProject({
      kind: "gameviewer2-project",
      version: 1,
      layoutSha256: state.summary.sha256,
      flow: state.flow,
    });
    return;
  }
  if (action === "preview") {
    await perform(state, render, async () => {
      if (!state.layoutBytes) throw new Error("请先导入 layout ZIP。");
      const readiness = await inspectSceneOtherSceneFlowReadiness({
        layoutZipBytes: state.layoutBytes,
        expectedLayoutSha256: state.summary!.sha256,
        project: state.flow,
      });
      launchRuntimeWindow({
        kind: "gameviewer2-launch",
        version: 1,
        layoutSha256: readiness.layout.sha256,
        layoutZip: state.layoutBytes.slice().buffer,
        project: readiness.project,
      });
      state.status = "预览配置已通过一次性 MessageChannel 发送到新窗口。";
    });
    return;
  }
  if (action === "add-snapshot") {
    const source = draft.snapshots.at(-1)!;
    const clone = structuredClone(source);
    clone.id = uniqueId(
      "snapshot",
      draft.snapshots.map((item) => item.id),
    );
    clone.name = `Snapshot ${draft.snapshots.length + 1}`;
    draft.snapshots.push(clone);
  } else if (action === "delete-snapshot") {
    const index = numberData(element, "index");
    if (draft.snapshots.length <= 2) throw new Error("至少保留两个场景配置。 ");
    draft.snapshots.splice(index, 1);
  } else if (action === "roll-scene") {
    draft.snapshots[numberData(element, "index")]!.scene = structuredClone(
      rollSceneFromPublicReels(state.summary),
    ) as number[][];
  } else if (action === "roll-other") {
    const index = numberData(element, "index");
    const card = element.closest<HTMLElement>("[data-snapshot]")!;
    const table =
      card.querySelector<HTMLSelectElement>("[data-roll-table]")!.value;
    const fixedText =
      card.querySelector<HTMLInputElement>("[data-roll-fixed]")!.value;
    const symbols = [
      ...card.querySelector<HTMLSelectElement>("[data-roll-symbols]")!
        .selectedOptions,
    ].map((option) => option.value);
    draft.snapshots[index]!.otherScene = structuredClone(
      rollOtherSceneValues({
        summary: state.summary,
        snapshot: draft.snapshots[index]!,
        symbolNames: symbols,
        ...(table
          ? { weightTableName: table }
          : { fixedValue: Number(fixedText) }),
      }),
    ) as (number | null)[][];
  } else if (action === "select-choreography") {
    state.selectedChoreography = element.dataset.id!;
    render();
    return;
  } else if (action === "add-choreography" || action === "copy-choreography") {
    const source =
      draft.choreographies.find(
        (item) => item.id === state.selectedChoreography,
      ) ?? draft.choreographies[0]!;
    const id = uniqueId(
      "sequence",
      draft.choreographies.map((item) => item.id),
    );
    draft.choreographies.push({
      id,
      name:
        action === "copy-choreography"
          ? `${source.name} Copy`
          : `Sequence ${draft.choreographies.length + 1}`,
      steps:
        action === "copy-choreography"
          ? structuredClone(source.steps)
          : [
              {
                state: state.summary.states.find(
                  (item) => item.phase === "stable",
                )!.id,
              },
            ],
    });
    state.selectedChoreography = id;
  } else if (action.startsWith("step-")) {
    const choreography = draft.choreographies.find(
      (item) => item.id === state.selectedChoreography,
    )!;
    const index = numberData(element, "step");
    if (action === "step-add")
      choreography.steps.splice(index + 1, 0, {
        state: state.summary.states[0]!.id,
      });
    if (action === "step-delete" && choreography.steps.length > 1)
      choreography.steps.splice(index, 1);
    if (action === "step-up" && index > 0)
      choreography.steps.splice(
        index - 1,
        0,
        choreography.steps.splice(index, 1)[0]!,
      );
    if (action === "step-down" && index < choreography.steps.length - 1)
      choreography.steps.splice(
        index + 1,
        0,
        choreography.steps.splice(index, 1)[0]!,
      );
  }
  state.flow = parseSceneOtherSceneFlowProject(draft);
  state.projectHash = state.summary.sha256;
  state.error = false;
  render();
}

function handleEdit(
  element: HTMLInputElement | HTMLSelectElement,
  state: EditorState,
  render: () => void,
): void {
  if (!state.flow || !state.summary) return;
  try {
    const draft = structuredClone(
      state.flow,
    ) as Mutable<SceneOtherSceneFlowProjectV1>;
    const edit = element.dataset.edit!;
    if (edit === "snapshot-name")
      draft.snapshots[numberData(element, "index")]!.name = element.value;
    if (edit === "scene" || edit === "other" || edit === "cell-choreography") {
      const snapshot = draft.snapshots[numberData(element, "index")]!;
      const x = numberData(element, "x");
      const y = numberData(element, "y");
      if (edit === "scene") snapshot.scene[x]![y] = Number(element.value);
      if (edit === "other")
        snapshot.otherScene[x]![y] =
          element.value === "" ? null : Number(element.value);
      if (edit === "cell-choreography")
        snapshot.choreographies[x]![y] = element.value;
    }
    const choreography = draft.choreographies.find(
      (item) => item.id === state.selectedChoreography,
    );
    if (edit === "choreography-name" && choreography)
      choreography.name = element.value;
    if ((edit === "step-state" || edit === "step-hold") && choreography) {
      const step = choreography.steps[numberData(element, "step")]!;
      if (edit === "step-state") step.state = element.value;
      if (edit === "step-hold") {
        if (element.value === "") delete step.holdSeconds;
        else step.holdSeconds = Number(element.value);
      }
    }
    state.flow = parseSceneOtherSceneFlowProject(draft);
    state.projectHash = state.summary.sha256;
    state.error = false;
  } catch (error) {
    state.status = error instanceof Error ? error.message : String(error);
    state.error = true;
  }
  render();
}

function shellHtml(state: EditorState): string {
  return `<main class="app-shell">
    <header><div><p class="eyebrow">RENDERCORE · LOCAL ONLY</p><h1>Game Viewer 2</h1><p>scene / otherScene 流程与 Symbol 状态编排</p></div>
      <div class="toolbar"><label class="button">导入 Layout ZIP<input id="layout-file" type="file" accept=".zip,application/zip"></label><label class="button">导入项目<input id="project-file" type="file" accept=".json,application/json"></label><button data-action="export" ${state.flow ? "" : "disabled"}>导出项目</button><button class="primary" data-action="preview" ${state.flow && state.layoutBytes ? "" : "disabled"}>新窗口预览</button></div>
    </header>
    <div class="status ${state.error ? "error" : ""}">${escapeHtml(state.status)}</div>
    ${state.flow && state.summary ? `<nav><button class="${state.tab === "scenes" ? "active" : ""}" data-action="tab-scenes">场景配置链 <span>${state.flow.snapshots.length}</span></button><button class="${state.tab === "states" ? "active" : ""}" data-action="tab-states">状态编排 <span>${state.flow.choreographies.length}</span></button></nav>${state.tab === "scenes" ? scenesHtml(state.flow, state.summary) : statesHtml(state.flow, state.summary, state.selectedChoreography)}` : emptyHtml()}
  </main>`;
}

function scenesHtml(
  flow: SceneOtherSceneFlowProjectV1,
  summary: SceneOtherSceneFlowPackageSummary,
): string {
  return `<section class="workspace"><div class="section-heading"><div><h2>场景配置链</h2><p>第 1 → 2 组固定执行 Spin；后续组原位提交。</p></div><button data-action="add-snapshot">Clone 新建</button></div>
    <div class="snapshot-chain">${flow.snapshots
      .map(
        (
          snapshot,
          index,
        ) => `<article class="snapshot" data-snapshot data-index="${index}"><div class="snapshot-head"><span class="index">${index + 1}</span><input data-edit="snapshot-name" data-index="${index}" value="${escapeHtml(snapshot.name)}"><span class="badge">${index === 0 ? "SPIN SOURCE" : index === 1 ? "SPIN TARGET" : "SETTLED"}</span><button data-action="roll-scene" data-index="${index}">Roll Scene</button><button data-action="delete-snapshot" data-index="${index}" ${flow.snapshots.length <= 2 ? "disabled" : ""}>删除</button></div>
      <div class="rollbar"><select data-roll-table><option value="">固定值</option>${Object.keys(
        summary.numberWeightTables,
      )
        .map((name) => `<option>${escapeHtml(name)}</option>`)
        .join(
          "",
        )}</select><input data-roll-fixed type="number" min="1" value="1"><select data-roll-symbols multiple title="留空表示所有 Symbol">${summary.symbols.map((symbol) => `<option value="${escapeHtml(symbol.name)}">${escapeHtml(symbol.name)}</option>`).join("")}</select><button data-action="roll-other" data-index="${index}">Roll otherScene</button></div>
      <div class="cell-grid" style="--columns:${summary.columns}">${snapshot.scene.flatMap((column, x) => column.map((code, y) => cellHtml(flow, summary, index, x, y, code, snapshot.otherScene[x]![y], snapshot.choreographies[x]![y]!))).join("")}</div></article>`,
      )
      .join('<div class="connector">→</div>')}</div></section>`;
}

function cellHtml(
  flow: SceneOtherSceneFlowProjectV1,
  summary: SceneOtherSceneFlowPackageSummary,
  index: number,
  x: number,
  y: number,
  code: number,
  value: number | null,
  choreography: string,
): string {
  return `<div class="cell"><small>${x},${y}</small><select data-edit="scene" data-index="${index}" data-x="${x}" data-y="${y}">${summary.symbols.map((symbol) => `<option value="${symbol.code}" ${symbol.code === code ? "selected" : ""}>${escapeHtml(symbol.name)}</option>`).join("")}</select><input data-edit="other" data-index="${index}" data-x="${x}" data-y="${y}" type="number" min="1" placeholder="other" value="${value ?? ""}"><select data-edit="cell-choreography" data-index="${index}" data-x="${x}" data-y="${y}">${flow.choreographies.map((item) => `<option value="${escapeHtml(item.id)}" ${item.id === choreography ? "selected" : ""}>${escapeHtml(item.name)}</option>`).join("")}</select></div>`;
}

function statesHtml(
  flow: SceneOtherSceneFlowProjectV1,
  summary: SceneOtherSceneFlowPackageSummary,
  selectedId: string | null,
): string {
  const selected =
    flow.choreographies.find((item) => item.id === selectedId) ??
    flow.choreographies[0]!;
  return `<section class="state-workspace"><aside><div class="section-heading"><h2>编排列表</h2><button data-action="add-choreography">新建</button></div>${flow.choreographies.map((item) => `<button class="sequence-item ${item.id === selected.id ? "active" : ""}" data-action="select-choreography" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${item.steps.length} states</span></button>`).join("")}<button data-action="copy-choreography">复制当前编排</button></aside><article class="sequence-editor"><label>编排名称<input data-edit="choreography-name" value="${escapeHtml(selected.name)}"></label><div class="timeline">${selected.steps.map((step, index) => `<div class="step"><span>${index + 1}</span><select data-edit="step-state" data-step="${index}">${summary.states.map((state) => `<option value="${escapeHtml(state.id)}" ${state.id === step.state ? "selected" : ""}>${escapeHtml(state.id)} · ${state.phase}</option>`).join("")}</select><input data-edit="step-hold" data-step="${index}" type="number" min="0" step="0.05" placeholder="hold 秒" value="${step.holdSeconds ?? ""}"><div><button data-action="step-up" data-step="${index}">↑</button><button data-action="step-down" data-step="${index}">↓</button><button data-action="step-add" data-step="${index}">＋</button><button data-action="step-delete" data-step="${index}" ${selected.steps.length === 1 ? "disabled" : ""}>×</button></div></div>`).join('<div class="step-line"></div>')}</div><p class="hint">once 状态等待动画完成；stable 中间状态需要 hold 秒；最后一步必须是 stable。</p></article></section>`;
}

function emptyHtml(): string {
  return '<section class="empty"><div>01</div><h2>导入 production ZIP</h2><p>复用 Game Layout Editor 导出的 standard / grid-cell 转轮配置，本项目不连接服务器。</p></section>';
}

function bindFileInput(
  root: HTMLElement,
  id: string,
  handler: (file: File) => Promise<void>,
): void {
  root
    .querySelector<HTMLInputElement>(`#${id}`)
    ?.addEventListener("change", (event) => {
      const file = (event.currentTarget as HTMLInputElement).files?.[0];
      if (file) void handler(file);
    });
}

async function perform(
  state: EditorState,
  render: () => void,
  action: () => Promise<void>,
): Promise<void> {
  try {
    state.error = false;
    await action();
  } catch (error) {
    state.status = error instanceof Error ? error.message : String(error);
    state.error = true;
  }
  render();
}

function numberData(element: HTMLElement, name: string): number {
  const value = Number(element.dataset[name]);
  if (!Number.isSafeInteger(value)) throw new Error(`缺少 ${name} 索引。`);
  return value;
}

function uniqueId(prefix: string, used: readonly string[]): string {
  let index = used.length + 1;
  while (used.includes(`${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
