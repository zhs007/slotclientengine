import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { resolveRenderAnchor } from "../../src/presentation/render-anchor.js";
import {
  createCloneableRenderObject,
  createRenderObject,
  getRenderObjectAdapter,
} from "../../src/presentation/render-object.js";
import { createTextRenderObject } from "../../src/presentation/text-render-object.js";

describe("RenderObject", () => {
  it("sets finite local clockwise rotation in degrees", () => {
    const view = new Container();
    const object = createRenderObject({
      view,
      destroy: () => view.destroy(),
    });

    object.setRotation(90);
    expect(view.angle).toBe(90);
    expect(() => object.setRotation(Number.POSITIVE_INFINITY)).toThrow(
      /finite number of degrees/,
    );
    expect(view.angle).toBe(90);

    object.destroy();
  });

  it("resolves a logical object's current Container without exposing it", () => {
    const root = new Container();
    const first = new Container({ position: { x: 10, y: 20 } });
    const second = new Container({ position: { x: 30, y: 40 } });
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

    expect(resolveRenderAnchor(anchor, root)).toEqual({ x: 10, y: 20 });
    current = second;
    expect(resolveRenderAnchor(anchor, root)).toEqual({ x: 30, y: 40 });
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
