import { LogicParseError } from "./errors";
import { GameLogicStep, SceneMatrix, WinResult } from "./types";
import { freezeArray } from "./validation";

export interface WinResultPosition {
  readonly x: number;
  readonly y: number;
}

export interface ComponentWinResultGroup {
  readonly stepIndex: number;
  readonly resultIndex: number;
  readonly result: WinResult;
  readonly positions: readonly WinResultPosition[];
}

export interface ComponentWinResultPositionValidationContext {
  readonly stepIndex: number;
  readonly componentName: string;
  readonly resultIndex: number;
  readonly result: WinResult;
  readonly position: WinResultPosition;
  readonly scene: SceneMatrix;
  readonly sceneSymbol: number;
}

export type ComponentWinResultPositionValidator = (
  context: ComponentWinResultPositionValidationContext,
) => void;

export interface ComponentWinResultGroupOptions {
  readonly scene?: SceneMatrix;
  readonly validatePosition?: ComponentWinResultPositionValidator;
}

export function parseWinResultPositions(
  result: WinResult,
  label = "win result",
): readonly WinResultPosition[] {
  const pos = result.pos;
  if (!Array.isArray(pos)) {
    throw new LogicParseError(`${label}.pos must be an array.`);
  }
  if (pos.length % 2 !== 0) {
    throw new LogicParseError(`${label}.pos must contain x/y pairs.`);
  }

  const seen = new Set<string>();
  const positions: WinResultPosition[] = [];
  for (let index = 0; index < pos.length; index += 2) {
    const x = assertNonNegativeInteger(pos[index], `${label}.pos[${index}]`);
    const y = assertNonNegativeInteger(
      pos[index + 1],
      `${label}.pos[${index + 1}]`,
    );
    const key = `${x},${y}`;
    if (seen.has(key)) {
      throw new LogicParseError(
        `${label}.pos contains duplicate coordinate (${x}, ${y}).`,
      );
    }
    seen.add(key);
    positions.push(Object.freeze({ x, y }));
  }

  return freezeArray(positions);
}

export function getComponentWinResultGroups(
  step: GameLogicStep,
  componentName: string,
  options: ComponentWinResultGroupOptions = {},
): readonly ComponentWinResultGroup[] {
  if (typeof componentName !== "string" || componentName.trim().length === 0) {
    throw new LogicParseError("componentName must be a non-empty string.");
  }

  const component = step.getComponent(componentName);
  if (component === undefined || !component.hasBasicComponentData) {
    return freezeArray([]);
  }

  if (options.validatePosition !== undefined && options.scene === undefined) {
    throw new LogicParseError(
      "scene is required when validatePosition is provided.",
    );
  }

  return freezeArray(
    component.usedResultIndexes.map((resultIndex) => {
      const result = step.getResult(resultIndex);
      const label = `step[${step.getIndex()}] component "${componentName}" result[${resultIndex}]`;
      const positions = parseWinResultPositions(result, label);
      if (positions.length === 0) {
        throw new LogicParseError(
          `${label}.pos must contain at least one coordinate.`,
        );
      }

      validatePositionsInScene(positions, options.scene, label);
      validatePositionsWithCallback(
        positions,
        result,
        resultIndex,
        step.getIndex(),
        componentName,
        options,
      );

      return Object.freeze({
        stepIndex: step.getIndex(),
        resultIndex,
        result,
        positions,
      });
    }),
  );
}

function validatePositionsInScene(
  positions: readonly WinResultPosition[],
  scene: SceneMatrix | undefined,
  label: string,
): void {
  if (scene === undefined) {
    return;
  }

  for (const position of positions) {
    const column = scene[position.x];
    if (!Array.isArray(column) || position.y >= column.length) {
      throw new LogicParseError(
        `${label}.pos coordinate (${position.x}, ${position.y}) is out of scene bounds.`,
      );
    }
  }
}

function validatePositionsWithCallback(
  positions: readonly WinResultPosition[],
  result: WinResult,
  resultIndex: number,
  stepIndex: number,
  componentName: string,
  options: ComponentWinResultGroupOptions,
): void {
  if (options.validatePosition === undefined) {
    return;
  }
  const scene = options.scene;
  if (scene === undefined) {
    throw new LogicParseError(
      "scene is required when validatePosition is provided.",
    );
  }

  for (const position of positions) {
    options.validatePosition(
      Object.freeze({
        stepIndex,
        componentName,
        resultIndex,
        result,
        position,
        scene,
        sceneSymbol: scene[position.x][position.y],
      }),
    );
  }
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new LogicParseError(`${label} must be a non-negative integer.`);
  }

  return value;
}
