export interface SlotOperationCellChoreographyStep {
  readonly state: string;
  readonly phase: "stable" | "once";
}

export interface SlotOperationCellChoreographyAssignment {
  readonly x: number;
  readonly y: number;
  readonly steps: readonly [
    SlotOperationCellChoreographyStep,
    ...SlotOperationCellChoreographyStep[],
  ];
}

export interface SlotOperationCellChoreographyProgram {
  readonly assignments: readonly SlotOperationCellChoreographyAssignment[];
  readonly completionPolicy: "all-cells-normal" | "first-cell-normal";
}

export interface SlotOperationCellStateSnapshot {
  readonly onceCompletionCount: number;
}

export interface SlotOperationCellChoreographyExecutor {
  start(program: SlotOperationCellChoreographyProgram): void;
  update(): { readonly completed: boolean };
  retire(): void;
  destroy(): void;
}

export function createSlotOperationCellChoreographyExecutor(options: {
  requestState(x: number, y: number, state: string): void;
  getStateSnapshot(x: number, y: number): SlotOperationCellStateSnapshot;
}): SlotOperationCellChoreographyExecutor {
  let destroyed = false;
  let generation = 0;
  let policy: SlotOperationCellChoreographyProgram["completionPolicy"] =
    "all-cells-normal";
  const active = new Map<
    string,
    {
      readonly generation: number;
      readonly assignment: SlotOperationCellChoreographyAssignment;
      index: number;
      onceCompletionCount: number;
    }
  >();
  const completed = new Set<string>();

  const retire = () => {
    generation += 1;
    active.clear();
    completed.clear();
  };

  return Object.freeze({
    start(program: SlotOperationCellChoreographyProgram) {
      if (destroyed)
        throw new Error("Slot operation choreography executor is destroyed.");
      retire();
      policy = program.completionPolicy;
      const keys = new Set<string>();
      for (const assignment of program.assignments) {
        const key = `${assignment.x},${assignment.y}`;
        if (keys.has(key))
          throw new Error(`Duplicate choreography assignment ${key}.`);
        keys.add(key);
        const first = assignment.steps[0];
        if (!first)
          throw new Error(`Choreography assignment ${key} has no steps.`);
        options.requestState(assignment.x, assignment.y, first.state);
        if (assignment.steps.length === 1 && first.phase === "stable") {
          completed.add(key);
          continue;
        }
        if (first.phase !== "once")
          throw new Error(
            `Choreography assignment ${key} must use once before its final stable step.`,
          );
        active.set(key, {
          generation,
          assignment,
          index: 0,
          onceCompletionCount: options.getStateSnapshot(
            assignment.x,
            assignment.y,
          ).onceCompletionCount,
        });
      }
    },
    update() {
      if (destroyed) return { completed: true };
      for (const [key, controller] of [...active]) {
        if (controller.generation !== generation) {
          active.delete(key);
          continue;
        }
        const snapshot = options.getStateSnapshot(
          controller.assignment.x,
          controller.assignment.y,
        );
        if (snapshot.onceCompletionCount <= controller.onceCompletionCount)
          continue;
        controller.onceCompletionCount = snapshot.onceCompletionCount;
        controller.index += 1;
        const next = controller.assignment.steps[controller.index];
        if (!next)
          throw new Error(
            `Choreography assignment ${key} ended without stable state.`,
          );
        options.requestState(
          controller.assignment.x,
          controller.assignment.y,
          next.state,
        );
        if (next.phase === "stable") {
          if (controller.index !== controller.assignment.steps.length - 1)
            throw new Error(
              `Choreography assignment ${key} has steps after stable state.`,
            );
          active.delete(key);
          completed.add(key);
        } else {
          controller.onceCompletionCount = options.getStateSnapshot(
            controller.assignment.x,
            controller.assignment.y,
          ).onceCompletionCount;
        }
      }
      const first = "0,0";
      return {
        completed:
          policy === "first-cell-normal"
            ? completed.has(first)
            : active.size === 0,
      };
    },
    retire,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      retire();
    },
  });
}
