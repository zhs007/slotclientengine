import type {
  SymbolWinAmountResolver,
  SymbolWinComponentValidator,
} from "@slotclientengine/rendercore";

export const GAME002_WIN_COMPONENT_NAMES = Object.freeze(["bg-win"]);

export const GAME002_SYMBOL_WIN_CAROUSEL_OPTIONS = Object.freeze({
  cyclePauseSeconds: 1,
  amountText: Object.freeze({
    yOffsetRatioFromCellCenter: 0.22,
    fontSize: 38,
    fill: "#fff7d6",
    stroke: "#5a2500",
    strokeWidth: 5,
  }),
});

export const resolveGame002WinResultAmount: SymbolWinAmountResolver = ({
  componentName,
  resultIndex,
  result,
}) => {
  const amount =
    result.cashWin64 !== undefined ? result.cashWin64 : result.cashWin;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `${componentName} result[${resultIndex}] selected cash amount must be a finite positive number.`,
    );
  }
  return amount;
};

export const validateGame002WinComponent: SymbolWinComponentValidator = ({
  componentName,
  component,
  groups,
}) => validateComponentCashWin(componentName, component, groups, 0);

export function validateGame002CascadeWinComponent(
  context: Parameters<SymbolWinComponentValidator>[0],
  previousCumulativeWin: number,
): void {
  if (!Number.isFinite(previousCumulativeWin) || previousCumulativeWin < 0) {
    throw new Error(
      "game002 previous cumulative win must be finite and non-negative.",
    );
  }
  validateComponentCashWin(
    context.componentName,
    context.component,
    context.groups,
    previousCumulativeWin,
  );
}

function validateComponentCashWin(
  componentName: string,
  component: Parameters<SymbolWinComponentValidator>[0]["component"],
  groups: Parameters<SymbolWinComponentValidator>[0]["groups"],
  previousCumulativeWin: number,
): void {
  const raw = assertRecord(component.raw, `${componentName} component`);
  const basic = assertRecord(
    raw.basicComponentData,
    `${componentName}.basicComponentData`,
  );
  if (basic.cashWin === undefined) {
    return;
  }
  if (typeof basic.cashWin !== "number" || !Number.isFinite(basic.cashWin)) {
    throw new Error(
      `${componentName}.basicComponentData.cashWin must be finite.`,
    );
  }
  const expected = groups.reduce(
    (sum, group) => sum + group.amount,
    previousCumulativeWin,
  );
  if (basic.cashWin !== expected) {
    throw new Error(
      `${componentName}.basicComponentData.cashWin ${basic.cashWin} does not match expected ${expected}.`,
    );
  }
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}
