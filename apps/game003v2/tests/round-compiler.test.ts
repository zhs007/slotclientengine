import {
  createSlotGameLogicResult,
  type LogicGameConfig,
} from "@slotclientengine/gameframeworks";
import { describe, expect, it } from "vitest";
import {
  GAME003_SAMPLE_COIN_SPIN_RESULT,
  GAME003_SAMPLE_SPIN_RESULT,
  GAME003_SAMPLE_WIN_SPIN_RESULT,
} from "../../game003/tests/fixtures/game003-gmi.js";
import { compileGame003v2Round } from "../src/round-compiler.js";

const displaySymbols = Object.freeze([
  "CO",
  ...Array.from({ length: 23 }, (_, code) => code)
    .filter((code) => code !== 11)
    .map((code) => `S${code}`),
]);
const gameConfig = {
  getSymbolCode: (symbol: string) =>
    symbol === "CO"
      ? 11
      : /^S\d+$/u.test(symbol)
        ? Number(symbol.slice(1))
        : undefined,
} as LogicGameConfig;

describe("game003v2 round compiler", () => {
  it("finalizes a deep-frozen landing plan before presentation", () => {
    const compiled = compile(GAME003_SAMPLE_SPIN_RESULT);
    expect(compiled.plan.operations.map((operation) => operation.kind)).toEqual(
      ["slot:spin"],
    );
    expect(compiled.plan.final.scene).toHaveLength(5);
    expect(Object.isFrozen(compiled.plan)).toBe(true);
    const landing = compiled.plan.operations[0];
    expect(landing?.effect).toBe("scene-landing");
    if (landing?.effect !== "scene-landing")
      throw new Error("expected scene landing operation");
    expect(Object.isFrozen(landing.output)).toBe(true);
  });

  it("puts CO image-string values in the landing snapshot", () => {
    const compiled = compile(GAME003_SAMPLE_COIN_SPIN_RESULT);
    expect(compiled.plan.final.values[1]?.slice(1, 4)).toEqual([2, 1, 150]);
  });

  it("orders landing, win carousel and award popup with exact sources", () => {
    const compiled = compile(GAME003_SAMPLE_WIN_SPIN_RESULT);
    expect(compiled.plan.operations.map((operation) => operation.kind)).toEqual(
      ["slot:spin", "game003:wins", "game003:award"],
    );
    expect(compiled.winAmountRaw).toBe(250);
    expect(compiled.betAmountRaw).toBe(50);
    expect(
      (compiled.plan.operations[1]?.payload as { groups: readonly unknown[] })
        .groups,
    ).toHaveLength(2);
  });

  it("fails before finalization when authoritative component data is invalid", () => {
    const invalid = structuredClone(GAME003_SAMPLE_COIN_SPIN_RESULT) as any;
    invalid.gmi.replyPlay.results[0].clientData.otherScenes[0].values[1].values[1] =
      -1;
    expect(() => compile(invalid)).toThrow(/non-negative/);
  });
});

function compile(message: unknown) {
  const logic = createSlotGameLogicResult(message, {
    bet: { bet: 5, lines: 10, times: 1 },
    userInfo: { balance: 1000, gameid: 69003 },
  }).logic;
  return compileGame003v2Round({ logic, gameConfig, displaySymbols });
}
