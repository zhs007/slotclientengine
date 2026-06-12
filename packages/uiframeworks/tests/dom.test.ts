import {
  applyFrameScale,
  createSlotUiDom,
  renderState
} from "../src/dom.js";
import { createMoneyFormatter } from "../src/index.js";
import { BET_OPTIONS, createStateSnapshot } from "./test-helpers.js";

describe("dom", () => {
  it("creates the required DOM structure and accessible controls", () => {
    const root = document.createElement("div");
    document.body.append(root);
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: false, canIncrease: true }),
      handlers: createHandlers()
    });

    expect(root.querySelector(".slot-ui-page")).toBeTruthy();
    expect(root.querySelector(".slot-ui-frame")).toBeTruthy();
    expect(root.querySelector(".slot-ui-game-layer")).toBeTruthy();
    expect(root.querySelector(".slot-ui-overlay")).toBeTruthy();
    expect(dom.elements.menuButton.getAttribute("aria-label")).toBe("Menu");
    expect(dom.elements.soundButton.hasAttribute("aria-pressed")).toBe(false);
    expect(dom.elements.autoButton.getAttribute("aria-label")).toBe("Auto play");
    dom.destroy();
  });

  it("renders values, toggle data attributes, and button disabled state", () => {
    const root = document.createElement("div");
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      formatMoney: createMoneyFormatter({ currency: "USD" }),
      getBetControls: () => ({ canDecrease: true, canIncrease: false }),
      handlers: createHandlers()
    });

    dom.update(
      createStateSnapshot({
        betIndex: 1,
        betOption: BET_OPTIONS[1],
        balance: 1234,
        win: 55,
        muted: true,
        fastMode: false,
        autoMode: true
      }),
    );

    expect(dom.elements.balanceValue.textContent).toBe("$1,234.00");
    expect(dom.elements.winValue.textContent).toBe("$55.00");
    expect(dom.elements.betValue.textContent).toBe("2 x 10");
    expect(dom.elements.soundButton.dataset.slotMuted).toBe("true");
    expect(dom.elements.fastButton.dataset.slotFast).toBe("false");
    expect(dom.elements.autoButton.dataset.slotAuto).toBe("true");
    expect(dom.elements.decreaseBetButton.disabled).toBe(false);
    expect(dom.elements.increaseBetButton.disabled).toBe(true);
    dom.destroy();
  });

  it("wires click handlers and removes them on destroy", () => {
    const root = document.createElement("div");
    const clicks: string[] = [];
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: true, canIncrease: true }),
      handlers: createHandlers(clicks)
    });
    dom.update(createStateSnapshot());

    dom.elements.menuButton.click();
    dom.elements.soundButton.click();
    dom.elements.fastButton.click();
    dom.elements.decreaseBetButton.click();
    dom.elements.increaseBetButton.click();
    dom.elements.spinButton.click();
    dom.elements.autoButton.click();
    expect(clicks).toEqual([
      "menu",
      "muted:true",
      "fast:true",
      "decrease",
      "increase",
      "spin",
      "auto:true"
    ]);

    dom.destroy();
    dom.elements.spinButton.click();
    expect(clicks).toHaveLength(7);
  });

  it("does not call disabled spin and renders status text", () => {
    const root = document.createElement("div");
    const clicks: string[] = [];
    const dom = createSlotUiDom({
      root,
      designSize: { width: 941, height: 1672 },
      formatMoney: createMoneyFormatter(),
      getBetControls: () => ({ canDecrease: false, canIncrease: false }),
      handlers: createHandlers(clicks)
    });
    dom.update(createStateSnapshot({ connected: false, spinState: "connecting" }));
    dom.elements.spinButton.click();
    expect(clicks).toEqual([]);
    expect(dom.elements.statusText.textContent).toBe("Connecting");

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
    onSpin: () => clicks.push("spin"),
    onIncreaseBet: () => clicks.push("increase"),
    onDecreaseBet: () => clicks.push("decrease"),
    onMutedChange: (muted: boolean) => clicks.push(`muted:${muted}`),
    onFastModeChange: (enabled: boolean) => clicks.push(`fast:${enabled}`),
    onAutoModeChange: (enabled: boolean) => clicks.push(`auto:${enabled}`)
  };
}
