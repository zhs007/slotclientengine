import {
  createPresentationTransactionRunner,
  type PresentationTransactionCommand,
  type PresentationTransactionProgram,
  type SlotOperationV2,
  type WinResultPosition,
} from "@slotclientengine/gameframeworks";
import type {
  PreparedGridCellVisibleOccurrenceTransferBatch,
  PreparedVisibleOccurrenceReplacement,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import type { Game002FreeGameOperationPayload } from "./game002-operation-compiler.js";
import type { Game002ReelRuntime } from "./game002-reel-controller.js";
import type { Game002BackgroundPlayer } from "./game002-scene-runtime.js";
import { assertGame002ReelVisualMatchesTarget } from "./game002-reel-controller.js";

type Activity = "idle" | "transaction" | "spin" | "win" | "popup";

export class Game002FreeGameOperationTarget {
  readonly #runtime: Game002ReelRuntime;
  readonly #cascadePlayer: SymbolCascadePlayer;
  readonly #winAmountPlayer: WinAmountAnimationPlayer;
  readonly #backgroundPlayer: Game002BackgroundPlayer;
  readonly #codes: Readonly<{ AF: number; CN: number; CO: number; BN: number }>;
  readonly #transactionRunner = createPresentationTransactionRunner();
  #activity: Activity = "idle";
  #payload: Game002FreeGameOperationPayload | null = null;
  #operation: SlotOperationV2 | null = null;
  #transactionGeneration = 0;
  #transactionComplete = true;
  #progressCommandIndex: number | null = null;
  #failure: Error | null = null;

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

  start(
    payload: Game002FreeGameOperationPayload,
    operation: SlotOperationV2 | null = null,
  ): void {
    if (this.#activity !== "idle")
      throw new Error("game002 FreeGame operation target is already active.");
    this.#payload = payload;
    this.#operation = operation;
    this.#failure = null;
    switch (payload.kind) {
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
      case "win":
        this.#cascadePlayer.start(this.#cascadePlayer.prepare(payload.groups));
        this.#activity = "win";
        return;
      case "popup":
        this.#winAmountPlayer.start(payload);
        this.#activity = "popup";
        return;
      default:
        this.startTransaction(this.createTransactionProgram(payload));
    }
  }

  update(deltaSeconds: number): { readonly completed: boolean } {
    if (this.#failure) throw this.#failure;
    const payload = this.#payload;
    if (!payload)
      throw new Error("game002 FreeGame operation payload is missing.");
    if (this.#activity === "transaction") {
      this.#runtime.update(deltaSeconds);
      const transaction = this.#transactionRunner.getSnapshot();
      if (transaction.commandKind === "progress") {
        if (this.#progressCommandIndex === transaction.commandIndex)
          this.#transactionRunner.update(deltaSeconds);
        else this.#progressCommandIndex = transaction.commandIndex;
      } else {
        this.#progressCommandIndex = null;
        this.#transactionRunner.update(deltaSeconds);
      }
      if (this.#transactionRunner.getSnapshot().phase === "complete")
        this.#transactionComplete = true;
      if (this.#failure) throw this.#failure;
      if (!this.#transactionComplete) return { completed: false };
      if (payload.kind === "af")
        this.assertOutput(payload.af.outputScene, "AF");
      if (payload.kind === "co")
        this.assertOutput(payload.co.outputScene, "CO");
      return this.finish();
    }
    if (this.#activity === "spin" && payload.kind === "spin") {
      this.#runtime.update(deltaSeconds);
      if (this.#runtime.isSpinning()) return { completed: false };
      this.assertOutput(payload.spin.spinScene, "spin");
      return this.finish();
    }
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
    this.#transactionGeneration += 1;
    if (this.#transactionRunner.getSnapshot().running)
      this.#transactionRunner.cleanup("next-program");
    this.#transactionComplete = true;
    this.#progressCommandIndex = null;
    this.#cascadePlayer.clear();
    this.#winAmountPlayer.dismissImmediately();
    const operation = this.#operation;
    if (
      operation?.effect === "state-mutation" &&
      this.#runtime.getCurrentScene()
    )
      this.#runtime.applyScene(
        operation.input.scene,
        "game002 FreeGame transaction rollback",
        operation.input.values as Parameters<
          Game002ReelRuntime["applyScene"]
        >[2],
      );
    this.#payload = null;
    this.#operation = null;
    this.#activity = "idle";
    this.#failure = null;
  }

  private createTransactionProgram(
    payload: Exclude<
      Game002FreeGameOperationPayload,
      { kind: "spin" | "win" | "popup" }
    >,
  ): PresentationTransactionProgram {
    const commands: PresentationTransactionCommand[] = [];
    if (payload.kind === "trigger") {
      commands.push(
        this.awaitStates(payload.positions, "win"),
        this.commit(() =>
          this.#runtime.requestVisibleSymbolStates(
            payload.positions,
            "normal",
            "immediate",
          ),
        ),
      );
    } else if (payload.kind === "transition") {
      commands.push({
        kind: "await",
        preflight: () => this.preflight(payload),
        start: async () => {
          await this.#backgroundPlayer.prepareModeTransition!(payload.mode);
          await this.#backgroundPlayer.requestMode!(payload.mode);
        },
      });
    } else if (payload.kind === "af") {
      commands.push(
        this.commit(() => {
          for (const position of payload.af.positions)
            this.#runtime.setVisibleSymbolImageStringText(
              position.x,
              position.y,
              "free-spins",
              String(payload.af.addedFreeSpins),
            );
        }),
        this.awaitStates(payload.af.positions, "feature"),
        this.awaitStates(payload.af.positions, "change"),
        this.prepareReplacements(payload.af.positions, (position) => ({
          x: position.x,
          y: position.y,
          expectedCode: this.#codes.AF,
          outputCode: this.#codes.CN,
          outputPresentationValue:
            payload.af.outputValues[position.x]![position.y]!,
        })),
      );
    } else {
      commands.push(
        {
          kind: "await",
          preflight: () => undefined,
          start: (signal) =>
            this.#runtime.playVisibleSymbolStateBatch(
              [
                {
                  positions: payload.co.coPositions,
                  state: "feature",
                  options: {
                    transitionMode: "immediate",
                    completion: "once-complete",
                  },
                },
                {
                  positions: payload.co.sourcePositions,
                  state: "feature1",
                  options: {
                    transitionMode: "immediate",
                    completion: "once-complete",
                  },
                },
              ],
              { signal },
            ),
        },
        this.prepareCoTransfer(payload),
      );
    }
    return Object.freeze({ commands: Object.freeze(commands) });
  }

  private awaitStates(
    positions: readonly WinResultPosition[],
    state: string,
  ): PresentationTransactionCommand {
    return Object.freeze({
      kind: "await" as const,
      preflight: () => undefined,
      start: (signal: AbortSignal) =>
        this.#runtime.playVisibleSymbolStates(positions, state, {
          transitionMode: "immediate",
          completion: "once-complete",
          signal,
        }),
    });
  }

  private commit(commit: () => void): PresentationTransactionCommand {
    return Object.freeze({
      kind: "commit" as const,
      preflight: () => undefined,
      prepare: () => ({
        commit,
        rollback: () => undefined,
        destroy: () => undefined,
      }),
    });
  }

  private prepareReplacements(
    positions: readonly WinResultPosition[],
    options: (
      position: WinResultPosition,
    ) => Parameters<
      Game002ReelRuntime["prepareVisibleOccurrenceReplacement"]
    >[0],
  ): PresentationTransactionCommand {
    return Object.freeze({
      kind: "commit" as const,
      preflight: () => undefined,
      prepare: () => {
        const prepared: PreparedVisibleOccurrenceReplacement[] = [];
        try {
          for (const position of positions)
            prepared.push(
              this.#runtime.prepareVisibleOccurrenceReplacement(
                options(position),
              ),
            );
        } catch (error) {
          for (const replacement of prepared.toReversed())
            replacement.rollback();
          throw error;
        }
        return {
          commit: () => {
            for (const replacement of prepared) replacement.commit();
          },
          rollback: () => {
            for (const replacement of prepared.toReversed())
              replacement.rollback();
          },
          destroy: () => undefined,
        };
      },
    });
  }

  private prepareCoTransfer(
    payload: Extract<Game002FreeGameOperationPayload, { kind: "co" }>,
  ): PresentationTransactionCommand {
    return Object.freeze({
      kind: "progress" as const,
      durationSeconds: 0.5,
      preflight: () => undefined,
      await: (signal: AbortSignal) =>
        this.#runtime.playVisibleSymbolStates(
          payload.co.sourcePositions,
          "feature2",
          {
            transitionMode: "immediate",
            completion: "once-complete",
            signal,
          },
        ),
      prepare: () => {
        const replacements: PreparedVisibleOccurrenceReplacement[] = [];
        let transfer: PreparedGridCellVisibleOccurrenceTransferBatch | null =
          null;
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
          transfer = this.#runtime.prepareVisibleOccurrenceTransferBatch({
            transfers: payload.co.transfers.map((item) => ({
              source: item.source,
              target: item.target,
              expectedSourceCode: item.sourceCode,
              expectedTargetCode: item.targetCode,
              sourceReplacementCode: this.#codes.BN,
              sourceReplacementPresentationValue: null,
            })),
          });
        } catch (error) {
          transfer?.rollback();
          for (const replacement of replacements.toReversed())
            replacement.rollback();
          throw error;
        }
        const preparedTransfer = transfer;
        return {
          start: () => preparedTransfer.start(),
          setProgress: (progress: number) =>
            preparedTransfer.setProgress(progress),
          commit: () => {
            preparedTransfer.commit();
            for (const replacement of replacements) replacement.commit();
          },
          rollback: () => {
            preparedTransfer.rollback();
            for (const replacement of replacements.toReversed())
              replacement.rollback();
          },
          destroy: () => undefined,
        };
      },
    });
  }

  private startTransaction(program: PresentationTransactionProgram): void {
    this.#activity = "transaction";
    this.#transactionComplete = false;
    this.#progressCommandIndex = null;
    const generation = ++this.#transactionGeneration;
    void this.#transactionRunner.start(program).then(
      () => {
        if (generation === this.#transactionGeneration)
          this.#transactionComplete = true;
      },
      (error: unknown) => {
        if (generation === this.#transactionGeneration)
          this.#failure = asError(error);
      },
    );
  }

  private assertOutput(
    scene: Parameters<Game002ReelRuntime["applyScene"]>[0],
    label: string,
  ) {
    assertGame002ReelVisualMatchesTarget(
      this.#runtime.getVisualSnapshot(),
      scene,
      `game002 FreeGame ${label} operation`,
    );
  }

  private finish() {
    this.#payload = null;
    this.#operation = null;
    this.#activity = "idle";
    this.#transactionComplete = true;
    return { completed: true };
  }
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
