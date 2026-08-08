import { describe, expect, it, vi } from "vitest";
import {
  createSlotOperationHandlerRegistry,
  registerSlotRoundProfileOperationHandlers,
  type SlotOperationExecutionContext,
} from "../../src/slot-operation/index.js";

describe("configured profile operation handlers", () => {
  it("can replace the settled-transform handler with a game-owned registration", () => {
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: target() as never,
      skipSettledTransform: true,
    });
    expect(registry.has("slot:state-mutation", 2)).toBe(false);
    expect(registry.has("slot:spin", 2)).toBe(true);
  });

  it("rejects missing step payloads and target methods when the operation starts", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: target() as never,
    });
    const operation = { kind: "slot:spin", payload: {} } as never;
    await expect(
      registry
        .get("slot:state-mutation", 2)!
        .handler.start(operation, context()),
    ).rejects.toThrow(/no settled-transform handler/);
    await expect(
      registry.get("slot:win-remove", 2)!.handler.start(operation, context()),
    ).rejects.toThrow(/payload.step/);
  });

  it("runs transform and completion as async frame chains", async () => {
    const startSettledTransform = vi.fn();
    const updateSettledTransform = vi
      .fn()
      .mockReturnValueOnce({ completed: false })
      .mockReturnValueOnce({ completed: true });
    const startCompletion = vi.fn();
    const isCompletionComplete = vi
      .fn()
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: {
        ...target(),
        startSettledTransform,
        updateSettledTransform,
        startCompletion,
        isCompletionComplete,
      } as never,
    });
    const step = { stepIndex: 1 };
    await registry.get("slot:state-mutation", 2)!.handler.start(
      {
        kind: "slot:state-mutation",
        payload: { step },
      } as never,
      context([0.1, 0.1]),
    );
    expect(startSettledTransform).toHaveBeenCalledWith(step);
    expect(updateSettledTransform).toHaveBeenCalledTimes(2);

    await registry
      .get("slot:completion", 2)!
      .handler.start(
        { kind: "slot:completion", payload: {} } as never,
        context([0.1, 0.1]),
      );
    expect(startCompletion).toHaveBeenCalledWith();
    expect(isCompletionComplete).toHaveBeenCalledTimes(2);
  });

  it("runs immediate completion without transaction boilerplate", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: target() as never,
      skipSettledTransform: true,
    });
    await registry
      .get("slot:completion", 2)!
      .handler.start(
        { kind: "slot:completion", payload: {} } as never,
        context(),
      );
  });

  it("rejects missing dropdown and refill step payloads", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: target() as never,
    });
    await expect(
      registry
        .get("slot:dropdown", 2)!
        .handler.start(
          { kind: "slot:dropdown", payload: {} } as never,
          context(),
        ),
    ).rejects.toThrow(/slot:dropdown payload.step/);
    await expect(
      registry
        .get("slot:refill", 2)!
        .handler.start(
          { kind: "slot:refill", payload: {} } as never,
          context(),
        ),
    ).rejects.toThrow(/slot:refill payload.step/);
  });
});

function context(
  deltas: readonly number[] = [0],
): SlotOperationExecutionContext {
  return {
    signal: new AbortController().signal,
    async waitForFrame(update): Promise<void> {
      for (const delta of deltas) if (update(delta)) return;
      throw new Error("test frame chain did not complete");
    },
    delay: async () => undefined,
  };
}

function target() {
  return {
    capabilities: new Set(),
    cleanup: () => undefined,
    startInitialSpin: () => undefined,
    isInitialSpinComplete: () => true,
    startWin: () => undefined,
    updateWin: () => ({ completed: true }),
    startDropdown: () => undefined,
    isDropdownComplete: () => true,
    startRefill: () => undefined,
    isRefillComplete: () => true,
    update: () => undefined,
  };
}
