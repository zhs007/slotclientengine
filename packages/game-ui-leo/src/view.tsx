import { useEffect, useState, useSyncExternalStore } from "react";
import type {
  SlotGameStateSnapshot,
  SlotGameUiCommands,
} from "@slotclientengine/gameframeworks";
import type { LeoSlotGameUiStore } from "./store.js";

export interface LeoSlotGameUiViewProps {
  readonly store: LeoSlotGameUiStore;
  readonly commands: SlotGameUiCommands;
  readonly betOptionCount: number;
  readonly brandLabel: string;
  readonly formatMoney: (amount: number) => string;
  readonly labels: LeoSlotGameUiLabels;
}

export interface LeoSlotGameUiLabels {
  readonly increaseBet: string;
  readonly spin: string;
  readonly decreaseBet: string;
  readonly autoMode: string;
  readonly fastMode: string;
  readonly soundOn: string;
  readonly soundOff: string;
  readonly balance: string;
  readonly win: string;
  readonly totalBet: string;
  readonly loading: string;
  readonly connecting: string;
  readonly disconnected: string;
  readonly spinning: string;
  readonly presenting: string;
  readonly collecting: string;
  readonly disabled: string;
  readonly readyFast: string;
  readonly ready: string;
}

export const DEFAULT_LEO_SLOT_GAME_UI_LABELS: LeoSlotGameUiLabels =
  Object.freeze({
    increaseBet: "Increase bet",
    spin: "Spin",
    decreaseBet: "Decrease bet",
    autoMode: "Auto mode",
    fastMode: "Fast mode",
    soundOn: "Sound on",
    soundOff: "Sound off",
    balance: "BALANCE",
    win: "WIN",
    totalBet: "TOTAL BET",
    loading: "Loading",
    connecting: "Connecting",
    disconnected: "Disconnected",
    spinning: "Spinning",
    presenting: "Presenting",
    collecting: "Collecting",
    disabled: "Disabled",
    readyFast: "Ready fast",
    ready: "Ready",
  });

export function LeoSlotGameUiView({
  store,
  commands,
  betOptionCount,
  brandLabel,
  formatMoney,
  labels,
}: LeoSlotGameUiViewProps) {
  const state = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const clock = useClock();
  const idle = state.spinState === "idle";
  const canDecrease = idle && state.betIndex > 0;
  const canIncrease = idle && state.betIndex < betOptionCount - 1;
  const canSpin = state.connected && idle;

  return (
    <div
      className="slot-leo-ui-root"
      data-slot-leo-spin-state={state.spinState}
      data-slot-leo-connected={String(state.connected)}
    >
      <header className="slot-leo-ui-header">
        <strong className="slot-leo-ui-brand">{brandLabel}</strong>
        <time className="slot-leo-ui-clock" dateTime={clock.iso}>
          {clock.label}
        </time>
      </header>

      <div className="slot-leo-ui-right-controls">
        <ControlButton
          className="slot-leo-ui-bet-button slot-leo-ui-bet-increase"
          label={labels.increaseBet}
          disabled={!canIncrease}
          onClick={commands.increaseBet}
        />
        <ControlButton
          className="slot-leo-ui-spin-button"
          label={labels.spin}
          disabled={!canSpin}
          onClick={commands.requestSpin}
        />
        <ControlButton
          className="slot-leo-ui-bet-button slot-leo-ui-bet-decrease"
          label={labels.decreaseBet}
          disabled={!canDecrease}
          onClick={commands.decreaseBet}
        />
        <ControlButton
          className="slot-leo-ui-auto-button"
          label={labels.autoMode}
          pressed={state.autoMode}
          onClick={() => commands.setAutoMode(!state.autoMode)}
        />
      </div>

      <footer className="slot-leo-ui-footer">
        <div className="slot-leo-ui-footer-controls">
          <ControlButton
            className="slot-leo-ui-fast-button"
            label={labels.fastMode}
            pressed={state.fastMode}
            onClick={() => commands.setFastMode(!state.fastMode)}
          />
          <ControlButton
            className="slot-leo-ui-sound-button"
            label={state.muted ? labels.soundOff : labels.soundOn}
            pressed={!state.muted}
            onClick={() => commands.setMuted(!state.muted)}
          />
        </div>
        <MoneyBlock
          className="slot-leo-ui-balance"
          label={labels.balance}
          value={
            state.balance === null ? labels.loading : formatMoney(state.balance)
          }
        />
        <MoneyBlock
          className="slot-leo-ui-win"
          label={labels.win}
          value={formatMoney(state.win)}
        />
        <MoneyBlock
          className="slot-leo-ui-bet"
          label={labels.totalBet}
          value={formatMoney(state.betOption.bet)}
        />
      </footer>

      <div
        className="slot-leo-ui-status"
        role={state.error === null ? "status" : "alert"}
        aria-live={state.error === null ? "polite" : "assertive"}
        data-slot-leo-error={String(state.error !== null)}
      >
        {state.error ?? statusLabel(state, labels)}
      </div>
    </div>
  );
}

function ControlButton(props: {
  readonly className: string;
  readonly label: string;
  readonly disabled?: boolean;
  readonly pressed?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`slot-leo-ui-control ${props.className}`}
      aria-label={props.label}
      aria-pressed={props.pressed}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      <span className="slot-leo-ui-visually-hidden">{props.label}</span>
    </button>
  );
}

function MoneyBlock(props: {
  readonly className: string;
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className={`slot-leo-ui-money ${props.className}`}>
      <span className="slot-leo-ui-money-label">{props.label}</span>
      <strong className="slot-leo-ui-money-value">{props.value}</strong>
    </div>
  );
}

function statusLabel(
  state: SlotGameStateSnapshot,
  labels: LeoSlotGameUiLabels,
): string {
  if (!state.connected) {
    return state.spinState === "connecting"
      ? labels.connecting
      : labels.disconnected;
  }
  if (state.spinState === "spinning") return labels.spinning;
  if (state.spinState === "presenting") return labels.presenting;
  if (state.spinState === "collecting") return labels.collecting;
  if (state.spinState === "disabled") return labels.disabled;
  return state.fastMode ? labels.readyFast : labels.ready;
}

function useClock(): { readonly label: string; readonly iso: string } {
  const [clock, setClock] = useState(() => readClock());
  useEffect(() => {
    const interval = window.setInterval(() => setClock(readClock()), 60_000);
    return () => window.clearInterval(interval);
  }, []);
  return clock;
}

function readClock(): { readonly label: string; readonly iso: string } {
  const now = new Date();
  return Object.freeze({
    label: new Intl.DateTimeFormat(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now),
    iso: now.toISOString(),
  });
}
