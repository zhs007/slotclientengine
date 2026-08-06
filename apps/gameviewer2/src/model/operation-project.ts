import type {
  SceneOtherSceneFlowPackageSummary,
  SceneOtherSceneFlowProjectV2,
} from "@slotclientengine/rendercore/scene-layout";
import type {
  SlotOperationAuthoringProjectV1,
  SlotOperationAuthoringEdge,
  SlotOperationAuthoringSnapshot,
} from "@slotclientengine/slotoperationauthoring";
import { finalizeSlotOperationAuthoringDraft } from "@slotclientengine/slotoperationauthoring";

export const GAMEVIEWER2_OPERATION_KINDS = Object.freeze([
  "slot:spin",
  "slot:win",
  "slot:collect",
  "slot:remove",
  "slot:update-values",
  "slot:replace-occurrences",
  "slot:relocate-occurrences",
  "slot:dropdown",
  "slot:refill",
] as const);

export type GameViewer2OperationKind =
  (typeof GAMEVIEWER2_OPERATION_KINDS)[number];

export function createGameViewer2OperationProject(options: {
  readonly flow: SceneOtherSceneFlowProjectV2;
  readonly summary: SceneOtherSceneFlowPackageSummary;
  readonly review: "required" | "complete";
}): SlotOperationAuthoringProjectV1 {
  const names = new Map(
    options.summary.symbols.map((item) => [item.code, item.name]),
  );
  const snapshots: SlotOperationAuthoringSnapshot[] = [
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
    let output;
    if (target.transition === "spin") {
      output = snapshotFromFlow(target, names);
      drafts.push(
        Object.freeze({
          id: `spin:${input.id}:${target.id}`,
          kind: "slot:spin",
          version: 1,
          source: source("output"),
          payload: Object.freeze({ output }),
        }),
      );
    } else {
      const replacements = target.scene.flatMap((column, x) =>
        column.flatMap((code, y) =>
          code === input.snapshot.scene[x]![y]
            ? []
            : [
                Object.freeze({
                  position: Object.freeze({ x, y }),
                  code,
                  value: target.otherScene[x]![y]!,
                  identity: "replace" as const,
                }),
              ],
        ),
      );
      const replacementId = `replace:${input.id}:${target.id}`;
      let current = input.snapshot;
      if (replacements.length > 0) {
        drafts.push(
          Object.freeze({
            id: replacementId,
            kind: "slot:replace-occurrences",
            version: 1,
            source: source("replacements"),
            payload: Object.freeze({
              replacements: Object.freeze(replacements),
            }),
          }),
        );
        current = applyReplacements(
          current,
          target,
          replacements,
          replacementId,
          names,
        );
      }
      const updates = target.otherScene.flatMap((column, x) =>
        column.flatMap((value, y) =>
          target.scene[x]![y] === input.snapshot.scene[x]![y] &&
          value !== current.values[x]![y]
            ? [Object.freeze({ position: Object.freeze({ x, y }), value })]
            : [],
        ),
      );
      if (updates.length > 0) {
        drafts.push(
          Object.freeze({
            id: `values:${input.id}:${target.id}`,
            kind: "slot:update-values",
            version: 1,
            source: source("values"),
            payload: Object.freeze({ updates: Object.freeze(updates) }),
          }),
        );
        current = applyUpdates(current, updates);
      }
      if (drafts.length === 0)
        drafts.push(
          Object.freeze({
            id: `collect:${input.id}:${target.id}`,
            kind: "slot:collect",
            version: 1,
            source: source("no-change"),
            payload: Object.freeze({}),
          }),
        );
      output = current;
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
    version: 1,
    snapshots: Object.freeze(
      snapshots,
    ) as SlotOperationAuthoringProjectV1["snapshots"],
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
  readonly project: SlotOperationAuthoringProjectV1;
  readonly edgeIndex: number;
  readonly draftIndex: number;
  readonly kind?: GameViewer2OperationKind;
  readonly payload?: unknown;
}): SlotOperationAuthoringProjectV1 {
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
  }) as SlotOperationAuthoringProjectV1;
}

export function acceptGameViewer2OperationEdge(options: {
  readonly project: SlotOperationAuthoringProjectV1;
  readonly edgeIndex: number;
  readonly summary: SceneOtherSceneFlowPackageSummary;
}): SlotOperationAuthoringProjectV1 {
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
  }) as SlotOperationAuthoringProjectV1;
}

function snapshotFromFlow(
  value: SceneOtherSceneFlowProjectV2["snapshots"][number],
  names: ReadonlyMap<number, string>,
) {
  return Object.freeze({
    scene: value.scene,
    values: value.otherScene,
    occurrences: Object.freeze(
      value.scene.flatMap((column, x) =>
        column.flatMap((code, y) => {
          const symbol = names.get(code);
          if (!symbol)
            throw new Error(
              `Snapshot ${value.id} uses unknown symbol code ${code}.`,
            );
          return [
            Object.freeze({
              id: `${value.id}:${x}:${y}`,
              code,
              symbol,
              value: value.otherScene[x]![y]!,
              position: Object.freeze({ x, y }),
            }),
          ];
        }),
      ),
    ),
  });
}

function applyReplacements(
  input: SlotOperationAuthoringSnapshot["snapshot"],
  target: SceneOtherSceneFlowProjectV2["snapshots"][number],
  replacements: readonly {
    readonly position: { readonly x: number; readonly y: number };
  }[],
  draftId: string,
  names: ReadonlyMap<number, string>,
) {
  const changed = new Set(
    replacements.map((item) => `${item.position.x},${item.position.y}`),
  );
  return Object.freeze({
    scene: target.scene,
    values: input.values.map((column, x) =>
      Object.freeze(
        column.map((value, y) =>
          changed.has(`${x},${y}`) ? target.otherScene[x]![y]! : value,
        ),
      ),
    ),
    occurrences: Object.freeze(
      input.occurrences.map((occurrence) => {
        const { x, y } = occurrence.position;
        if (!changed.has(`${x},${y}`)) return occurrence;
        const code = target.scene[x]![y]!;
        return Object.freeze({
          ...occurrence,
          id: `replace:${draftId}:${x}:${y}`,
          code,
          symbol: names.get(code)!,
          value: target.otherScene[x]![y]!,
        });
      }),
    ),
  });
}

function applyUpdates(
  input: SlotOperationAuthoringSnapshot["snapshot"],
  updates: readonly {
    readonly position: { readonly x: number; readonly y: number };
    readonly value: number | null;
  }[],
) {
  const values = new Map(
    updates.map((item) => [
      `${item.position.x},${item.position.y}`,
      item.value,
    ]),
  );
  return Object.freeze({
    scene: input.scene,
    values: input.values.map((column, x) =>
      Object.freeze(
        column.map((value, y) =>
          values.has(`${x},${y}`) ? values.get(`${x},${y}`)! : value,
        ),
      ),
    ),
    occurrences: Object.freeze(
      input.occurrences.map((occurrence) =>
        values.has(`${occurrence.position.x},${occurrence.position.y}`)
          ? Object.freeze({
              ...occurrence,
              value: values.get(
                `${occurrence.position.x},${occurrence.position.y}`,
              )!,
            })
          : occurrence,
      ),
    ),
  });
}
