import { createCocosNodeDriver } from "./cocos-node-driver.js";
import { V5GCocosPlayer } from "./player.js";
import type { V5GCocosPlayerFactoryOptions } from "./types.js";

export * from "./types.js";
export * from "./node-driver.js";
export * from "./blend-mode.js";
export * from "./coordinates.js";
export { createCocosNodeDriver } from "./cocos-node-driver.js";
export { V5GCocosPlayer } from "./player.js";

export function createV5GCocosPlayer(
  options: V5GCocosPlayerFactoryOptions,
): V5GCocosPlayer<
  V5GCocosPlayerFactoryOptions["root"],
  NonNullable<
    ReturnType<V5GCocosPlayerFactoryOptions["assets"]["getSpriteFrame"]>
  >
> {
  return new V5GCocosPlayer({
    ...options,
    driver: createCocosNodeDriver(),
  });
}
