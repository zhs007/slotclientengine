import type { EditorProject } from "../model/editor-project.js";
import {
  editorResourcePrimaryPath,
  type EditorLayoutResource,
} from "../model/editor-resource.js";
import {
  describeResource,
  getLayoutResourceReferences,
  getRuntimeResourceKey,
} from "../model/resource-commands.js";
import type { EditorUiSession } from "./ui-session.js";
import { escapeHtml, statusText } from "./ui-markup.js";

export function resourcesWorkspaceMarkup(options: {
  readonly project: EditorProject;
  readonly session: EditorUiSession;
  readonly thumbnailUrls: ReadonlyMap<string, string>;
}): string {
  const { project, session } = options;
  const query = session.resourceQuery.trim().toLowerCase();
  const rows = [...project.resources.values()]
    .filter(
      (resource) =>
        session.resourceType === "all" ||
        resource.kind === session.resourceType,
    )
    .filter((resource) => {
      const references = getLayoutResourceReferences(project, resource.id);
      const runtimeKey = getRuntimeResourceKey(project, resource.id);
      if (session.resourceStatus === "referenced") return references.length > 0;
      if (session.resourceStatus === "runtime") return runtimeKey !== null;
      if (session.resourceStatus === "unused")
        return references.length === 0 && runtimeKey === null;
      if (session.resourceStatus === "error") return false;
      return true;
    })
    .filter(
      (resource) =>
        !query ||
        resource.id.toLowerCase().includes(query) ||
        editorResourcePrimaryPath(resource).toLowerCase().includes(query),
    )
    .sort((left, right) => left.id.localeCompare(right.id, "en"));
  return `
    <section class="workspace-panel resources-workspace" aria-labelledby="assets-heading">
      <div class="workspace-toolbar sticky-toolbar">
        <div><h2 id="assets-heading">扁平资源库</h2><span>${project.resources.size} 个 filename-key roots</span></div>
        <div class="toolbar-actions">
          <button type="button" data-upload-resources>导入资源 / ZIP</button>
        </div>
        <label class="search-field">搜索 id / path<input type="search" data-resource-query value="${escapeHtml(session.resourceQuery)}" /></label>
        <label>类型<select data-resource-type><option value="all">全部</option><option value="image" ${session.resourceType === "image" ? "selected" : ""}>Image</option><option value="spine" ${session.resourceType === "spine" ? "selected" : ""}>Spine</option><option value="vni" ${session.resourceType === "vni" ? "selected" : ""}>VNI</option><option value="image-string" ${session.resourceType === "image-string" ? "selected" : ""}>Image String</option><option value="video" ${session.resourceType === "video" ? "selected" : ""}>Video</option></select></label>
        <label>导出状态<select data-resource-status><option value="all">全部</option><option value="referenced" ${session.resourceStatus === "referenced" ? "selected" : ""}>Scene 已引用</option><option value="runtime" ${session.resourceStatus === "runtime" ? "selected" : ""}>程序资源</option><option value="unused" ${session.resourceStatus === "unused" ? "selected" : ""}>不会导出</option><option value="error" ${session.resourceStatus === "error" ? "selected" : ""}>错误</option></select></label>
      </div>
      <div class="resource-list" data-resource-list>
        ${
          rows.length > 0
            ? rows
                .map((resource) =>
                  resourceRowMarkup(
                    project,
                    resource,
                    session.expandedResourceIds.has(resource.id),
                    options.thumbnailUrls.get(resource.id),
                  ),
                )
                .join("")
            : `<div class="empty-state"><strong>${project.resources.size === 0 ? "先上传资源" : "没有匹配的资源"}</strong><p>上传只加入资源库，不会自动创建背景或图层。</p></div>`
        }
      </div>
    </section>`;
}

function resourceRowMarkup(
  project: EditorProject,
  resource: EditorLayoutResource,
  expanded: boolean,
  thumbnailUrl: string | undefined,
): string {
  const references = getLayoutResourceReferences(project, resource.id);
  const runtimeKey = getRuntimeResourceKey(project, resource.id);
  const status = "ready" as const;
  const preview =
    resource.kind === "image" && thumbnailUrl
      ? `<img src="${escapeHtml(thumbnailUrl)}" alt="" />`
      : `<span aria-hidden="true">${resource.kind === "spine" ? "SP" : resource.kind === "vni" ? "VNI" : resource.kind === "image-string" ? "TXT" : resource.kind === "video" ? "MP4" : "IMG"}</span>`;
  return `<article class="resource-row" data-resource-row="${escapeHtml(resource.id)}">
    <div class="resource-summary">
      <div class="resource-thumbnail">${preview}</div>
      <div class="resource-main"><div><strong>${escapeHtml(resource.id)}</strong><span class="status status-${status}">${statusText(status)}</span></div><span title="${escapeHtml(editorResourcePrimaryPath(resource))}">${escapeHtml(editorResourcePrimaryPath(resource))}</span><small>${escapeHtml(describeResource(resource))} · Scene 引用 ${references.length}${runtimeKey ? ` · 程序键 ${escapeHtml(runtimeKey)}` : ""}</small></div>
      <button type="button" data-toggle-resource="${escapeHtml(resource.id)}" aria-expanded="${expanded}">${expanded ? "收起" : "详情"}</button>
    </div>
    <div class="resource-actions">
      ${resource.kind === "video" ? "" : `<button type="button" data-resource-add-layer="${escapeHtml(resource.id)}">添加为图层</button>`}
      ${resource.kind === "image-string" || resource.kind === "video" || resource.kind === "vni" ? "" : project.mode === "maximized-focus" ? `<button type="button" data-resource-background="default" data-resource-id="${escapeHtml(resource.id)}">设为背景</button>` : `<button type="button" data-resource-background="landscape" data-resource-id="${escapeHtml(resource.id)}">设为横版背景</button><button type="button" data-resource-background="portrait" data-resource-id="${escapeHtml(resource.id)}">设为竖版背景</button>`}
      <label>程序键<input data-runtime-resource-key="${escapeHtml(resource.id)}" value="${escapeHtml(runtimeKey ?? "")}" placeholder="例如 nearwin" /></label><button type="button" data-runtime-resource-action="${escapeHtml(resource.id)}" data-runtime-bound="${runtimeKey !== null}">${runtimeKey ? "取消强制导出" : "设为程序资源"}</button>
      <button type="button" class="danger" data-delete-resource="${escapeHtml(resource.id)}" ${references.length > 0 ? `title="被 ${references.map((reference) => reference.nodeId).join(", ")} 引用"` : ""}>删除</button>
    </div>
    ${expanded ? resourceDetailsMarkup(resource, references, runtimeKey) : ""}
  </article>`;
}

function resourceDetailsMarkup(
  resource: EditorLayoutResource,
  references: ReturnType<typeof getLayoutResourceReferences>,
  runtimeKey: string | null,
): string {
  const dependencies =
    resource.kind === "image"
      ? `<li>${escapeHtml(resource.path)}</li>`
      : resource.kind === "spine"
        ? `<li>skeleton: ${escapeHtml(resource.skeleton)}</li><li>atlas: ${escapeHtml(resource.atlas)}</li>${Object.entries(
            resource.textures,
          )
            .map(
              ([page, path]) =>
                `<li>${escapeHtml(page)} → ${escapeHtml(path)}</li>`,
            )
            .join("")}`
        : resource.kind === "vni"
          ? `<li>project: ${escapeHtml(resource.projectPath)}</li><li>${resource.project.stage.width}×${resource.project.stage.height} · ${resource.project.stage.duration}s · ${resource.assetPaths.length} assets</li>`
          : resource.kind === "video"
            ? `<li>video: ${escapeHtml(resource.path)}</li><li>${resource.size.width}×${resource.size.height} · ${resource.durationSeconds.toFixed(3)}s · audio ${escapeHtml(String(resource.hasAudio))}</li>`
            : `<li>manifest: ${escapeHtml(resource.manifestPath)}</li><li>${resource.assetPaths.length} glyph assets</li>`;
  const animations =
    resource.kind === "spine"
      ? `<p><strong>Animations：</strong>${resource.animationNames.map(escapeHtml).join(", ")}</p>`
      : "";
  return `<div class="resource-details"><ul>${dependencies}</ul>${animations}<p><strong>Scene 引用：</strong>${references.length > 0 ? references.map((reference) => `${escapeHtml(reference.nodeId)} (${reference.role}${reference.variants.length ? `: ${reference.variants.join(", ")}` : ""})`).join("；") : "无"}</p><p><strong>程序资源：</strong>${runtimeKey ? `${escapeHtml(runtimeKey)}（强制导出）` : references.length === 0 ? "未引用，不会导出" : "未设置；由 Scene 引用导出"}</p></div>`;
}
