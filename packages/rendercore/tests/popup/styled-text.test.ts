import { describe, expect, it } from "vitest";
import {
  createPopupStyledText,
  validatePopupStyledText,
} from "../../src/popup/styled-text.js";

const style = {
  fontSize: 64,
  letterSpacing: 4,
  fill: { kind: "solid" as const, color: "#ffffff" },
  stroke: { color: "#a40000", width: 6 },
  shadow: {
    color: "#000000",
    alpha: 0.6,
    blur: 4,
    distance: 6,
    angleDegrees: 90,
  },
  arcDegrees: 60,
};

describe("popup styled text", () => {
  it("lays graphemes on signed arcs and updates atomically", () => {
    const renderer = createPopupStyledText({
      family: "sans-serif",
      text: "ABC",
      style,
      anchor: { x: 0.5, y: 0.5 },
      measureText: () => 20,
    });
    const arc = renderer.container.children[0]!;
    expect(arc.children).toHaveLength(3);
    expect(arc.children[0]!.rotation).toBeLessThan(0);
    expect(arc.children[2]!.rotation).toBeGreaterThan(0);
    renderer.setText("AB");
    expect(renderer.text).toBe("AB");
    expect(renderer.container.children[0]!.children).toHaveLength(2);
    expect(() => renderer.setText("bad\nline")).toThrow(/single line/);
    expect(renderer.text).toBe("AB");
    renderer.destroy();
    expect(() => renderer.setText("A")).toThrow(/destroyed/);
  });

  it("accepts empty single-line strings and rejects non-NFC/control text", () => {
    expect(validatePopupStyledText("")).toBe("");
    expect(() => validatePopupStyledText("e\u0301")).toThrow(/NFC/);
    expect(() => validatePopupStyledText("a\u0000b")).toThrow(/single line/);
    expect(() => validatePopupStyledText(1 as never)).toThrow(/must be string/);
  });

  it("supports straight text, negative arcs, and strict custom metrics", () => {
    const straight = createPopupStyledText({
      family: "sans-serif",
      text: "WIN",
      style: {
        ...style,
        arcDegrees: 0,
      },
      anchor: { x: 0.5, y: 0.5 },
    });
    straight.setText("WIN");
    expect(straight.container.children).toHaveLength(1);
    straight.destroy();
    straight.destroy();

    const negative = createPopupStyledText({
      family: "sans-serif",
      text: "AB",
      style: { ...style, arcDegrees: -45 },
      anchor: { x: 0, y: 0 },
      measureText: () => 10,
    });
    expect(
      negative.container.children[0]!.children[0]!.rotation,
    ).toBeGreaterThan(0);
    negative.destroy();
    expect(() =>
      createPopupStyledText({
        family: "sans-serif",
        text: "A",
        style,
        anchor: { x: 0.5, y: 0.5 },
        measureText: () => Number.NaN,
      }),
    ).toThrow(/metrics/);
    expect(() =>
      createPopupStyledText({
        family: "sans-serif",
        text: "A",
        style,
        anchor: { x: 0.5, y: 0.5 },
        measureText: () => -1,
      }),
    ).toThrow(/metrics/);
    const emptyArc = createPopupStyledText({
      family: "sans-serif",
      text: "",
      style: { ...style, stroke: undefined, shadow: undefined },
      anchor: { x: 1, y: 1 },
      measureText: () => 0,
    });
    expect(emptyArc.container.children[0]!.children).toHaveLength(0);
    emptyArc.destroy();
  });
});
