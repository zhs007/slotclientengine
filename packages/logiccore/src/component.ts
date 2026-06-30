import { LogicParseError } from "./errors";
import {
  BasicComponentData,
  LogicComponent,
  ParsedGameLogicStepData,
  SceneMatrix,
  WinResult,
} from "./types";
import {
  assertNonNegativeIntegerArray,
  assertRecord,
  freezeArray,
  hasOwn,
} from "./validation";

export function hasTriggeredComponent(
  step: ParsedGameLogicStepData,
  name: string,
): boolean {
  return step.historyComponents.includes(name);
}

export function buildLogicComponent(
  step: ParsedGameLogicStepData,
  name: string,
): LogicComponent | undefined {
  if (!hasTriggeredComponent(step, name)) {
    return undefined;
  }

  if (!hasOwn(step.mapComponents, name)) {
    throw new LogicParseError(
      `step[${step.index}] component "${name}" is missing in mapComponents.`,
    );
  }

  const raw = assertRecord(
    step.mapComponents[name],
    `step[${step.index}].mapComponents.${name}`,
  );

  if (!hasOwn(raw, "basicComponentData")) {
    return freezeComponent({
      name,
      raw,
      hasBasicComponentData: false,
      usedSceneIndexes: [],
      usedResultIndexes: [],
    });
  }

  const basicComponentData = assertRecord(
    raw.basicComponentData,
    `step[${step.index}].mapComponents.${name}.basicComponentData`,
  ) as unknown as BasicComponentData;
  const usedSceneIndexes = assertNonNegativeIntegerArray(
    basicComponentData.usedScenes,
    `step[${step.index}].mapComponents.${name}.basicComponentData.usedScenes`,
  );
  const usedResultIndexes = assertNonNegativeIntegerArray(
    basicComponentData.usedResults,
    `step[${step.index}].mapComponents.${name}.basicComponentData.usedResults`,
  );

  assertIndexesInRange(
    usedSceneIndexes,
    step.scenes.length,
    "scene",
    step.index,
    name,
  );
  assertIndexesInRange(
    usedResultIndexes,
    step.results.length,
    "result",
    step.index,
    name,
  );

  return freezeComponent({
    name,
    raw,
    hasBasicComponentData: true,
    basicComponentData,
    usedSceneIndexes,
    usedResultIndexes,
  });
}

export function getComponentScenesForStep(
  step: ParsedGameLogicStepData,
  name: string,
): readonly SceneMatrix[] {
  const component = buildLogicComponent(step, name);

  if (component === undefined || !component.hasBasicComponentData) {
    return freezeArray([]);
  }

  return freezeArray(
    component.usedSceneIndexes.map((index) => step.scenes[index]),
  );
}

export function getComponentResultsForStep(
  step: ParsedGameLogicStepData,
  name: string,
): readonly WinResult[] {
  const component = buildLogicComponent(step, name);

  if (component === undefined || !component.hasBasicComponentData) {
    return freezeArray([]);
  }

  return freezeArray(
    component.usedResultIndexes.map((index) => step.results[index]),
  );
}

function assertIndexesInRange(
  indexes: readonly number[],
  length: number,
  target: "scene" | "result",
  stepIndex: number,
  componentName: string,
): void {
  for (const index of indexes) {
    if (index >= length) {
      throw new LogicParseError(
        `step[${stepIndex}] component "${componentName}" used ${target} index ${index} is out of range.`,
      );
    }
  }
}

function freezeComponent(component: LogicComponent): LogicComponent {
  return Object.freeze({
    ...component,
    usedSceneIndexes: freezeArray(component.usedSceneIndexes),
    usedResultIndexes: freezeArray(component.usedResultIndexes),
  });
}
