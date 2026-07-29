import type {
  SymbolWinAmountResolver,
  SymbolWinComponentValidator,
} from "@slotclientengine/rendercore";

export const GAME003_WIN_COMPONENT_NAMES = Object.freeze(["bg-wins"]);

export const resolveGame003WinResultAmount: SymbolWinAmountResolver = ({
  componentName,
  resultIndex,
  result,
}) => {
  const selected = selectPreferredAmount(
    result,
    "cashWin64",
    "cashWin",
    `${componentName} result[${resultIndex}]`,
  );
  return getRequiredPositiveFiniteNumber(selected.value, selected.label);
};

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
      (getOptionalSelectedFiniteNumber(
        selectPreferredAmount(
          group.result,
          "coinWin64",
          "coinWin",
          `${componentName} result[${group.resultIndex}]`,
        ),
      ) ?? 0),
    0,
  );
  const cashWin = groups.reduce((sum, group) => sum + group.amount, 0);
  const selectedBasicCoinWin = selectPreferredAmount(
    basicComponentData,
    "coinWin64",
    "coinWin",
    `${componentName}.basicComponentData`,
  );
  const selectedBasicCashWin = selectPreferredAmount(
    basicComponentData,
    "cashWin64",
    "cashWin",
    `${componentName}.basicComponentData`,
  );

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
    getOptionalSelectedFiniteNumber(selectedBasicCoinWin),
    coinWin,
    selectedBasicCoinWin.label,
  );
  assertOptionalEquals(
    getOptionalSelectedFiniteNumber(selectedBasicCashWin),
    cashWin,
    selectedBasicCashWin.label,
  );
};

interface SelectedAmount {
  readonly value: unknown;
  readonly label: string;
}

function selectPreferredAmount(
  record: Readonly<Record<string, unknown>>,
  modernField: "coinWin64" | "cashWin64",
  legacyField: "coinWin" | "cashWin",
  label: string,
): SelectedAmount {
  const field = record[modernField] !== undefined ? modernField : legacyField;
  return Object.freeze({
    value: record[field],
    label: `${label}.${field}`,
  });
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

function getOptionalSelectedFiniteNumber(
  selected: SelectedAmount,
): number | undefined {
  return getOptionalFiniteNumber(selected.value, selected.label);
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
