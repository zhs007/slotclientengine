import type { WinResultPosition } from "@slotclientengine/gameframeworks";
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
  readonly #codes: Readonly<{ AF: number; CN: number; CO: number; BN: number }>;

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

  async start(
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
      case "spin":
        this.#runtime.startSelectiveSpin({
          sourceScene: payload.spin.inputScene,
          targetScene: payload.spin.spinScene,
          targetValues: payload.spin.spinValues,
          positions: payload.spin.spinPositions,
          sceneName: "game002 FreeGame operation spin",
        });
        await context.waitForFrame(() => !this.#runtime.isSpinning());
        return;
      case "af":
        for (const position of payload.af.positions)
          this.#runtime.setVisibleSymbolImageStringText(
            position.x,
            position.y,
            "free-spins",
            String(payload.af.addedFreeSpins),
          );
        await this.playStates(payload.af.positions, "feature", context.signal);
        await this.playStates(payload.af.positions, "change", context.signal);
        for (const position of payload.af.positions)
          this.#runtime.replaceVisibleOccurrence({
            x: position.x,
            y: position.y,
            expectedCode: this.#codes.AF,
            outputCode: this.#codes.CN,
            outputPresentationValue:
              payload.af.outputValues[position.x]![position.y]!,
          });
        return;
      case "co":
        await this.#runtime.playVisibleSymbolStateBatch(
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
          { signal: context.signal },
        );
        await this.#runtime.transferVisibleOccurrences({
          transfers: payload.co.transfers.map((item) => ({
            source: item.source,
            target: item.target,
            expectedSourceCode: item.sourceCode,
            expectedTargetCode: item.targetCode,
            sourceReplacementCode: this.#codes.BN,
            sourceReplacementPresentationValue: null,
          })),
          durationSeconds: 0.5,
          barrier: this.playStates(
            payload.co.sourcePositions,
            "feature2",
            context.signal,
          ),
          waitForFrame: context.waitForFrame,
        });
        for (const position of payload.co.coPositions)
          this.#runtime.replaceVisibleOccurrence({
            x: position.x,
            y: position.y,
            expectedCode: this.#codes.CO,
            outputCode: this.#codes.CN,
            outputPresentationValue:
              payload.co.outputValues[position.x]![position.y]!,
          });
        return;
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
