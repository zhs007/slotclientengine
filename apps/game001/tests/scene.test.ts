import { describe, expect, it } from "vitest";
import {
  assertScenesEqual,
  getReplyPlayResultsLength,
  sceneEquals,
  validateGame001Scene,
} from "../src/scene.js";

const SCENE = Object.freeze([
  Object.freeze([1, 1, 1, 1, 1]),
  Object.freeze([2, 2, 2, 2, 2]),
  Object.freeze([3, 3, 3, 3, 3]),
  Object.freeze([4, 4, 4, 4, 4]),
  Object.freeze([5, 5, 5, 5, 5]),
]);

describe("game001 scene helpers", () => {
  it("validates and compares scenes", () => {
    expect(validateGame001Scene(SCENE, "scene")).toEqual(SCENE);
    expect(sceneEquals(SCENE, SCENE)).toBe(true);
    expect(sceneEquals(SCENE, [[1, 1, 1, 1, 1]] as any)).toBe(false);
    expect(() =>
      assertScenesEqual(SCENE, [[1, 1, 1, 1, 1]] as any, "scene"),
    ).toThrow(/does not match/);
  });

  it("rejects malformed scenes", () => {
    expect(() => validateGame001Scene({}, "scene")).toThrow(/matrix/);
    expect(() => validateGame001Scene([[1, 2, 3, 4, 5]], "scene")).toThrow(
      /width/,
    );
    expect(() =>
      validateGame001Scene(
        [
          [1, 2, 3, 4, 5],
          {},
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
        ],
        "scene",
      ),
    ).toThrow(/must be an array/);
    expect(() =>
      validateGame001Scene(
        [
          [1, 2, 3, 4],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
        ],
        "scene",
      ),
    ).toThrow(/height/);
    expect(() =>
      validateGame001Scene(
        [
          [1, -1, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
          [1, 2, 3, 4, 5],
        ],
        "scene",
      ),
    ).toThrow(/non-negative integer/);
  });

  it("extracts replyPlay result length strictly", () => {
    expect(
      getReplyPlayResultsLength({ replyPlay: { results: [{}, {}] } }),
    ).toBe(2);
    expect(() => getReplyPlayResultsLength(null)).toThrow(/gmi/);
    expect(() => getReplyPlayResultsLength({ replyPlay: null })).toThrow(
      /replyPlay/,
    );
    expect(() =>
      getReplyPlayResultsLength({ replyPlay: { results: {} } }),
    ).toThrow(/results/);
  });
});
