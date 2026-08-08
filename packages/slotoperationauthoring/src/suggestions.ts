import type {
  SlotOperationPosition,
  SlotOperationSnapshot,
} from "@slotclientengine/logiccore";
import type {
  AuthoringSuggestion,
  CellValueUpdate,
  DropdownDerivation,
  PositionMovement,
  RelocationDerivation,
  SceneCellChange,
  SymbolReplacement,
} from "./types.js";

export function suggestSceneChanges(options: {
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
}): AuthoringSuggestion<readonly SceneCellChange[]> {
  assertSameDimensions(options.input, options.output);
  const changes: SceneCellChange[] = [];
  forEachPosition(options.input, (position) => {
    const inputCode = options.input.scene[position.x]![position.y]!;
    const outputCode = options.output.scene[position.x]![position.y]!;
    if (inputCode !== outputCode)
      changes.push(Object.freeze({ position, inputCode, outputCode }));
  });
  return exact(Object.freeze(changes), allPositions(options.input));
}

export function suggestRemovePositions(options: {
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
}): AuthoringSuggestion<readonly SlotOperationPosition[]> {
  return suggestHoleTransition(options, "remove");
}

export function suggestRefillPositions(options: {
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
}): AuthoringSuggestion<readonly SlotOperationPosition[]> {
  return suggestHoleTransition(options, "refill");
}

export function suggestValueUpdates(options: {
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
}): AuthoringSuggestion<readonly CellValueUpdate[]> {
  assertSameDimensions(options.input, options.output);
  const updates: CellValueUpdate[] = [];
  forEachPosition(options.input, (position) => {
    if (
      options.input.scene[position.x]![position.y] !== -1 &&
      options.output.scene[position.x]![position.y] !== -1 &&
      options.input.values[position.x]![position.y] !==
        options.output.values[position.x]![position.y]
    )
      updates.push(
        Object.freeze({
          position,
          inputValue: options.input.values[position.x]![position.y] as
            | number
            | null,
          outputValue: options.output.values[position.x]![position.y] as
            | number
            | null,
        }),
      );
  });
  return exact(Object.freeze(updates), allPositions(options.input));
}

export function suggestSymbolReplacements(options: {
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
}): AuthoringSuggestion<readonly SymbolReplacement[]> {
  assertSameDimensions(options.input, options.output);
  const replacements: SymbolReplacement[] = [];
  forEachPosition(options.input, (position) => {
    const inputCode = options.input.scene[position.x]![position.y]!;
    const outputCode = options.output.scene[position.x]![position.y]!;
    if (inputCode !== -1 && outputCode !== -1 && inputCode !== outputCode)
      replacements.push(
        Object.freeze({
          position,
          inputCode,
          outputCode,
          outputValue: options.output.values[position.x]![position.y] as
            | number
            | null,
        }),
      );
  });
  return exact(Object.freeze(replacements), allPositions(options.input));
}

export function suggestDropdownMovements(options: {
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
  readonly heldPositions?: readonly SlotOperationPosition[];
}): AuthoringSuggestion<DropdownDerivation> {
  const movement = suggestMovements(options.input, options.output);
  return Object.freeze({
    ...movement,
    candidates: Object.freeze(
      movement.candidates.map((movements) =>
        Object.freeze({
          movements,
          heldPositions: Object.freeze([...(options.heldPositions ?? [])]),
        }),
      ),
    ),
  });
}

export function suggestPositionRelocations(options: {
  readonly input: SlotOperationSnapshot;
  readonly output: SlotOperationSnapshot;
}): AuthoringSuggestion<RelocationDerivation> {
  const movement = suggestMovements(options.input, options.output);
  return Object.freeze({
    ...movement,
    candidates: Object.freeze(
      movement.candidates.map((movements) => Object.freeze({ movements })),
    ),
  });
}

function suggestMovements(
  input: SlotOperationSnapshot,
  output: SlotOperationSnapshot,
): AuthoringSuggestion<readonly PositionMovement[]> {
  assertSameDimensions(input, output);
  const outputCells = occupiedCells(output).filter((candidate) => {
    const samePosition = cellAt(input, candidate.position);
    return !samePosition || !sameCellValue(samePosition, candidate);
  });
  if (outputCells.length === 0)
    return exact(Object.freeze([]), allPositions(input));
  const stablePositions = new Set(
    occupiedCells(input)
      .filter((cell) => {
        const target = cellAt(output, cell.position);
        return target !== undefined && sameCellValue(cell, target);
      })
      .map((cell) => positionKey(cell.position)),
  );
  const inputCells = occupiedCells(input).filter(
    (cell) => !stablePositions.has(positionKey(cell.position)),
  );
  const candidateLists = outputCells.map((target) =>
    inputCells.filter(
      (source) =>
        source.code === target.code &&
        source.value === target.value &&
        positionKey(source.position) !== positionKey(target.position),
    ),
  );
  if (candidateLists.some((values) => values.length === 0))
    return Object.freeze({
      status: "unresolved" as const,
      candidates: Object.freeze([]),
      inspectedPositions: allPositions(input),
      diagnostics: Object.freeze([
        "At least one output cell has no source with the same code and value.",
      ]),
    });
  const assignments: PositionMovement[][] = [];
  enumerateAssignments(
    outputCells,
    candidateLists,
    0,
    [],
    new Set(),
    assignments,
  );
  if (assignments.length === 0)
    return Object.freeze({
      status: "unresolved" as const,
      candidates: Object.freeze([]),
      inspectedPositions: allPositions(input),
      diagnostics: Object.freeze([
        "No disjoint position movement assignment exists.",
      ]),
    });
  return Object.freeze({
    status:
      assignments.length === 1 ? ("exact" as const) : ("ambiguous" as const),
    candidates: Object.freeze(assignments.map((item) => Object.freeze(item))),
    inspectedPositions: allPositions(input),
    diagnostics: Object.freeze(
      assignments.length === 1
        ? []
        : [
            `${assignments.length} valid movement assignments require an explicit choice.`,
          ],
    ),
  });
}

function enumerateAssignments(
  targets: readonly SnapshotCell[],
  candidates: readonly (readonly SnapshotCell[])[],
  index: number,
  current: readonly PositionMovement[],
  used: ReadonlySet<string>,
  output: PositionMovement[][],
): void {
  if (output.length >= 256) return;
  if (index === targets.length) {
    output.push([...current]);
    return;
  }
  const target = targets[index]!;
  for (const source of candidates[index]!) {
    const sourceKey = positionKey(source.position);
    if (used.has(sourceKey)) continue;
    enumerateAssignments(
      targets,
      candidates,
      index + 1,
      [
        ...current,
        Object.freeze({
          source: source.position,
          target: target.position,
        }),
      ],
      new Set([...used, sourceKey]),
      output,
    );
  }
}

function suggestHoleTransition(
  options: {
    readonly input: SlotOperationSnapshot;
    readonly output: SlotOperationSnapshot;
  },
  kind: "remove" | "refill",
): AuthoringSuggestion<readonly SlotOperationPosition[]> {
  assertSameDimensions(options.input, options.output);
  const positions: SlotOperationPosition[] = [];
  forEachPosition(options.input, (position) => {
    const before = options.input.scene[position.x]![position.y]!;
    const after = options.output.scene[position.x]![position.y]!;
    if (
      (kind === "remove" && before !== -1 && after === -1) ||
      (kind === "refill" && before === -1 && after !== -1)
    )
      positions.push(position);
  });
  return exact(Object.freeze(positions), allPositions(options.input));
}

function exact<Value>(
  value: Value,
  inspectedPositions: readonly SlotOperationPosition[],
): AuthoringSuggestion<Value> {
  return Object.freeze({
    status: "exact" as const,
    candidates: Object.freeze([value]),
    inspectedPositions,
    diagnostics: Object.freeze([]),
  });
}

function assertSameDimensions(
  input: SlotOperationSnapshot,
  output: SlotOperationSnapshot,
): void {
  if (
    input.scene.length !== output.scene.length ||
    input.scene.some((column, x) => column.length !== output.scene[x]?.length)
  )
    throw new Error("Input and output snapshot dimensions must match.");
}

function allPositions(
  snapshot: SlotOperationSnapshot,
): readonly SlotOperationPosition[] {
  const positions: SlotOperationPosition[] = [];
  forEachPosition(snapshot, (position) => positions.push(position));
  return Object.freeze(positions);
}

function forEachPosition(
  snapshot: SlotOperationSnapshot,
  visit: (position: SlotOperationPosition) => void,
): void {
  snapshot.scene.forEach((column, x) =>
    column.forEach((_value, y) => visit(Object.freeze({ x, y }))),
  );
}

interface SnapshotCell {
  readonly code: number;
  readonly value: number | null;
  readonly position: SlotOperationPosition;
}

function occupiedCells(
  snapshot: SlotOperationSnapshot,
): readonly SnapshotCell[] {
  return Object.freeze(
    snapshot.scene.flatMap((column, x) =>
      column.flatMap((code, y) =>
        code === -1
          ? []
          : [
              Object.freeze({
                code,
                value: snapshot.values[x]![y] as number | null,
                position: Object.freeze({ x, y }),
              }),
            ],
      ),
    ),
  );
}

function cellAt(
  snapshot: SlotOperationSnapshot,
  position: SlotOperationPosition,
): SnapshotCell | undefined {
  const code = snapshot.scene[position.x]?.[position.y];
  const value = snapshot.values[position.x]?.[position.y];
  if (code === undefined || code === -1 || value === undefined || value === -1)
    return undefined;
  return Object.freeze({ code, value, position });
}

function sameCellValue(left: SnapshotCell, right: SnapshotCell): boolean {
  return left.code === right.code && left.value === right.value;
}

function positionKey(position: SlotOperationPosition): string {
  return `${position.x},${position.y}`;
}
