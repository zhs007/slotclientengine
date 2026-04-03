import { describe, expect, it } from "vitest";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";
import { buildDebugTree, createDebugNodeIndex, getBoneDebugNodeId, getSlotDebugNodeId } from "../../src/runtime/debug-tree.js";

describe("buildDebugTree", () => {
  it("creates a stable tree that covers every bone and slot", () => {
    const tree = buildDebugTree(cabinAnimationData);
    const index = createDebugNodeIndex(tree);

    expect(tree.length).toBe(cabinAnimationData.bones.filter((bone) => bone.parentName === null).length);
    expect(index.size).toBe(cabinAnimationData.bones.length + cabinAnimationData.slots.length);
  });

  it("attaches slots to their owning bones with stable ids", () => {
    const tree = buildDebugTree(cabinAnimationData);
    const index = createDebugNodeIndex(tree);
    const slot = cabinAnimationData.slots.find((item) => item.name === "ui31");

    expect(slot).toBeTruthy();
    expect(index.get(getSlotDebugNodeId("ui31"))).toMatchObject({
      id: getSlotDebugNodeId("ui31"),
      parentId: getBoneDebugNodeId(slot!.boneName),
      ownerBoneName: slot!.boneName,
      type: "slot"
    });
  });
});