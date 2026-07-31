import type { Node, SpriteFrame } from "cc";
import { createCocosNodeDriver } from "./cocos-node-driver.js";
import { V5GCocosPlayer } from "./player.js";
import type { V5GCocosPlayerFactoryOptions } from "./types.js";

export * from "./types.js";
export * from "./node-driver.js";
export * from "./blend-mode.js";
export * from "./coordinates.js";
export * from "./manual-playback.js";
export * from "./player-pool.js";
export {
  createCocosNodeDriver,
  type CocosNodeDriverOptions,
} from "./cocos-node-driver.js";
export { V5GCocosPlayer } from "./player.js";

export function createV5GCocosPlayer(
  options: V5GCocosPlayerFactoryOptions,
): V5GCocosPlayer<Node, SpriteFrame> {
  return new V5GCocosPlayer({
    root: options.root,
    project: options.project,
    assets: options.assets,
    driver: createCocosNodeDriver({
      screenMaterial: options.screenMaterial,
    }),
    loop: options.loop,
    onTimeChange: options.onTimeChange,
    onPlayingChange: options.onPlayingChange,
  });
}
