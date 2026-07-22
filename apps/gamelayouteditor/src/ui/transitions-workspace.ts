import type { SceneLayoutGameModeSnapshot } from "@slotclientengine/rendercore/scene-layout";
import {
  activeVariantIds,
  validateEditorTransitionEvent,
  type EditorGameModeTransitionDraft,
  type EditorProject,
} from "../model/editor-project.js";
import { escapeHtml, numberField } from "./ui-markup.js";

export function transitionKey(
  transition: Pick<EditorGameModeTransitionDraft, "fromModeId" | "toModeId">,
): string {
  return `${transition.fromModeId}::${transition.toModeId}`;
}

export function transitionSnapshotText(
  snapshot: SceneLayoutGameModeSnapshot | null,
): string {
  if (!snapshot) return "preview 未就绪";
  return `phase=${snapshot.phase} · stable=${snapshot.stableMode} · displayed=${snapshot.displayedMode} · target=${snapshot.targetMode ?? "none"} · prepared=${snapshot.preparedTargetMode ?? "none"} · kind=${snapshot.transitionKind ?? "none"} · boundary=${snapshot.transitionPhase ?? "stable"} · media=${snapshot.mediaTimeSeconds?.toFixed(3) ?? "-"}/${snapshot.mediaDurationSeconds?.toFixed(3) ?? "-"} · fade=${snapshot.fadeProgress?.toFixed(3) ?? "-"}`;
}

export function updateTransitionRuntimeUi(
  root: ParentNode,
  snapshot: SceneLayoutGameModeSnapshot | null,
  locked: boolean,
): void {
  const status = root.querySelector<HTMLOutputElement>(
    "[data-transition-runtime-status]",
  );
  if (status) status.textContent = transitionSnapshotText(snapshot);
  if (!locked) return;
  root
    .querySelectorAll<
      HTMLInputElement | HTMLSelectElement | HTMLButtonElement
    >(".transitions-workspace input, .transitions-workspace select, .transitions-workspace button")
    .forEach((control) => {
      control.disabled = true;
    });
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
    <section class="inspector" aria-live="polite">${selected ? transitionInspector(options.project, selected, options.snapshot) : '<div class="empty-state">选择一条转场进行配置。两种 presentation 是严格互斥的 union。</div>'}</section>
  </section>`;
}

function transitionRow(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  selected: EditorGameModeTransitionDraft | undefined,
): string {
  const resource = project.resources.get(transition.resourceId);
  let ready = false;
  if (transition.kind === "spine" && resource?.kind === "spine") {
    try {
      validateEditorTransitionEvent(resource, transition);
      ready = activeVariantIds(project).every(
        (variant) => transition.placements[variant],
      );
    } catch {
      ready = false;
    }
  } else if (transition.kind === "video" && resource?.kind === "video") {
    ready =
      transition.fadeOutSeconds > 0 &&
      transition.fadeOutSeconds < resource.durationSeconds;
  }
  const summary =
    transition.kind === "spine"
      ? `${transition.animation || "未选择 animation"} · ${transition.switchEvent || "未选择 event"}`
      : `${resource?.kind === "video" ? resource.id : "未选择 MP4"} · fade ${transition.fadeOutSeconds}s`;
  return `<button type="button" role="option" data-transition-key="${escapeHtml(transitionKey(transition))}" aria-selected="${selected === transition}"><span>${escapeHtml(transition.fromModeId)} → ${escapeHtml(transition.toModeId)}</span><small>${transition.kind === "video" ? "黑场视频" : "Spine 顶层特效"} · ${escapeHtml(summary)} · ${ready ? "ready" : "error"}</small></button>`;
}

function transitionInspector(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  snapshot: SceneLayoutGameModeSnapshot | null,
): string {
  const kindSelector = `<label>presentation type<select data-transition-kind><option value="spine" ${transition.kind === "spine" ? "selected" : ""}>Spine 顶层特效</option><option value="video" ${transition.kind === "video" ? "selected" : ""}>黑场视频</option></select></label>`;
  const body =
    transition.kind === "spine"
      ? spineInspector(project, transition)
      : videoInspector(project, transition);
  const stableAtSource =
    snapshot?.phase === "stable" &&
    snapshot.stableMode === transition.fromModeId;
  const prepared =
    transition.kind === "video" &&
    snapshot?.preparedTargetMode === transition.toModeId &&
    snapshot.transitionKind === "video";
  const canPrepare = stableAtSource;
  const canPlay =
    stableAtSource && (transition.kind === "spine" || prepared === true);
  return `<div class="inspector-inner"><div class="inspector-heading"><span>Scene Transition Inspector</span><h2>${escapeHtml(transition.fromModeId)} → ${escapeHtml(transition.toModeId)}</h2></div>
    <section class="inspector-section"><h3>Presentation</h3>${kindSelector}<p class="hint">切换类型会原子清除另一分支的全部不兼容字段。</p></section>
    ${body}
    <section class="inspector-section"><div class="button-row"><button type="button" data-prepare-transition ${canPrepare ? "" : "disabled"}>预加载当前转场</button><button type="button" data-cancel-prepared-transition ${prepared ? "" : "disabled"}>取消预加载</button><button type="button" class="primary" data-play-transition ${canPlay ? "" : "disabled"}>播放当前转场</button><button type="button" class="danger" data-delete-transition>删除转场</button></div><output data-transition-runtime-status>${snapshotMarkup(snapshot)}</output></section>
  </div>`;
}

function spineInspector(
  project: EditorProject,
  transition: Extract<EditorGameModeTransitionDraft, { kind: "spine" }>,
): string {
  const resource = project.resources.get(transition.resourceId);
  const resources = [...project.resources.values()].filter(
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
  const duplicateEvents = [...counts].filter(([, count]) => count > 1);
  const duplicateDiagnostics = duplicateEvents.length
    ? `<p class="error-text">重复 event 不可作为 switch boundary：${duplicateEvents
        .map(([name, count]) => `${escapeHtml(name)} × ${count}`)
        .join("、")}</p>`
    : "";
  const placements = activeVariantIds(project)
    .map((variant) => {
      const placement = transition.placements[variant] ?? {
        x: 0,
        y: 0,
        scale: 1,
      };
      return `<fieldset><legend>${variant}</legend><div class="field-grid">${numberField("x", `transition.${variant}.x`, placement.x)}${numberField("y", `transition.${variant}.y`, placement.y)}${numberField("scale", `transition.${variant}.scale`, placement.scale, 0.01)}</div></fieldset>`;
    })
    .join("");
  return `<section class="inspector-section"><h3>Official Spine once</h3><label>Spine resource<select data-transition-resource><option value="">必须明确选择</option>${resources.map((candidate) => `<option value="${escapeHtml(candidate.id)}" ${candidate.id === transition.resourceId ? "selected" : ""}>${escapeHtml(candidate.id)}</option>`).join("")}</select></label><label>once animation<select data-transition-animation ${resource?.kind === "spine" ? "" : "disabled"}><option value="">必须明确选择</option>${animationOptions}</select></label><label>switch event<select data-transition-event ${transition.animation ? "" : "disabled"}><option value="">必须明确选择</option>${uniqueEvents.map(([name]) => `<option value="${escapeHtml(name)}" ${name === transition.switchEvent ? "selected" : ""}>${escapeHtml(name)}</option>`).join("")}</select></label>${duplicateDiagnostics}<p class="hint">event 边界原子提交完整目标 scene。</p></section><section class="inspector-section"><h3>Art-space Placement</h3>${placements}</section>`;
}

function videoInspector(
  project: EditorProject,
  transition: Extract<EditorGameModeTransitionDraft, { kind: "video" }>,
): string {
  const resource = project.resources.get(transition.resourceId);
  const videos = [...project.resources.values()].filter(
    (candidate) => candidate.kind === "video",
  );
  const metadata =
    resource?.kind === "video"
      ? `<dl><dt>尺寸</dt><dd>${resource.size.width}×${resource.size.height}</dd><dt>时长</dt><dd>${resource.durationSeconds.toFixed(3)}s</dd><dt>audio</dt><dd>${escapeHtml(String(resource.hasAudio))}</dd><dt>owned path</dt><dd>${escapeHtml(resource.path)}</dd><dt>fadeStart</dt><dd>${(resource.durationSeconds - transition.fadeOutSeconds).toFixed(3)}s</dd></dl>`
      : '<p class="error-text">必须明确选择一个 video logical resource。</p>';
  return `<section class="inspector-section"><h3>Viewport-space video blackout</h3><label>MP4 resource<select data-transition-video-resource><option value="">必须明确选择</option>${videos.map((candidate) => `<option value="${escapeHtml(candidate.id)}" ${candidate.id === transition.resourceId ? "selected" : ""}>${escapeHtml(candidate.id)}</option>`).join("")}</select></label><label>fit<input value="contain" readonly /></label><label>fadeOutSeconds<input type="number" min="0.001" step="0.001" data-transition-fade value="${transition.fadeOutSeconds}" /></label>${metadata}<p class="hint">视频始终 contain + center；未覆盖区域由 viewport 全黑层填充。fade 由 media currentTime 驱动。</p></section>`;
}

function snapshotMarkup(snapshot: SceneLayoutGameModeSnapshot | null): string {
  return escapeHtml(transitionSnapshotText(snapshot));
}
