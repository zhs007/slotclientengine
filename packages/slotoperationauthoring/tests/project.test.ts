import { describe, expect, it } from "vitest";
import {
  parseSlotOperationAuthoringProject,
  upgradeSlotOperationAuthoringProjectV1,
} from "../src/index.js";

describe("slot operation authoring project", () => {
  it("strictly parses and freezes adjacent edge ownership", () => {
    const parsed = parseSlotOperationAuthoringProject({
      kind: "slot-operation-authoring-project",
      version: 2,
      snapshots: [
        {
          id: "a",
          snapshot: { scene: [[0]], values: [[null]] },
        },
        {
          id: "b",
          snapshot: { scene: [[0]], values: [[null]] },
        },
      ],
      edges: [
        {
          inputSnapshotId: "a",
          outputSnapshotId: "b",
          review: "required",
          drafts: [
            {
              effect: "scene-landing",
              kind: "slot:spin",
              version: 2,
              source: {
                kind: "snapshot-authored",
                inputSnapshotId: "a",
                outputSnapshotId: "b",
                suggestions: [],
                edits: [],
              },
              output: { scene: [[0]], values: [[null]] },
              payload: {},
              businessKey: "a:b",
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
        version: 2,
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

  it("upgrades V1 snapshots without inferring operation effects", () => {
    const snapshot = {
      scene: [[0]],
      values: [[null]],
      occurrences: [
        {
          id: "legacy:0:0",
          code: 0,
          symbol: "A",
          value: null,
          position: { x: 0, y: 0 },
        },
      ],
    };
    const upgraded = upgradeSlotOperationAuthoringProjectV1({
      kind: "slot-operation-authoring-project",
      version: 1,
      snapshots: [
        { id: "a", snapshot },
        { id: "b", snapshot },
      ],
      edges: [
        {
          inputSnapshotId: "a",
          outputSnapshotId: "b",
          review: "complete",
          drafts: [{ kind: "slot:collect", version: 1 }],
        },
      ],
    });
    expect(upgraded).toMatchObject({
      version: 2,
      edges: [{ review: "required", drafts: [] }],
    });
    expect(upgraded.snapshots[0].snapshot).not.toHaveProperty("occurrences");
  });
});
