import { describe, expect, it } from "vitest";
import { getGame003SkinConfig } from "../src/skin-config.js";
import { getGame003WinSymbolLoopConfig } from "../src/win-symbol-loop-config.js";

describe("game003 win symbol loop config", () => {
  it("parses the generated app extension", () => {
    expect(getGame003SkinConfig("1").winSymbolLoop).toEqual({
      cyclePauseSeconds: 1,
      resultAmount: {
        yOffsetRatioFromCellCenter: 0.22,
        fontSize: 38,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 5,
      },
    });
  });

  it("fails fast for missing, unknown, or malformed app extension data", () => {
    const valid = createRawExtensions();

    expect(() => getGame003WinSymbolLoopConfig({})).toThrow(/required/);
    expect(() => getGame003WinSymbolLoopConfig([])).toThrow(/object/);
    expect(() =>
      getGame003WinSymbolLoopConfig({
        game003WinSymbolLoop: {
          ...valid.game003WinSymbolLoop,
          extra: true,
        },
      }),
    ).toThrow(/extra.*not supported/);
    expect(() =>
      getGame003WinSymbolLoopConfig({
        game003WinSymbolLoop: {
          ...valid.game003WinSymbolLoop,
          cyclePauseSeconds: 0,
        },
      }),
    ).toThrow(/cyclePauseSeconds.*positive/);
    expect(() =>
      getGame003WinSymbolLoopConfig({
        game003WinSymbolLoop: {
          ...valid.game003WinSymbolLoop,
          resultAmount: {
            ...valid.game003WinSymbolLoop.resultAmount,
            yOffsetRatioFromCellCenter: 0.6,
          },
        },
      }),
    ).toThrow(/yOffsetRatioFromCellCenter.*between/);
    expect(() =>
      getGame003WinSymbolLoopConfig({
        game003WinSymbolLoop: {
          ...valid.game003WinSymbolLoop,
          resultAmount: {
            ...valid.game003WinSymbolLoop.resultAmount,
            fontSize: -1,
          },
        },
      }),
    ).toThrow(/fontSize.*positive/);
    expect(() =>
      getGame003WinSymbolLoopConfig({
        game003WinSymbolLoop: {
          ...valid.game003WinSymbolLoop,
          resultAmount: {
            ...valid.game003WinSymbolLoop.resultAmount,
            fill: " ",
          },
        },
      }),
    ).toThrow(/fill.*non-empty/);
  });
});

function createRawExtensions() {
  return JSON.parse(
    JSON.stringify({
      game003WinSymbolLoop: getGame003SkinConfig("1").winSymbolLoop,
    }),
  ) as {
    readonly game003WinSymbolLoop: ReturnType<
      typeof getGame003WinSymbolLoopConfig
    >;
  };
}
