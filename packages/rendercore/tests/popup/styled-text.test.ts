import { describe, expect, it, vi } from "vitest";
import { DOMAdapter, FillGradient, Graphics, Text } from "pixi.js";
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
    renderer.setPresentation({
      family: "system-ui",
      style: { ...style, arcDegrees: 0 },
      anchor: { x: 0, y: 1 },
    });
    expect(renderer.text).toBe("AB");
    expect(renderer.container.children[0]).not.toBe(arc);
    expect(() => renderer.setText("bad\nline")).toThrow(/single line/);
    expect(renderer.text).toBe("AB");
    renderer.destroy();
    expect(() => renderer.setText("A")).toThrow(/destroyed/);
    expect(() =>
      renderer.setPresentation({
        family: "sans-serif",
        style,
        anchor: { x: 0.5, y: 0.5 },
      }),
    ).toThrow(/destroyed/);
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

  it("fits straight and curved text by font size and exposes editor guides", () => {
    const measureText = (
      measuredText: string,
      measuredStyle: { fontSize: number },
    ) => measuredText.length * Number(measuredStyle.fontSize);
    const straight = createPopupStyledText({
      family: "sans-serif",
      text: "LONG",
      style: {
        ...style,
        fontSize: 100,
        letterSpacing: 0,
        arcDegrees: 0,
        widthRange: { minWidth: 120, maxWidth: 200 },
      },
      anchor: { x: 0.5, y: 0.5 },
      measureText,
    });
    expect(straight.layout.authoredFontSize).toBe(100);
    expect(straight.layout.effectiveFontSize).toBeCloseTo(50);
    expect(straight.layout.width).toBeCloseTo(200);
    straight.setWidthGuideVisible(true, 0.5);
    expect(straight.container.children).toHaveLength(2);
    const guide = straight.container.children.at(-1);
    expect(guide).toBeInstanceOf(Graphics);
    expect(guide?.eventMode).toBe("none");
    straight.setText("SHORT");
    expect(straight.container.children.at(-1)).toBe(guide);
    straight.setPresentation({
      family: "system-ui",
      style: {
        ...style,
        fontSize: 80,
        letterSpacing: 0,
        arcDegrees: 0,
        widthRange: { minWidth: 120, maxWidth: 200 },
      },
      anchor: { x: 0, y: 1 },
    });
    expect(straight.container.children.at(-1)).toBe(guide);
    straight.setWidthGuideVisible(false);
    expect(straight.container.children).toHaveLength(1);
    straight.destroy();

    const curved = createPopupStyledText({
      family: "sans-serif",
      text: "AB",
      style: {
        ...style,
        fontSize: 20,
        letterSpacing: 0,
        widthRange: { minWidth: 100, maxWidth: 160 },
      },
      anchor: { x: 0.5, y: 0.5 },
      measureText,
    });
    expect(curved.layout.effectiveFontSize).toBeGreaterThan(20);
    expect(curved.layout.width).toBeGreaterThanOrEqual(100);
    expect(curved.layout.width).toBeLessThanOrEqual(160);
    curved.setText("");
    expect(curved.layout.effectiveFontSize).toBe(20);
    expect(curved.layout.width).toBe(0);
    curved.destroy();
  });

  it("keeps one continuous local gradient across curved graphemes", () => {
    const createCanvas = vi
      .spyOn(DOMAdapter.get(), "createCanvas")
      .mockImplementation((width = 0, height = 0) => {
        const gradient = { addColorStop: vi.fn() };
        const context = {
          createLinearGradient: () => gradient,
          fillRect: vi.fn(),
          fillStyle: "",
        };
        return { width, height, getContext: () => context } as never;
      });
    const renderer = createPopupStyledText({
      family: "sans-serif",
      text: "ABC",
      style: {
        ...style,
        fill: {
          kind: "linear-gradient",
          angleDegrees: 90,
          stops: [
            { offset: 0, color: "#fff1a8" },
            { offset: 1, color: "#ff9900" },
          ],
        },
      },
      anchor: { x: 0.5, y: 0.5 },
      measureText: () => 20,
    });

    const graphemes = renderer.container.children[0]!.children as Text[];
    expect(graphemes).toHaveLength(3);
    const gradients = graphemes.map(({ style }) => style._fill.fill);
    expect(gradients[0]).toBeInstanceOf(FillGradient);
    expect(gradients[1]).toBe(gradients[0]);
    expect((gradients[0] as FillGradient).textureSpace).toBe("local");
    expect(graphemes.map(({ style }) => style._gradientBounds)).toEqual([
      { width: 68, height: 64 },
      { width: 68, height: 64 },
      { width: 68, height: 64 },
    ]);
    expect(graphemes.map(({ style }) => style._gradientOffset)).toEqual([
      { x: -0, y: 0 },
      { x: -24, y: 0 },
      { x: -48, y: 0 },
    ]);

    renderer.destroy();
    createCanvas.mockRestore();
  });
});
