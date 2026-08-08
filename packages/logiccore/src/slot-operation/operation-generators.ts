import { LogicParseError } from "../errors";
import type {
  SlotOperationPosition,
  SlotOperationSnapshot,
  SlotOperationSource,
} from "./types";
import type {
  SlotChgPayload,
  SlotChgRoute,
  SlotPresentationDraftV2,
  SlotPresentationTarget,
  SlotSceneLandingDraftV2,
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
    readonly output: SlotOperationSnapshot;
  },
): SlotSceneLandingDraftV2<Kind, 2, Payload> {
  return Object.freeze({
    kind: (options.kind ?? "slot:spin") as Kind,
    version: 2 as const,
    effect: "scene-landing" as const,
    source: options.source,
    output: freezeSnapshot(options.output.scene, options.output.values),
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
): SlotStateMutationDraftV2<Kind, 2, SlotChgPayload> {
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
  return stateDraft(
    { ...options, payload },
    applySlotOperationChanges({
      input: options.input,
      changes: options.changes,
      ...(routes === undefined ? {} : { relocations: routes }),
      symbolCodes: options.symbolCodes,
    }),
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
): SlotStateMutationDraftV2<Kind, 2, Payload> {
  const emptyCode = options.emptyCode ?? -1;
  assertSnapshotShape(options.outputScene, options.outputValues, "remove");
  forEachCell(options.input.scene, (x, y, inputCode) => {
    const outputCode = options.outputScene[x]?.[y];
    const outputValue = options.outputValues[x]?.[y];
    if (outputCode === emptyCode) {
      if (outputValue !== emptyCode)
        throw new LogicParseError(
          `remove output value at (${x},${y}) must use emptyCode ${emptyCode}.`,
        );
      return;
    }
    if (
      outputCode !== inputCode ||
      outputValue !== options.input.values[x]?.[y]
    )
      throw new LogicParseError(`remove changed retained cell at (${x},${y}).`);
  });
  return stateDraft(
    options,
    freezeSnapshot(options.outputScene, options.outputValues),
  );
}

export function genDropdownOperation<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind: Kind;
    readonly input: SlotOperationSnapshot;
    readonly outputScene: readonly (readonly number[])[];
    readonly outputValues: SnapshotMatrix;
    readonly heldCodes?: readonly number[];
    readonly emptyCode?: number;
  },
): SlotStateMutationDraftV2<Kind, 2, Payload> {
  const emptyCode = options.emptyCode ?? -1;
  const heldCodes = new Set(options.heldCodes ?? []);
  assertSnapshotShape(options.outputScene, options.outputValues, "dropdown");
  for (let x = 0; x < options.outputScene.length; x += 1) {
    const source = options.input.scene[x]!.flatMap((code, y) =>
      code === emptyCode
        ? []
        : [
            {
              code,
              value: options.input.values[x]![y]!,
              y,
              held: heldCodes.has(code),
            },
          ],
    );
    const heldRows = new Set(
      source.filter((cell) => cell.held).map((cell) => cell.y),
    );
    for (const cell of source.filter((candidate) => candidate.held))
      if (
        options.outputScene[x]?.[cell.y] !== cell.code ||
        options.outputValues[x]?.[cell.y] !== cell.value
      )
        throw new LogicParseError(
          `dropdown changed held cell at (${x},${cell.y}).`,
        );
    const targets = options.outputScene[x]!.flatMap((code, y) =>
      code === emptyCode || heldRows.has(y)
        ? []
        : [{ code, value: options.outputValues[x]![y]!, y }],
    );
    const moving = source.filter((cell) => !cell.held);
    if (targets.length !== moving.length)
      throw new LogicParseError(
        `dropdown column ${x} contains ${targets.length} targets for ${moving.length} movable cells.`,
      );
    moving.forEach((cell, index) => {
      const target = targets[index]!;
      if (
        target.code !== cell.code ||
        target.value !== cell.value ||
        target.y < cell.y
      )
        throw new LogicParseError(
          `dropdown cannot move cell (${x},${cell.y}) to (${x},${target.y}).`,
        );
    });
  }
  return stateDraft(
    options,
    freezeSnapshot(options.outputScene, options.outputValues),
  );
}

export function genRefillOperation<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & {
    readonly kind: Kind;
    readonly input: SlotOperationSnapshot;
    readonly outputScene: readonly (readonly number[])[];
    readonly outputValues: SnapshotMatrix;
    readonly positions: readonly SlotOperationPosition[];
    readonly symbolCodes: Readonly<Record<string, number>>;
    readonly emptyCode?: number;
  },
): SlotStateMutationDraftV2<Kind, 2, Payload> {
  const emptyCode = options.emptyCode ?? -1;
  const knownCodes = knownSymbolCodes(options.symbolCodes);
  const keys = new Set<string>();
  assertSnapshotShape(options.outputScene, options.outputValues, "refill");
  for (const position of options.positions) {
    const { x, y } = validatePosition(position, options.outputScene, "refill");
    const key = `${x},${y}`;
    if (keys.has(key))
      throw new LogicParseError(`refill contains duplicate position ${key}.`);
    keys.add(key);
    if (options.input.scene[x]?.[y] !== emptyCode)
      throw new LogicParseError(`refill position ${key} is not a hole.`);
    const code = options.outputScene[x]![y]!;
    if (!knownCodes.has(code))
      throw new LogicParseError(
        `refill position ${key} uses unknown code ${code}.`,
      );
    normalizeValue(options.outputValues[x]![y]!);
  }
  forEachCell(options.outputScene, (x, y) => {
    if (keys.has(`${x},${y}`)) return;
    if (
      options.outputScene[x]![y] !== options.input.scene[x]?.[y] ||
      options.outputValues[x]![y] !== options.input.values[x]?.[y]
    )
      throw new LogicParseError(`refill changed carried cell at (${x},${y}).`);
  });
  return stateDraft(
    options,
    freezeSnapshot(options.outputScene, options.outputValues),
  );
}

export function createSlotOperationSnapshot(options: {
  readonly scene: readonly (readonly number[])[];
  readonly values: SnapshotMatrix;
  readonly symbolCodes: Readonly<Record<string, number>>;
}): SlotOperationSnapshot {
  assertSnapshotShape(options.scene, options.values, "snapshot");
  const knownCodes = knownSymbolCodes(options.symbolCodes);
  forEachCell(options.scene, (x, y, code) => {
    if (code !== -1 && !knownCodes.has(code))
      throw new LogicParseError(
        `snapshot scene at (${x},${y}) uses unknown code ${code}.`,
      );
  });
  return freezeSnapshot(options.scene, options.values);
}

export function applySlotOperationChanges(options: {
  readonly input: SlotOperationSnapshot;
  readonly changes: readonly SlotOperationChangeDraft[];
  readonly relocations?: readonly SlotOperationRelocationDraft[];
  readonly symbolCodes: Readonly<Record<string, number>>;
}): SlotOperationSnapshot {
  const knownCodes = knownSymbolCodes(options.symbolCodes);
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
    if (!knownCodes.has(change.outputCode))
      throw new LogicParseError(
        `change ${key} uses unknown code ${change.outputCode}.`,
      );
    validatePresentationValue(change.outputValue, `change ${key}`);
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
  return freezeSnapshot(scene, values);
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
    validatePresentationValue(update.value, "value update");
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
  return freezeSnapshot(options.input.scene, values);
}

function stateDraft<Kind extends string, Payload>(
  options: OperationGeneratorCommon<Payload> & { readonly kind: Kind },
  output: SlotOperationSnapshot,
): SlotStateMutationDraftV2<Kind, 2, Payload> {
  return Object.freeze({
    kind: options.kind,
    version: 2 as const,
    effect: "state-mutation" as const,
    source: options.source,
    output,
    payload: options.payload,
    ...(options.businessKey === undefined
      ? {}
      : { businessKey: options.businessKey }),
  });
}

function freezeSnapshot(
  scene: readonly (readonly number[])[],
  values: SnapshotMatrix,
): SlotOperationSnapshot {
  assertSnapshotShape(scene, values, "snapshot");
  return Object.freeze({
    scene: Object.freeze(scene.map((column) => Object.freeze([...column]))),
    values: Object.freeze(values.map((column) => Object.freeze([...column]))),
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
      if (!Number.isSafeInteger(code) || code < -1)
        throw new LogicParseError(
          `${label} scene (${x},${y}) code must be a safe integer >= -1.`,
        );
      if (code !== -1) validatePresentationValue(value, `${label} (${x},${y})`);
    });
  });
}

function validatePresentationValue(value: unknown, label: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0))
    throw new LogicParseError(`${label} value must be null or non-negative.`);
}

function knownSymbolCodes(
  symbolCodes: Readonly<Record<string, number>>,
): ReadonlySet<number> {
  const knownCodes = new Set<number>();
  for (const [symbol, code] of Object.entries(symbolCodes)) {
    if (!symbol.trim() || !Number.isSafeInteger(code) || code < 0)
      throw new LogicParseError(`invalid symbol code entry ${symbol}.`);
    if (knownCodes.has(code))
      throw new LogicParseError(`duplicate symbol code ${code}.`);
    knownCodes.add(code);
  }
  if (knownCodes.size === 0) throw new LogicParseError("symbolCodes is empty.");
  return knownCodes;
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
  if (value === -1) return null;
  validatePresentationValue(value, "snapshot");
  return value;
}

function forEachCell<T>(
  matrix: readonly (readonly T[])[],
  visit: (x: number, y: number, value: T) => void,
): void {
  matrix.forEach((column, x) =>
    column.forEach((value, y) => visit(x, y, value)),
  );
}
