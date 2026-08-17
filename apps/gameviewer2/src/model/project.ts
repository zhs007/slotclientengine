import {
  parseSceneOtherSceneFlowProject,
  type SceneOtherSceneFlowProjectV2,
} from "@slotclientengine/rendercore/scene-layout/editor";
import {
  parseSlotOperationAuthoringProject,
  type SlotOperationAuthoringProjectV2,
} from "@slotclientengine/slotoperationauthoring";

export interface GameViewer2ProjectFileV2 {
  readonly kind: "gameviewer2-project";
  readonly version: 2;
  readonly layoutSha256: string;
  readonly flow: SceneOtherSceneFlowProjectV2;
}

export interface GameViewer2ProjectFileV3 {
  readonly kind: "gameviewer2-project";
  readonly version: 3;
  readonly layoutSha256: string;
  readonly flow: SceneOtherSceneFlowProjectV2;
  readonly operations: unknown;
}

export interface GameViewer2ProjectFileV4 {
  readonly kind: "gameviewer2-project";
  readonly version: 4;
  readonly layoutSha256: string;
  readonly flow: SceneOtherSceneFlowProjectV2;
  readonly operations: SlotOperationAuthoringProjectV2;
}

export function parseGameViewer2ProjectFile(
  input: unknown,
): GameViewer2ProjectFileV4 {
  const record = projectRecord(input);
  if (record.kind !== "gameviewer2-project" || record.version !== 4)
    throw new Error(
      "不是 Game Viewer 2 v4 项目文件；旧项目必须显式升级并审阅 effect。",
    );
  rejectUnknown(record, [
    "kind",
    "version",
    "layoutSha256",
    "flow",
    "operations",
  ]);
  return Object.freeze({
    kind: "gameviewer2-project",
    version: 4,
    layoutSha256: parseHash(record.layoutSha256),
    flow: parseSceneOtherSceneFlowProject(record.flow),
    operations: parseSlotOperationAuthoringProject(record.operations),
  });
}

export function parseGameViewer2ProjectFileV3(
  input: unknown,
): GameViewer2ProjectFileV3 {
  const record = projectRecord(input);
  rejectUnknown(record, [
    "kind",
    "version",
    "layoutSha256",
    "flow",
    "operations",
  ]);
  if (record.kind !== "gameviewer2-project" || record.version !== 3)
    throw new Error("不是 Game Viewer 2 v3 项目文件。");
  return Object.freeze({
    kind: "gameviewer2-project",
    version: 3,
    layoutSha256: parseHash(record.layoutSha256),
    flow: parseSceneOtherSceneFlowProject(record.flow),
    operations: record.operations,
  });
}

export function parseGameViewer2ProjectFileV2(
  input: unknown,
): GameViewer2ProjectFileV2 {
  const record = projectRecord(input);
  rejectUnknown(record, ["kind", "version", "layoutSha256", "flow"]);
  if (record.kind !== "gameviewer2-project" || record.version !== 2)
    throw new Error("不是 Game Viewer 2 v2 项目文件。");
  return Object.freeze({
    kind: "gameviewer2-project",
    version: 2,
    layoutSha256: parseHash(record.layoutSha256),
    flow: parseSceneOtherSceneFlowProject(record.flow),
  });
}

export function cloneFlowProject(
  project: SceneOtherSceneFlowProjectV2,
): SceneOtherSceneFlowProjectV2 {
  return structuredClone(project);
}

export function downloadProject(project: GameViewer2ProjectFileV4): void {
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gameviewer2-project-v4.json";
  anchor.click();
  URL.revokeObjectURL(url);
}

function projectRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("项目文件必须是对象。");
  return input as Record<string, unknown>;
}

function rejectUnknown(
  record: Record<string, unknown>,
  fields: readonly string[],
): void {
  const allowed = new Set(fields);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`项目字段 ${unknown} 不受支持。`);
}

function parseHash(value: unknown): string {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/u.test(value))
    throw new Error("layoutSha256 必须是 64 位小写十六进制。 ");
  return value;
}
