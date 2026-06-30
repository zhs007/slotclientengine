import { LogicParseError } from "./errors";
import { parseScene } from "./scene";
import {
  GameLogicMeta,
  ParsedGameLogicData,
  ParsedGameLogicMeta,
  ParsedGameLogicStepData,
  WinResult,
} from "./types";
import {
  assertArray,
  assertFiniteNumber,
  assertIntegerArray,
  assertNumberArray,
  assertOptionalFiniteNumber,
  assertOptionalString,
  assertRecord,
  assertStringArray,
  cloneAndFreeze,
  freezeArray,
} from "./validation";

export function parseGameModuleInfoMessage(
  message: unknown,
): ParsedGameLogicData {
  const messageRecord = assertRecord(message, "message");
  const meta = parseMeta(messageRecord, "message", { requireMsgid: true });
  const gmi = assertRecord(messageRecord.gmi, "message.gmi");

  return parseGmiCore(gmi, meta, message);
}

export function parseGmiWithMeta(
  gmi: unknown,
  meta: GameLogicMeta,
): ParsedGameLogicData {
  const gmiRecord = assertRecord(gmi, "gmi");
  const metaRecord = assertRecord(meta, "meta");
  const parsedMeta = parseMeta(metaRecord, "meta", { requireMsgid: false });
  const rawMessage = buildMessageFromGmi(gmi, parsedMeta);

  return parseGmiCore(gmiRecord, parsedMeta, rawMessage);
}

function parseGmiCore(
  gmi: Record<string, unknown>,
  meta: ParsedGameLogicMeta,
  rawMessage: unknown,
): ParsedGameLogicData {
  const defaultScene = parseScene(gmi.defaultScene, "gmi.defaultScene");
  const replyPlay = assertRecord(gmi.replyPlay, "gmi.replyPlay");
  const randomNumbers = assertIntegerArray(
    replyPlay.randomNumbers,
    "gmi.replyPlay.randomNumbers",
  );
  const steps = assertArray(replyPlay.results, "gmi.replyPlay.results").map(
    (step, index) => parseStep(step, index),
  );

  return Object.freeze({
    meta,
    rawMessage: cloneAndFreeze(rawMessage),
    rawGmi: cloneAndFreeze(gmi),
    defaultScene,
    randomNumbers,
    steps: freezeArray(steps),
  });
}

function parseMeta(
  metaSource: Record<string, unknown>,
  path: string,
  options: { readonly requireMsgid: boolean },
): ParsedGameLogicMeta {
  const rawMsgid = assertOptionalString(metaSource.msgid, `${path}.msgid`);

  if (options.requireMsgid && rawMsgid === undefined) {
    throw new LogicParseError(`${path}.msgid must be "gamemoduleinfo".`);
  }

  if (rawMsgid !== undefined && rawMsgid !== "gamemoduleinfo") {
    throw new LogicParseError(`${path}.msgid must be "gamemoduleinfo".`);
  }

  const meta: ParsedGameLogicMeta = {
    msgid: "gamemoduleinfo",
    bet: assertFiniteNumber(metaSource.bet, `${path}.bet`),
    lines: assertFiniteNumber(metaSource.lines, `${path}.lines`),
    totalwin: assertFiniteNumber(metaSource.totalwin, `${path}.totalwin`),
  };
  const gamemodulename = assertOptionalString(
    metaSource.gamemodulename,
    `${path}.gamemodulename`,
  );
  const gameid = assertOptionalFiniteNumber(
    metaSource.gameid,
    `${path}.gameid`,
  );
  const playIndex = assertOptionalFiniteNumber(
    metaSource.playIndex,
    `${path}.playIndex`,
  );
  const playwin = assertOptionalFiniteNumber(
    metaSource.playwin,
    `${path}.playwin`,
  );
  const maxWinLimit = assertOptionalFiniteNumber(
    metaSource.maxWinLimit,
    `${path}.maxWinLimit`,
  );

  return Object.freeze({
    ...meta,
    ...(gamemodulename === undefined ? {} : { gamemodulename }),
    ...(gameid === undefined ? {} : { gameid }),
    ...(playIndex === undefined ? {} : { playIndex }),
    ...(playwin === undefined ? {} : { playwin }),
    ...(maxWinLimit === undefined ? {} : { maxWinLimit }),
  });
}

function parseStep(step: unknown, index: number): ParsedGameLogicStepData {
  const stepRecord = assertRecord(step, `gmi.replyPlay.results[${index}]`);
  const clientData = assertRecord(
    stepRecord.clientData,
    `gmi.replyPlay.results[${index}].clientData`,
  );
  const curGameModParam = assertRecord(
    clientData.curGameModParam,
    `gmi.replyPlay.results[${index}].clientData.curGameModParam`,
  );
  const scenes = assertArray(
    clientData.scenes,
    `gmi.replyPlay.results[${index}].clientData.scenes`,
  ).map((scene, sceneIndex) =>
    parseScene(
      scene,
      `gmi.replyPlay.results[${index}].clientData.scenes[${sceneIndex}]`,
    ),
  );
  const results = assertArray(
    clientData.results,
    `gmi.replyPlay.results[${index}].clientData.results`,
  ).map((result, resultIndex) =>
    parseWinResult(
      result,
      `gmi.replyPlay.results[${index}].clientData.results[${resultIndex}]`,
    ),
  );
  const curGameMod = assertOptionalString(
    clientData.curGameMod,
    `gmi.replyPlay.results[${index}].clientData.curGameMod`,
  );

  return Object.freeze({
    index,
    coinWin: assertFiniteNumber(
      stepRecord.coinWin,
      `gmi.replyPlay.results[${index}].coinWin`,
    ),
    cashWin: assertFiniteNumber(
      stepRecord.cashWin,
      `gmi.replyPlay.results[${index}].cashWin`,
    ),
    rawStep: cloneAndFreeze(stepRecord),
    rawClientData: cloneAndFreeze(clientData),
    ...(curGameMod === undefined ? {} : { curGameMod }),
    curGameModParam: cloneAndFreeze(curGameModParam),
    scenes: freezeArray(scenes),
    results: freezeArray(results),
    historyComponents: assertStringArray(
      curGameModParam.historyComponents,
      `gmi.replyPlay.results[${index}].clientData.curGameModParam.historyComponents`,
      { nonEmptyItems: true },
    ),
    mapComponents: cloneAndFreeze(
      assertRecord(
        curGameModParam.mapComponents,
        `gmi.replyPlay.results[${index}].clientData.curGameModParam.mapComponents`,
      ),
    ),
  });
}

function parseWinResult(result: unknown, path: string): WinResult {
  const resultRecord = assertRecord(result, path);
  assertNumberArray(resultRecord.pos, `${path}.pos`);

  if (resultRecord.coinWin !== undefined) {
    assertFiniteNumber(resultRecord.coinWin, `${path}.coinWin`);
  }

  if (resultRecord.cashWin !== undefined) {
    assertFiniteNumber(resultRecord.cashWin, `${path}.cashWin`);
  }

  return cloneAndFreeze(resultRecord) as WinResult;
}

function buildMessageFromGmi(
  gmi: unknown,
  meta: ParsedGameLogicMeta,
): Readonly<Record<string, unknown>> {
  return Object.freeze({
    msgid: meta.msgid,
    ...(meta.gamemodulename === undefined
      ? {}
      : { gamemodulename: meta.gamemodulename }),
    ...(meta.gameid === undefined ? {} : { gameid: meta.gameid }),
    gmi,
    ...(meta.playIndex === undefined ? {} : { playIndex: meta.playIndex }),
    bet: meta.bet,
    lines: meta.lines,
    totalwin: meta.totalwin,
    ...(meta.playwin === undefined ? {} : { playwin: meta.playwin }),
    ...(meta.maxWinLimit === undefined
      ? {}
      : { maxWinLimit: meta.maxWinLimit }),
  });
}
