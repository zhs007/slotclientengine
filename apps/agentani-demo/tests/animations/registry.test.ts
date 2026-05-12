import { describe, expect, it } from "vitest";
import { animationEffects } from "../../src/runtime/animation-effects.js";
import {
  animationRegistry,
  getReadyAnimation,
} from "../../src/animations/registry.js";

describe("animation registry", () => {
  it("contains all editor2 directories with bg ready", () => {
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
    expect(getReadyAnimation("fang")).toBeUndefined();
  });

  it("registers every bg animation effect explicitly", () => {
    expect(Object.keys(animationEffects).sort()).toEqual([
      "fadeIn",
      "fadeOut",
      "pulse",
      "starlight",
      "sweepLight",
      "swing",
    ]);
  });
});
