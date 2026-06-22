import { applyFrameScale, createSlotUiDom, renderState } from "../src/dom.js";
import { createMoneyFormatter } from "../src/index.js";
import { BET_OPTIONS, createStateSnapshot } from "./test-helpers.js";

describe("dom", () => {
  it("creates the flat HUD DOM structure and accessible controls", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      brandLabel: "HYPER GAMING",
      clock: stableClock(),
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: false, canIncrease: true }),
      handlers: createHandlers(),
    });

    expect(root.querySelector(".slot-ui-page")).toBeTruthy();
    expect(root.querySelector(".slot-ui-frame")).toBeTruthy();
    expect(root.querySelector(".slot-ui-game-layer")).toBeTruthy();
    expect(root.querySelector(".slot-ui-overlay")).toBeTruthy();
    expect(root.querySelector(".slot-ui-top-hud")).toBeTruthy();
    expect(dom.elements.clock?.textContent).toBe("18:25");
    expect(dom.elements.brand?.textContent).toBe("HYPER GAMING");
    expect(root.querySelector(".slot-ui-left-rail")).toBeTruthy();
    expect(root.querySelector(".slot-ui-menu-button")).toBe(
      dom.elements.menuButton,
    );
    expect(root.querySelector(".slot-ui-fast-button")).toBe(
      dom.elements.fastButton,
    );
    expect(root.querySelector(".slot-ui-sound-button")).toBe(
      dom.elements.soundButton,
    );
    expect(root.querySelector(".slot-ui-buy-bonus-button")).toBe(
      dom.elements.buyBonusButton,
    );
    expect(root.querySelector(".slot-ui-bottom-hud")).toBe(
      dom.elements.bottomHud,
    );
    expect(root.querySelector(".slot-ui-spin-button")).toBe(
      dom.elements.spinButton,
    );
    expect(root.querySelector(".slot-ui-auto-button")).toBe(
      dom.elements.autoButton,
    );
    expect(
      root.querySelectorAll(".slot-ui-icon").length,
    ).toBeGreaterThanOrEqual(7);
    expect(dom.elements.menuButton.getAttribute("aria-label")).toBe("Menu");
    expect(dom.elements.fastButton.hidden).toBe(false);
    expect(dom.elements.fastButton.getAttribute("aria-label")).toBe(
      "Fast mode",
    );
    expect(dom.elements.buyBonusButton?.getAttribute("aria-label")).toBe(
      "BUY BONUS",
    );
    expect(dom.elements.spinButton.getAttribute("aria-label")).toBe("Spin");
    expect(dom.elements.autoButton.getAttribute("aria-label")).toBe(
      "Auto play",
    );
    dom.destroy();
  });

  it("renders values, icon toggle state, and disabled controls", () => {
    const root = document.createElement("div");
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      brandLabel: "HYPER GAMING",
      clock: false,
      buyBonus: { enabled: false },
      formatMoney: createMoneyFormatter({ currency: "USD" }),
      getBetControls: () => ({ canDecrease: true, canIncrease: false }),
      handlers: createHandlers(),
    });

    dom.update(
      createStateSnapshot({
        betIndex: 1,
        betOption: BET_OPTIONS[1],
        balance: 1234,
        win: 55,
        muted: true,
        fastMode: false,
        autoMode: true,
      }),
    );

    expect(dom.elements.clock).toBeNull();
    expect(dom.elements.balanceValue.textContent).toBe("$1,234.00");
    expect(dom.elements.winValue.textContent).toBe("$55.00");
    expect(dom.elements.betValue.textContent).toBe("$2.00");
    expect(dom.elements.soundButton.dataset.slotMuted).toBe("true");
    expect(dom.elements.soundButton.getAttribute("aria-pressed")).toBe("false");
    expect(
      dom.elements.soundButton.querySelector(".slot-ui-icon"),
    ).toBeTruthy();
    expect(dom.elements.fastButton.hidden).toBe(false);
    expect(dom.elements.fastButton.dataset.slotFast).toBe("false");
    expect(dom.elements.fastButton.getAttribute("aria-pressed")).toBe("false");
    expect(dom.elements.autoButton.dataset.slotAuto).toBe("true");
    expect(dom.elements.autoButton.getAttribute("aria-pressed")).toBe("true");
    expect(dom.elements.buyBonusButton?.disabled).toBe(true);
    expect(dom.elements.buyBonusButton?.getAttribute("aria-disabled")).toBe(
      "true",
    );
    expect(dom.elements.decreaseBetButton.disabled).toBe(false);
    expect(dom.elements.decreaseBetButton.getAttribute("aria-disabled")).toBe(
      "false",
    );
    expect(dom.elements.increaseBetButton.disabled).toBe(true);
    expect(dom.elements.increaseBetButton.getAttribute("aria-disabled")).toBe(
      "true",
    );
    dom.destroy();
  });

  it("wires click handlers and removes them on destroy", () => {
    const root = document.createElement("div");
    const clicks: string[] = [];
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      clock: false,
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: true, canIncrease: true }),
      handlers: createHandlers(clicks),
    });
    dom.update(createStateSnapshot());

    dom.elements.menuButton.click();
    dom.elements.fastButton.click();
    dom.elements.soundButton.click();
    dom.elements.buyBonusButton?.click();
    dom.elements.decreaseBetButton.click();
    dom.elements.increaseBetButton.click();
    dom.elements.spinButton.click();
    dom.elements.autoButton.click();
    expect(clicks).toEqual([
      "menu",
      "fast:true",
      "muted:true",
      "buyBonus",
      "decrease",
      "increase",
      "spin",
      "auto:true",
    ]);

    dom.destroy();
    dom.elements.spinButton.click();
    expect(clicks).toHaveLength(8);
  });

  it("cleans up resize listener and clock interval on destroy", () => {
    const root = document.createElement("div");
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const clearSpy = vi.spyOn(window, "clearInterval");
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      clock: stableClock(),
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: true, canIncrease: true }),
      handlers: createHandlers(),
    });

    dom.destroy();
    expect(removeSpy).toHaveBeenCalledWith("resize", expect.any(Function));
    expect(clearSpy).toHaveBeenCalled();
    removeSpy.mockRestore();
    clearSpy.mockRestore();
  });

  it("does not call disabled spin and renders status text", () => {
    const root = document.createElement("div");
    const clicks: string[] = [];
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      clock: false,
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: false, canIncrease: false }),
      handlers: createHandlers(clicks),
    });
    dom.update(
      createStateSnapshot({ connected: false, spinState: "connecting" }),
    );
    dom.elements.spinButton.click();
    expect(clicks).toEqual([]);
    expect(dom.elements.statusText.textContent).toBe("Connecting");

    renderState(
      dom.elements,
      createStateSnapshot({ connected: true, spinState: "presenting" }),
      createMoneyFormatter(),
      { canDecrease: false, canIncrease: false },
    );
    expect(dom.elements.spinButton.disabled).toBe(true);
    expect(dom.elements.statusText.textContent).toBe("Presenting");

    renderState(
      dom.elements,
      createStateSnapshot({ error: "bad", spinState: "error" }),
      createMoneyFormatter(),
      { canDecrease: false, canIncrease: false },
    );
    expect(dom.elements.statusText.textContent).toBe("bad");
    expect(dom.elements.statusText.dataset.slotError).toBe("true");
    dom.destroy();
  });

  it("supports hiding brand and buy bonus", () => {
    const root = document.createElement("div");
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      clock: false,
      buyBonus: false,
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: false, canIncrease: true }),
      handlers: createHandlers(),
    });

    expect(dom.elements.brand).toBeNull();
    expect(dom.elements.buyBonusButton).toBeNull();
    expect(root.querySelector(".slot-ui-brand")).toBeNull();
    expect(root.querySelector(".slot-ui-buy-bonus-button")).toBeNull();
    dom.destroy();
  });

  it("can hide the fast toggle when explicitly disabled", () => {
    const root = document.createElement("div");
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      clock: false,
      showFastToggle: false,
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: false, canIncrease: true }),
      handlers: createHandlers(),
    });

    expect(dom.elements.fastButton.hidden).toBe(true);
    dom.destroy();
  });

  it("applies scale from root dimensions", () => {
    const root = document.createElement("div");
    Object.defineProperty(root, "clientWidth", { value: 470.5 });
    Object.defineProperty(root, "clientHeight", { value: 836 });
    const frame = document.createElement("div");
    const scale = applyFrameScale(frame, root, { width: 941, height: 1672 });
    expect(scale).toBe(0.5);
    expect(frame.style.transform).toBe("translate(-235.25px, 0px) scale(0.5)");
  });
});

function createHandlers(clicks: string[] = []) {
  return {
    onMenu: () => clicks.push("menu"),
    onBuyBonus: () => clicks.push("buyBonus"),
    onSpin: () => clicks.push("spin"),
    onIncreaseBet: () => clicks.push("increase"),
    onDecreaseBet: () => clicks.push("decrease"),
    onMutedChange: (muted: boolean) => clicks.push(`muted:${muted}`),
    onFastModeChange: (enabled: boolean) => clicks.push(`fast:${enabled}`),
    onAutoModeChange: (enabled: boolean) => clicks.push(`auto:${enabled}`),
  };
}

function stableClock() {
  return {
    now: () => new Date("2026-06-15T10:25:00.000Z"),
    format: () => "18:25",
    updateIntervalMs: 60_000,
  };
}
