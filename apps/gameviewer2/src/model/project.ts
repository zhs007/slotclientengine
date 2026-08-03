import {
  parseSceneOtherSceneFlowProject,
  type SceneOtherSceneFlowProjectV2,
} from "@slotclientengine/rendercore/scene-layout";

export interface GameViewer2ProjectFileV2 {
  readonly kind: "gameviewer2-project";
  readonly version: 2;
  readonly layoutSha256: string;
  readonly flow: SceneOtherSceneFlowProjectV2;
}

export function parseGameViewer2ProjectFile(
  input: unknown,
): GameViewer2ProjectFileV2 {
  if (typeof input !== "object" || input === null || Array.isArray(input))
    throw new Error("项目文件必须是对象。");
  const record = input as Record<string, unknown>;
  const allowed = new Set(["kind", "version", "layoutSha256", "flow"]);
  const unknown = Object.keys(record).find((key) => !allowed.has(key));
  if (unknown) throw new Error(`项目字段 ${unknown} 不受支持。`);
  if (record.kind !== "gameviewer2-project" || record.version !== 2)
    throw new Error("不是 Game Viewer 2 v2 项目文件。");
  if (
    typeof record.layoutSha256 !== "string" ||
    !/^[0-9a-f]{64}$/u.test(record.layoutSha256)
  )
    throw new Error("layoutSha256 必须是 64 位小写十六进制。 ");
  return Object.freeze({
    kind: "gameviewer2-project",
    version: 2,
    layoutSha256: record.layoutSha256,
    flow: parseSceneOtherSceneFlowProject(record.flow),
  });
}

export function cloneFlowProject(
  project: SceneOtherSceneFlowProjectV2,
): SceneOtherSceneFlowProjectV2 {
  return structuredClone(project);
}

export function downloadProject(project: GameViewer2ProjectFileV2): void {
  const blob = new Blob([`${JSON.stringify(project, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "gameviewer2-project.json";
  anchor.click();
  URL.revokeObjectURL(url);
}
