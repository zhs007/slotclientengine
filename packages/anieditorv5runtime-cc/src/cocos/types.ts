import type { Node, SpriteFrame } from "cc";
import type { VNILayerGroupSlot } from "../core/layer-groups.js";
import type { V5GBlendMode, V5GProjectConfig } from "../core/types.js";
import type {
  V5GPlaybackMode,
  V5GPlaybackPoint,
  V5GPlaybackRange,
  V5GPlaybackState,
  V5GPlayOptions,
  V5GPlayRangeOptions,
  V5GSegmentedPlaybackOptions,
  V5GSegmentedPlaybackPhase,
} from "../core/playback-sequence.js";
import type { V5GCocosNodeDriver } from "./node-driver.js";

export interface V5GCocosAssetResolver<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(assetPath: string, assetId: string): TSpriteFrame | null;
}

export interface V5GCocosSpriteAtlasLike<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(name: string): TSpriteFrame | null;
}

export interface V5GCocosSpriteAtlasAssetSource<TSpriteFrame = SpriteFrame> {
  atlas: V5GCocosSpriteAtlasLike<TSpriteFrame>;
}

export type V5GCocosAssetSource<TSpriteFrame = SpriteFrame> =
  | V5GCocosAssetResolver<TSpriteFrame>
  | V5GCocosSpriteAtlasAssetSource<TSpriteFrame>;

export interface V5GCocosPlayerOptions<
  TNode = Node,
  TSpriteFrame = SpriteFrame,
> {
  root: TNode;
  project: V5GProjectConfig;
  assets: V5GCocosAssetSource<TSpriteFrame>;
  driver: V5GCocosNodeDriver<TNode, TSpriteFrame>;
  loop?: boolean;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export type V5GCocosPlayerFactoryOptions = Omit<
  V5GCocosPlayerOptions<Node, SpriteFrame>,
  "driver"
>;

export type V5GCocosPlaybackRange = V5GPlaybackRange;

export type V5GCocosPlayRangeOptions = V5GPlayRangeOptions;

export type V5GCocosPlaybackPoint = V5GPlaybackPoint;

export type V5GCocosPlaybackMode = V5GPlaybackMode;

export type V5GCocosSegmentedPlaybackPhase = V5GSegmentedPlaybackPhase;

export type V5GCocosSegmentedPlaybackOptions = V5GSegmentedPlaybackOptions;

export type V5GCocosPlayOptions = V5GPlayOptions;

export type V5GCocosPlaybackState = V5GPlaybackState;

export interface V5GCocosLayerGroupInfo {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  layerIds: readonly string[];
  renderIndex: number;
}

export type V5GCocosLayerGroupSlot = VNILayerGroupSlot;

export interface V5GCocosAttachNodeBetweenLayerGroupsOptions<TNode = Node> {
  id?: string;
  ids?: readonly string[];
  afterGroupId: string;
  beforeGroupId: string;
  node?: TNode;
  nodes?: readonly TNode[];
  destroyOnDetach?: boolean;
}

export interface V5GCocosAttachProjectAssetBetweenLayerGroupsOptions {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  assetId: string;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GBlendMode;
  destroyOnDetach?: boolean;
}

export interface V5GCocosAttachSpriteFrameBetweenLayerGroupsOptions<
  TSpriteFrame = SpriteFrame,
> {
  id: string;
  afterGroupId: string;
  beforeGroupId: string;
  spriteFrame: TSpriteFrame;
  width: number;
  height: number;
  x?: number;
  y?: number;
  scaleX?: number;
  scaleY?: number;
  rotation?: number;
  anchorX?: number;
  anchorY?: number;
  opacity?: number;
  blendMode?: V5GBlendMode;
  destroyOnDetach?: boolean;
}

export interface V5GCocosPlaybackEventContext {
  id: string;
  time: number;
  previousTime: number;
  currentTime: number;
  loopIndex: number;
}

export interface V5GCocosPlaybackEventOptions {
  id: string;
  at: V5GCocosPlaybackPoint;
  once?: boolean;
  listener: (event: V5GCocosPlaybackEventContext) => void;
}

export interface V5GCocosPlaybackCompleteContext {
  startTime: number;
  endTime: number;
  currentTime: number;
  loopIndex: number;
}
