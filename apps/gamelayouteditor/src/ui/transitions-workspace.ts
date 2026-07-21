import {
  activeVariantIds,
  validateEditorTransitionEvent,
  type EditorGameModeTransitionDraft,
  type EditorProject,
} from "../model/editor-project.js";
import type { SceneLayoutGameModeSnapshot } from "@slotclientengine/rendercore/scene-layout";
import { escapeHtml, numberField } from "./ui-markup.js";

export function transitionKey(
  transition: Pick<EditorGameModeTransitionDraft, "fromModeId" | "toModeId">,
): string {
  return `${transition.fromModeId}::${transition.toModeId}`;
}

export function transitionsWorkspaceMarkup(options: {
  readonly project: EditorProject;
  readonly selectedKey: string | null;
  readonly snapshot: SceneLayoutGameModeSnapshot | null;
}): string {
  const selected = options.project.gameModes.transitions.find(
    (transition) => transitionKey(transition) === options.selectedKey,
  );
  const modeOptions = options.project.gameModes.modes
    .map(
      (mode) =>
        `<option value="${escapeHtml(mode.id)}">${escapeHtml(mode.id)}</option>`,
    )
    .join("");
  const rows = options.project.gameModes.transitions.length
    ? options.project.gameModes.transitions
        .map((transition) =>
          transitionRow(options.project, transition, selected),
        )
        .join("")
    : '<p class="outline-empty">暂无有向转场；不会自动创建反向边。</p>';
  return `<section class="workspace-panel transitions-workspace" aria-labelledby="transitions-heading">
    <aside class="transition-list"><div class="outline-toolbar"><h2 id="transitions-heading">有向场景转场</h2></div>
      <div class="transition-create"><label>from<select data-new-transition-from><option value="">必须明确选择</option>${modeOptions}</select></label><label>to<select data-new-transition-to><option value="">必须明确选择</option>${modeOptions}</select></label><button type="button" class="primary" data-create-transition>新建转场</button></div>
      <div role="listbox" aria-label="场景转场" class="outline-list">${rows}</div>
    </aside>
    <section class="inspector" aria-live="polite">${selected ? transitionInspector(options.project, selected, options.snapshot) : '<div class="empty-state">选择一条转场进行配置。overlay 固定处于普通 scene/reel 最上层。</div>'}</section>
  </section>`;
}

function transitionRow(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  selected: EditorGameModeTransitionDraft | undefined,
): string {
  let status = "error";
  const resource = project.resources.get(transition.resourceId);
  if (resource?.kind === "spine") {
    try {
      validateEditorTransitionEvent(resource, transition);
      const ready = activeVariantIds(project).every(
        (variant) => transition.placements[variant],
      );
      status = ready ? "ready" : "error";
    } catch {
      status = "error";
    }
  }
  const key = transitionKey(transition);
  return `<button type="button" role="option" data-transition-key="${escapeHtml(key)}" aria-selected="${selected === transition}"><span>${escapeHtml(transition.fromModeId)} → ${escapeHtml(transition.toModeId)}</span><small>${escapeHtml(transition.animation || "未选择 animation")} · ${escapeHtml(transition.switchEvent || "未选择 event")} · ${status}</small></button>`;
}

function transitionInspector(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  snapshot: SceneLayoutGameModeSnapshot | null,
): string {
  const resource = project.resources.get(transition.resourceId);
  const spineResources = [...project.resources.values()].filter(
    (candidate) => candidate.kind === "spine",
  );
  const animationOptions =
    resource?.kind === "spine"
      ? resource.animationNames
          .map(
            (animation) =>
              `<option value="${escapeHtml(animation)}" ${animation === transition.animation ? "selected" : ""}>${escapeHtml(animation)}</option>`,
          )
          .join("")
      : "";
  const occurrences =
    resource?.kind === "spine" && transition.animation
      ? (resource.animationEvents[transition.animation] ?? [])
      : [];
  const counts = new Map<string, number>();
  for (const event of occurrences)
    counts.set(event.name, (counts.get(event.name) ?? 0) + 1);
  const uniqueEvents = [...counts].filter(([, count]) => count === 1);
  const duplicates = [...counts].filter(([, count]) => count > 1);
  const canPlay =
    snapshot?.phase === "stable" &&
    snapshot.stableMode === transition.fromModeId;
  return `<div class="inspector-inner"><div class="inspector-heading"><span>Scene Transition Inspector</span><h2>${escapeHtml(transition.fromModeId)} → ${escapeHtml(transition.toModeId)}</h2></div>
    <section class="inspector-section"><h3>Official Spine once</h3><label>Spine resource<select data-transition-resource><option value="">必须明确选择</option>${spineResources.map((candidate) => `<option value="${escapeHtml(candidate.id)}" ${candidate.id === transition.resourceId ? "selected" : ""}>${escapeHtml(candidate.id)}</option>`).join("")}</select></label><label>once animation<select data-transition-animation ${resource?.kind === "spine" ? "" : "disabled"}><option value="">必须明确选择</option>${animationOptions}</select></label><label>switch event<select data-transition-event ${transition.animation ? "" : "disabled"}><option value="">必须明确选择</option>${uniqueEvents.map(([name]) => `<option value="${escapeHtml(name)}" ${name === transition.switchEvent ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>${occurrences.length === 0 && transition.animation ? '<p class="error-text">所选 animation 没有 event，无法 preview/export。</p>' : ""}${duplicates.length ? `<p class="error-text">重复同名 event 非法且不可选择：${duplicates.map(([name, count]) => `${escapeHtml(name)} × ${count}`).join("、")}</p>` : ""}<p class="hint">event 到达的同一 update 边界原子切换完整下层 scene；overlay 继续 once 到完成后移除。</p></section>
    <section class="inspector-section"><h3>Art-space Placement</h3>${activeVariantIds(
      project,
    )
      .map((variant) => {
        const placement = transition.placements[variant] ?? {
          x: 0,
          y: 0,
          scale: 1,
        };
        return `<fieldset><legend>${variant}</legend><div class="field-grid">${numberField("x", `transition.${variant}.x`, placement.x)}${numberField("y", `transition.${variant}.y`, placement.y)}${numberField("scale", `transition.${variant}.scale`, placement.scale, 0.01)}</div></fieldset>`;
      })
      .join(
        "",
      )}<p class="hint">坐标相对完整 art；orientation 改变只更新 placement，不重播时间轴。</p></section>
    <section class="inspector-section"><div class="button-row"><button type="button" class="primary" data-play-transition ${canPlay ? "" : "disabled"}>播放当前转场</button><button type="button" class="danger" data-delete-transition>删除转场</button></div><output data-transition-runtime-status>${snapshot ? `stable=${escapeHtml(snapshot.stableMode ?? "unknown")} · displayed=${escapeHtml(snapshot.displayedMode ?? snapshot.stableMode ?? "unknown")} · target=${escapeHtml(snapshot.targetMode ?? "none")} · ${escapeHtml(snapshot.transitionPhase ?? "stable")} · background=${escapeHtml(snapshot.activeBackgroundNodes?.join(",") || "none")} · symbols=${escapeHtml(snapshot.displayedSymbolPackage ?? snapshot.stableSymbolPackage ?? "none")}` : "preview 未就绪"}</output></section>
  </div>`;
}
