import type {
  SceneOtherSceneFlowPackageSummary,
  SceneOtherSceneFlowProjectV2,
} from "@slotclientengine/rendercore/scene-layout";
import type {
  SlotOperationAuthoringProjectV2,
  SlotOperationAuthoringEdge,
} from "@slotclientengine/slotoperationauthoring";
import { finalizeSlotOperationAuthoringDraft } from "@slotclientengine/slotoperationauthoring";

export const GAMEVIEWER2_OPERATION_KINDS = Object.freeze([
  "slot:spin",
  "slot:scene-landing",
  "slot:state-mutation",
  "slot:win",
  "slot:completion",
] as const);

export type GameViewer2OperationKind =
  (typeof GAMEVIEWER2_OPERATION_KINDS)[number];

export function createGameViewer2OperationProject(options: {
  readonly flow: SceneOtherSceneFlowProjectV2;
  readonly summary: SceneOtherSceneFlowPackageSummary;
  readonly review: "required" | "complete";
}): SlotOperationAuthoringProjectV2 {
  const names = new Map(
    options.summary.symbols.map((item) => [item.code, item.name]),
  );
  const snapshots: SlotOperationAuthoringProjectV2["snapshots"][number][] = [
    Object.freeze({
      id: options.flow.snapshots[0].id,
      snapshot: snapshotFromFlow(options.flow.snapshots[0], names),
    }),
  ];
  const edges = options.flow.snapshots.slice(1).map((target, index) => {
    if (target.kind !== "scene")
      throw new Error(
        `Snapshot ${target.id} after the initial item must be a scene.`,
      );
    const input = snapshots[index]!;
    const accepted = options.review === "complete";
    const source = (field: string) =>
      Object.freeze({
        kind: "snapshot-authored" as const,
        inputSnapshotId: input.id,
        outputSnapshotId: target.id,
        suggestions: Object.freeze([
          Object.freeze({
            field,
            status: accepted ? ("exact" as const) : ("unresolved" as const),
            candidateCount: 1,
            diagnostics: Object.freeze(
              accepted
                ? []
                : [
                    `Edge ${input.id} → ${target.id} was upgraded from a snapshot-only project and requires explicit review.`,
                  ],
            ),
          }),
        ]),
        edits: Object.freeze(
          accepted
            ? [
                Object.freeze({
                  field,
                  action: "accept" as const,
                  reason: `User accepted ${target.transition} snapshot evidence.`,
                }),
              ]
            : [],
        ),
      });
    const drafts: SlotOperationAuthoringEdge["drafts"][number][] = [];
    if (index === 0)
      drafts.push(
        Object.freeze({
          effect: "scene-landing" as const,
          kind: "slot:scene-landing",
          version: 2,
          source: Object.freeze({
            ...source("initial-scene"),
            outputSnapshotId: input.id,
          }),
          output: input.snapshot,
          payload: Object.freeze({}),
          businessKey: `initial:${input.id}`,
        }),
      );
    let output;
    if (target.transition === "spin") {
      output = snapshotFromFlow(target, names);
      drafts.push(
        Object.freeze({
          effect: "scene-landing" as const,
          kind: "slot:spin",
          version: 2,
          source: source("output"),
          output,
          payload: Object.freeze({}),
          businessKey: `${input.id}:${target.id}`,
        }),
      );
    } else {
      output = snapshotFromFlow(target, names);
      if (JSON.stringify(input.snapshot) !== JSON.stringify(output))
        drafts.push(
          Object.freeze({
            effect: "state-mutation" as const,
            kind: "slot:state-mutation",
            version: 2,
            source: source("output"),
            output,
            payload: Object.freeze({}),
            businessKey: `${input.id}:${target.id}`,
          }),
        );
    }
    snapshots.push(Object.freeze({ id: target.id, snapshot: output }));
    return Object.freeze({
      inputSnapshotId: input.id,
      outputSnapshotId: target.id,
      review: options.review,
      drafts: Object.freeze(drafts),
    });
  });
  return Object.freeze({
    kind: "slot-operation-authoring-project",
    version: 2,
    snapshots: Object.freeze(
      snapshots,
    ) as SlotOperationAuthoringProjectV2["snapshots"],
    edges: Object.freeze(edges),
  });
}

export function operationSymbolCodes(
  summary: SceneOtherSceneFlowPackageSummary,
): Readonly<Record<string, number>> {
  return Object.freeze(
    Object.fromEntries(
      summary.symbols.map((symbol) => [symbol.name, symbol.code]),
    ),
  );
}

export function updateGameViewer2OperationDraft(options: {
  readonly project: SlotOperationAuthoringProjectV2;
  readonly edgeIndex: number;
  readonly draftIndex: number;
  readonly kind?: GameViewer2OperationKind;
  readonly payload?: unknown;
}): SlotOperationAuthoringProjectV2 {
  const project = structuredClone(options.project);
  const edge = project.edges[options.edgeIndex];
  const draft = edge?.drafts[options.draftIndex];
  if (!edge || !draft) throw new Error("Operation 草稿索引不存在。");
  if (draft.source.kind !== "snapshot-authored")
    throw new Error("Game Viewer 2 只能编辑 snapshot-authored operation。");
  const edits = [...draft.source.edits];
  if (options.kind !== undefined)
    edits.push({ field: "kind", action: "replace", reason: "Manual edit" });
  if (options.payload !== undefined)
    edits.push({
      field: "payload",
      action: "replace",
      reason: "Manual JSON edit",
    });
  const nextDraft = {
    ...draft,
    ...(options.kind === undefined ? {} : { kind: options.kind }),
    ...(options.payload === undefined ? {} : { payload: options.payload }),
    source: { ...draft.source, edits },
  };
  const drafts = [...edge.drafts];
  drafts[options.draftIndex] = nextDraft;
  const edges = [...project.edges];
  edges[options.edgeIndex] = { ...edge, drafts, review: "required" };
  return Object.freeze({
    ...project,
    edges,
  }) as SlotOperationAuthoringProjectV2;
}

export function acceptGameViewer2OperationEdge(options: {
  readonly project: SlotOperationAuthoringProjectV2;
  readonly edgeIndex: number;
  readonly summary: SceneOtherSceneFlowPackageSummary;
}): SlotOperationAuthoringProjectV2 {
  const edge = options.project.edges[options.edgeIndex];
  if (!edge) throw new Error("Operation edge 索引不存在。");
  const input = options.project.snapshots.find(
    (item) => item.id === edge.inputSnapshotId,
  );
  const output = options.project.snapshots.find(
    (item) => item.id === edge.outputSnapshotId,
  );
  if (!input || !output)
    throw new Error("Operation edge 引用的 snapshot 不存在。");
  const plan = finalizeSlotOperationAuthoringDraft({
    initial: input.snapshot,
    drafts: edge.drafts,
    symbolCodes: operationSymbolCodes(options.summary),
    columns: options.summary.columns,
    rows: options.summary.rows,
  });
  if (JSON.stringify(plan.final) !== JSON.stringify(output.snapshot))
    throw new Error(
      `Operation edge ${edge.inputSnapshotId} → ${edge.outputSnapshotId} 未精确闭合。`,
    );
  const drafts = edge.drafts.map((draft) => {
    if (draft.source.kind !== "snapshot-authored")
      throw new Error("Game Viewer 2 只能接受 snapshot-authored operation。");
    return {
      ...draft,
      source: {
        ...draft.source,
        suggestions: draft.source.suggestions.map((suggestion) => ({
          ...suggestion,
          status: "exact" as const,
          diagnostics: [],
        })),
        edits: [
          ...draft.source.edits,
          ...draft.source.suggestions.map((suggestion) => ({
            field: suggestion.field,
            action: "accept" as const,
            reason: "Edge compiled and closed against the authored snapshot.",
          })),
        ],
      },
    };
  });
  const edges = [...options.project.edges];
  edges[options.edgeIndex] = { ...edge, drafts, review: "complete" };
  return Object.freeze({
    ...options.project,
    edges,
  }) as SlotOperationAuthoringProjectV2;
}

function snapshotFromFlow(
  value: SceneOtherSceneFlowProjectV2["snapshots"][number],
  names: ReadonlyMap<number, string>,
) {
  value.scene.forEach((column) =>
    column.forEach((code) => {
      if (!names.has(code))
        throw new Error(
          `Snapshot ${value.id} uses unknown symbol code ${code}.`,
        );
    }),
  );
  return Object.freeze({
    scene: value.scene,
    values: value.otherScene,
  });
}
