import { describe, expect, it } from "vitest";
import basicMessage from "./fixtures/gamemoduleinfo-basic.json";
import { LogicParseError } from "../src";
import { parseGameModuleInfoMessage, parseGmiWithMeta } from "../src/parser";

const cloneFixture = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("parser", () => {
  it("parses a full gamemoduleinfo message and gmi + meta through equivalent paths", () => {
    const fromMessage = parseGameModuleInfoMessage(basicMessage);
    const fromGmi = parseGmiWithMeta(basicMessage.gmi, {
      bet: basicMessage.bet,
      lines: basicMessage.lines,
      totalwin: basicMessage.totalwin,
      gameid: basicMessage.gameid,
      gamemodulename: basicMessage.gamemodulename,
      playIndex: basicMessage.playIndex,
      playwin: basicMessage.playwin,
      maxWinLimit: basicMessage.maxWinLimit,
    });

    expect(fromMessage.defaultScene).toEqual(fromGmi.defaultScene);
    expect(fromMessage.randomNumbers).toEqual(fromGmi.randomNumbers);
    expect(fromMessage.steps[0].otherScenes[0][1][3]).toBe(150);
    expect(fromMessage.steps[0].results[1].cashWin).toBe(275);
    expect(fromGmi.meta.gameid).toBe(69002);
  });

  it("throws for invalid top-level message and meta fields", () => {
    expect(() =>
      parseGameModuleInfoMessage({ ...basicMessage, msgid: "other" }),
    ).toThrow(LogicParseError);
    expect(() =>
      parseGameModuleInfoMessage({ ...basicMessage, gmi: undefined }),
    ).toThrow(LogicParseError);
    expect(() =>
      parseGmiWithMeta(basicMessage.gmi, {
        bet: basicMessage.bet,
        lines: basicMessage.lines,
        totalwin: basicMessage.totalwin,
        msgid: "other",
      }),
    ).toThrow(LogicParseError);
    expect(() =>
      parseGmiWithMeta(basicMessage.gmi, {
        bet: Number.POSITIVE_INFINITY,
        lines: basicMessage.lines,
        totalwin: basicMessage.totalwin,
      }),
    ).toThrow(LogicParseError);
  });

  it.each(["bet", "lines", "totalwin"] as const)(
    "throws when createGameLogicFromGmi meta.%s is missing",
    (field) => {
      const meta = {
        bet: basicMessage.bet,
        lines: basicMessage.lines,
        totalwin: basicMessage.totalwin,
      };
      delete meta[field];

      expect(() => parseGmiWithMeta(basicMessage.gmi, meta as any)).toThrow(
        LogicParseError,
      );
    },
  );

  it("throws for invalid gmi, random number, step, and result structure", () => {
    const missingDefaultScene = cloneFixture(basicMessage);
    delete (missingDefaultScene.gmi as any).defaultScene;
    expect(() => parseGameModuleInfoMessage(missingDefaultScene)).toThrow(
      LogicParseError,
    );

    const invalidDefaultScene = cloneFixture(basicMessage);
    (invalidDefaultScene.gmi.defaultScene as any).values = {};
    expect(() => parseGameModuleInfoMessage(invalidDefaultScene)).toThrow(
      LogicParseError,
    );

    const invalidSceneSymbol = cloneFixture(basicMessage);
    (invalidSceneSymbol.gmi.defaultScene.values[0].values as any)[0] = 1.25;
    expect(() => parseGameModuleInfoMessage(invalidSceneSymbol)).toThrow(
      LogicParseError,
    );

    const invalidRandomNumbers = cloneFixture(basicMessage);
    (invalidRandomNumbers.gmi.replyPlay as any).randomNumbers = [1, 2.5];
    expect(() => parseGameModuleInfoMessage(invalidRandomNumbers)).toThrow(
      LogicParseError,
    );

    const invalidSteps = cloneFixture(basicMessage);
    (invalidSteps.gmi.replyPlay as any).results = {};
    expect(() => parseGameModuleInfoMessage(invalidSteps)).toThrow(
      LogicParseError,
    );

    const missingClientData = cloneFixture(basicMessage);
    delete (missingClientData.gmi.replyPlay.results[0] as any).clientData;
    expect(() => parseGameModuleInfoMessage(missingClientData)).toThrow(
      LogicParseError,
    );

    const missingCurGameModParam = cloneFixture(basicMessage);
    delete (missingCurGameModParam.gmi.replyPlay.results[0].clientData as any)
      .curGameModParam;
    expect(() => parseGameModuleInfoMessage(missingCurGameModParam)).toThrow(
      LogicParseError,
    );

    const invalidHistoryComponents = cloneFixture(basicMessage);
    (
      invalidHistoryComponents.gmi.replyPlay.results[0].clientData
        .curGameModParam as any
    ).historyComponents = [1];
    expect(() => parseGameModuleInfoMessage(invalidHistoryComponents)).toThrow(
      LogicParseError,
    );

    const invalidResultPos = cloneFixture(basicMessage);
    (
      invalidResultPos.gmi.replyPlay.results[0].clientData.results[0] as any
    ).pos = ["0"];
    expect(() => parseGameModuleInfoMessage(invalidResultPos)).toThrow(
      LogicParseError,
    );
  });

  it("throws for missing or invalid otherScenes", () => {
    const missingOtherScenes = cloneFixture(basicMessage);
    delete (missingOtherScenes.gmi.replyPlay.results[0].clientData as any)
      .otherScenes;
    expect(() => parseGameModuleInfoMessage(missingOtherScenes)).toThrow(
      LogicParseError,
    );

    const nonArrayOtherScenes = cloneFixture(basicMessage);
    (
      nonArrayOtherScenes.gmi.replyPlay.results[0].clientData as any
    ).otherScenes = {};
    expect(() => parseGameModuleInfoMessage(nonArrayOtherScenes)).toThrow(
      LogicParseError,
    );

    const invalidOtherSceneMatrix = cloneFixture(basicMessage);
    (
      invalidOtherSceneMatrix.gmi.replyPlay.results[0].clientData.otherScenes[0]
        .values[1].values as any
    )[3] = 1.5;
    expect(() => parseGameModuleInfoMessage(invalidOtherSceneMatrix)).toThrow(
      LogicParseError,
    );
  });
});
