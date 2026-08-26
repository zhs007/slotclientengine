import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createSceneLayoutCameraEffectController } from "../../src/scene-layout/camera-effect.js";

describe("scene layout camera effects", () => {
  it("composes owners and restores the neutral transform after all finish", async () => {
    const root = new Container();
    const controller = createSceneLayoutCameraEffectController(root);
    controller.applyViewport(1000, 600);
    const normal = controller.start({
      zoomScale: 1.05,
      shakeX: 2,
      shakeY: 1,
      shakeFrequencyHz: 8,
      transitionSeconds: 0.2,
    });
    const strong = controller.start({
      zoomScale: 1.1,
      shakeX: 5,
      shakeY: 3,
      shakeFrequencyHz: 12,
      transitionSeconds: 0.1,
    });

    controller.update(0.2);
    expect(root.scale.x).toBeCloseTo(1.1);
    expect(root.pivot.x).toBe(500);
    expect(root.pivot.y).toBe(300);
    expect(root.position.x).not.toBe(500);

    const strongFinished = strong.finish({ durationSeconds: 0.1 });
    controller.update(0.1);
    await strongFinished;
    expect(root.scale.x).toBeCloseTo(1.05);

    const normalFinished = normal.finish({ durationSeconds: 0.2 });
    controller.update(0.2);
    await normalFinished;
    expect(root.scale.x).toBe(1);
    expect(root.scale.y).toBe(1);
    expect(root.position.x).toBe(500);
    expect(root.position.y).toBe(300);
  });

  it("releases one owner on abort without resetting another owner", () => {
    const root = new Container();
    const controller = createSceneLayoutCameraEffectController(root);
    controller.applyViewport(800, 500);
    const abort = new AbortController();
    controller.start(
      {
        zoomScale: 1.08,
        shakeX: 0,
        shakeY: 0,
        shakeFrequencyHz: 1,
        transitionSeconds: 0,
      },
      { signal: abort.signal },
    );
    const retained = controller.start({
      zoomScale: 1.04,
      shakeX: 0,
      shakeY: 0,
      shakeFrequencyHz: 1,
      transitionSeconds: 0,
    });

    abort.abort();
    expect(root.scale.x).toBeCloseTo(1.04);
    retained.cancel();
    expect(root.scale.x).toBe(1);
  });

  it("rebases the active camera around a new viewport center", () => {
    const root = new Container();
    const controller = createSceneLayoutCameraEffectController(root);
    controller.applyViewport(1000, 600);
    controller.start({
      zoomScale: 1.05,
      shakeX: 0,
      shakeY: 0,
      shakeFrequencyHz: 1,
      transitionSeconds: 0,
    });

    controller.applyViewport(600, 1000);
    expect(root.pivot.x).toBe(300);
    expect(root.pivot.y).toBe(500);
    expect(root.position.x).toBe(300);
    expect(root.position.y).toBe(500);
    expect(root.scale.x).toBeCloseTo(1.05);
  });
});
