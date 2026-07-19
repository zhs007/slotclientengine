import { describe, expect, it } from "vitest";
import { parseSymbolPackageGameConfig } from "@slotclientengine/rendercore/symbol";
import { sampleNumberWeightTable } from "../src/preview/number-weight-table.js";
import { createOtherScenePreview } from "../src/preview/other-scene-preview.js";
import type {
  RandomReelSceneSnapshot,
  RandomUint32Source,
} from "../src/preview/random-reel-scene.js";

describe("number weight sampling", () => {
  it.each([
    [0, 1],
    [1, 2],
    [2, 2],
    [3, 5],
  ])("maps cumulative boundary %s to %s", (random, expected) => {
    expect(
      sampleNumberWeightTable(
        [
          { value: 1, weight: 1 },
          { value: 2, weight: 2 },
          { value: 5, weight: 1 },
        ],
        sequenceSource([random]),
      ),
    ).toBe(expected);
  });

  it("rejects the biased tail and validates uint32", () => {
    expect(
      sampleNumberWeightTable(
        [
          { value: 1, weight: 1 },
          { value: 2, weight: 2 },
        ],
        sequenceSource([0xffff_ffff, 0]),
      ),
    ).toBe(1);
    expect(() =>
      sampleNumberWeightTable([{ value: 1, weight: 1 }], sequenceSource([-1])),
    ).toThrow(/uint32/);
  });

  it.each([
    [[], /至少一项/],
    [[{ value: 0, weight: 1 }], /value/],
    [[{ value: 1, weight: 0 }], /weight/],
    [
      [
        { value: 1, weight: 1 },
        { value: 1, weight: 2 },
      ],
      /重复/,
    ],
    [
      [
        { value: 1, weight: 0xffff_ffff },
        { value: 2, weight: 2 },
      ],
      /总权重/,
    ],
  ])("rejects invalid weighted table %#", (entries, message) => {
    expect(() => sampleNumberWeightTable(entries, sequenceSource([0]))).toThrow(
      message,
    );
  });
});

describe("createOtherScenePreview", () => {
  it("creates a frozen x-major matrix for independent symbol mappings", () => {
    const snapshot = createOtherScenePreview({
      scene: scene(),
      gameConfig: gameConfig(),
      randomSource: sequenceSource([0, 1]),
      bindings: [
        {
          symbol: "A",
          target: { kind: "image-string-node", name: "amount" },
          source: { kind: "number-weight-table", tableName: "coin-weight" },
        },
        {
          symbol: "B",
          target: { kind: "legacy-presentation-value" },
          source: { kind: "fixed-number", value: 25 },
        },
      ],
    });

    expect(snapshot.matrix).toEqual([
      [1, 25],
      [0, 2],
    ]);
    expect(
      snapshot.assignments.map((item) => [item.x, item.y, item.value]),
    ).toEqual([
      [0, 0, 1],
      [0, 1, 25],
      [1, 1, 2],
    ]);
    expect(Object.isFrozen(snapshot.matrix)).toBe(true);
    expect(Object.isFrozen(snapshot.matrix[0])).toBe(true);
  });

  it("fails before returning for duplicate mappings, missing tables and bad fixed values", () => {
    const base = {
      scene: scene(),
      gameConfig: gameConfig(),
      randomSource: sequenceSource([0]),
    };
    const binding = {
      symbol: "A",
      target: { kind: "image-string-node" as const, name: "amount" },
      source: { kind: "fixed-number" as const, value: 1 },
    };
    expect(() =>
      createOtherScenePreview({ ...base, bindings: [binding, binding] }),
    ).toThrow(/只能配置一个/);
    expect(() =>
      createOtherScenePreview({
        ...base,
        bindings: [
          {
            ...binding,
            source: { kind: "number-weight-table", tableName: "missing" },
          },
        ],
      }),
    ).toThrow(/不存在/);
    expect(() =>
      createOtherScenePreview({
        ...base,
        bindings: [{ ...binding, source: { kind: "fixed-number", value: 0 } }],
      }),
    ).toThrow(/正安全整数/);
    expect(() =>
      createOtherScenePreview({
        ...base,
        bindings: [{ ...binding, symbol: "" }],
      }),
    ).toThrow(/非空/);
    expect(() =>
      createOtherScenePreview({
        ...base,
        bindings: [binding],
        validateTarget: () => {
          throw new Error("bad target");
        },
      }),
    ).toThrow(/bad target/);
  });
});

function gameConfig() {
  return parseSymbolPackageGameConfig({
    paytable: {
      "0": { code: 0, symbol: "A", pays: [0] },
      "1": { code: 1, symbol: "B", pays: [0] },
      "2": { code: 2, symbol: "C", pays: [0] },
    },
    symbolCodes: { A: 0, B: 1, C: 2 },
    reels: { main: [[0], [1]] },
    numberWeightTables: {
      "coin-weight": [
        { value: 1, weight: 1 },
        { value: 2, weight: 1 },
      ],
    },
  }).gameConfig;
}

function scene(): RandomReelSceneSnapshot {
  return Object.freeze({
    reelSetName: "main",
    columns: 2,
    rows: 2,
    stopYs: Object.freeze([0, 0]),
    codes: Object.freeze([Object.freeze([0, 1]), Object.freeze([2, 0])]),
    symbols: Object.freeze([
      Object.freeze(["A", "B"]),
      Object.freeze(["C", "A"]),
    ]),
  });
}

function sequenceSource(values: number[]): RandomUint32Source {
  let index = 0;
  return {
    nextUint32: () => values[index++] ?? 0,
  };
}
