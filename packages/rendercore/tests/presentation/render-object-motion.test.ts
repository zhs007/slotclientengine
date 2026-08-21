import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  attachRenderObjectToSpineSlot,
  createRenderObjectMotionRuntime,
  createRenderObject,
} from "../../src/presentation/index.js";

describe("RenderObject property motion", () => {
  it("snaps all properties atomically while an owned object is detached", () => {
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });

    object.motion.snap({
      position: { x: 10, y: 20 },
      opacity: 0.4,
      scale: { x: -2, y: 3 },
      rotationDegrees: 450,
    });

    expect(view.position).toMatchObject({ x: 10, y: 20 });
    expect(view.alpha).toBe(0.4);
    expect(view.scale).toMatchObject({ x: -2, y: 3 });
    expect(view.angle).toBe(450);
    object.destroy();
  });

  it("animates position, opacity, scale, and literal rotation in one transaction", async () => {
    const runtime = createRenderObjectMotionRuntime();
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });
    const attachment = runtime.attach(object);

    const completed = vi.fn();
    const animation = object.motion
      .animate({
        position: { x: 100, y: 40 },
        opacity: 0,
        scale: { x: -1, y: 2 },
        rotationDegrees: 720,
        durationSeconds: 1,
      })
      .then(completed);

    runtime.update(0.5);
    expect(view.x).toBeCloseTo(50);
    expect(view.y).toBeCloseTo(20);
    expect(view.alpha).toBeCloseTo(0.5);
    expect(view.scale.x).toBeCloseTo(0);
    expect(view.scale.y).toBeCloseTo(1.5);
    expect(view.angle).toBeCloseTo(360);
    expect(completed).not.toHaveBeenCalled();

    runtime.update(0.75);
    await animation;
    expect(view.x).toBeCloseTo(100);
    expect(view.y).toBeCloseTo(40);
    expect(view.alpha).toBe(0);
    expect(view.scale.x).toBe(-1);
    expect(view.scale.y).toBe(2);
    expect(view.angle).toBeCloseTo(720);
    expect(completed).toHaveBeenCalledOnce();

    attachment.detach();
    object.destroy();
    runtime.destroy();
  });

  it("fades without changing discrete visibility", async () => {
    const runtime = createRenderObjectMotionRuntime();
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });
    runtime.attach(object);
    object.setVisible(false);
    object.setOpacity(0.25);

    const fadeIn = object.motion.fadeIn({ durationSeconds: 0.2 });
    runtime.update(0.2);
    await fadeIn;
    expect(view.alpha).toBe(1);
    expect(view.visible).toBe(false);

    const fadeOut = object.motion.fadeOut({ durationSeconds: 0.2 });
    runtime.update(0.2);
    await fadeOut;
    expect(view.alpha).toBe(0);
    expect(view.visible).toBe(false);

    object.destroy();
    runtime.destroy();
  });

  it("inherits the parent clock when a detached Spine slot tree is mounted", async () => {
    const runtime = createRenderObjectMotionRuntime();
    const spineView = new Container();
    const childView = new Container();
    const spine = createRenderObject({
      view: spineView,
      spineSlots: {
        attach: ({ object }) => spineView.addChild(object),
        remove: (object) => object.parent?.removeChild(object),
      },
      destroy: () => spineView.destroy({ children: false }),
    });
    const child = createRenderObject({
      view: childView,
      destroy: () => childView.destroy(),
    });
    const slot = attachRenderObjectToSpineSlot({
      spine,
      child,
      slot: "amount",
    });

    await expect(
      child.motion.fadeOut({ durationSeconds: 0.1 }),
    ).rejects.toThrow(/not attached/);
    const root = runtime.attach(spine);
    const fading = child.motion.fadeOut({ durationSeconds: 0.1 });
    runtime.update(0.1);
    await fading;
    expect(childView.alpha).toBe(0);

    root.detach();
    await expect(child.motion.fadeIn({ durationSeconds: 0.1 })).rejects.toThrow(
      /not attached/,
    );
    slot.detach();
    child.destroy();
    spine.destroy();
    runtime.destroy();
  });

  it("preflights an invalid parallel target without interrupting active motion", async () => {
    const runtime = createRenderObjectMotionRuntime();
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });
    runtime.attach(object);
    const valid = object.motion.animate({
      opacity: 0.5,
      durationSeconds: 1,
    });

    await expect(
      object.motion.animate({
        opacity: 2,
        scale: { x: 4, y: 4 },
        durationSeconds: 1,
      }),
    ).rejects.toThrow(/opacity/);
    expect(view.alpha).toBe(1);
    expect(view.scale.x).toBe(1);

    runtime.update(1);
    await valid;
    expect(view.alpha).toBe(0.5);
    object.destroy();
    runtime.destroy();
  });

  it("cancels on direct setters, detach, and destroy", async () => {
    const runtime = createRenderObjectMotionRuntime();
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });
    const attachment = runtime.attach(object);
    const first = object.motion.animate({
      position: { x: 100, y: 0 },
      opacity: 0,
      durationSeconds: 1,
    });
    runtime.update(0.25);
    object.setScale({ x: 2, y: 2 });
    await expect(first).rejects.toThrow(/direct scale change/);
    expect(view.x).toBeCloseTo(25);
    expect(view.alpha).toBeCloseTo(0.75);

    const second = object.motion.animate({
      rotationDegrees: 90,
      durationSeconds: 1,
    });
    attachment.detach();
    await expect(second).rejects.toThrow(/owner was detached/);
    await expect(
      object.motion.animate({ opacity: 1, durationSeconds: 1 }),
    ).rejects.toThrow(/not attached/);

    runtime.attach(object);
    const third = object.motion.animate({ opacity: 0, durationSeconds: 1 });
    object.destroy();
    await expect(third).rejects.toThrow(/owner was detached/);
    runtime.destroy();
  });

  it("rejects generic motion for borrowed RenderObjects", async () => {
    const runtime = createRenderObjectMotionRuntime();
    const view = new Container();
    const borrowed = createRenderObject({
      view,
      owned: false,
      destroy: () => undefined,
    });
    runtime.attach(borrowed);

    await expect(
      borrowed.motion.animate({ opacity: 0, durationSeconds: 1 }),
    ).rejects.toThrow(/Borrowed RenderObject/);
    runtime.destroy();
  });
});
