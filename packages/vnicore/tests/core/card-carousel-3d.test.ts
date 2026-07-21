import { describe, expect, it } from "vitest";
import {
  createCardCarousel3DSampleBuffer,
  getCardCarousel3DSyncedDuration,
  prepareCardCarousel3D,
  sampleCardCarousel3D,
} from "../../src/core/card-carousel-3d";
import type {
  V5GAnimationConfig,
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

function cardCarousel(
  overrides: Partial<V5GAnimationConfig["params"]> = {},
): V5GAnimationConfig {
  const params = {
    phasePreviewMode: "full_demo",
    cardCount: 7,
    targetIndex: 2,
    rounds: 3,
    direction: 1,
    introDuration: 1.2,
    introSpeed: 0.22,
    revealDirection: 0,
    revealStagger: 0.08,
    revealOffsetX: 90,
    revealScaleFrom: 0.72,
    demoIdleDuration: 1.2,
    idleSpeed: 0.18,
    fastDuration: 1.1,
    fastSpeed: 2.8,
    accelRatio: 0.28,
    stopDuration: 1.6,
    holdDuration: 1,
    stopOvershoot: 0.18,
    finalPop: 0.12,
    finalGlow: 0.18,
    radius: 360,
    cardSpacing: 1,
    perspective: 0.72,
    slices: 12,
    visibleRange: 0.72,
    cardSize: 360,
    centerScale: 1.12,
    sideScale: 0.72,
    sideAlpha: 0.38,
    shadeStrength: 0.42,
    curve: 0.55,
    tilt: 8,
    sourceOpacity: 0,
    hideBack: true,
    keepOriginal: false,
    ...overrides,
  };
  return {
    id: "carousel",
    type: "card_carousel_3d",
    startTime: 0,
    duration:
      params.phasePreviewMode === "full_demo"
        ? 6.1
        : Number(
            {
              intro: params.introDuration,
              idle: params.demoIdleDuration,
              fast: params.fastDuration,
              stop: params.stopDuration,
              hold: params.holdDuration,
            }[String(params.phasePreviewMode)],
          ),
    enabled: true,
    seed: 1,
    params,
  };
}

const textureLibrary = [
  {
    width: 300,
    height: 200,
    frameX: 10,
    frameY: 20,
    frameWidth: 300,
    frameHeight: 200,
  },
  {
    width: 120,
    height: 360,
    frameX: 0,
    frameY: 0,
    frameWidth: 120,
    frameHeight: 360,
  },
  {
    width: 480,
    height: 160,
    frameX: 8,
    frameY: 6,
    frameWidth: 240,
    frameHeight: 80,
  },
] as const;

describe("card-carousel-3d", () => {
  it("precomputes the editor full-demo timeline and stable reveal ranks", () => {
    const prepared = prepareCardCarousel3D(cardCarousel());

    expect(prepared.totalDuration).toBeCloseTo(6.1, 10);
    expect(prepared.introRotation).toBeCloseTo(1.6587609211, 9);
    expect(prepared.idleRotation).toBeCloseTo(1.3571680264, 9);
    expect(prepared.fastRotation).toBeCloseTo(16.8170711384, 9);
    expect([...prepared.revealRanks]).toEqual([3, 5, 6, 4, 2, 0, 1]);
  });

  it("keeps standalone idle and fast phase origins independent of intro", () => {
    const idle = prepareCardCarousel3D(
      cardCarousel({ phasePreviewMode: "idle" }),
    );
    const fast = prepareCardCarousel3D(
      cardCarousel({ phasePreviewMode: "fast" }),
    );
    const idleOutput = createCardCarousel3DSampleBuffer(idle);
    const fastOutput = createCardCarousel3DSampleBuffer(fast);
    const common = {
      emitterX: 500,
      emitterY: 400,
      layerOpacity: 1,
      transform,
      blendMode: "normal" as const,
      textures: textureLibrary,
    };

    sampleCardCarousel3D(idle, { ...common, progress: 0 }, idleOutput);
    sampleCardCarousel3D(fast, { ...common, progress: 0 }, fastOutput);

    expect(idleOutput.rotation).toBe(0);
    expect(fastOutput.rotation).toBe(0);
  });

  it("precomputes all reveal modes and clamps a crowded reveal window", () => {
    expect([
      ...prepareCardCarousel3D(cardCarousel({ revealDirection: 1 }))
        .revealRanks,
    ]).toEqual([3, 1, 0, 2, 4, 6, 5]);
    expect(
      prepareCardCarousel3D(cardCarousel({ revealDirection: 2 })).revealRanks,
    ).toHaveLength(7);
    expect(
      prepareCardCarousel3D(
        cardCarousel({
          cardCount: 30,
          targetIndex: 29,
          introDuration: 0.1,
          revealStagger: 2,
        }),
      ).revealWindow,
    ).toBe(0.08);
  });

  it("honors reverse direction, hideBack, visibleRange, final pop, and final glow", () => {
    const reversed = prepareCardCarousel3D(
      cardCarousel({
        phasePreviewMode: "hold",
        direction: -1,
        rounds: 0,
        targetIndex: 6,
      }),
    );
    expect(reversed.stopFinalRotation).toBeLessThan(reversed.stopStartRotation);
    expect(
      Math.atan2(
        Math.sin(reversed.stopFinalRotation + 6 * reversed.angleStep),
        Math.cos(reversed.stopFinalRotation + 6 * reversed.angleStep),
      ),
    ).toBeCloseTo(0, 10);

    const restricted = prepareCardCarousel3D(
      cardCarousel({
        phasePreviewMode: "hold",
        visibleRange: 0.1,
        hideBack: true,
      }),
    );
    const unrestricted = prepareCardCarousel3D(
      cardCarousel({
        phasePreviewMode: "hold",
        visibleRange: 1,
        hideBack: false,
      }),
    );
    const restrictedOutput = createCardCarousel3DSampleBuffer(restricted);
    const unrestrictedOutput = createCardCarousel3DSampleBuffer(unrestricted);
    const common = {
      progress: 1,
      emitterX: 0,
      emitterY: 0,
      layerOpacity: 1,
      transform,
      blendMode: "normal" as const,
      textures: textureLibrary,
    };
    sampleCardCarousel3D(restricted, common, restrictedOutput);
    sampleCardCarousel3D(unrestricted, common, unrestrictedOutput);
    expect(restrictedOutput.visibleCardCount).toBeLessThan(
      unrestrictedOutput.visibleCardCount,
    );

    const plain = prepareCardCarousel3D(
      cardCarousel({
        phasePreviewMode: "stop",
        finalPop: 0,
        finalGlow: 0,
      }),
    );
    const emphasized = prepareCardCarousel3D(
      cardCarousel({
        phasePreviewMode: "stop",
        finalPop: 0.5,
        finalGlow: 0.5,
      }),
    );
    const plainOutput = createCardCarousel3DSampleBuffer(plain);
    const emphasizedOutput = createCardCarousel3DSampleBuffer(emphasized);
    sampleCardCarousel3D(plain, { ...common, progress: 0.89 }, plainOutput);
    sampleCardCarousel3D(
      emphasized,
      { ...common, progress: 0.89 },
      emphasizedOutput,
    );
    expect(
      Math.abs(emphasizedOutput.cards[2].slices[0].scaleY),
    ).toBeGreaterThan(Math.abs(plainOutput.cards[2].slices[0].scaleY));
    expect(emphasizedOutput.cards[2].slices[0].tint).toBeGreaterThanOrEqual(
      plainOutput.cards[2].slices[0].tint,
    );
  });

  it("aligns the selected target at stop/hold and maps sequence textures modulo", () => {
    const prepared = prepareCardCarousel3D(
      cardCarousel({ phasePreviewMode: "hold" }),
    );
    const output = createCardCarousel3DSampleBuffer(prepared);

    sampleCardCarousel3D(
      prepared,
      {
        progress: 1,
        emitterX: 500,
        emitterY: 400,
        layerOpacity: 0.8,
        transform,
        blendMode: "normal",
        textures: textureLibrary,
      },
      output,
    );

    const target = output.cards[2];
    expect(
      Math.atan2(
        Math.sin(prepared.stopFinalRotation + 2 * prepared.angleStep),
        Math.cos(prepared.stopFinalRotation + 2 * prepared.angleStep),
      ),
    ).toBeCloseTo(0, 10);
    expect(target.visible).toBe(true);
    expect(target.textureIndex).toBe(2);
    expect(target.x).toBeCloseTo(500, 9);
    expect(target.y).toBeCloseTo(400, 9);
    expect(target.alpha).toBeCloseTo(0.8, 9);
  });

  it("samples atlas slice frames, anchor offsets, negative scale, tint, and stable z order", () => {
    const prepared = prepareCardCarousel3D(
      cardCarousel({
        phasePreviewMode: "hold",
        hideBack: false,
        visibleRange: 1,
        slices: 3,
      }),
    );
    const output = createCardCarousel3DSampleBuffer(prepared);
    const anchoredTransform = {
      ...transform,
      scaleX: -1,
      scaleY: 0.5,
      rotation: 15,
      anchorX: 0.25,
      anchorY: 0.75,
    };

    sampleCardCarousel3D(
      prepared,
      {
        progress: 1,
        emitterX: 0,
        emitterY: 0,
        layerOpacity: 1,
        transform: anchoredTransform,
        blendMode: "screen",
        textures: textureLibrary,
      },
      output,
    );

    const first = output.cards[0].slices[0];
    expect(first.frameX).toBeCloseTo(10, 9);
    expect(first.frameY).toBe(20);
    expect(first.frameWidth).toBeCloseTo(100, 9);
    expect(first.frameHeight).toBe(200);
    expect(first.scaleX).toBe(0.01);
    expect(first.scaleY).toBeGreaterThan(0);
    expect(first.tint).toBeGreaterThanOrEqual(0x141414);
    const order = [...output.drawOrder.slice(0, output.visibleCardCount)];
    expect(new Set(order).size).toBe(order.length);
    for (let index = 1; index < order.length; index += 1) {
      expect(output.cards[order[index - 1]].z).toBeLessThanOrEqual(
        output.cards[order[index]].z,
      );
    }
  });

  it("reuses the complete card/slice output graph for 300 samples", () => {
    const prepared = prepareCardCarousel3D(cardCarousel());
    const output = createCardCarousel3DSampleBuffer(prepared);
    const cards = output.cards;
    const slices = output.cards.map((card) => card.slices);

    for (let frame = 0; frame < 300; frame += 1) {
      sampleCardCarousel3D(
        prepared,
        {
          progress: frame / 299,
          emitterX: 0,
          emitterY: 0,
          layerOpacity: 1,
          transform,
          blendMode: "normal",
          textures: textureLibrary,
        },
        output,
      );
    }

    expect(output.cards).toBe(cards);
    output.cards.forEach((card, index) => {
      expect(card.slices).toBe(slices[index]);
    });
  });

  it("snaps all phase duration modes to the editor 0.05-second timeline", () => {
    expect(getCardCarousel3DSyncedDuration(cardCarousel())).toBeCloseTo(6.1);
    expect(
      getCardCarousel3DSyncedDuration(
        cardCarousel({ phasePreviewMode: "intro", introDuration: 1.23 }),
      ),
    ).toBe(1.25);
    expect(
      getCardCarousel3DSyncedDuration(
        cardCarousel({ phasePreviewMode: "hold", holdDuration: 0 }),
      ),
    ).toBe(0.05);
    expect(
      getCardCarousel3DSyncedDuration(
        cardCarousel({ phasePreviewMode: "idle" }),
      ),
    ).toBe(1.2);
    expect(
      getCardCarousel3DSyncedDuration(
        cardCarousel({ phasePreviewMode: "fast" }),
      ),
    ).toBe(1.1);
    expect(
      getCardCarousel3DSyncedDuration(
        cardCarousel({ phasePreviewMode: "stop" }),
      ),
    ).toBe(1.6);
  });
});
