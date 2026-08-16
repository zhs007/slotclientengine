import * as PIXI from "pixi.js";
import type { VNIViewer } from "@slotclientengine/vnicore/viewer";

export function mountFirstLayerGroupSlotImage(
  player: VNIViewer,
  assetId: string,
): () => void {
  const [slot] = player.getLayerGroupSlots();
  if (!slot) {
    throw new Error("The VNI project has no adjacent layer group slot.");
  }

  return player.attachImageBetweenLayerGroups({
    id: "example-slot-image",
    afterGroupId: slot.afterGroupId,
    beforeGroupId: slot.beforeGroupId,
    assetId,
    x: 1000,
    y: 1000,
    anchorX: 0.5,
    anchorY: 0.5,
    opacity: 1,
  });
}

export function mountFirstLayerGroupSlotNode(player: VNIViewer): () => void {
  const [slot] = player.getLayerGroupSlots();
  if (!slot) {
    throw new Error("The VNI project has no adjacent layer group slot.");
  }

  const debugNode = new PIXI.Container();
  debugNode.label = "example slot node";

  return player.attachNodeBetweenLayerGroups({
    id: "example-slot-node",
    afterGroupId: slot.afterGroupId,
    beforeGroupId: slot.beforeGroupId,
    node: debugNode,
  });
}

export async function mountFirstLayerGroupSlotExternalImage(
  player: VNIViewer,
  imageUrl: string,
): Promise<() => void> {
  const [slot] = player.getLayerGroupSlots();
  if (!slot) {
    throw new Error("The VNI project has no adjacent layer group slot.");
  }

  return player.attachExternalImageBetweenLayerGroups({
    id: "example-slot-external-image",
    afterGroupId: slot.afterGroupId,
    beforeGroupId: slot.beforeGroupId,
    imageUrl,
    label: imageUrl,
    x: 1000,
    y: 1000,
    anchorX: 0.5,
    anchorY: 0.5,
    opacity: 1,
  });
}

export function clearExampleSlotMount(player: VNIViewer): void {
  player.detachMountedNode("example-slot-node");
}
