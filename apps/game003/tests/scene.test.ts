import { describe, expect, it } from "vitest";
import { createSlotGameLogicResult } from "@slotclientengine/gameframeworks";
import {
  GAME003_DEFAULT_SCENE,
  GAME003_SAMPLE_RANDOM_NUMBERS,
  GAME003_SAMPLE_SPIN_RESULT,
  GAME003_SPIN_SCENE,
} from "./fixtures/game003-gmi.js";
import {
  assertScenesEqual,
  getReplyPlayResultsLength,
  sceneEquals,
  validateGame003Scene,
} from "../src/scene.js";

describe("game003 scene contract", () => {
  it("validates 5 x 5 scene matrices", () => {
    expect(validateGame003Scene(GAME003_DEFAULT_SCENE, "default")).toEqual(
      GAME003_DEFAULT_SCENE,
    );
    expect(() => validateGame003Scene([[1, 2, 3]], "bad")).toThrow(/width/);
    expect(() =>
      validateGame003Scene(
        [
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4],
        ],
        "bad",
      ),
    ).toThrow(/width/);
    expect(() =>
      validateGame003Scene(
        [
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, -1],
        ],
        "bad",
      ),
    ).toThrow(/non-negative integer/);
  });

  it("parses the raw GMI fixture through gameframeworks", () => {
    const result = createSlotGameLogicResult(GAME003_SAMPLE_SPIN_RESULT, {
      bet: { bet: 5, lines: 10, times: 1 },
      userInfo: { gameid: 0 },
    });

    expect(result.results).toBe(1);
    expect(result.totalwin).toBe(0);
    expect(result.logic.getDefaultScene()).toEqual(GAME003_DEFAULT_SCENE);
    expect(result.logic.getStep(0).getScene(0)).toEqual(GAME003_SPIN_SCENE);
    expect(result.logic.getRandomNumbers()).toEqual(
      GAME003_SAMPLE_RANDOM_NUMBERS,
    );
    expect(result.logic.getTotalWin()).toBe(0);
    expect(getReplyPlayResultsLength(GAME003_SAMPLE_SPIN_RESULT.gmi)).toBe(1);
  });

  it("compares scenes for completion assertions", () => {
    expect(sceneEquals(GAME003_DEFAULT_SCENE, GAME003_DEFAULT_SCENE)).toBe(
      true,
    );
    expect(sceneEquals(GAME003_DEFAULT_SCENE, GAME003_SPIN_SCENE)).toBe(false);
    expect(() =>
      assertScenesEqual(GAME003_DEFAULT_SCENE, GAME003_SPIN_SCENE, "spin"),
    ).toThrow(/does not match/);
  });
});
