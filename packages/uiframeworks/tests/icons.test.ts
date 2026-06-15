import { createSlotIcon } from "../src/icons.js";

describe("icons", () => {
  it("creates accessible-hidden lucide SVG icons with the shared class", () => {
    const icon = createSlotIcon("menu");

    expect(icon.tagName.toLowerCase()).toBe("svg");
    expect(icon.classList.contains("slot-ui-icon")).toBe(true);
    expect(icon.getAttribute("aria-hidden")).toBe("true");
    expect(icon.getAttribute("focusable")).toBe("false");
    expect(icon.getAttribute("stroke")).toBe("currentColor");
  });

  it("rejects unknown icon names instead of falling back", () => {
    expect(() => createSlotIcon("missing" as never)).toThrow(
      /Unknown slot UI icon/,
    );
  });
});
