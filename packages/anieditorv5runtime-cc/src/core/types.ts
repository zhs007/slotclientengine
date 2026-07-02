export type V5GCoordinateMode = "center";
export type V5GLayerType = "image" | "text" | "group";
export type V5GAssetType = "image";
export type V5GBlendMode = "normal" | "add" | "screen" | "multiply" | "lighten";
export type V5GMaskCompositeMode = "legacy_alpha" | "precompose_light_alpha";

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
  fileWidth?: number;
  fileHeight?: number;
  fileScale?: number;
}

export interface V5GExportProfileConfig {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  label?: string;
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
  | "idle"
  | "move"
  | "fade"
  | "scale_up"
  | "scale_down"
  | "scale_in"
  | "scale_out"
  | "pop"
  | "shake"
  | "blink"
  | "rotate"
  | "slide_in"
  | "slide_out"
  | "bounce_in"
  | "pulse"
  | "float"
  | "swing"
  | "particles"
  | "particle_twinkle"
  | "particle_wall"
  | "particle_combo"
  | "particle_stream"
  | "chaser_light"
  | "shatter"
  | "glow"
  | "safe_glow"
  | "squash_stretch";

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

export interface V5GLayerMaskConfig {
  enabled: boolean;
  sourceLayerId: string | null;
  mode: "alpha";
  compositeMode: V5GMaskCompositeMode;
  showSourceLayer: boolean;
}

export interface V5GLayerConfig {
  id: string;
  name: string;
  type: V5GLayerType;
  assetId: string | null;
  parentId: string | null;
  groupId?: string;
  visible: boolean;
  locked: boolean;
  transform: V5GTransformConfig;
  opacity: number;
  blendMode: V5GBlendMode;
  text?: string;
  mask?: V5GLayerMaskConfig;
  animations: V5GAnimationConfig[];
  keyframes?: V5GLayerKeyframeConfig[];
}

export interface V5GLayerGroupConfig {
  id: string;
  name: string;
  visible: boolean;
  collapsed: boolean;
  order: number;
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
  params: Record<string, V5GAnimationParamValue>;
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
  exportProfile?: V5GExportProfileConfig;
  stage: V5GStageConfig;
  assets: V5GAssetConfig[];
  layerGroups: V5GLayerGroupConfig[];
  layers: V5GLayerConfig[];
  particles: V5GParticleConfig[];
}
