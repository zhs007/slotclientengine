import { Container, Text } from "pixi.js";
import type { RenderVisibleSymbolGeometrySnapshot } from "../reel/index.js";
import type {
  CreateSymbolCascadePlayerOptions,
  PreparedSymbolCascade,
  SymbolCascadeGroup,
  SymbolCascadePlayer,
  SymbolCascadeSnapshot,
} from "./types.js";

export function createSymbolCascadePlayer(
  options: CreateSymbolCascadePlayerOptions,
): SymbolCascadePlayer {
  return new SymbolCascadePlayerModel(options);
}

class SymbolCascadePlayerModel implements SymbolCascadePlayer {
  readonly container = new Container();
  readonly #options: CreateSymbolCascadePlayerOptions;
  readonly #prepared = new WeakSet<object>();
  #amountTexts: Text[] = [];
  #groups: readonly SymbolCascadeGroup[] = [];
  #phase: SymbolCascadeSnapshot["phase"] = "idle";
  #index = -1;
  #advanced = false;
  #emphasisElapsedSeconds = 0;

  constructor(options: CreateSymbolCascadePlayerOptions) {
    if (
      !Number.isFinite(options.emphasisSeconds) ||
      options.emphasisSeconds < 0
    ) {
      throw new Error(
        "symbol cascade emphasisSeconds must be finite and non-negative.",
      );
    }
    if (
      !Number.isFinite(options.nonWinningDimmingAlpha) ||
      options.nonWinningDimmingAlpha < 0 ||
      options.nonWinningDimmingAlpha > 1
    ) {
      throw new Error(
        "symbol cascade nonWinningDimmingAlpha must be between 0 and 1.",
      );
    }
    this.#options = options;
  }

  prepare(groups: readonly SymbolCascadeGroup[]): PreparedSymbolCascade {
    this.assertNotDestroyed();
    if (!Array.isArray(groups) || groups.length === 0) {
      throw new Error("symbol cascade groups must not be empty.");
    }
    const normalized = Object.freeze(
      groups.map((group, index) => {
        if (group.positions.length === 0) {
          throw new Error(
            `symbol cascade group ${index} positions must not be empty.`,
          );
        }
        if (!Number.isFinite(group.amount) || group.amount <= 0) {
          throw new Error(
            `symbol cascade group ${index} amount must be finite and positive.`,
          );
        }
        const positionKeys = validatePositions(
          group.positions,
          `symbol cascade group ${index} positions`,
        );
        const removeKeys = validatePositions(
          group.removePositions,
          `symbol cascade group ${index} removePositions`,
        );
        for (const key of removeKeys) {
          if (!positionKeys.has(key)) {
            throw new Error(
              `symbol cascade group ${index} remove position ${key} is not a win position.`,
            );
          }
        }
        for (const position of group.positions) {
          if (
            !this.#options.target.hasVisibleSymbolStateCapability(
              position.x,
              position.y,
              "win",
            )
          ) {
            throw new Error(
              `symbol cascade group ${index} position (${position.x},${position.y}) has no win capability.`,
            );
          }
        }
        for (const position of group.removePositions) {
          if (
            !this.#options.target.hasVisibleSymbolStateCapability(
              position.x,
              position.y,
              "remove",
            )
          ) {
            throw new Error(
              `symbol cascade group ${index} position (${position.x},${position.y}) has no remove capability.`,
            );
          }
        }
        return group;
      }),
    );
    const prepared = Object.freeze({
      groups: normalized,
      groupCount: normalized.length,
    });
    this.#prepared.add(prepared);
    return prepared;
  }

  start(prepared: PreparedSymbolCascade): void {
    this.assertNotDestroyed();
    if (this.#phase !== "idle" && this.#phase !== "complete") {
      throw new Error(`symbol cascade cannot start from ${this.#phase}.`);
    }
    if (!this.#prepared.has(prepared)) {
      throw new Error(
        "symbol cascade prepared input is not owned by this player.",
      );
    }
    this.#groups = prepared.groups;
    this.#index = -1;
    if (this.#groups.length === 0) {
      this.#phase = "complete";
      return;
    }
    this.startEmphasis();
    if (this.#options.emphasisSeconds === 0) this.startWin();
  }

  update(deltaSeconds: number): { readonly completed: boolean } {
    this.assertNotDestroyed();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error(
        "symbol cascade deltaSeconds must be finite and non-negative.",
      );
    }
    if (this.#phase === "idle" || this.#phase === "complete") {
      return Object.freeze({ completed: this.#phase === "complete" });
    }
    this.#options.target.update(deltaSeconds);
    if (this.#phase === "emphasis") {
      this.#emphasisElapsedSeconds += deltaSeconds;
      if (this.#emphasisElapsedSeconds < this.#options.emphasisSeconds) {
        return Object.freeze({ completed: false });
      }
      this.startWin();
      return Object.freeze({ completed: false });
    }
    this.#advanced = true;
    const positions =
      this.#phase === "win"
        ? this.getAllWinPositions()
        : this.currentGroup().removePositions;
    const complete = this.#options.target
      .getVisibleSymbolStateSnapshots(positions)
      .every(
        (snapshot) =>
          snapshot.requestedState === "normal" &&
          snapshot.resolvedState === "normal",
      );
    if (!this.#advanced || !complete)
      return Object.freeze({ completed: false });
    if (this.#phase === "win") {
      return this.startRemoveAt(0);
    }
    const group = this.currentGroup();
    this.#options.target.releaseVisibleSymbols(group.removePositions);
    this.hideAmount(this.#index);
    return this.startRemoveAt(this.#index + 1);
  }

  clear(): void {
    this.assertNotDestroyed();
    if (this.#phase === "win" || this.#phase === "remove") {
      this.#options.target.requestVisibleSymbolStates(
        this.#phase === "win"
          ? this.getAllWinPositions()
          : this.currentGroup().removePositions,
        "normal",
      );
    }
    this.#options.target.clearVisibleSymbolDimming();
    this.clearAmountTexts();
    this.#groups = [];
    this.#phase = "idle";
    this.#index = -1;
    this.#advanced = false;
    this.#emphasisElapsedSeconds = 0;
  }

  getSnapshot(): SymbolCascadeSnapshot {
    const group = this.#groups[this.#index];
    const visibleAmounts = this.#amountTexts.filter((text) => text.visible);
    return Object.freeze({
      phase: this.#phase,
      currentIndex: this.#index >= 0 ? this.#index : null,
      componentName: group?.componentName ?? null,
      resultIndex: group?.resultIndex ?? null,
      amountVisible: visibleAmounts.length > 0,
      amountText: visibleAmounts.map((text) => text.text).join(" | "),
    });
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    this.#options.target.clearVisibleSymbolDimming();
    this.clearAmountTexts();
    this.container.destroy({ children: true });
    this.#groups = [];
    this.#phase = "destroyed";
  }

  private startEmphasis(): void {
    this.#options.target.setVisibleSymbolDimming(
      this.getAllWinPositions(),
      this.#options.nonWinningDimmingAlpha,
    );
    this.clearAmountTexts();
    const presentations = this.#groups.map((group) => {
      const geometries = this.#options.target.getVisibleSymbolGeometrySnapshots(
        group.positions,
      );
      const anchor = selectAmountAnchor(geometries);
      const value = this.#options.formatAmount(group.amount);
      if (typeof value !== "string" || value.trim().length === 0) {
        throw new Error("symbol cascade amount formatter is invalid.");
      }
      return { anchor, value };
    });
    this.#amountTexts = presentations.map(({ anchor, value }) => {
      const text = this.createAmountText(value);
      text.position.set(
        anchor.centerX,
        anchor.centerY +
          anchor.cellHeight *
            this.#options.amountText.yOffsetRatioFromCellCenter,
      );
      this.container.addChild(text);
      return text;
    });
    this.#phase = "emphasis";
    this.#emphasisElapsedSeconds = 0;
    this.#advanced = false;
  }

  private startWin(): void {
    this.#options.target.requestVisibleSymbolStates(
      this.getAllWinPositions(),
      "win",
    );
    this.#phase = "win";
    this.#advanced = false;
  }

  private startRemoveAt(index: number): { readonly completed: boolean } {
    let nextIndex = index;
    while (nextIndex < this.#groups.length) {
      const group = this.#groups[nextIndex];
      if (group.removePositions.length > 0) {
        this.#index = nextIndex;
        this.#options.target.requestVisibleSymbolStates(
          group.removePositions,
          "remove",
        );
        this.#phase = "remove";
        this.#advanced = false;
        return Object.freeze({ completed: false });
      }
      this.hideAmount(nextIndex);
      nextIndex += 1;
    }
    this.#options.target.clearVisibleSymbolDimming();
    this.clearAmountTexts();
    this.#phase = "complete";
    this.#index = -1;
    return Object.freeze({ completed: true });
  }

  private currentGroup(): SymbolCascadeGroup {
    const group = this.#groups[this.#index];
    if (!group) throw new Error("symbol cascade current group is missing.");
    return group;
  }

  private getAllWinPositions(): readonly {
    readonly x: number;
    readonly y: number;
  }[] {
    const positions = new Map<
      string,
      { readonly x: number; readonly y: number }
    >();
    for (const group of this.#groups) {
      for (const position of group.positions) {
        positions.set(`${position.x},${position.y}`, position);
      }
    }
    return Object.freeze([...positions.values()]);
  }

  private createAmountText(value: string): Text {
    const text = new Text({
      text: value,
      style: {
        fontFamily: "Arial",
        fontSize: this.#options.amountText.fontSize,
        fontWeight: "900",
        fill: this.#options.amountText.fill,
        stroke: {
          color: this.#options.amountText.stroke,
          width: this.#options.amountText.strokeWidth,
        },
        align: "center",
      },
    });
    text.anchor.set(0.5);
    return text;
  }

  private hideAmount(index: number): void {
    const amount = this.#amountTexts[index];
    if (amount) amount.visible = false;
  }

  private clearAmountTexts(): void {
    for (const text of this.#amountTexts) text.destroy();
    this.#amountTexts = [];
  }

  private assertNotDestroyed(): void {
    if (this.#phase === "destroyed") {
      throw new Error("symbol cascade player was destroyed.");
    }
  }
}

function validatePositions(
  positions: readonly { readonly x: number; readonly y: number }[],
  label: string,
): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const [index, position] of positions.entries()) {
    if (
      !Number.isSafeInteger(position.x) ||
      position.x < 0 ||
      !Number.isSafeInteger(position.y) ||
      position.y < 0
    ) {
      throw new Error(`${label}[${index}] must be a non-negative x/y pair.`);
    }
    const key = `(${position.x},${position.y})`;
    if (keys.has(key)) {
      throw new Error(`${label} contains duplicate position ${key}.`);
    }
    keys.add(key);
  }
  return keys;
}

function selectAmountAnchor(
  geometries: readonly RenderVisibleSymbolGeometrySnapshot[],
): RenderVisibleSymbolGeometrySnapshot {
  if (geometries.length === 0) {
    throw new Error("symbol cascade group must include geometry.");
  }
  const average = geometries.reduce(
    (sum, geometry) => ({
      x: sum.x + geometry.centerX / geometries.length,
      y: sum.y + geometry.centerY / geometries.length,
    }),
    { x: 0, y: 0 },
  );
  return [...geometries].sort((left, right) => {
    const leftDistance =
      (left.centerX - average.x) ** 2 + (left.centerY - average.y) ** 2;
    const rightDistance =
      (right.centerX - average.x) ** 2 + (right.centerY - average.y) ** 2;
    return leftDistance - rightDistance || left.x - right.x || left.y - right.y;
  })[0];
}
