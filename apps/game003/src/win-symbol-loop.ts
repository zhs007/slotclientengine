import { Container, Text } from "pixi.js";
import type { RenderVisibleSymbolGeometrySnapshot } from "@slotclientengine/rendercore/reel";
import type { Game003ReelRuntime } from "./game-demo.js";
import type { Game003WinSymbolGroup } from "./win-sequence.js";
import type { Game003WinSymbolLoopConfig } from "./win-symbol-loop-config.js";

type WinSymbolLoopPhase = "idle" | "playing" | "cycle-pause" | "destroyed";

export interface Game003WinSymbolLoopRuntimeOptions {
  readonly reelRuntime: Pick<
    Game003ReelRuntime,
    | "requestVisibleSymbolStates"
    | "getVisibleSymbolStateSnapshots"
    | "getVisibleSymbolGeometrySnapshots"
    | "update"
  >;
  readonly config: Game003WinSymbolLoopConfig;
  readonly formatter: (amount: number) => string;
}

export interface Game003WinSymbolLoopSnapshot {
  readonly phase: WinSymbolLoopPhase;
  readonly firstCycleComplete: boolean;
  readonly currentIndex: number | null;
  readonly amountVisible: boolean;
  readonly amountText: string;
  readonly amountPosition: { readonly x: number; readonly y: number } | null;
}

export interface Game003WinSymbolLoopRuntime {
  readonly container: Container;
  readonly firstCycleComplete: boolean;
  start(groups: readonly Game003WinSymbolGroup[]): void;
  clear(): void;
  update(deltaSeconds: number): { readonly firstCycleComplete: boolean };
  getSnapshot(): Game003WinSymbolLoopSnapshot;
  destroy(): void;
}

export function createGame003WinSymbolLoopRuntime(
  options: Game003WinSymbolLoopRuntimeOptions,
): Game003WinSymbolLoopRuntime {
  return new Game003WinSymbolLoopRuntimeModel(options);
}

class Game003WinSymbolLoopRuntimeModel implements Game003WinSymbolLoopRuntime {
  readonly container = new Container();
  readonly #reelRuntime: Game003WinSymbolLoopRuntimeOptions["reelRuntime"];
  readonly #config: Game003WinSymbolLoopConfig;
  readonly #formatter: (amount: number) => string;
  readonly #amountText: Text;
  #groups: readonly Game003WinSymbolGroup[] = [];
  #phase: WinSymbolLoopPhase = "idle";
  #currentIndex = -1;
  #currentGroupAdvanced = false;
  #pauseElapsedSeconds = 0;
  #firstCycleComplete = false;

  constructor(options: Game003WinSymbolLoopRuntimeOptions) {
    this.#reelRuntime = options.reelRuntime;
    this.#config = options.config;
    this.#formatter = options.formatter;
    this.#amountText = new Text({
      text: "",
      style: {
        fontFamily: "Arial",
        fontSize: this.#config.resultAmount.fontSize,
        fontWeight: "900",
        fill: this.#config.resultAmount.fill,
        stroke: {
          color: this.#config.resultAmount.stroke,
          width: this.#config.resultAmount.strokeWidth,
        },
        align: "center",
      },
    });
    this.#amountText.anchor.set(0.5);
    this.#amountText.visible = false;
    this.container.addChild(this.#amountText);
  }

  get firstCycleComplete(): boolean {
    return this.#firstCycleComplete;
  }

  start(groups: readonly Game003WinSymbolGroup[]): void {
    this.assertNotDestroyed();
    if (this.#phase !== "idle") {
      throw new Error(
        `game003 win symbol loop cannot start from ${this.#phase}.`,
      );
    }
    if (groups.length === 0) {
      throw new Error("game003 win symbol loop requires at least one result.");
    }
    this.#groups = Object.freeze([...groups]);
    this.#currentIndex = 0;
    this.#firstCycleComplete = false;
    this.#pauseElapsedSeconds = 0;
    this.startCurrentGroup();
  }

  clear(): void {
    this.assertNotDestroyed();
    this.requestCurrentGroupNormal();
    this.hideAmount();
    this.#groups = [];
    this.#phase = "idle";
    this.#currentIndex = -1;
    this.#currentGroupAdvanced = false;
    this.#pauseElapsedSeconds = 0;
    this.#firstCycleComplete = false;
  }

  update(deltaSeconds: number): { readonly firstCycleComplete: boolean } {
    this.assertNotDestroyed();
    assertDeltaSeconds(deltaSeconds);
    if (this.#phase === "idle") {
      return Object.freeze({ firstCycleComplete: this.#firstCycleComplete });
    }
    if (this.#phase === "playing") {
      this.#reelRuntime.update(deltaSeconds);
      this.#currentGroupAdvanced = true;
      if (this.isCurrentGroupComplete()) {
        this.hideAmount();
        this.advanceGroup();
      }
      return Object.freeze({ firstCycleComplete: this.#firstCycleComplete });
    }

    this.#pauseElapsedSeconds = Math.min(
      this.#pauseElapsedSeconds + deltaSeconds,
      this.#config.cyclePauseSeconds,
    );
    if (this.#pauseElapsedSeconds >= this.#config.cyclePauseSeconds) {
      this.#currentIndex = 0;
      this.startCurrentGroup();
    }
    return Object.freeze({ firstCycleComplete: this.#firstCycleComplete });
  }

  getSnapshot(): Game003WinSymbolLoopSnapshot {
    const position = this.#amountText.visible
      ? Object.freeze({
          x: this.#amountText.position.x,
          y: this.#amountText.position.y,
        })
      : null;
    return Object.freeze({
      phase: this.#phase,
      firstCycleComplete: this.#firstCycleComplete,
      currentIndex: this.#currentIndex >= 0 ? this.#currentIndex : null,
      amountVisible: this.#amountText.visible,
      amountText: this.#amountText.text,
      amountPosition: position,
    });
  }

  destroy(): void {
    if (this.#phase === "destroyed") {
      return;
    }
    this.hideAmount();
    this.container.destroy({ children: true });
    this.#groups = [];
    this.#phase = "destroyed";
  }

  private startCurrentGroup(): void {
    const group = this.#groups[this.#currentIndex];
    if (!group) {
      throw new Error("game003 win symbol loop current result is missing.");
    }
    if (!Number.isFinite(group.cashWin) || group.cashWin <= 0) {
      throw new Error(
        `game003 win symbol result[${group.resultIndex}].cashWin must be a finite positive number.`,
      );
    }
    this.#reelRuntime.requestVisibleSymbolStates(group.positions, "win");
    const geometries = this.#reelRuntime.getVisibleSymbolGeometrySnapshots(
      group.positions,
    );
    if (geometries.length !== group.positions.length) {
      throw new Error(
        `game003 win symbol result[${group.resultIndex}] geometry count does not match positions.`,
      );
    }
    this.showAmount(group.cashWin, selectAmountAnchor(geometries));
    this.#phase = "playing";
    this.#currentGroupAdvanced = false;
    this.#pauseElapsedSeconds = 0;
  }

  private showAmount(
    cashWin: number,
    anchor: RenderVisibleSymbolGeometrySnapshot,
  ): void {
    const text = this.#formatter(cashWin);
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("game003 win symbol result amount formatter is invalid.");
    }
    this.#amountText.text = text;
    this.#amountText.position.set(
      anchor.centerX,
      anchor.centerY +
        anchor.cellHeight *
          this.#config.resultAmount.yOffsetRatioFromCellCenter,
    );
    this.#amountText.visible = true;
  }

  private hideAmount(): void {
    this.#amountText.text = "";
    this.#amountText.visible = false;
  }

  private isCurrentGroupComplete(): boolean {
    if (!this.#currentGroupAdvanced) {
      return false;
    }
    const group = this.#groups[this.#currentIndex];
    if (!group) {
      return true;
    }
    return this.#reelRuntime
      .getVisibleSymbolStateSnapshots(group.positions)
      .every(
        (snapshot) =>
          snapshot.requestedState === "normal" &&
          snapshot.resolvedState === "normal",
      );
  }

  private advanceGroup(): void {
    if (this.#currentIndex + 1 < this.#groups.length) {
      this.#currentIndex += 1;
      this.startCurrentGroup();
      return;
    }
    this.#firstCycleComplete = true;
    this.#phase = "cycle-pause";
    this.#currentIndex = -1;
    this.#currentGroupAdvanced = false;
    this.#pauseElapsedSeconds = 0;
  }

  private requestCurrentGroupNormal(): void {
    if (this.#phase !== "playing") {
      return;
    }
    const group = this.#groups[this.#currentIndex];
    if (!group) {
      return;
    }
    this.#reelRuntime.requestVisibleSymbolStates(group.positions, "normal");
  }

  private assertNotDestroyed(): void {
    if (this.#phase === "destroyed") {
      throw new Error("game003 win symbol loop was destroyed.");
    }
  }
}

function selectAmountAnchor(
  geometries: readonly RenderVisibleSymbolGeometrySnapshot[],
): RenderVisibleSymbolGeometrySnapshot {
  if (geometries.length === 0) {
    throw new Error(
      "game003 win symbol result must include at least one position.",
    );
  }
  const average = geometries.reduce(
    (sum, geometry) => ({
      x: sum.x + geometry.centerX / geometries.length,
      y: sum.y + geometry.centerY / geometries.length,
    }),
    { x: 0, y: 0 },
  );
  return [...geometries].sort((left, right) => {
    const leftDistance = squaredDistance(left, average);
    const rightDistance = squaredDistance(right, average);
    if (leftDistance !== rightDistance) {
      return leftDistance - rightDistance;
    }
    if (left.x !== right.x) {
      return left.x - right.x;
    }
    return left.y - right.y;
  })[0];
}

function squaredDistance(
  geometry: RenderVisibleSymbolGeometrySnapshot,
  point: { readonly x: number; readonly y: number },
): number {
  return (geometry.centerX - point.x) ** 2 + (geometry.centerY - point.y) ** 2;
}

function assertDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(
      "game003 win symbol loop deltaSeconds must be a finite non-negative number.",
    );
  }
}
