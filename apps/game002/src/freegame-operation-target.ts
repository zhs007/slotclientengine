import type {
  SlotOperationV2,
  SlotOperationSnapshot,
  SlotStateMutationOperation,
  WinResultPosition,
} from "@slotclientengine/gameframeworks";
import type {
  SlotOperationExecutionContext,
  SymbolCascadePlayer,
} from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import type { Game002FreeGameOperationPayload } from "./game002-operation-compiler.js";
import type { Game002ReelRuntime } from "./game002-reel-controller.js";
import type { Game002BackgroundPlayer } from "./game002-scene-runtime.js";

export class Game002FreeGameOperationTarget {
  readonly #runtime: Game002ReelRuntime;
  readonly #cascadePlayer: SymbolCascadePlayer;
  readonly #winAmountPlayer: WinAmountAnimationPlayer;
  readonly #backgroundPlayer: Game002BackgroundPlayer;

  constructor(options: {
    readonly runtime: Game002ReelRuntime;
    readonly cascadePlayer: SymbolCascadePlayer;
    readonly winAmountPlayer: WinAmountAnimationPlayer;
    readonly backgroundPlayer: Game002BackgroundPlayer;
  }) {
    this.#runtime = options.runtime;
    this.#cascadePlayer = options.cascadePlayer;
    this.#winAmountPlayer = options.winAmountPlayer;
    this.#backgroundPlayer = options.backgroundPlayer;
  }

  async start(
    operation: SlotOperationV2,
    payload: Game002FreeGameOperationPayload,
    context: SlotOperationExecutionContext,
  ): Promise<void> {
    switch (payload.kind) {
      case "trigger":
        await this.playStates(payload.positions, "win", context.signal);
        this.#runtime.requestVisibleSymbolStates(
          payload.positions,
          "normal",
          "immediate",
        );
        return;
      case "transition": {
        const prepare = this.#backgroundPlayer.prepareModeTransition;
        const request = this.#backgroundPlayer.requestMode;
        if (!prepare || !request)
          throw new Error(
            "game002 FreeGame mode transition support is missing.",
          );
        await prepare(payload.mode);
        await request(payload.mode);
        return;
      }
      case "spin": {
        const mutation = requireMutation(operation);
        const input = requireInput(operation, context);
        this.#runtime.startSelectiveSpin({
          sourceScene: input.scene,
          targetScene: mutation.output.scene,
          targetValues: mutation.output.values,
          positions: payload.spinPositions,
          sceneName: "game002 FreeGame operation spin",
        });
        await context.waitForFrame(() => !this.#runtime.isSpinning());
        return;
      }
      case "af": {
        const mutation = requireMutation(operation);
        for (const position of payload.positions)
          this.#runtime.setVisibleSymbolImageStringText(
            position.x,
            position.y,
            "free-spins",
            String(payload.addedFreeSpins),
          );
        await this.playStates(payload.positions, "feature", context.signal);
        await this.playStates(payload.positions, "change", context.signal);
        for (const position of payload.positions)
          this.#runtime.replaceVisibleOccurrence({
            x: position.x,
            y: position.y,
            outputCode: mutation.output.scene[position.x]![position.y]!,
            outputPresentationValue:
              mutation.output.values[position.x]![position.y]!,
          });
        return;
      }
      case "co": {
        const mutation = requireMutation(operation);
        const sourcePositions = payload.routes.map(({ source }) => source);
        await this.#runtime.playVisibleSymbolStateBatch(
          [
            {
              positions: payload.mainPos,
              state: "feature",
              options: {
                transitionMode: "immediate",
                completion: "once-complete",
              },
            },
            {
              positions: sourcePositions,
              state: "feature1",
              options: {
                transitionMode: "immediate",
                completion: "once-complete",
              },
            },
          ],
          { signal: context.signal },
        );
        await this.#runtime.transferVisibleOccurrences({
          transfers: payload.routes.map(({ source, target }) => ({
            source,
            target,
            sourceReplacementCode: mutation.output.scene[source.x]![source.y]!,
            sourceReplacementPresentationValue: null,
          })),
          durationSeconds: 0.5,
          barrier: this.playStates(sourcePositions, "feature2", context.signal),
          waitForFrame: context.waitForFrame,
        });
        for (const position of payload.mainPos)
          this.#runtime.replaceVisibleOccurrence({
            x: position.x,
            y: position.y,
            outputCode: mutation.output.scene[position.x]![position.y]!,
            outputPresentationValue:
              mutation.output.values[position.x]![position.y]!,
          });
        return;
      }
      case "win":
        this.#cascadePlayer.start(this.#cascadePlayer.prepare(payload.groups));
        await context.waitForFrame(
          (deltaSeconds) => this.#cascadePlayer.update(deltaSeconds).completed,
        );
        this.#cascadePlayer.clear();
        return;
      case "popup":
        this.#winAmountPlayer.start(payload);
        await context.waitForFrame(
          (deltaSeconds) =>
            this.#winAmountPlayer.update(deltaSeconds).phase === "complete",
        );
        return;
    }
  }

  cleanup(): void {
    this.#cascadePlayer.clear();
    this.#winAmountPlayer.dismissImmediately();
  }

  private playStates(
    positions: readonly WinResultPosition[],
    state: string,
    signal: AbortSignal,
  ): Promise<void> {
    return this.#runtime.playVisibleSymbolStates(positions, state, {
      transitionMode: "immediate",
      completion: "once-complete",
      signal,
    });
  }
}

function requireMutation(
  operation: SlotOperationV2,
): SlotStateMutationOperation {
  if (operation.effect !== "state-mutation")
    throw new Error(`${operation.kind} must be a state-mutation operation.`);
  return operation;
}

function requireInput(
  operation: SlotOperationV2,
  context: SlotOperationExecutionContext,
): SlotOperationSnapshot {
  if (!context.input)
    throw new Error(`${operation.kind} requires an established input scene.`);
  return context.input;
}
