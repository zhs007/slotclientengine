import { describe, expect, it } from "vitest";
import {
  animationRegistry,
  getReadyAnimation,
} from "../../src/animations/pixi/registry.js";

describe("pixi animation registry", () => {
  it("lists every editor2 directory and marks only bg as ready", () => {
    expect(animationRegistry.map((entry) => entry.id)).toEqual([
      "bg",
      "fang",
      "heart",
      "mei",
      "tao",
      "beach",
      "bamboo1",
    ]);
    expect(getReadyAnimation("bg")?.module?.id).toBe("bg");
    expect(getReadyAnimation("fang")).toBeNull();
  });
});
