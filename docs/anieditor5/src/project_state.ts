import {
  COCOS_TARGET_VERSION,
  DEFAULT_BACKGROUND_COLOR,
  DEFAULT_DURATION_SECONDS,
  DEFAULT_STAGE_HEIGHT,
  DEFAULT_STAGE_WIDTH,
  TOOL_NAME,
  VNI_VERSION,
} from "./constants";
import type {
  V5GAssetConfig,
  V5GEditorState,
  V5GLayerConfig,
  V5GLayerGroupConfig,
  V5GProjectConfig,
  V5GRuntimeAsset,
} from "./types";

export const DEFAULT_LAYER_GROUP_ID = "group_default";
export const DEFAULT_SEQUENCE_FRAME_SECONDS = 0.1;

let idCounter = 1;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createDefaultLayerGroup(
  order = 0,
  name = "默认组",
): V5GLayerGroupConfig {
  return {
    id:
      order === 0 && name === "默认组"
        ? DEFAULT_LAYER_GROUP_ID
        : createId("layer_group"),
    name,
    visible: true,
    collapsed: false,
    order,
  };
}

export function createDefaultProject(): V5GProjectConfig {
  const defaultGroup = createDefaultLayerGroup();
  const defaultLayer = createTextLayer("胜利！", 0, 110);
  defaultLayer.groupId = defaultGroup.id;
  return {
    schemaVersion: VNI_VERSION,
    editor: {
      name: TOOL_NAME,
      version: VNI_VERSION,
    },
    engineTarget: {
      name: "cocos_creator",
      version: COCOS_TARGET_VERSION,
    },
    name: "VictoryAnimation",
    maskCompositeMode: "precompose_light_alpha",
    stage: {
      width: DEFAULT_STAGE_WIDTH,
      height: DEFAULT_STAGE_HEIGHT,
      coordinate: "center",
      duration: DEFAULT_DURATION_SECONDS,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
    },
    assets: [],
    layerGroups: [defaultGroup],
    layers: [defaultLayer],
    particles: [],
  };
}

export function createInitialEditorState(): V5GEditorState {
  const project = createDefaultProject();
  return {
    project,
    runtimeAssets: [],
    selectedLayerId: project.layers[0]?.id ?? null,
    isPlaying: false,
    playheadSeconds: 0,
    showSelectionOutline: true,
    temporarySoloLayerId: null,
    previewLayers: {},
  };
}

export function createTextLayer(text: string, x = 0, y = 0): V5GLayerConfig {
  return {
    id: createId("layer_text"),
    name: text,
    type: "text",
    assetId: null,
    parentId: null,
    groupId: DEFAULT_LAYER_GROUP_ID,
    visible: true,
    locked: false,
    transform: {
      x,
      y,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: 1,
    blendMode: "normal",
    text,
    animations: [],
    keyframes: [],
  };
}

export function createImageAsset(
  file: File,
  width: number,
  height: number,
): V5GAssetConfig {
  const ext = getExtension(file.name);
  const id = createId("asset_image");
  return {
    id,
    type: "image",
    path: `assets/${sanitizeBaseName(file.name)}_${id}.${ext}`,
    originalName: file.name,
    width,
    height,
    fileWidth: width,
    fileHeight: height,
    fileScale: 1,
  };
}

export function createRuntimeAsset(
  assetId: string,
  file: File,
): V5GRuntimeAsset {
  return {
    id: assetId,
    file,
    objectUrl: URL.createObjectURL(file),
  };
}

export function createImageLayer(asset: V5GAssetConfig): V5GLayerConfig {
  return {
    id: createId("layer_image"),
    name: asset.originalName,
    type: "image",
    assetId: asset.id,
    parentId: null,
    groupId: DEFAULT_LAYER_GROUP_ID,
    visible: true,
    locked: false,
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: 1,
    blendMode: "normal",
    animations: [],
    keyframes: [],
  };
}

export function createSequenceLayer(
  name: string,
  frameAssetIds: string[],
  cycleDuration = frameAssetIds.length * DEFAULT_SEQUENCE_FRAME_SECONDS,
  loop = true,
): V5GLayerConfig {
  return {
    id: createId("layer_sequence"),
    name,
    type: "sequence",
    assetId: null,
    parentId: null,
    groupId: DEFAULT_LAYER_GROUP_ID,
    visible: true,
    locked: false,
    transform: {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: 1,
    blendMode: "normal",
    sequence: {
      frameAssetIds: [...frameAssetIds],
      cycleDuration: sanitizeSequenceDuration(
        cycleDuration,
        frameAssetIds.length,
      ),
      loop,
    },
    animations: [],
    keyframes: [],
  };
}

export function getSelectedLayer(state: V5GEditorState): V5GLayerConfig | null {
  return (
    state.project.layers.find((layer) => layer.id === state.selectedLayerId) ??
    null
  );
}

export function sanitizeSequenceDuration(
  value: number,
  frameCount: number,
  fallback = Math.max(1, frameCount) * DEFAULT_SEQUENCE_FRAME_SECONDS,
  minFrameSeconds = 0.01,
  maxDuration = 3600,
): number {
  const minDuration = Math.max(
    minFrameSeconds,
    Math.max(1, frameCount) * minFrameSeconds,
  );
  if (!Number.isFinite(value) || value <= 0) {
    return Math.min(maxDuration, Math.max(minDuration, fallback));
  }
  return Math.min(maxDuration, Math.max(minDuration, value));
}

export function normalizeProjectSequences(project: V5GProjectConfig): void {
  const assetIds = new Set(project.assets.map((asset) => asset.id));
  for (const layer of project.layers) {
    if (layer.type !== "sequence") {
      if (layer.sequence) delete layer.sequence;
      continue;
    }
    const rawFrameAssetIds = Array.isArray(layer.sequence?.frameAssetIds)
      ? layer.sequence.frameAssetIds
      : layer.assetId
        ? [layer.assetId]
        : [];
    const frameAssetIds = rawFrameAssetIds.filter(
      (assetId): assetId is string =>
        typeof assetId === "string" && assetIds.has(assetId),
    );
    layer.assetId = null;
    layer.text = undefined;
    layer.sequence = {
      frameAssetIds,
      cycleDuration: sanitizeSequenceDuration(
        Number(layer.sequence?.cycleDuration),
        frameAssetIds.length,
      ),
      loop: layer.sequence?.loop !== false,
    };
  }
}

export function normalizeProjectLayerGroups(project: V5GProjectConfig): void {
  const rawGroups = Array.isArray(project.layerGroups)
    ? project.layerGroups
    : [];
  const normalizedGroups: V5GLayerGroupConfig[] = [];
  const seenGroupIds = new Set<string>();

  for (const [index, group] of rawGroups.entries()) {
    const id = sanitizeGroupId(group.id) || createId("layer_group");
    if (seenGroupIds.has(id)) continue;
    seenGroupIds.add(id);
    normalizedGroups.push({
      id,
      name: String(group.name || `分组 ${index + 1}`),
      visible: group.visible !== false,
      collapsed: group.collapsed === true,
      order: Number.isFinite(group.order) ? group.order : index,
    });
  }

  if (normalizedGroups.length === 0) {
    normalizedGroups.push(createDefaultLayerGroup());
  }

  if (!normalizedGroups.some((group) => group.id === DEFAULT_LAYER_GROUP_ID)) {
    normalizedGroups.unshift({
      id: DEFAULT_LAYER_GROUP_ID,
      name: "默认组",
      visible: true,
      collapsed: false,
      order: Math.min(-1, ...normalizedGroups.map((group) => group.order - 1)),
    });
  }

  normalizedGroups.sort((left, right) => left.order - right.order);
  normalizedGroups.forEach((group, index) => {
    group.order = index;
  });

  const validGroupIds = new Set(normalizedGroups.map((group) => group.id));
  for (const layer of project.layers) {
    if (!layer.groupId || !validGroupIds.has(layer.groupId)) {
      layer.groupId = DEFAULT_LAYER_GROUP_ID;
    }
  }

  project.layerGroups = normalizedGroups;
}

export function getLayerGroup(
  project: V5GProjectConfig,
  groupId: string | undefined,
): V5GLayerGroupConfig | null {
  return project.layerGroups.find((group) => group.id === groupId) ?? null;
}

export function isLayerEffectivelyVisible(
  project: V5GProjectConfig,
  layer: V5GLayerConfig,
  options: { ignoreMaskSourcePreference?: boolean } = {},
): boolean {
  const group = getLayerGroup(project, layer.groupId);
  if (!layer.visible || group?.visible === false) return false;
  if (options.ignoreMaskSourcePreference) return true;
  return !isLayerHiddenByMaskSourcePreference(project, layer.id);
}

export function normalizeProjectMasks(project: V5GProjectConfig): void {
  const layerIds = new Set(project.layers.map((layer) => layer.id));
  for (const layer of project.layers) {
    const mask = layer.mask;
    if (!mask) continue;
    const sourceLayerId =
      typeof mask.sourceLayerId === "string" ? mask.sourceLayerId : null;
    const hasValidSource =
      sourceLayerId !== null &&
      sourceLayerId !== layer.id &&
      layerIds.has(sourceLayerId);
    layer.mask = {
      enabled: mask.enabled === true && hasValidSource,
      sourceLayerId: hasValidSource ? sourceLayerId : null,
      mode: "alpha",
      compositeMode:
        mask.compositeMode === "legacy_alpha"
          ? "legacy_alpha"
          : "precompose_light_alpha",
      showSourceLayer: mask.showSourceLayer !== false,
    };
  }
}

export function getLayerMaskSource(
  project: V5GProjectConfig,
  layer: V5GLayerConfig,
): V5GLayerConfig | null {
  const sourceLayerId = layer.mask?.enabled ? layer.mask.sourceLayerId : null;
  if (!sourceLayerId || sourceLayerId === layer.id) return null;
  return (
    project.layers.find((candidate) => candidate.id === sourceLayerId) ?? null
  );
}

export function isLayerHiddenByMaskSourcePreference(
  project: V5GProjectConfig,
  layerId: string,
): boolean {
  return project.layers.some((layer) => {
    if (layer.id === layerId) return false;
    if (!layer.mask?.enabled || layer.mask.sourceLayerId !== layerId) {
      return false;
    }
    if (layer.mask.showSourceLayer !== false) return false;
    return isLayerEffectivelyVisible(project, layer, {
      ignoreMaskSourcePreference: true,
    });
  });
}

export type V5GExportProjectPurpose = "editing" | "runtime";

export function toExportProject(
  project: V5GProjectConfig,
  purpose: V5GExportProjectPurpose = "runtime",
): V5GProjectConfig {
  const cloned = JSON.parse(JSON.stringify(project)) as V5GProjectConfig;
  normalizeProjectLayerGroups(cloned);
  normalizeProjectMasks(cloned);
  normalizeProjectSequences(cloned);

  if (purpose === "editing") {
    return cloned;
  }

  const initiallyVisibleLayers = cloned.layers.filter((layer) =>
    isLayerEffectivelyVisible(cloned, layer),
  );
  const runtimeLayerIds = new Set(
    initiallyVisibleLayers.map((layer) => layer.id),
  );
  for (const layer of initiallyVisibleLayers) {
    const source = getLayerMaskSource(cloned, layer);
    if (source) runtimeLayerIds.add(source.id);
  }
  const visibleLayers = cloned.layers.filter((layer) =>
    runtimeLayerIds.has(layer.id),
  );
  for (const layer of visibleLayers) {
    if (isLayerHiddenByMaskSourcePreference(cloned, layer.id)) {
      layer.visible = false;
    }
  }
  const exportedGroupIds = new Set(
    visibleLayers.map((layer) => layer.groupId ?? DEFAULT_LAYER_GROUP_ID),
  );
  cloned.layerGroups = cloned.layerGroups
    .filter((group) => exportedGroupIds.has(group.id))
    .map((group, index) => ({ ...group, collapsed: false, order: index }));
  const referencedAssetIds = new Set<string>();
  for (const layer of visibleLayers) {
    if (layer.assetId) referencedAssetIds.add(layer.assetId);
    for (const frameAssetId of layer.sequence?.frameAssetIds ?? []) {
      referencedAssetIds.add(frameAssetId);
    }
  }
  for (const particle of cloned.particles) {
    if (particle.assetId) referencedAssetIds.add(particle.assetId);
  }
  cloned.assets = cloned.assets.filter((asset) =>
    referencedAssetIds.has(asset.id),
  );
  cloned.layers = visibleLayers;
  return cloned;
}

function sanitizeGroupId(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
}

function getExtension(filename: string): string {
  const match = filename.toLowerCase().match(/\.([a-z0-9]+)$/);
  if (!match) return "png";
  const ext = match[1];
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return ext;
  return "png";
}

function sanitizeBaseName(filename: string): string {
  const withoutExt = filename.replace(/\.[^.]+$/, "");
  const safe = withoutExt
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return safe || "image";
}
