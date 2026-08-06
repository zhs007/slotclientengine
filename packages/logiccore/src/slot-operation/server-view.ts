import { LogicParseError } from "../errors";
import type { GameLogic } from "../types";
import { selectComponent } from "./source-selectors";
import type {
  ComponentSelection,
  IndexedOtherSceneSelection,
  IndexedResultSelection,
  IndexedSceneSelection,
  ServerComponentOperationSource,
  SlotOperationPosition,
} from "./types";

export interface PresentComponentSelection<Role extends string = string> {
  readonly presence: "present";
  readonly role: Role;
  readonly stepIndex: number;
  readonly componentName: string;
  readonly source: ServerComponentOperationSource;
  readonly selection: ComponentSelection;
  scene(index?: number): IndexedSceneSelection;
  otherScene(index?: number): IndexedOtherSceneSelection;
  results(): readonly IndexedResultSelection[];
  positions(): readonly SlotOperationPosition[];
}

export interface AbsentComponentSelection<Role extends string = string> {
  readonly presence: "absent";
  readonly role: Role;
  readonly stepIndex: number;
  readonly componentName: string;
}

export type StrictComponentSelection<Role extends string = string> =
  | PresentComponentSelection<Role>
  | AbsentComponentSelection<Role>;

export interface SlotServerStepView {
  readonly index: number;
  require<Role extends string>(
    componentName: string,
    role?: Role,
  ): PresentComponentSelection<Role>;
  optional<Role extends string>(
    componentName: string,
    role?: Role,
  ): StrictComponentSelection<Role>;
  requireExactlyOne<Role extends string>(
    candidates: readonly string[],
    role?: Role,
  ): PresentComponentSelection<Role>;
  firstPresent<Role extends string>(
    candidates: readonly string[],
    role?: Role,
  ): StrictComponentSelection<Role>;
  lastPresent<Role extends string>(
    candidates: readonly string[],
    role?: Role,
  ): StrictComponentSelection<Role>;
  allPresent<Role extends string>(
    candidates: readonly string[],
    role?: Role,
  ): readonly PresentComponentSelection<Role>[];
}

export interface SlotOperationServerView {
  readonly steps: readonly SlotServerStepView[];
  readonly firstStep: SlotServerStepView;
  readonly lastStep: SlotServerStepView;
  step(index: number): SlotServerStepView;
}

export function createSlotOperationServerView(
  logic: GameLogic,
): SlotOperationServerView {
  if (logic.getStepCount() <= 0)
    throw new LogicParseError(
      "slot operation server view requires at least one step.",
    );
  const steps = Object.freeze(
    Array.from({ length: logic.getStepCount() }, (_value, index) =>
      createStepView(logic, index),
    ),
  );
  return Object.freeze({
    steps,
    firstStep: steps[0]!,
    lastStep: steps.at(-1)!,
    step: (index: number) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= steps.length)
        throw new LogicParseError(
          `slot operation step index ${index} is out of range.`,
        );
      return steps[index]!;
    },
  });
}

export function requireExactlyOneComponent<Role extends string = string>(
  step: SlotServerStepView,
  candidates: readonly string[],
  role?: Role,
): PresentComponentSelection<Role> {
  return step.requireExactlyOne(candidates, role);
}

export function selectFirstPresentComponent<Role extends string = string>(
  step: SlotServerStepView,
  candidates: readonly string[],
  role?: Role,
): StrictComponentSelection<Role> {
  return step.firstPresent(candidates, role);
}

export function selectLastPresentComponent<Role extends string = string>(
  step: SlotServerStepView,
  candidates: readonly string[],
  role?: Role,
): StrictComponentSelection<Role> {
  return step.lastPresent(candidates, role);
}

export function selectAllPresentComponents<Role extends string = string>(
  step: SlotServerStepView,
  candidates: readonly string[],
  role?: Role,
): readonly PresentComponentSelection<Role>[] {
  return step.allPresent(candidates, role);
}

function createStepView(
  logic: GameLogic,
  stepIndex: number,
): SlotServerStepView {
  const select = <Role extends string>(
    componentName: string,
    role: Role | undefined,
    required: boolean,
  ): StrictComponentSelection<Role> => {
    const resolvedRole = (role ?? componentName) as Role;
    if (!logic.hasComponent(stepIndex, componentName)) {
      if (required)
        throw new LogicParseError(
          `required component "${componentName}" is missing.`,
        );
      return Object.freeze({
        presence: "absent" as const,
        role: resolvedRole,
        stepIndex,
        componentName,
      });
    }
    const selection = selectComponent({ logic, stepIndex, componentName });
    const source = Object.freeze({
      kind: "server-component" as const,
      stepIndex,
      bindings: Object.freeze({ [resolvedRole]: selection }),
    });
    return Object.freeze({
      presence: "present" as const,
      role: resolvedRole,
      stepIndex,
      componentName,
      source,
      selection,
      scene: (index = 0) =>
        exactAt(selection.scenes, index, `${componentName}.scene`),
      otherScene: (index = 0) =>
        exactAt(selection.otherScenes, index, `${componentName}.otherScene`),
      results: () => selection.results,
      positions: () => selection.positions,
    });
  };
  const choose = <Role extends string>(
    candidates: readonly string[],
    role: Role | undefined,
    direction: "first" | "last",
  ): StrictComponentSelection<Role> => {
    validateCandidates(candidates);
    const present = candidates.filter((name) =>
      logic.hasComponent(stepIndex, name),
    );
    const selected = direction === "first" ? present[0] : present.at(-1);
    return selected
      ? select(selected, role, true)
      : select(
          candidates[direction === "first" ? 0 : candidates.length - 1]!,
          role,
          false,
        );
  };
  return Object.freeze({
    index: stepIndex,
    require: <Role extends string>(name: string, role?: Role) =>
      select(name, role, true) as PresentComponentSelection<Role>,
    optional: <Role extends string>(name: string, role?: Role) =>
      select(name, role, false),
    requireExactlyOne: <Role extends string>(
      candidates: readonly string[],
      role?: Role,
    ) => {
      validateCandidates(candidates);
      const present = candidates.filter((name) =>
        logic.hasComponent(stepIndex, name),
      );
      if (present.length !== 1)
        throw new LogicParseError(
          `step[${stepIndex}] expected exactly one present component from [${candidates.join(", ")}], got ${present.length}.`,
        );
      return select(present[0]!, role, true) as PresentComponentSelection<Role>;
    },
    firstPresent: <Role extends string>(
      candidates: readonly string[],
      role?: Role,
    ) => choose(candidates, role, "first"),
    lastPresent: <Role extends string>(
      candidates: readonly string[],
      role?: Role,
    ) => choose(candidates, role, "last"),
    allPresent: <Role extends string>(
      candidates: readonly string[],
      role?: Role,
    ) => {
      validateCandidates(candidates);
      return Object.freeze(
        candidates
          .filter((name) => logic.hasComponent(stepIndex, name))
          .map(
            (name) =>
              select(name, role, true) as PresentComponentSelection<Role>,
          ),
      );
    },
  });
}

function exactAt<T>(values: readonly T[], index: number, path: string): T {
  if (!Number.isSafeInteger(index) || index < 0 || index >= values.length)
    throw new LogicParseError(`${path}[${index}] is out of range.`);
  return values[index]!;
}

function validateCandidates(candidates: readonly string[]): void {
  if (!Array.isArray(candidates) || candidates.length === 0)
    throw new LogicParseError("component candidates must not be empty.");
  const seen = new Set<string>();
  for (const candidate of candidates) {
    if (typeof candidate !== "string" || !candidate.trim())
      throw new LogicParseError("component candidate must not be blank.");
    if (seen.has(candidate))
      throw new LogicParseError(
        `duplicate component candidate "${candidate}".`,
      );
    seen.add(candidate);
  }
}
