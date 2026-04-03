import gsap from "gsap";
import type { VictoryProjectConfig } from "../config/victory-types.js";
import type { AnimationRegistry } from "./animation-registry.js";
import type { LayerInstance } from "./layer-instance.js";
import { runLayerCleanups } from "./layer-instance.js";

export interface TimelineBuildInput {
  project: VictoryProjectConfig;
  registry: AnimationRegistry;
  instances: Map<string, LayerInstance>;
  onTimeUpdate?: (time: number) => void;
}

export function resetLayerInstances(instances: Map<string, LayerInstance>) {
  for (const instance of instances.values()) {
    runLayerCleanups(instance);

    while (instance.container.children.length > 1) {
      const child = instance.container.removeChildAt(1);
      const destroyable = child as { destroyed?: boolean; destroy?: (options?: object) => void };
      if (!destroyable.destroyed && typeof destroyable.destroy === "function") {
        destroyable.destroy({ children: true });
      }
    }

    gsap.killTweensOf(instance.target);
    gsap.killTweensOf(instance.target.scale);
    gsap.killTweensOf(instance.target.position);
    gsap.killTweensOf((instance.target as { skew?: object }).skew ?? {});
    instance.target.position.set(instance.baseState.x, instance.baseState.y);
    instance.target.scale.set(instance.baseState.scaleX, instance.baseState.scaleY);
    instance.target.rotation = instance.baseState.rotation;
    instance.target.alpha = instance.baseState.alpha;
    instance.target.visible = instance.baseState.visible;
    instance.target.filters = [];
  }
}

export function buildMasterTimeline({ project, registry, instances, onTimeUpdate }: TimelineBuildInput) {
  resetLayerInstances(instances);

  const timeline = gsap.timeline({
    paused: true,
    onUpdate: () => {
      onTimeUpdate?.(timeline.time());
    }
  });

  for (const layer of project.layers) {
    const instance = instances.get(layer.id);
    if (!instance) {
      continue;
    }

    for (const animation of layer.animations) {
      const factory = registry.get(animation.type);
      if (!factory) {
        continue;
      }

      const tween = factory({
        layer,
        instance,
        container: instance.container,
        target: instance.target,
        duration: animation.duration,
        params: animation.params,
        registerCleanup: (cleanup) => {
          instance.cleanupTasks.add(cleanup);
        },
        timelineFactory: gsap.timeline
      });

      if (tween) {
        timeline.add(tween, animation.startTime);
      }
    }
  }

  timeline.to({}, { duration: 0 }, project.duration);
  return timeline;
}