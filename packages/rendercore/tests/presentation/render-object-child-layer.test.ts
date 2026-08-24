import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { createRenderObjectChildLayer } from "../../src/presentation/render-object-child-layer.js";
import { createRenderObject } from "../../src/presentation/render-object.js";
import { createRenderObjectLayer } from "../../src/presentation/render-object-layer.js";
import { createRenderObjectMotionRuntime } from "../../src/presentation/render-object-motion.js";

describe("RenderObject child layer", () => {
  it("uses one stable owner group, owner clock, local order, and detach-only cleanup", () => {
    const runtime = createRenderObjectMotionRuntime();
    const stage = new Container();
    const ownerView = new Container();
    const root = createRenderObjectLayer({
      view: stage,
      label: "root",
      motionRuntime: runtime,
    });
    let childLayer: ReturnType<typeof createRenderObjectChildLayer> | null =
      null;
    let owner!: ReturnType<typeof createRenderObject>;
    owner = createRenderObject({
      view: ownerView,
      getChildLayer: (ref) => {
        if (ref.kind !== "spine-slot" || ref.slot !== "amount")
          throw new Error("unknown exact child layer");
        childLayer ??= createRenderObjectChildLayer({
          owner,
          label: "amount slot",
          attach: (view) => ownerView.addChild(view),
          detach: (view) => view.parent?.removeChild(view),
        });
        return childLayer.layer;
      },
      destroy: () => ownerView.destroy({ children: false }),
    });
    const firstView = new Container();
    const secondView = new Container();
    const firstUpdate = vi.fn();
    const first = createRenderObject({
      view: firstView,
      update: firstUpdate,
      destroy: () => firstView.destroy(),
    });
    const second = createRenderObject({
      view: secondView,
      destroy: () => secondView.destroy(),
    });

    const exact = owner.getChildLayer({ kind: "spine-slot", slot: "amount" });
    expect(owner.getChildLayer({ kind: "spine-slot", slot: "amount" })).toBe(
      exact,
    );
    exact.add(first, 4);
    exact.add(second, -2);
    expect(ownerView.children).toHaveLength(1);
    expect(firstView.parent).toBe(ownerView.children[0]);
    expect(firstView.zIndex).toBe(4);
    expect(secondView.zIndex).toBe(-2);

    runtime.update(0.1);
    expect(firstUpdate).not.toHaveBeenCalled();
    root.layer.add(owner);
    runtime.update(0.2);
    expect(firstUpdate).toHaveBeenCalledWith(0.2);

    owner.destroy();
    expect(firstView.parent).toBeNull();
    expect(secondView.parent).toBeNull();
    first.destroy();
    second.destroy();
    runtime.destroy();
    stage.destroy({ children: false });
  });

  it("fails explicitly for unsupported objects and exact refs", () => {
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });
    expect(() =>
      object.getChildLayer({ kind: "vni-text-layer", layerId: "amount" }),
    ).toThrow(/does not expose child layers/);
    object.destroy();
  });
});
