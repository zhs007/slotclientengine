import { describe, expect, it } from "vitest";
import { createCumulativeWinSummary } from "../../src/index.js";

describe("cumulative win summary", () => {
  it("stays hidden at zero and reaches every integer target exactly", () => {
    const summary = createSummary();
    expect(summary.getSnapshot()).toMatchObject({
      currentValue: 0,
      targetValue: 0,
      visible: false,
      counting: false,
    });

    summary.incrementBy(10);
    expect(summary.getSnapshot()).toMatchObject({
      currentValue: 0,
      targetValue: 10,
      visible: false,
      counting: true,
    });
    summary.update(0);
    expect(summary.text.visible).toBe(false);
    summary.update(0.175);
    expect(summary.getSnapshot()).toMatchObject({
      currentValue: 5,
      targetValue: 10,
      visible: true,
      text: "5 coins",
    });
    summary.update(0.175);
    expect(summary.getSnapshot()).toMatchObject({
      currentValue: 10,
      targetValue: 10,
      counting: false,
      text: "10 coins",
    });

    summary.incrementBy(2);
    summary.update(1);
    expect(summary.getSnapshot().currentValue).toBe(12);
    summary.clear();
    expect(summary.getSnapshot()).toMatchObject({
      currentValue: 0,
      targetValue: 0,
      visible: false,
      counting: false,
    });
    summary.destroy();
    summary.destroy();
    expect(() => summary.update(0)).toThrow(/destroyed/);
  });

  it("rejects invalid configuration, increments, deltas and formatters", () => {
    expect(() => createSummary({ countDurationSeconds: 0 })).toThrow(
      /countDurationSeconds/,
    );
    expect(() => createSummary({ position: { x: Number.NaN, y: 0 } })).toThrow(
      /position/,
    );
    expect(() =>
      createSummary({ textStyle: { ...style, fontSize: 0 } }),
    ).toThrow(/fontSize/);
    expect(() =>
      createSummary({ textStyle: { ...style, strokeWidth: -1 } }),
    ).toThrow(/strokeWidth/);
    expect(() => createSummary({ textStyle: { ...style, fill: "" } })).toThrow(
      /fill/,
    );

    const summary = createSummary();
    expect(() => summary.incrementBy(0)).toThrow(/positive safe integer/);
    summary.incrementBy(1);
    expect(() => summary.incrementBy(1)).toThrow(/already active/);
    expect(() => summary.update(-1)).toThrow(/deltaSeconds/);
    summary.update(0.35);

    const invalidFormatter = createSummary({ formatter: () => " " });
    invalidFormatter.incrementBy(1);
    expect(() => invalidFormatter.update(0.35)).toThrow(/formatter/);
  });
});

const style = Object.freeze({
  fontSize: 48,
  fontWeight: 900 as const,
  fill: "#fff",
  stroke: "#000",
  strokeWidth: 6,
});

function createSummary(
  overrides: Partial<Parameters<typeof createCumulativeWinSummary>[0]> = {},
) {
  return createCumulativeWinSummary({
    formatter: (value) => `${value} coins`,
    countDurationSeconds: 0.35,
    position: { x: 100, y: 200 },
    textStyle: style,
    ...overrides,
  });
}
