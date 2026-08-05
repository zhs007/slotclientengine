import { DEFAULT_SCENE_LAYOUT_POPUP_ORDER } from "@slotclientengine/rendercore/scene-layout";
import type { EditorProject } from "./editor-project.js";

export function setNodeOrder(
  project: EditorProject,
  nodeId: string,
  order: number,
): void {
  const node = project.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`未知图层：${nodeId}`);
  if (isBackgroundNode(project, nodeId))
    throw new Error(
      "背景 order 由主状态背景层级自动管理，不能在普通图层 Inspector 修改。",
    );
  assertSafeOrder(order, `图层 ${nodeId}`);
  assertUnusedOrder(project, order, { kind: "node", id: nodeId });
  assertPopupsAboveArt(project, { nodeId, order });
  node.order = order;
}

export function setReelOrder(project: EditorProject, order: number): void {
  assertSafeOrder(order, "main reel");
  assertUnusedOrder(project, order, { kind: "reel" });
  assertPopupsAboveArt(project, { reelOrder: order });
  project.reel.order = order;
}

export function setPopupOrder(
  project: EditorProject,
  popupId: string,
  order: number,
): void {
  const popup = project.popupDependencies.get(popupId);
  if (!popup) throw new Error(`未知 Popup dependency：${popupId}`);
  assertSafeOrder(order, `Popup ${popupId}`);
  assertUnusedOrder(project, order, { kind: "popup", id: popupId });
  const maximumArtOrder = maximumArtOrderOf(project);
  if (order <= maximumArtOrder)
    throw new Error(
      `Popup ${popupId} order 必须大于全部图层和 main reel order（当前最大 ${maximumArtOrder}）。`,
    );
  popup.order = order;
}

export function nextAvailableNodeOrder(project: EditorProject): number {
  return nextAvailableOrder(project, 0);
}

export function nextAvailablePopupOrder(project: EditorProject): number {
  return nextAvailableOrder(project, DEFAULT_SCENE_LAYOUT_POPUP_ORDER);
}

function nextAvailableOrder(project: EditorProject, start: number): number {
  const occupied = new Set([
    ...project.nodes.map((node) => node.order),
    ...(project.reel.order === null ? [] : [project.reel.order]),
    ...[...project.popupDependencies.values()].map((popup) => popup.order),
  ]);
  let order = start;
  while (occupied.has(order)) {
    if (order === Number.MAX_SAFE_INTEGER)
      throw new Error("没有可用的安全整数 order。");
    order += 1;
  }
  return order;
}

function assertPopupsAboveArt(
  project: EditorProject,
  replacement: {
    readonly nodeId?: string;
    readonly order?: number;
    readonly reelOrder?: number;
  },
): void {
  const maximumArtOrder = maximumArtOrderOf(project, replacement);
  for (const popup of project.popupDependencies.values())
    if (popup.order <= maximumArtOrder)
      throw new Error(
        `Popup ${popup.id} order ${popup.order} 必须大于全部图层和 main reel order（修改后最大 ${maximumArtOrder}）。`,
      );
}

function maximumArtOrderOf(
  project: EditorProject,
  replacement: {
    readonly nodeId?: string;
    readonly order?: number;
    readonly reelOrder?: number;
  } = {},
): number {
  return Math.max(
    ...project.nodes.map((node) =>
      node.id === replacement.nodeId && replacement.order !== undefined
        ? replacement.order
        : node.order,
    ),
    replacement.reelOrder ?? project.reel.order ?? Number.MIN_SAFE_INTEGER,
    Number.MIN_SAFE_INTEGER,
  );
}

function assertUnusedOrder(
  project: EditorProject,
  order: number,
  owner:
    | { readonly kind: "node"; readonly id: string }
    | { readonly kind: "reel" }
    | { readonly kind: "popup"; readonly id: string },
): void {
  const node = project.nodes.find(
    (candidate) =>
      candidate.order === order &&
      !(owner.kind === "node" && owner.id === candidate.id),
  );
  if (node) throw new Error(`order ${order} 已被图层 ${node.id} 使用。`);
  if (project.reel.order === order && owner.kind !== "reel")
    throw new Error(`order ${order} 已被 main reel 使用。`);
  const popup = [...project.popupDependencies.values()].find(
    (candidate) =>
      candidate.order === order &&
      !(owner.kind === "popup" && owner.id === candidate.id),
  );
  if (popup) throw new Error(`order ${order} 已被 Popup ${popup.id} 使用。`);
}

function assertSafeOrder(order: number, label: string): void {
  if (!Number.isSafeInteger(order))
    throw new Error(`${label} order 必须是安全整数。`);
}

function isBackgroundNode(project: EditorProject, nodeId: string): boolean {
  return project.gameModes.modes.some((mode) =>
    Object.values(mode.backgroundNodes).includes(nodeId),
  );
}
