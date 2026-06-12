import { calculateFrameScale, createDefaultSlotLayout } from "./layout.js";
import type { MoneyFormatter } from "./format.js";
import type {
  SlotUiDesignSize,
  SlotUiStateSnapshot
} from "./types.js";
import type { BetControlsState } from "./state.js";

export interface SlotUiDomHandlers {
  readonly onMenu?: () => void;
  readonly onSpin: () => void;
  readonly onIncreaseBet: () => void;
  readonly onDecreaseBet: () => void;
  readonly onMutedChange: (muted: boolean) => void;
  readonly onFastModeChange: (enabled: boolean) => void;
  readonly onAutoModeChange: (enabled: boolean) => void;
}

export interface SlotUiDomOptions {
  readonly root: HTMLElement;
  readonly designSize: SlotUiDesignSize;
  readonly formatMoney: MoneyFormatter;
  readonly getBetControls: () => BetControlsState;
  readonly handlers: SlotUiDomHandlers;
}

export interface SlotUiDomElements {
  readonly page: HTMLElement;
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  readonly menuButton: HTMLButtonElement;
  readonly soundButton: HTMLButtonElement;
  readonly fastButton: HTMLButtonElement;
  readonly bottomBanner: HTMLElement;
  readonly balanceValue: HTMLElement;
  readonly winValue: HTMLElement;
  readonly betValue: HTMLElement;
  readonly decreaseBetButton: HTMLButtonElement;
  readonly increaseBetButton: HTMLButtonElement;
  readonly spinButton: HTMLButtonElement;
  readonly autoButton: HTMLButtonElement;
  readonly statusText: HTMLElement;
}

export interface SlotUiDom {
  readonly elements: SlotUiDomElements;
  update(state: SlotUiStateSnapshot): void;
  destroy(): void;
}

interface ListenerBinding {
  readonly element: EventTarget;
  readonly type: string;
  readonly listener: EventListener;
}

export function createSlotUiDom(options: SlotUiDomOptions): SlotUiDom {
  const layout = createDefaultSlotLayout(options.designSize);
  const page = element("main", "slot-ui-page");
  const frame = element("div", "slot-ui-frame");
  const gameLayer = element("div", "slot-ui-game-layer");
  const overlay = element("div", "slot-ui-overlay");

  page.setAttribute("data-slot-ui", "dom");
  frame.style.width = `${layout.designSize.width}px`;
  frame.style.height = `${layout.designSize.height}px`;
  frame.style.setProperty("--slot-ui-width", `${layout.designSize.width}px`);
  frame.style.setProperty("--slot-ui-height", `${layout.designSize.height}px`);
  frame.style.setProperty(
    "--slot-ui-bottom-banner-height",
    `${layout.bottomBannerHeight}px`,
  );
  frame.style.setProperty(
    "--slot-ui-spin-size",
    `${layout.spinButtonDiameter}px`,
  );
  frame.style.setProperty(
    "--slot-ui-auto-size",
    `${layout.autoButtonDiameter}px`,
  );
  frame.style.setProperty("--slot-ui-top-inset", `${layout.topInset}px`);
  frame.style.setProperty("--slot-ui-side-inset", `${layout.sideInset}px`);

  const menuButton = button("slot-ui-menu-button", "Menu");
  menuButton.append(
    element("span", "slot-ui-menu-line"),
    element("span", "slot-ui-menu-line"),
    element("span", "slot-ui-menu-line"),
  );

  const topToggles = element("div", "slot-ui-top-toggles");
  const soundButton = button("slot-ui-icon-toggle slot-ui-sound-toggle", "Sound");
  soundButton.append(
    element("span", "slot-ui-speaker-body"),
    element("span", "slot-ui-speaker-cone"),
    element("span", "slot-ui-sound-wave slot-ui-sound-wave-one"),
    element("span", "slot-ui-sound-wave slot-ui-sound-wave-two"),
    element("span", "slot-ui-toggle-slash"),
  );
  const fastButton = button("slot-ui-icon-toggle slot-ui-fast-toggle", "Fast mode");
  fastButton.append(
    element("span", "slot-ui-fast-bolt"),
    element("span", "slot-ui-toggle-slash"),
  );
  topToggles.append(soundButton, fastButton);

  const bottomBanner = element("div", "slot-ui-bottom-banner");
  const balanceBlock = valueBlock("Balance");
  const winBlock = valueBlock("Win");
  const betPanel = element("div", "slot-ui-bet-panel");
  const decreaseBetButton = button("slot-ui-bet-step slot-ui-bet-decrease", "Decrease bet");
  decreaseBetButton.textContent = "-";
  const betBlock = valueBlock("Bet");
  betBlock.root.classList.add("slot-ui-bet-value-block");
  const increaseBetButton = button("slot-ui-bet-step slot-ui-bet-increase", "Increase bet");
  increaseBetButton.textContent = "+";
  betPanel.append(decreaseBetButton, betBlock.root, increaseBetButton);

  const spinButton = button("slot-ui-spin-button", "Spin");
  spinButton.append(
    element("span", "slot-ui-spin-ring"),
    textElement("span", "slot-ui-spin-label", "SPIN"),
  );

  const autoButton = button("slot-ui-auto-button", "Auto play");
  autoButton.append(
    textElement("span", "slot-ui-auto-label", "AUTO"),
    textElement("span", "slot-ui-auto-mark", "A"),
  );

  const statusText = element("div", "slot-ui-status-text");
  statusText.setAttribute("role", "status");
  statusText.setAttribute("aria-live", "polite");

  bottomBanner.append(balanceBlock.root, winBlock.root, betPanel, autoButton);
  overlay.append(menuButton, topToggles, bottomBanner, spinButton, statusText);
  frame.append(gameLayer, overlay);
  page.append(frame);
  options.root.replaceChildren(page);

  const bindings: ListenerBinding[] = [];
  bind(bindings, menuButton, "click", () => options.handlers.onMenu?.());
  bind(bindings, soundButton, "click", () => {
    const muted = soundButton.dataset.slotMuted === "true";
    options.handlers.onMutedChange(!muted);
  });
  bind(bindings, fastButton, "click", () => {
    const enabled = fastButton.dataset.slotFast === "true";
    options.handlers.onFastModeChange(!enabled);
  });
  bind(bindings, decreaseBetButton, "click", () => {
    if (!decreaseBetButton.disabled) {
      options.handlers.onDecreaseBet();
    }
  });
  bind(bindings, increaseBetButton, "click", () => {
    if (!increaseBetButton.disabled) {
      options.handlers.onIncreaseBet();
    }
  });
  bind(bindings, spinButton, "click", () => {
    if (!spinButton.disabled) {
      options.handlers.onSpin();
    }
  });
  bind(bindings, autoButton, "click", () => {
    if (!autoButton.disabled) {
      const active = autoButton.getAttribute("aria-pressed") === "true";
      options.handlers.onAutoModeChange(!active);
    }
  });

  const resizeListener = () => {
    applyFrameScale(frame, options.root, layout.designSize);
  };
  window.addEventListener("resize", resizeListener);
  resizeListener();

  const elements: SlotUiDomElements = {
    page,
    frame,
    gameLayer,
    overlay,
    menuButton,
    soundButton,
    fastButton,
    bottomBanner,
    balanceValue: balanceBlock.value,
    winValue: winBlock.value,
    betValue: betBlock.value,
    decreaseBetButton,
    increaseBetButton,
    spinButton,
    autoButton,
    statusText
  };

  return {
    elements,
    update(state: SlotUiStateSnapshot): void {
      renderState(elements, state, options.formatMoney, options.getBetControls());
    },
    destroy(): void {
      window.removeEventListener("resize", resizeListener);
      for (const binding of bindings) {
        binding.element.removeEventListener(binding.type, binding.listener);
      }
      bindings.length = 0;
    }
  };
}

export function applyFrameScale(
  frame: HTMLElement,
  root: HTMLElement,
  designSize: SlotUiDesignSize,
): number {
  const viewportWidth = root.clientWidth || window.innerWidth;
  const viewportHeight = root.clientHeight || window.innerHeight;
  const scale = calculateFrameScale(viewportWidth, viewportHeight, designSize);
  const offsetX =
    viewportWidth < designSize.width
      ? -Math.max(0, (designSize.width - designSize.width * scale) / 2)
      : 0;
  const offsetY = Math.max(0, (viewportHeight - designSize.height * scale) / 2);
  frame.style.transform = `translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
  frame.style.setProperty("--slot-ui-scale", String(scale));
  return scale;
}

export function renderState(
  elements: SlotUiDomElements,
  state: SlotUiStateSnapshot,
  formatMoney: MoneyFormatter,
  controls: BetControlsState,
): void {
  elements.frame.dataset.slotSpinState = state.spinState;
  elements.frame.dataset.slotConnected = String(state.connected);
  elements.balanceValue.textContent =
    state.balance === null ? "Loading" : formatMoney(state.balance);
  elements.winValue.textContent = formatMoney(state.win);
  elements.betValue.textContent =
    state.betOption.label ?? formatMoney(state.betOption.bet);

  elements.decreaseBetButton.disabled = !controls.canDecrease;
  elements.decreaseBetButton.setAttribute("aria-disabled", String(!controls.canDecrease));
  elements.increaseBetButton.disabled = !controls.canIncrease;
  elements.increaseBetButton.setAttribute("aria-disabled", String(!controls.canIncrease));

  elements.soundButton.dataset.slotMuted = String(state.muted);
  elements.soundButton.setAttribute("aria-pressed", String(!state.muted));
  elements.soundButton.setAttribute(
    "aria-label",
    state.muted ? "Sound off" : "Sound on",
  );

  elements.fastButton.dataset.slotFast = String(state.fastMode);
  elements.fastButton.setAttribute("aria-pressed", String(state.fastMode));
  elements.fastButton.setAttribute(
    "aria-label",
    state.fastMode ? "Fast mode on" : "Fast mode off",
  );

  elements.autoButton.dataset.slotAuto = String(state.autoMode);
  elements.autoButton.setAttribute("aria-pressed", String(state.autoMode));
  elements.autoButton.disabled = state.spinState === "disabled";
  elements.autoButton.setAttribute(
    "aria-disabled",
    String(elements.autoButton.disabled),
  );

  const spinDisabled = state.spinState !== "idle" || !state.connected;
  elements.spinButton.disabled = spinDisabled;
  elements.spinButton.setAttribute("aria-disabled", String(spinDisabled));
  elements.spinButton.dataset.slotSpinState = state.spinState;

  elements.statusText.textContent = state.error ?? spinStatusText(state);
  elements.statusText.dataset.slotError = String(state.error !== null);
}

function spinStatusText(state: SlotUiStateSnapshot): string {
  if (!state.connected) {
    return state.spinState === "connecting" ? "Connecting" : "Disconnected";
  }
  if (state.spinState === "spinning") {
    return "Spinning";
  }
  if (state.spinState === "collecting") {
    return "Collecting";
  }
  if (state.spinState === "disabled") {
    return "Disabled";
  }
  return state.fastMode ? "Ready fast" : "Ready";
}

function valueBlock(label: string): { readonly root: HTMLElement; readonly value: HTMLElement } {
  const root = element("div", "slot-ui-value-block");
  const labelElement = textElement("span", "slot-ui-value-label", label);
  const value = element("span", "slot-ui-value-number");
  root.append(labelElement, value);
  return { root, value };
}

function button(className: string, label: string): HTMLButtonElement {
  const item = element("button", className) as HTMLButtonElement;
  item.type = "button";
  item.setAttribute("aria-label", label);
  return item;
}

function textElement<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
  text: string,
): HTMLElementTagNameMap[K] {
  const item = element(tag, className);
  item.textContent = text;
  return item;
}

function element<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className: string,
): HTMLElementTagNameMap[K] {
  const item = document.createElement(tag);
  item.className = className;
  return item;
}

function bind(
  bindings: ListenerBinding[],
  element: EventTarget,
  type: string,
  listener: EventListener,
): void {
  element.addEventListener(type, listener);
  bindings.push({ element, type, listener });
}
