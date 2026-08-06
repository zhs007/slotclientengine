import { describe, expect, it } from "vitest";
import { createSlotOperationCellChoreographyExecutor } from "../../src/slot-operation/index.js";

describe("slot operation choreography executor", () => {
  it("advances once states and honors first-cell completion", () => {
    const counts = new Map<string, number>([
      ["0,0", 0],
      ["1,0", 0],
    ]);
    const requests: string[] = [];
    const executor = createSlotOperationCellChoreographyExecutor({
      requestState: (x, y, state) => requests.push(`${x},${y}:${state}`),
      getStateSnapshot: (x, y) => ({
        onceCompletionCount: counts.get(`${x},${y}`)!,
      }),
    });
    executor.start({
      completionPolicy: "first-cell-normal",
      assignments: [
        {
          x: 0,
          y: 0,
          steps: [
            { state: "win", phase: "once" },
            { state: "normal", phase: "stable" },
          ],
        },
        {
          x: 1,
          y: 0,
          steps: [
            { state: "win", phase: "once" },
            { state: "normal", phase: "stable" },
          ],
        },
      ],
    });
    counts.set("0,0", 1);

    expect(executor.update().completed).toBe(true);
    expect(requests).toEqual(["0,0:win", "1,0:win", "0,0:normal"]);
  });

  it("retires old generation and rejects duplicate assignments", () => {
    const executor = createSlotOperationCellChoreographyExecutor({
      requestState: () => undefined,
      getStateSnapshot: () => ({ onceCompletionCount: 0 }),
    });
    expect(() =>
      executor.start({
        completionPolicy: "all-cells-normal",
        assignments: [
          { x: 0, y: 0, steps: [{ state: "normal", phase: "stable" }] },
          { x: 0, y: 0, steps: [{ state: "normal", phase: "stable" }] },
        ],
      }),
    ).toThrow(/Duplicate choreography assignment/);
    executor.retire();
    expect(executor.update().completed).toBe(true);
  });

  it("runs multiple once states and waits for every assigned cell", () => {
    let count = 0;
    const requests: string[] = [];
    const executor = createSlotOperationCellChoreographyExecutor({
      requestState: (_x, _y, state) => requests.push(state),
      getStateSnapshot: () => ({ onceCompletionCount: count }),
    });
    executor.start({
      completionPolicy: "all-cells-normal",
      assignments: [
        {
          x: 0,
          y: 0,
          steps: [
            { state: "a", phase: "once" },
            { state: "b", phase: "once" },
            { state: "normal", phase: "stable" },
          ],
        },
      ],
    });
    expect(executor.update().completed).toBe(false);
    count = 1;
    expect(executor.update().completed).toBe(false);
    count = 2;
    expect(executor.update().completed).toBe(true);
    expect(requests).toEqual(["a", "b", "normal"]);
  });

  it("rejects non-final stable states and completion without stable state", () => {
    let count = 0;
    const executor = createSlotOperationCellChoreographyExecutor({
      requestState: () => undefined,
      getStateSnapshot: () => ({ onceCompletionCount: count }),
    });
    expect(() =>
      executor.start({
        completionPolicy: "all-cells-normal",
        assignments: [
          {
            x: 0,
            y: 0,
            steps: [
              { state: "normal", phase: "stable" },
              { state: "x", phase: "once" },
            ],
          },
        ],
      }),
    ).toThrow(/must use once/);
    executor.start({
      completionPolicy: "all-cells-normal",
      assignments: [{ x: 0, y: 0, steps: [{ state: "x", phase: "once" }] }],
    });
    count += 1;
    expect(() => executor.update()).toThrow(/ended without stable/);

    count = 0;
    executor.start({
      completionPolicy: "all-cells-normal",
      assignments: [
        {
          x: 0,
          y: 0,
          steps: [
            { state: "x", phase: "once" },
            { state: "normal", phase: "stable" },
            { state: "late", phase: "once" },
          ],
        },
      ],
    });
    count = 1;
    expect(() => executor.update()).toThrow(/steps after stable/);
  });

  it("rejects an assignment without choreography steps", () => {
    const executor = createSlotOperationCellChoreographyExecutor({
      requestState: () => undefined,
      getStateSnapshot: () => ({ onceCompletionCount: 0 }),
    });
    expect(() =>
      executor.start({
        completionPolicy: "all-cells-normal",
        assignments: [{ x: 0, y: 0, steps: [] as never }],
      }),
    ).toThrow(/has no steps/);
  });

  it("destroys idempotently and rejects future starts", () => {
    const executor = createSlotOperationCellChoreographyExecutor({
      requestState: () => undefined,
      getStateSnapshot: () => ({ onceCompletionCount: 0 }),
    });
    executor.destroy();
    executor.destroy();
    expect(executor.update().completed).toBe(true);
    expect(() =>
      executor.start({ completionPolicy: "all-cells-normal", assignments: [] }),
    ).toThrow(/destroyed/);
  });
});
