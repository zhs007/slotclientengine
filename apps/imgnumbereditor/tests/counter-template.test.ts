import { describe, expect, it, vi } from "vitest";
import {
  CounterTemplateDriver,
  formatCounterValue,
  parseCounterTemplate,
} from "../src/preview/counter-template.js";

describe("counter template", () => {
  it("preserves leading zero width and validates exact direction/divisibility", () => {
    expect(
      parseCounterTemplate({
        startText: "001",
        endText: "100",
        step: 1,
        intervalMs: 50,
        repeat: true,
      }).digitWidth,
    ).toBe(3);
    expect(formatCounterValue(-7, 3)).toBe("-007");
    expect(() =>
      parseCounterTemplate({
        startText: "0",
        endText: "5",
        step: -1,
        intervalMs: 10,
        repeat: false,
      }),
    ).toThrow("方向");
    expect(() =>
      parseCounterTemplate({
        startText: "0",
        endText: "5",
        step: 2,
        intervalMs: 10,
        repeat: false,
      }),
    ).toThrow("整除");
    expect(() =>
      parseCounterTemplate({
        startText: "x",
        endText: "5",
        step: 1,
        intervalMs: 10,
        repeat: false,
      }),
    ).toThrow("十进制");
    expect(() =>
      parseCounterTemplate({
        startText: "0",
        endText: "0",
        step: 0,
        intervalMs: 10,
        repeat: false,
      }),
    ).toThrow("非零");
    expect(() =>
      parseCounterTemplate({
        startText: "0",
        endText: "0",
        step: 1,
        intervalMs: 0,
        repeat: false,
      }),
    ).toThrow("正数");
  });

  it("uses accumulated RAF time, shows the inclusive endpoint, pauses and resets", () => {
    let frame: FrameRequestCallback | null = null;
    const cancel = vi.fn();
    const values: string[] = [];
    const driver = new CounterTemplateDriver(
      {
        startText: "001",
        endText: "003",
        step: 1,
        intervalMs: 50,
        repeat: false,
      },
      (text) => values.push(text),
      {
        requestFrame: (callback) => {
          frame = callback;
          return 7;
        },
        cancelFrame: cancel,
      },
    );
    driver.play();
    frame!(0);
    frame!(120);
    expect(values).toEqual(["001", "002", "003"]);
    frame!(170);
    expect(driver.playing).toBe(false);
    driver.reset();
    expect(values.at(-1)).toBe("001");
    driver.destroy();
  });

  it("restarts only after the repeat endpoint had a complete tick", () => {
    let frame: FrameRequestCallback | null = null;
    const values: string[] = [];
    const driver = new CounterTemplateDriver(
      { startText: "8", endText: "9", step: 1, intervalMs: 10, repeat: true },
      (text) => values.push(text),
      {
        requestFrame: (callback) => {
          frame = callback;
          return 1;
        },
        cancelFrame: () => undefined,
      },
    );
    driver.play();
    driver.play();
    frame!(0);
    frame!(10);
    expect(values).toEqual(["8", "9"]);
    frame!(20);
    expect(values).toEqual(["8", "9", "8"]);
    driver.pause();
  });

  it("calls the native animation-frame methods with the global receiver", () => {
    let frame: FrameRequestCallback | null = null;
    const requestFrame = vi
      .spyOn(globalThis, "requestAnimationFrame")
      .mockImplementation(function (this: typeof globalThis, callback) {
        expect(this).toBe(globalThis);
        frame = callback;
        return 17;
      });
    const cancelFrame = vi
      .spyOn(globalThis, "cancelAnimationFrame")
      .mockImplementation(function (this: typeof globalThis, id) {
        expect(this).toBe(globalThis);
        expect(id).toBe(17);
      });
    const driver = new CounterTemplateDriver(
      { startText: "1", endText: "2", step: 1, intervalMs: 10, repeat: false },
      () => undefined,
    );

    driver.play();
    expect(frame).not.toBeNull();
    driver.pause();

    expect(requestFrame).toHaveBeenCalledOnce();
    expect(cancelFrame).toHaveBeenCalledOnce();
  });
});
