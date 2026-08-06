import {
  assertPlainData,
  type SlotOperationDraft,
  type SlotOperationSnapshot,
} from "@slotclientengine/logiccore";
import type {
  SlotOperationAuthoringEdge,
  SlotOperationAuthoringProjectV1,
  SlotOperationAuthoringSnapshot,
} from "./types.js";

export function parseSlotOperationAuthoringProject(
  value: unknown,
): SlotOperationAuthoringProjectV1 {
  assertPlainData(value, "project");
  const root = strictRecord(value, "project", [
    "kind",
    "version",
    "snapshots",
    "edges",
  ]);
  if (root.kind !== "slot-operation-authoring-project" || root.version !== 1)
    throw new Error("project must be slot-operation-authoring-project V1.");
  if (!Array.isArray(root.snapshots) || root.snapshots.length < 2)
    throw new Error("project.snapshots must contain at least two items.");
  const ids = new Set<string>();
  const snapshots = root.snapshots.map(
    (item, index): SlotOperationAuthoringSnapshot => {
      const record = strictRecord(item, `project.snapshots[${index}]`, [
        "id",
        "snapshot",
      ]);
      const id = nonBlank(record.id, `project.snapshots[${index}].id`);
      if (ids.has(id)) throw new Error(`duplicate snapshot id "${id}".`);
      ids.add(id);
      return Object.freeze({
        id,
        snapshot: record.snapshot as SlotOperationSnapshot,
      });
    },
  );
  if (!Array.isArray(root.edges) || root.edges.length !== snapshots.length - 1)
    throw new Error(
      "project.edges must contain exactly one edge per adjacent snapshot pair.",
    );
  const edges = root.edges.map((item, index): SlotOperationAuthoringEdge => {
    const record = strictRecord(item, `project.edges[${index}]`, [
      "inputSnapshotId",
      "outputSnapshotId",
      "drafts",
      "review",
    ]);
    const inputSnapshotId = nonBlank(
      record.inputSnapshotId,
      `project.edges[${index}].inputSnapshotId`,
    );
    const outputSnapshotId = nonBlank(
      record.outputSnapshotId,
      `project.edges[${index}].outputSnapshotId`,
    );
    if (
      inputSnapshotId !== snapshots[index]!.id ||
      outputSnapshotId !== snapshots[index + 1]!.id
    )
      throw new Error(
        `project.edges[${index}] must connect adjacent snapshots.`,
      );
    if (!Array.isArray(record.drafts) || record.drafts.length === 0)
      throw new Error(`project.edges[${index}].drafts must not be empty.`);
    if (record.review !== "required" && record.review !== "complete")
      throw new Error(`project.edges[${index}].review is invalid.`);
    return Object.freeze({
      inputSnapshotId,
      outputSnapshotId,
      drafts: Object.freeze(record.drafts as SlotOperationDraft[]),
      review: record.review,
    });
  });
  return deepFreeze({
    kind: "slot-operation-authoring-project" as const,
    version: 1 as const,
    snapshots:
      snapshots as unknown as SlotOperationAuthoringProjectV1["snapshots"],
    edges,
  });
}

function strictRecord(
  value: unknown,
  path: string,
  fields: readonly string[],
): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${path} must be an object.`);
  const record = value as Record<string, unknown>;
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`${path}.${unknown} is not supported.`);
  return record;
}

function nonBlank(value: unknown, path: string): string {
  if (typeof value !== "string" || !value.trim())
    throw new Error(`${path} must not be blank.`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const item of Object.values(value as Record<string, unknown>))
      deepFreeze(item);
  }
  return value;
}
