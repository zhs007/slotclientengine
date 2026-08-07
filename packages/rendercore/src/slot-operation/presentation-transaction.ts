export type PresentationTransactionCleanupReason =
  | "next-program"
  | "execution-failure"
  | "destroy";

export interface PreparedPresentationTransaction {
  start?(): void;
  commit(): void;
  rollback(): void;
  destroy(): void;
}

export interface PreparedPresentationProgressTransaction extends PreparedPresentationTransaction {
  start(): void;
  setProgress(progress: number): void;
}

interface PresentationCommandBase {
  /** Must validate every referenced capability without mutating presentation. */
  preflight(): void;
}

export interface AwaitPresentationCommand extends PresentationCommandBase {
  readonly kind: "await";
  start(signal: AbortSignal): Promise<void>;
}

export interface CommitPresentationCommand extends PresentationCommandBase {
  readonly kind: "commit";
  prepare(): PreparedPresentationTransaction;
}

export interface ProgressPresentationCommand extends PresentationCommandBase {
  readonly kind: "progress";
  readonly durationSeconds: number;
  /** Optional barrier that runs in parallel with progress and must settle before commit. */
  await?(signal: AbortSignal): Promise<void>;
  prepare(): PreparedPresentationProgressTransaction;
}

export type PresentationTransactionCommand =
  | AwaitPresentationCommand
  | CommitPresentationCommand
  | ProgressPresentationCommand;

export interface PresentationTransactionProgram {
  readonly commands: readonly PresentationTransactionCommand[];
}

export type PresentationTransactionRunnerPhase =
  | "idle"
  | "running"
  | "complete"
  | "fatal"
  | "destroyed";

export interface PresentationTransactionRunnerSnapshot {
  readonly phase: PresentationTransactionRunnerPhase;
  readonly commandIndex: number | null;
  readonly commandKind: PresentationTransactionCommand["kind"] | null;
  readonly running: boolean;
}

export interface PresentationTransactionRunner {
  start(program: PresentationTransactionProgram): Promise<void>;
  update(deltaSeconds: number): void;
  cleanup(
    reason: Exclude<PresentationTransactionCleanupReason, "destroy">,
  ): void;
  getSnapshot(): PresentationTransactionRunnerSnapshot;
  destroy(): void;
}

interface ActivePreparedCommand {
  readonly generation: number;
  readonly command: CommitPresentationCommand | ProgressPresentationCommand;
  readonly prepared: PreparedPresentationTransaction;
  elapsedSeconds: number;
  committed: boolean;
  destroyed: boolean;
  barrierComplete: boolean;
}

export function createPresentationTransactionRunner(): PresentationTransactionRunner {
  let phase: PresentationTransactionRunnerPhase = "idle";
  let program: PresentationTransactionProgram | null = null;
  let commandIndex = 0;
  let generation = 0;
  let activePrepared: ActivePreparedCommand | null = null;
  let activeAbort: AbortController | null = null;
  let resolveProgram: (() => void) | null = null;
  let rejectProgram: ((error: Error) => void) | null = null;

  const clear = (nextPhase: PresentationTransactionRunnerPhase): void => {
    program = null;
    commandIndex = 0;
    activePrepared = null;
    activeAbort = null;
    resolveProgram = null;
    rejectProgram = null;
    phase = nextPhase;
  };

  const destroyPrepared = (active: ActivePreparedCommand): void => {
    if (active.destroyed) return;
    active.destroyed = true;
    active.prepared.destroy();
  };

  const rollbackAndDestroyActive = (): void => {
    activeAbort?.abort();
    activeAbort = null;
    const active = activePrepared;
    activePrepared = null;
    if (!active) return;
    let rollbackError: Error | null = null;
    if (!active.committed) {
      try {
        active.prepared.rollback();
      } catch (error) {
        rollbackError = asError(error);
      }
    }
    try {
      destroyPrepared(active);
    } catch (error) {
      const destroyError = asError(error);
      if (rollbackError)
        throw new AggregateError(
          [rollbackError, destroyError],
          "Presentation transaction rollback and destroy both failed.",
        );
      throw destroyError;
    }
    if (rollbackError) throw rollbackError;
  };

  const fail = (error: Error): void => {
    if (!program || phase !== "running") return;
    const reject = rejectProgram;
    let rejection = error;
    try {
      rollbackAndDestroyActive();
    } catch (cleanupError) {
      rejection = new AggregateError(
        [error, cleanupError],
        "Presentation transaction execution and cleanup both failed.",
      );
    }
    generation += 1;
    clear("fatal");
    reject?.(rejection);
  };

  const completePrepared = (active: ActivePreparedCommand): void => {
    active.prepared.commit();
    active.committed = true;
    destroyPrepared(active);
    activePrepared = null;
    commandIndex += 1;
  };

  const startCurrent = (): void => {
    while (program && phase === "running") {
      const command = program.commands[commandIndex];
      if (!command) {
        const resolve = resolveProgram;
        clear("complete");
        resolve?.();
        return;
      }
      if (command.kind === "await") {
        const commandGeneration = generation;
        const abort = new AbortController();
        activeAbort = abort;
        let playback: Promise<void>;
        try {
          playback = command.start(abort.signal);
        } catch (error) {
          fail(asError(error));
          return;
        }
        Promise.resolve(playback).then(
          () => {
            if (
              generation !== commandGeneration ||
              !program ||
              phase !== "running"
            )
              return;
            activeAbort = null;
            commandIndex += 1;
            startCurrent();
          },
          (error: unknown) => {
            if (
              generation !== commandGeneration ||
              !program ||
              phase !== "running"
            )
              return;
            activeAbort = null;
            fail(asError(error));
          },
        );
        return;
      }

      let prepared: PreparedPresentationTransaction;
      try {
        prepared = command.prepare();
        const active: ActivePreparedCommand = {
          generation,
          command,
          prepared,
          elapsedSeconds: 0,
          committed: false,
          destroyed: false,
          barrierComplete: command.kind !== "progress" || !command.await,
        };
        activePrepared = active;
        prepared.start?.();
        if (command.kind === "progress") {
          (prepared as PreparedPresentationProgressTransaction).setProgress(0);
          if (command.await) {
            const commandGeneration = generation;
            const abort = new AbortController();
            activeAbort = abort;
            let barrier: Promise<void>;
            try {
              barrier = command.await(abort.signal);
            } catch (error) {
              fail(asError(error));
              return;
            }
            Promise.resolve(barrier).then(
              () => {
                if (
                  generation !== commandGeneration ||
                  activePrepared !== active ||
                  phase !== "running"
                )
                  return;
                active.barrierComplete = true;
                activeAbort = null;
              },
              (error: unknown) => {
                if (
                  generation !== commandGeneration ||
                  activePrepared !== active ||
                  phase !== "running"
                )
                  return;
                activeAbort = null;
                fail(asError(error));
              },
            );
          }
          return;
        }
        completePrepared(active);
      } catch (error) {
        fail(asError(error));
        return;
      }
    }
  };

  const cleanup = (
    reason: Exclude<PresentationTransactionCleanupReason, "destroy">,
  ): void => {
    if (phase === "destroyed") return;
    const reject = rejectProgram;
    const interruption = new Error(
      `Presentation transaction program was interrupted by ${reason} cleanup.`,
    );
    let cleanupError: Error | null = null;
    try {
      rollbackAndDestroyActive();
    } catch (error) {
      cleanupError = asError(error);
    }
    generation += 1;
    clear("idle");
    reject?.(
      cleanupError
        ? new AggregateError(
            [interruption, cleanupError],
            "Presentation transaction cleanup failed.",
          )
        : interruption,
    );
    if (cleanupError) throw cleanupError;
  };

  return Object.freeze({
    start(nextProgram: PresentationTransactionProgram): Promise<void> {
      try {
        if (phase === "destroyed")
          throw new Error("Presentation transaction runner is destroyed.");
        if (program)
          throw new Error(
            "Presentation transaction runner is already running.",
          );
        if (!Object.isFrozen(nextProgram))
          throw new Error(
            "Presentation transaction program must be immutable.",
          );
        for (const command of nextProgram.commands) {
          if (command.kind === "progress") {
            if (
              !Number.isFinite(command.durationSeconds) ||
              command.durationSeconds <= 0
            )
              throw new Error(
                "Presentation progress durationSeconds must be finite and positive.",
              );
          }
          command.preflight();
        }
        program = nextProgram;
        commandIndex = 0;
        phase = "running";
        generation += 1;
        const promise = new Promise<void>((resolve, reject) => {
          resolveProgram = resolve;
          rejectProgram = reject;
        });
        startCurrent();
        return promise;
      } catch (error) {
        return Promise.reject(asError(error));
      }
    },
    update(deltaSeconds: number): void {
      if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
        throw new Error(
          "Presentation transaction deltaSeconds must be finite and non-negative.",
        );
      const active = activePrepared;
      if (
        !active ||
        active.generation !== generation ||
        active.command.kind !== "progress" ||
        phase !== "running"
      )
        return;
      try {
        active.elapsedSeconds += deltaSeconds;
        const elapsedProgress = Math.min(
          active.elapsedSeconds / active.command.durationSeconds,
          1,
        );
        const progress = active.barrierComplete
          ? elapsedProgress
          : Math.min(elapsedProgress, 0.9);
        (
          active.prepared as PreparedPresentationProgressTransaction
        ).setProgress(progress);
        if (progress < 1 || !active.barrierComplete) return;
        completePrepared(active);
        startCurrent();
      } catch (error) {
        fail(asError(error));
      }
    },
    cleanup,
    getSnapshot(): PresentationTransactionRunnerSnapshot {
      const command = program?.commands[commandIndex];
      return Object.freeze({
        phase,
        commandIndex: command ? commandIndex : null,
        commandKind: command?.kind ?? null,
        running: program !== null,
      });
    },
    destroy(): void {
      if (phase === "destroyed") return;
      const reject = rejectProgram;
      const interruption = new Error(
        "Presentation transaction runner was destroyed.",
      );
      let cleanupError: Error | null = null;
      try {
        rollbackAndDestroyActive();
      } catch (error) {
        cleanupError = asError(error);
      }
      generation += 1;
      clear("destroyed");
      reject?.(
        cleanupError
          ? new AggregateError(
              [interruption, cleanupError],
              "Presentation transaction destroy failed.",
            )
          : interruption,
      );
      if (cleanupError) throw cleanupError;
    },
  });
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
