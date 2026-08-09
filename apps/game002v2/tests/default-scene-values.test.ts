import type { SymbolPackageResource } from "@slotclientengine/rendercore";
import { describe, expect, it, vi } from "vitest";
import { createGame002v2DefaultSceneValueResolver } from "../src/default-scene-values.js";

function symbols(options?: {
  readonly coinCode?: number;
  readonly table?: readonly {
    readonly value: number;
    readonly weight: number;
  }[];
}): SymbolPackageResource {
  const coinCode = options?.coinCode ?? 3;
  const table = options?.table ?? [{ value: 50, weight: 1 }];
  return {
    gameConfig: {
      getSymbolCode: (name: string) => (name === "CN" ? coinCode : undefined),
      getNumberWeightTable: (name: string) => {
        if (name !== "bgcoinweight") throw new RangeError(name);
        return table;
      },
    },
  } as unknown as SymbolPackageResource;
}

describe("game002v2 default scene values", () => {
  it("uses bgcoinweight only for CN and keeps its occurrence stable", () => {
    const randomUint32 = vi.fn(() => 0);
    const resolver = createGame002v2DefaultSceneValueResolver(
      symbols(),
      randomUint32,
    );
    const coin = { x: 0, y: 1, symbolY: 4, code: 3 };
    expect(resolver(coin)).toBe(50);
    expect(resolver(coin)).toBe(50);
    expect(resolver({ ...coin, code: 7 })).toBeNull();
    expect(randomUint32).toHaveBeenCalledTimes(1);
  });

  it("fails when CN or bgcoinweight is unavailable", () => {
    expect(() =>
      createGame002v2DefaultSceneValueResolver(symbols({ coinCode: 0 })),
    ).not.toThrow();
    const missingCoin = symbols() as unknown as {
      gameConfig: {
        getSymbolCode(name: string): number | undefined;
        getNumberWeightTable(name: string): readonly never[];
      };
    };
    missingCoin.gameConfig.getSymbolCode = () => undefined;
    expect(() =>
      createGame002v2DefaultSceneValueResolver(
        missingCoin as unknown as SymbolPackageResource,
      ),
    ).toThrow(/requires symbol "CN"/);

    const missingTable = symbols() as unknown as {
      gameConfig: {
        getSymbolCode(name: string): number | undefined;
        getNumberWeightTable(name: string): readonly never[];
      };
    };
    missingTable.gameConfig.getNumberWeightTable = () => {
      throw new RangeError("missing bgcoinweight");
    };
    expect(() =>
      createGame002v2DefaultSceneValueResolver(
        missingTable as unknown as SymbolPackageResource,
      ),
    ).toThrow(/missing bgcoinweight/);
  });
});
