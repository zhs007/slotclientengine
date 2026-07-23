import { createLeoProgressStyles, normalizeLeoProgress } from "../src/index.js";

describe("Leo loading progress styles", () => {
  it.each([
    [-1, 0],
    [0, 0],
    [50, 50],
    [99, 99],
    [100, 100],
    [101, 100],
    [Number.NaN, 0],
    [Number.POSITIVE_INFINITY, 0],
  ])("normalizes %s to %s", (input, expected) => {
    expect(normalizeLeoProgress(input)).toBe(expected);
  });

  it("creates deterministic radial and horizontal reveal CSS", () => {
    expect(createLeoProgressStyles(0)).toEqual({
      radialClipPath: "polygon(50% 35%, 50% 0%)",
      horizontalClipPath: "inset(0 70% 0 0)",
    });
    expect(createLeoProgressStyles(0).radialClipPath.match(/,/g)).toHaveLength(
      1,
    );
    expect(createLeoProgressStyles(50).horizontalClipPath).toBe(
      "inset(0 50% 0 0)",
    );
    expect(createLeoProgressStyles(25).radialClipPath).toContain("0% 35%");
    expect(createLeoProgressStyles(99)).toEqual(createLeoProgressStyles(99));
    expect(createLeoProgressStyles(100).horizontalClipPath).toBe(
      "inset(0 30% 0 0)",
    );
    expect(createLeoProgressStyles(Number.NaN)).toEqual(
      createLeoProgressStyles(0),
    );
  });
});
