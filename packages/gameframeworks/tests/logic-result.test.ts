import { createGameLogicFromGmi } from "@slotclientengine/logiccore";
import { createSlotGameLogicResult } from "../src/index.js";
import { BET_OPTIONS, createSpinResult } from "./test-helpers.js";

describe("logic result", () => {
  it("converts strict raw spin results into GameLogic", () => {
    const result = createSlotGameLogicResult(
      createSpinResult({ totalwin: 8, results: 1 }),
      {
        bet: BET_OPTIONS[0],
        userInfo: { gameid: 7 },
      },
    );

    expect(result.logic.getTotalWin()).toBe(8);
    expect(result.logic.getBet()).toBe(1);
    expect(result.logic.getLines()).toBe(10);
    expect(result.results).toBe(1);
  });

  it("fails on missing fields, mismatched result length, parser failures, and totalwin drift", () => {
    expect(() =>
      createSlotGameLogicResult({}, { bet: BET_OPTIONS[0], userInfo: {} }),
    ).toThrow(/gmi/);
    expect(() =>
      createSlotGameLogicResult(
        { gmi: {}, results: 1 },
        { bet: BET_OPTIONS[0], userInfo: {} },
      ),
    ).toThrow(/totalwin/);
    expect(() =>
      createSlotGameLogicResult(
        { gmi: {}, totalwin: 0 },
        { bet: BET_OPTIONS[0], userInfo: {} },
      ),
    ).toThrow(/results/);
    expect(() =>
      createSlotGameLogicResult(null, { bet: BET_OPTIONS[0], userInfo: {} }),
    ).toThrow(/object/);
    expect(() =>
      createSlotGameLogicResult(
        { gmi: { replyPlay: { results: "bad" } }, totalwin: 0, results: 0 },
        { bet: BET_OPTIONS[0], userInfo: {} },
      ),
    ).toThrow(/array/);
    expect(() =>
      createSlotGameLogicResult(
        { ...createSpinResult(), totalwin: Number.NaN },
        { bet: BET_OPTIONS[0], userInfo: {} },
      ),
    ).toThrow(/finite/);
    expect(() =>
      createSlotGameLogicResult(
        { ...createSpinResult(), results: -1 },
        { bet: BET_OPTIONS[0], userInfo: {} },
      ),
    ).toThrow(/non-negative/);
    expect(() =>
      createSlotGameLogicResult(createSpinResult(), {
        bet: BET_OPTIONS[0],
        userInfo: { gameid: -1 },
      }),
    ).toThrow(/gameid/);
    expect(() =>
      createSlotGameLogicResult(
        { ...createSpinResult({ results: 1 }), results: 2 },
        { bet: BET_OPTIONS[0], userInfo: {} },
      ),
    ).toThrow(/results must equal/);
    expect(() =>
      createSlotGameLogicResult(
        {
          gmi: { replyPlay: { results: [{}] } },
          totalwin: 0,
          results: 1,
        },
        { bet: BET_OPTIONS[0], userInfo: {} },
      ),
    ).toThrow();
    expect(() =>
      createSlotGameLogicResult(createSpinResult({ totalwin: 9 }), {
        bet: BET_OPTIONS[0],
        userInfo: {},
        logicFactory: (gmi, meta) =>
          createGameLogicFromGmi(gmi, { ...meta, totalwin: 8 }),
      }),
    ).toThrow(/does not match/);
  });
});
