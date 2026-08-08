import { LogicParseError } from "../errors";
import type {
  SlotOperationOccurrence,
  SlotOperationPosition,
  SlotOperationSnapshot,
  SlotOperationSource,
} from "./types";
import { deriveSlotStateMutations } from "./mutation-derivation";
import type {
  SlotChgPayload,
  SlotChgRoute,
  SlotPresentationDraftV2,
  SlotPresentationTarget,
  SlotSceneLandingDraftV2,
  SlotStateMutation,
  SlotStateMutationDraftV2,
} from "./v2-types";

type SnapshotMatrix = readonly (readonly (number | null | -1)[])[];

export interface SlotOperationChangeDraft {
  readonly position: SlotOperationPosition;
  readonly outputCode: number;
  readonly outputValue: number | null;
}

export interface SlotOperationRelocationDraft {
  readonly source: SlotOperationPosition;
  readonly target: SlotOperationPosition;
}

interface OperationGeneratorCommon<Payload> {
  readonly source: SlotOperationSource;
  readonly payload: Payload;
  readonly businessKey?: string;
}

export function genSpinOperation<
  Kind extends string = "slot:spin",
  Payload = unknown,
>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind?: Kind;
    readonly scene: readonly (readonly number[])[];
    readonly values: SnapshotMatrix;
    readonly symbolCodes: Readonly<Record<string, number>>;
    readonly occurrenceIdPrefix?: string;
  },
): SlotSceneLandingDraftV2<Kind, 2, Payload> {
  const output = createSlotOperationSnapshot({
    scene: options.scene,
    values: options.values,
    symbolCodes: options.symbolCodes,
    occurrenceIdPrefix: options.occurrenceIdPrefix ?? "spin",
  });
  return Object.freeze({
    kind: (options.kind ?? "slot:spin") as Kind,
    version: 2 as const,
    effect: "scene-landing" as const,
    source: options.source,
    output,
    payload: options.payload,
    ...(options.businessKey === undefined
      ? {}
      : { businessKey: options.businessKey }),
  });
}

export function genWinOperation<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind: Kind;
    readonly targets?: readonly SlotPresentationTarget[];
  },
): SlotPresentationDraftV2<Kind, 2, Payload> {
  return Object.freeze({
    kind: options.kind,
    version: 2 as const,
    effect: "presentation" as const,
    source: options.source,
    payload: options.payload,
    ...(options.targets === undefined ? {} : { targets: options.targets }),
    ...(options.businessKey === undefined
      ? {}
      : { businessKey: options.businessKey }),
  });
}

interface GenChgCommon<Kind extends string> {
  readonly kind: Kind;
  readonly source: SlotOperationSource;
  readonly input: SlotOperationSnapshot;
  readonly changes: readonly SlotOperationChangeDraft[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly replacementIdPrefix?: string;
  readonly businessKey?: string;
}

export function genChg<Kind extends string>(
  options: GenChgCommon<Kind> &
    (
      | { readonly type: "change" }
      | {
          readonly type: "driven-change";
          readonly mainPos: readonly SlotOperationPosition[];
        }
      | {
          readonly type: "transfer";
          readonly mainPos: readonly SlotOperationPosition[];
          readonly routes: readonly SlotChgRoute[];
        }
    ),
): SlotStateMutationDraftV2<Kind, 2, SlotStateMutation, SlotChgPayload> {
  const pos = freezePositions(
    options.changes.map(({ position }) => position),
    options.input.scene,
    "chg.pos",
  );
  const mainPos =
    options.type === "change"
      ? undefined
      : freezePositions(options.mainPos, options.input.scene, "chg.mainPos");
  const routes =
    options.type === "transfer"
      ? Object.freeze(
          options.routes.map((route, index) =>
            Object.freeze({
              source: freezePosition(
                route.source,
                options.input.scene,
                `chg.routes[${index}].source`,
              ),
              target: freezePosition(
                route.target,
                options.input.scene,
                `chg.routes[${index}].target`,
              ),
            }),
          ),
        )
      : undefined;
  const payload =
    options.type === "change"
      ? Object.freeze({ type: options.type, pos })
      : options.type === "driven-change"
        ? Object.freeze({ type: options.type, mainPos: mainPos!, pos })
        : Object.freeze({
            type: options.type,
            mainPos: mainPos!,
            routes: routes!,
          });
  const output = applySlotOperationChanges({
    input: options.input,
    changes: options.changes,
    ...(routes === undefined ? {} : { relocations: routes }),
    symbolCodes: options.symbolCodes,
    replacementIdPrefix: options.replacementIdPrefix,
  });
  return mutationDraft(
    { ...options, payload },
    output,
    options.changes.length === 0,
  );
}

export function genRemoveOperation<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind: Kind;
    readonly input: SlotOperationSnapshot;
    readonly outputScene: readonly (readonly number[])[];
    readonly outputValues: SnapshotMatrix;
    readonly emptyCode?: number;
  },
): SlotStateMutationDraftV2<Kind, 2, SlotStateMutation, Payload> {
  const emptyCode = options.emptyCode ?? -1;
  assertSnapshotShape(options.outputScene, options.outputValues, "remove");
  const occurrences = options.input.occurrences.filter((occurrence) => {
    const { x, y } = occurrence.position;
    const outputCode = options.outputScene[x]?.[y];
    const outputValue = options.outputValues[x]?.[y];
    if (outputCode === emptyCode) {
      if (outputValue !== emptyCode)
        throw new LogicParseError(
          `remove output value at (${x},${y}) must use emptyCode ${emptyCode}.`,
        );
      return false;
    }
    if (outputCode !== occurrence.code || outputValue !== occurrence.value)
      throw new LogicParseError(
        `remove changed retained occurrence "${occurrence.id}" at (${x},${y}).`,
      );
    return true;
  });
  const output = freezeSnapshot(
    options.outputScene,
    options.outputValues,
    occurrences,
  );
  return mutationDraft(options, output);
}

export function genDropdownOperation<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind: Kind;
    readonly input: SlotOperationSnapshot;
    readonly outputScene: readonly (readonly number[])[];
    readonly outputValues: SnapshotMatrix;
    readonly heldSymbols?: readonly string[];
    readonly emptyCode?: number;
  },
): SlotStateMutationDraftV2<Kind, 2, SlotStateMutation, Payload> {
  const emptyCode = options.emptyCode ?? -1;
  const heldSymbols = new Set(options.heldSymbols ?? []);
  assertSnapshotShape(options.outputScene, options.outputValues, "dropdown");
  const occurrences: SlotOperationOccurrence[] = [];
  for (let x = 0; x < options.outputScene.length; x += 1) {
    const source = options.input.occurrences
      .filter((occurrence) => occurrence.position.x === x)
      .sort((left, right) => left.position.y - right.position.y);
    const held = source.filter((occurrence) =>
      heldSymbols.has(occurrence.symbol),
    );
    const heldRows = new Set(held.map((occurrence) => occurrence.position.y));
    for (const occurrence of held) {
      const { y } = occurrence.position;
      if (
        options.outputScene[x]?.[y] !== occurrence.code ||
        options.outputValues[x]?.[y] !== occurrence.value
      )
        throw new LogicParseError(
          `dropdown changed held occurrence "${occurrence.id}" at (${x},${y}).`,
        );
      occurrences.push(occurrence);
    }
    const targets = options.outputScene[x]!.flatMap((code, y) =>
      code === emptyCode || heldRows.has(y) ? [] : [{ code, y }],
    );
    const moving = source.filter(
      (occurrence) => !heldSymbols.has(occurrence.symbol),
    );
    if (targets.length !== moving.length)
      throw new LogicParseError(
        `dropdown column ${x} contains ${targets.length} targets for ${moving.length} movable occurrences.`,
      );
    moving.forEach((occurrence, index) => {
      const target = targets[index]!;
      if (
        target.code !== occurrence.code ||
        target.y < occurrence.position.y ||
        options.outputValues[x]?.[target.y] !== occurrence.value
      )
        throw new LogicParseError(
          `dropdown cannot move occurrence "${occurrence.id}" to (${x},${target.y}).`,
        );
      occurrences.push(
        Object.freeze({
          ...occurrence,
          position: Object.freeze({ x, y: target.y }),
        }),
      );
    });
  }
  const output = freezeSnapshot(
    options.outputScene,
    options.outputValues,
    occurrences,
  );
  return mutationDraft(options, output);
}

export function genRefillOperation<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind: Kind;
    readonly input: SlotOperationSnapshot;
    readonly outputScene: readonly (readonly number[])[];
    readonly outputValues: SnapshotMatrix;
    readonly positions: readonly SlotOperationPosition[];
    readonly symbolCodes: Readonly<Record<string, number>>;
    readonly occurrenceIdPrefix?: string;
    readonly emptyCode?: number;
  },
): SlotStateMutationDraftV2<Kind, 2, SlotStateMutation, Payload> {
  const emptyCode = options.emptyCode ?? -1;
  const names = symbolNames(options.symbolCodes);
  const keys = new Set<string>();
  const occurrences = [...options.input.occurrences];
  assertSnapshotShape(options.outputScene, options.outputValues, "refill");
  for (const [index, position] of options.positions.entries()) {
    const { x, y } = validatePosition(position, options.outputScene, "refill");
    const key = `${x},${y}`;
    if (keys.has(key))
      throw new LogicParseError(`refill contains duplicate position ${key}.`);
    keys.add(key);
    if (options.input.scene[x]?.[y] !== emptyCode)
      throw new LogicParseError(`refill position ${key} is not a hole.`);
    const code = options.outputScene[x]![y]!;
    const symbol = names.get(code);
    if (!symbol)
      throw new LogicParseError(
        `refill position ${key} uses unknown code ${code}.`,
      );
    const value = normalizeValue(options.outputValues[x]![y]!);
    occurrences.push(
      Object.freeze({
        id: `${options.occurrenceIdPrefix ?? "refill"}:${index}:${x}:${y}`,
        code,
        symbol,
        value,
        position: Object.freeze({ x, y }),
      }),
    );
  }
  options.outputScene.forEach((column, x) =>
    column.forEach((_code, y) => {
      if (keys.has(`${x},${y}`)) return;
      if (
        options.outputScene[x]![y] !== options.input.scene[x]?.[y] ||
        options.outputValues[x]![y] !== options.input.values[x]?.[y]
      )
        throw new LogicParseError(
          `refill changed carried occurrence at (${x},${y}).`,
        );
    }),
  );
  const output = freezeSnapshot(
    options.outputScene,
    options.outputValues,
    occurrences,
  );
  return mutationDraft(options, output);
}

export function createSlotOperationSnapshot(options: {
  readonly scene: readonly (readonly number[])[];
  readonly values: SnapshotMatrix;
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly occurrenceIdPrefix: string;
}): SlotOperationSnapshot {
  assertSnapshotShape(options.scene, options.values, "snapshot");
  const names = symbolNames(options.symbolCodes);
  const occurrences = options.scene.flatMap((column, x) =>
    column.flatMap((code, y) => {
      if (code === -1) return [];
      const symbol = names.get(code);
      if (!symbol)
        throw new LogicParseError(
          `snapshot scene at (${x},${y}) uses unknown code ${code}.`,
        );
      return [
        Object.freeze({
          id: `${options.occurrenceIdPrefix}:${x}:${y}`,
          code,
          symbol,
          value: normalizeValue(options.values[x]![y]!),
          position: Object.freeze({ x, y }),
        }),
      ];
    }),
  );
  return freezeSnapshot(options.scene, options.values, occurrences);
}

export function applySlotOperationChanges(options: {
  readonly input: SlotOperationSnapshot;
  readonly changes: readonly SlotOperationChangeDraft[];
  readonly relocations?: readonly SlotOperationRelocationDraft[];
  readonly symbolCodes: Readonly<Record<string, number>>;
  readonly replacementIdPrefix?: string;
}): SlotOperationSnapshot {
  const names = symbolNames(options.symbolCodes);
  const changes = new Map<string, SlotOperationChangeDraft>();
  for (const change of options.changes) {
    const position = validatePosition(
      change.position,
      options.input.scene,
      "change",
    );
    const key = `${position.x},${position.y}`;
    if (changes.has(key))
      throw new LogicParseError(`changes contains duplicate position ${key}.`);
    if (!names.has(change.outputCode))
      throw new LogicParseError(
        `change ${key} uses unknown code ${change.outputCode}.`,
      );
    changes.set(key, change);
  }
  const relocationSources = new Map<string, SlotOperationPosition>();
  const relocationTargets = new Map<string, SlotOperationPosition>();
  for (const [index, relocation] of (options.relocations ?? []).entries()) {
    const source = validatePosition(
      relocation.source,
      options.input.scene,
      `relocation[${index}].source`,
    );
    const target = validatePosition(
      relocation.target,
      options.input.scene,
      `relocation[${index}].target`,
    );
    const sourceKey = `${source.x},${source.y}`;
    const targetKey = `${target.x},${target.y}`;
    if (
      sourceKey === targetKey ||
      relocationSources.has(sourceKey) ||
      relocationSources.has(targetKey) ||
      relocationTargets.has(sourceKey) ||
      relocationTargets.has(targetKey)
    )
      throw new LogicParseError(
        `relocation[${index}] overlaps another relocation.`,
      );
    if (!changes.has(sourceKey) || !changes.has(targetKey))
      throw new LogicParseError(
        `relocation[${index}] source and target must both have changes.`,
      );
    relocationSources.set(sourceKey, target);
    relocationTargets.set(targetKey, source);
  }
  const inputByPosition = new Map(
    options.input.occurrences.map((occurrence) => [
      `${occurrence.position.x},${occurrence.position.y}`,
      occurrence,
    ]),
  );
  const occurrences = options.input.occurrences.map((occurrence) => {
    const key = `${occurrence.position.x},${occurrence.position.y}`;
    const change = changes.get(key);
    if (!change) return occurrence;
    const relocationSource = relocationTargets.get(key);
    const relocationTarget = relocationSources.get(key);
    const outputId = relocationSource
      ? inputByPosition.get(`${relocationSource.x},${relocationSource.y}`)?.id
      : relocationTarget
        ? `${options.replacementIdPrefix ?? "replacement"}:${key}`
        : occurrence.id;
    if (!outputId)
      throw new LogicParseError(
        `change ${key} cannot resolve its output occurrence.`,
      );
    return Object.freeze({
      ...occurrence,
      id: outputId,
      code: change.outputCode,
      symbol: names.get(change.outputCode)!,
      value: change.outputValue,
    });
  });
  const scene = options.input.scene.map((column, x) =>
    Object.freeze(
      column.map((code, y) => changes.get(`${x},${y}`)?.outputCode ?? code),
    ),
  );
  const values = options.input.values.map((column, x) =>
    Object.freeze(
      column.map((value, y) => changes.get(`${x},${y}`)?.outputValue ?? value),
    ),
  );
  return freezeSnapshot(scene, values, occurrences);
}

export function applySlotOperationValueUpdates(options: {
  readonly input: SlotOperationSnapshot;
  readonly updates: readonly {
    readonly position: SlotOperationPosition;
    readonly value: number | null;
  }[];
}): SlotOperationSnapshot {
  const updates = new Map<string, number | null>();
  for (const update of options.updates) {
    const position = validatePosition(
      update.position,
      options.input.scene,
      "value update",
    );
    const key = `${position.x},${position.y}`;
    if (updates.has(key))
      throw new LogicParseError(
        `value updates contains duplicate position ${key}.`,
      );
    updates.set(key, update.value);
  }
  if (updates.size === 0) return options.input;
  const values = options.input.values.map((column, x) =>
    Object.freeze(
      column.map((value, y) =>
        updates.has(`${x},${y}`) ? updates.get(`${x},${y}`)! : value,
      ),
    ),
  );
  const occurrences = options.input.occurrences.map((occurrence) => {
    const key = `${occurrence.position.x},${occurrence.position.y}`;
    return updates.has(key)
      ? Object.freeze({ ...occurrence, value: updates.get(key)! })
      : occurrence;
  });
  return freezeSnapshot(options.input.scene, values, occurrences);
}

function mutationDraft<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind: Kind;
    readonly input: SlotOperationSnapshot;
  },
  output: SlotOperationSnapshot,
  allowNoop = false,
): SlotStateMutationDraftV2<Kind, 2, SlotStateMutation, Payload> {
  return Object.freeze({
    kind: options.kind,
    version: 2 as const,
    effect: "state-mutation" as const,
    source: options.source,
    input: options.input,
    output,
    mutations: allowNoop
      ? Object.freeze([])
      : deriveSlotStateMutations(options.input, output),
    payload: options.payload,
    ...(options.businessKey === undefined
      ? {}
      : { businessKey: options.businessKey }),
  });
}

function freezeSnapshot(
  scene: readonly (readonly number[])[],
  values: SnapshotMatrix,
  occurrences: readonly SlotOperationOccurrence[],
): SlotOperationSnapshot {
  return Object.freeze({
    scene: Object.freeze(scene.map((column) => Object.freeze([...column]))),
    values: Object.freeze(values.map((column) => Object.freeze([...column]))),
    occurrences: Object.freeze(
      [...occurrences].sort(
        (left, right) =>
          left.position.x - right.position.x ||
          left.position.y - right.position.y,
      ),
    ),
  });
}

function assertSnapshotShape(
  scene: readonly (readonly number[])[],
  values: SnapshotMatrix,
  label: string,
): void {
  if (
    !Array.isArray(scene) ||
    scene.length === 0 ||
    values.length !== scene.length
  )
    throw new LogicParseError(`${label} scene/value width differs.`);
  scene.forEach((column, x) => {
    if (!Array.isArray(column) || column.length === 0)
      throw new LogicParseError(`${label} scene[${x}] must contain rows.`);
    if (values[x]?.length !== column.length)
      throw new LogicParseError(
        `${label} scene/value height differs at column ${x}.`,
      );
    column.forEach((code, y) => {
      const value = values[x]![y];
      if (code === -1 && value !== -1)
        throw new LogicParseError(
          `${label} hole (${x},${y}) must use value -1.`,
        );
      if (code !== -1 && value === -1)
        throw new LogicParseError(
          `${label} occupied cell (${x},${y}) cannot use value -1.`,
        );
    });
  });
}

function symbolNames(
  symbolCodes: Readonly<Record<string, number>>,
): ReadonlyMap<number, string> {
  const names = new Map<number, string>();
  for (const [symbol, code] of Object.entries(symbolCodes)) {
    if (!symbol.trim() || !Number.isSafeInteger(code) || code < 0)
      throw new LogicParseError(`invalid symbol code entry ${symbol}.`);
    if (names.has(code))
      throw new LogicParseError(`duplicate symbol code ${code}.`);
    names.set(code, symbol);
  }
  if (names.size === 0) throw new LogicParseError("symbolCodes is empty.");
  return names;
}

function validatePosition(
  position: SlotOperationPosition,
  scene: readonly (readonly number[])[],
  label: string,
): SlotOperationPosition {
  if (
    !Number.isSafeInteger(position.x) ||
    !Number.isSafeInteger(position.y) ||
    position.x < 0 ||
    position.y < 0 ||
    position.x >= scene.length ||
    position.y >= scene[position.x]!.length
  )
    throw new LogicParseError(`${label} position is out of range.`);
  return position;
}

function freezePosition(
  position: SlotOperationPosition,
  scene: readonly (readonly number[])[],
  label: string,
): SlotOperationPosition {
  const valid = validatePosition(position, scene, label);
  return Object.freeze({ x: valid.x, y: valid.y });
}

function freezePositions(
  positions: readonly SlotOperationPosition[],
  scene: readonly (readonly number[])[],
  label: string,
): readonly SlotOperationPosition[] {
  const keys = new Set<string>();
  return Object.freeze(
    positions.map((position, index) => {
      const frozen = freezePosition(position, scene, `${label}[${index}]`);
      const key = `${frozen.x},${frozen.y}`;
      if (keys.has(key))
        throw new LogicParseError(
          `${label} contains duplicate position ${key}.`,
        );
      keys.add(key);
      return frozen;
    }),
  );
}

function normalizeValue(value: number | null | -1): number | null {
  return value === -1 ? null : value;
}
