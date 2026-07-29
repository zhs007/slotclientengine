import type { SceneLayoutCoordinateOrigin } from "@slotclientengine/rendercore/scene-layout";
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
      const placement = node.placements[variantId];
      if (!placement) continue;
      const resource = project.resources.get(node.resourceId);
      if (!resource)
        throw new Error(`节点 ${node.id} 引用了未知资源：${node.resourceId}`);
      assertPlacement(placement, `节点 ${node.id} ${variantId}`);
      if (resource.kind === "image" || resource.kind === "vni") {
        const size =
          resource.kind === "image" ? resource.size : resource.project.stage;
        placement.x +=
          (toCenter ? 1 : -1) * ((placement.scale * size.width) / 2 - center.x);
        placement.y +=
          (toCenter ? 1 : -1) *
          ((placement.scale * size.height) / 2 - center.y);
      } else {
        placement.x += (toCenter ? -1 : 1) * center.x;
        placement.y += (toCenter ? -1 : 1) * center.y;
      }
    }
    const reelPlacement = project.reel.placements[variantId];
    if (!reelPlacement)
      throw new Error(`main reel 缺少 ${variantId} placement。`);
    assertPlacement(reelPlacement, `main reel ${variantId}`);
    const reelSize = calculateReelSize(project);
    reelPlacement.x += (toCenter ? 1 : -1) * (reelSize.width / 2 - center.x);
    reelPlacement.y += (toCenter ? 1 : -1) * (reelSize.height / 2 - center.y);
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
