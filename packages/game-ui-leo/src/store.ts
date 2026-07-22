import type { SlotGameStateSnapshot } from "@slotclientengine/gameframeworks";

export interface LeoSlotGameUiStore {
  getSnapshot(): SlotGameStateSnapshot;
  subscribe(listener: () => void): () => void;
  update(snapshot: SlotGameStateSnapshot): void;
  destroy(): void;
}

export function createLeoSlotGameUiStore(
  initialSnapshot: SlotGameStateSnapshot,
): LeoSlotGameUiStore {
  let snapshot = initialSnapshot;
  let destroyed = false;
  const listeners = new Set<() => void>();

  return Object.freeze({
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      if (destroyed) return () => undefined;
      listeners.add(listener);
      let subscribed = true;
      return () => {
        if (!subscribed) return;
        subscribed = false;
        listeners.delete(listener);
      };
    },
    update(nextSnapshot: SlotGameStateSnapshot): void {
      if (destroyed || Object.is(snapshot, nextSnapshot)) return;
      snapshot = nextSnapshot;
      for (const listener of listeners) listener();
    },
    destroy(): void {
      if (destroyed) return;
      destroyed = true;
      listeners.clear();
    },
  });
}
