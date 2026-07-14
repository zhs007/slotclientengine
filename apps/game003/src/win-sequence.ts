import type {
  SymbolWinAmountResolver,
  SymbolWinComponentValidator,
} from "@slotclientengine/rendercore";

export const GAME003_WIN_COMPONENT_NAMES = Object.freeze(["bg-wins"]);

export const resolveGame003WinResultAmount: SymbolWinAmountResolver = ({
  componentName,
  resultIndex,
  result,
}) =>
  getRequiredPositiveFiniteNumber(
    result.cashWin,
    `${componentName} result[${resultIndex}].cashWin`,
  );

export const validateGame003WinComponent: SymbolWinComponentValidator = ({
  componentName,
  component,
  groups,
}) => {
  const raw = assertRecord(component.raw, `${componentName} component`);
  const basicComponentData = assertRecord(
    raw.basicComponentData,
    `${componentName}.basicComponentData`,
  );
  const coinWin = groups.reduce(
    (sum, group) =>
      sum +
      (getOptionalFiniteNumber(
        group.result.coinWin,
        `${componentName} result[${group.resultIndex}].coinWin`,
      ) ?? 0),
    0,
  );
  const cashWin = groups.reduce((sum, group) => sum + group.amount, 0);

  for (const group of groups) {
    getOptionalNonNegativeInteger(
      group.result.symbol,
      `${componentName} result[${group.resultIndex}].symbol`,
    );
  }

  assertOptionalEquals(
    getOptionalFiniteNumber(raw.wins, `${componentName}.wins`),
    coinWin,
    `${componentName}.wins`,
  );
  assertOptionalEquals(
    getOptionalFiniteNumber(
      basicComponentData.coinWin,
      `${componentName}.basicComponentData.coinWin`,
    ),
    coinWin,
    `${componentName}.basicComponentData.coinWin`,
  );
  assertOptionalEquals(
    getOptionalFiniteNumber(
      basicComponentData.cashWin,
      `${componentName}.basicComponentData.cashWin`,
    ),
    cashWin,
    `${componentName}.basicComponentData.cashWin`,
  );
};

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

function getRequiredPositiveFiniteNumber(
  value: unknown,
  label: string,
): number {
  if (value === undefined) {
    throw new Error(`${label} is required.`);
  }
  const number = getOptionalFiniteNumber(value, label)!;
  if (number <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
  return number;
}

function getOptionalNonNegativeInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return value;
}
