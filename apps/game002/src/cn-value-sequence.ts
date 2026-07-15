import {
  getComponentOtherScenesByName,
  type GameLogic,
  type OtherSceneMatrix,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import { validateGame002Scene } from "./scene.js";

export const GAME002_CN_VALUE_COMPONENT_NAME = "bg-gencoins";
export const GAME002_CN_VALUE_SYMBOL = "CN";

export interface Game002CnValueItem {
  readonly x: number;
  readonly y: number;
  readonly symbol: "CN";
  readonly symbolCode: number;
  readonly value: number;
}

export function createGame002CnValueItems(options: {
  readonly logic: GameLogic;
  readonly targetScene: SceneMatrix;
  readonly cnSymbolCode: number;
  readonly componentName: "bg-gencoins";
  readonly stepIndex: number;
}): readonly Game002CnValueItem[] {
  if (options.componentName !== GAME002_CN_VALUE_COMPONENT_NAME) {
    throw new Error(
      `game002 CN value componentName must be ${GAME002_CN_VALUE_COMPONENT_NAME}.`,
    );
  }
  const cnSymbolCode = assertNonNegativeSafeInteger(
    options.cnSymbolCode,
    "game002 CN symbolCode",
  );
  const targetScene = validateGame002Scene(
    options.targetScene,
    "game002 CN value target scene",
  );
  const stepIndex = assertNonNegativeSafeInteger(
    options.stepIndex,
    "game002 CN stepIndex",
  );
  const step = options.logic.getStep(stepIndex);
  if (!step.hasComponent(options.componentName)) {
    return Object.freeze([]);
  }
  const component = step.getComponent(options.componentName);
  if (!component || !component.hasBasicComponentData) {
    throw new Error(
      "game002 bg-gencoins component must include basicComponentData.",
    );
  }
  const otherScenes = getComponentOtherScenesByName(
    options.logic,
    options.componentName,
    { stepIndex },
  );
  if (otherScenes.length !== 1) {
    throw new Error(
      `game002 bg-gencoins must use exactly one otherScene, received ${otherScenes.length}.`,
    );
  }
  const otherScene = validateOtherScene(
    otherScenes[0],
    targetScene,
    `game002 step[${stepIndex}] bg-gencoins otherScene[0]`,
  );
  const items: Game002CnValueItem[] = [];
  for (const [x, column] of targetScene.entries()) {
    for (const [y, symbolCode] of column.entries()) {
      const value = otherScene[x][y];
      if (symbolCode === cnSymbolCode) {
        if (value <= 0) {
          throw new Error(
            `game002 CN cell [${x}][${y}] must have a positive value.`,
          );
        }
        items.push(
          Object.freeze({
            x,
            y,
            symbol: GAME002_CN_VALUE_SYMBOL,
            symbolCode: cnSymbolCode,
            value,
          }),
        );
      } else if (value !== 0) {
        throw new Error(`game002 non-CN cell [${x}][${y}] must have value 0.`);
      }
    }
  }
  return Object.freeze(items);
}

export function createGame002CnPresentationValues(options: {
  readonly targetScene: SceneMatrix;
  readonly items: readonly Game002CnValueItem[];
}): readonly (readonly (number | null)[])[] {
  const targetScene = validateGame002Scene(
    options.targetScene,
    "game002 CN presentation target scene",
  );
  const values: Array<Array<number | null>> = targetScene.map((column) =>
    column.map(() => null),
  );
  const seen = new Set<string>();
  for (const [index, item] of options.items.entries()) {
    if (!item || typeof item !== "object") {
      throw new Error(`game002 CN value item ${index} is invalid.`);
    }
    const x = assertNonNegativeSafeInteger(
      item.x,
      `game002 CN value item ${index} x`,
    );
    const y = assertNonNegativeSafeInteger(
      item.y,
      `game002 CN value item ${index} y`,
    );
    const value = assertNonNegativeSafeInteger(
      item.value,
      `game002 CN value item ${index} value`,
    );
    const key = `${x},${y}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate game002 CN value item position ${key}.`);
    }
    seen.add(key);
    if (value <= 0) {
      throw new Error(`game002 CN value item ${index} value must be positive.`);
    }
    if (
      item.symbol !== GAME002_CN_VALUE_SYMBOL ||
      targetScene[x]?.[y] !== item.symbolCode
    ) {
      throw new Error(
        `game002 CN value item ${index} does not match target scene [${x}][${y}].`,
      );
    }
    values[x]![y] = value;
  }
  return Object.freeze(values.map((column) => Object.freeze(column)));
}

function validateOtherScene(
  otherScene: OtherSceneMatrix,
  targetScene: SceneMatrix,
  label: string,
): OtherSceneMatrix {
  if (!Array.isArray(otherScene) || otherScene.length !== targetScene.length) {
    throw new Error(`${label} width must match target scene.`);
  }
  return Object.freeze(
    otherScene.map((column, x) => {
      if (!Array.isArray(column) || column.length !== targetScene[x].length) {
        throw new Error(`${label}[${x}] height must match target scene.`);
      }
      return Object.freeze(
        column.map((value, y) =>
          assertNonNegativeSafeInteger(value, `${label}[${x}][${y}]`),
        ),
      );
    }),
  );
}

function assertNonNegativeSafeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value;
}
