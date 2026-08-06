import { describe, expect, it } from "vitest";
import { parseSlotOperationAuthoringProject } from "../src/index.js";

describe("slot operation authoring project", () => {
  it("strictly parses and freezes adjacent edge ownership", () => {
    const parsed = parseSlotOperationAuthoringProject({
      kind: "slot-operation-authoring-project",
      version: 1,
      snapshots: [
        {
          id: "a",
          snapshot: { scene: [[0]], values: [[null]], occurrences: [] },
        },
        {
          id: "b",
          snapshot: { scene: [[0]], values: [[null]], occurrences: [] },
        },
      ],
      edges: [
        {
          inputSnapshotId: "a",
          outputSnapshotId: "b",
          review: "required",
          drafts: [
            {
              id: "spin",
              kind: "slot:spin",
              version: 1,
              source: {
                kind: "snapshot-authored",
                inputSnapshotId: "a",
                outputSnapshotId: "b",
                suggestions: [],
                edits: [],
              },
              payload: {},
            },
          ],
        },
      ],
    });

    expect(Object.isFrozen(parsed)).toBe(true);
    expect(parsed.edges[0]?.review).toBe("required");
  });

  it("rejects non-adjacent edge ids and unknown fields", () => {
    expect(() =>
      parseSlotOperationAuthoringProject({
        kind: "slot-operation-authoring-project",
        version: 1,
        snapshots: [
          { id: "a", snapshot: {} },
          { id: "b", snapshot: {} },
        ],
        edges: [
          {
            inputSnapshotId: "b",
            outputSnapshotId: "a",
            review: "required",
            drafts: [{}],
          },
        ],
      }),
    ).toThrow(/adjacent snapshots/);
  });
});
