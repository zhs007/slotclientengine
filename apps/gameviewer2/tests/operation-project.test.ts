import { describe, expect, it } from "vitest";
import { finalizeSlotOperationAuthoringProject } from "@slotclientengine/slotoperationauthoring";
import {
  acceptGameViewer2OperationEdge,
  createGameViewer2OperationProject,
  operationSymbolCodes,
  updateGameViewer2OperationDraft,
} from "../src/model/operation-project.js";

const summary = {
  columns: 1,
  rows: 1,
  symbols: [
    { code: 1, name: "A" },
    { code: 2, name: "B" },
  ],
} as const;

describe("gameviewer2 operation project", () => {
  it("authors spin, settled replacement and value commits with exact closure", () => {
    const project = createGameViewer2OperationProject({
      summary: summary as never,
      review: "complete",
      flow: flow() as never,
    });
    expect(
      project.edges.map((edge) => edge.drafts.map((draft) => draft.kind)),
    ).toEqual([
      ["slot:scene-landing", "slot:spin"],
      ["slot:state-mutation"],
      ["slot:state-mutation"],
    ]);
    const plan = finalizeSlotOperationAuthoringProject({
      project,
      symbolCodes: operationSymbolCodes(summary as never),
      columns: 1,
      rows: 1,
    });
    expect(plan.final.scene).toEqual([[2]]);
    expect(plan.final.values).toEqual([[9]]);
  });

  it("keeps upgraded edges unresolved until explicit review", () => {
    const project = createGameViewer2OperationProject({
      summary: summary as never,
      review: "required",
      flow: flow() as never,
    });
    expect(() =>
      finalizeSlotOperationAuthoringProject({
        project,
        symbolCodes: operationSymbolCodes(summary as never),
        columns: 1,
        rows: 1,
      }),
    ).toThrow(/requires review/);
  });

  it("marks manual payload metadata edits pending without changing effect closure", () => {
    const project = createGameViewer2OperationProject({
      summary: summary as never,
      review: "complete",
      flow: flow() as never,
    });
    const invalid = updateGameViewer2OperationDraft({
      project,
      edgeIndex: 1,
      draftIndex: 0,
      payload: { note: "reviewed" },
    });
    expect(invalid.edges[1]!.review).toBe("required");
    const acceptedMetadata = acceptGameViewer2OperationEdge({
      project: invalid,
      edgeIndex: 1,
      summary: summary as never,
    });
    expect(acceptedMetadata.edges[1]!.review).toBe("complete");

    const accepted = acceptGameViewer2OperationEdge({
      project,
      edgeIndex: 1,
      summary: summary as never,
    });
    expect(accepted.edges[1]!.review).toBe("complete");
    expect(accepted.edges[1]!.drafts[0]!.source).toMatchObject({
      kind: "snapshot-authored",
      suggestions: [{ status: "exact" }],
    });
  });
});

function flow() {
  const base = {
    completionPolicy: "all-cells-normal",
    choreographies: [["spin"]],
  } as const;
  return {
    kind: "scene-other-scene-flow",
    version: 2,
    spin: {},
    choreographies: [],
    snapshots: [
      {
        kind: "initial",
        id: "s0",
        name: "initial",
        scene: [[1]],
        otherScene: [[1]],
      },
      {
        ...base,
        kind: "scene",
        id: "s1",
        name: "spin",
        transition: "spin",
        scene: [[1]],
        otherScene: [[1]],
      },
      {
        ...base,
        kind: "scene",
        id: "s2",
        name: "replace",
        transition: "settled",
        scene: [[2]],
        otherScene: [[2]],
      },
      {
        ...base,
        kind: "scene",
        id: "s3",
        name: "value",
        transition: "settled",
        scene: [[2]],
        otherScene: [[9]],
      },
    ],
  };
}
