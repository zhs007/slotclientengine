export type V5GCoordinateMode = "center";
export type V5GLayerType = "image" | "text" | "group";
export type V5GAssetType = "image";
export type V5GBlendMode = "normal" | "add" | "screen" | "multiply" | "lighten";

export interface V5GStageConfig {
  width: number;
  height: number;
  coordinate: V5GCoordinateMode;
  duration: number;
  backgroundColor: string;
}

export interface V5GAssetConfig {
  id: string;
  type: V5GAssetType;
  path: string;
  originalName: string;
  width: number;
  height: number;
}

export interface V5GTransformConfig {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  anchorX: number;
  anchorY: number;
}

export type V5GAnimationType =
  | "move"
  | "fade"
  | "scale_up"
  | "scale_down"
  | "rotate"
  | "slide_in"
  | "slide_out"
  | "bounce_in"
  | "pulse"
  | "float"
  | "swing";
export type V5GAnimationParamValue = string | number | boolean;

export interface V5GAnimationConfig {
  id: string;
  type: V5GAnimationType;
  name?: string;
  startTime: number;
  duration: number;
  enabled: boolean;
  seed: number;
  params: Record<string, V5GAnimationParamValue>;
}

export interface V5GLayerKeyframeConfig {
  id: string;
  time: number;
  transform: V5GTransformConfig;
  opacity: number;
  easing: "linear";
}

export interface V5GLayerConfig {
  id: string;
  name: string;
  type: V5GLayerType;
  assetId: string | null;
  parentId: string | null;
  visible: boolean;
  locked: boolean;
  transform: V5GTransformConfig;
  opacity: number;
  blendMode: V5GBlendMode;
  text?: string;
  animations: V5GAnimationConfig[];
  keyframes?: V5GLayerKeyframeConfig[];
}

export interface V5GParticleConfig {
  id: string;
  name: string;
  assetId: string | null;
  startTime: number;
  duration: number;
  seed: number;
  emitter: {
    x: number;
    y: number;
    type: "burst" | "rain" | "trail";
    count: number;
    radius: number;
  };
  params: Record<string, string | number | boolean>;
}

export interface V5GProjectConfig {
  schemaVersion: string;
  editor: {
    name: string;
    version: string;
  };
  engineTarget: {
    name: "cocos_creator";
    version: string;
  };
  name: string;
  stage: V5GStageConfig;
  assets: V5GAssetConfig[];
  layers: V5GLayerConfig[];
  particles: V5GParticleConfig[];
}

export interface V5GRuntimeAsset {
  id: string;
  file: File;
  objectUrl: string;
}

export interface V5GViewportState {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export interface V5GPreviewLayerState {
  transform: V5GTransformConfig;
  opacity: number;
}

export interface V5GEditorState {
  project: V5GProjectConfig;
  runtimeAssets: V5GRuntimeAsset[];
  selectedLayerId: string | null;
  isPlaying: boolean;
  playheadSeconds: number;
  previewLayers?: Record<string, V5GPreviewLayerState>;
}
