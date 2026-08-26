import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createRenderObject,
  getRenderObjectAdapter,
} from "../../src/presentation/render-object.js";
import { createRenderObjectPool } from "../../src/presentation/render-object-pool.js";

describe("RenderObject pool", () => {
  it("starts empty, grows to concurrency, resets, and stales destroyed handles", async () => {
    const views: Container[] = [];
    const stops: ReturnType<typeof vi.fn>[] = [];
    const pool = createRenderObjectPool({
      create: () => {
        const view = new Container();
        const stop = vi.fn();
        views.push(view);
        stops.push(stop);
        return createRenderObject({
          view,
          stop,
          destroy: () => view.destroy(),
        });
      },
    });

    expect(views).toHaveLength(0);
    const first = await pool.create();
    const second = await pool.create();
    expect(views).toHaveLength(2);
    first.setPosition({ x: 12, y: 8 });
    first.setOpacity(0.25);
    first.setRotation(30);
    first.setScale({ x: -2, y: 3 });
    first.setVisible(false);
    first.destroy();
    first.destroy();
    expect(() => first.setVisible(true)).toThrow(/destroyed/);

    const third = await pool.create();
    expect(views).toHaveLength(2);
    expect(getRenderObjectAdapter(third).view).toBe(views[0]);
    expect(views[0]).toMatchObject({
      x: 0,
      y: 0,
      alpha: 1,
      angle: 0,
      visible: true,
      zIndex: 0,
    });
    expect(views[0]!.scale).toMatchObject({ x: 1, y: 1 });
    expect(stops[0]).toHaveBeenCalled();

    second.destroy();
    third.destroy();
    pool.destroy();
    expect(views.every((view) => view.destroyed)).toBe(true);
    await expect(pool.create()).rejects.toThrow(/pool was destroyed/);
  });

  it("returns acquired instances through destroy() while pool destroy is permanent", async () => {
    const views: Container[] = [];
    const pool = createRenderObjectPool({
      create: () => {
        const view = new Container();
        views.push(view);
        return createRenderObject({ view, destroy: () => view.destroy() });
      },
    });
    const acquired = await pool.create();
    acquired.destroy();
    expect(views[0]!.destroyed).toBe(false);
    const replacement = await pool.create();
    expect(views).toHaveLength(1);
    expect(getRenderObjectAdapter(replacement).view).toBe(views[0]);
    pool.destroy();
    expect(views[0]!.destroyed).toBe(true);
  });

  it("destroys an object whose reset fails instead of returning it idle", async () => {
    const views: Container[] = [];
    const pool = createRenderObjectPool({
      create: () => {
        const view = new Container();
        views.push(view);
        return createRenderObject({
          view,
          stop: () => {
            throw new Error("reset failed");
          },
          destroy: () => view.destroy(),
        });
      },
    });
    const acquired = await pool.create();
    expect(() => acquired.destroy()).toThrow("reset failed");
    expect(views[0]!.destroyed).toBe(true);
    const replacement = await pool.create();
    expect(views).toHaveLength(2);
    expect(() => replacement.destroy()).toThrow("reset failed");
    pool.destroy();
  });
});
