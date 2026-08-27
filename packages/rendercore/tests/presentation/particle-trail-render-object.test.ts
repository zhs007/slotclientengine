import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createParticleTrailRenderObject,
  type ParticleTrailConfig,
} from "../../src/presentation/particle-trail-render-object.js";
import {
  createRenderObject,
  getRenderObjectAdapter,
} from "../../src/presentation/render-object.js";
import { createRenderObjectMotionRuntime } from "../../src/presentation/render-object-motion.js";

const CONFIG = Object.freeze({
  maxParticles: 8,
  emissionRate: 40,
  lifetimeSeconds: Object.freeze({ min: 0.5, max: 0.5 }),
  speedPixelsPerSecond: Object.freeze({ min: 0, max: 0 }),
  sizePixels: Object.freeze({ min: 8, max: 8 }),
  directionDegrees: 0,
  spreadDegrees: 0,
  gravityPixelsPerSecondSquared: 0,
  seed: 256,
}) satisfies ParticleTrailConfig;

describe("ParticleTrailRenderObject", () => {
  it("uses a fixed pool and naturally drains after emission stops", async () => {
    const root = new Container();
    const emitterView = new Container({ position: { x: 10, y: 20 } });
    root.addChild(emitterView);
    const emitter = createRenderObject({
      view: emitterView,
      owned: false,
      destroy: () => undefined,
    });
    const onDestroy = vi.fn();
    const trail = createParticleTrailRenderObject({
      texture: Texture.WHITE,
      emitter: emitter.getAnchor(),
      config: CONFIG,
      onDestroy,
    });
    const trailView = getRenderObjectAdapter(trail).view;
    root.addChild(trailView);
    const runtime = createRenderObjectMotionRuntime();
    const attachment = runtime.attach(trail);

    expect(trailView.children).toHaveLength(CONFIG.maxParticles);
    runtime.update(0.1);
    expect(trail.getLiveParticleCount()).toBe(4);
    emitterView.position.set(50, 60);
    runtime.update(0.1);
    expect(trail.getLiveParticleCount()).toBe(8);

    let drained = false;
    const completion = trail.stopEmissionAndDrain().then(() => {
      drained = true;
    });
    expect(trail.isEmitting()).toBe(false);
    runtime.update(0.2);
    expect(trail.getLiveParticleCount()).toBeGreaterThan(0);
    expect(drained).toBe(false);
    runtime.update(0.4);
    await completion;
    expect(trail.getLiveParticleCount()).toBe(0);
    expect(drained).toBe(true);
    expect(trailView.children).toHaveLength(CONFIG.maxParticles);

    attachment.detach();
    trail.destroy();
    expect(onDestroy).toHaveBeenCalledOnce();
    runtime.destroy();
    emitterView.destroy();
    root.destroy();
  });

  it("rejects unsafe capacity and ranges before allocating sprites", () => {
    const emitterView = new Container();
    const emitter = createRenderObject({
      view: emitterView,
      owned: false,
      destroy: () => undefined,
    });
    expect(() =>
      createParticleTrailRenderObject({
        texture: Texture.WHITE,
        emitter: emitter.getAnchor(),
        config: { ...CONFIG, maxParticles: 513 },
      }),
    ).toThrow(/must not exceed 512/u);
    expect(() =>
      createParticleTrailRenderObject({
        texture: Texture.WHITE,
        emitter: emitter.getAnchor(),
        config: {
          ...CONFIG,
          lifetimeSeconds: { min: 0.5, max: 0.1 },
        },
      }),
    ).toThrow(/ordered positive range/u);
    emitterView.destroy();
  });
});
