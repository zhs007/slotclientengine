import { describe, expect, it, vi } from "vitest";
import { createPopupStringNodeRegistry } from "../../src/popup/string-node-registry.js";

describe("popup string node registry", () => {
  it("selects exact names and indexes and preserves overrides across targets", () => {
    const registry = createPopupStringNodeRegistry([
      { kind: "text", name: "heading", defaultText: "HELLO" },
      { kind: "image-string", name: "win-amount", defaultText: "0" },
      { kind: "text", name: "subtitle", defaultText: "READY" },
    ]);
    expect(registry.textNodes.map(({ name, index }) => [name, index])).toEqual([
      ["heading", 0],
      ["subtitle", 1],
    ]);
    expect(registry.getImageStringNode(0).name).toBe("win-amount");
    const firstTarget = { setText: vi.fn() };
    registry.setTarget("heading", firstTarget);
    expect(firstTarget.setText).toHaveBeenLastCalledWith("HELLO");
    registry.setAutomaticText("subtitle", "WAIT");
    expect(registry.getTextNode("subtitle").text).toBe("WAIT");
    registry.getTextNode("heading").setText("CONGRATULATIONS!");
    expect(registry.getTextNode(0)).toMatchObject({
      text: "CONGRATULATIONS!",
      overridden: true,
    });
    const secondTarget = { setText: vi.fn() };
    registry.setTarget("heading", secondTarget);
    expect(secondTarget.setText).toHaveBeenLastCalledWith("CONGRATULATIONS!");
    registry.setAutomaticText("heading", "NEXT");
    expect(secondTarget.setText).toHaveBeenCalledTimes(1);
    registry.getTextNode("heading").resetText();
    expect(secondTarget.setText).toHaveBeenLastCalledWith("NEXT");
    expect(() => registry.getTextNode("missing")).toThrow(/not found/);
    expect(() => registry.getImageStringNode("heading")).toThrow(/not found/);
    expect(() => registry.getTextNode(-1)).toThrow(/out of range/);
    expect(() => registry.getTextNode(0.5)).toThrow(/out of range/);
    expect(() => registry.getTextNode(2)).toThrow(/out of range/);
    expect(() => registry.setTarget("missing", null)).toThrow(/not found/);
    expect(() => registry.setAutomaticText("missing", "A")).toThrow(
      /not found/,
    );
    registry.setTarget("heading", null);
    registry.getTextNode("heading").setText("DETACHED");
    registry.getTextNode("heading").resetText();
  });

  it("rejects duplicates and invalid strings and invalidates handles on destroy", () => {
    expect(() =>
      createPopupStringNodeRegistry([
        { kind: "text", name: "same", defaultText: "A" },
        { kind: "image-string", name: "same", defaultText: "1" },
      ]),
    ).toThrow(/duplicated/);
    const registry = createPopupStringNodeRegistry([
      { kind: "text", name: "heading", defaultText: "A" },
    ]);
    const handle = registry.getTextNode(0);
    expect(() => handle.setText("bad\nline")).toThrow(/single line/);
    registry.destroy();
    registry.destroy();
    expect(() => handle.setText("B")).toThrow(/destroyed/);
    expect(() => handle.text).toThrow(/destroyed/);
    expect(() => handle.overridden).toThrow(/destroyed/);
  });
});
