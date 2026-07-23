import {
  DEFAULT_LEO_SLOT_GAME_UI_LABELS,
  type LeoSlotGameUiLabels,
} from "@slotclientengine/game-ui-leo";

const TRANSLATION_KEYS: Readonly<
  Record<keyof LeoSlotGameUiLabels, readonly string[]>
> = Object.freeze({
  increaseBet: Object.freeze(["increaseBet"]),
  spin: Object.freeze(["spin"]),
  decreaseBet: Object.freeze(["decreaseBet"]),
  autoMode: Object.freeze(["autoMode"]),
  fastMode: Object.freeze(["fastMode"]),
  soundOn: Object.freeze(["soundOn"]),
  soundOff: Object.freeze(["soundOff"]),
  balance: Object.freeze(["common_label_Balance", "balance"]),
  win: Object.freeze(["common_label_win", "win"]),
  totalBet: Object.freeze(["common_label_Totalbet", "totalBet"]),
  loading: Object.freeze(["loading"]),
  connecting: Object.freeze(["connecting"]),
  disconnected: Object.freeze(["disconnected"]),
  spinning: Object.freeze(["spinning"]),
  presenting: Object.freeze(["presenting"]),
  collecting: Object.freeze(["collecting"]),
  disabled: Object.freeze(["disabled"]),
  readyFast: Object.freeze(["readyFast"]),
  ready: Object.freeze(["ready"]),
});

export function createGame002LeoUiLabels(
  translations: Readonly<Record<string, string>>,
): LeoSlotGameUiLabels {
  const output = { ...DEFAULT_LEO_SLOT_GAME_UI_LABELS };
  for (const key of Object.keys(TRANSLATION_KEYS) as Array<
    keyof LeoSlotGameUiLabels
  >) {
    for (const translationKey of TRANSLATION_KEYS[key]) {
      const value = translations[translationKey];
      if (typeof value === "string" && value.trim().length > 0) {
        output[key] = value;
        break;
      }
    }
  }
  return Object.freeze(output);
}
