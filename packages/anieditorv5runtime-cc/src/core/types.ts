export type V5GCoordinateMode = "center";
export type V5GLayerType = "image" | "text" | "group" | "sequence";
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
  | "multi_move"
  | "fade"
  | "scale_up"
  | "scale_down"
  | "scale_in"
  | "scale_out"
  | "pop"
  | "bounce_jump"
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
  | "gather_particles"
  | "smoke_mist"
  | "energy_ring"
  | "slash_light"
  | "flame_flicker"
  | "wave_band"
  | "wave_distort"
  | "speed_lines"
  | "drift_fall"
  | "path_particles"
  | "shatter"
  | "glow"
  | "safe_glow"
  | "squash_stretch"
  | "card_carousel_3d";

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

export type V5GBasicAnimationEasing =
  | "linear"
  | "easeInQuad"
  | "easeOutQuad"
  | "easeInOutQuad"
  | "backOut";

export interface V5GBasicAnimationPointConfig {
  id: string;
  time: number;
  value: number;
  easing: V5GBasicAnimationEasing;
}

export interface V5GBasicAnimationTrackConfig {
  enabled: boolean;
  points: V5GBasicAnimationPointConfig[];
}

export interface V5GBasicAnimationConfig {
  opacity: V5GBasicAnimationTrackConfig;
  positionX: V5GBasicAnimationTrackConfig;
  positionY: V5GBasicAnimationTrackConfig;
  scaleX: V5GBasicAnimationTrackConfig;
  scaleY: V5GBasicAnimationTrackConfig;
  rotation: V5GBasicAnimationTrackConfig;
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

export interface V5GSequenceConfig {
  frameAssetIds: string[];
  cycleDuration: number;
  loop: boolean;
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
  sequence?: V5GSequenceConfig;
  mask?: V5GLayerMaskConfig;
  animations: V5GAnimationConfig[];
  basicAnimation?: V5GBasicAnimationConfig;
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
  maskCompositeMode?: V5GMaskCompositeMode;
  exportProfile?: V5GExportProfileConfig;
  stage: V5GStageConfig;
  assets: V5GAssetConfig[];
  layerGroups: V5GLayerGroupConfig[];
  layers: V5GLayerConfig[];
  particles: V5GParticleConfig[];
}

export type VNICoordinateMode = V5GCoordinateMode;
export type VNILayerType = V5GLayerType;
export type VNIAssetType = V5GAssetType;
export type VNIBlendMode = V5GBlendMode;
export type VNIStageConfig = V5GStageConfig;
export type VNIAssetConfig = V5GAssetConfig;
export type VNIExportProfileConfig = V5GExportProfileConfig;
export type VNITransformConfig = V5GTransformConfig;
export type VNIAnimationType = V5GAnimationType;
export type VNIAnimationParamValue = V5GAnimationParamValue;
export type VNIAnimationConfig = V5GAnimationConfig;
export type VNIBasicAnimationEasing = V5GBasicAnimationEasing;
export type VNIBasicAnimationPointConfig = V5GBasicAnimationPointConfig;
export type VNIBasicAnimationTrackConfig = V5GBasicAnimationTrackConfig;
export type VNIBasicAnimationConfig = V5GBasicAnimationConfig;
export type VNILayerKeyframeConfig = V5GLayerKeyframeConfig;
export type VNILayerMaskConfig = V5GLayerMaskConfig;
export type VNIMaskCompositeMode = V5GMaskCompositeMode;
export type VNISequenceConfig = V5GSequenceConfig;
export type VNILayerConfig = V5GLayerConfig;
export type VNILayerGroupConfig = V5GLayerGroupConfig;
export type VNIParticleConfig = V5GParticleConfig;
export type VNIProjectConfig = V5GProjectConfig;
