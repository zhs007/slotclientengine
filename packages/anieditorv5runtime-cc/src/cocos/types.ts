import type { Node, SpriteFrame } from "cc";
import type { V5GProjectConfig } from "../core/types.js";
import type { V5GCocosNodeDriver } from "./node-driver.js";

export interface V5GCocosAssetResolver<TSpriteFrame = SpriteFrame> {
  getSpriteFrame(assetPath: string, assetId: string): TSpriteFrame | null;
}

export interface V5GCocosPlayerOptions<
  TNode = Node,
  TSpriteFrame = SpriteFrame,
> {
  root: TNode;
  project: V5GProjectConfig;
  assets: V5GCocosAssetResolver<TSpriteFrame>;
  driver: V5GCocosNodeDriver<TNode, TSpriteFrame>;
  loop?: boolean;
  onTimeChange?: (time: number) => void;
  onPlayingChange?: (isPlaying: boolean) => void;
}

export type V5GCocosPlayerFactoryOptions = Omit<
  V5GCocosPlayerOptions<Node, SpriteFrame>,
  "driver"
>;

export type V5GCocosPlaybackRange =
  | { unit: "time"; start: number; end: number }
  | { unit: "frame"; start: number; end: number; fps: number };

export interface V5GCocosPlayRangeOptions {
  range: V5GCocosPlaybackRange;
  loop?: boolean;
}

export type V5GCocosPlaybackPoint =
  | { unit: "time"; at: number }
  | { unit: "frame"; at: number; fps: number };

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
