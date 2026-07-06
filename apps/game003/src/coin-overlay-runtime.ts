import { Container, Text } from "pixi.js";
import type { RenderVisibleSymbolGeometrySnapshot } from "@slotclientengine/rendercore/reel";
import type { Game003ReelRuntime } from "./game-demo.js";
import type { Game003CoinOverlayConfig } from "./coin-overlay-config.js";
import type { Game003CoinOverlayItem } from "./coin-overlay-sequence.js";

type CoinOverlayPhase = "idle" | "showing" | "destroyed";

export interface Game003CoinOverlaySnapshot {
  readonly phase: CoinOverlayPhase;
  readonly items: readonly Game003CoinOverlayItem[];
  readonly texts: readonly {
    readonly text: string;
    readonly x: number;
    readonly y: number;
  }[];
}

export interface Game003CoinOverlayRuntime {
  readonly container: Container;
  show(items: readonly Game003CoinOverlayItem[]): void;
  clear(): void;
  refresh(): void;
  getSnapshot(): Game003CoinOverlaySnapshot;
  destroy(): void;
}

export interface Game003CoinOverlayRuntimeOptions {
  readonly reelRuntime: Pick<
    Game003ReelRuntime,
    "getVisibleSymbolGeometrySnapshots"
  >;
  readonly config: Game003CoinOverlayConfig;
}

export function createGame003CoinOverlayRuntime(
  options: Game003CoinOverlayRuntimeOptions,
): Game003CoinOverlayRuntime {
  return new Game003CoinOverlayRuntimeModel(options);
}

class Game003CoinOverlayRuntimeModel implements Game003CoinOverlayRuntime {
  readonly container = new Container();
  readonly #reelRuntime: Game003CoinOverlayRuntimeOptions["reelRuntime"];
  readonly #config: Game003CoinOverlayConfig;
  #items: readonly Game003CoinOverlayItem[] = [];
  #phase: CoinOverlayPhase = "idle";

  constructor(options: Game003CoinOverlayRuntimeOptions) {
    this.#reelRuntime = options.reelRuntime;
    this.#config = options.config;
  }

  show(items: readonly Game003CoinOverlayItem[]): void {
    this.assertNotDestroyed();
    this.#items = Object.freeze(
      items.map((item) => Object.freeze({ ...item })),
    );
    this.rebuildTexts();
    this.#phase = this.#items.length > 0 ? "showing" : "idle";
  }

  clear(): void {
    this.assertNotDestroyed();
    this.clearTexts();
    this.#items = [];
    this.#phase = "idle";
  }

  refresh(): void {
    this.assertNotDestroyed();
    if (this.#items.length === 0) {
      return;
    }
    this.rebuildTexts();
    this.#phase = "showing";
  }

  getSnapshot(): Game003CoinOverlaySnapshot {
    return Object.freeze({
      phase: this.#phase,
      items: Object.freeze(
        this.#items.map((item) => Object.freeze({ ...item })),
      ),
      texts: Object.freeze(
        this.container.children.map((child) => {
          const text = child as Text;
          return Object.freeze({
            text: text.text,
            x: text.position.x,
            y: text.position.y,
          });
        }),
      ),
    });
  }

  destroy(): void {
    if (this.#phase === "destroyed") {
      return;
    }
    this.clearTexts();
    this.container.destroy({ children: true });
    this.#items = [];
    this.#phase = "destroyed";
  }

  private rebuildTexts(): void {
    this.clearTexts();
    const positions = this.#items.map((item) => ({ x: item.x, y: item.y }));
    const geometries =
      this.#reelRuntime.getVisibleSymbolGeometrySnapshots(positions);
    if (geometries.length !== this.#items.length) {
      throw new Error(
        "game003 coin overlay geometry count does not match item count.",
      );
    }
    for (const [index, item] of this.#items.entries()) {
      this.container.addChild(this.createText(item, geometries[index]));
    }
  }

  private createText(
    item: Game003CoinOverlayItem,
    geometry: RenderVisibleSymbolGeometrySnapshot,
  ): Text {
    const text = formatCoinAmount(item.amount);
    if (text.trim().length === 0) {
      throw new Error("game003 coin overlay amount formatter is invalid.");
    }
    if (item.text !== text) {
      throw new Error("game003 coin overlay item text must match raw amount.");
    }
    const label = new Text({
      text,
      style: {
        fontFamily: "Arial",
        fontSize: this.#config.text.fontSize,
        fontWeight: "900",
        fill: this.#config.text.fill,
        stroke: {
          color: this.#config.text.stroke,
          width: this.#config.text.strokeWidth,
        },
        align: "center",
      },
    });
    label.anchor.set(0.5);
    label.position.set(
      geometry.centerX,
      geometry.centerY +
        geometry.cellHeight * this.#config.text.yOffsetRatioFromCellCenter,
    );
    return label;
  }

  private clearTexts(): void {
    for (const child of this.container.removeChildren()) {
      child.destroy();
    }
  }

  private assertNotDestroyed(): void {
    if (this.#phase === "destroyed") {
      throw new Error("game003 coin overlay was destroyed.");
    }
  }
}

function formatCoinAmount(amount: number): string {
  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("game003 coin overlay amount must be a positive integer.");
  }
  return String(amount);
}
