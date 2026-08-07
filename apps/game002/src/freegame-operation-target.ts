import type { WinResultPosition } from "@slotclientengine/gameframeworks";
import type {
  PreparedGridCellVisibleOccurrenceTransferBatch,
  PreparedVisibleOccurrenceReplacement,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import type { Game002FreeGameOperationPayload } from "./game002-operation-compiler.js";
import type { Game002ReelRuntime } from "./game-demo.js";
import type { Game002BackgroundPlayer } from "./scene-layout-presentation.js";
import { assertGame002ReelVisualMatchesTarget } from "./game-demo.js";

type Activity =
  | "idle"
  | "trigger"
  | "transition"
  | "spin"
  | "af-feature"
  | "af-change"
  | "co-feature"
  | "co-transfer"
  | "win"
  | "popup";

export class Game002FreeGameOperationTarget {
  readonly #runtime: Game002ReelRuntime;
  readonly #cascadePlayer: SymbolCascadePlayer;
  readonly #winAmountPlayer: WinAmountAnimationPlayer;
  readonly #backgroundPlayer: Game002BackgroundPlayer;
  readonly #codes: Readonly<{ AF: number; CN: number; CO: number; BN: number }>;
  #activity: Activity = "idle";
  #payload: Game002FreeGameOperationPayload | null = null;
  #complete = true;
  #failure: Error | null = null;
  #symbolPlaybackGeneration = 0;
  #symbolPlaybackComplete = true;
  #symbolPlaybackAbort: AbortController | null = null;
  #afReplacements: PreparedVisibleOccurrenceReplacement[] = [];
  #coReplacements: PreparedVisibleOccurrenceReplacement[] = [];
  #coTransfers: PreparedGridCellVisibleOccurrenceTransferBatch | null = null;
  #coProgress = 0;

  constructor(options: {
    readonly runtime: Game002ReelRuntime;
    readonly cascadePlayer: SymbolCascadePlayer;
    readonly winAmountPlayer: WinAmountAnimationPlayer;
    readonly backgroundPlayer: Game002BackgroundPlayer;
    readonly codes: Readonly<{
      AF: number;
      CN: number;
      CO: number;
      BN: number;
    }>;
  }) {
    this.#runtime = options.runtime;
    this.#cascadePlayer = options.cascadePlayer;
    this.#winAmountPlayer = options.winAmountPlayer;
    this.#backgroundPlayer = options.backgroundPlayer;
    this.#codes = options.codes;
  }

  preflight(payload: Game002FreeGameOperationPayload): void {
    if (payload.kind === "transition") {
      if (
        !this.#backgroundPlayer.prepareModeTransition ||
        !this.#backgroundPlayer.requestMode
      )
        throw new Error("game002 FreeGame mode transition support is missing.");
      return;
    }
    const capabilities = this.#runtime.config.symbolAnimationCapabilities;
    const requireState = (symbol: string, state: string) => {
      if (!capabilities[symbol]?.includes(state))
        throw new Error(
          `game002 FreeGame symbol ${symbol} has no "${state}" state.`,
        );
    };
    if (payload.kind === "trigger") requireState("WL", "win");
    if (payload.kind === "af") {
      requireState("AF", "feature");
      requireState("AF", "change");
    }
    if (payload.kind === "co") {
      requireState("CO", "feature");
      for (const symbol of ["WL", "CN"])
        for (const state of ["feature1", "feature2"])
          requireState(symbol, state);
    }
  }

  start(payload: Game002FreeGameOperationPayload): void {
    if (this.#activity !== "idle")
      throw new Error("game002 FreeGame operation target is already active.");
    this.#payload = payload;
    this.#complete = false;
    this.#failure = null;
    switch (payload.kind) {
      case "trigger":
        this.startAnimation(payload.positions, "win");
        this.#activity = "trigger";
        return;
      case "transition":
        this.#activity = "transition";
        void this.#backgroundPlayer.prepareModeTransition!(payload.mode)
          .then(() => this.#backgroundPlayer.requestMode!(payload.mode))
          .then(() => {
            this.#complete = true;
          })
          .catch((error: unknown) => {
            this.#failure = asError(error);
          });
        return;
      case "spin":
        this.#runtime.startSelectiveSpin({
          sourceScene: payload.spin.inputScene,
          targetScene: payload.spin.spinScene,
          targetValues: payload.spin.spinValues,
          positions: payload.spin.spinPositions,
          sceneName: "game002 FreeGame operation spin",
        });
        this.#activity = "spin";
        return;
      case "af":
        this.startAf(payload);
        return;
      case "co":
        this.startCo(payload);
        return;
      case "win":
        this.#cascadePlayer.start(this.#cascadePlayer.prepare(payload.groups));
        this.#activity = "win";
        return;
      case "popup":
        this.#winAmountPlayer.start(payload);
        this.#activity = "popup";
        return;
    }
  }

  update(deltaSeconds: number): { readonly completed: boolean } {
    if (this.#failure) throw this.#failure;
    const payload = this.#payload;
    if (!payload)
      throw new Error("game002 FreeGame operation payload is missing.");
    if (this.#activity === "transition") return this.finishIfComplete();
    if (
      [
        "trigger",
        "spin",
        "af-feature",
        "af-change",
        "co-feature",
        "co-transfer",
      ].includes(this.#activity)
    )
      this.#runtime.update(deltaSeconds);
    if (this.#activity === "trigger" && payload.kind === "trigger") {
      if (!this.animationComplete()) return { completed: false };
      this.#runtime.requestVisibleSymbolStates(
        payload.positions,
        "normal",
        "immediate",
      );
      return this.finish();
    }
    if (this.#activity === "spin" && payload.kind === "spin") {
      if (this.#runtime.isSpinning()) return { completed: false };
      assertGame002ReelVisualMatchesTarget(
        this.#runtime.getVisualSnapshot(),
        payload.spin.spinScene,
        "game002 FreeGame operation spin",
      );
      return this.finish();
    }
    if (payload.kind === "af") return this.updateAf(payload);
    if (payload.kind === "co") return this.updateCo(payload, deltaSeconds);
    if (this.#activity === "win" && payload.kind === "win") {
      if (!this.#cascadePlayer.update(deltaSeconds).completed)
        return { completed: false };
      this.#cascadePlayer.clear();
      return this.finish();
    }
    if (this.#activity === "popup" && payload.kind === "popup") {
      if (this.#winAmountPlayer.update(deltaSeconds).phase !== "complete")
        return { completed: false };
      return this.finish();
    }
    throw new Error(
      `game002 FreeGame operation activity ${this.#activity} is invalid.`,
    );
  }

  cleanup(): void {
    this.#symbolPlaybackGeneration += 1;
    this.#symbolPlaybackAbort?.abort(
      new Error("game002 FreeGame symbol playback was interrupted by cleanup."),
    );
    this.#symbolPlaybackAbort = null;
    this.#symbolPlaybackComplete = true;
    for (const replacement of this.#afReplacements) replacement.rollback();
    for (const replacement of this.#coReplacements) replacement.rollback();
    this.#coTransfers?.rollback();
    this.#afReplacements = [];
    this.#coReplacements = [];
    this.#coTransfers = null;
    this.#cascadePlayer.clear();
    this.#winAmountPlayer.dismissImmediately();
    this.#payload = null;
    this.#activity = "idle";
    this.#complete = true;
    this.#failure = null;
  }

  private startAf(
    payload: Extract<Game002FreeGameOperationPayload, { kind: "af" }>,
  ): void {
    const prepared: PreparedVisibleOccurrenceReplacement[] = [];
    try {
      for (const position of payload.af.positions) {
        this.#runtime.setVisibleSymbolImageStringText(
          position.x,
          position.y,
          "free-spins",
          String(payload.af.addedFreeSpins),
        );
        prepared.push(
          this.#runtime.prepareVisibleOccurrenceReplacement({
            x: position.x,
            y: position.y,
            expectedCode: this.#codes.AF,
            outputCode: this.#codes.CN,
            outputPresentationValue:
              payload.af.outputValues[position.x]![position.y]!,
          }),
        );
      }
    } catch (error) {
      for (const replacement of prepared) replacement.rollback();
      throw error;
    }
    this.#afReplacements = prepared;
    this.startAnimation(payload.af.positions, "feature");
    this.#activity = "af-feature";
  }

  private updateAf(
    payload: Extract<Game002FreeGameOperationPayload, { kind: "af" }>,
  ) {
    if (this.#activity === "af-feature") {
      if (!this.animationComplete()) return { completed: false };
      this.startAnimation(payload.af.positions, "change");
      this.#activity = "af-change";
      return { completed: false };
    }
    if (!this.animationComplete()) return { completed: false };
    for (const replacement of this.#afReplacements) replacement.commit();
    this.#afReplacements = [];
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      payload.af.outputScene,
      "game002 FreeGame AF operation",
    );
    return this.finish();
  }

  private startCo(
    payload: Extract<Game002FreeGameOperationPayload, { kind: "co" }>,
  ): void {
    const replacements: PreparedVisibleOccurrenceReplacement[] = [];
    try {
      for (const position of payload.co.coPositions)
        replacements.push(
          this.#runtime.prepareVisibleOccurrenceReplacement({
            x: position.x,
            y: position.y,
            expectedCode: this.#codes.CO,
            outputCode: this.#codes.CN,
            outputPresentationValue:
              payload.co.outputValues[position.x]![position.y]!,
          }),
        );
      this.#coTransfers = this.#runtime.prepareVisibleOccurrenceTransferBatch({
        transfers: payload.co.transfers.map((transfer) => ({
          source: transfer.source,
          target: transfer.target,
          expectedSourceCode: transfer.sourceCode,
          expectedTargetCode: transfer.targetCode,
          sourceReplacementCode: this.#codes.BN,
          sourceReplacementPresentationValue: null,
        })),
      });
    } catch (error) {
      for (const replacement of replacements) replacement.rollback();
      this.#coTransfers?.rollback();
      this.#coTransfers = null;
      throw error;
    }
    this.#coReplacements = replacements;
    this.startMixedCoAnimation(
      payload.co.coPositions,
      payload.co.sourcePositions,
    );
    this.#activity = "co-feature";
  }

  private updateCo(
    payload: Extract<Game002FreeGameOperationPayload, { kind: "co" }>,
    deltaSeconds: number,
  ) {
    if (this.#activity === "co-feature") {
      if (!this.animationComplete()) return { completed: false };
      this.startAnimation(payload.co.sourcePositions, "feature2");
      this.#coTransfers?.start();
      this.#coProgress = 0;
      this.#activity = "co-transfer";
      return { completed: false };
    }
    if (!this.animationComplete()) {
      this.#coProgress = Math.min(0.9, this.#coProgress + deltaSeconds * 2);
      this.#coTransfers?.setProgress(this.#coProgress);
      return { completed: false };
    }
    this.#coTransfers?.setProgress(1);
    this.#coTransfers?.commit();
    this.#coTransfers = null;
    for (const replacement of this.#coReplacements) replacement.commit();
    this.#coReplacements = [];
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      payload.co.outputScene,
      "game002 FreeGame CO operation",
    );
    return this.finish();
  }

  private startMixedCoAnimation(
    co: readonly WinResultPosition[],
    sources: readonly WinResultPosition[],
  ): void {
    this.startSymbolPlayback((signal) =>
      Promise.all([
        this.#runtime.playVisibleSymbolStates(co, "feature", {
          transitionMode: "immediate",
          completion: "once-complete",
          signal,
        }),
        this.#runtime.playVisibleSymbolStates(sources, "feature1", {
          transitionMode: "immediate",
          completion: "once-complete",
          signal,
        }),
      ]).then(() => undefined),
    );
  }

  private startAnimation(
    positions: readonly WinResultPosition[],
    state: string,
  ): void {
    this.startSymbolPlayback((signal) =>
      this.#runtime.playVisibleSymbolStates(positions, state, {
        transitionMode: "immediate",
        completion: "once-complete",
        signal,
      }),
    );
  }

  private startSymbolPlayback(
    start: (signal: AbortSignal) => Promise<void>,
  ): void {
    if (!this.#symbolPlaybackComplete) {
      throw new Error(
        "game002 FreeGame cannot start symbol playback while another playback is pending.",
      );
    }
    this.#symbolPlaybackAbort?.abort();
    const controller = new AbortController();
    const generation = ++this.#symbolPlaybackGeneration;
    this.#symbolPlaybackAbort = controller;
    this.#symbolPlaybackComplete = false;
    try {
      void this.trackSymbolPlayback(generation, start(controller.signal));
    } catch (error) {
      controller.abort(error);
      this.#symbolPlaybackAbort = null;
      this.#symbolPlaybackComplete = true;
      throw error;
    }
  }

  private async trackSymbolPlayback(
    generation: number,
    playback: Promise<void>,
  ): Promise<void> {
    try {
      await playback;
      if (generation !== this.#symbolPlaybackGeneration) return;
      this.#symbolPlaybackComplete = true;
      this.#symbolPlaybackAbort = null;
    } catch (error) {
      if (generation !== this.#symbolPlaybackGeneration) return;
      this.#symbolPlaybackComplete = true;
      this.#symbolPlaybackAbort = null;
      this.#failure = asError(error);
    }
  }

  private animationComplete(): boolean {
    if (this.#failure) throw this.#failure;
    return this.#symbolPlaybackComplete;
  }

  private finishIfComplete() {
    if (this.#failure) throw this.#failure;
    return this.#complete ? this.finish() : { completed: false };
  }

  private finish() {
    this.#payload = null;
    this.#activity = "idle";
    this.#complete = true;
    return { completed: true };
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
