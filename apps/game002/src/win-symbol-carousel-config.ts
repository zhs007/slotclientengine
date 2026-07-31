import type { SymbolWinAmountResolver } from "@slotclientengine/rendercore";

export const GAME002_WIN_COMPONENT_NAMES = Object.freeze(["bg-win", "bg-win2"]);

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
    result.cashWin64 !== undefined
      ? result.cashWin64
      : typeof result.cashWin === "number" && result.cashWin > 0
        ? result.cashWin
        : result.mul;
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    throw new Error(
      `${componentName} result[${resultIndex}] selected cash amount must be a finite positive number.`,
    );
  }
  return amount;
};
