import { LogicParseError } from "../errors";
import type {
  SlotOperationDefinition,
  SlotOperationDraft,
  SlotOperationOccurrence,
  SlotOperationPosition,
  SlotOperationSnapshot,
  SlotOperationSource,
} from "./types";

type BuiltinCompileContext = Parameters<SlotOperationDefinition["compile"]>[0];

export interface SlotOperationCellValueUpdate {
  readonly position: SlotOperationPosition;
  readonly value: number | null;
}

export interface SlotOperationOccurrenceReplacement {
  readonly position: SlotOperationPosition;
  readonly code: number;
  readonly value: number | null;
  readonly identity: "preserve" | "replace";
}

export interface SlotOperationOccurrenceRelocation {
  readonly source: SlotOperationPosition;
  readonly target: SlotOperationPosition;
  readonly sourceReplacement: {
    readonly code: number;
    readonly value: number | null;
  };
}

export type BuiltinSlotOperationDraft =
  | SlotOperationDraft<
      "slot:spin",
      1,
      SlotOperationSource,
      { readonly output: SlotOperationSnapshot }
    >
  | SlotOperationDraft<
      "slot:win",
      1,
      SlotOperationSource,
      Readonly<Record<string, unknown>>
    >
  | SlotOperationDraft<
      "slot:collect",
      1,
      SlotOperationSource,
      Readonly<Record<string, unknown>>
    >
  | SlotOperationDraft<
      "slot:remove",
      1,
      SlotOperationSource,
      { readonly positions: readonly SlotOperationPosition[] }
    >
  | SlotOperationDraft<
      "slot:update-values",
      1,
      SlotOperationSource,
      { readonly updates: readonly SlotOperationCellValueUpdate[] }
    >
  | SlotOperationDraft<
      "slot:replace-occurrences",
      1,
      SlotOperationSource,
      { readonly replacements: readonly SlotOperationOccurrenceReplacement[] }
    >
  | SlotOperationDraft<
      "slot:relocate-occurrences",
      1,
      SlotOperationSource,
      { readonly relocations: readonly SlotOperationOccurrenceRelocation[] }
    >
  | SlotOperationDraft<
      "slot:dropdown",
      1,
      SlotOperationSource,
      {
        readonly output: SlotOperationSnapshot;
        readonly movements: readonly unknown[];
      }
    >
  | SlotOperationDraft<
      "slot:refill",
      1,
      SlotOperationSource,
      {
        readonly output: SlotOperationSnapshot;
        readonly movements: readonly unknown[];
      }
    >;

export function createBuiltinSlotOperationDefinitions(): readonly SlotOperationDefinition[] {
  return Object.freeze([
    outputDefinition("slot:spin"),
    noChangeDefinition("slot:win"),
    noChangeDefinition("slot:collect"),
    removeDefinition(),
    updateValuesDefinition(),
    replaceOccurrencesDefinition(),
    relocateOccurrencesDefinition(),
    outputDefinition("slot:dropdown"),
    outputDefinition("slot:refill"),
  ]);
}

function outputDefinition(
  kind: "slot:spin" | "slot:dropdown" | "slot:refill",
): SlotOperationDefinition {
  return Object.freeze({
    kind,
    version: 1,
    compile: ({ draft }: BuiltinCompileContext) => {
      const payload = draft.payload as {
        readonly output?: SlotOperationSnapshot;
      };
      if (!payload.output)
        throw new LogicParseError(`${kind} payload.output is required.`);
      return Object.freeze({
        output: payload.output,
        payload: draft.payload,
        requiredCapabilities: Object.freeze([kind]),
      });
    },
  });
}

function noChangeDefinition(
  kind: "slot:win" | "slot:collect",
): SlotOperationDefinition {
  return Object.freeze({
    kind,
    version: 1,
    compile: ({ input, draft }: BuiltinCompileContext) =>
      Object.freeze({
        output: input,
        payload: draft.payload,
        requiredCapabilities: Object.freeze([kind]),
      }),
  });
}

function removeDefinition(): SlotOperationDefinition {
  return Object.freeze({
    kind: "slot:remove",
    version: 1,
    compile: ({ input, draft }: BuiltinCompileContext) => {
      const positions = requirePositionArray(
        (draft.payload as { readonly positions?: unknown }).positions,
        input,
        "slot:remove.positions",
      );
      const removed = new Set(positions.map(positionKey));
      const output = snapshotFromOccurrences(
        input.scene.map((column, x) =>
          Object.freeze(
            column.map((code, y) => (removed.has(`${x},${y}`) ? -1 : code)),
          ),
        ),
        input.values.map((column, x) =>
          Object.freeze(
            column.map((value, y) => (removed.has(`${x},${y}`) ? -1 : value)),
          ),
        ),
        input.occurrences.filter(
          (occurrence) => !removed.has(positionKey(occurrence.position)),
        ),
      );
      return Object.freeze({
        output,
        payload: Object.freeze({
          positions,
          occurrenceIds: Object.freeze(
            positions.map((position) => requireOccurrence(input, position).id),
          ),
        }),
        requiredCapabilities: Object.freeze(["slot:remove"]),
      });
    },
  });
}

function updateValuesDefinition(): SlotOperationDefinition {
  return Object.freeze({
    kind: "slot:update-values",
    version: 1,
    compile: ({ input, draft }: BuiltinCompileContext) => {
      const updates = requireUpdates(
        (draft.payload as { readonly updates?: unknown }).updates,
        input,
      );
      const byPosition = new Map(
        updates.map((update) => [positionKey(update.position), update.value]),
      );
      const values = input.values.map((column, x) =>
        Object.freeze(
          column.map((value, y) =>
            byPosition.has(`${x},${y}`) ? byPosition.get(`${x},${y}`)! : value,
          ),
        ),
      );
      const occurrences = input.occurrences.map((occurrence) =>
        byPosition.has(positionKey(occurrence.position))
          ? Object.freeze({
              ...occurrence,
              value: byPosition.get(positionKey(occurrence.position))!,
            })
          : occurrence,
      );
      return Object.freeze({
        output: snapshotFromOccurrences(input.scene, values, occurrences),
        payload: Object.freeze({ updates }),
        requiredCapabilities: Object.freeze(["slot:update-values"]),
      });
    },
  });
}

function replaceOccurrencesDefinition(): SlotOperationDefinition {
  return Object.freeze({
    kind: "slot:replace-occurrences",
    version: 1,
    compile: ({ input, draft, helpers }: BuiltinCompileContext) => {
      const raw = (draft.payload as { readonly replacements?: unknown })
        .replacements;
      if (!Array.isArray(raw) || raw.length === 0)
        throw new LogicParseError(
          "slot:replace-occurrences.replacements must not be empty.",
        );
      const names = symbolNames(helpers.symbolCodes);
      const seen = new Set<string>();
      const replacements = raw.map(
        (value, index): SlotOperationOccurrenceReplacement => {
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw new LogicParseError(
              `replacement[${index}] must be an object.`,
            );
          const item = value as unknown as SlotOperationOccurrenceReplacement;
          validatePosition(
            item.position,
            input,
            `replacement[${index}].position`,
          );
          const key = positionKey(item.position);
          if (seen.has(key))
            throw new LogicParseError(`duplicate replacement position ${key}.`);
          seen.add(key);
          if (!names.has(item.code))
            throw new LogicParseError(`replacement[${index}].code is unknown.`);
          validateValue(item.value, `replacement[${index}].value`);
          if (item.identity !== "preserve" && item.identity !== "replace")
            throw new LogicParseError(
              `replacement[${index}].identity is invalid.`,
            );
          return Object.freeze({
            ...item,
            position: Object.freeze({ ...item.position }),
          });
        },
      );
      const byPosition = new Map(
        replacements.map((item) => [positionKey(item.position), item]),
      );
      const occurrences = input.occurrences.map((occurrence) => {
        const replacement = byPosition.get(positionKey(occurrence.position));
        if (!replacement) return occurrence;
        return Object.freeze({
          ...occurrence,
          id:
            replacement.identity === "preserve"
              ? occurrence.id
              : `replace:${draft.id}:${occurrence.position.x}:${occurrence.position.y}`,
          code: replacement.code,
          symbol: names.get(replacement.code)!,
          value: replacement.value,
        });
      });
      return Object.freeze({
        output: snapshotFromOccurrences(
          sceneFromOccurrences(input, occurrences),
          valuesFromOccurrences(input, occurrences),
          occurrences,
        ),
        payload: Object.freeze({ replacements: Object.freeze(replacements) }),
        requiredCapabilities: Object.freeze(["slot:replace-occurrences"]),
      });
    },
  });
}

function relocateOccurrencesDefinition(): SlotOperationDefinition {
  return Object.freeze({
    kind: "slot:relocate-occurrences",
    version: 1,
    compile: ({ input, draft, helpers }: BuiltinCompileContext) => {
      const raw = (draft.payload as { readonly relocations?: unknown })
        .relocations;
      if (!Array.isArray(raw) || raw.length === 0)
        throw new LogicParseError(
          "slot:relocate-occurrences.relocations must not be empty.",
        );
      const names = symbolNames(helpers.symbolCodes);
      const occupied = new Set<string>();
      const relocations = raw.map(
        (value, index): SlotOperationOccurrenceRelocation => {
          if (!value || typeof value !== "object" || Array.isArray(value))
            throw new LogicParseError(
              `relocation[${index}] must be an object.`,
            );
          const item = value as unknown as SlotOperationOccurrenceRelocation;
          validatePosition(item.source, input, `relocation[${index}].source`);
          validatePosition(item.target, input, `relocation[${index}].target`);
          const sourceKey = positionKey(item.source);
          const targetKey = positionKey(item.target);
          if (
            sourceKey === targetKey ||
            occupied.has(sourceKey) ||
            occupied.has(targetKey)
          )
            throw new LogicParseError(
              `relocation[${index}] positions must be disjoint.`,
            );
          occupied.add(sourceKey);
          occupied.add(targetKey);
          if (!names.has(item.sourceReplacement.code))
            throw new LogicParseError(
              `relocation[${index}].sourceReplacement.code is unknown.`,
            );
          validateValue(
            item.sourceReplacement.value,
            `relocation[${index}].sourceReplacement.value`,
          );
          return Object.freeze({
            source: Object.freeze({ ...item.source }),
            target: Object.freeze({ ...item.target }),
            sourceReplacement: Object.freeze({ ...item.sourceReplacement }),
          });
        },
      );
      const byPosition = new Map<string, SlotOperationOccurrence>(
        input.occurrences.map((item) => [positionKey(item.position), item]),
      );
      for (const [index, relocation] of relocations.entries()) {
        const source = requireOccurrence(input, relocation.source);
        const target = requireOccurrence(input, relocation.target);
        byPosition.set(
          positionKey(relocation.target),
          Object.freeze({ ...source, position: relocation.target }),
        );
        byPosition.set(
          positionKey(relocation.source),
          Object.freeze({
            ...target,
            id: `relocate:${draft.id}:${index}:source-replacement`,
            code: relocation.sourceReplacement.code,
            symbol: names.get(relocation.sourceReplacement.code)!,
            value: relocation.sourceReplacement.value,
            position: relocation.source,
          }),
        );
      }
      const occurrences = Object.freeze([...byPosition.values()]);
      return Object.freeze({
        output: snapshotFromOccurrences(
          sceneFromOccurrences(input, occurrences),
          valuesFromOccurrences(input, occurrences),
          occurrences,
        ),
        payload: Object.freeze({ relocations: Object.freeze(relocations) }),
        requiredCapabilities: Object.freeze(["slot:relocate-occurrences"]),
      });
    },
  });
}

function requirePositionArray(
  value: unknown,
  input: SlotOperationSnapshot,
  path: string,
): readonly SlotOperationPosition[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new LogicParseError(`${path} must not be empty.`);
  const seen = new Set<string>();
  return Object.freeze(
    value.map((item, index) => {
      const position = item as SlotOperationPosition;
      validatePosition(position, input, `${path}[${index}]`);
      const key = positionKey(position);
      if (seen.has(key))
        throw new LogicParseError(`${path} contains duplicate ${key}.`);
      seen.add(key);
      return Object.freeze({ ...position });
    }),
  );
}

function requireUpdates(
  value: unknown,
  input: SlotOperationSnapshot,
): readonly SlotOperationCellValueUpdate[] {
  if (!Array.isArray(value) || value.length === 0)
    throw new LogicParseError("slot:update-values.updates must not be empty.");
  const seen = new Set<string>();
  return Object.freeze(
    value.map((item, index) => {
      if (!item || typeof item !== "object" || Array.isArray(item))
        throw new LogicParseError(`update[${index}] must be an object.`);
      const update = item as SlotOperationCellValueUpdate;
      validatePosition(update.position, input, `update[${index}].position`);
      validateValue(update.value, `update[${index}].value`);
      const key = positionKey(update.position);
      if (seen.has(key))
        throw new LogicParseError(`duplicate update position ${key}.`);
      seen.add(key);
      if (requireOccurrence(input, update.position).value === update.value)
        throw new LogicParseError(`update[${index}] is a no-op.`);
      return Object.freeze({
        position: Object.freeze({ ...update.position }),
        value: update.value,
      });
    }),
  );
}

function validatePosition(
  position: SlotOperationPosition,
  input: SlotOperationSnapshot,
  path: string,
): void {
  if (
    !position ||
    !Number.isSafeInteger(position.x) ||
    !Number.isSafeInteger(position.y) ||
    position.x < 0 ||
    position.y < 0 ||
    position.x >= input.scene.length ||
    position.y >= input.scene[position.x]!.length
  )
    throw new LogicParseError(`${path} is out of bounds.`);
}

function validateValue(value: unknown, path: string): void {
  if (value !== null && (!Number.isSafeInteger(value) || (value as number) < 0))
    throw new LogicParseError(`${path} must be null or non-negative.`);
}

function requireOccurrence(
  input: SlotOperationSnapshot,
  position: SlotOperationPosition,
): SlotOperationOccurrence {
  const occurrence = input.occurrences.find(
    (item) => item.position.x === position.x && item.position.y === position.y,
  );
  if (!occurrence)
    throw new LogicParseError(
      `position ${positionKey(position)} has no occurrence.`,
    );
  return occurrence;
}

function symbolNames(
  codes: Readonly<Record<string, number>>,
): ReadonlyMap<number, string> {
  return new Map(Object.entries(codes).map(([symbol, code]) => [code, symbol]));
}

function positionKey(position: SlotOperationPosition): string {
  return `${position.x},${position.y}`;
}

function snapshotFromOccurrences(
  scene: SlotOperationSnapshot["scene"],
  values: SlotOperationSnapshot["values"],
  occurrences: readonly SlotOperationOccurrence[],
): SlotOperationSnapshot {
  return Object.freeze({
    scene: Object.freeze(scene.map((column) => Object.freeze([...column]))),
    values: Object.freeze(values.map((column) => Object.freeze([...column]))),
    occurrences: Object.freeze([...occurrences]),
  });
}

function sceneFromOccurrences(
  input: SlotOperationSnapshot,
  occurrences: readonly SlotOperationOccurrence[],
): SlotOperationSnapshot["scene"] {
  const byPosition = new Map(
    occurrences.map((item) => [positionKey(item.position), item]),
  );
  return Object.freeze(
    input.scene.map((column, x) =>
      Object.freeze(
        column.map((_value, y) => {
          const occurrence = byPosition.get(`${x},${y}`);
          return occurrence ? occurrence.code : -1;
        }),
      ),
    ),
  );
}

function valuesFromOccurrences(
  input: SlotOperationSnapshot,
  occurrences: readonly SlotOperationOccurrence[],
): SlotOperationSnapshot["values"] {
  const byPosition = new Map(
    occurrences.map((item) => [positionKey(item.position), item]),
  );
  return Object.freeze(
    input.scene.map((column, x) =>
      Object.freeze(
        column.map((_value, y) => {
          const occurrence = byPosition.get(`${x},${y}`);
          return occurrence ? occurrence.value : -1;
        }),
      ),
    ),
  );
}
