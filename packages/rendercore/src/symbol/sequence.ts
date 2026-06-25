import { SymbolStateError } from "./errors.js";
import { assertValidDeltaSeconds } from "./ani.js";
import { validateSymbolStatePreset } from "./state-machine.js";
import type {
  SymbolSequenceStep,
  SymbolSequenceUpdateInput,
  SymbolSequenceUpdateResult,
  SymbolStateDefinition,
  SymbolStateId,
  SymbolStatePreset,
  SymbolStateSequenceControllerOptions,
} from "./types.js";

export class SymbolStateSequenceController {
  readonly #statesById: ReadonlyMap<SymbolStateId, SymbolStateDefinition>;
  #steps: SymbolSequenceStep[];
  #currentIndex = 0;
  #elapsedSeconds = 0;
  #playing: boolean;

  constructor(options: SymbolStateSequenceControllerOptions) {
    this.#statesById = validateSymbolStatePreset(
      options.statePreset,
    ).statesById;
    if (options.steps.length === 0) {
      throw new SymbolStateError(
        "Symbol state sequence must contain at least one step.",
      );
    }
    this.#steps = options.steps.map((step) => this.normalizeStep(step));
    this.#playing = options.autoplay ?? true;
  }

  getSteps(): readonly SymbolSequenceStep[] {
    return Object.freeze(this.#steps.map((step) => Object.freeze({ ...step })));
  }

  getCurrentIndex(): number {
    return this.#currentIndex;
  }

  getCurrentStep(): SymbolSequenceStep {
    return this.#steps[this.#currentIndex];
  }

  isPlaying(): boolean {
    return this.#playing;
  }

  play(): void {
    this.#playing = true;
  }

  pause(): void {
    this.#playing = false;
  }

  reset(): void {
    this.#currentIndex = 0;
    this.#elapsedSeconds = 0;
  }

  next(): SymbolSequenceStep {
    this.#currentIndex = (this.#currentIndex + 1) % this.#steps.length;
    this.#elapsedSeconds = 0;
    return this.getCurrentStep();
  }

  addStep(step: SymbolSequenceStep, index = this.#steps.length): void {
    const normalized = this.normalizeStep(step);
    const insertIndex = clampIndex(index, 0, this.#steps.length);
    this.#steps.splice(insertIndex, 0, normalized);
    if (insertIndex <= this.#currentIndex) {
      this.#currentIndex += 1;
    }
  }

  updateStep(index: number, step: SymbolSequenceStep): void {
    this.assertStepIndex(index);
    this.#steps[index] = this.normalizeStep(step);
    if (index === this.#currentIndex) {
      this.#elapsedSeconds = 0;
    }
  }

  removeStep(index: number): void {
    this.assertStepIndex(index);
    if (this.#steps.length === 1) {
      throw new SymbolStateError(
        "Cannot remove the last symbol state sequence step.",
      );
    }

    this.#steps.splice(index, 1);
    if (index < this.#currentIndex) {
      this.#currentIndex -= 1;
    } else if (this.#currentIndex >= this.#steps.length) {
      this.#currentIndex = this.#steps.length - 1;
    }
    this.#elapsedSeconds = 0;
  }

  moveStep(fromIndex: number, toIndex: number): void {
    this.assertStepIndex(fromIndex);
    this.assertStepIndex(toIndex);
    if (fromIndex === toIndex) {
      return;
    }

    const [step] = this.#steps.splice(fromIndex, 1);
    this.#steps.splice(toIndex, 0, step);
    if (this.#currentIndex === fromIndex) {
      this.#currentIndex = toIndex;
    } else if (
      fromIndex < this.#currentIndex &&
      toIndex >= this.#currentIndex
    ) {
      this.#currentIndex -= 1;
    } else if (
      fromIndex > this.#currentIndex &&
      toIndex <= this.#currentIndex
    ) {
      this.#currentIndex += 1;
    }
    this.#elapsedSeconds = 0;
  }

  update(input: SymbolSequenceUpdateInput): SymbolSequenceUpdateResult {
    assertValidDeltaSeconds(input.deltaSeconds);
    const currentStep = this.getCurrentStep();
    const currentState = this.#statesById.get(currentStep.state);
    if (!currentState) {
      throw new SymbolStateError(
        `Unknown sequence state "${currentStep.state}".`,
      );
    }

    if (!this.#playing) {
      return this.createUpdateResult(false);
    }

    if (currentState.phase === "once") {
      if (input.onceCompleted === true) {
        this.next();
        return this.createUpdateResult(true);
      }
      return this.createUpdateResult(false);
    }

    this.#elapsedSeconds += input.deltaSeconds;
    if (this.#elapsedSeconds >= (currentStep.holdSeconds ?? 1)) {
      this.next();
      return this.createUpdateResult(true);
    }

    return this.createUpdateResult(false);
  }

  private normalizeStep(step: SymbolSequenceStep): SymbolSequenceStep {
    if (!this.#statesById.has(step.state)) {
      throw new SymbolStateError(`Unknown sequence state "${step.state}".`);
    }
    if (
      step.holdSeconds !== undefined &&
      (!Number.isFinite(step.holdSeconds) || step.holdSeconds < 0)
    ) {
      throw new SymbolStateError(
        `Sequence holdSeconds for "${step.state}" must be non-negative.`,
      );
    }
    return Object.freeze({
      state: step.state,
      ...(step.holdSeconds === undefined
        ? {}
        : { holdSeconds: step.holdSeconds }),
    });
  }

  private createUpdateResult(
    shouldRequestState: boolean,
  ): SymbolSequenceUpdateResult {
    return Object.freeze({
      shouldRequestState,
      state: this.getCurrentStep().state,
      currentIndex: this.#currentIndex,
    });
  }

  private assertStepIndex(index: number): void {
    if (!Number.isInteger(index) || index < 0 || index >= this.#steps.length) {
      throw new SymbolStateError(
        `Sequence step index ${index} is out of range.`,
      );
    }
  }
}

function clampIndex(index: number, min: number, max: number): number {
  if (!Number.isInteger(index)) {
    throw new SymbolStateError(
      `Sequence step index ${index} must be an integer.`,
    );
  }
  return Math.min(max, Math.max(min, index));
}
