import { describe, expect, it } from "vitest";
import basicMessage from "./fixtures/gamemoduleinfo-basic.json";
import gameConfigFixture from "./fixtures/gameconfig-reels01.json";
import { createGameConfig, createGameLogic, LogicParseError } from "../src";

const cloneFixture = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

describe("createGameConfig", () => {
  it("parses the generated gameconfig fixture", () => {
    const gameConfig = createGameConfig(gameConfigFixture);
    const reels = gameConfig.getReels("reels01");

    expect(gameConfig.getReelNames()).toEqual(["reels01"]);
    expect(gameConfig.getPaytableEntry(1)).toMatchObject({
      code: 1,
      symbol: "S00",
    });
    expect(gameConfig.getSymbolCode("S00")).toBe(1);
    expect(gameConfig.getPaytableEntry(999)).toBeUndefined();
    expect(gameConfig.getSymbolCode("NOPE")).toBeUndefined();
    expect(reels.getName()).toBe("reels01");
    expect(reels.getReelCount()).toBe(5);
    expect(reels.get(0, 1)).toBe(2);
  });

  it("does not let source or returned data mutate internal state", () => {
    const rawConfig = cloneFixture(gameConfigFixture);
    const gameConfig = createGameConfig(rawConfig);

    rawConfig.paytable["1"].symbol = "CHANGED";
    rawConfig.reels.reels01[0][1] = 999;
    tryMutate(
      () =>
        (((gameConfig.getRawConfig() as any).reels.reels01[0] as number[])[1] =
          999),
    );
    tryMutate(
      () => ((gameConfig.getPaytableEntry(1)?.pays as number[])[0] = 999),
    );

    expect(gameConfig.getPaytableEntry(1)?.symbol).toBe("S00");
    expect(gameConfig.getReels("reels01").get(0, 1)).toBe(2);
    expect(gameConfig.getPaytableEntry(1)?.pays[0]).toBe(0);
  });

  it("throws RangeError for missing reels names", () => {
    const gameConfig = createGameConfig(gameConfigFixture);

    expect(() => gameConfig.getReels("missing")).toThrow(RangeError);
  });

  it.each([
    [
      "paytable key mismatch",
      (config: any) => {
        config.paytable["1"].code = 0;
      },
      "must match paytable key",
    ],
    [
      "duplicate paytable symbol",
      (config: any) => {
        config.paytable["1"].symbol = "BN";
      },
      "duplicate symbol",
    ],
    [
      "missing symbolCodes entry",
      (config: any) => {
        delete config.symbolCodes.S00;
      },
      "must contain symbol",
    ],
    [
      "unknown symbolCodes code",
      (config: any) => {
        config.symbolCodes.EXTRA = 999;
      },
      "unknown paytable code",
    ],
    [
      "empty reels set",
      (config: any) => {
        config.reels.reels01 = [];
      },
      "at least one reel",
    ],
    [
      "empty reel column",
      (config: any) => {
        config.reels.reels01[0] = [];
      },
      "at least one symbol",
    ],
    [
      "unknown reel symbol code",
      (config: any) => {
        config.reels.reels01[0][0] = 999;
      },
      "unknown paytable code",
    ],
  ])("rejects invalid game config: %s", (_label, mutate, message) => {
    const config = cloneFixture(gameConfigFixture);
    mutate(config);

    expect(() => createGameConfig(config)).toThrow(LogicParseError);
    expect(() => createGameConfig(config)).toThrow(message);
  });
});

describe("LogicGameConfig stop and start coordinate helpers", () => {
  it("finds stop y coordinates for the real GMI scene and generated reels", () => {
    const logic = createGameLogic(basicMessage);
    const scene = logic.getStep(0).getScene(0);
    const gameConfig = createGameConfig(gameConfigFixture);
    const reels = gameConfig.getReels("reels01");

    expect(reels.findStopYCandidates(2, scene[2])).toEqual([4, 34]);

    const stopYs = gameConfig.getStopYCoordinates({
      reelsName: "reels01",
      sceneName: "step0.scene0",
      scene,
    });

    expect(stopYs).toEqual([1, 1, 4, 0, 27]);
    for (const [x, column] of scene.entries()) {
      for (const [visibleY, symbol] of column.entries()) {
        expect(reels.get(x, stopYs[x] + visibleY)).toBe(symbol);
      }
    }
  });

  it("fails for mismatched scene width, empty columns, and unmatched symbols", () => {
    const logic = createGameLogic(basicMessage);
    const scene = cloneFixture(logic.getStep(0).getScene(0));
    const gameConfig = createGameConfig(gameConfigFixture);

    expect(() =>
      gameConfig.getStopYCoordinates({
        reelsName: "reels01",
        sceneName: "too-narrow",
        scene: scene.slice(0, 4),
      }),
    ).toThrow(LogicParseError);

    const emptyColumnScene = cloneFixture(scene);
    emptyColumnScene[0] = [];
    expect(() =>
      gameConfig.getStopYCoordinates({
        reelsName: "reels01",
        sceneName: "empty-column",
        scene: emptyColumnScene,
      }),
    ).toThrow(LogicParseError);

    const unmatchedScene = cloneFixture(scene);
    unmatchedScene[0][0] = 999;
    expect(() =>
      gameConfig.getStopYCoordinates({
        reelsName: "reels01",
        sceneName: "unmatched",
        scene: unmatchedScene,
      }),
    ).toThrow(LogicParseError);
  });

  it("uses the first stop y candidate when a scene column has multiple matches", () => {
    const gameConfig = createGameConfig({
      paytable: {
        "1": { code: 1, symbol: "A", pays: [0] },
        "2": { code: 2, symbol: "B", pays: [0] },
      },
      symbolCodes: { A: 1, B: 2 },
      reels: {
        repeat: [[1, 2, 1, 2]],
      },
    });

    expect(
      gameConfig.getStopYCoordinates({
        reelsName: "repeat",
        sceneName: "repeat-scene",
        scene: [[1, 2]],
      }),
    ).toEqual([0]);
  });

  it("calculates spin start y coordinates for every reel", () => {
    const gameConfig = createGameConfig(gameConfigFixture);

    expect(
      gameConfig.getSpinStartYCoordinates({
        reelsName: "reels01",
        finalYs: [1, 1, 4, 0, 27],
        speedSymbolsPerSecond: 8,
        durationMs: 250,
      }),
    ).toEqual([43, 43, 2, 0, 25]);

    expect(() =>
      gameConfig.getSpinStartYCoordinates({
        reelsName: "reels01",
        finalYs: [1],
        speedSymbolsPerSecond: 8,
        durationMs: 250,
      }),
    ).toThrow(LogicParseError);
  });
});

function tryMutate(mutator: () => void): void {
  try {
    mutator();
  } catch (error) {
    expect(error).toBeInstanceOf(TypeError);
  }
}
