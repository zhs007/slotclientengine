import { gsap } from "gsap";
import type { CodeAnimationProject } from "../animations/types.js";
import { createAnimationEffect } from "./animation-effects.js";
import type { BuiltLayer } from "./layer-factory.js";
import { resetLayer } from "./layer-factory.js";

export function buildProjectTimeline(
  project: CodeAnimationProject,
  layers: BuiltLayer[],
) {
  const timeline = gsap.timeline({
    paused: true,
    defaults: {
      overwrite: "auto",
    },
  });

  for (const layer of layers) {
    resetLayer(layer);
  }

  timeline.to({}, { duration: project.duration }, 0);

  for (const layer of layers) {
    for (const step of layer.config.animations) {
      timeline.add(
        createAnimationEffect({
          layer,
          target: layer.container,
          step,
        }),
        step.startTime,
      );
    }
  }

  return timeline;
}
