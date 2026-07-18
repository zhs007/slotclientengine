import { parseSymbolPackageGameConfig } from "@slotclientengine/rendercore/symbol";
import { describe, expect, it, vi } from "vitest";
import {
  createWebCryptoRandomUint32Source,
  inspectReelSets,
  requireCompatibleReelSets,
  sampleRandomReelScene,
  sampleUnbiasedInteger,
  type RandomUint32Source,
} from "../src/preview/random-reel-scene.js";

function gameConfig(reels: Readonly<Record<string, readonly number[][]>>) {
  return parseSymbolPackageGameConfig({
    paytable: {
      "0": { code: 0, symbol: "A", pays: [1] },
      "1": { code: 1, symbol: "B", pays: [1] },
      "2": { code: 2, symbol: "AUX", pays: [1] },
    },
    symbolCodes: { A: 0, B: 1, AUX: 2 },
    reels,
  }).gameConfig;
}

function sequenceSource(...values: number[]): RandomUint32Source {
  let index = 0;
  return { nextUint32: () => values[index++]! };
}

describe("random reel scene", () => {
  it("samples each column independently and wraps a continuous public reel window", () => {
    const config = gameConfig({
      main: [
        [0, 1, 0],
        [1, 0],
      ],
    });
    const scene = sampleRandomReelScene({
      gameConfig: config,
      displaySymbols: ["A", "B"],
      reelSetName: "main",
      columns: 2,
      rows: 4,
      randomSource: sequenceSource(2, 1),
    });
    expect(scene.stopYs).toEqual([2, 1]);
    expect(scene.codes).toEqual([
      [0, 0, 1, 0],
      [0, 1, 0, 1],
    ]);
    expect(scene.symbols).toEqual([
      ["A", "A", "B", "A"],
      ["A", "B", "A", "B"],
    ]);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.codes[0])).toBe(true);
    expect(() => (scene.stopYs as number[]).push(1)).toThrow();
  });

  it("covers stop zero and length minus one on different reel lengths", () => {
    const config = gameConfig({
      main: [
        [0, 1],
        [0, 1, 0, 1, 0],
      ],
    });
    const scene = sampleRandomReelScene({
      gameConfig: config,
      displaySymbols: ["A", "B"],
      reelSetName: "main",
      columns: 2,
      rows: 1,
      randomSource: sequenceSource(0, 4),
    });
    expect(scene.stopYs).toEqual([0, 4]);
  });

  it("rejects modulo-biased uint32 values before accepting a value", () => {
    const source = sequenceSource(0xffff_ffff, 7);
    expect(sampleUnbiasedInteger(10, source)).toBe(7);
  });

  it.each([[-1], [0x1_0000_0000], [1.5], [Number.NaN]])(
    "rejects invalid random source value %s",
    (value) => {
      expect(() => sampleUnbiasedInteger(2, sequenceSource(value))).toThrow(
        /uint32/,
      );
    },
  );

  it("uses Web Crypto and fails explicitly when it is unavailable", () => {
    let calls = 0;
    const getRandomValues = <T extends Exclude<BufferSource, ArrayBuffer>>(
      values: T,
    ): T => {
      calls += 1;
      (values as unknown as Uint32Array)[0] = 9;
      return values;
    };
    expect(
      createWebCryptoRandomUint32Source({ getRandomValues }).nextUint32(),
    ).toBe(9);
    expect(calls).toBe(1);
    vi.stubGlobal("crypto", undefined);
    expect(() => createWebCryptoRandomUint32Source()).toThrow(/Web Crypto/);
    vi.unstubAllGlobals();
  });

  it("inspects every reel code before sampling and reports compatibility", () => {
    const config = gameConfig({
      valid: [
        [0, 1],
        [1, 0],
      ],
      wrongCount: [[0]],
      auxiliary: [
        [0, 2],
        [1, 0],
      ],
    });
    const infos = inspectReelSets({
      gameConfig: config,
      displaySymbols: ["A", "B"],
      columns: 2,
    });
    expect(infos).toEqual([
      { name: "valid", reelCount: 2, compatible: true },
      {
        name: "wrongCount",
        reelCount: 1,
        compatible: false,
        reason: "需要 2 reels，实际为 1",
      },
      expect.objectContaining({
        name: "auxiliary",
        compatible: false,
        reason: expect.stringMatching(
          /column 0 position 1.*code 2.*AUX.*display/,
        ),
      }),
    ]);
    expect(() =>
      sampleRandomReelScene({
        gameConfig: config,
        displaySymbols: ["A", "B"],
        reelSetName: "auxiliary",
        columns: 2,
        rows: 1,
        randomSource: sequenceSource(0, 0),
      }),
    ).toThrow(/抽|display set/);
  });

  it("rejects count mismatches and explains every unavailable reel set", () => {
    const config = gameConfig({ one: [[0]], three: [[0], [0], [0]] });
    expect(() =>
      sampleRandomReelScene({
        gameConfig: config,
        displaySymbols: ["A", "B"],
        reelSetName: "one",
        columns: 2,
        rows: 1,
        randomSource: sequenceSource(0),
      }),
    ).toThrow(/不匹配/);
    const infos = inspectReelSets({
      gameConfig: config,
      displaySymbols: ["A", "B"],
      columns: 2,
    });
    expect(() => requireCompatibleReelSets(infos, 2)).toThrow(
      /columns=2.*one \(1 reels.*three \(3 reels/,
    );
  });
});
