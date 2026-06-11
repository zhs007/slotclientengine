import { describe, expect, it } from "vitest";
import rawGameConfig from "../../../assets/gamecfg/game2.json";
import { createTextureSet } from "../../../packages/rendercore/tests/reel/helpers.js";
import { createReelsDemo } from "../src/reels-demo.js";
import { bindReelsControls } from "../src/ui.js";

describe("reelsviewer ui", () => {
  it("wires Spin and Reset without reentering an active spin", () => {
    const demo = createReelsDemo({
      rawGameConfig,
      symbolAssets: Object.fromEntries(
        ["S00", "S0", "S1", "S5", "S10", "SC", "RS", "X2", "X5", "X10"].map((symbol) => [
          symbol,
          createTextureSet(20, 20)
        ])
      )
    });
    const spinButton = createFakeButton();
    const resetButton = createFakeButton();
    const status = { textContent: "" };
    const controls = bindReelsControls({
      spinButton,
      resetButton,
      status,
      demo
    });

    spinButton.click();
    spinButton.click();
    expect(demo.isSpinning()).toBe(true);
    expect(spinButton.disabled).toBe(true);
    expect(spinButton.textContent).toBe("Spinning");
    expect(status.textContent).toContain("finalYs=1,1,4,0,27");

    resetButton.click();
    controls.sync();
    expect(demo.isSpinning()).toBe(false);
    expect(spinButton.textContent).toBe("Spin");
  });
});

function createFakeButton() {
  let listener = () => {};
  return {
    disabled: false,
    textContent: "",
    addEventListener(_type: "click", nextListener: () => void): void {
      listener = nextListener;
    },
    click(): void {
      listener();
    }
  };
}
