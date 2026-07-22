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
}

export function LeoSlotGameUiView({
  store,
  commands,
  betOptionCount,
  brandLabel,
  formatMoney,
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
          label="Increase bet"
          disabled={!canIncrease}
          onClick={commands.increaseBet}
        />
        <ControlButton
          className="slot-leo-ui-spin-button"
          label="Spin"
          disabled={!canSpin}
          onClick={commands.requestSpin}
        />
        <ControlButton
          className="slot-leo-ui-bet-button slot-leo-ui-bet-decrease"
          label="Decrease bet"
          disabled={!canDecrease}
          onClick={commands.decreaseBet}
        />
        <ControlButton
          className="slot-leo-ui-auto-button"
          label="Auto mode"
          pressed={state.autoMode}
          onClick={() => commands.setAutoMode(!state.autoMode)}
        />
      </div>

      <footer className="slot-leo-ui-footer">
        <div className="slot-leo-ui-footer-controls">
          <ControlButton
            className="slot-leo-ui-fast-button"
            label="Fast mode"
            pressed={state.fastMode}
            onClick={() => commands.setFastMode(!state.fastMode)}
          />
          <ControlButton
            className="slot-leo-ui-sound-button"
            label={state.muted ? "Sound off" : "Sound on"}
            pressed={!state.muted}
            onClick={() => commands.setMuted(!state.muted)}
          />
        </div>
        <MoneyBlock
          className="slot-leo-ui-balance"
          label="BALANCE"
          value={
            state.balance === null ? "Loading" : formatMoney(state.balance)
          }
        />
        <MoneyBlock
          className="slot-leo-ui-win"
          label="WIN"
          value={formatMoney(state.win)}
        />
        <MoneyBlock
          className="slot-leo-ui-bet"
          label="TOTAL BET"
          value={formatMoney(state.betOption.bet)}
        />
      </footer>

      <div
        className="slot-leo-ui-status"
        role={state.error === null ? "status" : "alert"}
        aria-live={state.error === null ? "polite" : "assertive"}
        data-slot-leo-error={String(state.error !== null)}
      >
        {state.error ?? statusLabel(state)}
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

function statusLabel(state: SlotGameStateSnapshot): string {
  if (!state.connected) {
    return state.spinState === "connecting" ? "Connecting" : "Disconnected";
  }
  if (state.spinState === "spinning") return "Spinning";
  if (state.spinState === "presenting") return "Presenting";
  if (state.spinState === "collecting") return "Collecting";
  if (state.spinState === "disabled") return "Disabled";
  return state.fastMode ? "Ready fast" : "Ready";
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
