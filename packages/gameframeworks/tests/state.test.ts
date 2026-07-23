import { SlotGameStateStore, SlotGameConfigError } from "../src/index.js";
import { BET_OPTIONS } from "./test-helpers.js";

describe("state", () => {
  it("defaults and validates initial preferences", () => {
    expect(
      new SlotGameStateStore({ betOptions: BET_OPTIONS }).getState(),
    ).toMatchObject({ muted: false, fastMode: false, autoMode: false });
    expect(
      new SlotGameStateStore({
        betOptions: BET_OPTIONS,
        initialMuted: true,
        initialFastMode: true,
        initialAutoMode: true,
      }).getState(),
    ).toMatchObject({ muted: true, fastMode: true, autoMode: true });
    expect(
      () =>
        new SlotGameStateStore({
          betOptions: BET_OPTIONS,
          initialMuted: "yes" as never,
        }),
    ).toThrow(/initialMuted must be a boolean/);
  });

  it("validates bet options, balances, and indexes", () => {
    expect(() => new SlotGameStateStore({ betOptions: [] })).toThrow(
      /non-empty/,
    );
    expect(
      () => new SlotGameStateStore({ betOptions: [{ bet: 0, lines: 1 }] }),
    ).toThrow(/bet/);
    expect(
      () => new SlotGameStateStore({ betOptions: [{ bet: 1, lines: 1.5 }] }),
    ).toThrow(/lines/);
    expect(
      () =>
        new SlotGameStateStore({
          betOptions: BET_OPTIONS,
          initialBetIndex: 9,
        }),
    ).toThrow(/range/);
    expect(
      () =>
        new SlotGameStateStore({
          betOptions: BET_OPTIONS,
          initialBalance: Number.NaN,
        }),
    ).toThrow(/initialBalance/);
    expect(new SlotGameConfigError("bad")).toBeInstanceOf(Error);
  });

  it("updates state and exposes a UI-compatible snapshot", () => {
    const store = new SlotGameStateStore({ betOptions: BET_OPTIONS });
    store.increaseBet();
    expect(store.getState().betIndex).toBe(1);
    store.increaseBet();
    expect(store.getState().betIndex).toBe(1);
    store.decreaseBet();
    expect(store.getState().betIndex).toBe(0);
    store.setConnected(true);
    store.setBalance(500);
    store.setWinAmount(12);
    store.setBetIndex(1);
    store.setMuted(true);
    store.setFastMode(true);
    store.setAutoMode(true);
    store.setSpinState("presenting");

    expect(store.getState()).toMatchObject({
      connected: true,
      balance: 500,
      win: 12,
      betIndex: 1,
      muted: true,
      fastMode: true,
      autoMode: true,
      spinState: "presenting",
    });
    expect(store.getUiState()).toMatchObject({
      designSize: { width: 941, height: 1672 },
      spinState: "presenting",
    });

    store.setError("boom");
    expect(store.getState()).toMatchObject({
      error: "boom",
      spinState: "error",
    });
    expect(() => store.setBetIndex(99)).toThrow(/range/);
    expect(() => store.setSpinState("mystery" as never)).toThrow(/Unknown/);
  });
});
