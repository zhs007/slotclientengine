import { Container, Graphics, Text } from "pixi.js";

export type Game001SpinButtonState = "ready" | "loading" | "spinning" | "error";

export interface Game001SpinButtonOptions {
  readonly x: number;
  readonly y: number;
  readonly onSpin: () => void | Promise<void>;
}

const LABELS: Record<Game001SpinButtonState, string> = Object.freeze({
  ready: "SPIN",
  loading: "LOADING",
  spinning: "SPINNING",
  error: "ERROR",
});

export class Game001SpinButton extends Container {
  readonly #background = new Graphics();
  readonly #label = new Text({
    text: LABELS.loading,
    style: {
      fontFamily: "Arial, sans-serif",
      fontSize: 34,
      fontWeight: "700",
      fill: 0xffffff,
    },
  });
  readonly #onSpin: () => void | Promise<void>;
  #state: Game001SpinButtonState = "loading";

  constructor(options: Game001SpinButtonOptions) {
    super();
    this.#onSpin = options.onSpin;
    this.x = options.x;
    this.y = options.y;
    this.#label.anchor.set(0.5);
    this.addChild(this.#background, this.#label);
    this.on("pointertap", () => {
      this.handleTap();
    });
    this.setState("loading");
  }

  getState(): Game001SpinButtonState {
    return this.#state;
  }

  setState(state: Game001SpinButtonState): void {
    this.#state = state;
    this.#label.text = LABELS[state];
    this.eventMode = state === "ready" ? "static" : "none";
    this.cursor = state === "ready" ? "pointer" : "default";
    this.redraw();
  }

  private handleTap(): void {
    if (this.#state !== "ready") {
      return;
    }
    this.setState("loading");
    void Promise.resolve(this.#onSpin()).catch(() => {
      this.setState("error");
    });
  }

  private redraw(): void {
    const fill = getFillForState(this.#state);
    const stroke = this.#state === "ready" ? 0xffffff : 0x3f4652;
    this.#background
      .clear()
      .roundRect(-110, -42, 220, 84, 8)
      .fill({ color: fill, alpha: 0.94 })
      .stroke({ color: stroke, width: 3, alpha: 0.9 });
  }
}

export function createGame001SpinButton(
  options: Game001SpinButtonOptions,
): Game001SpinButton {
  return new Game001SpinButton(options);
}

function getFillForState(state: Game001SpinButtonState): number {
  switch (state) {
    case "ready":
      return 0xd93128;
    case "loading":
      return 0x435163;
    case "spinning":
      return 0x1f6f8b;
    case "error":
      return 0x6a2020;
  }
}
