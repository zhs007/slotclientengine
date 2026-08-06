import { LogicParseError } from "../errors";
import type { GameLogic, LogicComponent } from "../types";
import type {
  ComponentSelection,
  IndexedOtherSceneSelection,
  IndexedResultSelection,
  IndexedSceneSelection,
  ServerComponentOperationSource,
  SlotOperationPosition,
} from "./types";

export type ComponentSelectionCardinality =
  | "exactly-one"
  | "zero-or-one"
  | "one-or-more";

export function selectServerComponentSource(options: {
  readonly logic: GameLogic;
  readonly stepIndex: number;
  readonly bindings: Readonly<
    Record<
      string,
      {
        readonly componentName: string;
        readonly componentIndex?: number;
        readonly cardinality?: ComponentSelectionCardinality;
        readonly positions?: unknown;
      }
    >
  >;
}): ServerComponentOperationSource {
  assertStepIndex(options.logic, options.stepIndex);
  const bindings: Record<string, ComponentSelection> = {};
  for (const [role, request] of Object.entries(options.bindings)) {
    if (!role.trim())
      throw new LogicParseError("component binding role must not be blank.");
    if (bindings[role])
      throw new LogicParseError(`duplicate component binding role "${role}".`);
    bindings[role] = selectComponent({
      logic: options.logic,
      stepIndex: options.stepIndex,
      ...request,
    });
  }
  return Object.freeze({
    kind: "server-component" as const,
    stepIndex: options.stepIndex,
    bindings: Object.freeze(bindings),
  });
}

export function selectComponent(options: {
  readonly logic: GameLogic;
  readonly stepIndex: number;
  readonly componentName: string;
  readonly componentIndex?: number;
  readonly cardinality?: ComponentSelectionCardinality;
  readonly positions?: unknown;
}): ComponentSelection {
  assertStepIndex(options.logic, options.stepIndex);
  if (!options.componentName.trim())
    throw new LogicParseError("componentName must not be blank.");
  if (options.componentIndex !== undefined && options.componentIndex !== 0)
    throw new LogicParseError(
      "componentIndex must be 0 for the current GameLogic component model.",
    );
  const component = options.logic.getComponent(
    options.stepIndex,
    options.componentName,
  );
  validateCardinality(
    component,
    options.cardinality ?? "exactly-one",
    options.componentName,
  );
  if (!component)
    return Object.freeze({
      componentName: options.componentName,
      ...(options.componentIndex === undefined ? {} : { componentIndex: 0 }),
      scenes: Object.freeze([]),
      otherScenes: Object.freeze([]),
      results: Object.freeze([]),
      positions: Object.freeze([]),
    });
  const step = options.logic.getStep(options.stepIndex);
  return Object.freeze({
    componentName: options.componentName,
    ...(options.componentIndex === undefined ? {} : { componentIndex: 0 }),
    scenes: Object.freeze(
      component.usedSceneIndexes.map(
        (index): IndexedSceneSelection =>
          Object.freeze({ index, value: step.getScene(index) }),
      ),
    ),
    otherScenes: Object.freeze(
      component.usedOtherSceneIndexes.map(
        (index): IndexedOtherSceneSelection =>
          Object.freeze({ index, value: step.getOtherScene(index) }),
      ),
    ),
    results: Object.freeze(
      component.usedResultIndexes.map(
        (index): IndexedResultSelection =>
          Object.freeze({ index, value: step.getResult(index) }),
      ),
    ),
    positions: parsePositions(
      options.positions ?? readRawPositions(component),
      `component "${options.componentName}" positions`,
    ),
  });
}

function validateCardinality(
  component: LogicComponent | undefined,
  cardinality: ComponentSelectionCardinality,
  name: string,
): void {
  if (cardinality === "exactly-one" && !component)
    throw new LogicParseError(`required component "${name}" is missing.`);
  if (cardinality === "one-or-more" && !component)
    throw new LogicParseError(
      `component "${name}" must occur one or more times.`,
    );
}

function readRawPositions(component: LogicComponent): unknown {
  const basic = component.basicComponentData as
    | Readonly<Record<string, unknown>>
    | undefined;
  return basic?.pos ?? [];
}

function parsePositions(
  value: unknown,
  path: string,
): readonly SlotOperationPosition[] {
  if (!Array.isArray(value))
    throw new LogicParseError(`${path} must be an array.`);
  if (value.length % 2 !== 0)
    throw new LogicParseError(`${path} must contain x/y pairs.`);
  const seen = new Set<string>();
  const positions: SlotOperationPosition[] = [];
  for (let index = 0; index < value.length; index += 2) {
    const x = value[index];
    const y = value[index + 1];
    if (!Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x < 0 || y < 0)
      throw new LogicParseError(
        `${path}[${index / 2}] must contain non-negative safe integers.`,
      );
    const key = `${x},${y}`;
    if (seen.has(key))
      throw new LogicParseError(`${path} contains duplicate ${key}.`);
    seen.add(key);
    positions.push(Object.freeze({ x: x as number, y: y as number }));
  }
  return Object.freeze(positions);
}

function assertStepIndex(logic: GameLogic, stepIndex: number): void {
  if (
    !Number.isSafeInteger(stepIndex) ||
    stepIndex < 0 ||
    stepIndex >= logic.getStepCount()
  )
    throw new LogicParseError(`stepIndex ${stepIndex} is out of range.`);
}
