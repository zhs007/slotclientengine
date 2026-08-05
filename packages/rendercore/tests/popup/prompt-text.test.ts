import { describe, expect, it } from "vitest";
import {
  createPopupPromptText,
  fitPopupPromptScale,
  validatePopupPromptText,
} from "../../src/popup/prompt-text.js";

describe("popup prompt text", () => {
  it("accepts exact single-line text and rejects empty or line breaks", () => {
    expect(validatePopupPromptText(" Press any key ")).toBe(" Press any key ");
    expect(() => validatePopupPromptText(null as unknown as string)).toThrow(
      /non-empty/,
    );
    expect(() => validatePopupPromptText("  ")).toThrow(/non-empty/);
    expect(() => validatePopupPromptText("one\ntwo")).toThrow(/single line/);
    expect(() => validatePopupPromptText("one\u2028two")).toThrow(
      /single line/,
    );
  });

  it("uses the configured family with browser fallback and fits the area", () => {
    const prompt = createPopupPromptText({
      family: "slot-popup-test",
      spec: {
        font: "font.woff2",
        defaultText: "Continue",
        fill: "#fff",
        order: 2,
        area: { x: 10, y: 20, width: 80, height: 20 },
      },
      measureText: (text) => ({ width: text.text.length * 10, height: 20 }),
    });
    expect(prompt.text.position).toMatchObject({ x: 10, y: 20 });
    expect(prompt.text.style.fontFamily).toEqual([
      "slot-popup-test",
      "sans-serif",
    ]);
    expect(prompt.text.scale.x).toBeLessThanOrEqual(1);
    prompt.setText("A much longer translated prompt");
    expect(prompt.text.scale.x).toBeLessThan(1);
    prompt.text.destroy();
  });

  it("rejects invalid metrics and fit areas", () => {
    expect(
      fitPopupPromptScale(
        { width: 100, height: 20 },
        { width: 200, height: 20 },
      ),
    ).toBe(0.5);
    expect(() =>
      fitPopupPromptScale({ width: 100, height: 20 }, { width: 0, height: 20 }),
    ).toThrow(/metrics/);
    expect(() =>
      fitPopupPromptScale(
        { width: 100, height: 20 },
        { width: Number.NaN, height: 20 },
      ),
    ).toThrow(/metrics/);
    expect(() =>
      fitPopupPromptScale({ width: 0, height: 20 }, { width: 10, height: 20 }),
    ).toThrow(/fit scale/);
  });
});
