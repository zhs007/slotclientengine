import gsap from "gsap";
import { Container, Sprite } from "pixi.js";
import { registerBuiltinAnimations } from "../../src/animations/index.js";
import { normalizeProjectConfig } from "../../src/config/victory-project.js";
import { AnimationRegistry } from "../../src/runtime/animation-registry.js";
import { createLayerInstances } from "../../src/runtime/layer-factory.js";

describe("animation registry", () => {
  it("registers built-in animations and exposes effect builders", () => {
    const registry = new AnimationRegistry();
    registerBuiltinAnimations(registry);

    expect(registry.has("fadeIn")).toBe(true);
    expect(registry.has("fireDistortion")).toBe(true);
    expect(registry.has("custom")).toBe(false);

    const documentMock = {
      createElement: () => ({
        width: 0,
        height: 0,
        getContext: () => ({
          fillStyle: "",
          filter: "",
          fillRect: () => undefined,
          drawImage: () => undefined
        })
      })
    };
    vi.stubGlobal("document", documentMock);

    const project = normalizeProjectConfig(
      {
        layers: [{ id: "fire", type: "pic", asset: "./assets/fire.png", animations: [] }]
      },
      (value) => value
    );
    const instances = createLayerInstances(project.layers, new Map());
    const instance = instances.get("fire")!;
    const target = instance.target as Sprite;
    const factory = registry.get("fireDistortion")!;
    const tween = factory({
      layer: project.layers[0],
      instance,
      container: instance.container as Container,
      target,
      duration: 1,
      params: {},
      registerCleanup: (cleanup) => instance.cleanupTasks.add(cleanup),
      timelineFactory: gsap.timeline
    });

    expect(tween).toBeDefined();
    expect(instance.cleanupTasks.size).toBe(1);
    expect(target.filters).toHaveLength(1);
    vi.unstubAllGlobals();
  });
});