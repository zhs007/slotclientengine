import { describe, expect, it } from "vitest";
import {
  SymbolStateError,
  SymbolStateSequenceController,
  createDefaultSymbolStatePreset,
} from "../../src/symbol/index.js";

const preset = createDefaultSymbolStatePreset();

describe("SymbolStateSequenceController", () => {
  it("advances stable states by holdSeconds and once states by completion", () => {
    const controller = new SymbolStateSequenceController({
      statePreset: preset,
      steps: [{ state: "normal", holdSeconds: 0.5 }, { state: "appear" }],
      autoplay: true,
    });

    expect(controller.update({ deltaSeconds: 0.49 })).toMatchObject({
      shouldRequestState: false,
    });
    expect(controller.update({ deltaSeconds: 0.01 })).toMatchObject({
      shouldRequestState: true,
      state: "appear",
      currentIndex: 1,
    });
    expect(
      controller.update({ deltaSeconds: 10, onceCompleted: false }),
    ).toMatchObject({
      shouldRequestState: false,
      state: "appear",
    });
    expect(
      controller.update({ deltaSeconds: 0, onceCompleted: true }),
    ).toMatchObject({
      shouldRequestState: true,
      state: "normal",
      currentIndex: 0,
    });
  });

  it("supports add, remove and move while keeping index valid", () => {
    const controller = new SymbolStateSequenceController({
      statePreset: preset,
      steps: [{ state: "normal" }, { state: "win" }],
      autoplay: false,
    });

    controller.addStep({ state: "disabled", holdSeconds: 0.2 }, 1);
    expect(controller.getSteps().map((step) => step.state)).toEqual([
      "normal",
      "disabled",
      "win",
    ]);

    controller.moveStep(2, 0);
    expect(controller.getSteps().map((step) => step.state)).toEqual([
      "win",
      "normal",
      "disabled",
    ]);

    controller.removeStep(1);
    expect(controller.getSteps().map((step) => step.state)).toEqual([
      "win",
      "disabled",
    ]);
    expect(
      controller.update({ deltaSeconds: 10, onceCompleted: true })
        .shouldRequestState,
    ).toBe(false);
  });

  it("can play, pause, reset and request next manually", () => {
    const controller = new SymbolStateSequenceController({
      statePreset: preset,
      steps: [{ state: "normal" }, { state: "win" }],
      autoplay: false,
    });

    expect(controller.isPlaying()).toBe(false);
    controller.play();
    expect(controller.isPlaying()).toBe(true);
    expect(controller.next().state).toBe("win");
    controller.reset();
    expect(controller.getCurrentIndex()).toBe(0);
    controller.pause();
    expect(controller.update({ deltaSeconds: 100 }).shouldRequestState).toBe(
      false,
    );
  });

  it("rejects invalid sequence data", () => {
    expect(
      () =>
        new SymbolStateSequenceController({ statePreset: preset, steps: [] }),
    ).toThrow(SymbolStateError);
    expect(
      () =>
        new SymbolStateSequenceController({
          statePreset: preset,
          steps: [{ state: "missing" }],
        }),
    ).toThrow(SymbolStateError);
    const controller = new SymbolStateSequenceController({
      statePreset: preset,
      steps: [{ state: "normal" }],
    });
    expect(() => controller.removeStep(0)).toThrow(SymbolStateError);
    expect(() => controller.addStep({ state: "normal" }, 0.5)).toThrow(
      SymbolStateError,
    );
    expect(() =>
      controller.updateStep(0, { state: "normal", holdSeconds: Number.NaN }),
    ).toThrow(SymbolStateError);
  });
});
