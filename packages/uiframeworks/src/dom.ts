import { calculateFrameScale, createDefaultSlotLayout } from "./layout.js";
import { SlotUiConfigError } from "./errors.js";
import type { MoneyFormatter } from "./format.js";
import { createSlotIcon, type SlotUiIconName } from "./icons.js";
import type {
  SlotUiBuyBonusOptions,
  SlotUiClockOptions,
  SlotUiDesignSize,
  SlotUiStateSnapshot,
} from "./types.js";
import type { BetControlsState } from "./state.js";

const DEFAULT_CLOCK_INTERVAL_MS = 60_000;

export interface SlotUiDomHandlers {
  readonly onMenu?: () => void;
  readonly onBuyBonus?: () => void;
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
  readonly brandLabel?: string;
  readonly clock?: false | SlotUiClockOptions;
  readonly buyBonus?: false | SlotUiBuyBonusOptions;
  readonly showFastToggle?: boolean;
  readonly formatMoney: MoneyFormatter;
  readonly getBetControls: () => BetControlsState;
  readonly handlers: SlotUiDomHandlers;
}

export interface SlotUiDomElements {
  readonly page: HTMLElement;
  readonly frame: HTMLElement;
  readonly gameLayer: HTMLElement;
  readonly overlay: HTMLElement;
  readonly topHud: HTMLElement;
  readonly clock: HTMLTimeElement | null;
  readonly brand: HTMLElement | null;
  readonly leftRail: HTMLElement;
  readonly menuButton: HTMLButtonElement;
  readonly soundButton: HTMLButtonElement;
  readonly fastButton: HTMLButtonElement;
  readonly bottomHud: HTMLElement;
  readonly buyBonusButton: HTMLButtonElement | null;
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
    "--slot-ui-bottom-hud-height",
    `${layout.bottomHudHeight}px`,
  );
  frame.style.setProperty(
    "--slot-ui-left-rail-button-size",
    `${layout.leftRailButtonSize}px`,
  );
  frame.style.setProperty("--slot-ui-left-rail-gap", `${layout.leftRailGap}px`);
  frame.style.setProperty(
    "--slot-ui-buy-bonus-width",
    `${layout.buyBonusWidth}px`,
  );
  frame.style.setProperty(
    "--slot-ui-buy-bonus-height",
    `${layout.buyBonusHeight}px`,
  );
  frame.style.setProperty(
    "--slot-ui-spin-size",
    `${layout.spinButtonDiameter}px`,
  );
  frame.style.setProperty(
    "--slot-ui-auto-size",
    `${layout.autoButtonDiameter}px`,
  );
  frame.style.setProperty(
    "--slot-ui-bet-step-size",
    `${layout.betStepButtonDiameter}px`,
  );
  frame.style.setProperty("--slot-ui-top-inset", `${layout.topInset}px`);
  frame.style.setProperty("--slot-ui-side-inset", `${layout.sideInset}px`);

  const topHud = element("div", "slot-ui-top-hud");
  const clock =
    options.clock === false ? null : element("time", "slot-ui-clock");
  const brand = createBrand(options.brandLabel);
  topHud.append(...withoutNull(clock, brand));

  const leftRail = element("div", "slot-ui-left-rail");
  const menuButton = iconButton(
    "slot-ui-rail-button slot-ui-menu-button",
    "Menu",
    "menu",
  );
  const fastButton = iconButton(
    "slot-ui-rail-button slot-ui-fast-button",
    "Fast mode",
    "zap",
  );
  fastButton.hidden = options.showFastToggle === false;
  const soundButton = iconButton(
    "slot-ui-rail-button slot-ui-sound-button",
    "Sound",
    "volume",
  );
  leftRail.append(menuButton, fastButton, soundButton);

  const bottomHud = element("div", "slot-ui-bottom-hud");
  const buyBonusButton = createBuyBonusButton(options.buyBonus);
  const balanceBlock = valueBlock("Balance", "slot-ui-balance-block");
  const winBlock = valueBlock("Win", "slot-ui-win-block");
  const betBlock = valueBlock("Bet", "slot-ui-bet-block");

  const betSteps = element("div", "slot-ui-bet-steps");
  const increaseBetButton = iconButton(
    "slot-ui-bet-step slot-ui-bet-increase",
    "Increase bet",
    "plus",
  );
  const decreaseBetButton = iconButton(
    "slot-ui-bet-step slot-ui-bet-decrease",
    "Decrease bet",
    "minus",
  );
  betSteps.append(increaseBetButton, decreaseBetButton);

  const spinButton = iconButton("slot-ui-spin-button", "Spin", "refresh-cw");
  const autoButton = iconButton(
    "slot-ui-auto-button",
    "Auto play",
    "circle-dot",
  );

  bottomHud.append(
    ...withoutNull(
      buyBonusButton,
      balanceBlock.root,
      winBlock.root,
      betBlock.root,
      betSteps,
      spinButton,
      autoButton,
    ),
  );

  const statusText = element("div", "slot-ui-status-text");
  statusText.setAttribute("role", "status");
  statusText.setAttribute("aria-live", "polite");

  overlay.append(topHud, leftRail, bottomHud, statusText);
  frame.append(gameLayer, overlay);
  page.append(frame);
  options.root.replaceChildren(page);

  const bindings: ListenerBinding[] = [];
  bind(bindings, menuButton, "click", () => options.handlers.onMenu?.());
  bind(bindings, fastButton, "click", () => {
    const enabled = fastButton.dataset.slotFast === "true";
    options.handlers.onFastModeChange(!enabled);
  });
  bind(bindings, soundButton, "click", () => {
    const muted = soundButton.dataset.slotMuted === "true";
    options.handlers.onMutedChange(!muted);
  });
  if (buyBonusButton) {
    bind(bindings, buyBonusButton, "click", () => {
      if (!buyBonusButton.disabled) {
        options.handlers.onBuyBonus?.();
      }
    });
  }
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

  const clockController = clock
    ? startClock(clock, options.clock === false ? undefined : options.clock)
    : null;

  const elements: SlotUiDomElements = {
    page,
    frame,
    gameLayer,
    overlay,
    topHud,
    clock,
    brand,
    leftRail,
    menuButton,
    soundButton,
    fastButton,
    bottomHud,
    buyBonusButton,
    balanceValue: balanceBlock.value,
    winValue: winBlock.value,
    betValue: betBlock.value,
    decreaseBetButton,
    increaseBetButton,
    spinButton,
    autoButton,
    statusText,
  };

  return {
    elements,
    update(state: SlotUiStateSnapshot): void {
      renderState(
        elements,
        state,
        options.formatMoney,
        options.getBetControls(),
      );
    },
    destroy(): void {
      clockController?.destroy();
      window.removeEventListener("resize", resizeListener);
      for (const binding of bindings) {
        binding.element.removeEventListener(binding.type, binding.listener);
      }
      bindings.length = 0;
    },
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
  elements.betValue.textContent = formatMoney(state.betOption.bet);

  elements.decreaseBetButton.disabled = !controls.canDecrease;
  elements.decreaseBetButton.setAttribute(
    "aria-disabled",
    String(!controls.canDecrease),
  );
  elements.increaseBetButton.disabled = !controls.canIncrease;
  elements.increaseBetButton.setAttribute(
    "aria-disabled",
    String(!controls.canIncrease),
  );

  elements.soundButton.dataset.slotMuted = String(state.muted);
  elements.soundButton.setAttribute("aria-pressed", String(!state.muted));
  elements.soundButton.setAttribute(
    "aria-label",
    state.muted ? "Sound off" : "Sound on",
  );
  setButtonIcon(elements.soundButton, state.muted ? "volume-off" : "volume");

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
  if (state.spinState === "presenting") {
    return "Presenting";
  }
  if (state.spinState === "collecting") {
    return "Collecting";
  }
  if (state.spinState === "disabled") {
    return "Disabled";
  }
  return state.fastMode ? "Ready fast" : "Ready";
}

function createBrand(brandLabel: string | undefined): HTMLElement | null {
  if (!brandLabel) {
    return null;
  }
  return textElement("div", "slot-ui-brand", brandLabel);
}

function createBuyBonusButton(
  options: false | SlotUiBuyBonusOptions | undefined,
): HTMLButtonElement | null {
  if (options === false) {
    return null;
  }

  const label = options?.label ?? "BUY BONUS";
  const buttonElement = button("slot-ui-buy-bonus-button", label);
  const lines = label.split(/\s+/).filter((line) => line.length > 0);
  for (const line of lines.length > 0 ? lines : [label]) {
    buttonElement.append(textElement("span", "slot-ui-buy-bonus-line", line));
  }
  const disabled = options?.enabled === false;
  buttonElement.disabled = disabled;
  buttonElement.setAttribute("aria-disabled", String(disabled));
  return buttonElement;
}

function startClock(
  clock: HTMLTimeElement,
  options: SlotUiClockOptions | undefined,
): { readonly destroy: () => void } {
  const intervalMs = options?.updateIntervalMs ?? DEFAULT_CLOCK_INTERVAL_MS;
  if (!Number.isInteger(intervalMs) || intervalMs <= 0) {
    throw new SlotUiConfigError(
      "clock.updateIntervalMs must be a positive integer.",
    );
  }

  const render = () => {
    const now = options?.now?.() ?? new Date();
    const label = formatClock(now, options);
    clock.textContent = label;
    clock.dateTime = now.toISOString();
  };
  render();
  const interval = window.setInterval(render, intervalMs);
  return {
    destroy: () => window.clearInterval(interval),
  };
}

function formatClock(
  date: Date,
  options: SlotUiClockOptions | undefined,
): string {
  if (options?.format) {
    return options.format(date);
  }
  return new Intl.DateTimeFormat(options?.locale, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: options?.hour12 ?? false,
  }).format(date);
}

function valueBlock(
  label: string,
  className: string,
): { readonly root: HTMLElement; readonly value: HTMLElement } {
  const root = element("div", `slot-ui-value-block ${className}`);
  const labelElement = textElement("span", "slot-ui-value-label", label);
  const value = element("span", "slot-ui-value-number");
  root.append(labelElement, value);
  return { root, value };
}

function iconButton(
  className: string,
  label: string,
  iconName: SlotUiIconName,
): HTMLButtonElement {
  const item = button(className, label);
  setButtonIcon(item, iconName);
  return item;
}

function setButtonIcon(
  buttonElement: HTMLButtonElement,
  iconName: SlotUiIconName,
): void {
  const previousIcon = buttonElement.querySelector(".slot-ui-icon");
  previousIcon?.remove();
  buttonElement.prepend(createSlotIcon(iconName));
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

function withoutNull<T>(...items: readonly (T | null)[]): T[] {
  return items.filter((item): item is T => item !== null);
}
