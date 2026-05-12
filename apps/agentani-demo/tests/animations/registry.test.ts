import { describe, expect, it } from "vitest";
import { animationEffects } from "../../src/runtime/animation-effects.js";
import {
  animationRegistry,
  getReadyAnimation,
} from "../../src/animations/registry.js";

describe("animation registry", () => {
  it("contains all editor2 directories as ready code animations", () => {
    expect(animationRegistry.map((entry) => entry.id)).toEqual([
      "bg",
      "fang",
      "heart",
      "mei",
      "tao",
      "海滩",
      "竹子1",
    ]);
    expect(getReadyAnimation("bg")?.project.id).toBe("bg");
    expect(getReadyAnimation("fang")?.project.layers).toHaveLength(6);
    expect(getReadyAnimation("heart")?.project.layers).toHaveLength(6);
    expect(getReadyAnimation("mei")?.project.layers).toHaveLength(6);
    expect(getReadyAnimation("tao")?.project.layers).toHaveLength(6);
    expect(getReadyAnimation("海滩")?.project.layers).toHaveLength(13);
    expect(getReadyAnimation("竹子1")?.project.layers).toHaveLength(18);
  });

  it("registers every converted animation effect explicitly", () => {
    expect(Object.keys(animationEffects).sort()).toEqual([
      "fadeIn",
      "fadeOut",
      "fireDistortion",
      "float",
      "leafFall",
      "particleBurst",
      "pulse",
      "slideOut",
      "starlight",
      "sweepLight",
      "swing",
      "zoomIn",
    ]);
  });
});
