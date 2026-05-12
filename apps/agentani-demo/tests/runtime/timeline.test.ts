import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import { bgProject } from "../../src/animations/bg.js";
import { createLayer } from "../../src/runtime/layer-factory.js";
import { buildProjectTimeline } from "../../src/runtime/timeline.js";

describe("timeline", () => {
  it("schedules layer animations at their configured start times", () => {
    const layer = createLayer(bgProject.layers[0], Texture.EMPTY);
    const timeline = buildProjectTimeline(bgProject, [layer]);

    expect(timeline.duration()).toBeGreaterThanOrEqual(bgProject.duration);
    expect(
      timeline
        .getChildren(false, true, true)
        .some((child) => child.startTime() === 0.5),
    ).toBe(true);
  });
});
