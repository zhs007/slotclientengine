import { describe, expect, it } from "vitest";
import { DEFAULT_LEO_SLOT_GAME_UI_LABELS } from "@slotclientengine/game-ui-leo";
import { createGame002LeoUiLabels } from "../src/platform-ui.js";

describe("game002 Leo platform label mapping", () => {
  it("maps only explicit known keys and falls back field by field", () => {
    const labels = createGame002LeoUiLabels({
      spin: "Girar",
      balance: "Saldo",
      ready: "",
      unknownAction: "must not spread",
    });
    expect(labels.spin).toBe("Girar");
    expect(labels.balance).toBe("Saldo");
    expect(labels.ready).toBe(DEFAULT_LEO_SLOT_GAME_UI_LABELS.ready);
    expect(labels.fastMode).toBe(DEFAULT_LEO_SLOT_GAME_UI_LABELS.fastMode);
    expect(labels).not.toHaveProperty("unknownAction");
    expect(Object.isFrozen(labels)).toBe(true);
  });
});
