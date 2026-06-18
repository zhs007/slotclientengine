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
  V5GProjectConfig,
  V5GRuntimeAsset,
} from "./types";

let idCounter = 1;

export function createId(prefix: string): string {
  idCounter += 1;
  return `${prefix}_${Date.now().toString(36)}_${idCounter.toString(36)}`;
}

export function createDefaultProject(): V5GProjectConfig {
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
    stage: {
      width: DEFAULT_STAGE_WIDTH,
      height: DEFAULT_STAGE_HEIGHT,
      coordinate: "center",
      duration: DEFAULT_DURATION_SECONDS,
      backgroundColor: DEFAULT_BACKGROUND_COLOR,
    },
    assets: [],
    layers: [createTextLayer("胜利！", 0, 110)],
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

export function getSelectedLayer(state: V5GEditorState): V5GLayerConfig | null {
  return (
    state.project.layers.find((layer) => layer.id === state.selectedLayerId) ??
    null
  );
}

export function toExportProject(project: V5GProjectConfig): V5GProjectConfig {
  return JSON.parse(JSON.stringify(project)) as V5GProjectConfig;
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
