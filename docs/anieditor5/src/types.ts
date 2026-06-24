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
  /** Design-time logical width. Keep this as the original full-size asset width. */
  width: number;
  /** Design-time logical height. Keep this as the original full-size asset height. */
  height: number;
  /** Actual pixel width of the file stored in the current ZIP/runtime asset. */
  fileWidth?: number;
  /** Actual pixel height of the file stored in the current ZIP/runtime asset. */
  fileHeight?: number;
  /** Current file pixels divided by design pixels. 1 = full quality, 0.5 = half-size file. */
  fileScale?: number;
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
  | "shatter"
  | "glow"
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

export interface V5GLayerConfig {
  id: string;
  name: string;
  type: V5GLayerType;
  assetId: string | null;
  parentId: string | null;
  /** Export/runtime layer group. Missing values are normalized to the default group. */
  groupId?: string;
  visible: boolean;
  locked: boolean;
  transform: V5GTransformConfig;
  opacity: number;
  blendMode: V5GBlendMode;
  text?: string;
  animations: V5GAnimationConfig[];
  keyframes?: V5GLayerKeyframeConfig[];
}

export interface V5GLayerGroupConfig {
  id: string;
  name: string;
  /** Group-level visibility. Hidden groups are hidden on canvas and skipped on export. */
  visible: boolean;
  /** Editor-only collapsed state for the layer list. */
  collapsed: boolean;
  /** Display/export ordering for group headers. */
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
  params: Record<string, string | number | boolean>;
}

export interface V5GExportProfileConfig {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  label?: string;
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

export interface V5GBundleManifestEntry {
  id: string;
  purpose: "editing" | "runtime";
  assetScale: number;
  path: string;
  label?: string;
}

export interface V5GBundleManifest {
  type: "vni_export_bundle";
  version: string;
  exports: V5GBundleManifestEntry[];
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
