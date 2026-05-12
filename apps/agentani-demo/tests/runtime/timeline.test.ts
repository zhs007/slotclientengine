import { describe, expect, it } from "vitest";
import { Texture } from "pixi.js";
import { bgProject } from "../../src/animations/bg.js";
import { bamboo1Project } from "../../src/animations/bamboo1.js";
import { fangProject } from "../../src/animations/fang.js";
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

  it("keeps pulse from changing the original layer alpha", () => {
    const config = fangProject.layers.find((layer) => layer.id === "guang");
    expect(config).toBeDefined();

    const layer = createLayer(config!, Texture.EMPTY);
    const timeline = buildProjectTimeline(fangProject, [layer]);

    timeline.seek(0.75, false);
    expect(layer.container.alpha).toBe(config!.alpha);
  });

  it("collapses duplicated fang source layers into one animated object", () => {
    const flower = fangProject.layers.find((layer) => layer.id === "hua");
    const symbol = fangProject.layers.find((layer) => layer.id === "fang");

    expect(flower?.mergedLayerIds).toEqual(["hua_copy_1", "hua_copy_6", "hua"]);
    expect(symbol?.mergedLayerIds).toEqual(["fang_copy_3", "fang"]);
    expect(fangProject.layers).toHaveLength(6);
  });

  it("hides slide-out bamboo layers after their exit motion", () => {
    const config = bamboo1Project.layers.find((layer) => layer.id === "前竹5");
    expect(config).toBeDefined();

    const layer = createLayer(config!, Texture.EMPTY);
    const timeline = buildProjectTimeline(bamboo1Project, [layer]);

    timeline.seek(1.2, false);
    expect(layer.container.alpha).toBe(0);
    expect(layer.container.visible).toBe(false);
  });
});
