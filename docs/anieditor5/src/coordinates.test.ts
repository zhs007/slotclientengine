import { describe, expect, it } from "vitest";
import {
  sampleLayerAnimationsAtTime,
  shouldHideLayerOutsideActiveAnimation,
} from "./animation_presets";
import { editorToPixi, pixiToEditor } from "./coordinates";
import type { V5GAnimationConfig } from "./types";

describe("V5-G center coordinate conversion", () => {
  it("maps editor center to Pixi stage center", () => {
    expect(editorToPixi(0, 0, 800, 600)).toEqual({ x: 400, y: 300 });
  });

  it("maps editor top-right to Pixi top-right", () => {
    expect(editorToPixi(400, 300, 800, 600)).toEqual({ x: 800, y: 0 });
  });

  it("round trips between editor and Pixi coordinates", () => {
    const pixi = editorToPixi(-120, 88, 800, 600);
    expect(pixiToEditor(pixi.x, pixi.y, 800, 600)).toEqual({ x: -120, y: 88 });
  });
});

describe("VNI animation transform sampling", () => {
  const base = {
    transform: {
      x: 0,
      y: 500,
      scaleX: 1,
      scaleY: 1,
      rotation: 0,
      anchorX: 0.5,
      anchorY: 0.5,
    },
    opacity: 1,
  };

  it("keeps ended slide displacement as the next animation starting position", () => {
    const animations: V5GAnimationConfig[] = [
      {
        id: "slide_to_origin",
        type: "slide_in",
        name: "Slide to origin",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          fromX: 0,
          fromY: 0,
          toX: 0,
          toY: -500,
          fadeIn: false,
          easing: "linear",
        },
      },
      {
        id: "continue_from_origin",
        type: "move",
        name: "Continue from origin",
        startTime: 1,
        duration: 1,
        enabled: true,
        seed: 2,
        params: {
          fromX: 0,
          fromY: 0,
          toX: 100,
          toY: 0,
          baseX: 0,
          baseY: 0,
          easing: "linear",
        },
      },
    ];

    expect(
      sampleLayerAnimationsAtTime(base, animations, 1.25).transform,
    ).toMatchObject({
      x: 25,
      y: 0,
    });
    expect(
      sampleLayerAnimationsAtTime(base, animations, 2).transform,
    ).toMatchObject({
      x: 100,
      y: 0,
    });
  });

  it("keeps ended multi_move final point after its time range", () => {
    const animations: V5GAnimationConfig[] = [
      {
        id: "multi_move_path",
        type: "multi_move",
        name: "Multi move path",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
            { x: 0, y: -500, time: 1, easing: "linear" },
          ]),
          easing: "linear",
        },
      },
    ];

    expect(
      sampleLayerAnimationsAtTime(base, animations, 2).transform,
    ).toMatchObject({
      x: 0,
      y: 0,
    });
  });
});

describe("VNI animation visibility sampling", () => {
  const animations: V5GAnimationConfig[] = [
    {
      id: "slide_to_origin",
      type: "slide_in",
      name: "Slide to origin",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 1,
      params: {
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: -500,
        fadeIn: false,
        easing: "linear",
      },
    },
    {
      id: "continue_from_origin",
      type: "move",
      name: "Continue from origin",
      startTime: 2,
      duration: 1,
      enabled: true,
      seed: 2,
      params: {
        fromX: 0,
        fromY: 0,
        toX: 100,
        toY: 0,
        baseX: 0,
        baseY: 0,
        easing: "linear",
      },
    },
  ];

  it("hides the layer in empty frames and after the last animation", () => {
    expect(shouldHideLayerOutsideActiveAnimation(animations, 1.5)).toBe(true);
    expect(shouldHideLayerOutsideActiveAnimation(animations, 3.01)).toBe(true);
  });

  it("keeps the layer visible while an enabled animation covers the time", () => {
    expect(shouldHideLayerOutsideActiveAnimation(animations, 0.5)).toBe(false);
    expect(shouldHideLayerOutsideActiveAnimation(animations, 2.5)).toBe(false);
  });

  it("does not hide static layers with no enabled animations", () => {
    expect(shouldHideLayerOutsideActiveAnimation([], 2)).toBe(false);
    expect(
      shouldHideLayerOutsideActiveAnimation(
        animations.map((animation) => ({ ...animation, enabled: false })),
        2,
      ),
    ).toBe(false);
  });
});
