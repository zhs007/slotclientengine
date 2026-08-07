import { describe, expect, it, vi } from "vitest";
import {
  bindPopupInteractionInput,
  handledPopupInteraction,
  unhandledPopupInteraction,
} from "../../src/popup/index.js";

describe("Popup interaction input binding", () => {
  it("consumes handled canvas and keyboard input exactly once", () => {
    const canvas = new EventTarget();
    const keyboard = new EventTarget();
    const dispatch = vi.fn(() => handledPopupInteraction());
    const downstream = vi.fn();
    const dispose = bindPopupInteractionInput({
      canvas,
      keyboardTarget: keyboard,
      dispatch,
      onError: vi.fn(),
    });
    canvas.addEventListener("pointerdown", downstream);
    keyboard.addEventListener("keydown", downstream);

    const pointer = new Event("pointerdown", { cancelable: true });
    const key = new Event("keydown", { cancelable: true });
    canvas.dispatchEvent(pointer);
    keyboard.dispatchEvent(key);

    expect(dispatch).toHaveBeenCalledTimes(2);
    expect(pointer.defaultPrevented).toBe(true);
    expect(key.defaultPrevented).toBe(true);
    expect(downstream).not.toHaveBeenCalled();

    dispose();
    dispose();
    canvas.dispatchEvent(new Event("pointerdown"));
    keyboard.dispatchEvent(new Event("keydown"));
    expect(dispatch).toHaveBeenCalledTimes(2);
  });

  it("passes idle and repeated keyboard input through", () => {
    const canvas = new EventTarget();
    const keyboard = new EventTarget();
    const dispatch = vi.fn(() => unhandledPopupInteraction());
    const downstream = vi.fn();
    bindPopupInteractionInput({
      canvas,
      keyboardTarget: keyboard,
      dispatch,
      onError: vi.fn(),
    });
    canvas.addEventListener("pointerdown", downstream);
    keyboard.addEventListener("keydown", downstream);

    const pointer = new Event("pointerdown", { cancelable: true });
    const repeat = new Event("keydown", { cancelable: true });
    Object.defineProperty(repeat, "repeat", { value: true });
    canvas.dispatchEvent(pointer);
    keyboard.dispatchEvent(repeat);

    expect(dispatch).toHaveBeenCalledOnce();
    expect(pointer.defaultPrevented).toBe(false);
    expect(repeat.defaultPrevented).toBe(false);
    expect(downstream).toHaveBeenCalledTimes(2);
  });

  it("reports synchronous and asynchronous interaction failures", async () => {
    const canvas = new EventTarget();
    const keyboard = new EventTarget();
    const onError = vi.fn();
    const synchronous = new Error("sync failure");
    const asynchronous = new Error("async failure");
    const dispatch = vi
      .fn<() => ReturnType<typeof handledPopupInteraction>>()
      .mockImplementationOnce(() => {
        throw synchronous;
      })
      .mockReturnValueOnce(
        handledPopupInteraction(Promise.reject(asynchronous)),
      );
    bindPopupInteractionInput({
      canvas,
      keyboardTarget: keyboard,
      dispatch,
      onError,
    });

    canvas.dispatchEvent(new Event("pointerdown"));
    keyboard.dispatchEvent(new Event("keydown"));
    await Promise.resolve();

    expect(onError).toHaveBeenNthCalledWith(1, synchronous);
    expect(onError).toHaveBeenNthCalledWith(2, asynchronous);
  });
});
