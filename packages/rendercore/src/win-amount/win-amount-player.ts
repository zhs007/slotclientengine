import type {
  WinAmountAnimationConfig,
  WinAmountAnimationInput,
  WinAmountAnimationLayout,
  WinAmountAnimationPhase,
  WinAmountAnimationPlayer,
  WinAmountAnimationUpdateResult,
  WinAmountAnimationTier,
} from "./types.js";
import {
  WinAmountTierEffect,
  type WinAmountVniPlayerFactory,
} from "./vni-tier-effect.js";
import { WinAmountStage } from "./win-amount-stage.js";

interface CountSegment {
  readonly phase: "minor-counting" | "major-counting" | "tier-counting";
  readonly textMode: "minor" | "major";
  readonly fromAmountRaw: number;
  readonly toAmountRaw: number;
  readonly durationSeconds: number;
  readonly tier?: WinAmountAnimationTier;
  elapsedSeconds: number;
}

type PlaybackStage = Omit<CountSegment, "elapsedSeconds">;

export interface CreateWinAmountAnimationPlayerOptions {
  readonly config: WinAmountAnimationConfig;
  readonly playerFactory?: WinAmountVniPlayerFactory;
}

export class DefaultWinAmountAnimationPlayer implements WinAmountAnimationPlayer {
  readonly #config: WinAmountAnimationConfig;
  readonly #stage: WinAmountStage;
  readonly #playerFactory?: WinAmountVniPlayerFactory;
  readonly #tiers: readonly WinAmountAnimationTier[];
  #phase: WinAmountAnimationPhase = "idle";
  #stages: readonly PlaybackStage[] = [];
  #stageIndex = -1;
  #segment: CountSegment | null = null;
  #displayedAmountRaw = 0;
  #activeTier: WinAmountTierEffect | null = null;
  #endingTiers: WinAmountTierEffect[] = [];
  #destroyed = false;

  constructor(options: CreateWinAmountAnimationPlayerOptions) {
    validateConfig(options.config);
    this.#config = options.config;
    this.#playerFactory = options.playerFactory;
    this.#tiers = Object.freeze(
      [...options.config.tiers].sort(
        (left, right) => left.thresholdMultiplier - right.thresholdMultiplier,
      ),
    );
    this.#stage = new WinAmountStage({
      layout: options.config.layout,
      textStyle: options.config.textStyle,
    });
  }

  get container() {
    return this.#stage.container;
  }

  start(input: WinAmountAnimationInput): void {
    this.assertNotDestroyed();
    if (this.isPlaying()) {
      throw new Error("win amount animation is already in progress.");
    }
    validateInput(input);
    this.clearPlayback();
    this.#displayedAmountRaw = 0;
    if (input.winAmountRaw === 0) {
      this.#phase = "complete";
      this.#stage.clear();
      return;
    }

    this.#stages = this.createPlaybackStages(input);
    this.startNextStage();
  }

  update(deltaSeconds: number): WinAmountAnimationUpdateResult {
    this.assertNotDestroyed();
    assertValidDeltaSeconds(deltaSeconds);
    if (!this.isPlaying()) {
      return this.createUpdateResult();
    }

    this.updateEffects(deltaSeconds);
    this.pruneCompletedEndingTiers();
    if (this.#phase === "dismissing") {
      this.finishDismissIfComplete();
    } else if (this.#segment) {
      this.advanceCountSegment(deltaSeconds);
    }
    return this.createUpdateResult();
  }

  requestAdvance(): void {
    this.assertNotDestroyed();
    if (!this.isPlaying()) {
      return;
    }
    if (!this.#segment) {
      if (this.#phase === "awaiting-dismiss") {
        this.requestDismiss();
      }
      return;
    }
    const segment = this.#segment;
    if (segment.phase === "tier-counting") {
      this.completeCurrentSegmentImmediately(segment);
      return;
    }

    const nextTierStageIndex = this.findNextTierStageIndex();
    if (nextTierStageIndex >= 0) {
      this.#segment = null;
      this.#stageIndex = nextTierStageIndex - 1;
      this.startNextStage();
      return;
    }

    this.jumpToFinalAmountAndAwaitDismiss();
  }

  requestDismiss(): void {
    this.assertNotDestroyed();
    if (!this.isPlaying()) {
      return;
    }
    this.#segment = null;
    if (this.#activeTier) {
      this.#activeTier.requestEnd();
      this.#phase = "dismissing";
      return;
    }
    this.completeAndHide();
  }

  dismissImmediately(): void {
    this.assertNotDestroyed();
    if (!this.isPlaying()) {
      return;
    }
    this.completeAndHide();
  }

  applyLayout(layout: WinAmountAnimationLayout): void {
    this.assertNotDestroyed();
    this.#stage.applyLayout(layout);
    this.#activeTier?.applyLayout(layout);
    for (const tier of this.#endingTiers) {
      tier.applyLayout(layout);
    }
  }

  isPlaying(): boolean {
    return this.#phase !== "idle" && this.#phase !== "complete";
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.clearPlayback();
    this.#stage.destroy();
  }

  private createPlaybackStages(
    input: WinAmountAnimationInput,
  ): readonly PlaybackStage[] {
    const stages: PlaybackStage[] = [];
    const minorThreshold =
      input.betAmountRaw * this.#config.thresholdMultipliers.minor;
    const firstTier = this.#tiers[0];
    const majorThreshold =
      input.betAmountRaw *
      (firstTier?.thresholdMultiplier ?? this.#config.thresholdMultipliers.big);
    const minorTarget = Math.min(input.winAmountRaw, minorThreshold);
    stages.push({
      phase: "minor-counting",
      textMode: "minor",
      fromAmountRaw: 0,
      toAmountRaw: minorTarget,
      durationSeconds: this.#config.minorCountDurationSeconds,
    });
    if (input.winAmountRaw <= minorThreshold) {
      return Object.freeze(stages);
    }

    const majorTarget = Math.min(input.winAmountRaw, majorThreshold);
    if (majorTarget > minorThreshold) {
      stages.push({
        phase: "major-counting",
        textMode: "major",
        fromAmountRaw: minorThreshold,
        toAmountRaw: majorTarget,
        durationSeconds: this.#config.majorCountDurationSeconds,
      });
    }

    for (let index = 0; index < this.#tiers.length; index += 1) {
      const tier = this.#tiers[index];
      const thresholdAmount = tier.thresholdMultiplier * input.betAmountRaw;
      if (input.winAmountRaw < thresholdAmount) {
        continue;
      }
      const nextTier = this.#tiers[index + 1];
      const nextThresholdAmount = nextTier
        ? nextTier.thresholdMultiplier * input.betAmountRaw
        : input.winAmountRaw;
      stages.push({
        phase: "tier-counting",
        textMode: "major",
        fromAmountRaw: thresholdAmount,
        toAmountRaw: Math.min(input.winAmountRaw, nextThresholdAmount),
        durationSeconds: tier.durationSeconds,
        tier,
      });
    }

    return Object.freeze(stages);
  }

  private startNextStage(): void {
    this.#stageIndex += 1;
    const stage = this.#stages[this.#stageIndex];
    if (!stage) {
      this.awaitDismiss();
      return;
    }
    this.#segment = { ...stage, elapsedSeconds: 0 };
    this.#phase = stage.phase;
    this.#displayedAmountRaw = stage.fromAmountRaw;
    if (stage.tier) {
      this.startTier(stage.tier);
    }
    this.renderText(stage.textMode);
  }

  private advanceCountSegment(deltaSeconds: number): void {
    const segment = this.#segment;
    if (!segment) {
      return;
    }
    segment.elapsedSeconds = Math.min(
      segment.elapsedSeconds + deltaSeconds,
      segment.durationSeconds,
    );
    const progress =
      segment.durationSeconds === 0
        ? 1
        : segment.elapsedSeconds / segment.durationSeconds;
    this.#displayedAmountRaw =
      segment.fromAmountRaw +
      (segment.toAmountRaw - segment.fromAmountRaw) * progress;
    this.renderText(segment.textMode);
    if (progress < 1) {
      return;
    }
    this.finishCurrentSegment(segment);
  }

  private finishCurrentSegment(segment: CountSegment): void {
    this.#segment = null;
    if (segment.tier) {
      if (this.hasNextStage()) {
        this.endActiveTierBehindNextStage();
        this.startNextStage();
        return;
      }
      this.awaitDismiss();
      return;
    }
    if (this.hasNextStage()) {
      this.startNextStage();
      return;
    }
    this.awaitDismiss();
  }

  private completeCurrentSegmentImmediately(segment: CountSegment): void {
    this.#displayedAmountRaw = segment.toAmountRaw;
    this.renderText(segment.textMode);
    this.finishCurrentSegment(segment);
  }

  private findNextTierStageIndex(): number {
    return this.#stages.findIndex(
      (stage, index) =>
        index > this.#stageIndex && stage.phase === "tier-counting",
    );
  }

  private jumpToFinalAmountAndAwaitDismiss(): void {
    const finalStage = this.#stages.at(-1);
    if (!finalStage) {
      this.awaitDismiss();
      return;
    }
    this.#segment = null;
    this.#stageIndex = this.#stages.length - 1;
    this.#displayedAmountRaw = finalStage.toAmountRaw;
    this.renderText(finalStage.textMode);
    this.awaitDismiss();
  }

  private hasNextStage(): boolean {
    return this.#stageIndex + 1 < this.#stages.length;
  }

  private awaitDismiss(): void {
    this.#segment = null;
    this.#phase = "awaiting-dismiss";
  }

  private finishDismissIfComplete(): void {
    if (!this.#activeTier) {
      this.completeAndHide();
      return;
    }
    if (!this.#activeTier.isComplete()) {
      return;
    }
    this.#activeTier.destroy();
    this.#activeTier = null;
    this.completeAndHide();
  }

  private endActiveTierBehindNextStage(): void {
    if (!this.#activeTier) {
      return;
    }
    this.#activeTier.requestEnd();
    this.#endingTiers.push(this.#activeTier);
    this.#activeTier = null;
  }

  private startTier(tier: WinAmountAnimationTier): void {
    if (this.#activeTier) {
      throw new Error(
        `win amount tier "${tier.id}" cannot start before "${this.#activeTier.id}" completed.`,
      );
    }
    const effect = new WinAmountTierEffect({
      tier,
      parent: this.#stage.effectLayer,
      layout: this.#config.layout,
      playerFactory: this.#playerFactory,
    });
    effect.start();
    this.#activeTier = effect;
  }

  private updateEffects(deltaSeconds: number): void {
    this.#activeTier?.update(deltaSeconds);
    for (const tier of this.#endingTiers) {
      tier.update(deltaSeconds);
    }
  }

  private pruneCompletedEndingTiers(): void {
    const remaining: WinAmountTierEffect[] = [];
    for (const tier of this.#endingTiers) {
      if (tier.isComplete()) {
        tier.destroy();
      } else {
        remaining.push(tier);
      }
    }
    this.#endingTiers = remaining;
  }

  private completeAndHide(): void {
    this.#activeTier?.destroy();
    this.#activeTier = null;
    for (const tier of this.#endingTiers) {
      tier.destroy();
    }
    this.#endingTiers = [];
    this.#segment = null;
    this.#stages = [];
    this.#stageIndex = -1;
    this.#stage.clear();
    this.#phase = "complete";
  }

  private clearPlayback(): void {
    this.#activeTier?.destroy();
    this.#activeTier = null;
    for (const tier of this.#endingTiers) {
      tier.destroy();
    }
    this.#endingTiers = [];
    this.#segment = null;
    this.#stages = [];
    this.#stageIndex = -1;
    this.#displayedAmountRaw = 0;
    this.#stage.clear();
    this.#phase = "idle";
  }

  private renderText(mode: "minor" | "major"): void {
    const formatted = this.#config.formatter(this.#displayedAmountRaw);
    if (typeof formatted !== "string" || formatted.trim().length === 0) {
      throw new Error("win amount formatter must return non-empty text.");
    }
    this.#stage.showText(formatted, mode);
  }

  private createUpdateResult(): WinAmountAnimationUpdateResult {
    return Object.freeze({
      completed: this.#phase === "complete" || this.#phase === "idle",
      phase: this.#phase,
      displayedAmountRaw: this.#displayedAmountRaw,
      ...(this.#activeTier ? { activeTierId: this.#activeTier.id } : {}),
    });
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error("win amount animation player was destroyed.");
    }
  }
}

export function createWinAmountAnimationPlayer(
  options: CreateWinAmountAnimationPlayerOptions,
): WinAmountAnimationPlayer {
  return new DefaultWinAmountAnimationPlayer(options);
}

function validateInput(input: WinAmountAnimationInput): void {
  if (!Number.isFinite(input.winAmountRaw) || input.winAmountRaw < 0) {
    throw new Error("winAmountRaw must be a finite non-negative number.");
  }
  if (!Number.isFinite(input.betAmountRaw) || input.betAmountRaw <= 0) {
    throw new Error("betAmountRaw must be a finite positive number.");
  }
}

function validateConfig(config: WinAmountAnimationConfig): void {
  for (const [label, value] of [
    ["minorCountDurationSeconds", config.minorCountDurationSeconds],
    ["majorCountDurationSeconds", config.majorCountDurationSeconds],
    ["thresholdMultipliers.minor", config.thresholdMultipliers.minor],
    ["thresholdMultipliers.big", config.thresholdMultipliers.big],
    ["thresholdMultipliers.super", config.thresholdMultipliers.super],
    ["thresholdMultipliers.mega", config.thresholdMultipliers.mega],
  ] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`win amount ${label} must be a finite positive number.`);
    }
  }
  if (
    !(
      config.thresholdMultipliers.big > config.thresholdMultipliers.minor &&
      config.thresholdMultipliers.super > config.thresholdMultipliers.big &&
      config.thresholdMultipliers.mega > config.thresholdMultipliers.super
    )
  ) {
    throw new Error(
      "win amount threshold multipliers must be strictly increasing.",
    );
  }
  if (config.tiers.length === 0) {
    throw new Error("win amount animation tiers must not be empty.");
  }
  for (const tier of config.tiers) {
    if (tier.durationSeconds < 5) {
      throw new Error(
        `win amount tier "${tier.id}" durationSeconds must be at least 5 seconds.`,
      );
    }
  }
}

function assertValidDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(
      "win amount deltaSeconds must be a finite non-negative number.",
    );
  }
}
