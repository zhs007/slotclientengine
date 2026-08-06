import { LogicParseError } from "../errors";
import type { SlotOperationOccurrence, SlotOperationSnapshot } from "./types";
import type { SlotStateMutation } from "./v2-types";

export function deriveSlotStateMutations(
  input: SlotOperationSnapshot,
  output: SlotOperationSnapshot,
): readonly SlotStateMutation[] {
  const inputById = new Map(input.occurrences.map((item) => [item.id, item]));
  const outputById = new Map(output.occurrences.map((item) => [item.id, item]));
  const inputByPosition = new Map(
    input.occurrences.map((item) => [positionKey(item), item]),
  );
  const outputByPosition = new Map(
    output.occurrences.map((item) => [positionKey(item), item]),
  );
  const stable: SlotStateMutation[] = [];
  const removals: SlotStateMutation[] = [];
  const relocations: SlotStateMutation[] = [];
  const insertions: SlotStateMutation[] = [];
  const representedOutputIds = new Set<string>();

  for (const occurrence of input.occurrences) {
    const next = outputById.get(occurrence.id);
    if (next) {
      representedOutputIds.add(next.id);
      if (positionKey(occurrence) !== positionKey(next)) {
        relocations.push({
          kind: "relocate",
          source: occurrence.position,
          target: next.position,
          occurrenceId: occurrence.id,
        });
      } else if (occurrence.code !== next.code) {
        stable.push({
          kind: "replace",
          position: occurrence.position,
          inputOccurrenceId: occurrence.id,
          outputCode: next.code,
          outputValue: next.value,
        });
      } else if (occurrence.value !== next.value) {
        stable.push({
          kind: "value-update",
          position: occurrence.position,
          occurrenceId: occurrence.id,
          inputValue: occurrence.value,
          outputValue: next.value,
        });
      }
      continue;
    }
    const replacement = outputByPosition.get(positionKey(occurrence));
    if (replacement && !inputById.has(replacement.id)) {
      representedOutputIds.add(replacement.id);
      stable.push({
        kind: "replace",
        position: occurrence.position,
        inputOccurrenceId: occurrence.id,
        outputOccurrenceId: replacement.id,
        outputCode: replacement.code,
        outputValue: replacement.value,
      });
    } else {
      removals.push({
        kind: "remove",
        position: occurrence.position,
        occurrenceId: occurrence.id,
      });
    }
  }

  for (const occurrence of output.occurrences) {
    if (representedOutputIds.has(occurrence.id) || inputById.has(occurrence.id))
      continue;
    const before = inputByPosition.get(positionKey(occurrence));
    if (before && !outputById.has(before.id)) continue;
    insertions.push({
      kind: "insert",
      position: occurrence.position,
      occurrenceId: occurrence.id,
      outputCode: occurrence.code,
      outputValue: occurrence.value,
    });
  }
  const mutations = [...stable, ...removals, ...relocations, ...insertions];
  if (mutations.length === 0)
    throw new LogicParseError("state mutation output is identical to input.");
  return Object.freeze(mutations);
}

function positionKey(occurrence: SlotOperationOccurrence): string {
  return `${occurrence.position.x},${occurrence.position.y}`;
}
