import { describe, expect, it } from "vitest";
import {
  GameplayStatsAccumulator,
  outputGameplayStats,
} from "../src/gameplay-stats";
import { SpinRequestConfig } from "../src/types";
import {
  createBasicComponent,
  createPackedComponent,
  createSpinOutcomeFixture,
  createWinResult,
} from "./fixtures/logic-gmi";

const REQUEST: SpinRequestConfig = {
  bet: 10,
  lines: 10,
  times: 1,
  autonums: -1,
};

describe("GameplayStatsAccumulator", () => {
  it("counts a single zero-win spin with no result or component", () => {
    const stats = new GameplayStatsAccumulator(REQUEST);
    const snapshot = stats.addSpin(
      createSpinOutcomeFixture({
        totalwin: 0,
        steps: [
          {
            coinWin: 0,
            cashWin: 0,
            results: [],
            historyComponents: [],
            mapComponents: {},
          },
        ],
      }),
      REQUEST,
      69002,
    );

    expect(snapshot.completedSpins).toBe(1);
    expect(snapshot.winningSpins).toBe(0);
    expect(snapshot.zeroWinSpinProbability).toBe(1);
    expect(snapshot.totalSteps).toBe(1);
    expect(snapshot.totalResults).toBe(0);
    expect(snapshot.components).toEqual([]);
    expect(snapshot.resultFields.type.missingCount).toBe(0);

    const output: string[] = [];
    outputGameplayStats(snapshot, (line) => output.push(line));
    expect(output).toContain("无组件触发");
    expect(output).toContain("无 result");
    expect(output).toContain("resultDenominator: 0");
  });

  it("counts win probability, result fields, and win multiplier buckets", () => {
    const stats = new GameplayStatsAccumulator(REQUEST);
    const snapshot = stats.addSpin(
      createSpinOutcomeFixture({
        totalwin: 150,
        steps: [
          {
            coinWin: 15,
            cashWin: 150,
            results: [
              createWinResult({
                type: "scatter",
                symbol: 7,
                lineIndex: -1,
                symbolNums: 5,
                coinWin: 15,
                cashWin: 150,
              }),
            ],
          },
        ],
      }),
      REQUEST,
    );

    expect(snapshot.winningSpinProbability).toBe(1);
    expect(snapshot.stepWinProbability).toBe(1);
    expect(snapshot.totalResults).toBe(1);
    expect(snapshot.cashWinResultCount).toBe(1);
    expect(snapshot.resultFields.type.values).toMatchObject([
      {
        value: '"scatter"',
        resultCount: 1,
        resultProbability: 1,
        spinCount: 1,
        spinProbability: 1,
      },
    ]);
    expect(
      snapshot.winMultiplierDistribution.find(
        (entry) => entry.label === "[1,5)",
      )?.spinCount,
    ).toBe(1);

    const output: string[] = [];
    outputGameplayStats(snapshot, (line) => output.push(line));
    expect(output).toContain("winMultiplier[1,5): 1 100.0000%");
    expect(output).not.toContain("winMultiplier[[1,5)]: 1 100.0000%");
  });

  it("counts dynamic component names, duplicate triggers, and basic component data", () => {
    const stats = new GameplayStatsAccumulator(REQUEST);
    const snapshot = stats.addSpin(
      createSpinOutcomeFixture({
        totalwin: 100,
        steps: [
          {
            coinWin: 10,
            cashWin: 100,
            results: [createWinResult({ coinWin: 10, cashWin: 100 })],
            otherScenes: [createScene(99)],
            historyComponents: ["ComponentA", "ComponentA", "PackedOnly"],
            mapComponents: {
              ComponentA: createBasicComponent([0], [0], [0]),
              PackedOnly: createPackedComponent(),
            },
          },
        ],
      }),
      REQUEST,
    );

    const componentA = snapshot.components.find(
      (component) => component.name === "ComponentA",
    );
    const packedOnly = snapshot.components.find(
      (component) => component.name === "PackedOnly",
    );

    expect(componentA).toMatchObject({
      triggeredSpins: 1,
      triggeredSteps: 1,
      totalTriggers: 2,
      duplicateTriggerSteps: 1,
      duplicateTriggers: 1,
      winsWhenTriggered: 1,
      cashWinWhenTriggered: 100,
      withBasicComponentData: 2,
      withoutBasicComponentData: 0,
      usedSceneCount: 2,
      usedOtherSceneCount: 2,
      usedResultCount: 2,
    });
    expect(packedOnly).toMatchObject({
      totalTriggers: 1,
      withBasicComponentData: 0,
      withoutBasicComponentData: 1,
      usedSceneCount: 0,
      usedOtherSceneCount: 0,
      usedResultCount: 0,
    });

    const output: string[] = [];
    outputGameplayStats(snapshot, (line) => output.push(line));
    expect(output.join("\n")).toContain("usedOtherSceneCount");
  });

  it("counts one triggered spin when the same component appears in multiple steps", () => {
    const stats = new GameplayStatsAccumulator(REQUEST);
    const snapshot = stats.addSpin(
      createSpinOutcomeFixture({
        totalwin: 0,
        steps: [
          {
            historyComponents: ["Shared"],
            mapComponents: { Shared: createBasicComponent() },
          },
          {
            historyComponents: ["Shared"],
            mapComponents: { Shared: createBasicComponent() },
          },
        ],
      }),
      REQUEST,
    );

    const shared = snapshot.components.find(
      (component) => component.name === "Shared",
    );

    expect(snapshot.avgStepsPerSpin).toBe(2);
    expect(snapshot.multiStepSpinProbability).toBe(1);
    expect(shared).toMatchObject({
      triggeredSpins: 1,
      triggeredSteps: 2,
      totalTriggers: 2,
      spinTriggerProbability: 1,
      stepTriggerProbability: 1,
    });
    expect(snapshot.stepCountDistribution).toMatchObject([
      { steps: 2, spinCount: 1, spinProbability: 1 },
    ]);
  });

  it("exposes missing and invalid result fields without defaulting them", () => {
    const missingAndInvalid = createWinResult({
      symbol: { nested: true },
      lineIndex: Number.NaN,
      symbolNums: [3],
    });
    delete missingAndInvalid.type;

    const stats = new GameplayStatsAccumulator(REQUEST);
    const snapshot = stats.addSpin(
      createSpinOutcomeFixture({
        totalwin: 0,
        steps: [
          {
            results: [
              missingAndInvalid,
              createWinResult({
                type: "line",
                symbol: 2,
                lineIndex: 1,
                symbolNums: null,
                cashWin: 0,
                coinWin: 0,
              }),
            ],
          },
        ],
      }),
      REQUEST,
    );

    expect(snapshot.totalResults).toBe(2);
    expect(snapshot.resultFields.type.missingCount).toBe(1);
    expect(snapshot.resultFields.type.missingProbability).toBe(0.5);
    expect(snapshot.resultFields.type.missingSpinCount).toBe(1);
    expect(snapshot.resultFields.symbol.invalidCount).toBe(1);
    expect(snapshot.resultFields.lineIndex.invalidCount).toBe(1);
    expect(snapshot.resultFields.symbolNums.invalidCount).toBe(1);
    expect(snapshot.resultFields.symbolNums.values).toContainEqual({
      value: "null",
      resultCount: 1,
      resultProbability: 0.5,
      spinCount: 1,
      spinProbability: 1,
    });
  });

  it("keeps zero denominators explicit and finite", () => {
    const stats = new GameplayStatsAccumulator(REQUEST);
    const snapshot = stats.addSpin(
      createSpinOutcomeFixture({
        totalwin: 0,
        steps: [],
      }),
      REQUEST,
    );

    expect(snapshot.totalSteps).toBe(0);
    expect(snapshot.stepWinProbability).toBe(0);
    expect(snapshot.avgResultsPerStep).toBe(0);

    const output: string[] = [];
    outputGameplayStats(snapshot, (line) => output.push(line));
    expect(output).toContain("stepProbabilityDenominator: 0");
    expect(output).toContain("resultDenominator: 0");
    expect(output.join("\n")).not.toMatch(/NaN|Infinity/);
  });

  it("throws on logiccore parse errors without committing partial stats", () => {
    const stats = new GameplayStatsAccumulator(REQUEST);
    const badOutcome = createSpinOutcomeFixture({
      totalwin: 0,
      steps: [
        {
          historyComponents: ["MissingMapComponent"],
          mapComponents: {},
        },
      ],
    });

    expect(() => stats.addSpin(badOutcome, REQUEST)).toThrow(
      "MissingMapComponent",
    );
    expect(stats.snapshot().completedSpins).toBe(0);
  });
});

function createScene(seed: number): Record<string, unknown> {
  return {
    values: [
      { values: [seed, 1, 2] },
      { values: [3, seed, 4] },
      { values: [5, 6, seed] },
    ],
    indexes: [],
    validRow: [],
  };
}
