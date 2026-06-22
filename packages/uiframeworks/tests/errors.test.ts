import { SlotUiRuntimeError, toSlotUiError } from "../src/errors.js";

describe("errors", () => {
  it("keeps Error instances intact", () => {
    const original = new Error("original");
    expect(toSlotUiError(original, "fallback")).toBe(original);
  });

  it("wraps string and unknown errors", () => {
    expect(toSlotUiError("plain", "fallback")).toMatchObject({
      name: "SlotUiRuntimeError",
      message: "plain",
    });
    expect(toSlotUiError(null, "fallback")).toBeInstanceOf(SlotUiRuntimeError);
    expect(toSlotUiError(null, "fallback").message).toBe("fallback");
  });
});
