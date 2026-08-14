import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createRenderObjectLayer } from "../../src/presentation/render-object-layer.js";
import {
  createRenderObject,
  getRenderObjectAdapter,
} from "../../src/presentation/render-object.js";

function objectAt(x = 0, y = 0) {
  const view = new Container({ position: { x, y } });
  return {
    object: createRenderObject({
      view,
      destroy: () => view.destroy({ children: true }),
    }),
    view,
  };
}

describe("RenderObjectLayer", () => {
  it("adds, removes, resolves anchors, and aligns across transformed layers", () => {
    const stage = new Container();
    const sourceView = new Container({
      position: { x: 100, y: 50 },
      scale: { x: 2, y: 2 },
      rotation: Math.PI / 6,
    });
    const targetView = new Container({
      position: { x: 10, y: 5 },
      scale: { x: 0.5, y: 0.5 },
      rotation: -Math.PI / 8,
    });
    sourceView.sortableChildren = true;
    targetView.sortableChildren = true;
    stage.addChild(sourceView, targetView);
    const source = createRenderObjectLayer({
      view: sourceView,
      label: "source layer",
    });
    const target = createRenderObjectLayer({
      view: targetView,
      label: "target layer",
    });
    const anchor = source.layer.getAnchor({ x: 3, y: 4 });
    const resolved = target.layer.resolveAnchor(anchor);
    const expected = targetView.toLocal(sourceView.toGlobal({ x: 3, y: 4 }));
    expect(resolved.x).toBeCloseTo(expected.x);
    expect(resolved.y).toBeCloseTo(expected.y);

    const { object, view } = objectAt(7, 8);
    target.layer.addAt(object, {
      anchor,
      offset: { x: 2, y: -6 },
      order: 9,
    });
    expect(view.parent).toBe(targetView);
    expect(view.x).toBeCloseTo(expected.x + 2);
    expect(view.y).toBeCloseTo(expected.y - 6);
    expect(view.zIndex).toBe(9);
    target.layer.remove(object);
    expect(view.parent).toBeNull();
    object.destroy();
    stage.destroy({ children: true });
  });

  it("preflights aligned add without mutating an attached object", () => {
    const targetView = new Container();
    const other = new Container();
    const controller = createRenderObjectLayer({
      view: targetView,
      label: "test layer",
    });
    const { object, view } = objectAt(7, 8);
    view.zIndex = 3;
    other.addChild(view);
    const anchor = controller.layer.getAnchor({ x: 20, y: 30 });

    expect(() =>
      controller.layer.addAt(object, {
        anchor,
        offset: { x: 1, y: 2 },
        order: 10,
      }),
    ).toThrow(/another parent/);
    expect(view.parent).toBe(other);
    expect(view.position).toMatchObject({ x: 7, y: 8 });
    expect(view.zIndex).toBe(3);

    other.removeChild(view);
    expect(() =>
      controller.layer.addAt(object, {
        anchor,
        offset: { x: Number.NaN, y: 0 },
      }),
    ).toThrow(/finite/);
    expect(() =>
      controller.layer.addAt(object, { anchor, order: 0.5 }),
    ).toThrow(/safe integer/);
    expect(view.parent).toBeNull();
    expect(view.position).toMatchObject({ x: 7, y: 8 });
    expect(view.zIndex).toBe(3);
    object.destroy();
    targetView.destroy({ children: true });
    other.destroy({ children: true });
  });

  it("detaches all nodes without taking object ownership", () => {
    const view = new Container();
    let usable = true;
    const controller = createRenderObjectLayer({
      view,
      label: "owned layer",
      assertUsable: () => {
        if (!usable) throw new Error("layer was destroyed");
      },
    });
    const first = objectAt();
    const second = objectAt();
    controller.layer.add(first.object);
    controller.layer.add(second.object, 1);
    const staleAnchor = controller.layer.getAnchor();
    controller.detachAll();
    expect(first.view.parent).toBeNull();
    expect(second.view.parent).toBeNull();
    expect(getRenderObjectAdapter(first.object).view).toBe(first.view);
    usable = false;
    expect(() => controller.layer.getAnchor()).toThrow(/destroyed/);
    const liveTargetView = new Container();
    const liveTarget = createRenderObjectLayer({
      view: liveTargetView,
      label: "live target",
    });
    expect(() => liveTarget.layer.resolveAnchor(staleAnchor)).toThrow(
      /destroyed/,
    );
    first.object.destroy();
    second.object.destroy();
    liveTargetView.destroy({ children: true });
    view.destroy({ children: true });
  });
});
