import { describe, expect, it } from "vitest";
import { createSingleStatePopupRuntime } from "../../src/popup/core/index.js";
import { singleStatePopupFixture } from "./fixtures.js";

describe("single-state popup runtime", () => {
  it("resolves layers and mutable string handles by exact authored name", async () => {
    const runtime = createSingleStatePopupRuntime({
      resource: {
        manifest: singleStatePopupFixture(),
        resources: {},
        destroy() {},
      },
    });
    await runtime.init();
    runtime.start();
    expect(runtime.getPhase()).toBe("active");
    expect(runtime.getLayer("heading")).toBe(runtime.getLayer("heading"));
    const text = runtime.getTextNode("heading");
    text.setText("GO");
    expect(text.text).toBe("GO");
    text.resetText();
    expect(text.text).toBe("READY");
    expect(() => runtime.getLayer("missing")).toThrow(/not found/);
    runtime.requestDismiss();
    expect(runtime.getPhase()).toBe("complete");
    runtime.destroy();
    expect(() => text.setText("LATE")).toThrow(/destroyed/);
  });
});
