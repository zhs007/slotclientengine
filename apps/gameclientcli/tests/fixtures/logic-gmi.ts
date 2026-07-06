import type { SpinOutcome } from "../../src/types";

export interface TestWinResult extends Record<string, unknown> {
  pos: number[];
  coinWin?: number;
  cashWin?: number;
}

export interface TestStepConfig {
  coinWin?: number;
  cashWin?: number;
  results?: TestWinResult[];
  scenes?: unknown[];
  otherScenes?: unknown[];
  curGameMod?: string;
  omitCurGameMod?: boolean;
  historyComponents?: string[];
  mapComponents?: Record<string, unknown>;
}

export function createSpinOutcomeFixture(config: {
  totalwin: number;
  bet?: number;
  lines?: number;
  steps?: TestStepConfig[];
}): SpinOutcome {
  const gmi = createGmiFixture(config);
  const replyPlayResultsLength = gmi.replyPlay.results.length;

  return {
    gmi,
    totalwin: config.totalwin,
    results: replyPlayResultsLength,
    replyPlayResultsLength,
  };
}

export function createSpinResultFixture(config: {
  totalwin: number;
  bet?: number;
  lines?: number;
  steps?: TestStepConfig[];
}): { totalwin: number; results: number; gmi: unknown } {
  const outcome = createSpinOutcomeFixture(config);

  return {
    totalwin: outcome.totalwin,
    results: outcome.results,
    gmi: outcome.gmi,
  };
}

export function createBasicComponent(
  usedScenes: number[] = [],
  usedResults: number[] = [],
  usedOtherScenes: number[] = [],
): Record<string, unknown> {
  return {
    basicComponentData: {
      usedScenes,
      usedOtherScenes,
      usedResults,
      usedPrizeScenes: [],
      srcScenes: [],
      pos: [],
      mapUsedSPGrid: {},
      coinWin: 0,
      cashWin: 0,
      targetScene: 0,
      runIndex: 0,
      output: 0,
      strOutput: "",
    },
  };
}

export function createPackedComponent(): Record<string, unknown> {
  return {
    type_url: "type.googleapis.com/sgc7pb.PackedComponent",
    value: { type: "Buffer", data: [1, 2, 3] },
  };
}

export function createWinResult(
  overrides: Record<string, unknown> = {},
): TestWinResult {
  return {
    pos: [0, 0],
    type: "line",
    symbol: 1,
    lineIndex: 0,
    symbolNums: 3,
    coinWin: 10,
    cashWin: 100,
    ...overrides,
  };
}

function createGmiFixture(config: {
  totalwin: number;
  bet?: number;
  lines?: number;
  steps?: TestStepConfig[];
}) {
  const steps = config.steps ?? [
    {
      coinWin: config.totalwin,
      cashWin: config.totalwin,
      results:
        config.totalwin > 0
          ? [
              createWinResult({
                coinWin: config.totalwin,
                cashWin: config.totalwin,
              }),
            ]
          : [],
      curGameMod: "base",
      historyComponents: [],
      mapComponents: {},
    },
  ];

  return {
    bet: config.bet ?? 10,
    lines: config.lines ?? 10,
    defaultScene: createScene(0),
    replyPlay: {
      randomNumbers: [1, 2, 3],
      results: steps.map((step, index) => createStep(step, index)),
      finished: true,
    },
  };
}

function createStep(
  step: TestStepConfig,
  index: number,
): Record<string, unknown> {
  const historyComponents = step.historyComponents ?? [];
  const mapComponents = step.mapComponents ?? {};
  const clientData: Record<string, unknown> = {
    scenes: step.scenes ?? [createScene(index + 1)],
    otherScenes: step.otherScenes ?? [],
    results: step.results ?? [],
    curGameModParam: {
      historyComponents,
      mapComponents,
    },
  };

  if (!step.omitCurGameMod) {
    clientData.curGameMod = step.curGameMod ?? "base";
  }

  return {
    coinWin: step.coinWin ?? 0,
    cashWin: step.cashWin ?? 0,
    clientData,
  };
}

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
