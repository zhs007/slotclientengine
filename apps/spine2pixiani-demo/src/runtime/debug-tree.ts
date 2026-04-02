import type { SpineModel } from "./spine-types.js";

export type DebugNodeType = "bone" | "slot";

export type DebugTreeNode = {
  id: string;
  name: string;
  type: DebugNodeType;
  parentId: string | null;
  ownerBoneName: string;
  children: DebugTreeNode[];
  meta: {
    slotCount?: number;
    boneName?: string;
  };
};

export function getBoneDebugNodeId(boneName: string) {
  return `bone:${boneName}`;
}

export function getSlotDebugNodeId(slotName: string) {
  return `slot:${slotName}`;
}

export function buildDebugTree(model: SpineModel): DebugTreeNode[] {
  const childrenByParent = new Map<string | null, typeof model.bones>();
  const slotsByBone = new Map<string, typeof model.slots>();

  for (const bone of model.bones) {
    const siblings = childrenByParent.get(bone.parentName) ?? [];
    siblings.push(bone);
    childrenByParent.set(bone.parentName, siblings);
  }

  for (const slot of model.slots) {
    const slots = slotsByBone.get(slot.boneName) ?? [];
    slots.push(slot);
    slotsByBone.set(slot.boneName, slots);
  }

  const buildBoneNode = (boneName: string, parentId: string | null): DebugTreeNode => {
    const childBones = childrenByParent.get(boneName) ?? [];
    const slots = slotsByBone.get(boneName) ?? [];
    const childNodes = childBones.map((bone) => buildBoneNode(bone.name, getBoneDebugNodeId(boneName)));
    const slotNodes = slots.map<DebugTreeNode>((slot) => ({
      id: getSlotDebugNodeId(slot.name),
      name: slot.name,
      type: "slot",
      parentId: getBoneDebugNodeId(boneName),
      ownerBoneName: slot.boneName,
      children: [],
      meta: {
        boneName: slot.boneName
      }
    }));

    return {
      id: getBoneDebugNodeId(boneName),
      name: boneName,
      type: "bone",
      parentId,
      ownerBoneName: boneName,
      children: [...childNodes, ...slotNodes],
      meta: {
        slotCount: slots.length
      }
    };
  };

  return (childrenByParent.get(null) ?? []).map((bone) => buildBoneNode(bone.name, null));
}

export function createDebugNodeIndex(nodes: DebugTreeNode[]) {
  const index = new Map<string, DebugTreeNode>();

  const visit = (node: DebugTreeNode) => {
    index.set(node.id, node);
    for (const child of node.children) {
      visit(child);
    }
  };

  for (const node of nodes) {
    visit(node);
  }

  return index;
}