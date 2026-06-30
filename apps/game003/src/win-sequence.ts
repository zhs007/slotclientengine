import {
  getComponentWinResultGroupsByName,
  type GameLogic,
  type SceneMatrix,
  type WinResult,
  type WinResultPosition,
} from "@slotclientengine/gameframeworks";
import { validateGame003Scene } from "./scene.js";

export const GAME003_WIN_COMPONENT_NAME = "bg-wins";

export interface Game003WinSymbolGroup {
  readonly stepIndex: number;
  readonly resultIndex: number;
  readonly symbol: number | null;
  readonly positions: readonly WinResultPosition[];
  readonly coinWin: number;
  readonly cashWin: number;
}

export function createGame003WinSymbolSequence(
  logic: GameLogic,
  targetScene: SceneMatrix,
): readonly Game003WinSymbolGroup[] {
  const step = logic.getStep(0);
  const scene = validateGame003Scene(targetScene, "game003 win target scene");
  if (!step.hasComponent(GAME003_WIN_COMPONENT_NAME)) {
    return Object.freeze([]);
  }

  const component = step.getComponent(GAME003_WIN_COMPONENT_NAME);
  if (!component || !component.hasBasicComponentData) {
    throw new Error(
      "game003 bg-wins component must include basicComponentData.",
    );
  }

  const groups = getComponentWinResultGroupsByName(
    logic,
    GAME003_WIN_COMPONENT_NAME,
    {
      stepIndex: 0,
      scene,
    },
  ).map((group) =>
    Object.freeze({
      stepIndex: group.stepIndex,
      resultIndex: group.resultIndex,
      result: group.result,
      symbol: getOptionalNonNegativeInteger(
        group.result.symbol,
        `bg-wins result[${group.resultIndex}].symbol`,
      ),
      positions: group.positions,
      coinWin:
        getOptionalFiniteNumber(
          group.result.coinWin,
          `bg-wins result[${group.resultIndex}].coinWin`,
        ) ?? 0,
      cashWin:
        getOptionalFiniteNumber(
          group.result.cashWin,
          `bg-wins result[${group.resultIndex}].cashWin`,
        ) ?? 0,
    }),
  );

  validateComponentTotals(component.raw, groups);

  return Object.freeze(
    groups.map(({ result: _result, ...group }) => Object.freeze(group)),
  );
}

function validateComponentTotals(
  rawComponent: unknown,
  groups: readonly (Game003WinSymbolGroup & { readonly result: WinResult })[],
): void {
  const raw = assertRecord(rawComponent, "bg-wins component");
  const basicComponentData = assertRecord(
    raw.basicComponentData,
    "bg-wins.basicComponentData",
  );
  const coinWin = groups.reduce((sum, group) => sum + group.coinWin, 0);
  const cashWin = groups.reduce((sum, group) => sum + group.cashWin, 0);

  assertOptionalEquals(
    getOptionalFiniteNumber(raw.wins, "bg-wins.wins"),
    coinWin,
    "bg-wins.wins",
  );
  assertOptionalEquals(
    getOptionalFiniteNumber(
      basicComponentData.coinWin,
      "bg-wins.basicComponentData.coinWin",
    ),
    coinWin,
    "bg-wins.basicComponentData.coinWin",
  );
  assertOptionalEquals(
    getOptionalFiniteNumber(
      basicComponentData.cashWin,
      "bg-wins.basicComponentData.cashWin",
    ),
    cashWin,
    "bg-wins.basicComponentData.cashWin",
  );
}

function assertOptionalEquals(
  actual: number | undefined,
  expected: number,
  label: string,
): void {
  if (actual !== undefined && actual !== expected) {
    throw new Error(`${label} ${actual} does not match expected ${expected}.`);
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function getOptionalFiniteNumber(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function getOptionalNonNegativeInteger(
  value: unknown,
  label: string,
): number | null {
  if (value === undefined) {
    return null;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}
