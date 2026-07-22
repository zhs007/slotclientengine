import { createLeoSlotGameUiStore } from "../src/store.js";
import { createState } from "./test-helpers.js";

describe("Leo slot UI store", () => {
  it("stores only the latest snapshot with isolated idempotent subscriptions", () => {
    const initial = createState();
    const next = createState({ balance: 321 });
    const store = createLeoSlotGameUiStore(initial);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);

    store.update(initial);
    expect(listener).not.toHaveBeenCalled();
    store.update(next);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(store.getSnapshot()).toBe(next);
    unsubscribe();
    unsubscribe();
    store.update(createState({ balance: 654 }));
    expect(listener).toHaveBeenCalledTimes(1);

    store.destroy();
    store.destroy();
    const afterDestroy = createState({ balance: 999 });
    store.update(afterDestroy);
    expect(store.getSnapshot()).not.toBe(afterDestroy);
    expect(store.subscribe(listener)()).toBeUndefined();
  });
});
