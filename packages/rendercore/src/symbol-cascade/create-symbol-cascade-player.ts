import { Container, Text } from "pixi.js";
import type { RenderVisibleSymbolGeometrySnapshot } from "../reel/index.js";
import type { SymbolCascadeWinPresentation } from "../symbol/index.js";
import {
  createCumulativeWinSummary,
  type CumulativeWinSummary,
} from "./cumulative-win-summary.js";
import type {
  CreateSymbolCascadePlayerOptions,
  PreparedSymbolCascade,
  SymbolCascadeGroup,
  SymbolCascadeGroupPositionContext,
  SymbolCascadePlayer,
  SymbolCascadeSnapshot,
} from "./types.js";

type Position = Readonly<{ readonly x: number; readonly y: number }>;

interface LegacyExecutionPlan {
  readonly mode: "legacy";
  readonly group: SymbolCascadeGroup;
  readonly winState: string;
  readonly removeState: string;
}

interface GroupExecutionPlan {
  readonly mode: "group";
  readonly group: SymbolCascadeGroup;
  readonly presentation: SymbolCascadeWinPresentation;
  readonly groupAmount: number;
  readonly winState: string;
  readonly removeState: string;
}

interface CollectItemPlan {
  readonly context: SymbolCascadeGroupPositionContext;
  readonly amount: number;
}

interface CompanionExecutionPlan {
  readonly positions: readonly Position[];
  readonly winState: string;
}

interface SequentialExecutionPlan {
  readonly mode: "sequentialCollect";
  readonly group: SymbolCascadeGroup;
  readonly presentation: SymbolCascadeWinPresentation;
  readonly groupAmount: number;
  readonly items: readonly CollectItemPlan[];
  readonly primaryPositions: readonly Position[];
  readonly companions: readonly CompanionExecutionPlan[];
  readonly startState: string;
  readonly loopState: string;
  readonly collectState: string;
  readonly removeState: string;
}

type ExecutionPlan =
  | LegacyExecutionPlan
  | GroupExecutionPlan
  | SequentialExecutionPlan;

export function createSymbolCascadePlayer(
  options: CreateSymbolCascadePlayerOptions,
): SymbolCascadePlayer {
  return new SymbolCascadePlayerModel(options);
}

class SymbolCascadePlayerModel implements SymbolCascadePlayer {
  readonly container = new Container();
  readonly #options: CreateSymbolCascadePlayerOptions;
  readonly #prepared = new WeakMap<object, readonly ExecutionPlan[]>();
  readonly #summary: CumulativeWinSummary | null;
  #amountTexts: Text[] = [];
  #plans: readonly ExecutionPlan[] = [];
  #phase: SymbolCascadeSnapshot["phase"] = "idle";
  #index = -1;
  #itemIndex = -1;
  #itemIncrementStarted = false;
  #emphasisElapsedSeconds = 0;

  constructor(options: CreateSymbolCascadePlayerOptions) {
    validateOptions(options);
    this.#options = options;
    this.#summary = options.winSummaryCollect
      ? createCumulativeWinSummary(options.winSummaryCollect)
      : null;
    if (this.#summary) this.container.addChild(this.#summary.text);
  }

  prepare(groups: readonly SymbolCascadeGroup[]): PreparedSymbolCascade {
    this.assertNotDestroyed();
    if (!Array.isArray(groups) || groups.length === 0) {
      throw new Error("symbol cascade groups must not be empty.");
    }
    const plans = this.#options.winSummaryCollect
      ? prepareSummaryExecutionPlans(groups, this.#options)
      : prepareLegacyExecutionPlans(groups, this.#options);
    const prepared = Object.freeze({
      groups: Object.freeze(plans.map((plan) => plan.group)),
      groupCount: plans.length,
    });
    this.#prepared.set(prepared, plans);
    return prepared;
  }

  start(prepared: PreparedSymbolCascade): void {
    this.assertNotDestroyed();
    if (this.#phase !== "idle" && this.#phase !== "complete") {
      throw new Error(`symbol cascade cannot start from ${this.#phase}.`);
    }
    const plans = this.#prepared.get(prepared);
    if (!plans) {
      throw new Error(
        "symbol cascade prepared input is not owned by this player.",
      );
    }
    this.#plans = plans;
    this.#index = -1;
    this.#itemIndex = -1;
    this.#itemIncrementStarted = false;
    this.startEmphasis();
    if (this.getEmphasisTotalSeconds() === 0) this.startPlanAt(0);
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
    this.#summary?.update(deltaSeconds);
    if (this.#phase === "emphasis") return this.updateEmphasis(deltaSeconds);
    const plan = this.currentPlan();
    if (plan.mode === "legacy" || plan.mode === "group") {
      return this.updateGroupPlan(plan);
    }
    return this.updateSequentialPlan(plan);
  }

  clear(): void {
    this.assertNotDestroyed();
    if (
      this.#phase !== "idle" &&
      this.#phase !== "complete" &&
      this.#phase !== "emphasis"
    ) {
      const positions = uniquePositions(
        this.#plans.flatMap((plan) => plan.group.positions),
      );
      if (positions.length > 0) {
        this.#options.target.requestVisibleSymbolStates(positions, "normal");
      }
    }
    this.#options.target.clearVisibleSymbolDimming();
    this.clearAmountTexts();
    this.#summary?.clear();
    this.#plans = [];
    this.#phase = "idle";
    this.#index = -1;
    this.#itemIndex = -1;
    this.#itemIncrementStarted = false;
    this.#emphasisElapsedSeconds = 0;
  }

  getSnapshot(): SymbolCascadeSnapshot {
    const plan = this.#plans[this.#index];
    const visibleAmounts = this.#amountTexts.filter((text) => text.visible);
    const summary = this.#summary?.getSnapshot() ?? {
      currentValue: 0,
      targetValue: 0,
      visible: false,
      counting: false,
    };
    const item =
      plan?.mode === "sequentialCollect" && this.#itemIndex >= 0
        ? plan.items[this.#itemIndex]
        : undefined;
    return Object.freeze({
      phase: this.#phase,
      currentIndex: this.#index >= 0 ? this.#index : null,
      componentName: plan?.group.componentName ?? null,
      resultIndex: plan?.group.resultIndex ?? null,
      amountVisible: visibleAmounts.length > 0,
      amountText: visibleAmounts.map((text) => text.text).join(" | "),
      currentItemIndex: item ? this.#itemIndex : null,
      currentItemPosition: item ? item.context.position : null,
      summaryCurrentValue: summary.currentValue,
      summaryTargetValue: summary.targetValue,
      summaryVisible: summary.visible,
      summaryCounting: summary.counting,
    });
  }

  destroy(): void {
    if (this.#phase === "destroyed") return;
    this.#options.target.clearVisibleSymbolDimming();
    this.clearAmountTexts();
    if (this.#summary) {
      this.container.removeChild(this.#summary.text);
      this.#summary.destroy();
    }
    this.container.destroy({ children: true });
    this.#plans = [];
    this.#phase = "destroyed";
  }

  private updateEmphasis(deltaSeconds: number): {
    readonly completed: boolean;
  } {
    this.#emphasisElapsedSeconds += deltaSeconds;
    const totalSeconds = this.getEmphasisTotalSeconds();
    if (this.#emphasisElapsedSeconds < totalSeconds) {
      this.#options.target.setVisibleSymbolDimming(
        this.getAllWinPositions(),
        this.resolveCurrentDimmingAlpha(),
      );
      return Object.freeze({ completed: false });
    }
    this.#options.target.clearVisibleSymbolDimming();
    return this.startPlanAt(0);
  }

  private updateGroupPlan(plan: LegacyExecutionPlan | GroupExecutionPlan): {
    readonly completed: boolean;
  } {
    if (this.#phase === "win") {
      const symbolComplete = statesReturnedToNormal(
        this.#options,
        plan.group.positions,
      );
      const summaryComplete =
        plan.mode === "legacy" || !this.#summary?.getSnapshot().counting;
      if (!symbolComplete || !summaryComplete) {
        return Object.freeze({ completed: false });
      }
      if (plan.group.removePositions.length > 0) {
        this.#options.target.requestVisibleSymbolStates(
          plan.group.removePositions,
          plan.removeState,
        );
        this.#phase = "remove";
        return Object.freeze({ completed: false });
      }
      this.hideAmount(this.#index);
      return this.startPlanAt(this.#index + 1);
    }
    if (this.#phase !== "remove") {
      throw new Error(
        `symbol cascade group cannot update from ${this.#phase}.`,
      );
    }
    if (!statesReturnedToNormal(this.#options, plan.group.removePositions)) {
      return Object.freeze({ completed: false });
    }
    this.#options.target.releaseVisibleSymbols(plan.group.removePositions);
    this.hideAmount(this.#index);
    return this.startPlanAt(this.#index + 1);
  }

  private updateSequentialPlan(plan: SequentialExecutionPlan): {
    readonly completed: boolean;
  } {
    if (this.#phase === "collect-start") {
      if (!statesReturnedToNormal(this.#options, plan.group.positions)) {
        return Object.freeze({ completed: false });
      }
      this.#options.target.requestVisibleSymbolStates(
        plan.primaryPositions,
        plan.loopState,
      );
      this.#phase = "collect-loop";
      return Object.freeze({ completed: false });
    }
    if (this.#phase === "collect-loop") {
      if (
        !statesResolvedAs(this.#options, plan.primaryPositions, plan.loopState)
      ) {
        return Object.freeze({ completed: false });
      }
      return this.startCollectItem(plan, 0);
    }
    const item = plan.items[this.#itemIndex];
    if (!item) throw new Error("symbol cascade collect item is missing.");
    if (this.#phase === "collect-item") {
      const [snapshot] = this.#options.target.getVisibleSymbolStateSnapshots([
        item.context.position,
      ]);
      if (!snapshot)
        throw new Error("symbol cascade collect snapshot is missing.");
      if (
        !this.#itemIncrementStarted &&
        snapshot.resolvedState === plan.collectState
      ) {
        this.requireSummary().incrementBy(item.amount);
        this.#itemIncrementStarted = true;
      }
      if (
        !this.#itemIncrementStarted ||
        snapshot.requestedState !== "normal" ||
        snapshot.resolvedState !== "normal" ||
        this.requireSummary().getSnapshot().counting
      ) {
        return Object.freeze({ completed: false });
      }
      this.#options.target.requestVisibleSymbolStates(
        [item.context.position],
        plan.removeState,
      );
      this.#phase = "collect-remove";
      return Object.freeze({ completed: false });
    }
    if (this.#phase !== "collect-remove") {
      throw new Error(
        `symbol cascade sequential collect cannot update from ${this.#phase}.`,
      );
    }
    if (!statesReturnedToNormal(this.#options, [item.context.position])) {
      return Object.freeze({ completed: false });
    }
    this.#options.target.releaseVisibleSymbols([item.context.position]);
    if (this.#itemIndex + 1 < plan.items.length) {
      return this.startCollectItem(plan, this.#itemIndex + 1);
    }
    this.hideAmount(this.#index);
    return this.startPlanAt(this.#index + 1);
  }

  private startCollectItem(
    plan: SequentialExecutionPlan,
    index: number,
  ): { readonly completed: boolean } {
    const item = plan.items[index];
    if (!item)
      throw new Error(`symbol cascade collect item[${index}] is missing.`);
    this.#itemIndex = index;
    this.#itemIncrementStarted = false;
    this.#options.target.requestVisibleSymbolStates(
      [item.context.position],
      plan.collectState,
    );
    this.#phase = "collect-item";
    return Object.freeze({ completed: false });
  }

  private startEmphasis(): void {
    this.#options.target.setVisibleSymbolDimming(this.getAllWinPositions(), 0);
    this.clearAmountTexts();
    const presentations = this.#plans.map((plan) => {
      const geometries = this.#options.target.getVisibleSymbolGeometrySnapshots(
        plan.group.positions,
      );
      const anchor = selectAmountAnchor(geometries);
      const value = this.#options.formatAmount(plan.group.amount);
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
  }

  private startPlanAt(index: number): { readonly completed: boolean } {
    if (index >= this.#plans.length) {
      this.#options.target.clearVisibleSymbolDimming();
      this.clearAmountTexts();
      this.#phase = "complete";
      this.#index = -1;
      this.#itemIndex = -1;
      return Object.freeze({ completed: true });
    }
    this.#index = index;
    this.#itemIndex = -1;
    const plan = this.currentPlan();
    if (plan.mode === "sequentialCollect") {
      this.#options.target.requestVisibleSymbolStates(
        plan.primaryPositions,
        plan.startState,
      );
      for (const companion of plan.companions) {
        this.#options.target.requestVisibleSymbolStates(
          companion.positions,
          companion.winState,
        );
      }
      this.#phase = "collect-start";
      return Object.freeze({ completed: false });
    }
    this.#options.target.requestVisibleSymbolStates(
      plan.group.positions,
      plan.winState,
    );
    if (plan.mode === "group") {
      this.requireSummary().incrementBy(plan.groupAmount);
    }
    this.#phase = "win";
    return Object.freeze({ completed: false });
  }

  private getEmphasisTotalSeconds(): number {
    return (
      this.#options.dimmingInSeconds +
      this.#options.emphasisSeconds +
      this.#options.dimmingOutSeconds
    );
  }

  private resolveCurrentDimmingAlpha(): number {
    const elapsed = this.#emphasisElapsedSeconds;
    const fadeIn = this.#options.dimmingInSeconds;
    const holdEnd = fadeIn + this.#options.emphasisSeconds;
    if (fadeIn > 0 && elapsed < fadeIn) {
      return this.#options.nonWinningDimmingAlpha * (elapsed / fadeIn);
    }
    if (elapsed <= holdEnd) return this.#options.nonWinningDimmingAlpha;
    const fadeOutElapsed = elapsed - holdEnd;
    if (this.#options.dimmingOutSeconds > 0) {
      return (
        this.#options.nonWinningDimmingAlpha *
        (1 - fadeOutElapsed / this.#options.dimmingOutSeconds)
      );
    }
    return 0;
  }

  private currentPlan(): ExecutionPlan {
    const plan = this.#plans[this.#index];
    if (!plan) throw new Error("symbol cascade current group is missing.");
    return plan;
  }

  private getAllWinPositions(): readonly Position[] {
    return uniquePositions(this.#plans.flatMap((plan) => plan.group.positions));
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

  private requireSummary(): CumulativeWinSummary {
    if (!this.#summary) {
      throw new Error("symbol cascade summary is not configured.");
    }
    return this.#summary;
  }

  private assertNotDestroyed(): void {
    if (this.#phase === "destroyed") {
      throw new Error("symbol cascade player was destroyed.");
    }
  }
}

function prepareLegacyExecutionPlans(
  groups: readonly SymbolCascadeGroup[],
  options: CreateSymbolCascadePlayerOptions,
): readonly ExecutionPlan[] {
  return Object.freeze(
    groups.map((group, index) => {
      validateGroup(group, index);
      assertCapabilities(options, group.positions, "win", index);
      assertCapabilities(options, group.removePositions, "remove", index);
      return Object.freeze({
        mode: "legacy",
        group,
        winState: "win",
        removeState: "remove",
      });
    }),
  );
}

function prepareSummaryExecutionPlans(
  groups: readonly SymbolCascadeGroup[],
  options: CreateSymbolCascadePlayerOptions,
): readonly ExecutionPlan[] {
  const summary = options.winSummaryCollect;
  if (!summary) throw new Error("symbol cascade summary options are missing.");
  const unresolved = groups.map((group, groupIndex) => {
    validateGroup(group, groupIndex);
    const groupContext = Object.freeze({ group, groupIndex });
    const groupSymbol = assertResolvedSymbol(
      summary.resolveGroupSymbol(groupContext),
      `symbol cascade group ${groupIndex} result`,
    );
    const presentation = summary.presentations[groupSymbol];
    if (!presentation) {
      throw new Error(
        `symbol cascade group ${groupIndex} result symbol "${groupSymbol}" has no cascade win presentation.`,
      );
    }
    const contexts = group.positions.map((position, positionIndex) =>
      Object.freeze({ group, groupIndex, position, positionIndex }),
    );
    const resolvedPositions = contexts.map((context) => {
      const symbol = assertResolvedSymbol(
        summary.resolveSymbol(context),
        `symbol cascade group ${groupIndex} position (${context.position.x},${context.position.y})`,
      );
      const positionPresentation = summary.presentations[symbol];
      if (!positionPresentation) {
        throw new Error(
          `symbol cascade group ${groupIndex} symbol "${symbol}" has no cascade win presentation.`,
        );
      }
      if (presentationsEqual(presentation, positionPresentation)) {
        return Object.freeze({
          context,
          symbol,
          positionPresentation,
          primary: true,
        });
      }
      const companionContext = Object.freeze({
        ...context,
        groupSymbol,
        symbol,
      });
      if (
        presentation.playback.mode !== "sequentialCollect" ||
        positionPresentation.playback.mode !== "group" ||
        !summary.allowCompanionPosition?.(companionContext)
      ) {
        throw new Error(
          `symbol cascade group ${groupIndex} mixes incompatible presentations.`,
        );
      }
      return Object.freeze({
        context,
        symbol,
        positionPresentation,
        primary: false,
      });
    });
    const primaryPositions = resolvedPositions.filter(
      (position) => position.primary,
    );
    if (primaryPositions.length === 0) {
      throw new Error(
        `symbol cascade group ${groupIndex} must contain at least one result-presentation position.`,
      );
    }
    const groupAmount = assertPositiveSafeInteger(
      summary.resolveGroupAmount(groupContext),
      `symbol cascade group ${groupIndex} amount`,
    );
    return {
      group,
      groupIndex,
      presentation,
      groupAmount,
      resolvedPositions,
    };
  });
  const sorted = unresolved
    .map((value, stableIndex) => ({ value, stableIndex }))
    .sort(
      (left, right) =>
        left.value.presentation.order - right.value.presentation.order ||
        left.stableIndex - right.stableIndex,
    )
    .map(({ value }) => value);
  const removableKeys = new Set(
    groups.flatMap((group) => group.removePositions.map(positionKey)),
  );
  const lastUse = new Map<string, number>();
  sorted.forEach(({ group }, index) => {
    for (const position of group.positions) {
      if (removableKeys.has(positionKey(position))) {
        lastUse.set(positionKey(position), index);
      }
    }
  });
  return Object.freeze(
    sorted.map((entry, sortedIndex) => {
      const removePositions = Object.freeze(
        entry.group.positions.filter(
          (position) => lastUse.get(positionKey(position)) === sortedIndex,
        ),
      );
      const group = Object.freeze({ ...entry.group, removePositions });
      const playback = entry.presentation.playback;
      if (playback.mode === "group") {
        assertCapabilities(
          options,
          group.positions,
          playback.winState,
          sortedIndex,
        );
        assertCapabilities(
          options,
          group.removePositions,
          playback.removeState,
          sortedIndex,
        );
        return Object.freeze({
          mode: "group",
          group,
          presentation: entry.presentation,
          groupAmount: entry.groupAmount,
          winState: playback.winState,
          removeState: playback.removeState,
        }) satisfies GroupExecutionPlan;
      }
      const primaryEntries = entry.resolvedPositions.filter(
        (position) => position.primary,
      );
      const primaryPositions = Object.freeze(
        primaryEntries.map(({ context }) => context.position),
      );
      const primaryKeys = validatePositions(
        primaryPositions,
        `symbol cascade group ${sortedIndex} primary positions`,
      );
      const removeKeys = validatePositions(
        group.removePositions,
        `symbol cascade group ${sortedIndex} removePositions`,
      );
      if (
        primaryKeys.size !== removeKeys.size ||
        [...primaryKeys].some((key) => !removeKeys.has(key))
      ) {
        throw new Error(
          `symbol cascade sequential group ${sortedIndex} must remove every item.`,
        );
      }
      const contexts = primaryEntries.map(({ context }) =>
        Object.freeze({
          group,
          groupIndex: entry.groupIndex,
          position: context.position,
          positionIndex: context.positionIndex,
        }),
      );
      const sortedContexts = summary.sortItems(Object.freeze(contexts));
      validateSortedContexts(contexts, sortedContexts, sortedIndex);
      const items = Object.freeze(
        sortedContexts.map((context) =>
          Object.freeze({
            context,
            amount: assertPositiveSafeInteger(
              summary.resolveItemAmount(context),
              `symbol cascade group ${sortedIndex} item amount`,
            ),
          }),
        ),
      );
      const itemTotal = items.reduce((sum, item) => sum + item.amount, 0);
      if (!Number.isSafeInteger(itemTotal) || itemTotal !== entry.groupAmount) {
        throw new Error(
          `symbol cascade group ${sortedIndex} item sum ${itemTotal} does not match group amount ${entry.groupAmount}.`,
        );
      }
      for (const state of [
        playback.startState,
        playback.loopState,
        playback.collectState,
      ]) {
        assertCapabilities(options, primaryPositions, state, sortedIndex);
      }
      assertCapabilities(
        options,
        group.removePositions,
        playback.removeState,
        sortedIndex,
      );
      const companionPositionsByState = new Map<string, Position[]>();
      for (const resolvedPosition of entry.resolvedPositions.filter(
        (position) => !position.primary,
      )) {
        const companionPlayback =
          resolvedPosition.positionPresentation.playback;
        if (companionPlayback.mode !== "group") {
          throw new Error(
            `symbol cascade group ${sortedIndex} companion playback must be group mode.`,
          );
        }
        const positions = companionPositionsByState.get(
          companionPlayback.winState,
        );
        if (positions) positions.push(resolvedPosition.context.position);
        else
          companionPositionsByState.set(companionPlayback.winState, [
            resolvedPosition.context.position,
          ]);
      }
      const companions = Object.freeze(
        [...companionPositionsByState].map(([winState, positions]) => {
          const frozenPositions = Object.freeze([...positions]);
          assertCapabilities(options, frozenPositions, winState, sortedIndex);
          return Object.freeze({ positions: frozenPositions, winState });
        }),
      );
      return Object.freeze({
        mode: "sequentialCollect",
        group,
        presentation: entry.presentation,
        groupAmount: entry.groupAmount,
        items,
        primaryPositions,
        companions,
        startState: playback.startState,
        loopState: playback.loopState,
        collectState: playback.collectState,
        removeState: playback.removeState,
      }) satisfies SequentialExecutionPlan;
    }),
  );
}

function validateGroup(group: SymbolCascadeGroup, index: number): void {
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
}

function assertCapabilities(
  options: CreateSymbolCascadePlayerOptions,
  positions: readonly Position[],
  state: string,
  groupIndex: number,
): void {
  for (const position of positions) {
    if (
      !options.target.hasVisibleSymbolStateCapability(
        position.x,
        position.y,
        state,
      )
    ) {
      throw new Error(
        `symbol cascade group ${groupIndex} position (${position.x},${position.y}) has no ${state} capability.`,
      );
    }
  }
}

function statesReturnedToNormal(
  options: CreateSymbolCascadePlayerOptions,
  positions: readonly Position[],
): boolean {
  return options.target
    .getVisibleSymbolStateSnapshots(positions)
    .every(
      (snapshot) =>
        snapshot.requestedState === "normal" &&
        snapshot.resolvedState === "normal",
    );
}

function statesResolvedAs(
  options: CreateSymbolCascadePlayerOptions,
  positions: readonly Position[],
  state: string,
): boolean {
  return options.target
    .getVisibleSymbolStateSnapshots(positions)
    .every(
      (snapshot) =>
        snapshot.requestedState === state && snapshot.resolvedState === state,
    );
}

function validateSortedContexts(
  input: readonly SymbolCascadeGroupPositionContext[],
  output: readonly SymbolCascadeGroupPositionContext[],
  groupIndex: number,
): void {
  if (!Array.isArray(output) || output.length !== input.length) {
    throw new Error(
      `symbol cascade group ${groupIndex} sorted items must preserve the item set.`,
    );
  }
  const expected = new Set(
    input.map((context) => positionKey(context.position)),
  );
  const actual = validatePositions(
    output.map((context) => context.position),
    `symbol cascade group ${groupIndex} sorted items`,
  );
  if (
    expected.size !== actual.size ||
    [...expected].some((key) => !actual.has(key))
  ) {
    throw new Error(
      `symbol cascade group ${groupIndex} sorted items must preserve the item set.`,
    );
  }
}

function presentationsEqual(
  left: SymbolCascadeWinPresentation,
  right: SymbolCascadeWinPresentation,
): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function assertPositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer.`);
  }
  return value;
}

function assertResolvedSymbol(value: string, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} symbol must be a non-empty string.`);
  }
  return value;
}

function validateOptions(options: CreateSymbolCascadePlayerOptions): void {
  if (
    !Number.isFinite(options.emphasisSeconds) ||
    options.emphasisSeconds < 0
  ) {
    throw new Error(
      "symbol cascade emphasisSeconds must be finite and non-negative.",
    );
  }
  for (const [label, value] of [
    ["dimmingInSeconds", options.dimmingInSeconds],
    ["dimmingOutSeconds", options.dimmingOutSeconds],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `symbol cascade ${label} must be finite and non-negative.`,
      );
    }
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
}

function validatePositions(
  positions: readonly Position[],
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
    const key = positionKey(position);
    if (keys.has(key))
      throw new Error(`${label} contains duplicate position ${key}.`);
    keys.add(key);
  }
  return keys;
}

function uniquePositions(positions: readonly Position[]): readonly Position[] {
  const unique = new Map<string, Position>();
  for (const position of positions) unique.set(positionKey(position), position);
  return Object.freeze([...unique.values()]);
}

function positionKey(position: Position): string {
  return `(${position.x},${position.y})`;
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
