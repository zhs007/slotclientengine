import { describe, expect, it } from "vitest";
import {
  createCardCarousel3DSampleBuffer,
  prepareCardCarousel3D,
  sampleCardCarousel3D,
} from "../../src/core/card-carousel-3d";
import { sampleLayerAtTime } from "../../src/core/project-sampler";
import { getSequenceFrameAssetId } from "../../src/core/sequence-layer";
import type {
  V5GAnimationConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../../src/core/types";

const transform: V5GTransformConfig = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

function layer(
  animations: V5GAnimationConfig[] = [],
  overrides: Partial<V5GLayerConfig> = {},
): V5GLayerConfig {
  return {
    id: "layer",
    name: "Layer",
    type: "image",
    assetId: "a",
    parentId: null,
    groupId: "group_default",
    visible: true,
    locked: false,
    transform,
    opacity: 1,
    blendMode: "normal",
    animations,
    keyframes: [],
    ...overrides,
  };
}

function animation(
  type: V5GAnimationConfig["type"],
  params: V5GAnimationConfig["params"],
): V5GAnimationConfig {
  return {
    id: type,
    type,
    startTime: 0,
    duration: 1,
    enabled: true,
    seed: 7,
    params,
  };
}

function cardAnimation(): V5GAnimationConfig {
  return animation("card_carousel_3d", {
    phasePreviewMode: "hold",
    cardCount: 3,
    targetIndex: 1,
    rounds: 1,
    direction: 1,
    introDuration: 0.2,
    introSpeed: 0.2,
    revealDirection: 0,
    revealStagger: 0.02,
    revealOffsetX: 30,
    revealScaleFrom: 0.7,
    demoIdleDuration: 0.2,
    idleSpeed: 0.2,
    fastDuration: 0.2,
    fastSpeed: 2,
    accelRatio: 0.2,
    stopDuration: 0.2,
    holdDuration: 0.2,
    stopOvershoot: 0.1,
    finalPop: 0.1,
    finalGlow: 0.1,
    radius: 100,
    cardSpacing: 1,
    perspective: 0.7,
    slices: 4,
    visibleRange: 1,
    cardSize: 100,
    centerScale: 1,
    sideScale: 0.7,
    sideAlpha: 0.4,
    shadeStrength: 0.4,
    curve: 0.5,
    tilt: 6,
    sourceOpacity: 0,
    hideBack: false,
    keepOriginal: false,
  });
}

describe("VNI 0.095 synced core", () => {
  it("samples sequence frames with stable closed-cycle semantics", () => {
    const sequence = layer([], {
      type: "sequence",
      assetId: null,
      sequence: {
        frameAssetIds: ["a", "b", "c"],
        cycleDuration: 0.9,
        loop: true,
      },
    });

    expect(getSequenceFrameAssetId(sequence, 0)).toBe("a");
    expect(getSequenceFrameAssetId(sequence, 0.31)).toBe("b");
    expect(getSequenceFrameAssetId(sequence, 0.61)).toBe("c");
    expect(getSequenceFrameAssetId(sequence, 0.9)).toBe("a");
  });

  it("keeps multi_move final transform and separates pressure visualRotation", () => {
    const moving = layer([
      animation("multi_move", {
        pointsJson: JSON.stringify([
          { x: 0, y: 0, time: 0, easing: "linear" },
          { x: 80, y: -20, time: 1, easing: "easeOutQuad" },
        ]),
      }),
    ]);
    expect(sampleLayerAtTime(moving, 1).transform).toMatchObject({
      x: 80,
      y: -20,
    });

    const pressure = layer([
      animation("rotate", {
        turns: 1,
        direction: 1,
        accelRatio: 0.2,
        decelRatio: 0.2,
        pressure: 0.8,
        pressureStretch: 0.4,
      }),
    ]);
    const sampled = sampleLayerAtTime(pressure, 0.5);
    expect(sampled.visualRotation).not.toBe(0);
    expect(sampled.transform.scaleX).not.toBe(1);
  });

  it("samples basic tracks before preset animation composition", () => {
    const sampled = sampleLayerAtTime(
      layer([], {
        basicAnimation: {
          opacity: {
            enabled: true,
            points: [
              { id: "o0", time: 0, value: 0.2, easing: "linear" },
              { id: "o1", time: 1, value: 0.8, easing: "linear" },
            ],
          },
          positionX: {
            enabled: true,
            points: [
              { id: "x0", time: 0, value: 0, easing: "linear" },
              { id: "x1", time: 1, value: 100, easing: "linear" },
            ],
          },
          positionY: { enabled: false, points: [] },
          scaleX: { enabled: false, points: [] },
          scaleY: { enabled: false, points: [] },
          rotation: { enabled: false, points: [] },
        },
      }),
      0.5,
    );

    expect(sampled.transform.x).toBe(50);
    expect(sampled.opacity).toBe(0.5);
  });

  it("reuses the preallocated card and slice sample buffers deterministically", () => {
    const prepared = prepareCardCarousel3D(cardAnimation());
    const output = createCardCarousel3DSampleBuffer(prepared);
    const firstCard = output.cards[0];
    const firstSlice = firstCard.slices[0];
    const input = {
      progress: 1,
      emitterX: 0,
      emitterY: 0,
      layerOpacity: 1,
      transform,
      blendMode: "normal" as const,
      textures: [
        {
          width: 100,
          height: 140,
          frameX: 0,
          frameY: 0,
          frameWidth: 100,
          frameHeight: 140,
        },
      ],
    };

    sampleCardCarousel3D(prepared, input, output);
    const snapshot = structuredClone(output.cards);
    sampleCardCarousel3D(prepared, input, output);

    expect(output.cards[0]).toBe(firstCard);
    expect(output.cards[0].slices[0]).toBe(firstSlice);
    expect(output.cards).toEqual(snapshot);
    expect(output.visibleCardCount).toBeGreaterThan(0);
  });
});
