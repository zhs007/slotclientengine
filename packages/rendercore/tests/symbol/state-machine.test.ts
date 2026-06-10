import { describe, expect, it } from "vitest";
import {
  createDefaultSymbolStatePreset,
  createSymbolDefinitionFromPreset,
  MIN_SYMBOL_FRAME_DURATION_SECONDS,
  SymbolStateError,
  SymbolStateMachine
} from "../../src/symbol/index.js";
import type { SymbolDefinition, SymbolStatePreset } from "../../src/symbol/index.js";

const createDefinition = (overrides: Partial<SymbolDefinition> = {}): SymbolDefinition => ({
  code: 1,
  symbol: "S00",
  pays: [0, 1, 2],
  ...createDefaultSymbolStatePreset(),
  ...overrides
});

describe("SymbolStateMachine validation", () => {
  it("constructs the default state set and resolves viewer equivalences", () => {
    const machine = new SymbolStateMachine(createDefinition());

    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "normal",
      resolvedState: "normal",
      defaultState: "normal",
      pendingState: null,
      isOnce: false
    });

    machine.requestState("spinBlur");
    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal"
    });

    machine.requestState("disabled");
    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "disabled",
      resolvedState: "normal"
    });
  });

  it.each([
    [
      "missing default",
      { defaultState: "missing" },
      "does not exist"
    ],
    [
      "once default",
      { defaultState: "appear" },
      "must be stable"
    ],
    [
      "duplicate state",
      {
        states: [
          ...createDefaultSymbolStatePreset().states,
          { id: "normal", phase: "stable", playback: "static" }
        ]
      },
      "Duplicate"
    ],
    [
      "phase playback mismatch",
      {
        states: [{ id: "bad", phase: "stable", playback: "once" }],
        defaultState: "bad",
        equivalences: []
      },
      "stable phase"
    ],
    [
      "short frame",
      {
        states: [
          {
            id: "normal",
            phase: "stable",
            playback: "static",
            frameDurationSeconds: MIN_SYMBOL_FRAME_DURATION_SECONDS / 2
          }
        ],
        equivalences: []
      },
      "frameDurationSeconds"
    ]
  ] as const)("rejects invalid state definitions: %s", (_label, overrides, message) => {
    expect(() => new SymbolStateMachine(createDefinition(overrides as Partial<SymbolDefinition>))).toThrow(
      SymbolStateError
    );
    expect(() => new SymbolStateMachine(createDefinition(overrides as Partial<SymbolDefinition>))).toThrow(
      message
    );
  });

  it.each([
    [
      "unknown target",
      {
        equivalences: [{ from: "spinBlur", to: "missing" }]
      },
      "target"
    ],
    [
      "stable to once",
      {
        equivalences: [{ from: "spinBlur", to: "appear" }]
      },
      "same phase"
    ],
    [
      "once to stable",
      {
        equivalences: [{ from: "appear", to: "normal" }]
      },
      "same phase"
    ],
    [
      "cycle",
      {
        states: [
          { id: "normal", phase: "stable", playback: "static" },
          { id: "a", phase: "stable", playback: "static" },
          { id: "b", phase: "stable", playback: "static" }
        ],
        equivalences: [
          { from: "a", to: "b" },
          { from: "b", to: "a" }
        ]
      },
      "cycle"
    ]
  ] as const)("rejects invalid equivalence: %s", (_label, overrides, message) => {
    expect(() => new SymbolStateMachine(createDefinition(overrides as Partial<SymbolDefinition>))).toThrow(
      message
    );
  });

  it("resolves multi-level equivalence chains", () => {
    const machine = new SymbolStateMachine(
      createDefinition({
        states: [
          { id: "normal", phase: "stable", playback: "static" },
          { id: "a", phase: "stable", playback: "static" },
          { id: "b", phase: "stable", playback: "static" }
        ],
        equivalences: [
          { from: "a", to: "b" },
          { from: "b", to: "normal" }
        ]
      })
    );

    machine.requestState("a");
    expect(machine.getSnapshot().resolvedState).toBe("normal");
  });
});

describe("SymbolStateMachine transitions", () => {
  it("switches immediately from static states and rejects unknown requests", () => {
    const machine = new SymbolStateMachine(createDefinition());

    machine.requestState("appear");
    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "appear",
      resolvedState: "appear",
      isOnce: true
    });
    expect(() => machine.requestState("missing")).toThrow(SymbolStateError);
  });

  it("waits for loop boundaries and keeps the last pending request", () => {
    const preset: SymbolStatePreset = {
      defaultState: "normal",
      states: [
        { id: "normal", phase: "stable", playback: "loop" },
        { id: "disabled", phase: "stable", playback: "static" },
        { id: "spinBlur", phase: "stable", playback: "static" }
      ]
    };
    const machine = new SymbolStateMachine(createSymbolDefinitionFromPreset({ code: 1, symbol: "S00", pays: [], preset }));

    machine.requestState("disabled");
    machine.requestState("spinBlur");
    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "normal",
      pendingState: "spinBlur"
    });

    machine.notifyLoopComplete();
    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "spinBlur",
      pendingState: null
    });
  });

  it("returns once states to the current default state", () => {
    const machine = new SymbolStateMachine(createDefinition());

    machine.requestState("appear");
    machine.setDefaultState("spinBlur");
    machine.requestState("win");
    expect(machine.getSnapshot().pendingState).toBe("win");

    machine.notifyOnceComplete();
    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "spinBlur",
      resolvedState: "normal",
      defaultState: "spinBlur",
      pendingState: null
    });
  });

  it("resets pending state back to default", () => {
    const machine = new SymbolStateMachine(createDefinition());
    machine.requestState("appear");
    machine.requestState("win");

    machine.reset();

    expect(machine.getSnapshot()).toMatchObject({
      requestedState: "normal",
      pendingState: null
    });
  });
});
