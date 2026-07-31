import { describe, expect, it } from "vitest";
import {
  SYMBOL_STATE_TEXTURE_GENERATION_PRESET,
  generateSymbolStateTextureRgba,
  parseSymbolStateTextureGenerationPreset,
} from "../../src/symbol/state-texture-generation.js";

describe("symbol state texture generation", () => {
  it("loads the versioned production preset", () => {
    expect(SYMBOL_STATE_TEXTURE_GENERATION_PRESET).toEqual({
      version: 1,
      states: {
        spinBlur: {
          kind: "verticalBoxBlur",
          kernelWidth: 3,
          kernelHeight: 21,
        },
        disabled: { kind: "grayscale", brightness: 0.72 },
      },
    });
  });

  it("generates vertical blur without mutating the source", () => {
    const input = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0,
    ]);
    const before = input.slice();
    const result = generateSymbolStateTextureRgba({
      state: "spinBlur",
      width: 1,
      height: 3,
      data: input,
    });
    expect(input).toEqual(before);
    expect([...result.data]).toEqual([
      134, 12, 109, 140, 121, 12, 121, 128, 109, 12, 134, 115,
    ]);
  });

  it("generates brightness-adjusted grayscale and preserves alpha", () => {
    const result = generateSymbolStateTextureRgba({
      state: "disabled",
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 9, 0, 255, 0, 240]),
    });
    expect([...result.data]).toEqual([39, 39, 39, 9, 131, 131, 131, 240]);
  });

  it("rejects invalid preset and pixel contracts", () => {
    expect(() =>
      parseSymbolStateTextureGenerationPreset({
        version: 2,
        states: {},
      }),
    ).toThrow(/version/);
    expect(() =>
      generateSymbolStateTextureRgba({
        state: "disabled",
        width: 2,
        height: 2,
        data: new Uint8ClampedArray(4),
      }),
    ).toThrow(/长度/);
  });
});
