import type {
  SymbolCascadeGroupContext,
  SymbolCascadeGroupPositionContext,
  SymbolCascadeResolvedPositionContext,
  WinSummaryCollectOptions,
} from "@slotclientengine/rendercore";
import type { Game002ReelRuntime } from "./game-demo.js";
import { isGame002SequentialWinCompanionSymbol } from "./cascade-config.js";
import { formatServerUsdAmount } from "./money.js";
import type { Game002SkinConfig } from "./skin-config.js";

export const GAME002_CASCADE_WIN_SUMMARY_STYLE = Object.freeze({
  fontSize: 48,
  fontWeight: 900,
  fill: "#fff7d6",
  stroke: "#5a2500",
  strokeWidth: 6,
});

export const GAME002_CASCADE_WIN_SUMMARY_COUNT_SECONDS = 0.35;
export const GAME002_CASCADE_COLLECT_START_INTERVAL_SECONDS = 0.5;

export function resolveGame002WinResultCoinAmount(
  context: SymbolCascadeGroupContext,
): number {
  const { componentName, resultIndex, result } = context.group;
  const amount =
    result.coinWin64 !== undefined ? result.coinWin64 : result.coinWin;
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      `${componentName} result[${resultIndex}] selected coin amount must be a positive safe integer.`,
    );
  }
  return amount;
}

export function resolveGame002WinResultCashAmount(
  context: SymbolCascadeGroupContext,
): number {
  const { componentName, resultIndex, result } = context.group;
  const amount =
    result.cashWin64 !== undefined ? result.cashWin64 : result.cashWin;
  if (
    typeof amount !== "number" ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw new Error(
      `${componentName} result[${resultIndex}] selected cash amount must be a positive safe integer.`,
    );
  }
  return amount;
}

export function formatGame002CashSummary(value: number): string {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(
      "game002 cash summary value must be a positive safe integer.",
    );
  }
  return formatServerUsdAmount(value);
}

export function sortGame002CascadeCollectItems(
  items: readonly SymbolCascadeGroupPositionContext[],
): readonly SymbolCascadeGroupPositionContext[] {
  return Object.freeze(
    [...items].sort(
      (left, right) =>
        left.position.y - right.position.y ||
        left.position.x - right.position.x,
    ),
  );
}

export function createGame002WinSummaryCollectOptions(options: {
  readonly runtime: Game002ReelRuntime;
  readonly skin: Game002SkinConfig;
}): WinSummaryCollectOptions {
  const { runtime, skin } = options;
  return Object.freeze({
    presentations: skin.cascadeWinPresentations,
    resolveGroupSymbol: (context: SymbolCascadeGroupContext) => {
      const resultCode = context.group.result.symbol;
      if (
        typeof resultCode !== "number" ||
        !Number.isSafeInteger(resultCode) ||
        resultCode < 0
      ) {
        throw new Error(
          `game002 cascade result[${context.group.resultIndex}] symbol code is invalid.`,
        );
      }
      const resultSymbol =
        runtime.gameConfig.getPaytableEntry(resultCode)?.symbol;
      if (!resultSymbol) {
        throw new Error(
          `game002 cascade result[${context.group.resultIndex}] symbol is missing from the paytable.`,
        );
      }
      return resultSymbol;
    },
    resolveSymbol: (context: SymbolCascadeGroupPositionContext) => {
      const scene = runtime.getCurrentScene();
      if (!scene) throw new Error("game002 cascade scene is not available.");
      const actualCode = scene[context.position.x]?.[context.position.y];
      if (
        typeof actualCode !== "number" ||
        !Number.isSafeInteger(actualCode) ||
        actualCode < 0
      ) {
        throw new Error(
          `game002 cascade position (${context.position.x},${context.position.y}) has no symbol code.`,
        );
      }
      const actualSymbol =
        runtime.gameConfig.getPaytableEntry(actualCode)?.symbol;
      if (!actualSymbol) {
        throw new Error(
          `game002 cascade position (${context.position.x},${context.position.y}) symbol is missing from the paytable.`,
        );
      }
      return actualSymbol;
    },
    allowCompanionPosition: ({
      symbol,
    }: SymbolCascadeResolvedPositionContext) =>
      isGame002SequentialWinCompanionSymbol(symbol),
    resolveGroupAmount: resolveGame002WinResultCashAmount,
    resolveItemAmount: (context: SymbolCascadeGroupPositionContext) => {
      const itemCoinAmount =
        runtime.getCascadeValues()[context.position.x]?.[context.position.y];
      if (
        typeof itemCoinAmount !== "number" ||
        !Number.isSafeInteger(itemCoinAmount) ||
        itemCoinAmount <= 0
      ) {
        throw new Error(
          `game002 cascade item (${context.position.x},${context.position.y}) value must be a positive safe integer.`,
        );
      }
      const groupContext = Object.freeze({
        group: context.group,
        groupIndex: context.groupIndex,
      });
      const groupCoinAmount = resolveGame002WinResultCoinAmount(groupContext);
      const groupCashAmount = resolveGame002WinResultCashAmount(groupContext);
      const weightedCashAmount = itemCoinAmount * groupCashAmount;
      if (
        !Number.isSafeInteger(weightedCashAmount) ||
        weightedCashAmount % groupCoinAmount !== 0
      ) {
        throw new Error(
          `game002 cascade item (${context.position.x},${context.position.y}) cash share must divide the result cash amount exactly.`,
        );
      }
      const itemCashAmount = weightedCashAmount / groupCoinAmount;
      if (!Number.isSafeInteger(itemCashAmount) || itemCashAmount <= 0) {
        throw new Error(
          `game002 cascade item (${context.position.x},${context.position.y}) cash share must be a positive safe integer.`,
        );
      }
      return itemCashAmount;
    },
    sortItems: sortGame002CascadeCollectItems,
    formatter: formatGame002CashSummary,
    countDurationSeconds: GAME002_CASCADE_WIN_SUMMARY_COUNT_SECONDS,
    sequentialCollectStartIntervalSeconds:
      GAME002_CASCADE_COLLECT_START_INTERVAL_SECONDS,
    position: Object.freeze({
      x: runtime.layerLayout.rawReelsContentWidth / 2,
      y: runtime.layerLayout.rawReelsContentHeight + 36,
    }),
    textStyle: GAME002_CASCADE_WIN_SUMMARY_STYLE,
  });
}
