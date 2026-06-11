import type { ReelsDemo } from "./reels-demo.js";

export interface ReelsButtonLike {
  disabled: boolean;
  textContent: string | null;
  addEventListener(type: "click", listener: () => void): void;
}

export interface ReelsStatusLike {
  textContent: string | null;
}

export interface ReelsControls {
  sync(): void;
}

export function bindReelsControls(options: {
  readonly spinButton: ReelsButtonLike;
  readonly resetButton: ReelsButtonLike;
  readonly status: ReelsStatusLike;
  readonly demo: ReelsDemo;
}): ReelsControls {
  const sync = () => {
    options.spinButton.disabled = options.demo.isSpinning();
    options.spinButton.textContent = options.demo.isSpinning() ? "Spinning" : "Spin";
    options.status.textContent = createStatusText(options.demo);
  };

  options.spinButton.addEventListener("click", () => {
    if (!options.demo.isSpinning()) {
      options.demo.spin();
      sync();
    }
  });
  options.resetButton.addEventListener("click", () => {
    options.demo.reset();
    sync();
  });
  sync();

  return Object.freeze({ sync });
}

export function createStatusText(demo: ReelsDemo): string {
  const scene = demo.reelSet.getVisibleScene();
  return [
    demo.isSpinning() ? "spinning" : "stopped",
    `finalYs=${demo.finalYs.join(",")}`,
    `scene=${scene.map((column) => `[${column.join(",")}]`).join(" ")}`
  ].join(" | ");
}
