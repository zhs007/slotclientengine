import { SymbolStateError } from "./errors.js";
import type {
  SymbolDefinition,
  SymbolPlaybackKind,
  SymbolStateDefinition,
  SymbolStateEquivalence,
  SymbolStateId,
  SymbolStatePhase,
  SymbolStatePreset,
  SymbolStateSnapshot,
  SymbolStateTransitionMode,
} from "./types.js";

export const MIN_SYMBOL_FRAME_DURATION_SECONDS = 1 / 60;

interface ValidatedSymbolStates {
  readonly statesById: ReadonlyMap<SymbolStateId, SymbolStateDefinition>;
  readonly equivalences: ReadonlyMap<SymbolStateId, SymbolStateId>;
}

export class SymbolStateMachine {
  readonly #definition: SymbolDefinition;
  readonly #statesById: ReadonlyMap<SymbolStateId, SymbolStateDefinition>;
  readonly #equivalences: ReadonlyMap<SymbolStateId, SymbolStateId>;
  #requestedState: SymbolStateId;
  #resolvedState: SymbolStateId;
  #defaultState: SymbolStateId;
  #pendingState: SymbolStateId | null = null;

  constructor(definition: SymbolDefinition) {
    const validated = validateSymbolDefinition(definition);
    this.#definition = definition;
    this.#statesById = validated.statesById;
    this.#equivalences = validated.equivalences;
    this.#defaultState = definition.defaultState;
    this.#requestedState = definition.defaultState;
    this.#resolvedState = this.resolveState(definition.defaultState);
  }

  getDefinition(): SymbolDefinition {
    return this.#definition;
  }

  getStateDefinition(state: SymbolStateId): SymbolStateDefinition {
    const definition = this.#statesById.get(state);
    if (!definition) {
      throw new SymbolStateError(`Unknown symbol state "${state}".`);
    }
    return definition;
  }

  getCurrentStateDefinition(): SymbolStateDefinition {
    return this.getStateDefinition(this.#resolvedState);
  }

  getSnapshot(): SymbolStateSnapshot {
    return Object.freeze({
      requestedState: this.#requestedState,
      resolvedState: this.#resolvedState,
      defaultState: this.#defaultState,
      pendingState: this.#pendingState,
      isOnce: this.getCurrentStateDefinition().phase === "once",
    });
  }

  setDefaultState(state: SymbolStateId): void {
    this.assertKnownState(state);
    if (this.getStateDefinition(state).phase !== "stable") {
      throw new SymbolStateError(
        `Default symbol state "${state}" must be stable.`,
      );
    }
    this.#defaultState = state;
  }

  requestState(
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    this.assertKnownState(state);
    if (transitionMode !== "boundary" && transitionMode !== "immediate") {
      throw new SymbolStateError(
        `Unknown symbol state transition mode "${String(transitionMode)}".`,
      );
    }
    if (transitionMode === "immediate") {
      this.#pendingState = null;
      this.switchTo(state);
      return;
    }
    const current = this.getCurrentStateDefinition();

    if (current.playback === "static") {
      this.switchTo(state);
      return;
    }

    if (this.#requestedState === state && this.#pendingState === null) {
      return;
    }

    this.#pendingState = state;
  }

  notifyLoopComplete(): void {
    if (this.getCurrentStateDefinition().playback !== "loop") {
      return;
    }

    if (this.#pendingState !== null) {
      const next = this.#pendingState;
      this.#pendingState = null;
      this.switchTo(next);
    }
  }

  notifyOnceComplete(): void {
    if (this.getCurrentStateDefinition().playback !== "once") {
      return;
    }

    this.#pendingState = null;
    this.switchTo(this.#defaultState);
  }

  canSwitchImmediately(): boolean {
    return this.getCurrentStateDefinition().playback === "static";
  }

  reset(): void {
    this.#pendingState = null;
    this.switchTo(this.#defaultState);
  }

  resolveState(state: SymbolStateId): SymbolStateId {
    this.assertKnownState(state);

    const seen = new Set<SymbolStateId>();
    let current = state;
    while (this.#equivalences.has(current)) {
      if (seen.has(current)) {
        throw new SymbolStateError(
          `Symbol state equivalence cycle detected at "${current}".`,
        );
      }
      seen.add(current);
      current = this.#equivalences.get(current) as SymbolStateId;
    }

    return current;
  }

  private switchTo(requestedState: SymbolStateId): void {
    this.assertKnownState(requestedState);
    this.#requestedState = requestedState;
    this.#resolvedState = this.resolveState(requestedState);
  }

  private assertKnownState(state: SymbolStateId): void {
    if (!this.#statesById.has(state)) {
      throw new SymbolStateError(`Unknown symbol state "${state}".`);
    }
  }
}

export function createDefaultSymbolStatePreset(): SymbolStatePreset {
  return Object.freeze({
    defaultState: "normal",
    states: Object.freeze([
      Object.freeze({
        id: "normal",
        phase: "stable",
        playback: "static",
        frameDurationSeconds: MIN_SYMBOL_FRAME_DURATION_SECONDS,
      }),
      Object.freeze({
        id: "spinBlur",
        phase: "stable",
        playback: "static",
        frameDurationSeconds: MIN_SYMBOL_FRAME_DURATION_SECONDS,
      }),
      Object.freeze({
        id: "disabled",
        phase: "stable",
        playback: "static",
        frameDurationSeconds: MIN_SYMBOL_FRAME_DURATION_SECONDS,
      }),
      Object.freeze({
        id: "appear",
        phase: "once",
        playback: "once",
      }),
      Object.freeze({
        id: "win",
        phase: "once",
        playback: "once",
      }),
      Object.freeze({
        id: "remove",
        phase: "once",
        playback: "once",
      }),
      Object.freeze({
        id: "dropdown",
        phase: "stable",
        playback: "loop",
      }),
    ]),
    equivalences: Object.freeze([
      Object.freeze({ from: "spinBlur", to: "normal" }),
      Object.freeze({ from: "disabled", to: "normal" }),
    ]),
  });
}

export function createSymbolDefinitionFromPreset(options: {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly preset?: SymbolStatePreset;
}): SymbolDefinition {
  const preset = options.preset ?? createDefaultSymbolStatePreset();
  return Object.freeze({
    code: options.code,
    symbol: options.symbol,
    pays: Object.freeze([...options.pays]),
    defaultState: preset.defaultState,
    states: Object.freeze(
      preset.states.map((state) => Object.freeze({ ...state })),
    ),
    equivalences: Object.freeze(
      (preset.equivalences ?? []).map((equivalence) =>
        Object.freeze({ ...equivalence }),
      ),
    ),
  });
}

export function validateSymbolDefinition(
  definition: SymbolDefinition,
): ValidatedSymbolStates {
  const statesById = validateStateDefinitions(definition.states);
  validateDefaultState(definition.defaultState, statesById);
  const equivalences = validateStateEquivalences(
    definition.equivalences ?? [],
    statesById,
  );
  return {
    statesById,
    equivalences,
  };
}

export function validateSymbolStatePreset(
  preset: SymbolStatePreset,
): ValidatedSymbolStates {
  const statesById = validateStateDefinitions(preset.states);
  validateDefaultState(preset.defaultState, statesById);
  const equivalences = validateStateEquivalences(
    preset.equivalences ?? [],
    statesById,
  );
  return {
    statesById,
    equivalences,
  };
}

function validateStateDefinitions(
  states: readonly SymbolStateDefinition[],
): ReadonlyMap<SymbolStateId, SymbolStateDefinition> {
  if (!Array.isArray(states) || states.length === 0) {
    throw new SymbolStateError(
      "Symbol states must contain at least one state.",
    );
  }

  const statesById = new Map<SymbolStateId, SymbolStateDefinition>();
  for (const state of states) {
    if (typeof state.id !== "string" || state.id.length === 0) {
      throw new SymbolStateError("Symbol state id must be a non-empty string.");
    }

    if (statesById.has(state.id)) {
      throw new SymbolStateError(`Duplicate symbol state "${state.id}".`);
    }

    validatePhaseAndPlayback(state.id, state.phase, state.playback);
    validateFrameDuration(state);
    statesById.set(state.id, Object.freeze({ ...state }));
  }

  return statesById;
}

function validateDefaultState(
  defaultState: SymbolStateId,
  statesById: ReadonlyMap<SymbolStateId, SymbolStateDefinition>,
): void {
  const state = statesById.get(defaultState);
  if (!state) {
    throw new SymbolStateError(
      `Default symbol state "${defaultState}" does not exist.`,
    );
  }

  if (state.phase !== "stable") {
    throw new SymbolStateError(
      `Default symbol state "${defaultState}" must be stable.`,
    );
  }
}

function validatePhaseAndPlayback(
  id: SymbolStateId,
  phase: SymbolStatePhase,
  playback: SymbolPlaybackKind,
): void {
  if (phase === "once" && playback !== "once") {
    throw new SymbolStateError(
      `Symbol state "${id}" phase "once" must use playback "once".`,
    );
  }

  if (phase === "stable" && playback === "once") {
    throw new SymbolStateError(
      `Symbol state "${id}" stable phase cannot use once playback.`,
    );
  }
}

function validateFrameDuration(state: SymbolStateDefinition): void {
  if (state.frameDurationSeconds === undefined) {
    return;
  }

  if (
    !Number.isFinite(state.frameDurationSeconds) ||
    state.frameDurationSeconds < MIN_SYMBOL_FRAME_DURATION_SECONDS
  ) {
    throw new SymbolStateError(
      `Symbol state "${state.id}" frameDurationSeconds must be at least ${MIN_SYMBOL_FRAME_DURATION_SECONDS}.`,
    );
  }
}

function validateStateEquivalences(
  equivalences: readonly SymbolStateEquivalence[],
  statesById: ReadonlyMap<SymbolStateId, SymbolStateDefinition>,
): ReadonlyMap<SymbolStateId, SymbolStateId> {
  const equivalenceMap = new Map<SymbolStateId, SymbolStateId>();

  for (const equivalence of equivalences) {
    const from = statesById.get(equivalence.from);
    const to = statesById.get(equivalence.to);
    if (!from) {
      throw new SymbolStateError(
        `Symbol state equivalence source "${equivalence.from}" does not exist.`,
      );
    }
    if (!to) {
      throw new SymbolStateError(
        `Symbol state equivalence target "${equivalence.to}" does not exist.`,
      );
    }
    if (from.phase !== to.phase) {
      throw new SymbolStateError(
        `Symbol state equivalence "${equivalence.from}" -> "${equivalence.to}" must keep the same phase.`,
      );
    }
    equivalenceMap.set(equivalence.from, equivalence.to);
  }

  for (const state of equivalenceMap.keys()) {
    assertNoEquivalenceCycle(state, equivalenceMap);
  }

  return equivalenceMap;
}

function assertNoEquivalenceCycle(
  state: SymbolStateId,
  equivalenceMap: ReadonlyMap<SymbolStateId, SymbolStateId>,
): void {
  const seen = new Set<SymbolStateId>();
  let current: SymbolStateId | undefined = state;

  while (current !== undefined) {
    if (seen.has(current)) {
      throw new SymbolStateError(
        `Symbol state equivalence cycle detected at "${current}".`,
      );
    }
    seen.add(current);
    current = equivalenceMap.get(current);
  }
}
