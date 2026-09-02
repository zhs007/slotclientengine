import type { EditorProject } from "../model/editor-project.js";
import { formatGameLayoutRuntimeAddress } from "@slotclientengine/rendercore/scene-layout/data";
import {
  editorResourcePrimaryPath,
  type EditorLayoutResource,
} from "../model/editor-resource.js";
import {
  describeResource,
  getLayoutResourceReferences,
  getRuntimeResourceKey,
  suggestRuntimeResourceKey,
} from "../model/resource-commands.js";
import type { EditorUiSession } from "./ui-session.js";
import { escapeHtml, runtimeAddressMarkup, statusText } from "./ui-markup.js";

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
          <button type="button" data-upload-json-data>导入 JSON data</button>
        </div>
        <label class="search-field">搜索 id / path<input type="search" data-resource-query value="${escapeHtml(session.resourceQuery)}" /></label>
        <label>类型<select data-resource-type><option value="all">全部</option><option value="image" ${session.resourceType === "image" ? "selected" : ""}>Image</option><option value="spine" ${session.resourceType === "spine" ? "selected" : ""}>Spine</option><option value="vni" ${session.resourceType === "vni" ? "selected" : ""}>VNI</option><option value="image-string" ${session.resourceType === "image-string" ? "selected" : ""}>Image String</option><option value="json" ${session.resourceType === "json" ? "selected" : ""}>JSON Data</option><option value="video" ${session.resourceType === "video" ? "selected" : ""}>Video</option><option value="audio" ${session.resourceType === "audio" ? "selected" : ""}>Audio</option></select></label>
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
      : `<span aria-hidden="true">${resource.kind === "spine" ? "SP" : resource.kind === "vni" ? "VNI" : resource.kind === "image-string" ? "TXT" : resource.kind === "json" ? "JSON" : resource.kind === "video" ? "MP4" : resource.kind === "audio" ? "AU" : "IMG"}</span>`;
  return `<article class="resource-row" data-resource-row="${escapeHtml(resource.id)}">
    <div class="resource-summary">
      <div class="resource-thumbnail">${preview}</div>
      <div class="resource-main"><div><strong>${escapeHtml(resource.id)}</strong><span class="status status-${status}">${statusText(status)}</span></div><span title="${escapeHtml(editorResourcePrimaryPath(resource))}">${escapeHtml(editorResourcePrimaryPath(resource))}</span><small>${escapeHtml(describeResource(resource))} · typed 引用 ${references.length}${runtimeKey ? ` · 程序键 ${escapeHtml(runtimeKey)}` : ""}</small></div>
      <button type="button" data-toggle-resource="${escapeHtml(resource.id)}" aria-expanded="${expanded}">${expanded ? "收起" : "详情"}</button>
    </div>
    <div class="resource-actions">
      ${resource.kind === "video" || resource.kind === "audio" || resource.kind === "json" ? "" : `<button type="button" data-resource-add-layer="${escapeHtml(resource.id)}">添加为图层</button>`}
      <label>程序键<input data-runtime-resource-key="${escapeHtml(resource.id)}" value="${escapeHtml(runtimeKey ?? suggestRuntimeResourceKey(resource.id))}" placeholder="例如 nearwin" /></label><button type="button" data-runtime-resource-action="${escapeHtml(resource.id)}" data-runtime-bound="${runtimeKey !== null}">${runtimeKey ? "取消强制导出" : "设为程序资源"}</button>
      ${resource.kind === "audio" ? '<span class="hint">程序音频默认单次播放；调用方可选择 loop 与结束事件</span>' : ""}
      ${resource.kind === "json" ? `<button type="button" data-replace-resource="${escapeHtml(resource.id)}">替换 JSON data</button>` : ""}
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
            : resource.kind === "audio"
              ? `<li>audio: ${escapeHtml(resource.path)}</li><li>media type: ${escapeHtml(resource.mediaType)}</li>`
              : resource.kind === "json"
                ? `<li>JSON data: ${escapeHtml(resource.path)}</li><li>root: ${resource.rootKind} · opaque program asset</li>`
                : `<li>manifest: ${escapeHtml(resource.manifestPath)}</li><li>${resource.assetPaths.length} glyph assets</li>`;
  const animations =
    resource.kind === "spine"
      ? `<p><strong>Animations：</strong>${resource.animationNames.map(escapeHtml).join(", ")}</p>`
      : "";
  const runtimeAddress =
    runtimeKey && resource.kind !== "audio" && resource.kind !== "json"
      ? formatGameLayoutRuntimeAddress("resource", resource.kind, runtimeKey)
      : runtimeKey && resource.kind === "audio"
        ? formatGameLayoutRuntimeAddress("audio", "effect", runtimeKey)
        : null;
  return `<div class="resource-details"><ul>${dependencies}</ul>${animations}<p><strong>Typed 引用：</strong>${references.length > 0 ? references.map((reference) => `${escapeHtml(reference.nodeId)} (${reference.role}${reference.variants.length ? `: ${reference.variants.join(", ")}` : ""})`).join("；") : "无"}</p><p><strong>程序使用：</strong>${resource.kind === "audio" ? (runtimeKey ? `${escapeHtml(runtimeKey)}（通过 runtime.playEffect(key) 播放；默认单次，可传 loop 与 endEvent，loop handle 可停止）${references.length > 0 ? "；同时被 Event 音频引用" : ""}` : references.length > 0 ? "仅由 Event 音频引用导出" : "未绑定，不会导出") : resource.kind === "json" ? (runtimeKey ? `${escapeHtml(runtimeKey)}（通过 loadJsonData API 读取）` : "未绑定，不会导出；JSON data 没有渲染地址") : runtimeKey ? `${escapeHtml(runtimeKey)}（强制导出）` : references.length === 0 ? "未引用，不会导出且没有程序地址" : "未设置；由 Scene 引用导出，但没有程序工厂地址"}</p>${runtimeAddress ? runtimeAddressMarkup(resource.kind === "image-string" ? "ImgNumber factory runtime address" : resource.kind === "audio" ? "Program audio effect runtime address" : "Program resource runtime address", runtimeAddress, "由程序键派生；地址不写入 manifest。") : ""}</div>`;
}
