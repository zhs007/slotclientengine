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
