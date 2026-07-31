import type { WinResultPosition } from "@slotclientengine/gameframeworks";
import type {
  PreparedGridCellVisibleOccurrenceTransferBatch,
  PreparedVisibleOccurrenceReplacement,
  SymbolCascadeGroup,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import type { Game002ReelRuntime } from "./game-demo.js";
import type { Game002BackgroundPlayer } from "./scene-layout-skin.js";
import {
  type Game002FreeGameCoPlan,
  type Game002FreeGamePlan,
  type Game002FreeGameSpinPlan,
} from "./freegame-plan.js";
import { resolveGame002WinResultAmount } from "./win-symbol-carousel-config.js";
import { assertGame002ReelVisualMatchesTarget } from "./game-demo.js";

type PlaybackStage =
  | "preparing-enter"
  | "trigger-win"
  | "enter-transition"
  | "spin"
  | "af-feature"
  | "af-change"
  | "co-feature"
  | "co-transfer"
  | "final-win"
  | "popup"
  | "preparing-exit"
  | "exit-transition"
  | "complete"
  | "failed";

export interface Game002FreeGamePlayback {
  start(): Promise<void>;
  update(deltaSeconds: number): void;
  isRunning(): boolean;
  cleanup(): void;
}

export function createGame002FreeGamePlayback(options: {
  readonly plan: Game002FreeGamePlan;
  readonly runtime: Game002ReelRuntime;
  readonly cascadePlayer: SymbolCascadePlayer;
  readonly winAmountPlayer: WinAmountAnimationPlayer;
  readonly backgroundPlayer: Game002BackgroundPlayer;
  readonly betAmountRaw: number;
  readonly winAmountRaw: number;
  readonly symbolCodes: Readonly<{
    AF: number;
    CN: number;
    CO: number;
    BN: number;
  }>;
}): Game002FreeGamePlayback {
  return new DefaultGame002FreeGamePlayback(options);
}

class DefaultGame002FreeGamePlayback implements Game002FreeGamePlayback {
  readonly #plan: Game002FreeGamePlan;
  readonly #runtime: Game002ReelRuntime;
  readonly #cascadePlayer: SymbolCascadePlayer;
  readonly #winAmountPlayer: WinAmountAnimationPlayer;
  readonly #backgroundPlayer: Game002BackgroundPlayer;
  readonly #betAmountRaw: number;
  readonly #winAmountRaw: number;
  readonly #codes: Readonly<{ AF: number; CN: number; CO: number; BN: number }>;
  #stage: PlaybackStage = "complete";
  #spinCursor = 0;
  #resolve: (() => void) | null = null;
  #reject: ((error: Error) => void) | null = null;
  #modeRequestComplete = false;
  #animationBaselines = new Map<string, number>();
  #afReplacements: PreparedVisibleOccurrenceReplacement[] = [];
  #coReplacements: PreparedVisibleOccurrenceReplacement[] = [];
  #coTransfers: PreparedGridCellVisibleOccurrenceTransferBatch | null = null;
  #coTransferProgress = 0;

  constructor(options: {
    readonly plan: Game002FreeGamePlan;
    readonly runtime: Game002ReelRuntime;
    readonly cascadePlayer: SymbolCascadePlayer;
    readonly winAmountPlayer: WinAmountAnimationPlayer;
    readonly backgroundPlayer: Game002BackgroundPlayer;
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
    readonly symbolCodes: Readonly<{
      AF: number;
      CN: number;
      CO: number;
      BN: number;
    }>;
  }) {
    this.#plan = options.plan;
    this.#runtime = options.runtime;
    this.#cascadePlayer = options.cascadePlayer;
    this.#winAmountPlayer = options.winAmountPlayer;
    this.#backgroundPlayer = options.backgroundPlayer;
    this.#betAmountRaw = options.betAmountRaw;
    this.#winAmountRaw = options.winAmountRaw;
    this.#codes = options.symbolCodes;
  }

  start(): Promise<void> {
    if (this.isRunning())
      return Promise.reject(new Error("game002 FreeGame is already running."));
    if (this.getMode() !== "BaseGame")
      return Promise.reject(
        new Error("game002 FreeGame must start in BaseGame mode."),
      );
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      this.#plan.entryScene,
      "game002 FreeGame entry",
    );
    this.preflight();
    this.#stage = "preparing-enter";
    this.#spinCursor = 0;
    this.#modeRequestComplete = false;
    const completion = new Promise<void>((resolve, reject) => {
      this.#resolve = resolve;
      this.#reject = reject;
    });
    void this.prepareModeTransition("FreeGame")
      .then(() => {
        if (this.#stage !== "preparing-enter") return;
        this.startAnimation(this.#plan.triggerPositions, "win");
        this.#stage = "trigger-win";
      })
      .catch((error) => this.fail(asError(error)));
    return completion;
  }

  update(deltaSeconds: number): void {
    if (!this.isRunning()) return;
    try {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
        throw new Error(
          "game002 FreeGame deltaSeconds must be finite and non-negative.",
        );
      if (
        this.#stage === "trigger-win" ||
        this.#stage === "spin" ||
        this.#stage === "af-feature" ||
        this.#stage === "af-change" ||
        this.#stage === "co-feature" ||
        this.#stage === "co-transfer"
      )
        this.#runtime.update(deltaSeconds);
      if (this.#stage === "trigger-win") {
        if (!this.animationComplete(this.#plan.triggerPositions)) return;
        this.#runtime.requestVisibleSymbolStates(
          this.#plan.triggerPositions,
          "normal",
          "immediate",
        );
        this.#stage = "enter-transition";
        this.#modeRequestComplete = false;
        void this.requestMode("FreeGame")
          .then(() => {
            this.#modeRequestComplete = true;
          })
          .catch((error) => this.fail(asError(error)));
        return;
      }
      if (this.#stage === "enter-transition") {
        if (!this.#modeRequestComplete) return;
        this.startSpin();
        return;
      }
      if (this.#stage === "spin") {
        if (this.#runtime.isSpinning()) return;
        const spin = this.currentSpin();
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          spin.spinScene,
          `game002 FreeGame step[${spin.stepIndex}] spin`,
        );
        if (spin.af) this.startAf(spin);
        else if (spin.co) this.startCo(spin);
        else this.completeSpin(spin);
        return;
      }
      if (this.#stage === "af-feature") {
        const spin = this.currentSpin();
        if (!spin.af || !this.animationComplete(spin.af.positions)) return;
        this.startAnimation(spin.af.positions, "change");
        this.#stage = "af-change";
        return;
      }
      if (this.#stage === "af-change") {
        const spin = this.currentSpin();
        if (!spin.af || !this.animationComplete(spin.af.positions)) return;
        for (const replacement of this.#afReplacements) replacement.commit();
        this.#afReplacements = [];
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          spin.af.outputScene,
          `game002 FreeGame step[${spin.stepIndex}] AF`,
        );
        if (spin.co) this.startCo(spin);
        else this.completeSpin(spin);
        return;
      }
      if (this.#stage === "co-feature") {
        const spin = this.currentSpin();
        const co = requireCo(spin);
        if (!this.animationComplete([...co.coPositions, ...co.sourcePositions]))
          return;
        this.startAnimation(co.sourcePositions, "feature2");
        this.#coTransfers?.start();
        this.#coTransferProgress = 0;
        this.#stage = "co-transfer";
        return;
      }
      if (this.#stage === "co-transfer") {
        const spin = this.currentSpin();
        const co = requireCo(spin);
        if (!this.animationComplete(co.sourcePositions)) {
          this.#coTransferProgress = Math.min(
            0.9,
            this.#coTransferProgress + deltaSeconds * 2,
          );
          this.#coTransfers?.setProgress(this.#coTransferProgress);
          return;
        }
        this.#coTransfers?.setProgress(1);
        this.#coTransfers?.commit();
        this.#coTransfers = null;
        for (const replacement of this.#coReplacements) replacement.commit();
        this.#coReplacements = [];
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          co.outputScene,
          `game002 FreeGame step[${spin.stepIndex}] CO`,
        );
        this.completeSpin(spin);
        return;
      }
      if (this.#stage === "final-win") {
        if (!this.#cascadePlayer.update(deltaSeconds).completed) return;
        this.#cascadePlayer.clear();
        if (this.#winAmountRaw <= 0) {
          this.prepareExit();
          return;
        }
        this.#winAmountPlayer.start({
          betAmountRaw: this.#betAmountRaw,
          winAmountRaw: this.#winAmountRaw,
        });
        this.#stage = "popup";
        return;
      }
      if (this.#stage === "popup") {
        const result = this.#winAmountPlayer.update(deltaSeconds);
        if (result.phase !== "complete") return;
        this.prepareExit();
        return;
      }
      if (this.#stage === "exit-transition") {
        if (!this.#modeRequestComplete) return;
        assertGame002ReelVisualMatchesTarget(
          this.#runtime.getVisualSnapshot(),
          this.#plan.finalScene,
          "game002 FreeGame exit",
        );
        this.complete();
      }
    } catch (error) {
      this.fail(asError(error));
    }
  }

  isRunning(): boolean {
    return this.#stage !== "complete" && this.#stage !== "failed";
  }

  cleanup(): void {
    if (!this.isRunning()) return;
    this.fail(new Error("game002 FreeGame playback was cleaned up."));
  }

  private preflight(): void {
    this.requireSymbolState("WL", "win");
    this.requireSymbolState("AF", "feature");
    this.requireSymbolState("AF", "change");
    this.requireSymbolState("CO", "feature");
    this.requireSymbolState("WL", "feature1");
    this.requireSymbolState("WL", "feature2");
    this.requireSymbolState("CN", "feature1");
    this.requireSymbolState("CN", "feature2");
    this.createFinalWinGroups();
  }

  private requireSymbolState(symbol: string, state: string): void {
    if (
      !this.#runtime.config.symbolAnimationCapabilities[symbol]?.includes(state)
    )
      throw new Error(
        `game002 FreeGame symbol ${symbol} has no "${state}" state.`,
      );
  }

  private startSpin(): void {
    const spin = this.currentSpin();
    this.#runtime.startSelectiveSpin({
      sourceScene: spin.inputScene,
      targetScene: spin.spinScene,
      targetValues: spin.spinValues,
      positions: spin.spinPositions,
      sceneName: `game002 FreeGame step[${spin.stepIndex}] selective spin`,
    });
    this.#stage = "spin";
  }

  private startAf(spin: Game002FreeGameSpinPlan): void {
    const af = spin.af;
    if (!af) throw new Error("game002 FreeGame AF plan is missing.");
    const prepared: PreparedVisibleOccurrenceReplacement[] = [];
    try {
      for (const position of af.positions) {
        this.#runtime.setVisibleSymbolImageStringText(
          position.x,
          position.y,
          "free-spins",
          String(af.addedFreeSpins),
        );
        prepared.push(
          this.#runtime.prepareVisibleOccurrenceReplacement({
            x: position.x,
            y: position.y,
            expectedCode: this.#codes.AF,
            outputCode: this.#codes.CN,
            outputPresentationValue: af.outputValues[position.x]![position.y]!,
          }),
        );
      }
    } catch (error) {
      for (const replacement of prepared) replacement.rollback();
      throw error;
    }
    this.#afReplacements = prepared;
    this.startAnimation(af.positions, "feature");
    this.#stage = "af-feature";
  }

  private startCo(spin: Game002FreeGameSpinPlan): void {
    const co = requireCo(spin);
    const replacements: PreparedVisibleOccurrenceReplacement[] = [];
    try {
      for (const position of co.coPositions)
        replacements.push(
          this.#runtime.prepareVisibleOccurrenceReplacement({
            x: position.x,
            y: position.y,
            expectedCode: this.#codes.CO,
            outputCode: this.#codes.CN,
            outputPresentationValue: co.outputValues[position.x]![position.y]!,
          }),
        );
      this.#coTransfers = this.#runtime.prepareVisibleOccurrenceTransferBatch({
        transfers: co.transfers.map((transfer) =>
          Object.freeze({
            source: transfer.source,
            target: transfer.target,
            expectedSourceCode: transfer.sourceCode,
            expectedTargetCode: transfer.targetCode,
            sourceReplacementCode: this.#codes.BN,
            sourceReplacementPresentationValue: null,
          }),
        ),
      });
    } catch (error) {
      for (const replacement of replacements) replacement.rollback();
      this.#coTransfers?.rollback();
      this.#coTransfers = null;
      throw error;
    }
    this.#coReplacements = replacements;
    this.startAnimation(
      [...co.coPositions, ...co.sourcePositions],
      "feature",
      new Set(co.coPositions.map(positionKey)),
    );
    this.#stage = "co-feature";
  }

  private startAnimation(
    positions: readonly WinResultPosition[],
    state: string,
    coPositions?: ReadonlySet<string>,
  ): void {
    if (coPositions) {
      const co = positions.filter((position) =>
        coPositions.has(positionKey(position)),
      );
      const sources = positions.filter(
        (position) => !coPositions.has(positionKey(position)),
      );
      this.#runtime.requestVisibleSymbolStates(co, state, "immediate");
      this.#runtime.requestVisibleSymbolStates(
        sources,
        "feature1",
        "immediate",
      );
    } else
      this.#runtime.requestVisibleSymbolStates(positions, state, "immediate");
    this.#animationBaselines.clear();
    for (const snapshot of this.#runtime.getVisibleSymbolStateSnapshots(
      positions,
    ))
      this.#animationBaselines.set(
        `${snapshot.x},${snapshot.y}`,
        snapshot.onceCompletionCount ?? 0,
      );
  }

  private animationComplete(positions: readonly WinResultPosition[]): boolean {
    return this.#runtime
      .getVisibleSymbolStateSnapshots(positions)
      .every((snapshot) => {
        const baseline = this.#animationBaselines.get(
          `${snapshot.x},${snapshot.y}`,
        );
        if (baseline === undefined)
          throw new Error(
            `game002 FreeGame animation baseline is missing for (${snapshot.x},${snapshot.y}).`,
          );
        return (snapshot.onceCompletionCount ?? 0) > baseline;
      });
  }

  private completeSpin(spin: Game002FreeGameSpinPlan): void {
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      spin.outputScene,
      `game002 FreeGame step[${spin.stepIndex}] output`,
    );
    if (spin.winResults.length > 0) {
      const prepared = this.#cascadePlayer.prepare(this.createFinalWinGroups());
      this.#cascadePlayer.start(prepared);
      this.#stage = "final-win";
      return;
    }
    this.#spinCursor += 1;
    this.startSpin();
  }

  private createFinalWinGroups(): readonly SymbolCascadeGroup[] {
    const spin = this.#plan.spins.at(-1);
    if (!spin || spin.winResults.length === 0)
      throw new Error("game002 FreeGame final win is missing.");
    return Object.freeze(
      spin.winResults.map((result, resultIndex) => {
        const positions = parsePositions(result.pos, spin.outputScene);
        const base = Object.freeze({
          componentName: "fg-win",
          stepIndex: spin.stepIndex,
          resultIndex,
          result,
          positions,
          amount: resolveGame002WinResultAmount({
            componentName: "fg-win",
            stepIndex: spin.stepIndex,
            resultIndex,
            result,
          }),
        });
        return Object.freeze({
          ...base,
          removePositions: Object.freeze([]),
          retainPrimaryPositionsAfterCollect: true,
        });
      }),
    );
  }

  private prepareExit(): void {
    this.#stage = "preparing-exit";
    void this.prepareModeTransition("BaseGame")
      .then(() => {
        if (this.#stage !== "preparing-exit") return;
        this.#stage = "exit-transition";
        this.#modeRequestComplete = false;
        void this.requestMode("BaseGame")
          .then(() => {
            this.#modeRequestComplete = true;
          })
          .catch((error) => this.fail(asError(error)));
      })
      .catch((error) => this.fail(asError(error)));
  }

  private currentSpin(): Game002FreeGameSpinPlan {
    const spin = this.#plan.spins[this.#spinCursor];
    if (!spin)
      throw new Error(
        `game002 FreeGame spin cursor ${this.#spinCursor} is out of range.`,
      );
    return spin;
  }

  private getMode(): string {
    const getMode = this.#backgroundPlayer.getMode;
    if (!getMode)
      throw new Error("game002 scene-layout player has no mode support.");
    return getMode();
  }

  private prepareModeTransition(modeId: string): Promise<void> {
    const prepare = this.#backgroundPlayer.prepareModeTransition;
    if (!prepare)
      return Promise.reject(
        new Error(
          "game002 scene-layout player has no transition prepare support.",
        ),
      );
    return prepare(modeId);
  }

  private requestMode(modeId: string): Promise<void> {
    const request = this.#backgroundPlayer.requestMode;
    if (!request)
      return Promise.reject(
        new Error("game002 scene-layout player has no mode request support."),
      );
    return request(modeId);
  }

  private complete(): void {
    const resolve = this.#resolve;
    this.#stage = "complete";
    this.#resolve = null;
    this.#reject = null;
    resolve?.();
  }

  private fail(error: Error): void {
    if (this.#stage === "failed" || this.#stage === "complete") return;
    for (const replacement of this.#afReplacements) replacement.rollback();
    for (const replacement of this.#coReplacements) replacement.rollback();
    this.#coTransfers?.rollback();
    this.#afReplacements = [];
    this.#coReplacements = [];
    this.#coTransfers = null;
    this.#cascadePlayer.clear();
    this.#winAmountPlayer.dismissImmediately();
    const reject = this.#reject;
    this.#stage = "failed";
    this.#resolve = null;
    this.#reject = null;
    reject?.(error);
  }
}

function requireCo(spin: Game002FreeGameSpinPlan): Game002FreeGameCoPlan {
  if (!spin.co)
    throw new Error(`game002 FreeGame step[${spin.stepIndex}] CO is missing.`);
  return spin.co;
}

function parsePositions(
  raw: readonly number[],
  scene: readonly (readonly number[])[],
): readonly WinResultPosition[] {
  if (raw.length === 0 || raw.length % 2 !== 0)
    throw new Error("game002 fg-win result.pos must contain x/y pairs.");
  const positions: WinResultPosition[] = [];
  for (let index = 0; index < raw.length; index += 2) {
    const x = raw[index]!;
    const y = raw[index + 1]!;
    if (
      !Number.isSafeInteger(x) ||
      !Number.isSafeInteger(y) ||
      x < 0 ||
      y < 0 ||
      scene[x]?.[y] === undefined
    )
      throw new Error(
        `game002 fg-win result position (${String(x)},${String(y)}) is invalid.`,
      );
    positions.push(Object.freeze({ x, y }));
  }
  return Object.freeze(positions);
}

function positionKey(position: WinResultPosition): string {
  return `${position.x},${position.y}`;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
