import {
  getComponentOtherScenesByName,
  type GameLogic,
  type OtherSceneMatrix,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import { validateGame003Scene } from "./scene.js";

export const GAME003_COIN_OVERLAY_COMPONENT_NAME = "bg-gencoins";
export const GAME003_COIN_SYMBOL = "CO";

export interface Game003CoinOverlayItem {
  readonly x: number;
  readonly y: number;
  readonly amount: number;
  readonly text: string;
}

export function createGame003CoinOverlayItems(options: {
  readonly logic: GameLogic;
  readonly targetScene: SceneMatrix;
  readonly coinSymbolCode: number;
  readonly componentName: "bg-gencoins";
}): readonly Game003CoinOverlayItem[] {
  if (options.componentName !== GAME003_COIN_OVERLAY_COMPONENT_NAME) {
    throw new Error(
      `game003 coin overlay componentName must be ${GAME003_COIN_OVERLAY_COMPONENT_NAME}.`,
    );
  }
  const coinSymbolCode = assertNonNegativeInteger(
    options.coinSymbolCode,
    "game003 coin overlay coinSymbolCode",
  );
  const targetScene = validateGame003Scene(
    options.targetScene,
    "game003 coin overlay target scene",
  );
  const step = options.logic.getStep(0);
  if (!step.hasComponent(options.componentName)) {
    return Object.freeze([]);
  }

  const component = step.getComponent(options.componentName);
  if (!component || !component.hasBasicComponentData) {
    throw new Error(
      "game003 bg-gencoins component must include basicComponentData.",
    );
  }

  const otherScenes = getComponentOtherScenesByName(
    options.logic,
    options.componentName,
    { stepIndex: 0 },
  );
  if (otherScenes.length > 1) {
    throw new Error(
      `game003 bg-gencoins must use at most one otherScene, received ${otherScenes.length}.`,
    );
  }
  if (otherScenes.length === 0) {
    return Object.freeze([]);
  }

  const otherScene = validateCoinOtherScene(
    otherScenes[0],
    targetScene,
    "game003 bg-gencoins otherScene[0]",
  );
  const items: Game003CoinOverlayItem[] = [];
  for (const [x, column] of targetScene.entries()) {
    for (const [y, symbolCode] of column.entries()) {
      const amount = otherScene[x][y];
      if (symbolCode === coinSymbolCode) {
        if (amount <= 0) {
          throw new Error(
            `game003 coin overlay CO cell [${x}][${y}] must have a positive coin amount.`,
          );
        }
        items.push(
          Object.freeze({
            x,
            y,
            amount,
            text: String(amount),
          }),
        );
      } else if (amount !== 0) {
        throw new Error(
          `game003 coin overlay non-CO cell [${x}][${y}] must have amount 0.`,
        );
      }
    }
  }
  return Object.freeze(items);
}

function validateCoinOtherScene(
  otherScene: OtherSceneMatrix,
  targetScene: SceneMatrix,
  label: string,
): OtherSceneMatrix {
  if (!Array.isArray(otherScene)) {
    throw new Error(`${label} must be an array.`);
  }
  if (otherScene.length !== targetScene.length) {
    throw new Error(`${label} width must match target scene.`);
  }

  return Object.freeze(
    otherScene.map((column, x) => {
      if (!Array.isArray(column)) {
        throw new Error(`${label}[${x}] must be an array.`);
      }
      if (column.length !== targetScene[x].length) {
        throw new Error(`${label}[${x}] height must match target scene.`);
      }
      return Object.freeze(
        column.map((amount, y) =>
          assertNonNegativeInteger(amount, `${label}[${x}][${y}]`),
        ),
      );
    }),
  );
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}
