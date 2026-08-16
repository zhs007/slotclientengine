import { describe, expect, it, vi } from "vitest";
import {
  createBuiltinSlotOperationDefinitionsV2,
  finalizeSlotOperationPlanV2,
  generateSceneLandingOperation,
  type SlotOperationSnapshot,
} from "@slotclientengine/logiccore";
import {
  createSlotOperationCoordinator,
  createSlotOperationHandlerRegistry,
  type SlotOperationHandler,
} from "../../src/slot-operation/index.js";

describe("slot operation coordinator", () => {
  it("exposes direct phase queries and defers waiters added during update", async () => {
    const registry = createSlotOperationHandlerRegistry();
    let nestedFrameCount = 0;
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        async start(_operation, context) {
          let nested!: Promise<void>;
          await context.waitForFrame(() => {
            nested = context.waitForFrame(() => {
              nestedFrameCount += 1;
              return true;
            });
            return true;
          });
          await nested;
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });

    expect(coordinator.isRunning()).toBe(false);
    expect(coordinator.getPhase()).toBe("idle");
    const completion = coordinator.start(plan());
    expect(coordinator.isRunning()).toBe(true);
    expect(coordinator.getPhase()).toBe("running");

    coordinator.update(0.016);
    expect(nestedFrameCount).toBe(0);
    coordinator.update(0.016);
    await completion;

    expect(nestedFrameCount).toBe(1);
    expect(coordinator.isRunning()).toBe(false);
    expect(coordinator.getPhase()).toBe("complete");
  });

  it("executes one async start chain and advances frame waits", async () => {
    const events: string[] = [];
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        async start(_operation, context) {
          events.push("start");
          await context.waitForFrame((deltaSeconds) => {
            events.push(`frame:${deltaSeconds}`);
            return true;
          });
          events.push("complete");
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => events.push(`cleanup:${reason}`),
      updateRuntime: () => events.push("runtime"),
    });

    const completion = coordinator.start(plan());
    expect(events).toEqual(["cleanup:next-spin", "start"]);
    coordinator.update(0.016);
    await completion;

    expect(events).toEqual([
      "cleanup:next-spin",
      "start",
      "runtime",
      "frame:0.016",
      "complete",
    ]);
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "complete",
      running: false,
    });
  });

  it("supports ticker-driven delays without a handler update method", async () => {
    const registry = createSlotOperationHandlerRegistry();
    const completed = vi.fn();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        async start(_operation, context) {
          await context.delay(0.1);
          completed();
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });

    const completion = coordinator.start(plan());
    coordinator.update(0.04);
    coordinator.update(0.04);
    expect(completed).not.toHaveBeenCalled();
    coordinator.update(0.03);
    await completion;
    expect(completed).toHaveBeenCalledOnce();
  });

  it("passes the previous state output to the next render handler", async () => {
    const registry = createSlotOperationHandlerRegistry();
    const inputs: Array<SlotOperationSnapshot | null> = [];
    for (const kind of ["slot:scene-landing", "slot:dropdown"])
      registry.register({
        kind,
        version: 2,
        handler: {
          start: (_operation, context) => {
            inputs.push(context.input);
          },
        },
      });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    const initial = snapshot();
    const output = Object.freeze({
      scene: Object.freeze([Object.freeze([1])]),
      values: Object.freeze([Object.freeze([2])]),
    });
    const operationPlan = finalizeSlotOperationPlanV2({
      drafts: [
        generateSceneLandingOperation({
          source: authoredSource(),
          output: initial,
        }),
        {
          kind: "slot:dropdown",
          version: 2,
          effect: "state-mutation",
          source: authoredSource(),
          output,
          payload: {},
        },
      ],
      definitions: createBuiltinSlotOperationDefinitionsV2(),
      symbolCodes: { A: 0, B: 1 },
      columns: 1,
      rows: 1,
    });

    await coordinator.start(operationPlan);

    expect(inputs).toEqual([null, initial]);
  });

  it("fails stop when an async handler rejects", async () => {
    const events: string[] = [];
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        start: async () => {
          throw new Error("start failed");
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => events.push(reason),
    });

    await expect(coordinator.start(plan())).rejects.toThrow("start failed");
    expect(events).toEqual(["next-spin", "execution-failure"]);
    expect(coordinator.getSnapshot().phase).toBe("fatal");
  });

  it("normalizes non-Error synchronous handler failures", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        start: () => {
          throw "string failure";
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    await expect(coordinator.start(plan())).rejects.toThrow("string failure");
  });

  it("treats missing renderer wiring as an execution failure", async () => {
    const events: string[] = [];
    const coordinator = createSlotOperationCoordinator({
      registry: createSlotOperationHandlerRegistry(),
      cleanup: (reason) => events.push(reason),
    });

    await expect(coordinator.start(plan())).rejects.toThrow(
      /Missing slot operation handler/,
    );
    expect(events).toEqual(["next-spin", "execution-failure"]);
  });

  it("aborts an active async chain on cleanup", async () => {
    const registry = createSlotOperationHandlerRegistry();
    let signal: AbortSignal | null = null;
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        async start(_operation, context) {
          signal = context.signal;
          await context.waitForFrame(() => false);
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    const completion = coordinator.start(plan());
    coordinator.cleanup("fatal");
    await expect(completion).rejects.toThrow(/fatal/);
    expect(signal!.aborted).toBe(true);
    coordinator.cleanup("fatal");
  });

  it("enforces exact instance registry keys", () => {
    const registry = createSlotOperationHandlerRegistry();
    const registration = {
      kind: "slot:scene-landing",
      version: 2,
      handler: handler(),
    };
    registry.register(registration);
    expect(registry.has("slot:scene-landing", 2)).toBe(true);
    expect(registry.get("slot:scene-landing", 2)).toBe(registration);
    expect(() => registry.register(registration)).toThrow(/Duplicate/);
    registry.clear();
    expect(registry.has("slot:scene-landing", 2)).toBe(false);
  });

  it("validates frame deltas and coordinator ownership", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        start: (_operation, context) => context.waitForFrame(() => false),
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    expect(() => coordinator.update(-1)).toThrow(/finite and non-negative/);
    const completion = coordinator.start(plan());
    await expect(coordinator.start(plan())).rejects.toThrow(/already running/);
    coordinator.destroy();
    await expect(completion).rejects.toThrow(/destroyed/);
    coordinator.destroy();
    coordinator.cleanup("fatal");
    await expect(coordinator.start(plan())).rejects.toThrow(/destroyed/);
  });

  it("surfaces cleanup callback failures", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        start: (_operation, context) => context.waitForFrame(() => false),
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => {
        if (reason === "fatal") throw new Error("cleanup callback");
      },
    });
    const completion = coordinator.start(plan());
    expect(() => coordinator.cleanup("fatal")).toThrow("cleanup callback");
    await expect(completion).rejects.toThrow(/cleanup failed/);
  });

  it("rejects invalid delay values through the operation chain", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      handler: {
        start: (_operation, context) => context.delay(-1),
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    await expect(coordinator.start(plan())).rejects.toThrow(
      /delay seconds must be finite and non-negative/,
    );
  });
});

function handler(): SlotOperationHandler {
  return { start: () => undefined };
}

function plan() {
  const initial = snapshot();
  return finalizeSlotOperationPlanV2({
    drafts: [
      generateSceneLandingOperation({
        source: authoredSource(),
        output: initial,
      }),
    ],
    definitions: createBuiltinSlotOperationDefinitionsV2(),
    symbolCodes: { A: 0 },
    columns: 1,
    rows: 1,
  });
}

function snapshot(): SlotOperationSnapshot {
  return Object.freeze({
    scene: Object.freeze([Object.freeze([0])]),
    values: Object.freeze([Object.freeze([null])]),
  });
}

function authoredSource() {
  return {
    kind: "snapshot-authored" as const,
    inputSnapshotId: "a",
    outputSnapshotId: "b",
    suggestions: [
      {
        field: "win",
        status: "exact" as const,
        candidateCount: 1,
        diagnostics: [],
      },
    ],
    edits: [],
  };
}
