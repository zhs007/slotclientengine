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
  | "particle_stream"
  | "particle_twinkle"
  | "particle_wall"
  | "particle_combo"
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
  | "chaser_light";
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
  /** Layer id used as alpha-mask source. The source layer gets a separate hidden mask clone in preview/runtime. */
  sourceLayerId: string | null;
  mode: "alpha";
  /**
   * Cross-engine mask composition semantics.
   * - precompose_light_alpha: PIXI light-friendly default; remove black by luminance, then multiply by source alpha.
   * - legacy_alpha: Cocos-compatible native alpha mask mode.
   */
  compositeMode: V5GMaskCompositeMode;
  /** Convenience visibility flag for the source layer itself when it is used as this layer's mask. */
  showSourceLayer: boolean;
}

export interface V5GSequenceConfig {
  /** Ordered frame asset ids. Frames are assets, not independent editable layers. */
  frameAssetIds: string[];
  /** Seconds for one full sequence pass. */
  cycleDuration: number;
  /** Whether the internal frame playback loops while the layer is visible. */
  loop: boolean;
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
  mask?: V5GLayerMaskConfig;
  text?: string;
  /** Sequence-frame module data. Present only when type === "sequence". */
  sequence?: V5GSequenceConfig;
  animations: V5GAnimationConfig[];
  keyframes?: V5GLayerKeyframeConfig[];
}

export interface V5GLayerGroupConfig {
  id: string;
  name: string;
  /** Group-level visibility. Hidden groups are hidden on canvas; runtime export skips them, editing export preserves them. */
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
  /** Project-level preferred mask composite mode. Missing old projects are inferred from existing masks. */
  maskCompositeMode?: V5GMaskCompositeMode;
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
  showSelectionOutline: boolean;
  /** Editor-only temporary preview: while dragging in layer list, show only this layer's base asset/text without changing project data. */
  temporarySoloLayerId?: string | null;
  previewLayers?: Record<string, V5GPreviewLayerState>;
}
