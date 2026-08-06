import { describe, expect, it, vi } from "vitest";
import {
  createSlotOperationHandlerRegistry,
  registerSlotRoundProfileOperationHandlers,
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

  it("strictly rejects missing step payloads and target methods", () => {
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: target() as never,
    });
    const operation = { kind: "slot:spin", payload: {} };
    expect(() =>
      registry
        .get("slot:state-mutation", 2)!
        .handler.preflight(operation as never),
    ).toThrow(/no settled-transform handler/);
    expect(() =>
      registry.get("slot:win-remove", 2)!.handler.start(operation as never),
    ).toThrow(/payload.step/);
    expect(() =>
      registry
        .get("slot:win-remove", 2)!
        .handler.preflight({ ...operation, payload: { step: {} } } as never),
    ).not.toThrow();
  });

  it("runs optional win preflight and no-op completion branches", () => {
    const preflightWin = vi.fn();
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: { ...target(), preflightWin } as never,
      skipSettledTransform: true,
    });
    const operation = {
      kind: "slot:win-remove",
      payload: { step: {} },
      output: {},
    } as never;
    registry.get("slot:win-remove", 2)!.handler.preflight(operation);
    expect(preflightWin).toHaveBeenCalledOnce();
    const completion = registry.get("slot:completion", 2)!.handler;
    completion.start(operation);
    expect(completion.update(operation, 0).completed).toBe(true);
  });

  it("runs transform and asynchronous completion lifecycle branches", () => {
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
    const transformOperation = {
      kind: "slot:state-mutation",
      payload: { step },
    } as never;
    const transform = registry.get("slot:state-mutation", 2)!.handler;
    transform.preflight(transformOperation);
    transform.start(transformOperation);
    expect(transform.update(transformOperation, 0.1).completed).toBe(false);
    expect(transform.update(transformOperation, 0.1).completed).toBe(true);
    expect(startSettledTransform).toHaveBeenCalledWith(step);

    const completionOperation = {
      kind: "slot:completion",
      payload: {},
    } as never;
    const completion = registry.get("slot:completion", 2)!.handler;
    completion.start(completionOperation);
    expect(completion.update(completionOperation, 0.1).completed).toBe(false);
    expect(completion.update(completionOperation, 0.1).completed).toBe(true);
    expect(startCompletion).toHaveBeenCalledWith();
  });

  it("strictly rejects missing dropdown and refill step payloads", () => {
    const registry = createSlotOperationHandlerRegistry();
    registerSlotRoundProfileOperationHandlers({
      registry,
      target: target() as never,
    });
    const dropdown = { kind: "slot:dropdown", payload: {} } as never;
    const refill = { kind: "slot:refill", payload: {} } as never;
    expect(() =>
      registry.get("slot:dropdown", 2)!.handler.start(dropdown),
    ).toThrow(/slot:dropdown payload.step/);
    expect(() => registry.get("slot:refill", 2)!.handler.start(refill)).toThrow(
      /slot:refill payload.step/,
    );
  });
});

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
