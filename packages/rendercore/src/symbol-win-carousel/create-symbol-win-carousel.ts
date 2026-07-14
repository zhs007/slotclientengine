import { getComponentWinResultGroups } from "@slotclientengine/logiccore";
import { Container, Text } from "pixi.js";
import type { RenderVisibleSymbolGeometrySnapshot } from "../reel/index.js";
import type {
  CreateSymbolWinCarouselOptions,
  PreparedSymbolWinCarousel,
  SymbolWinCarousel,
  SymbolWinCarouselGroup,
  SymbolWinCarouselPhase,
  SymbolWinCarouselSnapshot,
  SymbolWinCarouselStartInput,
  SymbolWinCarouselStartResult,
  SymbolWinCarouselUpdateResult,
} from "./types.js";

export function createSymbolWinCarousel(
  options: CreateSymbolWinCarouselOptions,
): SymbolWinCarousel {
  return new SymbolWinCarouselModel(options);
}

class SymbolWinCarouselModel implements SymbolWinCarousel {
  readonly container = new Container();
  readonly #options: CreateSymbolWinCarouselOptions;
  readonly #amountText: Text;
  readonly #prepared = new WeakSet<object>();
  #groups: readonly SymbolWinCarouselGroup[] = [];
  #phase: SymbolWinCarouselPhase = "idle";
  #currentIndex = -1;
  #currentGroupAdvanced = false;
  #pauseElapsedSeconds = 0;
  #firstCycleComplete = false;

  constructor(options: CreateSymbolWinCarouselOptions) {
    validateOptions(options);
    this.#options = options;
    this.#amountText = new Text({
      text: "",
      style: {
        fontFamily: "Arial",
        fontSize: options.amountText.fontSize,
        fontWeight: "900",
        fill: options.amountText.fill,
        stroke: {
          color: options.amountText.stroke,
          width: options.amountText.strokeWidth,
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

  prepare(input: SymbolWinCarouselStartInput): PreparedSymbolWinCarousel {
    this.assertNotDestroyed();
    const componentNames = parseComponentNames(input.componentNames);
    const step = input.logic.getStep(input.stepIndex);
    const groups: SymbolWinCarouselGroup[] = [];

    for (const componentName of componentNames) {
      if (!step.hasComponent(componentName)) {
        continue;
      }
      const component = step.getComponent(componentName);
      if (!component || !component.hasBasicComponentData) {
        throw new Error(
          `symbol win component "${componentName}" must include basicComponentData.`,
        );
      }
      const componentGroups = getComponentWinResultGroups(step, componentName, {
        scene: input.scene,
      }).map((group) => {
        const amount = this.#options.resolveAmount({
          componentName,
          stepIndex: group.stepIndex,
          resultIndex: group.resultIndex,
          result: group.result,
        });
        assertPositiveFiniteNumber(
          amount,
          `symbol win component "${componentName}" result[${group.resultIndex}] amount`,
        );
        return Object.freeze({
          componentName,
          stepIndex: group.stepIndex,
          resultIndex: group.resultIndex,
          result: group.result,
          positions: group.positions,
          amount,
        });
      });
      this.#options.validateComponent?.({
        logic: input.logic,
        step,
        componentName,
        component,
        groups: componentGroups,
      });
      groups.push(...componentGroups);
    }

    const prepared = Object.freeze({
      groupCount: groups.length,
      groups: Object.freeze(groups),
    });
    this.#prepared.add(prepared);
    return prepared;
  }

  start(prepared: PreparedSymbolWinCarousel): SymbolWinCarouselStartResult {
    this.assertNotDestroyed();
    if (this.#phase !== "idle") {
      throw new Error(`symbol win carousel cannot start from ${this.#phase}.`);
    }
    if (!this.#prepared.has(prepared as object)) {
      throw new Error(
        "symbol win carousel prepared input is not owned by this carousel.",
      );
    }
    if (prepared.groupCount !== prepared.groups.length) {
      throw new Error("symbol win carousel prepared group count is invalid.");
    }
    if (prepared.groupCount === 0) {
      return Object.freeze({ started: false });
    }
    this.#groups = prepared.groups;
    this.#currentIndex = 0;
    this.#firstCycleComplete = false;
    this.#pauseElapsedSeconds = 0;
    this.startCurrentGroup();
    return Object.freeze({ started: true });
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

  update(deltaSeconds: number): SymbolWinCarouselUpdateResult {
    this.assertNotDestroyed();
    assertNonNegativeFiniteNumber(deltaSeconds, "deltaSeconds");
    if (this.#phase === "idle") {
      return Object.freeze({ firstCycleComplete: this.#firstCycleComplete });
    }
    if (this.#phase === "playing") {
      this.#options.target.update(deltaSeconds);
      this.#currentGroupAdvanced = true;
      if (this.isCurrentGroupComplete()) {
        this.hideAmount();
        this.advanceGroup();
      }
      return Object.freeze({ firstCycleComplete: this.#firstCycleComplete });
    }

    this.#pauseElapsedSeconds = Math.min(
      this.#pauseElapsedSeconds + deltaSeconds,
      this.#options.cyclePauseSeconds,
    );
    if (this.#pauseElapsedSeconds >= this.#options.cyclePauseSeconds) {
      this.#currentIndex = 0;
      this.startCurrentGroup();
    }
    return Object.freeze({ firstCycleComplete: this.#firstCycleComplete });
  }

  getSnapshot(): SymbolWinCarouselSnapshot {
    const group = this.#groups[this.#currentIndex];
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
      componentName: group?.componentName ?? null,
      resultIndex: group?.resultIndex ?? null,
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
      throw new Error("symbol win carousel current result is missing.");
    }
    this.#options.target.requestVisibleSymbolStates(group.positions, "win");
    const geometries = this.#options.target.getVisibleSymbolGeometrySnapshots(
      group.positions,
    );
    if (geometries.length !== group.positions.length) {
      throw new Error(
        `symbol win component "${group.componentName}" result[${group.resultIndex}] geometry count does not match positions.`,
      );
    }
    this.showAmount(group.amount, selectAmountAnchor(geometries));
    this.#phase = "playing";
    this.#currentGroupAdvanced = false;
    this.#pauseElapsedSeconds = 0;
  }

  private showAmount(
    amount: number,
    anchor: RenderVisibleSymbolGeometrySnapshot,
  ): void {
    const text = this.#options.formatAmount(amount);
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("symbol win carousel amount formatter is invalid.");
    }
    this.#amountText.text = text;
    this.#amountText.position.set(
      anchor.centerX,
      anchor.centerY +
        anchor.cellHeight * this.#options.amountText.yOffsetRatioFromCellCenter,
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
    const snapshots = this.#options.target.getVisibleSymbolStateSnapshots(
      group.positions,
    );
    if (snapshots.length !== group.positions.length) {
      throw new Error(
        `symbol win component "${group.componentName}" result[${group.resultIndex}] state count does not match positions.`,
      );
    }
    return snapshots.every(
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
    if (group) {
      this.#options.target.requestVisibleSymbolStates(
        group.positions,
        "normal",
      );
    }
  }

  private assertNotDestroyed(): void {
    if (this.#phase === "destroyed") {
      throw new Error("symbol win carousel was destroyed.");
    }
  }
}

function selectAmountAnchor(
  geometries: readonly RenderVisibleSymbolGeometrySnapshot[],
): RenderVisibleSymbolGeometrySnapshot {
  if (geometries.length === 0) {
    throw new Error(
      "symbol win carousel result must include at least one position.",
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
    const distanceDifference =
      squaredDistance(left, average) - squaredDistance(right, average);
    if (Math.abs(distanceDifference) > Number.EPSILON) {
      return distanceDifference;
    }
    return left.x - right.x || left.y - right.y;
  })[0];
}

function squaredDistance(
  geometry: RenderVisibleSymbolGeometrySnapshot,
  point: { readonly x: number; readonly y: number },
): number {
  return (geometry.centerX - point.x) ** 2 + (geometry.centerY - point.y) ** 2;
}

function parseComponentNames(value: readonly string[]): readonly string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("symbol win carousel componentNames must not be empty.");
  }
  const seen = new Set<string>();
  return Object.freeze(
    value.map((name, index) => {
      if (typeof name !== "string" || name.trim().length === 0) {
        throw new Error(
          `symbol win carousel componentNames[${index}] must be a non-empty string.`,
        );
      }
      if (seen.has(name)) {
        throw new Error(
          `symbol win carousel componentNames contains duplicate "${name}".`,
        );
      }
      seen.add(name);
      return name;
    }),
  );
}

function validateOptions(options: CreateSymbolWinCarouselOptions): void {
  assertPositiveFiniteNumber(
    options.cyclePauseSeconds,
    "symbol win carousel cyclePauseSeconds",
  );
  assertNonNegativeFiniteNumber(
    options.amountText.strokeWidth,
    "symbol win carousel amountText.strokeWidth",
  );
  assertPositiveFiniteNumber(
    options.amountText.fontSize,
    "symbol win carousel amountText.fontSize",
  );
  assertNonNegativeFiniteNumber(
    Math.abs(options.amountText.yOffsetRatioFromCellCenter),
    "symbol win carousel amountText.yOffsetRatioFromCellCenter",
  );
  for (const [label, value] of [
    ["fill", options.amountText.fill],
    ["stroke", options.amountText.stroke],
  ] as const) {
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(`symbol win carousel amountText.${label} is invalid.`);
    }
  }
}

function assertPositiveFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
}

function assertNonNegativeFiniteNumber(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
}
