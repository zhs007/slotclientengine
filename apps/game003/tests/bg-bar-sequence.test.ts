import { describe, expect, it } from "vitest";
import {
  createSlotGameLogicResult,
  type GameLogic,
} from "@slotclientengine/gameframeworks";
import {
  GAME003_BG_BAR_FEATURES,
  GAME003_SAMPLE_BG_BAR_SPIN_RESULT,
} from "./fixtures/game003-gmi.js";
import {
  createGame003BgBarSpinPlan,
  GAME003_BG_BAR_COMPONENT_NAME,
} from "../src/bg-bar-sequence.js";

describe("game003 bg-bar sequence", () => {
  it("parses the FeatureBar2Data component from real spin GMI", () => {
    const logic = createSlotGameLogicResult(GAME003_SAMPLE_BG_BAR_SPIN_RESULT, {
      bet: { bet: 5, lines: 10, times: 1 },
      userInfo: { balance: 1000, gameid: 69003 },
    }).logic;

    expect(createGame003BgBarSpinPlan(logic)).toEqual({
      stepIndex: 0,
      features: GAME003_BG_BAR_FEATURES,
    });
  });

  it("returns null when the spin does not include bg-bar", () => {
    expect(createGame003BgBarSpinPlan(createLogicWithoutBgBar())).toBeNull();
  });

  it("fails fast for malformed FeatureBar2Data payloads", () => {
    expect(() =>
      createGame003BgBarSpinPlan(createLogicWithMissingBgBarComponent()),
    ).toThrow(/missing in mapComponents/);

    expect(() =>
      createGame003BgBarSpinPlan(createLogicWithBgBarRaw({}, false)),
    ).toThrow(/basicComponentData/);

    expect(() =>
      createGame003BgBarSpinPlan(createLogicWithBgBarRaw(null as never)),
    ).toThrow(/component must be an object/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          "@type": "type.googleapis.com/sgc7pb.Other",
        }),
      ),
    ).toThrow(/FeatureBar2Data/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          features: "normal,wild,up",
        }),
      ),
    ).toThrow(/features must be an array/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          features: ["normal", "wild", "up", "normal"],
        }),
      ),
    ).toThrow(/length must be 5/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          features: ["normal", "wild", "bonus", "normal", "up"],
        }),
      ),
    ).toThrow(/normal, wild or up/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          usedFeatures: "wild",
        }),
      ),
    ).toThrow(/usedFeatures must be an array/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          basicComponentData: {
            ...createValidBasicComponentData(),
            usedResults: [0],
          },
        }),
      ),
    ).toThrow(/usedResults must be empty/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          basicComponentData: {
            ...createValidBasicComponentData(),
            coinWin: 1,
          },
        }),
      ),
    ).toThrow(/coinWin must be 0/);

    expect(() =>
      createGame003BgBarSpinPlan(
        createLogicWithBgBarRaw({
          ...createValidRaw(),
          basicComponentData: {
            ...createValidBasicComponentData(),
            cashWin: 1,
          },
        }),
      ),
    ).toThrow(/cashWin must be 0/);
  });
});

function createValidRaw(): Record<string, unknown> {
  return {
    "@type": "type.googleapis.com/sgc7pb.FeatureBar2Data",
    features: [...GAME003_BG_BAR_FEATURES],
    usedFeatures: [],
    cacheFeatures: [],
    curFeature: "normal",
    basicComponentData: createValidBasicComponentData(),
  };
}

function createValidBasicComponentData(): Record<string, unknown> {
  return {
    usedScenes: [],
    usedOtherScenes: [],
    usedResults: [],
    usedPrizeScenes: [],
    srcScenes: [],
    pos: [],
    coinWin: 0,
    cashWin: 0,
  };
}

function createLogicWithoutBgBar(): GameLogic {
  return {
    getStep: () => ({
      hasComponent: () => false,
      getComponent: () => undefined,
    }),
  } as unknown as GameLogic;
}

function createLogicWithMissingBgBarComponent(): GameLogic {
  return {
    getStep: () => ({
      hasComponent: (name: string) => name === GAME003_BG_BAR_COMPONENT_NAME,
      getComponent: () => undefined,
    }),
  } as unknown as GameLogic;
}

function createLogicWithBgBarRaw(
  raw: Record<string, unknown>,
  hasBasicComponentData = true,
): GameLogic {
  return {
    getStep: () => ({
      hasComponent: (name: string) => name === GAME003_BG_BAR_COMPONENT_NAME,
      getComponent: (name: string) =>
        name === GAME003_BG_BAR_COMPONENT_NAME
          ? { raw, hasBasicComponentData }
          : undefined,
    }),
  } as unknown as GameLogic;
}
