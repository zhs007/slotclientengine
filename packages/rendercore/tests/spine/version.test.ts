import { describe, expect, it } from "vitest";
import { readSupportedSpineSkeletonVersion } from "../../src/spine/version.js";

describe("Spine skeleton version", () => {
  it("accepts 4.3 variants and rejects every malformed boundary", () => {
    expect(
      readSupportedSpineSkeletonVersion({ skeleton: { spine: "4.3" } }),
    ).toBe("4.3");
    expect(
      readSupportedSpineSkeletonVersion({ skeleton: { spine: "4.3.23" } }),
    ).toBe("4.3");

    for (const skeleton of [null, [], 1])
      expect(() => readSupportedSpineSkeletonVersion(skeleton)).toThrow(
        /must be an object/,
      );
    for (const skeleton of [{}, { skeleton: null }, { skeleton: [] }])
      expect(() => readSupportedSpineSkeletonVersion(skeleton)).toThrow(
        /metadata must be an object/,
      );
    for (const skeleton of [
      { skeleton: { spine: null } },
      { skeleton: { spine: "" } },
    ])
      expect(() => readSupportedSpineSkeletonVersion(skeleton)).toThrow(
        /non-empty string/,
      );
    expect(() =>
      readSupportedSpineSkeletonVersion({ skeleton: { spine: "4.2.0" } }),
    ).toThrow(/Unsupported Spine skeleton version/);
  });
});
