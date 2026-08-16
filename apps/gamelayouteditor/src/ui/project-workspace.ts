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
  for (const transition of project.gameModes.transitions)
    if (transition.preludePopupId)
      referencedPopupIds.add(transition.preludePopupId);
  for (const id of project.registeredSpinePopupIds) referencedPopupIds.add(id);
  const unusedPopups = [...project.popupDependencies.keys()].filter(
    (id) => !referencedPopupIds.has(id),
  );
  const referencedSymbolIds = new Set(
    project.gameModes.modes.flatMap((mode) =>
      mode.symbols ? [mode.symbols.packageId] : [],
    ),
  );
  const unusedSymbols = [...project.symbolDependencies.keys()].filter(
    (id) => !referencedSymbolIds.has(id),
  );
  const readinessRows = project.gameModes.modes
    .map((mode) => {
      const variants = activeVariantIds(mode);
      const backgrounds = variants
        .map((variant) => mode.backgroundNodes[variant])
        .filter((id): id is string => Boolean(id));
      const backgroundReady = backgrounds.length === variants.length;
      return `<tr><th>${escapeHtml(mode.id)}${mode.id === project.gameModes.initialMode ? " · initial" : ""}</th><td class="${backgroundReady ? "success-text" : "warning-text"}">${backgroundReady ? backgrounds.map(escapeHtml).join(", ") : "缺少绑定"}</td><td>${mode.symbols ? `${escapeHtml(mode.symbols.packageId)} · ${escapeHtml(mode.symbols.reelSet)} · ${mode.symbols.renderMode}` : "无"}</td><td>${mode.awardCelebrationPopupId ? escapeHtml(mode.awardCelebrationPopupId) : "无"}</td></tr>`;
    })
    .join("");
  let closure: readonly string[] = [];
  let manifestPreview = "当前项目尚未形成严格 manifest。";
  let allocationPreview = "当前项目尚未形成严格 runtime allocation。";
  try {
    const manifest = editorProjectToManifest(project);
    closure = collectSceneLayoutAssetPaths(manifest);
    manifestPreview = JSON.stringify(manifest, null, 2);
    const allocation = manifest.runtimeAllocation;
    const modeRows = Object.entries(allocation.modes)
      .map(
        ([modeId, mode]) =>
          `${modeId}: Symbols=${mode.symbolPackage ?? "无"}, Popup=${mode.awardCelebrationPopup ?? "无"}\n${Object.entries(
            mode.variants,
          )
            .map(
              ([variantId, variant]) =>
                `  ${variantId}: ${variant.activeNodes.join(", ") || "无 active node"}`,
            )
            .join("\n")}`,
      )
      .join("\n");
    allocationPreview = `package nodes (${allocation.package.nodes.length}): ${allocation.package.nodes.join(", ") || "无"}\npackage Symbols (${allocation.package.symbolPackages.length}): ${allocation.package.symbolPackages.join(", ") || "无"}\npackage Popups (${allocation.package.popups.length}): ${allocation.package.popups.join(", ") || "无"}\non-demand transitions (${allocation.onDemand.transitions.length}): ${allocation.onDemand.transitions.join(", ") || "无"}\non-demand runtime resources (${allocation.onDemand.runtimeResources.length}): ${allocation.onDemand.runtimeResources.join(", ") || "无"}\n${modeRows}`;
  } catch {
    // Strict diagnostics already render below.
  }
  const nextOrigin =
    project.coordinateOrigin === "top-left" ? "center" : "top-left";
  const activeMode = project.gameModes.modes.find(
    (mode) => mode.id === project.gameModes.activeModeId,
  )!;
  return `<section class="workspace-panel project-workspace" aria-labelledby="project-heading"><div class="project-content"><h2 id="project-heading">项目</h2><section class="project-card"><label>project id<input data-project-id value="${escapeHtml(project.id)}" /></label><div class="coordinate-origin-control"><strong>全局坐标类型：${project.coordinateOrigin === "top-left" ? "左上角" : "中心"}</strong><button type="button" data-toggle-coordinate-origin="${nextOrigin}">切换为 ${nextOrigin === "center" ? "中心" : "左上角"}</button><p class="hint">切换会原子转换全部 art-space 图层、背景、Spine 转场和图标区坐标，保持当前视觉位置。</p></div><dl><dt>当前 mode 适配</dt><dd>${activeMode.mode}</dd><dt>当前 Variants</dt><dd>${activeVariantIds(activeMode).join(", ")}</dd><dt>游戏模式</dt><dd>${project.gameModes.modes.map((mode) => `${escapeHtml(mode.id)} · ${mode.mode}${mode.id === project.gameModes.initialMode ? " (initial)" : ""}`).join(", ")}</dd><dt>Nodes</dt><dd>${project.nodes.length}</dd><dt>已引用资源</dt><dd>${referenced.length}</dd><dt>未使用资源</dt><dd>${unused}</dd><dt>Symbols dependencies</dt><dd>${project.symbolDependencies.size}</dd><dt>未引用 Symbols</dt><dd>${unusedSymbols.map(escapeHtml).join(", ") || "无"}</dd><dt>Popup dependencies</dt><dd>${project.popupDependencies.size}</dd><dt>未引用 Popup</dt><dd>${unusedPopups.map(escapeHtml).join(", ") || "无"}</dd></dl></section><section class="project-card"><h3>主状态 readiness</h3><div class="readiness-table-wrap"><table class="readiness-table"><thead><tr><th>主状态</th><th>背景</th><th>Symbols</th><th>获奖庆祝</th></tr></thead><tbody>${readinessRows}</tbody></table></div></section><section class="project-card"><h3>Strict diagnostics</h3>${errors.length ? `<ul class="diagnostic-list">${errors.map((error) => `<li>${escapeHtml(error)}</li>`).join("")}</ul>` : '<p class="success-text">通过，可以导出。</p>'}</section><section class="project-card"><h3>Manifest direct closure · ${closure.length}</h3><p class="warning-text">导出时会继续派生 nested image-string、被主状态引用的 Symbols、获奖庆祝 Popup、转场前 Spine Popup 与显式注册 Spine Popup 的精确闭包；未引用 dependency 不进入 ZIP。</p><ul class="closure-list">${closure.map((path) => `<li>${escapeHtml(path)}</li>`).join("") || "<li>等待严格 manifest</li>"}</ul><p class="hint">ZIP 最多 4096 entries / 200 MiB 压缩 / 50 MiB 单文件 / 500 MiB 解压总量；只允许 layout.manifest.json 与 manifest 派生的精确 assets/**、dependencies/** 闭包。</p></section><details class="project-card"><summary>只读 runtime allocation</summary><pre>${escapeHtml(allocationPreview)}</pre></details><details class="project-card"><summary>高级：只读 manifest preview</summary><pre>${escapeHtml(manifestPreview)}</pre></details></div></section>`;
}
