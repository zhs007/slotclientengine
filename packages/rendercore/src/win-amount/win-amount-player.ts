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
  readonly phase: "minor-counting" | "major-counting";
  readonly fromAmountRaw: number;
  readonly toAmountRaw: number;
  readonly durationSeconds: number;
  elapsedSeconds: number;
}

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
  #input: WinAmountAnimationInput | null = null;
  #segment: CountSegment | null = null;
  #displayedAmountRaw = 0;
  #activeTier: WinAmountTierEffect | null = null;
  #endingTiers: WinAmountTierEffect[] = [];
  #nextTierIndex = 0;
  #finalTierEndRequested = false;
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
    this.#input = input;
    this.#displayedAmountRaw = 0;
    if (input.winAmountRaw === 0) {
      this.#phase = "complete";
      this.#stage.clear();
      return;
    }

    const minorTarget = Math.min(
      input.winAmountRaw,
      input.betAmountRaw * this.#config.thresholdMultipliers.minor,
    );
    this.#segment = {
      phase: "minor-counting",
      fromAmountRaw: 0,
      toAmountRaw: minorTarget,
      durationSeconds: this.#config.minorCountDurationSeconds,
      elapsedSeconds: 0,
    };
    this.#phase = "minor-counting";
    this.renderText("minor");
  }

  update(deltaSeconds: number): WinAmountAnimationUpdateResult {
    this.assertNotDestroyed();
    assertValidDeltaSeconds(deltaSeconds);
    if (!this.isPlaying()) {
      return this.createUpdateResult();
    }

    this.updateEffects(deltaSeconds);
    if (this.#segment) {
      this.advanceCountSegment(deltaSeconds);
    } else if (this.#activeTier && !this.#finalTierEndRequested) {
      this.#activeTier.requestEnd();
      this.#finalTierEndRequested = true;
      this.#phase = "tier-ending";
    }

    this.pruneCompletedEndingTiers();
    if (this.canComplete()) {
      this.complete();
    }
    return this.createUpdateResult();
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
    return (
      this.#phase === "minor-counting" ||
      this.#phase === "major-counting" ||
      this.#phase === "tier-ending"
    );
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.clearPlayback();
    this.#stage.destroy();
  }

  private advanceCountSegment(deltaSeconds: number): void {
    const segment = this.#segment;
    if (!segment || !this.#input) {
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
    this.renderText(segment.phase === "minor-counting" ? "minor" : "major");
    this.triggerReachedTiers();
    if (progress < 1) {
      return;
    }
    if (
      segment.phase === "minor-counting" &&
      this.#input.winAmountRaw > segment.toAmountRaw
    ) {
      this.#segment = {
        phase: "major-counting",
        fromAmountRaw: segment.toAmountRaw,
        toAmountRaw: this.#input.winAmountRaw,
        durationSeconds: this.#config.majorCountDurationSeconds,
        elapsedSeconds: 0,
      };
      this.#phase = "major-counting";
      this.renderText("major");
      return;
    }
    this.#segment = null;
    if (this.#activeTier) {
      this.#activeTier.requestEnd();
      this.#finalTierEndRequested = true;
      this.#phase = "tier-ending";
      return;
    }
    this.complete();
  }

  private triggerReachedTiers(): void {
    if (!this.#input) {
      return;
    }
    while (this.#nextTierIndex < this.#tiers.length) {
      const tier = this.#tiers[this.#nextTierIndex];
      const thresholdAmount =
        tier.thresholdMultiplier * this.#input.betAmountRaw;
      if (this.#displayedAmountRaw < thresholdAmount) {
        return;
      }
      this.startTier(tier);
      this.#nextTierIndex += 1;
    }
  }

  private startTier(tier: WinAmountAnimationTier): void {
    if (this.#activeTier) {
      this.#activeTier.requestEnd();
      this.#endingTiers.push(this.#activeTier);
    }
    const effect = new WinAmountTierEffect({
      tier,
      parent: this.#stage.effectLayer,
      layout: this.#config.layout,
      playerFactory: this.#playerFactory,
    });
    effect.start();
    this.#activeTier = effect;
    this.#finalTierEndRequested = false;
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

  private canComplete(): boolean {
    return (
      !this.#segment &&
      this.#endingTiers.length === 0 &&
      (!this.#activeTier || this.#activeTier.isComplete())
    );
  }

  private complete(): void {
    this.#activeTier?.destroy();
    this.#activeTier = null;
    for (const tier of this.#endingTiers) {
      tier.destroy();
    }
    this.#endingTiers = [];
    this.#segment = null;
    this.#phase = "complete";
    if (this.#input) {
      this.#displayedAmountRaw = this.#input.winAmountRaw;
      this.renderText(
        this.#input.winAmountRaw >
          this.#input.betAmountRaw * this.#config.thresholdMultipliers.minor
          ? "major"
          : "minor",
      );
    }
  }

  private clearPlayback(): void {
    this.#activeTier?.destroy();
    this.#activeTier = null;
    for (const tier of this.#endingTiers) {
      tier.destroy();
    }
    this.#endingTiers = [];
    this.#segment = null;
    this.#input = null;
    this.#nextTierIndex = 0;
    this.#finalTierEndRequested = false;
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
}

function assertValidDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(
      "win amount deltaSeconds must be a finite non-negative number.",
    );
  }
}
