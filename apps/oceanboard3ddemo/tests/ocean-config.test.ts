import { describe, expect, it } from "vitest";
import {
  clampOceanPixelRatio,
  getOceanCameraProfile,
} from "../src/ocean-config.js";

describe("ocean camera profile", () => {
  it("keeps the horizon high in a portrait viewport", () => {
    expect(getOceanCameraProfile(9 / 16)).toEqual({
      fov: 48,
      lookY: -17.2,
      lookZ: -56,
    });
  });

  it("rejects invalid viewport aspects", () => {
    expect(() => getOceanCameraProfile(0)).toThrow(/Invalid ocean viewport/);
  });
});

describe("ocean pixel ratio", () => {
  it("caps high-density displays for the ocean shader budget", () => {
    expect(clampOceanPixelRatio(3)).toBe(1.5);
    expect(clampOceanPixelRatio(1.25)).toBe(1.25);
    expect(clampOceanPixelRatio(Number.NaN)).toBe(1);
  });
});
