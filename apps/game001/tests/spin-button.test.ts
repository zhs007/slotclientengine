import { describe, expect, it, vi } from "vitest";
import { createGame001SpinButton } from "../src/spin-button.js";

describe("game001 spin button", () => {
  it("only fires in ready state and immediately leaves ready state", () => {
    const onSpin = vi.fn();
    const button = createGame001SpinButton({ x: 10, y: 20, onSpin });

    button.emit("pointertap", {} as any);
    expect(onSpin).not.toHaveBeenCalled();

    button.setState("ready");
    expect(button.eventMode).toBe("static");
    expect(button.cursor).toBe("pointer");
    button.emit("pointertap", {} as any);
    button.emit("pointertap", {} as any);

    expect(onSpin).toHaveBeenCalledTimes(1);
    expect(button.getState()).toBe("loading");
    expect(button.eventMode).toBe("none");
  });

  it("shows error when async spin fails", async () => {
    const button = createGame001SpinButton({
      x: 0,
      y: 0,
      onSpin: async () => {
        throw new Error("boom");
      },
    });

    button.setState("ready");
    button.emit("pointertap", {} as any);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(button.getState()).toBe("error");
  });
});
