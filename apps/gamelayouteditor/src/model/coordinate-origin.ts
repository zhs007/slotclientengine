import type { SceneLayoutCoordinateOrigin } from "@slotclientengine/rendercore/scene-layout/data";
import {
  activeVariantIds,
  calculateReelSize,
  type EditorProject,
} from "./editor-project.js";

export function convertProjectCoordinateOrigin(
  project: EditorProject,
  target: SceneLayoutCoordinateOrigin,
): void {
  if (project.coordinateOrigin === target) return;
  if (target !== "top-left" && target !== "center")
    throw new Error(`未知坐标类型：${String(target)}`);
  const toCenter = target === "center";
  for (const variantId of activeVariantIds(project)) {
    const artSize = project.variants[variantId].artSize;
    assertPositiveSize(artSize, `${variantId} artSize`);
    const center = { x: artSize.width / 2, y: artSize.height / 2 };
    for (const node of project.nodes) {
      const placements = [
        [node.placements[variantId], `节点 ${node.id} ${variantId}`],
        [
          node.hiddenPlacements?.[variantId],
          `节点 ${node.id} ${variantId} 隐藏缓存`,
        ],
      ] as const;
      if (!placements.some(([placement]) => placement)) continue;
      const resource = project.resources.get(node.resourceId);
      if (!resource)
        throw new Error(`节点 ${node.id} 引用了未知资源：${node.resourceId}`);
      for (const [placement, label] of placements) {
        if (!placement) continue;
        assertPlacement(placement, label);
        if (resource.kind === "image" || resource.kind === "vni") {
          const size =
            resource.kind === "image" ? resource.size : resource.project.stage;
          placement.x +=
            (toCenter ? 1 : -1) *
            ((placement.scale * size.width) / 2 - center.x);
          placement.y +=
            (toCenter ? 1 : -1) *
            ((placement.scale * size.height) / 2 - center.y);
        } else {
          placement.x += (toCenter ? -1 : 1) * center.x;
          placement.y += (toCenter ? -1 : 1) * center.y;
        }
      }
    }
    for (const transition of project.gameModes.transitions) {
      if (transition.kind !== "spine") continue;
      const placement = transition.placements[variantId];
      if (!placement) continue;
      assertPlacement(
        placement,
        `转场 ${transition.fromModeId} -> ${transition.toModeId} ${variantId}`,
      );
      placement.x += (toCenter ? -1 : 1) * center.x;
      placement.y += (toCenter ? -1 : 1) * center.y;
    }
  }
  const reelSize = calculateReelSize(project);
  assertPositiveSize(reelSize, "main reel size");
  for (const mode of project.gameModes.modes) {
    for (const variantId of activeVariantIds(mode)) {
      const placement = mode.reelPlacements[variantId];
      if (!placement) {
        if (mode.reelEnabled)
          throw new Error(`${mode.id} main reel 缺少 ${variantId} placement。`);
        continue;
      }
      const artSize = mode.variants[variantId].artSize;
      assertPositiveSize(artSize, `${mode.id} ${variantId} artSize`);
      assertPlacement(placement, `${mode.id} main reel ${variantId}`);
      placement.x +=
        (toCenter ? 1 : -1) * (reelSize.width / 2 - artSize.width / 2);
      placement.y +=
        (toCenter ? 1 : -1) * (reelSize.height / 2 - artSize.height / 2);
    }
  }
  project.coordinateOrigin = target;
}

function assertPositiveSize(
  value: { readonly width: number; readonly height: number },
  label: string,
): void {
  if (
    !Number.isFinite(value.width) ||
    value.width <= 0 ||
    !Number.isFinite(value.height) ||
    value.height <= 0
  )
    throw new Error(`${label} 必须是有限正数。`);
}

function assertPlacement(
  value: { readonly x: number; readonly y: number; readonly scale?: number },
  label: string,
): void {
  if (
    !Number.isFinite(value.x) ||
    !Number.isFinite(value.y) ||
    (value.scale !== undefined &&
      (!Number.isFinite(value.scale) || value.scale <= 0))
  )
    throw new Error(`${label} placement 必须包含有限 x/y 和正数 scale。`);
}
