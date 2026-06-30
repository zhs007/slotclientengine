import { SlotGameConfigError } from "./errors.js";
import { getComponentWinResultGroups } from "@slotclientengine/logiccore";
import type {
  ComponentWinResultGroup,
  ComponentWinResultPositionValidator,
  GameLogic,
  SceneMatrix,
  WinResult,
} from "./types.js";

export function findComponentSteps(
  logic: GameLogic,
  name: string,
): readonly number[] {
  const componentName = validateComponentName(name);
  const indexes: number[] = [];
  for (let index = 0; index < logic.getStepCount(); index += 1) {
    if (logic.hasComponent(index, componentName)) {
      indexes.push(index);
    }
  }
  return Object.freeze(indexes);
}

export function getComponentScenesByName(
  logic: GameLogic,
  name: string,
  options: { readonly stepIndex?: number } = {},
): readonly SceneMatrix[] {
  const componentName = validateComponentName(name);
  const steps = getTargetStepIndexes(logic, componentName, options.stepIndex);
  return Object.freeze(
    steps.flatMap((stepIndex) =>
      Array.from(logic.getComponentScenes(stepIndex, componentName)),
    ),
  );
}

export function getComponentResultsByName(
  logic: GameLogic,
  name: string,
  options: { readonly stepIndex?: number } = {},
): readonly WinResult[] {
  const componentName = validateComponentName(name);
  const steps = getTargetStepIndexes(logic, componentName, options.stepIndex);
  return Object.freeze(
    steps.flatMap((stepIndex) =>
      Array.from(logic.getComponentResults(stepIndex, componentName)),
    ),
  );
}

export function getComponentWinResultGroupsByName(
  logic: GameLogic,
  name: string,
  options: {
    readonly stepIndex?: number;
    readonly scene?: SceneMatrix;
    readonly validatePosition?: ComponentWinResultPositionValidator;
  } = {},
): readonly ComponentWinResultGroup[] {
  const componentName = validateComponentName(name);
  const steps = getTargetStepIndexes(logic, componentName, options.stepIndex);
  return Object.freeze(
    steps.flatMap((stepIndex) =>
      Array.from(
        getComponentWinResultGroups(logic.getStep(stepIndex), componentName, {
          scene: options.scene,
          validatePosition: options.validatePosition,
        }),
      ),
    ),
  );
}

function getTargetStepIndexes(
  logic: GameLogic,
  name: string,
  stepIndex: number | undefined,
): readonly number[] {
  if (stepIndex !== undefined) {
    assertStepIndex(logic, stepIndex);
    return logic.hasComponent(stepIndex, name)
      ? Object.freeze([stepIndex])
      : Object.freeze([]);
  }
  return findComponentSteps(logic, name);
}

function validateComponentName(name: string): string {
  if (typeof name !== "string" || name.trim().length === 0) {
    throw new SlotGameConfigError("component name must be a non-empty string.");
  }
  return name;
}

function assertStepIndex(logic: GameLogic, stepIndex: number): void {
  if (
    !Number.isInteger(stepIndex) ||
    stepIndex < 0 ||
    stepIndex >= logic.getStepCount()
  ) {
    throw new SlotGameConfigError(`stepIndex ${stepIndex} is out of range.`);
  }
}
