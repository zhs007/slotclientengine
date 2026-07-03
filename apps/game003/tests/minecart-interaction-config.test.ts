import { describe, expect, it } from "vitest";
import {
  getGame003MinecartInteractionConfig,
  getGame003MinecartTotalDurationSeconds,
} from "../src/minecart-interaction-config.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 minecart interaction config", () => {
  it("parses the generated app extension and enforces the timing budget", () => {
    const config = getGame003SkinConfig("1").minecartInteraction;

    expect(config).toMatchObject({
      loadingResourceId: "game003-minecart",
      imageSize: { width: 369, height: 252 },
      timing: {
        cartExitDurationSeconds: 0.18,
        cartRushDurationSeconds: 0.26,
        symbolFlyDurationSeconds: 0.43,
        symbolHoldDurationSeconds: 0.12,
        maxTotalBeforeReelStopSeconds: 1.3,
      },
      motion: {
        overshootPixels: 34,
        brakeTiltDegrees: 14,
        reboundTiltDegrees: -8,
      },
      payload: {
        symbolScale: 1,
        fadeStartAlpha: 1,
        fadeEndAlpha: 0,
      },
    });
    expect(config.layout.landscape.exitSide).toBe("right");
    expect(config.layout.portrait.exitSide).toBe("right");
    expect(config.layout.landscape.payloadAnchorInImage).toEqual({
      x: 184.5,
      y: 126,
    });
    expect(config.timing.cartExitDurationSeconds).toBeLessThanOrEqual(0.25);
    expect(getGame003MinecartTotalDurationSeconds(config)).toBeCloseTo(1.29);
  });

  it("fails fast for missing, malformed, or over-budget app extension data", () => {
    const valid = createRawExtensions();

    expect(() => getGame003MinecartInteractionConfig({})).toThrow(/required/);
    expect(() => getGame003MinecartInteractionConfig([])).toThrow(/object/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          loadingResourceId: "other",
        },
      }),
    ).toThrow(/loadingResourceId/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          timing: {
            ...valid.game003MinecartInteraction.timing,
            maxTotalBeforeReelStopSeconds: 1.4,
          },
        },
      }),
    ).toThrow(/<= 1\.3/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          timing: {
            ...valid.game003MinecartInteraction.timing,
            cartExitDurationSeconds: 0.3,
          },
        },
      }),
    ).toThrow(/cartExitDurationSeconds.*<= 0\.25/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          timing: {
            ...valid.game003MinecartInteraction.timing,
            cartRushDurationSeconds: 0.7,
          },
        },
      }),
    ).toThrow(/exceeds/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          payload: {
            ...valid.game003MinecartInteraction.payload,
            symbolScale: 0,
          },
        },
      }),
    ).toThrow(/symbolScale.*positive/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          payload: {
            ...valid.game003MinecartInteraction.payload,
            fadeEndAlpha: 1.1,
          },
        },
      }),
    ).toThrow(/fadeEndAlpha.*between 0 and 1/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          layout: {
            ...valid.game003MinecartInteraction.layout,
            landscape: {
              ...valid.game003MinecartInteraction.layout.landscape,
              exitSide: "left",
            },
          },
        },
      }),
    ).toThrow(/exitSide.*right/);
    expect(() =>
      getGame003MinecartInteractionConfig({
        game003MinecartInteraction: {
          ...valid.game003MinecartInteraction,
          layout: {
            ...valid.game003MinecartInteraction.layout,
            landscape: {
              ...valid.game003MinecartInteraction.layout.landscape,
              cartPivotInImage: { x: 370, y: 220 },
            },
          },
        },
      }),
    ).toThrow(/cartPivotInImage/);
  });
});

function createRawExtensions() {
  return JSON.parse(
    JSON.stringify({
      game003MinecartInteraction: getGame003SkinConfig("1").minecartInteraction,
    }),
  ) as {
    readonly game003MinecartInteraction: ReturnType<
      typeof getGame003MinecartInteractionConfig
    >;
  };
}
