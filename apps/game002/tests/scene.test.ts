import { describe, expect, it } from "vitest";
import {
  GAME002_SAMPLE_DEFAULT_SCENE,
  GAME002_SAMPLE_SPIN_RESULT,
  GAME002_SAMPLE_SPIN_SCENE,
} from "./fixtures/game002-gmi.js";
import {
  assertScenesEqual,
  getReplyPlayResultsLength,
  sceneEquals,
  validateGame002Scene,
} from "../src/scene.js";

const SCENE = Object.freeze(
  Array.from({ length: 6 }, (_unused, x) =>
    Object.freeze(Array.from({ length: 9 }, (_unused2, y) => x * 10 + y)),
  ),
);

describe("game002 scene helpers", () => {
  it("validates and compares 6 x 9 scenes", () => {
    expect(validateGame002Scene(SCENE, "scene")).toEqual(SCENE);
    expect(
      validateGame002Scene(GAME002_SAMPLE_DEFAULT_SCENE, "default"),
    ).toEqual(GAME002_SAMPLE_DEFAULT_SCENE);
    expect(validateGame002Scene(GAME002_SAMPLE_SPIN_SCENE, "spin")).toEqual(
      GAME002_SAMPLE_SPIN_SCENE,
    );
    expect(sceneEquals(SCENE, SCENE)).toBe(true);
    expect(sceneEquals(SCENE, [[1, 2, 3]] as any)).toBe(false);
    expect(() => assertScenesEqual(SCENE, [[1, 2, 3]] as any, "scene")).toThrow(
      /does not match/,
    );
  });

  it("rejects malformed scenes", () => {
    expect(() => validateGame002Scene({}, "scene")).toThrow(/matrix/);
    expect(() => validateGame002Scene([[1, 2, 3]], "scene")).toThrow(/width/);
    expect(() =>
      validateGame002Scene(
        [Array.from({ length: 9 }, () => 1), {}, [], [], [], []],
        "scene",
      ),
    ).toThrow(/must be an array/);
    expect(() =>
      validateGame002Scene(
        [
          [1, 2, 3, 4, 5, 6, 7, 8],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
        ],
        "scene",
      ),
    ).toThrow(/height/);
    expect(() =>
      validateGame002Scene(
        [
          [1, -1, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
          [1, 2, 3, 4, 5, 6, 7, 8, 9],
        ],
        "scene",
      ),
    ).toThrow(/non-negative integer/);
  });

  it("extracts replyPlay result length strictly", () => {
    expect(getReplyPlayResultsLength(GAME002_SAMPLE_SPIN_RESULT.gmi)).toBe(1);
    expect(() => getReplyPlayResultsLength(null)).toThrow(/gmi/);
    expect(() => getReplyPlayResultsLength({ replyPlay: null })).toThrow(
      /replyPlay/,
    );
    expect(() =>
      getReplyPlayResultsLength({ replyPlay: { results: {} } }),
    ).toThrow(/results/);
  });
});
