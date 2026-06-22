import {
  findComponentSteps,
  getComponentResultsByName,
  getComponentScenesByName,
  type GameLogic,
  type SlotGameBetOption,
} from "@slotclientengine/gameframeworks";

export interface FormatLogicMessageOptions {
  readonly spinId: number;
  readonly logic: GameLogic;
  readonly betOption: SlotGameBetOption;
  readonly componentNames: readonly string[];
}

export function formatLogicMessage(
  options: FormatLogicMessageOptions,
): readonly string[] {
  const lines: string[] = [
    `#${options.spinId} bet=${options.betOption.bet} lines=${options.betOption.lines} times=${options.betOption.times ?? 1}`,
    `totalwin=${options.logic.getTotalWin()} steps=${options.logic.getStepCount()} results=${countResults(options.logic)}`,
  ];

  for (const step of options.logic.getSteps()) {
    lines.push(
      `step[${step.getIndex()}] cashWin=${step.getCashWin()} coinWin=${step.getCoinWin()} scenes=${step.getSceneCount()} results=${step.getResultCount()}`,
    );
  }

  for (const name of options.componentNames) {
    const steps = findComponentSteps(options.logic, name);
    const sceneCount = getComponentScenesByName(options.logic, name).length;
    const resultCount = getComponentResultsByName(options.logic, name).length;
    lines.push(
      `component ${name}: steps=${steps.length === 0 ? "none" : steps.join(",")} scenes=${sceneCount} results=${resultCount}`,
    );
  }

  return Object.freeze(lines);
}

function countResults(logic: GameLogic): number {
  return logic
    .getSteps()
    .reduce((total, step) => total + step.getResultCount(), 0);
}
