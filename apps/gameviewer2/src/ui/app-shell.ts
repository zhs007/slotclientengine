import {
  createDefaultSceneOtherSceneFlowProject,
  fillMissingSymbolValues,
  inspectSceneOtherSceneFlowPackage,
  inspectSceneOtherSceneFlowReadiness,
  parseSceneOtherSceneFlowProject,
  rollOtherSceneValues,
  rollSceneFromPublicReels,
  type SceneOtherSceneFlowChoreographyV2,
  type SceneOtherSceneFlowPackageSummary,
  type SceneOtherSceneFlowProjectV2,
  type SceneOtherSceneFlowStateSnapshotV2,
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
  flow: SceneOtherSceneFlowProjectV2 | null;
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
  ) as unknown as Mutable<SceneOtherSceneFlowProjectV2>;
  if (action === "export") {
    downloadProject({
      kind: "gameviewer2-project",
      version: 2,
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
        version: 2,
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
    const normal = draft.choreographies.find(
      (item) => item.kind === "sequence" && item.id === "normal",
    );
    if (!normal) throw new Error('缺少默认 "normal" Sequence 编排。');
    const assignments =
      source.kind === "scene" && source.transition === "settled"
        ? structuredClone(source.choreographies)
        : Array.from({ length: state.summary.columns }, () =>
            Array.from({ length: state.summary!.rows }, () => normal.id),
          );
    draft.snapshots.push({
      kind: "scene",
      id: uniqueId(
        "snapshot",
        draft.snapshots.map((item) => item.id),
      ),
      name: `Snapshot ${draft.snapshots.length + 1}`,
      transition: "settled",
      completionPolicy:
        source.kind === "scene" ? source.completionPolicy : "all-cells-normal",
      scene: structuredClone(source.scene),
      otherScene: structuredClone(source.otherScene),
      choreographies: assignments,
    });
  } else if (action === "delete-snapshot") {
    const index = numberData(element, "index");
    if (index < 2) throw new Error("初始场景和 Spin 目标不可删除。");
    if (draft.snapshots.length <= 2) throw new Error("至少保留两个场景配置。 ");
    draft.snapshots.splice(index, 1);
  } else if (action === "roll-scene") {
    const snapshot = draft.snapshots[numberData(element, "index")]!;
    snapshot.scene = structuredClone(
      rollSceneFromPublicReels(state.summary),
    ) as number[][];
    snapshot.otherScene = structuredClone(
      fillMissingSymbolValues({
        summary: state.summary,
        scene: snapshot.scene,
        otherScene: snapshot.otherScene,
      }),
    ) as (number | null)[][];
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
    if (action === "copy-choreography") {
      const copy = structuredClone(source);
      copy.id = id;
      copy.name = `${source.name} Copy`;
      draft.choreographies.push(copy);
    } else
      draft.choreographies.push({
        kind: "sequence",
        id,
        name: `Sequence ${draft.choreographies.length + 1}`,
        steps: [{ state: "normal" }],
      });
    state.selectedChoreography = id;
  } else if (action.startsWith("step-")) {
    const choreography = draft.choreographies.find(
      (item) => item.id === state.selectedChoreography,
    )!;
    const steps =
      choreography.kind === "spin" ? choreography.stopping : choreography.steps;
    const index = numberData(element, "step");
    const finalIndex = steps.length - 1;
    const onceState = state.summary.states.find(
      (item) => item.phase === "once",
    )?.id;
    if (action === "step-add") {
      if (!onceState) throw new Error("当前 Symbols package 没有 once state。");
      steps.splice(Math.min(index + 1, finalIndex), 0, { state: onceState });
    }
    if (action === "step-delete" && index < finalIndex) steps.splice(index, 1);
    if (action === "step-up" && index > 0)
      steps.splice(index - 1, 0, steps.splice(index, 1)[0]!);
    if (action === "step-down" && index < finalIndex - 1)
      steps.splice(index + 1, 0, steps.splice(index, 1)[0]!);
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
    ) as unknown as Mutable<SceneOtherSceneFlowProjectV2>;
    const edit = element.dataset.edit!;
    if (edit === "snapshot-name")
      draft.snapshots[numberData(element, "index")]!.name = element.value;
    if (edit === "scene" || edit === "other" || edit === "cell-choreography") {
      const snapshot = draft.snapshots[numberData(element, "index")]!;
      const x = numberData(element, "x");
      const y = numberData(element, "y");
      if (edit === "scene") {
        snapshot.scene[x]![y] = Number(element.value);
        snapshot.otherScene = structuredClone(
          fillMissingSymbolValues({
            summary: state.summary,
            scene: snapshot.scene,
            otherScene: snapshot.otherScene,
          }),
        ) as (number | null)[][];
      }
      if (edit === "other")
        snapshot.otherScene[x]![y] =
          element.value === "" ? null : Number(element.value);
      if (edit === "cell-choreography")
        if (snapshot.kind !== "scene")
          throw new Error("初始场景不包含状态编排。");
        else snapshot.choreographies[x]![y] = element.value;
    }
    if (edit === "completion-policy") {
      const snapshot = draft.snapshots[numberData(element, "index")]!;
      if (snapshot.kind !== "scene")
        throw new Error("初始场景不包含完成策略。");
      snapshot.completionPolicy =
        element.value as Mutable<SceneOtherSceneFlowStateSnapshotV2>["completionPolicy"];
    }
    const choreography = draft.choreographies.find(
      (item) => item.id === state.selectedChoreography,
    );
    if (edit === "choreography-name" && choreography)
      choreography.name = element.value;
    if (edit === "spin-before" && choreography?.kind === "spin")
      choreography.beforeSpin.state = element.value;
    if (edit === "spin-spinning" && choreography?.kind === "spin")
      choreography.spinning.state = element.value;
    if (edit === "step-state" && choreography) {
      const steps =
        choreography.kind === "spin"
          ? choreography.stopping
          : choreography.steps;
      const index = numberData(element, "step");
      if (index === steps.length - 1)
        throw new Error('编排最后一项必须保持 "normal"。');
      steps[index]!.state = element.value;
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
  flow: SceneOtherSceneFlowProjectV2,
  summary: SceneOtherSceneFlowPackageSummary,
): string {
  return `<section class="workspace"><div class="section-heading"><div><h2>场景配置链</h2><p>第 1 → 2 组执行合并 Spin；后续组原位提交。矩阵 width=${summary.columns}、height=${summary.rows}。</p></div><button data-action="add-snapshot">Clone 新建</button></div>
    <div class="snapshot-chain">${flow.snapshots
      .map(
        (
          snapshot,
          index,
        ) => `<article class="snapshot" data-snapshot data-index="${index}"><div class="snapshot-head"><span class="index">${index + 1}</span><input data-edit="snapshot-name" data-index="${index}" value="${escapeHtml(snapshot.name)}"><span class="badge">${snapshot.kind === "initial" ? "INITIAL" : snapshot.transition === "spin" ? "SPIN" : "SETTLED"}</span>${snapshot.kind === "scene" ? `<select data-edit="completion-policy" data-index="${index}" title="Scene 完成策略"><option value="all-cells-normal" ${snapshot.completionPolicy === "all-cells-normal" ? "selected" : ""}>所有格回到 normal</option><option value="first-cell-normal" ${snapshot.completionPolicy === "first-cell-normal" ? "selected" : ""}>第一格回到 normal</option></select>` : "<span></span>"}<button data-action="roll-scene" data-index="${index}">Roll Scene</button><button data-action="delete-snapshot" data-index="${index}" ${index < 2 || flow.snapshots.length <= 2 ? "disabled" : ""}>删除</button></div>
      <div class="rollbar"><select data-roll-table><option value="">固定值</option>${Object.keys(
        summary.numberWeightTables,
      )
        .map((name) => `<option>${escapeHtml(name)}</option>`)
        .join(
          "",
        )}</select><input data-roll-fixed type="number" min="1" value="1"><select data-roll-symbols multiple title="留空表示所有 Symbol">${summary.symbols.map((symbol) => `<option value="${escapeHtml(symbol.name)}">${escapeHtml(symbol.name)}</option>`).join("")}</select><button data-action="roll-other" data-index="${index}">Roll otherScene</button></div>
      <div class="cell-grid" style="--columns:${summary.columns}">${cellsHtml(flow, summary, snapshot, index)}</div></article>`,
      )
      .join('<div class="connector">→</div>')}</div></section>`;
}

function cellsHtml(
  flow: SceneOtherSceneFlowProjectV2,
  summary: SceneOtherSceneFlowPackageSummary,
  snapshot: SceneOtherSceneFlowProjectV2["snapshots"][number],
  index: number,
): string {
  const cells: string[] = [];
  for (let y = 0; y < summary.rows; y++)
    for (let x = 0; x < summary.columns; x++)
      cells.push(
        cellHtml(
          flow,
          summary,
          snapshot,
          index,
          x,
          y,
          snapshot.scene[x]![y]!,
          snapshot.otherScene[x]![y]!,
        ),
      );
  return cells.join("");
}

function cellHtml(
  flow: SceneOtherSceneFlowProjectV2,
  summary: SceneOtherSceneFlowPackageSummary,
  snapshot: SceneOtherSceneFlowProjectV2["snapshots"][number],
  index: number,
  x: number,
  y: number,
  code: number,
  value: number | null,
): string {
  const choreography =
    snapshot.kind === "scene" ? snapshot.choreographies[x]![y]! : null;
  const expectedKind =
    snapshot.kind === "scene"
      ? snapshot.transition === "spin"
        ? "spin"
        : "sequence"
      : null;
  return `<div class="cell" data-cell data-x="${x}" data-y="${y}"><small>(${x},${y})</small><select data-edit="scene" data-index="${index}" data-x="${x}" data-y="${y}">${summary.symbols.map((symbol) => `<option value="${symbol.code}" ${symbol.code === code ? "selected" : ""}>${escapeHtml(symbol.name)}</option>`).join("")}</select><input data-edit="other" data-index="${index}" data-x="${x}" data-y="${y}" type="number" min="1" placeholder="other" value="${value ?? ""}">${
    expectedKind
      ? `<select data-edit="cell-choreography" data-index="${index}" data-x="${x}" data-y="${y}">${flow.choreographies
          .filter((item) => item.kind === expectedKind)
          .map(
            (item) =>
              `<option value="${escapeHtml(item.id)}" ${item.id === choreography ? "selected" : ""}>${escapeHtml(item.name)}</option>`,
          )
          .join("")}</select>`
      : '<span class="initial-state">normal</span>'
  }</div>`;
}

function statesHtml(
  flow: SceneOtherSceneFlowProjectV2,
  summary: SceneOtherSceneFlowPackageSummary,
  selectedId: string | null,
): string {
  const selected =
    flow.choreographies.find((item) => item.id === selectedId) ??
    flow.choreographies[0]!;
  return `<section class="state-workspace"><aside><div class="section-heading"><h2>编排列表</h2><button data-action="add-choreography">新建 Sequence</button></div>${flow.choreographies.map((item) => `<button class="sequence-item ${item.id === selected.id ? "active" : ""}" data-action="select-choreography" data-id="${escapeHtml(item.id)}"><strong>${escapeHtml(item.name)}</strong><span>${item.kind === "spin" ? "Spin" : "Sequence"}</span></button>`).join("")}<button data-action="copy-choreography">复制当前编排</button></aside><article class="sequence-editor"><label>编排名称<input data-edit="choreography-name" value="${escapeHtml(selected.name)}"></label><span class="kind-badge">${selected.kind === "spin" ? "SPIN" : "SEQUENCE"}</span>${selected.kind === "spin" ? spinEditorHtml(selected, summary) : completionStepsHtml(selected.steps, summary)}<p class="hint">中间状态只允许 once，依真实动画完成推进；最后一步固定为 normal，不使用 hold 时间。</p></article></section>`;
}

function spinEditorHtml(
  choreography: Extract<SceneOtherSceneFlowChoreographyV2, { kind: "spin" }>,
  summary: SceneOtherSceneFlowPackageSummary,
): string {
  return `<div class="spin-nodes"><div class="fixed-node"><strong>Spin 前</strong><select data-edit="spin-before">${stateOptions(summary.states, choreography.beforeSpin.state)}</select><small>once 等完成，stable 立即进入启转 gate</small></div><div class="step-line"></div><div class="fixed-node"><strong>Spin 中</strong><select data-edit="spin-spinning">${stateOptions(
    summary.states.filter((state) => state.phase === "stable"),
    choreography.spinning.state,
  )}</select><small>由真实 reel spin 边界保持</small></div><div class="step-line"></div><div class="fixed-node"><strong>停止</strong><small>每格真实 landing 后执行</small></div>${completionStepsHtml(choreography.stopping, summary)}</div>`;
}

function completionStepsHtml(
  steps: readonly { readonly state: string }[],
  summary: SceneOtherSceneFlowPackageSummary,
): string {
  return `<div class="timeline">${steps
    .map((step, index) => {
      const final = index === steps.length - 1;
      return `<div class="step"><span>${index + 1}</span>${
        final
          ? '<strong class="locked-normal">normal</strong>'
          : `<select data-edit="step-state" data-step="${index}">${stateOptions(
              summary.states.filter((state) => state.phase === "once"),
              step.state,
            )}</select>`
      }<div class="step-actions"><button data-action="step-up" data-step="${index}" ${index === 0 || final ? "disabled" : ""}>↑</button><button data-action="step-down" data-step="${index}" ${final || index >= steps.length - 2 ? "disabled" : ""}>↓</button><button data-action="step-add" data-step="${index}">＋</button><button data-action="step-delete" data-step="${index}" ${final ? "disabled" : ""}>×</button></div></div>`;
    })
    .join('<div class="step-line"></div>')}</div>`;
}

function stateOptions(
  states: readonly { readonly id: string; readonly phase: string }[],
  selected: string,
): string {
  return states
    .map(
      (state) =>
        `<option value="${escapeHtml(state.id)}" ${state.id === selected ? "selected" : ""}>${escapeHtml(state.id)} · ${state.phase}</option>`,
    )
    .join("");
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
