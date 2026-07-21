import {
  activeVariantIds,
  calculateReelSize,
  type EditorNodeDraft,
  type EditorProject,
} from "../model/editor-project.js";
import type { EditorLayoutResource } from "../model/editor-resource.js";
import { describeResource } from "../model/resource-commands.js";
import {
  selectionKey,
  type EditorUiSession,
  type LayoutSelection,
} from "./ui-session.js";
import { escapeHtml, numberField } from "./ui-markup.js";

export function layoutWorkspaceMarkup(
  project: EditorProject,
  selection: LayoutSelection,
  modeId: string,
  session: EditorUiSession,
): string {
  const backgroundIds = new Set(
    project.gameModes.modes
      .flatMap((mode) => Object.values(mode.backgroundNodes))
      .filter(Boolean),
  );
  const layers = project.nodes
    .filter((node) => !backgroundIds.has(node.id))
    .sort((left, right) => left.order - right.order);
  return `<section class="workspace-panel layout-workspace" aria-labelledby="layout-heading">
    <aside class="layout-outline">
      <div class="outline-toolbar"><h2 id="layout-heading">布局大纲</h2><button type="button" class="primary" data-open-add-layer>＋ 添加图层</button></div>
      <div class="outline-list" role="listbox" aria-label="布局对象" tabindex="0" data-outline-list aria-activedescendant="outline-${escapeHtml(selectionKey(selection))}">
        <div class="outline-group"><strong>背景</strong>${activeVariantIds(
          project,
        )
          .map((variant) =>
            outlineRow({
              key: `background:${variant}`,
              label: variant,
              meta: backgroundMeta(project, modeId, variant),
              selected:
                selection.kind === "background" &&
                selection.variant === variant,
            }),
          )
          .join("")}</div>
        <div class="outline-group"><strong>主转轮</strong>${outlineRow({ key: "reel:main", label: "main", meta: `${project.reel.columns}×${project.reel.rows} · ready`, selected: selection.kind === "reel" })}</div>
        <div class="outline-group"><strong>图层 · ${layers.length}</strong>${layers.length ? layers.map((node) => outlineRow({ key: `layer:${node.id}`, label: node.id, meta: layerMeta(project, node), selected: selection.kind === "layer" && selection.nodeId === node.id })).join("") : '<span class="outline-empty">暂无普通图层</span>'}</div>
      </div>
    </aside>
    <section class="inspector" aria-live="polite">${inspectorMarkup(project, selection, layers, modeId, session)}</section>
  </section>`;
}

function outlineRow(options: {
  key: string;
  label: string;
  meta: string;
  selected: boolean;
}): string {
  return `<button type="button" role="option" id="outline-${escapeHtml(options.key)}" data-outline-key="${escapeHtml(options.key)}" aria-selected="${options.selected}"><span>${escapeHtml(options.label)}</span><small>${escapeHtml(options.meta)}</small></button>`;
}

function backgroundMeta(
  project: EditorProject,
  modeId: string,
  variant: "default" | "landscape" | "portrait",
): string {
  const node = project.nodes.find(
    (item) =>
      item.id ===
      project.gameModes.modes.find((mode) => mode.id === modeId)
        ?.backgroundNodes[variant],
  );
  if (!node) return "未设置 · incomplete";
  const resource = project.resources.get(node.resourceId);
  return resource
    ? `${resource.kind} · ${node.id} · ready`
    : "未知资源 · error";
}

function layerMeta(project: EditorProject, node: EditorNodeDraft): string {
  const resource = project.resources.get(node.resourceId);
  return `${resource?.kind ?? "unknown"} · order ${node.order} · ${resource ? "ready" : "error"}`;
}

function inspectorMarkup(
  project: EditorProject,
  selection: LayoutSelection,
  layers: readonly EditorNodeDraft[],
  modeId: string,
  session: EditorUiSession,
): string {
  if (selection.kind === "background") {
    return backgroundInspector(project, modeId, selection.variant, session);
  }
  if (selection.kind === "reel") return reelInspector(project, session);
  const node = project.nodes.find((item) => item.id === selection.nodeId);
  return node
    ? layerInspector(project, node, layers)
    : '<div class="empty-state">所选图层已不存在。</div>';
}

function backgroundInspector(
  project: EditorProject,
  modeId: string,
  variantId: "default" | "landscape" | "portrait",
  session: EditorUiSession,
): string {
  const variant = project.variants[variantId];
  const backgroundNode = project.gameModes.modes.find(
    (mode) => mode.id === modeId,
  )?.backgroundNodes[variantId];
  const node = project.nodes.find((item) => item.id === backgroundNode);
  const nodeIndex = node ? project.nodes.indexOf(node) : -1;
  const resource = node ? project.resources.get(node.resourceId) : undefined;
  return `<div class="inspector-inner"><div class="inspector-heading" tabindex="-1" data-inspector-heading><span>背景 Inspector</span><h2>${variantId}</h2></div>
    <section class="inspector-section"><h3>资源绑定</h3>${resource && node ? `<p><strong>${escapeHtml(node.id)}</strong> · order ${node.order}</p><p class="path">${escapeHtml(describeResource(resource))}</p>${nodeIdField(node)}${resource.kind === "spine" ? spinePlaybackEditor(resource, node) : ""}` : '<p class="hint">尚未绑定背景资源。</p>'}<div class="button-row"><button type="button" data-choose-background="${variantId}">${resource ? "更换资源" : "选择资源"}</button><button type="button" class="danger" data-clear-background="${variantId}" ${node ? "" : "disabled"}>清除背景</button></div></section>
    <section class="inspector-section"><h3>Art / Focus</h3><div class="field-grid">${numberField("art width", `variants.${variantId}.artSize.width`, variant.artSize.width)}${numberField("art height", `variants.${variantId}.artSize.height`, variant.artSize.height)}</div><p class="derived">focus ${variant.focusRect.x}, ${variant.focusRect.y}, ${variant.focusRect.width} × ${variant.focusRect.height}</p><details data-inspector-section="layout:background:${variantId}:focus" ${session.expandedInspectorSections.has(`layout:background:${variantId}:focus`) ? "open" : ""}><summary>高级 focus 配置</summary><div class="field-grid">${numberField("left", `variants.${variantId}.focusOffsets.left`, variant.focusOffsets.left)}${numberField("top", `variants.${variantId}.focusOffsets.top`, variant.focusOffsets.top)}${numberField("right", `variants.${variantId}.focusOffsets.right`, variant.focusOffsets.right)}${numberField("bottom", `variants.${variantId}.focusOffsets.bottom`, variant.focusOffsets.bottom)}</div>${project.mode === "orientation-focus" ? `<fieldset><legend>frame focus rect</legend><div class="field-grid">${numberField("width", `variants.${variantId}.frameFocusRect.width`, variant.frameFocusRect.width)}${numberField("height", `variants.${variantId}.frameFocusRect.height`, variant.frameFocusRect.height)}</div></fieldset><fieldset><legend>min focus margins</legend><div class="field-grid">${numberField("left", `variants.${variantId}.minFocusMargin.left`, variant.minFocusMargin.left)}${numberField("right", `variants.${variantId}.minFocusMargin.right`, variant.minFocusMargin.right)}${numberField("top", `variants.${variantId}.minFocusMargin.top`, variant.minFocusMargin.top)}${numberField("bottom", `variants.${variantId}.minFocusMargin.bottom`, variant.minFocusMargin.bottom)}</div></fieldset>` : ""}</details></section>
    ${node ? `<section class="inspector-section"><h3>背景 Placement</h3><p class="hint">Spine 的导出 bounds 不是 art size；居中原点资源通常使用 art 宽高的一半作为 x / y。</p><div class="field-grid">${numberField("x", `nodes.${nodeIndex}.placements.${variantId}.x`, node.placements[variantId]!.x)}${numberField("y", `nodes.${nodeIndex}.placements.${variantId}.y`, node.placements[variantId]!.y)}${numberField("scale", `nodes.${nodeIndex}.placements.${variantId}.scale`, node.placements[variantId]!.scale, 0.01)}</div></section>` : ""}
  </div>`;
}

function reelInspector(
  project: EditorProject,
  session: EditorUiSession,
): string {
  const reel = project.reel;
  const size = calculateReelSize(project);
  return `<div class="inspector-inner"><div class="inspector-heading" tabindex="-1" data-inspector-heading><span>主转轮 Inspector</span><h2>main</h2></div><section class="inspector-section"><div class="field-grid">${numberField("order", "reel.order", reel.order ?? 0)}${numberField("columns", "reel.columns", reel.columns)}${numberField("rows", "reel.rows", reel.rows)}</div><p class="derived">派生尺寸 ${size.width} × ${size.height}</p><details data-inspector-section="layout:reel:main:advanced" ${session.expandedInspectorSections.has("layout:reel:main:advanced") ? "open" : ""}><summary>高级 cell / gap / placement</summary><div class="field-grid">${numberField("cell width", "reel.cellWidth", reel.cellWidth)}${numberField("cell height", "reel.cellHeight", reel.cellHeight)}${numberField("gap x", "reel.gapX", reel.gapX)}${numberField("gap y", "reel.gapY", reel.gapY)}</div>${activeVariantIds(
    project,
  )
    .map((variant) => {
      const placement = reel.placements[variant] ?? { x: 0, y: 0 };
      return `<fieldset><legend>${variant} art-space</legend><div class="field-grid">${numberField("x", `reel.placements.${variant}.x`, placement.x)}${numberField("y", `reel.placements.${variant}.y`, placement.y)}</div></fieldset>`;
    })
    .join("")}</details></section></div>`;
}

function layerInspector(
  project: EditorProject,
  node: EditorNodeDraft,
  layers: readonly EditorNodeDraft[],
): string {
  const resource = project.resources.get(node.resourceId);
  const index = project.nodes.findIndex((item) => item.id === node.id);
  const layerIndex = layers.findIndex((item) => item.id === node.id);
  return `<div class="inspector-inner"><div class="inspector-heading" tabindex="-1" data-inspector-heading><span>图层 Inspector</span><h2>${escapeHtml(node.id)}</h2></div><section class="inspector-section"><h3>身份与资源</h3>${nodeIdField(node)}<p>order ${node.order}</p><p class="path">${resource ? escapeHtml(describeResource(resource)) : "未知资源"}</p><div class="button-row"><button type="button" data-rebind-layer="${escapeHtml(node.id)}">更换资源</button><button type="button" data-move-layer="-1" ${layerIndex <= 0 ? "disabled" : ""}>上移</button><button type="button" data-move-layer="1" ${layerIndex < 0 || layerIndex >= layers.length - 1 ? "disabled" : ""}>下移</button></div>${resource?.kind === "spine" ? spinePlaybackEditor(resource, node) : resource?.kind === "image-string" ? imageStringEditor(node) : ""}</section><section class="inspector-section"><h3>方向与 Placement</h3>${activeVariantIds(
    project,
  )
    .map((variant) => placementMarkup(node, index, variant, project.mode))
    .join(
      "",
    )}</section><section class="inspector-section danger-zone"><button type="button" class="danger" data-remove-layer="${escapeHtml(node.id)}">删除图层 ${escapeHtml(node.id)}</button><p>仅删除 node；资源与 bytes 保留在资源库。</p></section></div>`;
}

function nodeIdField(node: EditorNodeDraft): string {
  return `<label>node id<input data-node-id="${escapeHtml(node.id)}" value="${escapeHtml(node.id)}" /></label>`;
}

function spinePlaybackEditor(
  resource: Extract<EditorLayoutResource, { kind: "spine" }>,
  node: EditorNodeDraft,
): string {
  const playback = node.playback;
  const selected = playback?.animation ?? "";
  const animationOptions = (value: string) =>
    resource.animationNames
      .map(
        (name) =>
          `<option value="${escapeHtml(name)}" ${value === name ? "selected" : ""}>${escapeHtml(name)}</option>`,
      )
      .join("");
  return `<div class="spine-playback"><label>loop animation<select data-layer-animation="${escapeHtml(node.id)}"><option value="">请选择（大小写精确）</option>${animationOptions(selected)}</select></label><p class="hint">稳定场景 Spine 节点只播放一个显式 loop；场景切换请在独立“转场”工作区配置。</p></div>`;
}

function imageStringEditor(node: EditorNodeDraft): string {
  const value = node.imageString;
  if (!value) return '<p class="hint">image-string draft 缺失。</p>';
  return `<fieldset><legend>图片字符串</legend><label>text<input data-image-string-text="${escapeHtml(node.id)}" value="${escapeHtml(value.text)}"/></label><div class="field-grid"><label>anchor x<input type="number" min="0" max="1" step="0.01" data-image-string-anchor-x="${escapeHtml(node.id)}" value="${value.anchor.x}"/></label><label>anchor y<input type="number" min="0" max="1" step="0.01" data-image-string-anchor-y="${escapeHtml(node.id)}" value="${value.anchor.y}"/></label></div></fieldset>`;
}

function placementMarkup(
  node: EditorNodeDraft,
  nodeIndex: number,
  variant: "default" | "landscape" | "portrait",
  mode: EditorProject["mode"],
): string {
  const placement = node.placements[variant];
  const visibility =
    mode === "orientation-focus"
      ? `<label class="visibility"><input type="checkbox" data-layer-visible="${variant}" data-layer-node-id="${escapeHtml(node.id)}" ${placement ? "checked" : ""}/> ${variant} 可见</label>`
      : `<strong>default</strong>`;
  return `<fieldset><legend>${visibility}</legend>${placement ? `<div class="field-grid">${numberField("x", `nodes.${nodeIndex}.placements.${variant}.x`, placement.x)}${numberField("y", `nodes.${nodeIndex}.placements.${variant}.y`, placement.y)}${numberField("scale", `nodes.${nodeIndex}.placements.${variant}.scale`, placement.scale, 0.01)}</div>` : '<p class="hint">重新启用会创建固定初值 {x:0,y:0,scale:1}。</p>'}</fieldset>`;
}
