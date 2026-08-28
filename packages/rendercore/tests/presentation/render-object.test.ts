import { Container, Sprite, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { resolveRenderAnchor } from "../../src/presentation/render-anchor.js";
import {
  createCloneableRenderObject,
  createRenderObject,
  getRenderObjectAdapter,
} from "../../src/presentation/render-object.js";
import { createTextRenderObject } from "../../src/presentation/text-render-object.js";

describe("RenderObject", () => {
  it("sets strict local opacity, rotation, and scale", () => {
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });

    object.setOpacity(0.4);
    object.setRotation(90);
    expect(view.alpha).toBe(0.4);
    expect(view.angle).toBe(90);
    object.setScale({ x: -1, y: 0.5 });
    expect(view.scale.x).toBe(-1);
    expect(view.scale.y).toBe(0.5);
    expect(() => object.setRotation(Number.POSITIVE_INFINITY)).toThrow(
      /finite number of degrees/,
    );
    expect(() => object.setScale({ x: 1, y: Number.NaN })).toThrow(
      /finite factors/,
    );
    expect(() => object.setOpacity(1.1)).toThrow(/between 0 and 1/);
    expect(view.alpha).toBe(0.4);
    expect(view.angle).toBe(90);
    expect(view.scale.x).toBe(-1);
    expect(view.scale.y).toBe(0.5);

    expect(() =>
      object.getAnchor("middle" as Parameters<typeof object.getAnchor>[0]),
    ).toThrow(/Unknown RenderObject alignment/);

    object.destroy();
    expect(() => object.getAnchor("center")).toThrow(/destroyed/);
  });

  it("resolves all alignments from live local bounds without double scaling", () => {
    const root = new Container();
    const view = new Container({ position: { x: 10, y: 20 } });
    const content = new Sprite(Texture.WHITE);
    content.position.set(-5, 7);
    content.width = 20;
    content.height = 30;
    view.addChild(content);
    root.addChild(view);
    const object = createRenderObject({
      view,
      destroy: () => view.destroy({ children: true }),
    });

    expect(resolveRenderAnchor(object.getAnchor(), root)).toEqual({
      x: 10,
      y: 20,
    });
    const expected = {
      "top-left": { x: 5, y: 27 },
      "top-center": { x: 15, y: 27 },
      "top-right": { x: 25, y: 27 },
      "center-left": { x: 5, y: 42 },
      center: { x: 15, y: 42 },
      "center-right": { x: 25, y: 42 },
      "bottom-left": { x: 5, y: 57 },
      "bottom-center": { x: 15, y: 57 },
      "bottom-right": { x: 25, y: 57 },
    } as const;
    for (const [alignment, point] of Object.entries(expected))
      expect(
        resolveRenderAnchor(
          object.getAnchor(alignment as keyof typeof expected),
          root,
        ),
      ).toEqual(point);

    const center = object.getAnchor("center");
    object.setScale({ x: 2, y: 3 });
    expect(resolveRenderAnchor(center, root)).toEqual({ x: 20, y: 86 });

    object.destroy();
  });

  it("resolves a logical object's current Container without exposing it", () => {
    const root = new Container();
    const first = new Container({ position: { x: 10, y: 20 } });
    const second = new Container({ position: { x: 30, y: 40 } });
    const firstContent = new Sprite(Texture.WHITE);
    firstContent.width = 10;
    firstContent.height = 10;
    first.addChild(firstContent);
    const secondContent = new Sprite(Texture.WHITE);
    secondContent.width = 20;
    secondContent.height = 30;
    second.addChild(secondContent);
    root.addChild(first, second);
    let current = first;
    const createOwnedClone = () =>
      createCloneableRenderObject({
        view: new Container(),
        clone: createOwnedClone,
        destroy: () => undefined,
      });
    const object = createCloneableRenderObject({
      view: () => current,
      owned: false,
      clone: createOwnedClone,
      destroy: () => undefined,
    });
    const anchor = object.getAnchor();
    const alignedAnchor = object.getAnchor("bottom-right");

    expect(resolveRenderAnchor(anchor, root)).toEqual({ x: 10, y: 20 });
    expect(resolveRenderAnchor(alignedAnchor, root)).toEqual({ x: 20, y: 30 });
    current = second;
    expect(resolveRenderAnchor(anchor, root)).toEqual({ x: 30, y: 40 });
    expect(resolveRenderAnchor(alignedAnchor, root)).toEqual({ x: 50, y: 70 });
    expect(getRenderObjectAdapter(object).owned).toBe(false);
    expect(() => object.destroy()).toThrow(/Borrowed RenderObject/);

    const clone = object.clone();
    expect(getRenderObjectAdapter(clone).owned).toBe(true);
    clone.destroy();
  });

  it("creates cloneable text through the same object contract", () => {
    const text = createTextRenderObject({ text: "100" });
    const clone = text.clone();
    expect(clone.getText()).toBe("100");
    text.setText("200");
    expect(clone.getText()).toBe("100");
    clone.destroy();
    text.destroy();
  });
});
