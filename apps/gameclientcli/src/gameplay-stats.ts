import {
  createGameLogicFromGmi,
  GameLogicStep,
  LogicComponent,
  WinResult,
} from "@slotclientengine/logiccore";
import { assertFiniteNumber, calculateStakePerSpin } from "./stats";
import { OutputSink, SpinOutcome, SpinRequestConfig } from "./types";

export type ResultDistributionField =
  | "type"
  | "symbol"
  | "lineIndex"
  | "symbolNums";

export interface CountProbabilitySnapshot {
  count: number;
  probability: number;
}

export interface WinMultiplierBucketSnapshot {
  label: string;
  spinCount: number;
  spinProbability: number;
}

export interface StepCountDistributionSnapshot {
  steps: number;
  spinCount: number;
  spinProbability: number;
}

export interface ComponentStatsSnapshot {
  name: string;
  triggeredSpins: number;
  spinTriggerProbability: number;
  triggeredSteps: number;
  stepTriggerProbability: number;
  totalTriggers: number;
  duplicateTriggerSteps: number;
  duplicateTriggers: number;
  winsWhenTriggered: number;
  winProbabilityWhenTriggered: number;
  cashWinWhenTriggered: number;
  coinWinWhenTriggered: number;
  avgCashWinWhenTriggered: number;
  avgCoinWinWhenTriggered: number;
  withBasicComponentData: number;
  withoutBasicComponentData: number;
  usedSceneCount: number;
  usedResultCount: number;
}

export interface ResultFieldValueSnapshot {
  value: string;
  resultCount: number;
  resultProbability: number;
  spinCount: number;
  spinProbability: number;
}

export interface ResultFieldDistributionSnapshot {
  field: ResultDistributionField;
  resultDenominator: number;
  spinDenominator: number;
  values: ResultFieldValueSnapshot[];
  missingCount: number;
  missingProbability: number;
  missingSpinCount: number;
  missingSpinProbability: number;
  invalidCount: number;
  invalidProbability: number;
  invalidSpinCount: number;
  invalidSpinProbability: number;
}

export interface CurGameModDistributionSnapshot {
  value: string;
  stepCount: number;
  stepProbability: number;
}

export interface GameplayStatsSnapshot {
  completedSpins: number;
  winningSpins: number;
  winningSpinProbability: number;
  zeroWinSpins: number;
  zeroWinSpinProbability: number;
  multiStepSpins: number;
  multiStepSpinProbability: number;
  spinWithAnyResult: number;
  spinWithAnyResultProbability: number;
  spinWithAnyComponent: number;
  spinWithAnyComponentProbability: number;
  winMultiplierDistribution: WinMultiplierBucketSnapshot[];
  totalSteps: number;
  avgStepsPerSpin: number;
  stepWinCount: number;
  stepWinProbability: number;
  stepWithResultCount: number;
  stepWithResultProbability: number;
  stepWithComponentCount: number;
  stepWithComponentProbability: number;
  stepCountDistribution: StepCountDistributionSnapshot[];
  totalResults: number;
  avgResultsPerSpin: number;
  avgResultsPerStep: number;
  cashWinResultCount: number;
  cashWinResultProbability: number;
  coinWinResultCount: number;
  coinWinResultProbability: number;
  components: ComponentStatsSnapshot[];
  resultFields: Record<ResultDistributionField, ResultFieldDistributionSnapshot>;
  curGameModDistribution: CurGameModDistributionSnapshot[];
  missingCurGameModSteps: number;
  missingCurGameModStepProbability: number;
}

interface ComponentStatsState {
  triggeredSpins: number;
  triggeredSteps: number;
  totalTriggers: number;
  duplicateTriggerSteps: number;
  duplicateTriggers: number;
  winsWhenTriggered: number;
  cashWinWhenTriggered: number;
  coinWinWhenTriggered: number;
  withBasicComponentData: number;
  withoutBasicComponentData: number;
  usedSceneCount: number;
  usedResultCount: number;
}

interface ResultFieldValueState {
  value: string;
  resultCount: number;
  spinCount: number;
}

interface ResultFieldDistributionState {
  values: Map<string, ResultFieldValueState>;
  missingCount: number;
  missingSpinCount: number;
  invalidCount: number;
  invalidSpinCount: number;
}

interface GameplayStatsState {
  completedSpins: number;
  winningSpins: number;
  zeroWinSpins: number;
  multiStepSpins: number;
  spinWithAnyResult: number;
  spinWithAnyComponent: number;
  winMultiplierDistribution: Map<string, number>;
  totalSteps: number;
  stepWinCount: number;
  stepWithResultCount: number;
  stepWithComponentCount: number;
  stepCountDistribution: Map<number, number>;
  totalResults: number;
  cashWinResultCount: number;
  coinWinResultCount: number;
  components: Map<string, ComponentStatsState>;
  resultFields: Record<ResultDistributionField, ResultFieldDistributionState>;
  curGameModDistribution: Map<string, number>;
  missingCurGameModSteps: number;
}

interface ResultFieldSpinTracker {
  values: Set<string>;
  missing: boolean;
  invalid: boolean;
}

const RESULT_FIELDS: readonly ResultDistributionField[] = [
  "type",
  "symbol",
  "lineIndex",
  "symbolNums",
];

const WIN_MULTIPLIER_BUCKETS = [
  { label: "0", matches: (value: number) => value === 0 },
  { label: "(0,1)", matches: (value: number) => value > 0 && value < 1 },
  { label: "[1,5)", matches: (value: number) => value >= 1 && value < 5 },
  { label: "[5,10)", matches: (value: number) => value >= 5 && value < 10 },
  { label: "[10,50)", matches: (value: number) => value >= 10 && value < 50 },
  { label: "[50,+∞)", matches: (value: number) => value >= 50 },
] as const;

export class GameplayStatsAccumulator {
  private readonly stakePerSpin: number;
  private state: GameplayStatsState = createEmptyState();

  constructor(spinConfig: SpinRequestConfig) {
    this.stakePerSpin = calculateStakePerSpin(spinConfig);
  }

  public addSpin(
    outcome: SpinOutcome,
    request: SpinRequestConfig,
    gameid?: number,
  ): GameplayStatsSnapshot {
    const requestStake = calculateStakePerSpin(request);
    if (requestStake !== this.stakePerSpin) {
      throw new Error(
        `玩法统计 stakePerSpin 与初始化配置不一致：initial=${this.stakePerSpin}, current=${requestStake}`,
      );
    }

    const logic = createLogic(outcome, request, gameid);
    assertLogicMatchesSpin(logic, outcome, request);

    const next = cloneState(this.state);
    const stepCount = logic.getStepCount();
    const totalWin = logic.getTotalWin();
    const winMultiplier = totalWin / this.stakePerSpin;
    assertFiniteNumber(winMultiplier, "winMultiplier");

    next.completedSpins += 1;
    if (totalWin > 0) {
      next.winningSpins += 1;
    } else {
      next.zeroWinSpins += 1;
    }
    if (stepCount > 1) {
      next.multiStepSpins += 1;
    }

    incrementMap(next.stepCountDistribution, stepCount, 1);
    incrementMap(
      next.winMultiplierDistribution,
      getWinMultiplierBucket(winMultiplier),
      1,
    );

    const spinComponentNames = new Set<string>();
    const resultTrackers = createResultFieldSpinTrackers();
    let spinHasAnyResult = false;
    let spinHasAnyComponent = false;

    for (const step of logic.getSteps()) {
      const stepCashWin = step.getCashWin();
      const stepCoinWin = step.getCoinWin();
      assertFiniteNumber(stepCashWin, `step[${step.getIndex()}].cashWin`);
      assertFiniteNumber(stepCoinWin, `step[${step.getIndex()}].coinWin`);

      const stepWon = stepCashWin > 0 || stepCoinWin > 0;
      const results = step.getResults();
      const historyComponents = readHistoryComponents(step);
      const stepComponentCounts = new Map<string, number>();

      next.totalSteps += 1;
      if (stepWon) {
        next.stepWinCount += 1;
      }
      if (results.length > 0) {
        spinHasAnyResult = true;
        next.stepWithResultCount += 1;
      }
      if (historyComponents.length > 0) {
        spinHasAnyComponent = true;
        next.stepWithComponentCount += 1;
      }

      addCurGameMod(next, step.getCurGameMod());
      addResults(next, resultTrackers, results);

      for (const componentName of historyComponents) {
        const component = readComponent(step, componentName);
        const componentScenes = step.getComponentScenes(componentName);
        const componentResults = step.getComponentResults(componentName);
        const componentStats = ensureComponentStats(
          next.components,
          componentName,
        );

        componentStats.totalTriggers += 1;
        if (component.hasBasicComponentData) {
          componentStats.withBasicComponentData += 1;
        } else {
          componentStats.withoutBasicComponentData += 1;
        }
        componentStats.usedSceneCount += componentScenes.length;
        componentStats.usedResultCount += componentResults.length;

        stepComponentCounts.set(
          componentName,
          (stepComponentCounts.get(componentName) ?? 0) + 1,
        );
        spinComponentNames.add(componentName);
      }

      for (const [componentName, occurrenceCount] of stepComponentCounts) {
        const componentStats = ensureComponentStats(
          next.components,
          componentName,
        );

        componentStats.triggeredSteps += 1;
        if (stepWon) {
          componentStats.winsWhenTriggered += 1;
        }
        componentStats.cashWinWhenTriggered += stepCashWin;
        componentStats.coinWinWhenTriggered += stepCoinWin;
        if (occurrenceCount > 1) {
          componentStats.duplicateTriggerSteps += 1;
          componentStats.duplicateTriggers += occurrenceCount - 1;
        }
      }
    }

    if (spinHasAnyResult) {
      next.spinWithAnyResult += 1;
    }
    if (spinHasAnyComponent) {
      next.spinWithAnyComponent += 1;
    }

    for (const componentName of spinComponentNames) {
      ensureComponentStats(next.components, componentName).triggeredSpins += 1;
    }

    commitResultFieldSpinCounts(next, resultTrackers);
    this.state = next;
    return this.snapshot();
  }

  public snapshot(): GameplayStatsSnapshot {
    return snapshotFromState(this.state);
  }
}

export function outputGameplayStats(
  snapshot: GameplayStatsSnapshot,
  output: OutputSink,
): void {
  output("玩法统计");
  output(`completedSpins: ${snapshot.completedSpins}`);
  output(`winningSpins: ${snapshot.winningSpins}`);
  output(
    `winningSpinProbability: ${formatProbability(
      snapshot.winningSpinProbability,
    )}`,
  );
  output(`winningSpinPercent: ${formatPercent(snapshot.winningSpinProbability)}`);
  output(`zeroWinSpins: ${snapshot.zeroWinSpins}`);
  output(
    `zeroWinSpinProbability: ${formatProbability(
      snapshot.zeroWinSpinProbability,
    )}`,
  );
  output(`zeroWinSpinPercent: ${formatPercent(snapshot.zeroWinSpinProbability)}`);
  output(`multiStepSpins: ${snapshot.multiStepSpins}`);
  output(
    `multiStepSpinProbability: ${formatProbability(
      snapshot.multiStepSpinProbability,
    )}`,
  );
  output(`spinWithAnyResult: ${snapshot.spinWithAnyResult}`);
  output(
    `spinWithAnyResultProbability: ${formatProbability(
      snapshot.spinWithAnyResultProbability,
    )}`,
  );
  output(`spinWithAnyComponent: ${snapshot.spinWithAnyComponent}`);
  output(
    `spinWithAnyComponentProbability: ${formatProbability(
      snapshot.spinWithAnyComponentProbability,
    )}`,
  );
  output(`winMultiplierDenominator: stakePerSpin`);
  for (const bucket of snapshot.winMultiplierDistribution) {
    output(
      `${formatWinMultiplierOutputName(bucket.label)}: ${
        bucket.spinCount
      } ${formatPercent(
        bucket.spinProbability,
      )}`,
    );
  }

  output(`totalSteps: ${snapshot.totalSteps}`);
  output(`avgStepsPerSpin: ${formatProbability(snapshot.avgStepsPerSpin)}`);
  output(`stepProbabilityDenominator: ${snapshot.totalSteps}`);
  output(`stepWinCount: ${snapshot.stepWinCount}`);
  output(`stepWinProbability: ${formatProbability(snapshot.stepWinProbability)}`);
  output(`stepWinPercent: ${formatPercent(snapshot.stepWinProbability)}`);
  output(`stepWithResultCount: ${snapshot.stepWithResultCount}`);
  output(
    `stepWithResultProbability: ${formatProbability(
      snapshot.stepWithResultProbability,
    )}`,
  );
  output(`stepWithComponentCount: ${snapshot.stepWithComponentCount}`);
  output(
    `stepWithComponentProbability: ${formatProbability(
      snapshot.stepWithComponentProbability,
    )}`,
  );

  output(`totalResults: ${snapshot.totalResults}`);
  output(`avgResultsPerSpin: ${formatProbability(snapshot.avgResultsPerSpin)}`);
  output(`avgResultsPerStep: ${formatProbability(snapshot.avgResultsPerStep)}`);
  output(`resultProbabilityDenominator: ${snapshot.totalResults}`);
  output(`cashWinResultCount: ${snapshot.cashWinResultCount}`);
  output(
    `cashWinResultProbability: ${formatProbability(
      snapshot.cashWinResultProbability,
    )}`,
  );
  output(`coinWinResultCount: ${snapshot.coinWinResultCount}`);
  output(
    `coinWinResultProbability: ${formatProbability(
      snapshot.coinWinResultProbability,
    )}`,
  );

  output("组件触发统计");
  if (snapshot.components.length === 0) {
    output("无组件触发");
  } else {
    output(
      "name triggeredSpins spinTriggerPercent triggeredSteps stepTriggerPercent totalTriggers duplicateTriggerSteps duplicateTriggers winsWhenTriggered winPercentWhenTriggered avgCashWinWhenTriggered avgCoinWinWhenTriggered withBasicComponentData withoutBasicComponentData usedSceneCount usedResultCount",
    );
    for (const component of snapshot.components) {
      output(
        [
          component.name,
          component.triggeredSpins,
          formatPercent(component.spinTriggerProbability),
          component.triggeredSteps,
          formatPercent(component.stepTriggerProbability),
          component.totalTriggers,
          component.duplicateTriggerSteps,
          component.duplicateTriggers,
          component.winsWhenTriggered,
          formatPercent(component.winProbabilityWhenTriggered),
          formatProbability(component.avgCashWinWhenTriggered),
          formatProbability(component.avgCoinWinWhenTriggered),
          component.withBasicComponentData,
          component.withoutBasicComponentData,
          component.usedSceneCount,
          component.usedResultCount,
        ].join(" "),
      );
    }
  }

  for (const field of RESULT_FIELDS) {
    outputResultFieldDistribution(snapshot.resultFields[field], output);
  }

  output("curGameMod 分布");
  output(`stepDenominator: ${snapshot.totalSteps}`);
  if (
    snapshot.curGameModDistribution.length === 0 &&
    snapshot.missingCurGameModSteps === 0
  ) {
    output("无 step");
  } else {
    output("value stepCount stepPercent");
    for (const entry of snapshot.curGameModDistribution) {
      output(
        `${entry.value} ${entry.stepCount} ${formatPercent(
          entry.stepProbability,
        )}`,
      );
    }
    output(
      `<missing> ${snapshot.missingCurGameModSteps} ${formatPercent(
        snapshot.missingCurGameModStepProbability,
      )}`,
    );
  }

  output("step 数量分布");
  if (snapshot.stepCountDistribution.length === 0) {
    output("无 step 数量分布");
  } else {
    output("steps spinCount spinPercent");
    for (const entry of snapshot.stepCountDistribution) {
      output(
        `${entry.steps} ${entry.spinCount} ${formatPercent(
          entry.spinProbability,
        )}`,
      );
    }
  }
}

function createLogic(
  outcome: SpinOutcome,
  request: SpinRequestConfig,
  gameid?: number,
) {
  try {
    return createGameLogicFromGmi(outcome.gmi, {
      bet: request.bet,
      lines: request.lines,
      totalwin: outcome.totalwin,
      ...(gameid === undefined ? {} : { gameid }),
    });
  } catch (error) {
    throw new Error(`logiccore 解析 gmi 失败：${formatUnknown(error)}`);
  }
}

function assertLogicMatchesSpin(
  logic: ReturnType<typeof createGameLogicFromGmi>,
  outcome: SpinOutcome,
  request: SpinRequestConfig,
): void {
  if (logic.getStepCount() !== outcome.replyPlayResultsLength) {
    throw new Error(
      `logiccore step 数与 replyPlay.results.length 不一致：logic=${logic.getStepCount()}, replyPlay=${outcome.replyPlayResultsLength}`,
    );
  }
  if (logic.getTotalWin() !== outcome.totalwin) {
    throw new Error(
      `logiccore totalwin 与 spin() 返回不一致：logic=${logic.getTotalWin()}, spin=${outcome.totalwin}`,
    );
  }
  if (logic.getBet() !== request.bet) {
    throw new Error(
      `logiccore bet 与请求不一致：logic=${logic.getBet()}, request=${request.bet}`,
    );
  }
  if (logic.getLines() !== request.lines) {
    throw new Error(
      `logiccore lines 与请求不一致：logic=${logic.getLines()}, request=${request.lines}`,
    );
  }
}

function addResults(
  state: GameplayStatsState,
  resultTrackers: Record<ResultDistributionField, ResultFieldSpinTracker>,
  results: readonly WinResult[],
): void {
  state.totalResults += results.length;

  for (const result of results) {
    if (typeof result.cashWin === "number" && result.cashWin > 0) {
      state.cashWinResultCount += 1;
    }
    if (typeof result.coinWin === "number" && result.coinWin > 0) {
      state.coinWinResultCount += 1;
    }

    for (const field of RESULT_FIELDS) {
      addResultFieldValue(state.resultFields[field], resultTrackers[field], {
        hasField: Object.prototype.hasOwnProperty.call(result, field),
        value: result[field],
      });
    }
  }
}

function addResultFieldValue(
  fieldState: ResultFieldDistributionState,
  tracker: ResultFieldSpinTracker,
  fieldValue: { hasField: boolean; value: unknown },
): void {
  if (!fieldValue.hasField) {
    fieldState.missingCount += 1;
    tracker.missing = true;
    return;
  }

  const displayValue = formatPrimitiveValue(fieldValue.value);
  if (displayValue === undefined) {
    fieldState.invalidCount += 1;
    tracker.invalid = true;
    return;
  }

  const key = `${typeof fieldValue.value}:${displayValue}`;
  const entry = fieldState.values.get(key) ?? {
    value: displayValue,
    resultCount: 0,
    spinCount: 0,
  };
  entry.resultCount += 1;
  fieldState.values.set(key, entry);
  tracker.values.add(key);
}

function commitResultFieldSpinCounts(
  state: GameplayStatsState,
  resultTrackers: Record<ResultDistributionField, ResultFieldSpinTracker>,
): void {
  for (const field of RESULT_FIELDS) {
    const fieldState = state.resultFields[field];
    const tracker = resultTrackers[field];

    for (const key of tracker.values) {
      const entry = fieldState.values.get(key);
      if (!entry) {
        throw new Error(`result.${field} 分布缺少 spin 级计数目标：${key}`);
      }
      entry.spinCount += 1;
    }
    if (tracker.missing) {
      fieldState.missingSpinCount += 1;
    }
    if (tracker.invalid) {
      fieldState.invalidSpinCount += 1;
    }
  }
}

function addCurGameMod(
  state: GameplayStatsState,
  curGameMod: string | undefined,
): void {
  if (curGameMod === undefined) {
    state.missingCurGameModSteps += 1;
    return;
  }

  incrementMap(state.curGameModDistribution, curGameMod, 1);
}

function readHistoryComponents(step: GameLogicStep): readonly string[] {
  const param = step.getCurGameModParam();
  if (!param || typeof param !== "object" || Array.isArray(param)) {
    throw new Error(
      `step[${step.getIndex()}].curGameModParam 必须是对象才能读取 historyComponents`,
    );
  }

  const historyComponents = (param as { historyComponents?: unknown })
    .historyComponents;
  if (!Array.isArray(historyComponents)) {
    throw new Error(
      `step[${step.getIndex()}].curGameModParam.historyComponents 必须是 string[]`,
    );
  }

  for (const [index, name] of historyComponents.entries()) {
    if (typeof name !== "string" || name.length === 0) {
      throw new Error(
        `step[${step.getIndex()}].curGameModParam.historyComponents[${index}] 必须是非空 string`,
      );
    }
  }

  return historyComponents;
}

function readComponent(
  step: GameLogicStep,
  componentName: string,
): LogicComponent {
  const component = step.getComponent(componentName);
  if (!component) {
    throw new Error(
      `step[${step.getIndex()}] historyComponents 中的组件 ${componentName} 无法通过 logiccore 读取`,
    );
  }

  return component;
}

function ensureComponentStats(
  components: Map<string, ComponentStatsState>,
  name: string,
): ComponentStatsState {
  const existing = components.get(name);
  if (existing) {
    return existing;
  }

  const created: ComponentStatsState = {
    triggeredSpins: 0,
    triggeredSteps: 0,
    totalTriggers: 0,
    duplicateTriggerSteps: 0,
    duplicateTriggers: 0,
    winsWhenTriggered: 0,
    cashWinWhenTriggered: 0,
    coinWinWhenTriggered: 0,
    withBasicComponentData: 0,
    withoutBasicComponentData: 0,
    usedSceneCount: 0,
    usedResultCount: 0,
  };
  components.set(name, created);
  return created;
}

function snapshotFromState(state: GameplayStatsState): GameplayStatsSnapshot {
  return {
    completedSpins: state.completedSpins,
    winningSpins: state.winningSpins,
    winningSpinProbability: divideOrZero(
      state.winningSpins,
      state.completedSpins,
    ),
    zeroWinSpins: state.zeroWinSpins,
    zeroWinSpinProbability: divideOrZero(
      state.zeroWinSpins,
      state.completedSpins,
    ),
    multiStepSpins: state.multiStepSpins,
    multiStepSpinProbability: divideOrZero(
      state.multiStepSpins,
      state.completedSpins,
    ),
    spinWithAnyResult: state.spinWithAnyResult,
    spinWithAnyResultProbability: divideOrZero(
      state.spinWithAnyResult,
      state.completedSpins,
    ),
    spinWithAnyComponent: state.spinWithAnyComponent,
    spinWithAnyComponentProbability: divideOrZero(
      state.spinWithAnyComponent,
      state.completedSpins,
    ),
    winMultiplierDistribution: WIN_MULTIPLIER_BUCKETS.map((bucket) => {
      const spinCount = state.winMultiplierDistribution.get(bucket.label) ?? 0;
      return {
        label: bucket.label,
        spinCount,
        spinProbability: divideOrZero(spinCount, state.completedSpins),
      };
    }),
    totalSteps: state.totalSteps,
    avgStepsPerSpin: divideOrZero(state.totalSteps, state.completedSpins),
    stepWinCount: state.stepWinCount,
    stepWinProbability: divideOrZero(state.stepWinCount, state.totalSteps),
    stepWithResultCount: state.stepWithResultCount,
    stepWithResultProbability: divideOrZero(
      state.stepWithResultCount,
      state.totalSteps,
    ),
    stepWithComponentCount: state.stepWithComponentCount,
    stepWithComponentProbability: divideOrZero(
      state.stepWithComponentCount,
      state.totalSteps,
    ),
    stepCountDistribution: sortNumberDistribution(
      state.stepCountDistribution,
    ).map(([steps, spinCount]) => ({
      steps,
      spinCount,
      spinProbability: divideOrZero(spinCount, state.completedSpins),
    })),
    totalResults: state.totalResults,
    avgResultsPerSpin: divideOrZero(state.totalResults, state.completedSpins),
    avgResultsPerStep: divideOrZero(state.totalResults, state.totalSteps),
    cashWinResultCount: state.cashWinResultCount,
    cashWinResultProbability: divideOrZero(
      state.cashWinResultCount,
      state.totalResults,
    ),
    coinWinResultCount: state.coinWinResultCount,
    coinWinResultProbability: divideOrZero(
      state.coinWinResultCount,
      state.totalResults,
    ),
    components: snapshotComponents(state),
    resultFields: snapshotResultFields(state),
    curGameModDistribution: sortStringDistribution(
      state.curGameModDistribution,
    ).map(([value, stepCount]) => ({
      value,
      stepCount,
      stepProbability: divideOrZero(stepCount, state.totalSteps),
    })),
    missingCurGameModSteps: state.missingCurGameModSteps,
    missingCurGameModStepProbability: divideOrZero(
      state.missingCurGameModSteps,
      state.totalSteps,
    ),
  };
}

function snapshotComponents(
  state: GameplayStatsState,
): ComponentStatsSnapshot[] {
  return [...state.components.entries()]
    .map(([name, component]) => ({
      name,
      triggeredSpins: component.triggeredSpins,
      spinTriggerProbability: divideOrZero(
        component.triggeredSpins,
        state.completedSpins,
      ),
      triggeredSteps: component.triggeredSteps,
      stepTriggerProbability: divideOrZero(
        component.triggeredSteps,
        state.totalSteps,
      ),
      totalTriggers: component.totalTriggers,
      duplicateTriggerSteps: component.duplicateTriggerSteps,
      duplicateTriggers: component.duplicateTriggers,
      winsWhenTriggered: component.winsWhenTriggered,
      winProbabilityWhenTriggered: divideOrZero(
        component.winsWhenTriggered,
        component.triggeredSteps,
      ),
      cashWinWhenTriggered: component.cashWinWhenTriggered,
      coinWinWhenTriggered: component.coinWinWhenTriggered,
      avgCashWinWhenTriggered: divideOrZero(
        component.cashWinWhenTriggered,
        component.triggeredSteps,
      ),
      avgCoinWinWhenTriggered: divideOrZero(
        component.coinWinWhenTriggered,
        component.triggeredSteps,
      ),
      withBasicComponentData: component.withBasicComponentData,
      withoutBasicComponentData: component.withoutBasicComponentData,
      usedSceneCount: component.usedSceneCount,
      usedResultCount: component.usedResultCount,
    }))
    .sort((left, right) => {
      const countDiff = right.totalTriggers - left.totalTriggers;
      return countDiff === 0 ? left.name.localeCompare(right.name) : countDiff;
    });
}

function snapshotResultFields(
  state: GameplayStatsState,
): Record<ResultDistributionField, ResultFieldDistributionSnapshot> {
  return Object.fromEntries(
    RESULT_FIELDS.map((field) => {
      const fieldState = state.resultFields[field];
      const snapshot: ResultFieldDistributionSnapshot = {
        field,
        resultDenominator: state.totalResults,
        spinDenominator: state.completedSpins,
        values: [...fieldState.values.values()]
          .map((entry) => ({
            value: entry.value,
            resultCount: entry.resultCount,
            resultProbability: divideOrZero(
              entry.resultCount,
              state.totalResults,
            ),
            spinCount: entry.spinCount,
            spinProbability: divideOrZero(entry.spinCount, state.completedSpins),
          }))
          .sort((left, right) => {
            const countDiff = right.resultCount - left.resultCount;
            return countDiff === 0
              ? left.value.localeCompare(right.value)
              : countDiff;
          }),
        missingCount: fieldState.missingCount,
        missingProbability: divideOrZero(
          fieldState.missingCount,
          state.totalResults,
        ),
        missingSpinCount: fieldState.missingSpinCount,
        missingSpinProbability: divideOrZero(
          fieldState.missingSpinCount,
          state.completedSpins,
        ),
        invalidCount: fieldState.invalidCount,
        invalidProbability: divideOrZero(
          fieldState.invalidCount,
          state.totalResults,
        ),
        invalidSpinCount: fieldState.invalidSpinCount,
        invalidSpinProbability: divideOrZero(
          fieldState.invalidSpinCount,
          state.completedSpins,
        ),
      };
      return [field, snapshot];
    }),
  ) as Record<ResultDistributionField, ResultFieldDistributionSnapshot>;
}

function outputResultFieldDistribution(
  distribution: ResultFieldDistributionSnapshot,
  output: OutputSink,
): void {
  output(`result.${distribution.field} 分布`);
  output(`resultDenominator: ${distribution.resultDenominator}`);
  output(`spinDenominator: ${distribution.spinDenominator}`);
  output("value resultCount resultPercent spinCount spinPercent");
  if (
    distribution.values.length === 0 &&
    distribution.missingCount === 0 &&
    distribution.invalidCount === 0
  ) {
    output("无 result");
  }
  for (const entry of distribution.values) {
    output(
      `${entry.value} ${entry.resultCount} ${formatPercent(
        entry.resultProbability,
      )} ${entry.spinCount} ${formatPercent(entry.spinProbability)}`,
    );
  }
  output(
    `missingCount: ${distribution.missingCount} ${formatPercent(
      distribution.missingProbability,
    )}`,
  );
  output(
    `missingSpinCount: ${distribution.missingSpinCount} ${formatPercent(
      distribution.missingSpinProbability,
    )}`,
  );
  output(
    `invalidCount: ${distribution.invalidCount} ${formatPercent(
      distribution.invalidProbability,
    )}`,
  );
  output(
    `invalidSpinCount: ${distribution.invalidSpinCount} ${formatPercent(
      distribution.invalidSpinProbability,
    )}`,
  );
}

function createEmptyState(): GameplayStatsState {
  return {
    completedSpins: 0,
    winningSpins: 0,
    zeroWinSpins: 0,
    multiStepSpins: 0,
    spinWithAnyResult: 0,
    spinWithAnyComponent: 0,
    winMultiplierDistribution: new Map(),
    totalSteps: 0,
    stepWinCount: 0,
    stepWithResultCount: 0,
    stepWithComponentCount: 0,
    stepCountDistribution: new Map(),
    totalResults: 0,
    cashWinResultCount: 0,
    coinWinResultCount: 0,
    components: new Map(),
    resultFields: createEmptyResultFields(),
    curGameModDistribution: new Map(),
    missingCurGameModSteps: 0,
  };
}

function createEmptyResultFields(): Record<
  ResultDistributionField,
  ResultFieldDistributionState
> {
  return Object.fromEntries(
    RESULT_FIELDS.map((field) => [
      field,
      {
        values: new Map<string, ResultFieldValueState>(),
        missingCount: 0,
        missingSpinCount: 0,
        invalidCount: 0,
        invalidSpinCount: 0,
      },
    ]),
  ) as Record<ResultDistributionField, ResultFieldDistributionState>;
}

function createResultFieldSpinTrackers(): Record<
  ResultDistributionField,
  ResultFieldSpinTracker
> {
  return Object.fromEntries(
    RESULT_FIELDS.map((field) => [
      field,
      { values: new Set<string>(), missing: false, invalid: false },
    ]),
  ) as Record<ResultDistributionField, ResultFieldSpinTracker>;
}

function cloneState(state: GameplayStatsState): GameplayStatsState {
  return {
    ...state,
    winMultiplierDistribution: new Map(state.winMultiplierDistribution),
    stepCountDistribution: new Map(state.stepCountDistribution),
    components: new Map(
      [...state.components.entries()].map(([name, component]) => [
        name,
        { ...component },
      ]),
    ),
    resultFields: Object.fromEntries(
      RESULT_FIELDS.map((field) => {
        const fieldState = state.resultFields[field];
        return [
          field,
          {
            ...fieldState,
            values: new Map(
              [...fieldState.values.entries()].map(([key, value]) => [
                key,
                { ...value },
              ]),
            ),
          },
        ];
      }),
    ) as Record<ResultDistributionField, ResultFieldDistributionState>,
    curGameModDistribution: new Map(state.curGameModDistribution),
  };
}

function getWinMultiplierBucket(multiplier: number): string {
  const bucket = WIN_MULTIPLIER_BUCKETS.find((candidate) =>
    candidate.matches(multiplier),
  );

  if (!bucket) {
    throw new Error(`无法归类中奖倍数：${multiplier}`);
  }

  return bucket.label;
}

function formatWinMultiplierOutputName(label: string): string {
  if (label.startsWith("[")) {
    return `winMultiplier${label}`;
  }

  return `winMultiplier[${label}]`;
}

function formatPrimitiveValue(value: unknown): string | undefined {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(value);
  }
  if (typeof value === "boolean") {
    return String(value);
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : undefined;
  }

  return undefined;
}

function incrementMap<K>(map: Map<K, number>, key: K, amount: number): void {
  if (!Number.isInteger(amount) || amount < 0) {
    throw new Error(`Map 计数增量必须是非负整数：${amount}`);
  }
  map.set(key, (map.get(key) ?? 0) + amount);
}

function sortStringDistribution(map: Map<string, number>): [string, number][] {
  return [...map.entries()].sort((left, right) => {
    const countDiff = right[1] - left[1];
    return countDiff === 0 ? left[0].localeCompare(right[0]) : countDiff;
  });
}

function sortNumberDistribution(map: Map<number, number>): [number, number][] {
  return [...map.entries()].sort((left, right) => {
    const countDiff = right[1] - left[1];
    return countDiff === 0 ? left[0] - right[0] : countDiff;
  });
}

function divideOrZero(numerator: number, denominator: number): number {
  assertFiniteNumber(numerator, "probability numerator");
  assertFiniteNumber(denominator, "probability denominator");
  if (denominator < 0) {
    throw new Error(`概率分母必须是非负数字：${denominator}`);
  }
  if (denominator === 0) {
    return 0;
  }

  return numerator / denominator;
}

function formatProbability(value: number): string {
  assertFiniteNumber(value, "probability");
  return Number(value.toFixed(6)).toString();
}

function formatPercent(probability: number): string {
  assertFiniteNumber(probability, "percent probability");
  return `${(probability * 100).toFixed(4)}%`;
}

function formatUnknown(value: unknown): string {
  if (value instanceof Error) {
    return value.message;
  }
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
