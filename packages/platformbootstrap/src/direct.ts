import type {
  SlotPlatformBootstrapHandle,
  SlotPlatformBootstrapProvider,
  SlotPlatformBootstrapSnapshot,
} from "./types.js";
import {
  createSlotPlatformBootstrapSnapshot,
  throwIfAborted,
} from "./validation.js";

export function createDirectPlatformBootstrapProvider(
  snapshot: SlotPlatformBootstrapSnapshot,
): SlotPlatformBootstrapProvider {
  const source = createSlotPlatformBootstrapSnapshot(snapshot);
  return Object.freeze({
    async prepare(signal: AbortSignal): Promise<SlotPlatformBootstrapHandle> {
      throwIfAborted(signal);
      await Promise.resolve();
      throwIfAborted(signal);
      let destroyed = false;
      return Object.freeze({
        snapshot: createSlotPlatformBootstrapSnapshot(source),
        destroy(): void {
          if (destroyed) return;
          destroyed = true;
        },
      });
    },
  });
}
