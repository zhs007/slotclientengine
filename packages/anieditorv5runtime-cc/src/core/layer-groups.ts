import type { V5GLayerGroupConfig, V5GProjectConfig } from "./types.js";

export const DEFAULT_VNI_LAYER_GROUP_ID = "group_default";

type NormalizableV5GProjectConfig = Omit<V5GProjectConfig, "layerGroups"> & {
  layerGroups?: V5GLayerGroupConfig[];
};

export interface VNIRenderGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
  layerIds: readonly string[];
  renderIndex: number;
}

export interface VNILayerGroupSlot {
  afterGroupId: string;
  afterGroupName: string;
  beforeGroupId: string;
  beforeGroupName: string;
  renderIndex: number;
}

export type V5GRenderGroupInfo = VNIRenderGroupInfo;
export type V5GLayerGroupSlot = VNILayerGroupSlot;

export function normalizeVNIProjectLayerGroups(
  project: NormalizableV5GProjectConfig,
): V5GProjectConfig {
  return normalizeV5GProjectLayerGroups(project);
}

export function normalizeV5GProjectLayerGroups(
  project: NormalizableV5GProjectConfig,
): V5GProjectConfig {
  const hasLayerGroups = Array.isArray(project.layerGroups);
  const hasLayerGroupRefs = project.layers.some(
    (layer) => layer.groupId !== undefined,
  );

  if (!hasLayerGroups && hasLayerGroupRefs) {
    throw new Error(
      "VNI project has layer.groupId values but is missing project.layerGroups.",
    );
  }

  if (!hasLayerGroups) {
    return {
      ...project,
      layerGroups: [createDefaultVniLayerGroup()],
      layers: project.layers.map((layer) => ({
        ...layer,
        groupId: DEFAULT_VNI_LAYER_GROUP_ID,
      })),
    };
  }

  const layerGroups = project.layerGroups;
  if (!layerGroups) {
    throw new Error("VNI project.layerGroups normalization failed.");
  }

  return {
    ...project,
    layerGroups: layerGroups.map((group) => ({ ...group })),
    layers: project.layers.map((layer) => ({ ...layer })),
  };
}

export function createDefaultVniLayerGroup(): V5GLayerGroupConfig {
  return {
    id: DEFAULT_VNI_LAYER_GROUP_ID,
    name: "Default",
    visible: true,
    collapsed: false,
    order: 0,
  };
}

export function getVNIProjectRenderGroupOrder(
  project: V5GProjectConfig,
): readonly VNIRenderGroupInfo[] {
  return getV5GProjectRenderGroupOrder(project);
}

export function getV5GProjectRenderGroupOrder(
  project: V5GProjectConfig,
): readonly V5GRenderGroupInfo[] {
  const groupsById = new Map<string, V5GLayerGroupConfig>(
    project.layerGroups.map((group) => [group.id, group] as const),
  );
  const renderGroups: VNIRenderGroupInfo[] = [];
  const seenClosedGroups = new Set<string>();
  let currentGroupId: string | null = null;

  for (const layer of project.layers) {
    const groupId = layer.groupId;
    if (!groupId) {
      throw new Error(`VNI layer "${layer.id}" is missing groupId.`);
    }
    const group = groupsById.get(groupId);
    if (!group) {
      throw new Error(
        `VNI layer "${layer.id}" references missing layer group "${groupId}".`,
      );
    }
    if (groupId !== currentGroupId) {
      if (seenClosedGroups.has(groupId)) {
        throw new Error(
          `VNI layer group "${groupId}" is not contiguous in project.layers.`,
        );
      }
      if (currentGroupId !== null) {
        seenClosedGroups.add(currentGroupId);
      }
      renderGroups.push({
        id: group.id,
        name: group.name,
        visible: group.visible,
        collapsed: group.collapsed,
        order: group.order,
        layerIds: [],
        renderIndex: renderGroups.length,
      });
      currentGroupId = groupId;
    }

    const renderGroup = renderGroups[renderGroups.length - 1];
    if (!renderGroup) {
      throw new Error("VNI render group construction failed.");
    }
    (renderGroup.layerIds as string[]).push(layer.id);
  }

  return Object.freeze(
    renderGroups.map((group) =>
      Object.freeze({
        ...group,
        layerIds: Object.freeze([...group.layerIds]),
      }),
    ),
  );
}

export function getVNIProjectLayerGroupSlots(
  project: V5GProjectConfig,
): readonly VNILayerGroupSlot[] {
  const groups = getVNIProjectRenderGroupOrder(project);
  const slots: VNILayerGroupSlot[] = [];
  for (let index = 0; index < groups.length - 1; index += 1) {
    const after = groups[index];
    const before = groups[index + 1];
    slots.push({
      afterGroupId: after.id,
      afterGroupName: after.name,
      beforeGroupId: before.id,
      beforeGroupName: before.name,
      renderIndex: index,
    });
  }
  return Object.freeze(slots.map((slot) => Object.freeze({ ...slot })));
}

export function assertVNIAdjacentLayerGroupSlot(
  project: V5GProjectConfig,
  afterGroupId: string,
  beforeGroupId: string,
): VNILayerGroupSlot {
  const slots = getVNIProjectLayerGroupSlots(project);
  const slot = slots.find(
    (candidate) =>
      candidate.afterGroupId === afterGroupId &&
      candidate.beforeGroupId === beforeGroupId,
  );
  if (slot) return slot;

  const groupIds = new Set(project.layerGroups.map((group) => group.id));
  if (!groupIds.has(afterGroupId)) {
    throw new Error(`Unknown VNI layer group: ${afterGroupId}.`);
  }
  if (!groupIds.has(beforeGroupId)) {
    throw new Error(`Unknown VNI layer group: ${beforeGroupId}.`);
  }
  throw new Error(
    `VNI layer groups are not adjacent in render order: ${afterGroupId} -> ${beforeGroupId}.`,
  );
}
