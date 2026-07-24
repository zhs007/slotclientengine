import { LogicParseError } from "./errors";
import type {
  GameLogic,
  GameLogicStep,
  OtherSceneMatrix,
  SceneMatrix,
  WinResult,
} from "./types";
import { cloneAndFreeze } from "./validation";
import { getComponentWinResultGroups } from "./win-results";
import {
  validateSlotRoundFlowSymbolCatalog,
  type SlotRoundFlowProfileV1,
} from "./slot-round-flow";

export type SlotRoundPresentationValue = number | null;
export type SlotRoundValueMatrix = readonly (readonly (
  | SlotRoundPresentationValue
  | -1
)[])[];

export interface SlotRoundPosition {
  readonly x: number;
  readonly y: number;
}

export interface SlotRoundOccurrence {
  readonly id: string;
  readonly code: number;
  readonly symbol: string;
  readonly value: SlotRoundPresentationValue;
  readonly position: SlotRoundPosition;
}

export interface SlotRoundOccurrenceSnapshot {
  readonly scene: SceneMatrix;
  readonly values: SlotRoundValueMatrix;
  readonly occurrences: readonly SlotRoundOccurrence[];
}

export interface SlotRoundWinGroupPlan {
  readonly componentName: string;
  readonly stepIndex: number;
  readonly resultIndex: number;
  readonly result: WinResult;
  readonly positions: readonly SlotRoundPosition[];
  readonly occurrenceIds: readonly string[];
  readonly amount: number;
  readonly removePositions: readonly SlotRoundPosition[];
  readonly sequentialCollect: boolean;
  readonly primaryValueOccurrenceIds: readonly string[];
  readonly companionOccurrenceIds: readonly string[];
}

export interface SlotRoundMovementPlan {
  readonly occurrenceId: string;
  readonly kind: "existing" | "refill";
  readonly source: SlotRoundPosition;
  readonly target: SlotRoundPosition;
  readonly code: number;
  readonly symbol: string;
  readonly value: SlotRoundPresentationValue;
}

export interface SlotRoundWinStepPlan {
  readonly kind: "win";
  readonly index: number;
  readonly stepIndex: number;
  readonly input: SlotRoundOccurrenceSnapshot;
  readonly output: SlotRoundOccurrenceSnapshot;
  readonly groups: readonly SlotRoundWinGroupPlan[];
  readonly releaseOccurrenceIds: readonly string[];
  readonly requiredCapabilities: readonly SlotRoundCapability[];
}

export interface SlotRoundDropdownStepPlan {
  readonly kind: "dropdown";
  readonly index: number;
  readonly stepIndex: number;
  readonly input: SlotRoundOccurrenceSnapshot;
  readonly output: SlotRoundOccurrenceSnapshot;
  readonly movements: readonly SlotRoundMovementPlan[];
  readonly heldOccurrenceIds: readonly string[];
  readonly requiredCapabilities: readonly ["dropdown"];
}

export interface SlotRoundRefillStepPlan {
  readonly kind: "refill";
  readonly index: number;
  readonly stepIndex: number;
  readonly input: SlotRoundOccurrenceSnapshot;
  readonly output: SlotRoundOccurrenceSnapshot;
  readonly movements: readonly SlotRoundMovementPlan[];
  readonly requiredCapabilities: readonly ["refill"];
}

export type SlotRoundExecutionStep =
  | SlotRoundWinStepPlan
  | SlotRoundDropdownStepPlan
  | SlotRoundRefillStepPlan;

export interface SlotRoundExecutionPlan {
  readonly kind: "slot-round-execution-plan";
  readonly version: 1;
  readonly initial: SlotRoundOccurrenceSnapshot;
  readonly steps: readonly SlotRoundExecutionStep[];
  readonly final: SlotRoundOccurrenceSnapshot;
  readonly requiredCapabilities: readonly SlotRoundCapability[];
}

export type SlotRoundCapability =
  | "spin"
  | "visible-symbol-states"
  | "remove"
  | "dropdown"
  | "refill"
  | "sequential-collect";

export interface SlotRoundCompileContext {
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly columns?: number;
  readonly rows?: number;
}

/**
 * Compiles all server-owned scene, result and value data before presentation
 * mutation. The returned object contains no renderer objects or callbacks.
 */
export function compileSlotRoundExecutionPlan(
  profile: SlotRoundFlowProfileV1,
  round: GameLogic,
  context: SlotRoundCompileContext,
): SlotRoundExecutionPlan {
  const symbolNames = parseSymbolCodes(context.symbolCodes);
  validateSlotRoundFlowSymbolCatalog(profile, {
    activeSymbols: [...symbolNames.values()],
  });
  const cascade = profile.cascade;
  const emptyCode = cascade?.symbols.emptyCode ?? -1;
  if (symbolNames.has(emptyCode))
    throw new LogicParseError(
      `round emptyCode ${emptyCode} conflicts with an active display symbol.`,
    );
  const steps = round.getSteps();
  if (steps.length === 0)
    throw new LogicParseError("slot round must contain at least one step.");
  const initialScene = exactlyOneScene(
    steps[0],
    profile.components.spin,
    "initial spin",
  );
  const dimensions = validateScene(
    initialScene,
    context.columns,
    context.rows,
    emptyCode,
    symbolNames,
    false,
    "initial spin scene",
  );
  const initialValues = resolveFullValues({
    profile,
    step: steps[0],
    scene: initialScene,
    symbolNames,
    previous: undefined,
    newPositions: allPositions(initialScene),
    requireNewValueSymbols: false,
    label: "step[0] initial values",
  });
  let current = createInitialSnapshot(initialScene, initialValues, symbolNames);
  const execution: SlotRoundExecutionStep[] = [];
  let planIndex = 0;

  for (let stepOffset = 0; stepOffset < steps.length; stepOffset += 1) {
    const step = steps[stepOffset];
    if (step.getIndex() !== stepOffset)
      throw new LogicParseError(
        `slot round step index ${step.getIndex()} is not contiguous at ${stepOffset}.`,
      );
    if (stepOffset > 0) {
      if (!cascade)
        throw new LogicParseError(
          `base round cannot contain cascade step[${stepOffset}].`,
        );
      if (
        cascade.components.stepMarker &&
        !step.hasComponent(cascade.components.stepMarker)
      )
        throw new LogicParseError(
          `step[${stepOffset}] must trigger cascade step marker "${cascade.components.stepMarker}".`,
        );
      const dropdownScene = exactlyOneScene(
        step,
        cascade.components.dropdown,
        `step[${stepOffset}] dropdown`,
      );
      validateScene(
        dropdownScene,
        dimensions.columns,
        dimensions.rows,
        emptyCode,
        symbolNames,
        true,
        `step[${stepOffset}] dropdown scene`,
      );
      const dropdownValues = resolveDerivedValues({
        profile,
        step,
        componentName: cascade.components.dropdown,
        scene: dropdownScene,
        derived: deriveDropdownValues(
          current,
          dropdownScene,
          cascade.symbols.dropHeldSymbols,
          emptyCode,
        ),
        symbolNames,
        emptyCode,
        label: `step[${stepOffset}] dropdown values`,
      });
      const dropdown = compileDropdown(
        current,
        dropdownScene,
        dropdownValues,
        cascade.symbols.dropHeldSymbols,
        emptyCode,
        stepOffset,
        planIndex++,
      );
      execution.push(dropdown);
      current = dropdown.output;

      const refillScene = exactlyOneScene(
        step,
        cascade.components.refill,
        `step[${stepOffset}] refill`,
      );
      validateScene(
        refillScene,
        dimensions.columns,
        dimensions.rows,
        emptyCode,
        symbolNames,
        false,
        `step[${stepOffset}] refill scene`,
      );
      const refillPositions = parseRefillPositions(
        step,
        cascade.components.refill,
        current.scene,
        emptyCode,
      );
      const refillValues = resolveFullValues({
        profile,
        step,
        scene: refillScene,
        symbolNames,
        previous: current.values,
        newPositions: refillPositions,
        requireNewValueSymbols: true,
        label: `step[${stepOffset}] refill values`,
      });
      const refill = compileRefill(
        current,
        refillScene,
        refillValues,
        refillPositions,
        symbolNames,
        emptyCode,
        stepOffset,
        planIndex++,
      );
      execution.push(refill);
      current = refill.output;
    }

    const groups = compileWinGroups(profile, step, current, cascade);
    if (groups.length === 0) {
      if (stepOffset !== steps.length - 1)
        throw new LogicParseError(
          `terminal step[${stepOffset}] leaves unconsumed cascade steps.`,
        );
      continue;
    }
    if (!cascade) {
      const requiredCapabilities: SlotRoundCapability[] = [
        "visible-symbol-states",
      ];
      if (groups.some((group) => group.sequentialCollect))
        requiredCapabilities.push("sequential-collect");
      execution.push(
        Object.freeze({
          kind: "win",
          index: planIndex++,
          stepIndex: stepOffset,
          input: current,
          output: current,
          groups: Object.freeze(
            groups.map((group) =>
              Object.freeze({
                ...group,
                removePositions: Object.freeze([]),
              }),
            ),
          ),
          releaseOccurrenceIds: Object.freeze([]),
          requiredCapabilities: Object.freeze(requiredCapabilities),
        }),
      );
      continue;
    }
    if (!step.hasComponent(cascade.components.remove))
      throw new LogicParseError(
        `winning step[${stepOffset}] must trigger remove component "${cascade.components.remove}".`,
      );
    const removedScene = exactlyOneScene(
      step,
      cascade.components.remove,
      `step[${stepOffset}] remove`,
    );
    validateScene(
      removedScene,
      dimensions.columns,
      dimensions.rows,
      emptyCode,
      symbolNames,
      true,
      `step[${stepOffset}] remove scene`,
    );
    const derivedRemoved = deriveRemovedSnapshot(current, groups, emptyCode);
    assertMatrixEqual(
      removedScene,
      derivedRemoved.scene,
      `step[${stepOffset}] remove scene`,
    );
    const removedValues = resolveDerivedValues({
      profile,
      step,
      componentName: cascade.components.remove,
      scene: removedScene,
      derived: derivedRemoved.values,
      symbolNames,
      emptyCode,
      label: `step[${stepOffset}] remove values`,
    });
    assertMatrixEqual(
      removedValues,
      derivedRemoved.values,
      `step[${stepOffset}] remove values`,
    );
    const output = snapshotFromOccurrences(
      removedScene,
      removedValues,
      derivedRemoved.occurrences,
    );
    const requiredCapabilities: SlotRoundCapability[] = [
      "visible-symbol-states",
      "remove",
    ];
    if (groups.some((group) => group.sequentialCollect))
      requiredCapabilities.push("sequential-collect");
    execution.push(
      Object.freeze({
        kind: "win",
        index: planIndex++,
        stepIndex: stepOffset,
        input: current,
        output,
        groups,
        releaseOccurrenceIds: Object.freeze(
          groups.flatMap((group) =>
            group.removePositions.map(
              (position) => requireOccurrence(current, position).id,
            ),
          ),
        ),
        requiredCapabilities: Object.freeze(requiredCapabilities),
      }),
    );
    current = output;
    if (stepOffset === steps.length - 1)
      throw new LogicParseError(
        `winning step[${stepOffset}] must be followed by a cascade step.`,
      );
  }

  if (current.scene.some((column) => column.includes(emptyCode)))
    throw new LogicParseError("slot round final scene must not contain holes.");
  const required = new Set<SlotRoundCapability>(["spin"]);
  for (const step of execution)
    for (const capability of step.requiredCapabilities)
      required.add(capability);
  return cloneAndFreeze({
    kind: "slot-round-execution-plan" as const,
    version: 1 as const,
    initial: currentPlanInitial(initialScene, initialValues, symbolNames),
    steps: execution,
    final: current,
    requiredCapabilities: [...required],
  });
}

function currentPlanInitial(
  scene: SceneMatrix,
  values: SlotRoundValueMatrix,
  names: ReadonlyMap<number, string>,
): SlotRoundOccurrenceSnapshot {
  return createInitialSnapshot(scene, values, names);
}

function parseSymbolCodes(
  input: Readonly<Record<string, number>>,
): ReadonlyMap<number, string> {
  if (!input || typeof input !== "object" || Array.isArray(input))
    throw new LogicParseError("symbolCodes must be an object.");
  const names = new Map<number, string>();
  for (const [symbol, code] of Object.entries(input)) {
    if (!symbol.trim())
      throw new LogicParseError("symbolCodes contains a blank symbol name.");
    if (!Number.isSafeInteger(code) || code < 0)
      throw new LogicParseError(
        `symbolCodes.${symbol} must be a non-negative safe integer.`,
      );
    if (names.has(code))
      throw new LogicParseError(`symbolCodes contains duplicate code ${code}.`);
    names.set(code, symbol);
  }
  if (names.size === 0)
    throw new LogicParseError("symbolCodes must not be empty.");
  return names;
}

function validateScene(
  scene: SceneMatrix,
  expectedColumns: number | undefined,
  expectedRows: number | undefined,
  emptyCode: number,
  names: ReadonlyMap<number, string>,
  allowHoles: boolean,
  label: string,
): { readonly columns: number; readonly rows: number } {
  if (!Array.isArray(scene) || scene.length === 0)
    throw new LogicParseError(`${label} must contain columns.`);
  if (expectedColumns !== undefined && scene.length !== expectedColumns)
    throw new LogicParseError(
      `${label} must contain ${expectedColumns} columns.`,
    );
  const rows = scene[0]?.length ?? 0;
  if (rows === 0 || (expectedRows !== undefined && rows !== expectedRows))
    throw new LogicParseError(
      `${label} must contain ${expectedRows ?? "one or more"} rows.`,
    );
  scene.forEach((column, x) => {
    if (!Array.isArray(column) || column.length !== rows)
      throw new LogicParseError(`${label}[${x}] height must be ${rows}.`);
    column.forEach((code, y) => {
      if (code === emptyCode) {
        if (!allowHoles)
          throw new LogicParseError(`${label}[${x}][${y}] must not be empty.`);
      } else if (!names.has(code)) {
        throw new LogicParseError(
          `${label}[${x}][${y}] uses unknown symbol code ${code}.`,
        );
      }
    });
  });
  return { columns: scene.length, rows };
}

function exactlyOneScene(
  step: GameLogicStep,
  componentName: string,
  label: string,
): SceneMatrix {
  if (!step.hasComponent(componentName))
    throw new LogicParseError(
      `${label} must trigger component "${componentName}".`,
    );
  const scenes = step.getComponentScenes(componentName);
  if (scenes.length !== 1)
    throw new LogicParseError(
      `${label} component "${componentName}" must reference exactly one scene; received ${scenes.length}.`,
    );
  return scenes[0];
}

function createInitialSnapshot(
  scene: SceneMatrix,
  values: SlotRoundValueMatrix,
  names: ReadonlyMap<number, string>,
): SlotRoundOccurrenceSnapshot {
  const occurrences: SlotRoundOccurrence[] = [];
  scene.forEach((column, x) =>
    column.forEach((code, y) => {
      occurrences.push(
        Object.freeze({
          id: `initial:${x}:${y}`,
          code,
          symbol: names.get(code)!,
          value: normalizeValue(values[x][y]),
          position: Object.freeze({ x, y }),
        }),
      );
    }),
  );
  return snapshotFromOccurrences(scene, values, occurrences);
}

function compileWinGroups(
  profile: SlotRoundFlowProfileV1,
  step: GameLogicStep,
  snapshot: SlotRoundOccurrenceSnapshot,
  cascade: SlotRoundFlowProfileV1["cascade"],
): readonly SlotRoundWinGroupPlan[] {
  const raw = profile.components.wins.flatMap((componentName) =>
    getComponentWinResultGroups(step, componentName, {
      scene: snapshot.scene,
    }).map((group) => ({ componentName, ...group })),
  );
  if (raw.length === 0) return Object.freeze([]);
  const lastUse = new Map<string, number>();
  raw.forEach((group, groupIndex) =>
    group.positions.forEach((position) =>
      lastUse.set(positionKey(position), groupIndex),
    ),
  );
  const valueSymbols = new Set(cascade?.symbols.valueSymbols ?? []);
  const allowedCompanions = new Set(
    cascade?.symbols.sequentialWinCompanionSymbols ?? [],
  );
  const excluded = new Set(cascade?.symbols.removeExcludedSymbols ?? []);
  return Object.freeze(
    raw.map((group, groupIndex) => {
      const occurrences = group.positions.map((position) =>
        requireOccurrence(snapshot, position),
      );
      const hasValue = occurrences.some((item) =>
        valueSymbols.has(item.symbol),
      );
      const companions = hasValue
        ? occurrences.filter((item) => !valueSymbols.has(item.symbol))
        : [];
      const primaryValues = hasValue
        ? occurrences.filter((item) => valueSymbols.has(item.symbol))
        : [];
      for (const item of companions)
        if (!allowedCompanions.has(item.symbol))
          throw new LogicParseError(
            `step[${step.getIndex()}] result[${group.resultIndex}] mixes value symbol with unapproved sequential companion "${item.symbol}".`,
          );
      return Object.freeze({
        componentName: group.componentName,
        stepIndex: group.stepIndex,
        resultIndex: group.resultIndex,
        result: group.result,
        positions: group.positions,
        occurrenceIds: Object.freeze(occurrences.map((item) => item.id)),
        amount: resolveAmount(profile, group.result, group.resultIndex),
        removePositions: Object.freeze(
          group.positions.filter((position) => {
            const occurrence = requireOccurrence(snapshot, position);
            return (
              lastUse.get(positionKey(position)) === groupIndex &&
              !excluded.has(occurrence.symbol)
            );
          }),
        ),
        sequentialCollect: hasValue,
        primaryValueOccurrenceIds: Object.freeze(
          primaryValues.map((item) => item.id),
        ),
        companionOccurrenceIds: Object.freeze(
          companions.map((item) => item.id),
        ),
      });
    }),
  );
}

function resolveAmount(
  profile: SlotRoundFlowProfileV1,
  result: WinResult,
  resultIndex: number,
): number {
  const field = profile.amount.cashFields.find(
    (candidate) => result[candidate] !== undefined,
  );
  if (!field)
    throw new LogicParseError(
      `win result[${resultIndex}] has no configured cash amount field.`,
    );
  const value = result[field];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0)
    throw new LogicParseError(
      `win result[${resultIndex}].${field} must be a positive safe integer.`,
    );
  return value;
}

function deriveRemovedSnapshot(
  input: SlotRoundOccurrenceSnapshot,
  groups: readonly SlotRoundWinGroupPlan[],
  emptyCode: number,
): SlotRoundOccurrenceSnapshot {
  const removed = new Set(
    groups.flatMap((group) => group.removePositions.map(positionKey)),
  );
  const scene = input.scene.map((column, x) =>
    Object.freeze(
      column.map((code, y) => (removed.has(`${x},${y}`) ? emptyCode : code)),
    ),
  );
  const values = input.values.map((column, x) =>
    Object.freeze(
      column.map((value, y) => (removed.has(`${x},${y}`) ? -1 : value)),
    ),
  );
  return snapshotFromOccurrences(
    scene,
    values,
    input.occurrences.filter(
      (occurrence) => !removed.has(positionKey(occurrence.position)),
    ),
  );
}

function deriveDropdownValues(
  input: SlotRoundOccurrenceSnapshot,
  outputScene: SceneMatrix,
  heldSymbols: readonly string[],
  emptyCode: number,
): SlotRoundValueMatrix {
  const held = new Set(heldSymbols);
  return Object.freeze(
    input.scene.map((_column, x) => {
      const source = input.occurrences
        .filter((item) => item.position.x === x)
        .sort((left, right) => left.position.y - right.position.y);
      const fixed = source.filter((item) => held.has(item.symbol));
      const fixedRows = new Set(fixed.map((item) => item.position.y));
      const targets = outputScene[x].flatMap((code, y) =>
        code === emptyCode || fixedRows.has(y) ? [] : [{ code, y }],
      );
      const moving = source.filter((item) => !held.has(item.symbol));
      if (targets.length !== moving.length)
        throw new LogicParseError(
          `dropdown column ${x} occurrence count changed.`,
        );
      const values: Array<SlotRoundPresentationValue | -1> = outputScene[x].map(
        (code) => (code === emptyCode ? -1 : null),
      );
      for (const item of fixed) {
        if (outputScene[x][item.position.y] !== item.code)
          throw new LogicParseError(
            `held occurrence "${item.id}" changed at (${x},${item.position.y}).`,
          );
        values[item.position.y] = item.value;
      }
      moving.forEach((item, index) => {
        const target = targets[index];
        if (target.code !== item.code || target.y < item.position.y)
          throw new LogicParseError(
            `dropdown occurrence "${item.id}" cannot map to (${x},${target.y}).`,
          );
        values[target.y] = item.value;
      });
      return Object.freeze(values);
    }),
  );
}

function compileDropdown(
  input: SlotRoundOccurrenceSnapshot,
  scene: SceneMatrix,
  values: SlotRoundValueMatrix,
  heldSymbols: readonly string[],
  emptyCode: number,
  stepIndex: number,
  index: number,
): SlotRoundDropdownStepPlan {
  const held = new Set(heldSymbols);
  const occurrences: SlotRoundOccurrence[] = [];
  const movements: SlotRoundMovementPlan[] = [];
  const heldIds: string[] = [];
  for (let x = 0; x < scene.length; x += 1) {
    const source = input.occurrences
      .filter((item) => item.position.x === x)
      .sort((left, right) => left.position.y - right.position.y);
    const fixed = source.filter((item) => held.has(item.symbol));
    const fixedRows = new Set(fixed.map((item) => item.position.y));
    const targets = scene[x].flatMap((code, y) =>
      code === emptyCode || fixedRows.has(y) ? [] : [{ code, y }],
    );
    const moving = source.filter((item) => !held.has(item.symbol));
    moving.forEach((item, occurrenceIndex) => {
      const target = Object.freeze({ x, y: targets[occurrenceIndex].y });
      const moved = Object.freeze({ ...item, position: target });
      occurrences.push(moved);
      if (target.y !== item.position.y)
        movements.push(
          Object.freeze({
            occurrenceId: item.id,
            kind: "existing",
            source: item.position,
            target,
            code: item.code,
            symbol: item.symbol,
            value: item.value,
          }),
        );
    });
    fixed.forEach((item) => {
      heldIds.push(item.id);
      occurrences.push(item);
    });
  }
  return Object.freeze({
    kind: "dropdown",
    index,
    stepIndex,
    input,
    output: snapshotFromOccurrences(scene, values, occurrences),
    movements: Object.freeze(movements),
    heldOccurrenceIds: Object.freeze(heldIds),
    requiredCapabilities: Object.freeze(["dropdown"] as const),
  });
}

function compileRefill(
  input: SlotRoundOccurrenceSnapshot,
  scene: SceneMatrix,
  values: SlotRoundValueMatrix,
  refillPositions: readonly SlotRoundPosition[],
  names: ReadonlyMap<number, string>,
  emptyCode: number,
  stepIndex: number,
  index: number,
): SlotRoundRefillStepPlan {
  const refillKeys = new Set(refillPositions.map(positionKey));
  const occurrences = [...input.occurrences];
  const movements = refillPositions.map((target) => {
    if (input.scene[target.x][target.y] !== emptyCode)
      throw new LogicParseError(
        `refill target (${target.x},${target.y}) is not a hole.`,
      );
    const code = scene[target.x][target.y];
    const symbol = names.get(code)!;
    const value = normalizeValue(values[target.x][target.y]);
    const id = `refill:${stepIndex}:${target.x}:${target.y}`;
    const source = Object.freeze({ x: target.x, y: -1 });
    occurrences.push(
      Object.freeze({
        id,
        code,
        symbol,
        value,
        position: target,
      }),
    );
    return Object.freeze({
      occurrenceId: id,
      kind: "refill" as const,
      source,
      target,
      code,
      symbol,
      value,
    });
  });
  forEachCell(scene, (x, y) => {
    if (refillKeys.has(`${x},${y}`)) return;
    if (
      scene[x][y] !== input.scene[x][y] ||
      values[x][y] !== input.values[x][y]
    )
      throw new LogicParseError(
        `refill changed carried occurrence at (${x},${y}).`,
      );
  });
  return Object.freeze({
    kind: "refill",
    index,
    stepIndex,
    input,
    output: snapshotFromOccurrences(scene, values, occurrences),
    movements: Object.freeze(movements),
    requiredCapabilities: Object.freeze(["refill"] as const),
  });
}

function parseRefillPositions(
  step: GameLogicStep,
  componentName: string,
  scene: SceneMatrix,
  emptyCode: number,
): readonly SlotRoundPosition[] {
  const component = step.getComponent(componentName);
  if (!component?.hasBasicComponentData)
    throw new LogicParseError(
      `step[${step.getIndex()}] refill component "${componentName}" must include basicComponentData.`,
    );
  const value = component.basicComponentData?.pos;
  if (!Array.isArray(value) || value.length === 0 || value.length % 2 !== 0)
    throw new LogicParseError(
      `step[${step.getIndex()}] refill component "${componentName}".pos must contain non-empty x/y pairs.`,
    );
  const seen = new Set<string>();
  const positions: SlotRoundPosition[] = [];
  for (let offset = 0; offset < value.length; offset += 2) {
    const x = value[offset];
    const y = value[offset + 1];
    if (
      !Number.isSafeInteger(x) ||
      !Number.isSafeInteger(y) ||
      (x as number) < 0 ||
      (y as number) < 0 ||
      (x as number) >= scene.length ||
      (y as number) >= scene[x as number].length
    )
      throw new LogicParseError(
        `step[${step.getIndex()}] refill position (${String(x)},${String(y)}) is out of range.`,
      );
    const position = Object.freeze({ x: x as number, y: y as number });
    const key = positionKey(position);
    if (seen.has(key))
      throw new LogicParseError(
        `step[${step.getIndex()}] refill positions contain duplicate ${key}.`,
      );
    seen.add(key);
    positions.push(position);
  }
  const holes = new Set<string>();
  forEachCell(scene, (x, y) => {
    if (scene[x][y] === emptyCode) holes.add(`${x},${y}`);
  });
  if (
    holes.size !== seen.size ||
    [...holes].some((candidate) => !seen.has(candidate))
  )
    throw new LogicParseError(
      `step[${step.getIndex()}] refill positions must match dropdown holes exactly.`,
    );
  return Object.freeze(positions);
}

function resolveFullValues(options: {
  readonly profile: SlotRoundFlowProfileV1;
  readonly step: GameLogicStep;
  readonly scene: SceneMatrix;
  readonly symbolNames: ReadonlyMap<number, string>;
  readonly previous: SlotRoundValueMatrix | undefined;
  readonly newPositions: readonly SlotRoundPosition[];
  readonly requireNewValueSymbols: boolean;
  readonly label: string;
}): SlotRoundValueMatrix {
  const valueSymbols = new Set(
    options.profile.cascade?.symbols.valueSymbols ?? [],
  );
  const auxiliaryValueSymbols = new Set(
    options.profile.cascade?.symbols.sequentialWinCompanionSymbols ?? [],
  );
  const updateNames = options.profile.components.valueUpdates ?? [];
  const scenes = updateNames.flatMap((name) =>
    options.step.getComponentOtherScenes(name),
  );
  if (scenes.length > 1)
    throw new LogicParseError(
      `${options.label} must use at most one otherScene.`,
    );
  const authoritative = scenes[0];
  if (authoritative)
    return parseAuthoritativeValues(
      authoritative,
      options.scene,
      options.symbolNames,
      valueSymbols,
      auxiliaryValueSymbols,
      options.label,
    );
  const newKeys = new Set(options.newPositions.map(positionKey));
  return Object.freeze(
    options.scene.map((column, x) =>
      Object.freeze(
        column.map((code, y) => {
          if (!newKeys.has(`${x},${y}`) && options.previous)
            return options.previous[x][y];
          const symbol = options.symbolNames.get(code)!;
          if (options.requireNewValueSymbols && valueSymbols.has(symbol))
            throw new LogicParseError(
              `${options.label} is missing authoritative value for "${symbol}" at (${x},${y}).`,
            );
          return null;
        }),
      ),
    ),
  );
}

function resolveDerivedValues(options: {
  readonly profile: SlotRoundFlowProfileV1;
  readonly step: GameLogicStep;
  readonly componentName: string;
  readonly scene: SceneMatrix;
  readonly derived: SlotRoundValueMatrix;
  readonly symbolNames: ReadonlyMap<number, string>;
  readonly emptyCode: number;
  readonly label: string;
}): SlotRoundValueMatrix {
  const scenes = options.step.getComponentOtherScenes(options.componentName);
  if (scenes.length > 1)
    throw new LogicParseError(
      `${options.label} must use at most one otherScene.`,
    );
  if (!scenes[0]) return options.derived;
  const parsed = parseAuthoritativeHoleValues(
    scenes[0],
    options.scene,
    options.symbolNames,
    new Set(options.profile.cascade?.symbols.valueSymbols ?? []),
    options.emptyCode,
    options.label,
  );
  assertMatrixEqual(parsed, options.derived, options.label);
  return parsed;
}

function parseAuthoritativeValues(
  other: OtherSceneMatrix,
  scene: SceneMatrix,
  names: ReadonlyMap<number, string>,
  valueSymbols: ReadonlySet<string>,
  auxiliaryValueSymbols: ReadonlySet<string>,
  label: string,
): SlotRoundValueMatrix {
  assertDimensions(other, scene, label);
  return Object.freeze(
    scene.map((column, x) =>
      Object.freeze(
        column.map((code, y) => {
          const raw = other[x][y];
          const symbol = names.get(code)!;
          if (valueSymbols.has(symbol)) {
            if (!Number.isSafeInteger(raw) || raw <= 0)
              throw new LogicParseError(
                `${label}[${x}][${y}] value must be a positive safe integer.`,
              );
            return raw;
          }
          if (auxiliaryValueSymbols.has(symbol)) {
            if (!Number.isSafeInteger(raw) || raw < 0)
              throw new LogicParseError(
                `${label}[${x}][${y}] auxiliary value must be a non-negative safe integer.`,
              );
            // Sequential companions can carry server-owned values even when
            // the active client has no presentation binding for them.
            return null;
          }
          if (raw !== 0)
            throw new LogicParseError(
              `${label}[${x}][${y}] non-value symbol must use zero.`,
            );
          return null;
        }),
      ),
    ),
  );
}

function parseAuthoritativeHoleValues(
  other: OtherSceneMatrix,
  scene: SceneMatrix,
  names: ReadonlyMap<number, string>,
  valueSymbols: ReadonlySet<string>,
  emptyCode: number,
  label: string,
): SlotRoundValueMatrix {
  assertDimensions(other, scene, label);
  return Object.freeze(
    scene.map((column, x) =>
      Object.freeze(
        column.map((code, y) => {
          const raw = other[x][y];
          if (code === emptyCode) {
            if (raw !== emptyCode)
              throw new LogicParseError(
                `${label}[${x}][${y}] hole value must equal emptyCode.`,
              );
            return -1;
          }
          const symbol = names.get(code)!;
          if (valueSymbols.has(symbol)) {
            if (!Number.isSafeInteger(raw) || raw <= 0)
              throw new LogicParseError(
                `${label}[${x}][${y}] value must be a positive safe integer.`,
              );
            return raw;
          }
          // Some servers retain auxiliary values outside the app-owned value
          // symbol. Those bytes are validated as integers but do not become a
          // presentation value.
          if (!Number.isSafeInteger(raw) || raw < 0)
            throw new LogicParseError(
              `${label}[${x}][${y}] must be a non-negative safe integer.`,
            );
          return null;
        }),
      ),
    ),
  );
}

function snapshotFromOccurrences(
  scene: SceneMatrix,
  values: SlotRoundValueMatrix,
  occurrences: readonly SlotRoundOccurrence[],
): SlotRoundOccurrenceSnapshot {
  const sorted = [...occurrences].sort(
    (left, right) =>
      left.position.x - right.position.x || left.position.y - right.position.y,
  );
  return Object.freeze({
    scene: Object.freeze(scene.map((column) => Object.freeze([...column]))),
    values: Object.freeze(values.map((column) => Object.freeze([...column]))),
    occurrences: Object.freeze(sorted),
  });
}

function requireOccurrence(
  snapshot: SlotRoundOccurrenceSnapshot,
  position: SlotRoundPosition,
): SlotRoundOccurrence {
  const occurrence = snapshot.occurrences.find(
    (candidate) =>
      candidate.position.x === position.x &&
      candidate.position.y === position.y,
  );
  if (!occurrence)
    throw new LogicParseError(
      `no occurrence exists at (${position.x},${position.y}).`,
    );
  return occurrence;
}

function normalizeValue(
  value: SlotRoundPresentationValue | -1,
): SlotRoundPresentationValue {
  return value === -1 ? null : value;
}

function allPositions(scene: SceneMatrix): readonly SlotRoundPosition[] {
  return Object.freeze(
    scene.flatMap((column, x) =>
      column.map((_code, y) => Object.freeze({ x, y })),
    ),
  );
}

function assertDimensions(
  value: readonly (readonly unknown[])[],
  scene: SceneMatrix,
  label: string,
): void {
  if (!Array.isArray(value) || value.length !== scene.length)
    throw new LogicParseError(`${label} width must match scene.`);
  value.forEach((column, x) => {
    if (!Array.isArray(column) || column.length !== scene[x].length)
      throw new LogicParseError(`${label}[${x}] height must match scene.`);
  });
}

function assertMatrixEqual(
  actual: readonly (readonly unknown[])[],
  expected: readonly (readonly unknown[])[],
  label: string,
): void {
  if (
    actual.length !== expected.length ||
    actual.some(
      (column, x) =>
        column.length !== expected[x]?.length ||
        column.some((value, y) => value !== expected[x]?.[y]),
    )
  )
    throw new LogicParseError(
      `${label} does not match compiled occurrence state.`,
    );
}

function forEachCell(
  scene: readonly (readonly unknown[])[],
  callback: (x: number, y: number) => void,
): void {
  scene.forEach((column, x) => column.forEach((_value, y) => callback(x, y)));
}

function positionKey(position: SlotRoundPosition): string {
  return `${position.x},${position.y}`;
}
