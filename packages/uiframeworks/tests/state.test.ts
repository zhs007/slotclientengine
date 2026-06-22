import {
  SlotUiStateStore,
  getBetControls,
  validateBetOptions,
} from "../src/index.js";
import { BET_OPTIONS } from "./test-helpers.js";

describe("state", () => {
  it("initializes without mutating caller bet options", () => {
    const source = [{ bet: 1, lines: 10 }];
    const store = new SlotUiStateStore({
      betOptions: source,
      initialBalance: 50,
    });
    source[0].bet = 99;
    expect(store.getState().betOption.bet).toBe(1);
    expect(store.getState().balance).toBe(50);
  });

  it("rejects invalid bet options and index", () => {
    expect(() => validateBetOptions([])).toThrow(/non-empty/);
    expect(() => validateBetOptions([{ bet: 0, lines: 10 }])).toThrow(/bet/);
    expect(() => validateBetOptions([{ bet: 1, lines: 1.5 }])).toThrow(/lines/);
    expect(
      () =>
        new SlotUiStateStore({ betOptions: BET_OPTIONS, initialBetIndex: 9 }),
    ).toThrow(/range/);
  });

  it("updates bet index and honors boundaries", () => {
    const store = new SlotUiStateStore({ betOptions: BET_OPTIONS });
    expect(store.getBetControls()).toEqual({
      canDecrease: false,
      canIncrease: true,
    });
    store.increaseBet();
    expect(store.getState().betIndex).toBe(1);
    store.increaseBet();
    store.increaseBet();
    expect(store.getState().betIndex).toBe(2);
    expect(store.getBetControls()).toEqual({
      canDecrease: true,
      canIncrease: false,
    });
    store.decreaseBet();
    expect(store.getState().betIndex).toBe(1);
  });

  it("disables bet controls while not idle", () => {
    const store = new SlotUiStateStore({
      betOptions: BET_OPTIONS,
      initialBetIndex: 1,
    });
    store.setSpinState("spinning");
    expect(getBetControls(store.getState(), BET_OPTIONS)).toEqual({
      canDecrease: false,
      canIncrease: false,
    });
    store.setSpinState("presenting");
    expect(getBetControls(store.getState(), BET_OPTIONS)).toEqual({
      canDecrease: false,
      canIncrease: false,
    });
  });

  it("updates toggles, spin state, balance, win, and error", () => {
    const store = new SlotUiStateStore({ betOptions: BET_OPTIONS });
    store.setMuted(true);
    store.setFastMode(true);
    store.setAutoMode(true);
    store.setConnected(true);
    store.setBalance(300);
    store.setWinAmount(20);
    store.setSpinState("collecting");
    expect(store.getState()).toMatchObject({
      muted: true,
      fastMode: true,
      autoMode: true,
      connected: true,
      balance: 300,
      win: 20,
      spinState: "collecting",
    });
    store.setError("boom");
    expect(store.getState()).toMatchObject({
      error: "boom",
      spinState: "error",
    });
    expect(() => store.setBalance(Number.POSITIVE_INFINITY)).toThrow(/balance/);
    expect(() => store.setWinAmount(Number.NaN)).toThrow(/win/);
  });
});
