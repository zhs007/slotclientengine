import { describe, expect, it } from "vitest";
import { getGame003CoinOverlayConfig } from "../src/coin-overlay-config.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 coin overlay config", () => {
  it("parses the generated app extension", () => {
    expect(getGame003SkinConfig("1").coinOverlay).toEqual({
      componentName: "bg-gencoins",
      coinSymbol: "CO",
      text: {
        yOffsetRatioFromCellCenter: 0.08,
        fontSize: 32,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 4,
      },
    });
  });

  it("fails fast for missing, unknown, or malformed app extension data", () => {
    const valid = createRawExtensions();

    expect(() => getGame003CoinOverlayConfig({})).toThrow(/required/);
    expect(() => getGame003CoinOverlayConfig([])).toThrow(/object/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          extra: true,
        },
      }),
    ).toThrow(/extra.*not supported/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          componentName: "other",
        },
      }),
    ).toThrow(/componentName/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          coinSymbol: "WL",
        },
      }),
    ).toThrow(/coinSymbol/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          text: {
            ...valid.game003CoinOverlay.text,
            extra: true,
          },
        },
      }),
    ).toThrow(/text\.extra.*not supported/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          text: {
            ...valid.game003CoinOverlay.text,
            fontSize: 0,
          },
        },
      }),
    ).toThrow(/fontSize.*positive/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          text: {
            ...valid.game003CoinOverlay.text,
            strokeWidth: -1,
          },
        },
      }),
    ).toThrow(/strokeWidth.*positive/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          text: {
            ...valid.game003CoinOverlay.text,
            fill: "",
          },
        },
      }),
    ).toThrow(/fill.*non-empty/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          text: {
            ...valid.game003CoinOverlay.text,
            stroke: " ",
          },
        },
      }),
    ).toThrow(/stroke.*non-empty/);
    expect(() =>
      getGame003CoinOverlayConfig({
        game003CoinOverlay: {
          ...valid.game003CoinOverlay,
          text: {
            ...valid.game003CoinOverlay.text,
            yOffsetRatioFromCellCenter: 0.6,
          },
        },
      }),
    ).toThrow(/yOffsetRatioFromCellCenter.*between/);

    const missingTextField = createRawExtensions();
    delete (missingTextField.game003CoinOverlay.text as any).fill;
    expect(() => getGame003CoinOverlayConfig(missingTextField)).toThrow(
      /text\.fill.*required/,
    );
  });
});

function createRawExtensions() {
  return JSON.parse(
    JSON.stringify({
      game003CoinOverlay: getGame003SkinConfig("1").coinOverlay,
    }),
  ) as {
    readonly game003CoinOverlay: ReturnType<typeof getGame003CoinOverlayConfig>;
  };
}
