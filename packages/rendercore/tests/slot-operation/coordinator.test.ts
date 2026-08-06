import { describe, expect, it } from "vitest";
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
  it("preflights the complete plan before cleanup and executes transaction lifecycle", async () => {
    const events: string[] = [];
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing" as const,
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: handler(events),
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => events.push(`cleanup:${reason}`),
      assertSnapshot: () => events.push("assert"),
    });

    const completion = coordinator.start(plan());
    expect(events).toEqual([
      "preflight",
      "cleanup:next-spin",
      "prepare",
      "start",
    ]);
    coordinator.update(0.016);
    await completion;

    expect(events).toEqual([
      "preflight",
      "cleanup:next-spin",
      "prepare",
      "start",
      "update",
      "commit",
      "assert",
      "destroy",
    ]);
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "complete",
      running: false,
    });
  });

  it("rolls back and destroys the active operation when update fails", async () => {
    const events: string[] = [];
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: handler(events, true),
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => events.push(`cleanup:${reason}`),
    });

    const completion = coordinator.start(plan());
    coordinator.update(0.016);

    await expect(completion).rejects.toThrow("update failed");
    expect(events.slice(-3)).toEqual([
      "rollback",
      "destroy",
      "cleanup:execution-failure",
    ]);
    expect(coordinator.getSnapshot().phase).toBe("fatal");
  });

  it("rejects missing handlers before next-spin cleanup", async () => {
    const events: string[] = [];
    const coordinator = createSlotOperationCoordinator({
      registry: createSlotOperationHandlerRegistry(),
      cleanup: (reason) => events.push(reason),
    });

    await expect(coordinator.start(plan())).rejects.toThrow(
      /Missing slot operation handler/,
    );
    expect(events).toEqual([]);
  });

  it("enters fatal cleanup when prepare fails after next-spin cleanup", async () => {
    const events: string[] = [];
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: {
        ...handler(events),
        prepare: () => {
          throw new Error("prepare failed");
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => events.push(`cleanup:${reason}`),
    });

    await expect(coordinator.start(plan())).rejects.toThrow("prepare failed");
    expect(events).toEqual([
      "preflight",
      "cleanup:next-spin",
      "cleanup:execution-failure",
    ]);
    expect(coordinator.getSnapshot().phase).toBe("fatal");
  });

  it("normalizes non-Error handler failures", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: {
        ...handler([]),
        prepare: () => {
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

  it("rejects capability mismatches and mutable plans before cleanup", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(),
      handler: handler([]),
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    await expect(coordinator.start(plan())).rejects.toThrow(
      /missing required capability/,
    );
    await expect(coordinator.start({ ...plan() })).rejects.toThrow(
      /immutable V2 plan/,
    );
  });

  it("interrupts active prepared state exactly once", async () => {
    const events: string[] = [];
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: { ...handler(events), update: () => ({ completed: false }) },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => events.push(`cleanup:${reason}`),
    });
    const completion = coordinator.start(plan());
    coordinator.cleanup("fatal");
    coordinator.cleanup("fatal");
    await expect(completion).rejects.toThrow(/fatal/);
    expect(events.filter((event) => event === "rollback")).toHaveLength(1);
    expect(events.filter((event) => event === "destroy")).toHaveLength(1);
  });

  it("enforces exact instance registry keys", () => {
    const registry = createSlotOperationHandlerRegistry();
    const registration = {
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing" as const,
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: handler([]),
    };
    registry.register(registration);
    expect(registry.has("slot:scene-landing", 2)).toBe(true);
    expect(registry.get("slot:scene-landing", 2)).toBe(registration);
    expect(() => registry.register(registration)).toThrow(/Duplicate/);
    registry.clear();
    expect(registry.has("slot:scene-landing", 2)).toBe(false);
    expect(() =>
      registry.register({
        ...registration,
        requiredCapabilities: [] as unknown as Set<string>,
      }),
    ).toThrow(/must be a Set/);
  });

  it("validates update deltas and coordinator ownership", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: { ...handler([]), update: () => ({ completed: false }) },
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

  it("reports rollback and destroy failures together", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: {
        ...handler([]),
        update: () => {
          throw new Error("update");
        },
        rollback: () => {
          throw new Error("rollback");
        },
        destroy: () => {
          throw new Error("destroy");
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    const completion = coordinator.start(plan());
    coordinator.update(0);
    await expect(completion).rejects.toThrow(
      /execution and cleanup both failed/,
    );
  });

  it("surfaces cleanup and destroy callback failures", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: { ...handler([]), update: () => ({ completed: false }) },
    });
    const cleanupCoordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => {
        if (reason === "fatal") throw new Error("cleanup callback");
      },
    });
    const cleanupCompletion = cleanupCoordinator.start(plan());
    expect(() => cleanupCoordinator.cleanup("fatal")).toThrow(
      "cleanup callback",
    );
    await expect(cleanupCompletion).rejects.toThrow(/cleanup failed/);

    const destroyCoordinator = createSlotOperationCoordinator({
      registry,
      cleanup: (reason) => {
        if (reason === "destroy") throw new Error("destroy callback");
      },
    });
    const destroyCompletion = destroyCoordinator.start(plan());
    expect(() => destroyCoordinator.destroy()).toThrow("destroy callback");
    await expect(destroyCompletion).rejects.toThrow(/destroy failed/);
  });

  it("does not roll back an operation after commit when snapshot assertion fails", async () => {
    const events: string[] = [];
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: handler(events),
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
      assertSnapshot: () => {
        throw new Error("snapshot mismatch");
      },
    });
    const completion = coordinator.start(plan());
    coordinator.update(0);
    await expect(completion).rejects.toThrow("snapshot mismatch");
    expect(events).toContain("destroy");
    expect(events).not.toContain("rollback");
  });

  it("fails explicitly if a preflight mutates away its instance handler", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: { ...handler([]), preflight: () => registry.clear() },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    await expect(coordinator.start(plan())).rejects.toThrow(
      /Handler disappeared/,
    );
  });

  it("preserves a lone prepared-state destroy failure", async () => {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:scene-landing",
      version: 2,
      effect: "scene-landing",
      requiredCapabilities: new Set(["slot:scene-landing"]),
      handler: {
        ...handler([]),
        update: () => {
          throw new Error("update");
        },
        destroy: () => {
          throw new Error("destroy only");
        },
      },
    });
    const coordinator = createSlotOperationCoordinator({
      registry,
      cleanup: () => undefined,
    });
    const completion = coordinator.start(plan());
    coordinator.update(0);
    await expect(completion).rejects.toThrow(
      /execution and cleanup both failed/,
    );
  });
});

function handler(events: string[], failUpdate = false): SlotOperationHandler {
  return {
    preflight: () => events.push("preflight"),
    prepare: () => {
      events.push("prepare");
      return {};
    },
    start: () => events.push("start"),
    update: () => {
      events.push("update");
      if (failUpdate) throw new Error("update failed");
      return { completed: true };
    },
    commit: () => events.push("commit"),
    rollback: () => events.push("rollback"),
    destroy: () => events.push("destroy"),
  };
}

function plan() {
  const initial = snapshot();
  return finalizeSlotOperationPlanV2({
    drafts: [
      generateSceneLandingOperation({
        source: {
          kind: "snapshot-authored",
          inputSnapshotId: "a",
          outputSnapshotId: "b",
          suggestions: [
            {
              field: "win",
              status: "exact",
              candidateCount: 1,
              diagnostics: [],
            },
          ],
          edits: [],
        },
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
    occurrences: Object.freeze([
      Object.freeze({
        id: "a",
        code: 0,
        symbol: "A",
        value: null,
        position: Object.freeze({ x: 0, y: 0 }),
      }),
    ]),
  });
}
