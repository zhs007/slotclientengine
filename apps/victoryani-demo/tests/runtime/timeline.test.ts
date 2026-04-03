import gsap from "gsap";
import { Texture } from "pixi.js";
import { registerBuiltinAnimations } from "../../src/animations/index.js";
import { normalizeProjectConfig } from "../../src/config/victory-project.js";
import { AnimationRegistry } from "../../src/runtime/animation-registry.js";
import { createLayerInstances } from "../../src/runtime/layer-factory.js";
import { buildMasterTimeline } from "../../src/runtime/timeline.js";

describe("timeline", () => {
  it("schedules layer animations against their configured start times", () => {
    const project = normalizeProjectConfig(
      {
        duration: 2,
        layers: [
          {
            id: "title",
            type: "pic",
            asset: "./assets/title.png",
            alpha: 1,
            animations: [{ type: "fadeIn", startTime: 0.5, duration: 1 }]
          }
        ]
      },
      (value) => value
    );
    const registry = new AnimationRegistry();
    registerBuiltinAnimations(registry);
    const instances = createLayerInstances(project.layers, new Map([["./assets/title.png", Texture.WHITE]]));

    let observedTime = 0;
    const timeline = buildMasterTimeline({
      project,
      registry,
      instances,
      onTimeUpdate: (time) => {
        observedTime = time;
      }
    });

    const target = instances.get("title")!.target;
    timeline.time(0.1, false);
    expect(target.alpha).toBe(0);

    timeline.time(0.75, false);
    expect(observedTime).toBeCloseTo(0.75, 2);
    expect(target.alpha).toBeGreaterThan(0);
    expect(target.alpha).toBeLessThan(1);
    expect(timeline.totalDuration()).toBeGreaterThanOrEqual(2);

    timeline.kill();
    gsap.globalTimeline.clear();
  });
});