import { describe, expect, it } from "vitest";
import { Camera, director, Label, Node, Sprite, SpriteFrame } from "cc";
import { createCocosNodeDriver } from "../../src/cocos/cocos-node-driver";

describe("Cocos Node visual capture", () => {
  it("captures a complete complex subtree after the next draw without using Camera.render()", async () => {
    const driver = createCocosNodeDriver();
    const hostParent = new Node("Host Parent");
    const root = new Node("Card Content Root");
    const art = new Node("art Sprite");
    const artFrame = new SpriteFrame();
    artFrame.originalSize = { width: 100, height: 50 };
    artFrame.rect = { x: 0, y: 0, width: 100, height: 50 };
    artFrame.texture = {};
    art.addComponent(Sprite).spriteFrame = artFrame;
    const value = new Node("value Label");
    value.addComponent(Label).string = "Bamboo 07";
    const decoration = new Node("decoration");
    decoration.addChild(new Node("nested renderable child"));
    root.addChild(art);
    root.addChild(value);
    root.addChild(decoration);
    hostParent.addChild(root);
    root.setPosition(14, -9, 0);
    root.setScale(1.2, 0.8, 1);
    const scene = director.getScene();
    if (!scene) throw new Error("fake Cocos scene is missing");
    const sceneChildrenBefore = [...scene.children];

    const capture = driver.captureNodeVisual?.({
      node: root,
      width: 100,
      height: 50,
      revision: "result-v1",
    });
    if (!capture) {
      throw new Error("fake Cocos capture is missing");
    }
    expect(capture).toBeInstanceOf(Promise);
    expect("render" in Camera.prototype).toBe(false);
    const captured = await capture;

    expect(captured.width).toBe(100);
    expect(captured.height).toBe(50);
    expect(captured.spriteFrame.originalSize).toEqual({
      width: 100,
      height: 50,
    });
    expect(captured.spriteFrame.flipUVY).toBe(true);
    expect(root.parent).toBe(hostParent);
    expect(root.position).toMatchObject({ x: 14, y: -9 });
    expect(root.scale).toMatchObject({ x: 1.2, y: 0.8 });
    expect(root.children).toEqual([art, value, decoration]);
    expect(root.isValid).toBe(true);
    expect(scene.children).toEqual(sceneChildrenBefore);

    captured.release();
    captured.release();
    expect(
      (captured.spriteFrame as SpriteFrame & { destroyed: boolean }).destroyed,
    ).toBe(true);
    expect(root.isValid).toBe(true);
  });

  it("fails before capture for missing scenes, invalid nodes, and invalid sizes", () => {
    const driver = createCocosNodeDriver();
    const destroyed = new Node("destroyed");
    destroyed.destroy();
    expect(() =>
      driver.captureNodeVisual?.({
        node: destroyed,
        width: 100,
        height: 50,
      }),
    ).toThrow("valid host Node");
    expect(() =>
      driver.captureNodeVisual?.({
        node: new Node("bad size"),
        width: 0,
        height: 50,
      }),
    ).toThrow("finite and positive");
  });

  it("serializes concurrent captures so cameras cannot see sibling capture roots", async () => {
    const driver = createCocosNodeDriver();
    const scene = director.getScene();
    if (!scene) throw new Error("fake Cocos scene is missing");
    const sceneChildrenBefore = [...scene.children];
    const firstNode = new Node("first visual");
    const secondNode = new Node("second visual");

    const firstCapture = driver.captureNodeVisual?.({
      node: firstNode,
      width: 100,
      height: 50,
      revision: "first",
    });
    const secondCapture = driver.captureNodeVisual?.({
      node: secondNode,
      width: 100,
      height: 50,
      revision: "second",
    });
    if (!firstCapture || !secondCapture) {
      throw new Error("fake Cocos capture is missing");
    }

    await Promise.resolve();
    expect(
      scene.children.filter((node) => node.name === "V5G Node Capture"),
    ).toHaveLength(1);

    const first = await firstCapture;
    await Promise.resolve();
    expect(
      scene.children.filter((node) => node.name === "V5G Node Capture"),
    ).toHaveLength(1);

    const second = await secondCapture;
    expect(scene.children).toEqual(sceneChildrenBefore);
    first.release();
    second.release();
  });
});
