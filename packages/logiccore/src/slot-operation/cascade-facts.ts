import { LogicParseError } from "../errors";
import type { SlotOperationPosition } from "./types";

export const SLOT_CASCADE_EMPTY_CELL = -1;
export type SlotCascadeScene = readonly (readonly number[])[];
export type SlotCascadeValue = number | null | typeof SLOT_CASCADE_EMPTY_CELL;
export type SlotCascadeValueMatrix = readonly (readonly SlotCascadeValue[])[];

export type SlotCascadeMovementFact =
  | Readonly<{
      kind: "existing";
      source: SlotOperationPosition;
      target: SlotOperationPosition;
    }>
  | Readonly<{
      kind: "refill";
      source: SlotOperationPosition;
      target: SlotOperationPosition;
      outputCode: number;
      outputValue: number | null;
    }>;

export interface SlotCascadeValueCommit {
  readonly position: SlotOperationPosition;
  readonly value: number | null;
}

export interface SlotCascadeOccurrenceContext {
  readonly x: number;
  readonly y: number;
  readonly code: number;
  readonly value: number | null;
}

export type SlotCascadeCanDropOccurrence = (
  occurrence: SlotCascadeOccurrenceContext,
) => boolean;

export interface SlotCascadeFacts {
  readonly columns: number;
  readonly rows: number;
  readonly dropdownMovements: readonly Extract<
    SlotCascadeMovementFact,
    { readonly kind: "existing" }
  >[];
  readonly refillMovements: readonly Extract<
    SlotCascadeMovementFact,
    { readonly kind: "refill" }
  >[];
  readonly dropdownValueCommits: readonly SlotCascadeValueCommit[];
  readonly targetValueCommits: readonly SlotCascadeValueCommit[];
}

export function compileSlotCascadeFacts(options: {
  readonly sourceScene: SlotCascadeScene;
  readonly sourceValues: SlotCascadeValueMatrix;
  readonly dropdownScene: SlotCascadeScene;
  readonly dropdownValues: SlotCascadeValueMatrix;
  readonly targetScene: SlotCascadeScene;
  readonly targetValues: SlotCascadeValueMatrix;
  readonly refillPositions: readonly SlotOperationPosition[];
  readonly heldCodes?: readonly number[];
  readonly canDropOccurrence?: SlotCascadeCanDropOccurrence;
}): SlotCascadeFacts {
  const sourceScene = parseScene(options.sourceScene, "sourceScene");
  const columns = sourceScene.length;
  const rows = sourceScene[0]!.length;
  const sourceValues = parseValues(
    options.sourceValues,
    sourceScene,
    "sourceValues",
  );
  const dropdownScene = parseScene(
    options.dropdownScene,
    "dropdownScene",
    columns,
    rows,
  );
  const dropdownValues = parseValues(
    options.dropdownValues,
    dropdownScene,
    "dropdownValues",
  );
  const targetScene = parseScene(
    options.targetScene,
    "targetScene",
    columns,
    rows,
  );
  const targetValues = parseValues(
    options.targetValues,
    targetScene,
    "targetValues",
  );
  const refillPositions = parseRefillPositions(
    options.refillPositions,
    dropdownScene,
  );
  const heldCodes = new Set(options.heldCodes ?? []);
  const dropdownMovements: Extract<
    SlotCascadeMovementFact,
    { readonly kind: "existing" }
  >[] = [];

  for (let x = 0; x < columns; x += 1) {
    const source = occupied(sourceScene[x]!, sourceValues[x]!);
    const target = occupied(dropdownScene[x]!, dropdownValues[x]!);
    if (source.length !== target.length)
      throw new LogicParseError("cascade occurrence count changed");
    const fixedRows = new Set(
      source
        .filter((occurrence) =>
          isFixedOccurrence(
            { x, ...occurrence },
            heldCodes,
            options.canDropOccurrence,
          ),
        )
        .map(({ y }) => y),
    );
    for (const occurrence of source.filter(({ y }) => fixedRows.has(y)))
      if (
        dropdownScene[x]![occurrence.y] !== occurrence.code ||
        dropdownValues[x]![occurrence.y] !== occurrence.value
      )
        throw new LogicParseError("cascade fixed occurrence changed");
    const moving = source.filter(({ y }) => !fixedRows.has(y));
    const targets = target.filter(({ y }) => !fixedRows.has(y));
    if (moving.length !== targets.length)
      throw new LogicParseError("cascade movable occurrence count changed");
    moving.forEach((from, index) => {
      const to = targets[index]!;
      if (from.code !== to.code || from.value !== to.value || to.y < from.y)
        throw new LogicParseError("cascade occurrence relation is invalid");
      if (to.y > from.y)
        dropdownMovements.push(
          Object.freeze({
            kind: "existing",
            source: Object.freeze({ x, y: from.y }),
            target: Object.freeze({ x, y: to.y }),
          }),
        );
    });
  }

  const refillMovements = refillPositions.map((position, _index, positions) => {
    const code = targetScene[position.x]![position.y]!;
    const value = targetValues[position.x]![position.y]!;
    if (code === SLOT_CASCADE_EMPTY_CELL || value === SLOT_CASCADE_EMPTY_CELL)
      throw new LogicParseError("cascade refill target is empty");
    const inColumn = positions.filter(({ x }) => x === position.x);
    const columnIndex = inColumn.findIndex(
      ({ x, y }) => x === position.x && y === position.y,
    );
    return Object.freeze({
      kind: "refill" as const,
      source: Object.freeze({
        x: position.x,
        y: columnIndex - inColumn.length,
      }),
      target: position,
      outputCode: code,
      outputValue: value,
    });
  });
  const refillKeys = new Set(
    refillPositions.map(({ x, y }) => String(x) + "," + String(y)),
  );
  for (let x = 0; x < columns; x += 1)
    for (let y = 0; y < rows; y += 1)
      if (
        !refillKeys.has(String(x) + "," + String(y)) &&
        targetScene[x]![y] !== dropdownScene[x]![y]
      )
        throw new LogicParseError("cascade refill changed carried code");

  return Object.freeze({
    columns,
    rows,
    dropdownMovements: Object.freeze(dropdownMovements),
    refillMovements: Object.freeze(refillMovements),
    dropdownValueCommits: valueCommits(dropdownScene, dropdownValues),
    targetValueCommits: valueCommits(targetScene, targetValues),
  });
}

export function deriveSlotCascadeDropdownValues(options: {
  readonly sourceScene: SlotCascadeScene;
  readonly sourceValues: SlotCascadeValueMatrix;
  readonly dropdownScene: SlotCascadeScene;
  readonly heldCodes?: readonly number[];
  readonly canDropOccurrence?: SlotCascadeCanDropOccurrence;
}): SlotCascadeValueMatrix {
  const sourceScene = parseScene(options.sourceScene, "sourceScene");
  const columns = sourceScene.length;
  const rows = sourceScene[0]!.length;
  const sourceValues = parseValues(
    options.sourceValues,
    sourceScene,
    "sourceValues",
  );
  const dropdownScene = parseScene(
    options.dropdownScene,
    "dropdownScene",
    columns,
    rows,
  );
  const heldCodes = new Set(options.heldCodes ?? []);
  return Object.freeze(
    sourceScene.map((sourceColumn, x) => {
      const source = occupied(sourceColumn, sourceValues[x]!);
      const fixedRows = new Set(
        source
          .filter((occurrence) =>
            isFixedOccurrence(
              { x, ...occurrence },
              heldCodes,
              options.canDropOccurrence,
            ),
          )
          .map(({ y }) => y),
      );
      const derived: SlotCascadeValue[] = dropdownScene[x]!.map((code) =>
        code === SLOT_CASCADE_EMPTY_CELL ? SLOT_CASCADE_EMPTY_CELL : null,
      );
      for (const occurrence of source.filter(({ y }) => fixedRows.has(y))) {
        if (dropdownScene[x]![occurrence.y] !== occurrence.code)
          throw new LogicParseError("cascade fixed occurrence changed");
        derived[occurrence.y] = occurrence.value;
      }
      const moving = source.filter(({ y }) => !fixedRows.has(y));
      const targets = dropdownScene[x]!.flatMap((code, y) =>
        code === SLOT_CASCADE_EMPTY_CELL || fixedRows.has(y)
          ? []
          : [{ code, y }],
      );
      if (moving.length !== targets.length)
        throw new LogicParseError("cascade movable occurrence count changed");
      moving.forEach((from, index) => {
        const to = targets[index]!;
        if (from.code !== to.code || to.y < from.y)
          throw new LogicParseError("cascade occurrence relation is invalid");
        derived[to.y] = from.value;
      });
      return Object.freeze(derived);
    }),
  );
}

function isFixedOccurrence(
  occurrence: SlotCascadeOccurrenceContext,
  heldCodes: ReadonlySet<number>,
  canDropOccurrence: SlotCascadeCanDropOccurrence | undefined,
): boolean {
  if (heldCodes.has(occurrence.code)) return true;
  if (!canDropOccurrence) return false;
  const canDrop = canDropOccurrence(occurrence);
  if (typeof canDrop !== "boolean")
    throw new LogicParseError("canDropOccurrence must return a boolean");
  return !canDrop;
}

function valueCommits(
  scene: SlotCascadeScene,
  values: SlotCascadeValueMatrix,
): readonly SlotCascadeValueCommit[] {
  return Object.freeze(
    scene.flatMap((column, x) =>
      column.flatMap((code, y) => {
        if (code === SLOT_CASCADE_EMPTY_CELL) return [];
        const value = values[x]![y]!;
        if (value === SLOT_CASCADE_EMPTY_CELL)
          throw new LogicParseError("cascade occupied value is empty");
        return [
          Object.freeze({
            position: Object.freeze({ x, y }),
            value,
          }),
        ];
      }),
    ),
  );
}

function parseRefillPositions(
  positions: readonly SlotOperationPosition[],
  dropdownScene: SlotCascadeScene,
): readonly SlotOperationPosition[] {
  const keys = new Set<string>();
  const parsed = positions.map((position) => {
    if (
      !Number.isSafeInteger(position.x) ||
      !Number.isSafeInteger(position.y) ||
      position.x < 0 ||
      position.y < 0 ||
      position.x >= dropdownScene.length ||
      position.y >= dropdownScene[position.x]!.length
    )
      throw new LogicParseError("refill position is out of range");
    const key = String(position.x) + "," + String(position.y);
    if (keys.has(key))
      throw new LogicParseError("refill positions contain a duplicate");
    keys.add(key);
    return Object.freeze({ x: position.x, y: position.y });
  });
  for (let x = 0; x < dropdownScene.length; x += 1)
    for (let y = 0; y < dropdownScene[x]!.length; y += 1)
      if (
        (dropdownScene[x]![y] === SLOT_CASCADE_EMPTY_CELL) !==
        keys.has(String(x) + "," + String(y))
      )
        throw new LogicParseError(
          "refill positions must match dropdown holes exactly",
        );
  return Object.freeze(parsed);
}

function occupied(
  scene: readonly number[],
  values: readonly SlotCascadeValue[],
) {
  return scene.flatMap((code, y) =>
    code === SLOT_CASCADE_EMPTY_CELL
      ? []
      : [{ y, code, value: values[y] as number | null }],
  );
}

function parseScene(
  value: SlotCascadeScene,
  label: string,
  expectedColumns?: number,
  expectedRows?: number,
): SlotCascadeScene {
  if (!Array.isArray(value) || value.length === 0)
    throw new LogicParseError(label + " must contain columns");
  if (expectedColumns !== undefined && value.length !== expectedColumns)
    throw new LogicParseError(label + " width is invalid");
  const rows = expectedRows ?? value[0]?.length ?? 0;
  if (rows <= 0) throw new LogicParseError(label + " must contain rows");
  return Object.freeze(
    value.map((column) => {
      if (!Array.isArray(column) || column.length !== rows)
        throw new LogicParseError(label + " height is invalid");
      return Object.freeze(
        column.map((code) => {
          if (!Number.isSafeInteger(code) || code < SLOT_CASCADE_EMPTY_CELL)
            throw new LogicParseError(label + " contains an invalid code");
          return code;
        }),
      );
    }),
  );
}

function parseValues(
  value: SlotCascadeValueMatrix,
  scene: SlotCascadeScene,
  label: string,
): SlotCascadeValueMatrix {
  if (!Array.isArray(value) || value.length !== scene.length)
    throw new LogicParseError(label + " width must match scene");
  return Object.freeze(
    value.map((column, x) => {
      if (!Array.isArray(column) || column.length !== scene[x]!.length)
        throw new LogicParseError(label + " height must match scene");
      return Object.freeze(
        column.map((candidate, y) => {
          if (scene[x]![y] === SLOT_CASCADE_EMPTY_CELL) {
            if (candidate !== SLOT_CASCADE_EMPTY_CELL)
              throw new LogicParseError(label + " hole value is invalid");
            return SLOT_CASCADE_EMPTY_CELL;
          }
          if (
            candidate !== null &&
            (!Number.isSafeInteger(candidate) || candidate < 0)
          )
            throw new LogicParseError(label + " contains an invalid value");
          return candidate;
        }),
      );
    }),
  );
}
