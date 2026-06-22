import { createGameLogicFromGmi } from "@slotclientengine/logiccore";
import { SlotGameRuntimeError } from "./errors.js";
import type { GameLogic, GameLogicMeta } from "@slotclientengine/logiccore";
import type { UserInfo } from "@slotclientengine/netcore";
import type { SlotGameBetOption, SlotGameLogicFactory } from "./types.js";

export interface SlotGameLogicResult {
  readonly rawResult: unknown;
  readonly gmi: unknown;
  readonly logic: GameLogic;
  readonly totalwin: number;
  readonly results: number;
}

export interface CreateSlotGameLogicResultOptions {
  readonly bet: SlotGameBetOption;
  readonly userInfo: Readonly<UserInfo>;
  readonly logicFactory?: SlotGameLogicFactory;
}

export function createSlotGameLogicResult(
  rawResult: unknown,
  options: CreateSlotGameLogicResultOptions,
): SlotGameLogicResult {
  const resultRecord = assertRecord(rawResult, "spin result");
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "gmi")) {
    throw new SlotGameRuntimeError("spin result is missing gmi.");
  }
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "totalwin")) {
    throw new SlotGameRuntimeError("spin result is missing totalwin.");
  }
  if (!Object.prototype.hasOwnProperty.call(resultRecord, "results")) {
    throw new SlotGameRuntimeError("spin result is missing results.");
  }

  const gmi = resultRecord.gmi;
  const totalwin = assertFiniteNumber(
    resultRecord.totalwin,
    "spin result totalwin",
  );
  const results = assertNonNegativeInteger(
    resultRecord.results,
    "spin result results",
  );
  const replyPlayResultsLength = getReplyPlayResultsLength(gmi);
  if (results !== replyPlayResultsLength) {
    throw new SlotGameRuntimeError(
      `results must equal gmi.replyPlay.results.length: results=${results}, length=${replyPlayResultsLength}.`,
    );
  }

  const logicFactory = options.logicFactory ?? createGameLogicFromGmi;
  const logic = logicFactory(
    gmi,
    createLogicMeta(options.bet, totalwin, options.userInfo),
  );
  if (logic.getTotalWin() !== totalwin) {
    throw new SlotGameRuntimeError(
      `logic totalwin ${logic.getTotalWin()} does not match spin result totalwin ${totalwin}.`,
    );
  }

  return Object.freeze({
    rawResult,
    gmi,
    logic,
    totalwin,
    results,
  });
}

function createLogicMeta(
  bet: SlotGameBetOption,
  totalwin: number,
  userInfo: Readonly<UserInfo>,
): GameLogicMeta {
  const gameid = userInfo.gameid;
  if (gameid !== undefined && (!Number.isFinite(gameid) || gameid < 0)) {
    throw new SlotGameRuntimeError(
      "live userInfo.gameid must be a finite non-negative number when present.",
    );
  }
  return Object.freeze({
    bet: bet.bet,
    lines: bet.lines,
    totalwin,
    ...(gameid === undefined ? {} : { gameid }),
  });
}

function getReplyPlayResultsLength(gmi: unknown): number {
  const gmiRecord = assertRecord(gmi, "gmi");
  const replyPlay = assertRecord(gmiRecord.replyPlay, "gmi.replyPlay");
  if (!Array.isArray(replyPlay.results)) {
    throw new SlotGameRuntimeError("gmi.replyPlay.results must be an array.");
  }
  return replyPlay.results.length;
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new SlotGameRuntimeError(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertFiniteNumber(value: unknown, label: string): number {
  if (!Number.isFinite(value)) {
    throw new SlotGameRuntimeError(`${label} must be a finite number.`);
  }
  return value as number;
}

function assertNonNegativeInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 0) {
    throw new SlotGameRuntimeError(`${label} must be a non-negative integer.`);
  }
  return value as number;
}
