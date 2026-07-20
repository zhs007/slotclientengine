import { collectSceneLayoutAssetPaths } from "@slotclientengine/rendercore/scene-layout";
import {
  activeVariantIds,
  editorProjectToManifest,
  type EditorProject,
} from "../model/editor-project.js";
import { getLayoutResourceReferences } from "../model/resource-commands.js";
import { escapeHtml } from "./ui-markup.js";

export function projectWorkspaceMarkup(
  project: EditorProject,
  errors: readonly string[],
): string {
  const referenced = [...project.resources.keys()].filter(
    (id) => getLayoutResourceReferences(project, id).length > 0,
  );
  const unused = project.resources.size - referenced.length;
  const referencedPopupIds = new Set(
    project.gameModes.modes.flatMap((mode) =>
      mode.awardCelebrationPopupId ? [mode.awardCelebrationPopupId] : [],
    ),
  );
  const unusedPopups = [...project.popupDependencies.keys()].filter(
    (id) => !referencedPopupIds.has(id),
  );
  let closure: readonly string[] = [];
  let manifestPreview = "当前项目尚未形成严格 manifest。";
  try {
    const manifest = editorProjectToManifest(project);
    closure = collectSceneLayoutAssetPaths(manifest);
    manifestPreview = JSON.stringify(manifest, null, 2);
  } catch {
    // Strict diagnostics already render below.
  }
  return `<section class="workspace-panel project-workspace" aria-labelledby="project-heading"><div class="project-content"><h2 id="project-heading">项目</h2><section class="project-card"><label>project id<input data-project-id value="${escapeHtml(project.id)}" /></label><dl><dt>适配模式</dt><dd>${project.mode}</dd><dt>Variants</dt><dd>${activeVariantIds(project).join(", ")}</dd><dt>游戏模式</dt><dd>${project.gameModes.modes.map((mode) => `${escapeHtml(mode.id)}${mode.id === project.gameModes.initialMode ? " (initial)" : ""}`).join(", ")}</dd><dt>Nodes</dt><dd>${project.nodes.length}</dd><dt>已引用资源</dt><dd>${referenced.length}</dd><dt>未使用资源</dt><dd>${unused}</dd><dt>Popup dependencies</dt><dd>${project.popupDependencies.size}</dd><dt>未引用 Popup</dt><dd>${unusedPopups.map(escapeHtml).join(", ") || "无"}</dd></dl></section><section class="project-card"><h3>Strict diagnostics</h3>${errors.length ? `<ul class="diagnostic-list">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : '<p class="success-text">通过，可以导出。</p>'}</section><section class="project-card"><h3>Manifest direct closure · ${closure.length}</h3><p class="warning-text">导出时会继续派生 nested image-string、可选 symbols 与被游戏模式引用 popup 的传递精确闭包；未引用资源不会进入 ZIP，重新导入后不会恢复。</p><ul class="closure-list">${closure.map((path) => `<li>${escapeHtml(path)}</li>`).join("") || "<li>等待严格 manifest</li>"}</ul><p class="hint">ZIP 最多 4096 entries / 200 MiB 压缩 / 50 MiB 单文件 / 500 MiB 解压总量；只允许 layout.manifest.json 与 manifest 派生的精确 assets/**、dependencies/** 闭包。</p></section><details class="project-card"><summary>高级：只读 manifest preview</summary><pre>${escapeHtml(manifestPreview)}</pre></details></div></section>`;
}
