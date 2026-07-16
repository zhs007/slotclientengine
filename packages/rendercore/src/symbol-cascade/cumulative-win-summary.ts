import { Text } from "pixi.js";
import type { SymbolWinSummaryTextStyle } from "./types.js";

export interface CumulativeWinSummarySnapshot {
  readonly currentValue: number;
  readonly targetValue: number;
  readonly visible: boolean;
  readonly counting: boolean;
  readonly text: string;
}

export interface CumulativeWinSummary {
  readonly text: Text;
  incrementBy(amount: number): void;
  update(deltaSeconds: number): void;
  clear(): void;
  getSnapshot(): CumulativeWinSummarySnapshot;
  destroy(): void;
}

export function createCumulativeWinSummary(options: {
  readonly formatter: (value: number) => string;
  readonly countDurationSeconds: number;
  readonly position: Readonly<{ readonly x: number; readonly y: number }>;
  readonly textStyle: SymbolWinSummaryTextStyle;
}): CumulativeWinSummary {
  return new CumulativeWinSummaryModel(options);
}

class CumulativeWinSummaryModel implements CumulativeWinSummary {
  readonly text: Text;
  readonly #formatter: (value: number) => string;
  readonly #duration: number;
  #current = 0;
  #target = 0;
  #start = 0;
  #elapsed = 0;
  #counting = false;
  #destroyed = false;

  constructor(options: {
    readonly formatter: (value: number) => string;
    readonly countDurationSeconds: number;
    readonly position: Readonly<{ readonly x: number; readonly y: number }>;
    readonly textStyle: SymbolWinSummaryTextStyle;
  }) {
    if (
      !Number.isFinite(options.countDurationSeconds) ||
      options.countDurationSeconds <= 0
    ) {
      throw new Error(
        "symbol cascade summary countDurationSeconds must be finite and positive.",
      );
    }
    assertFinitePoint(options.position);
    assertTextStyle(options.textStyle);
    this.#formatter = options.formatter;
    this.#duration = options.countDurationSeconds;
    this.text = new Text({
      text: "",
      style: {
        fontFamily: "Arial",
        fontSize: options.textStyle.fontSize,
        fontWeight: String(options.textStyle.fontWeight) as "900",
        fill: options.textStyle.fill,
        stroke: {
          color: options.textStyle.stroke,
          width: options.textStyle.strokeWidth,
        },
        align: "center",
      },
    });
    this.text.anchor.set(0.5);
    this.text.position.set(options.position.x, options.position.y);
    this.render(0);
  }

  incrementBy(amount: number): void {
    this.assertAlive();
    if (!Number.isSafeInteger(amount) || amount <= 0) {
      throw new Error(
        "symbol cascade summary increment must be a positive safe integer.",
      );
    }
    if (this.#counting) {
      throw new Error("symbol cascade summary increment is already active.");
    }
    if (!Number.isSafeInteger(this.#current + amount)) {
      throw new Error(
        "symbol cascade summary target exceeds safe integer range.",
      );
    }
    this.#start = this.#current;
    this.#target = this.#current + amount;
    this.#elapsed = 0;
    this.#counting = true;
  }

  update(deltaSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "symbol cascade summary deltaSeconds must be finite and non-negative.",
      );
    }
    if (!this.#counting) return;
    this.#elapsed = Math.min(this.#duration, this.#elapsed + deltaSeconds);
    const progress = this.#elapsed / this.#duration;
    const display =
      progress >= 1
        ? this.#target
        : Math.floor(this.#start + (this.#target - this.#start) * progress);
    this.#current = display;
    this.render(display);
    if (progress >= 1) {
      this.#current = this.#target;
      this.#counting = false;
    }
  }

  clear(): void {
    this.assertAlive();
    this.#current = 0;
    this.#target = 0;
    this.#start = 0;
    this.#elapsed = 0;
    this.#counting = false;
    this.render(0);
  }

  getSnapshot(): CumulativeWinSummarySnapshot {
    return Object.freeze({
      currentValue: this.#current,
      targetValue: this.#target,
      visible: this.text.visible,
      counting: this.#counting,
      text: this.text.text,
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.text.destroy();
  }

  private render(value: number): void {
    if (value <= 0) {
      this.text.text = "";
      this.text.visible = false;
      return;
    }
    const formatted = this.#formatter(value);
    if (typeof formatted !== "string" || formatted.trim().length === 0) {
      throw new Error("symbol cascade summary formatter is invalid.");
    }
    this.text.text = formatted;
    this.text.visible = true;
  }

  private assertAlive(): void {
    if (this.#destroyed) {
      throw new Error("symbol cascade summary was destroyed.");
    }
  }
}

function assertFinitePoint(point: Readonly<{ x: number; y: number }>): void {
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) {
    throw new Error("symbol cascade summary position must be finite.");
  }
}

function assertTextStyle(style: SymbolWinSummaryTextStyle): void {
  if (!Number.isFinite(style.fontSize) || style.fontSize <= 0) {
    throw new Error("symbol cascade summary fontSize must be positive.");
  }
  if (!Number.isFinite(style.strokeWidth) || style.strokeWidth < 0) {
    throw new Error("symbol cascade summary strokeWidth must be non-negative.");
  }
  for (const [label, value] of [
    ["fill", style.fill],
    ["stroke", style.stroke],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`symbol cascade summary ${label} must be non-empty.`);
    }
  }
}
