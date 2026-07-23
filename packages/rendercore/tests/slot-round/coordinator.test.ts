import { describe, expect, it, vi } from "vitest";
import type {
  SlotRoundCapability,
  SlotRoundExecutionPlan,
  SlotRoundOccurrenceSnapshot,
} from "@slotclientengine/logiccore";
import {
  createSlotRoundCoordinator,
  type SlotRoundPresentationCapabilityTarget,
} from "../../src/slot-round/index.js";

const snapshot = freeze({
  scene: [[0]],
  values: [[null]],
  occurrences: [
    {
      id: "initial:0:0",
      code: 0,
      symbol: "A",
      value: null,
      position: { x: 0, y: 0 },
    },
  ],
}) as SlotRoundOccurrenceSnapshot;

describe("slot round coordinator", () => {
  for (const renderer of ["standard", "grid-cell"] as const) {
    for (const flow of ["base", "cascade"] as const) {
      it(`${renderer} + ${flow} executes only compiled capabilities`, async () => {
        const target = createTarget(renderer);
        const plan = createPlan(flow);
        const coordinator = createSlotRoundCoordinator({ target });
        const completion = coordinator.start(plan);
        for (let index = 0; index < 8; index += 1) coordinator.update(1 / 60);
        await completion;
        expect(target.events[0]).toBe(`${renderer}:cleanup:next-spin`);
        expect(target.events).toContain(`${renderer}:initial`);
        if (flow === "base") {
          expect(target.events).not.toContain(`${renderer}:dropdown`);
          expect(target.events).not.toContain(`${renderer}:refill`);
        } else {
          expect(target.events).toContain(`${renderer}:win`);
          expect(target.events).toContain(`${renderer}:dropdown`);
          expect(target.events).toContain(`${renderer}:refill`);
        }
        expect(coordinator.getSnapshot()).toMatchObject({
          phase: "complete",
          running: false,
        });
      });
    }
  }

  it("rejects a missing capability before cleanup or mutation", async () => {
    const target = createTarget("standard", new Set(["spin"]));
    const coordinator = createSlotRoundCoordinator({ target });
    await expect(coordinator.start(createPlan("cascade"))).rejects.toThrow(
      /missing required "visible-symbol-states"/,
    );
    expect(target.events).toEqual([]);
  });

  it("rejects plan-specific resource preflight before cleanup or mutation", async () => {
    const target = createTarget("grid-cell");
    target.preflight = () => {
      throw new Error("missing-plan-resource");
    };
    const coordinator = createSlotRoundCoordinator({ target });
    await expect(coordinator.start(createPlan("cascade"))).rejects.toThrow(
      /missing-plan-resource/,
    );
    expect(target.events).toEqual([]);
  });

  it("drains failures through idempotent cleanup and destroy", async () => {
    const target = createTarget("grid-cell");
    target.update = vi.fn(() => {
      throw new Error("target-update-failure");
    });
    const coordinator = createSlotRoundCoordinator({ target });
    const completion = coordinator.start(createPlan("base"));
    coordinator.update(1 / 60);
    await expect(completion).rejects.toThrow(/target-update-failure/);
    expect(target.events).toContain("grid-cell:cleanup:execution-failure");
    coordinator.cleanup("fatal");
    coordinator.cleanup("fatal");
    coordinator.destroy();
    coordinator.destroy();
    expect(target.events.filter((event) => event.endsWith(":destroy"))).toEqual(
      ["grid-cell:cleanup:destroy"],
    );
  });

  it("waits for an injected completion capability before resolving", async () => {
    const target = createTarget("standard");
    let completionReady = false;
    target.startCompletion = vi.fn(() => {
      target.events.push("standard:completion");
    });
    target.isCompletionComplete = vi.fn(() => completionReady);
    const coordinator = createSlotRoundCoordinator({ target });
    const completion = coordinator.start(createPlan("base"));
    coordinator.update(1 / 60);
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "completion",
      running: true,
    });
    coordinator.update(1 / 60);
    completionReady = true;
    coordinator.update(1 / 60);
    await completion;
    expect(target.events).toContain("standard:completion");
  });

  it("accepts an injected completion hook with immediate completion", async () => {
    const target = createTarget("standard");
    target.startCompletion = vi.fn(() => {
      target.events.push("standard:completion");
    });
    const coordinator = createSlotRoundCoordinator({ target });
    const completion = coordinator.start(createPlan("base"));
    coordinator.update(1 / 60);
    await completion;
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "complete",
      running: false,
    });
  });

  it("waits at each compiled phase until its capability reports complete", async () => {
    const target = createTarget("grid-cell");
    let winReady = false;
    let dropdownReady = false;
    let refillReady = false;
    target.updateWin = () => ({ completed: winReady });
    target.isDropdownComplete = () => dropdownReady;
    target.isRefillComplete = () => refillReady;
    const coordinator = createSlotRoundCoordinator({ target });
    const completion = coordinator.start(createPlan("cascade"));

    coordinator.update(1 / 60);
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "win",
      stepIndex: 0,
    });
    coordinator.update(1 / 60);
    winReady = true;
    coordinator.update(1 / 60);
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "dropdown",
      stepIndex: 1,
    });
    coordinator.update(1 / 60);
    dropdownReady = true;
    coordinator.update(1 / 60);
    expect(coordinator.getSnapshot()).toMatchObject({
      phase: "refill",
      stepIndex: 2,
    });
    coordinator.update(1 / 60);
    refillReady = true;
    coordinator.update(1 / 60);
    await completion;
  });

  it("rejects malformed plans and invalid updates without mutation", async () => {
    const target = createTarget("standard");
    const coordinator = createSlotRoundCoordinator({ target });
    const mutablePlan = {
      ...createPlan("base"),
    } as SlotRoundExecutionPlan;
    await expect(coordinator.start(mutablePlan)).rejects.toThrow(
      /immutable V1 plan/,
    );
    await expect(
      coordinator.start(
        Object.freeze({
          ...createPlan("base"),
          version: 2,
        }) as unknown as SlotRoundExecutionPlan,
      ),
    ).rejects.toThrow(/immutable V1 plan/);
    expect(() => coordinator.update(Number.NaN)).toThrow(/finite/);
    expect(() => coordinator.update(-0.01)).toThrow(/non-negative/);
    expect(target.events).toEqual([]);
  });

  it("rejects concurrent start, cleanup, and destroy interruptions", async () => {
    const target = createTarget("grid-cell");
    target.isInitialSpinComplete = () => false;
    const coordinator = createSlotRoundCoordinator({ target });
    const first = coordinator.start(createPlan("base"));
    await expect(coordinator.start(createPlan("base"))).rejects.toThrow(
      /already running/,
    );
    coordinator.cleanup("fatal");
    await expect(first).rejects.toThrow(/interrupted by fatal cleanup/);

    const second = coordinator.start(createPlan("base"));
    coordinator.destroy();
    await expect(second).rejects.toThrow(/was destroyed/);
    await expect(coordinator.start(createPlan("base"))).rejects.toThrow(
      /is destroyed/,
    );
    coordinator.update(1 / 60);
    coordinator.cleanup("fatal");
  });

  it("rejects the active promise even when interruption cleanup throws", async () => {
    const target = createTarget("standard");
    target.isInitialSpinComplete = () => false;
    target.cleanup = vi.fn((reason) => {
      target.events.push(`standard:cleanup:${reason}`);
      if (reason === "fatal") throw "cleanup-string-failure";
    });
    const coordinator = createSlotRoundCoordinator({ target });
    const completion = coordinator.start(createPlan("base"));
    expect(() => coordinator.cleanup("fatal")).toThrow(
      /cleanup-string-failure/,
    );
    await expect(completion).rejects.toThrow(/cleanup failed/);
  });

  it("aggregates execution and cleanup failures", async () => {
    const target = createTarget("grid-cell");
    target.update = () => {
      throw "update-string-failure";
    };
    target.cleanup = vi.fn((reason) => {
      target.events.push(`grid-cell:cleanup:${reason}`);
      if (reason === "execution-failure")
        throw new Error("cleanup-error-failure");
    });
    const coordinator = createSlotRoundCoordinator({ target });
    const completion = coordinator.start(createPlan("base"));
    coordinator.update(1 / 60);
    await expect(completion).rejects.toThrow(
      /execution and cleanup both failed/,
    );
  });

  it("rejects an active promise when destroy cleanup throws", async () => {
    const target = createTarget("standard");
    target.isInitialSpinComplete = () => false;
    target.cleanup = vi.fn((reason) => {
      target.events.push(`standard:cleanup:${reason}`);
      if (reason === "destroy") throw "destroy-string-failure";
    });
    const coordinator = createSlotRoundCoordinator({ target });
    const completion = coordinator.start(createPlan("base"));
    expect(() => coordinator.destroy()).toThrow(/destroy-string-failure/);
    await expect(completion).rejects.toThrow(/destroy cleanup failed/);
    coordinator.destroy();
  });
});

function createTarget(
  renderer: "standard" | "grid-cell",
  capabilities: ReadonlySet<SlotRoundCapability> = new Set([
    "spin",
    "visible-symbol-states",
    "remove",
    "dropdown",
    "refill",
  ]),
): SlotRoundPresentationCapabilityTarget & { events: string[] } {
  const events: string[] = [];
  return {
    events,
    capabilities,
    cleanup(reason) {
      events.push(`${renderer}:cleanup:${reason}`);
    },
    startInitialSpin() {
      events.push(`${renderer}:initial`);
    },
    isInitialSpinComplete: () => true,
    startWin() {
      events.push(`${renderer}:win`);
    },
    updateWin: () => ({ completed: true }),
    startDropdown() {
      events.push(`${renderer}:dropdown`);
    },
    isDropdownComplete: () => true,
    startRefill() {
      events.push(`${renderer}:refill`);
    },
    isRefillComplete: () => true,
    update() {
      events.push(`${renderer}:update`);
    },
  };
}

function createPlan(flow: "base" | "cascade"): SlotRoundExecutionPlan {
  const steps =
    flow === "base"
      ? []
      : [
          {
            kind: "win",
            index: 0,
            stepIndex: 0,
            input: snapshot,
            output: snapshot,
            groups: [],
            releaseOccurrenceIds: [],
            requiredCapabilities: ["visible-symbol-states", "remove"],
          },
          {
            kind: "dropdown",
            index: 1,
            stepIndex: 1,
            input: snapshot,
            output: snapshot,
            movements: [],
            heldOccurrenceIds: [],
            requiredCapabilities: ["dropdown"],
          },
          {
            kind: "refill",
            index: 2,
            stepIndex: 1,
            input: snapshot,
            output: snapshot,
            movements: [],
            requiredCapabilities: ["refill"],
          },
        ];
  return freeze({
    kind: "slot-round-execution-plan",
    version: 1,
    initial: snapshot,
    steps,
    final: snapshot,
    requiredCapabilities:
      flow === "base"
        ? ["spin"]
        : ["spin", "visible-symbol-states", "remove", "dropdown", "refill"],
  }) as SlotRoundExecutionPlan;
}

function freeze<T>(value: T): T {
  if (Array.isArray(value)) {
    value.forEach(freeze);
    return Object.freeze(value);
  }
  if (typeof value === "object" && value !== null) {
    Object.values(value).forEach(freeze);
    return Object.freeze(value);
  }
  return value;
}
