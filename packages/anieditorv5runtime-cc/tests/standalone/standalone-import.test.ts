import { describe, expect, it } from "vitest";
import * as runtime from "../../standalone/anieditorv5runtime-cc";

describe("standalone runtime import", () => {
  it("imports directly with only the cc alias and exposes the public API", () => {
    expect(runtime.SUPPORTED_ANIMATION_TYPES).toEqual(
      expect.arrayContaining([
        "scale_in",
        "scale_out",
        "pop",
        "shake",
        "blink",
        "particles",
        "particle_twinkle",
      ]),
    );
    expect(runtime.PARTICLE_ANIMATION_TYPES).toEqual([
      "particles",
      "particle_twinkle",
    ]);
    expect(runtime.createV5GCocosPlayer).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer).toBeTypeOf("function");
    expect(runtime.assertV5GProject).toBeTypeOf("function");
    expect(runtime.validateV5GProject).toBeTypeOf("function");
    expect(runtime.validateCocosV5GProject).toBeTypeOf("function");
    expect(runtime.parseColorHex).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer.prototype.playRange).toBeTypeOf("function");
    expect(runtime.V5GCocosPlayer.prototype.addPlaybackEvent).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.clearPlaybackEvent).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.clearPlaybackEvents).toBeTypeOf(
      "function",
    );
    expect(runtime.V5GCocosPlayer.prototype.onPlaybackComplete).toBeTypeOf(
      "function",
    );
    expect(runtime.sampleProjectAtTime).toBeTypeOf("function");
    expect(runtime.sampleLayerAtTime).toBeTypeOf("function");
    expect(runtime.sampleLayerAnimationsAtTime).toBeTypeOf("function");
    expect(runtime.sampleParticleSpritesForLayer).toBeTypeOf("function");
    expect(runtime.hasActiveParticleAnimation).toBeTypeOf("function");
    expect(runtime.opacityToCocosOpacity(0.5)).toBe(128);
    expect(runtime.v5gTransformToCocosPosition).toBeTypeOf("function");
  });
});
