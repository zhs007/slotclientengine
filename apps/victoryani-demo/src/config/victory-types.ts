export type AnimParamValue = string | number | boolean | null;
export type AnimParams = Record<string, AnimParamValue>;

export interface VictoryAnimationConfigRaw {
  type: string;
  startTime?: number;
  duration?: number;
  script?: string;
  params?: AnimParams;
  showParams?: boolean;
}

export interface VictoryLayerConfigRaw {
  id?: string;
  type?: "pic" | "font";
  asset?: string;
  text?: string;
  x?: number;
  y?: number;
  scale?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  alpha?: number;
  blendMode?: string;
  visible?: boolean;
  locked?: boolean;
  maskId?: string | null;
  animations?: VictoryAnimationConfigRaw[];
}

export interface VictoryProjectConfigRaw {
  version?: string;
  name?: string;
  duration?: number;
  layers?: VictoryLayerConfigRaw[];
}

export interface VictoryAnimationConfig {
  type: string;
  startTime: number;
  duration: number;
  script?: string;
  params: AnimParams;
  showParams?: boolean;
}

export interface VictoryLayerConfig {
  id: string;
  type: "pic" | "font";
  asset: string;
  sourceAsset: string;
  text?: string;
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number;
  alpha: number;
  blendMode: string;
  visible: boolean;
  locked: boolean;
  maskId?: string | null;
  animations: VictoryAnimationConfig[];
}

export interface VictoryProjectConfig {
  version: string;
  name: string;
  duration: number;
  width: number;
  height: number;
  layers: VictoryLayerConfig[];
}

export type AnimationSupportStatus = "supported" | "implemented-not-used" | "unsupported";

export interface AnimationSupportEntry {
  type: string;
  status: AnimationSupportStatus;
  note: string;
}