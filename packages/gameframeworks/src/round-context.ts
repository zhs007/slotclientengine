import { shouldCollectFinalResult } from "./collect.js";
import type { SlotGameLogicResult } from "./logic-result.js";
import type { SlotGameBetOption } from "./types.js";

export interface SlotGameRoundContext {
  readonly id: number;
  readonly betOption: SlotGameBetOption;
  readonly rawResult: unknown;
  readonly totalwin: number;
  readonly results: number;
  readonly balanceBefore: number | null;
  readonly balanceAfterSpin: number | null;
  readonly shouldCollect: boolean;
}

export function createSlotGameRoundContext(options: {
  readonly id: number;
  readonly betOption: SlotGameBetOption;
  readonly logicResult: SlotGameLogicResult;
  readonly balanceBefore: number | null;
  readonly balanceAfterSpin: number | null;
}): SlotGameRoundContext {
  return Object.freeze({
    id: options.id,
    betOption: Object.freeze({ ...options.betOption }),
    rawResult: options.logicResult.rawResult,
    totalwin: options.logicResult.totalwin,
    results: options.logicResult.results,
    balanceBefore: options.balanceBefore,
    balanceAfterSpin: options.balanceAfterSpin,
    shouldCollect: shouldCollectFinalResult(
      options.logicResult.totalwin,
      options.logicResult.results,
    ),
  });
}
