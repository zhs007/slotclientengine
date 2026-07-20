import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";
import type { ImportedPopupPackage } from "../io/imported-popup-package.js";
import {
  activeVariantIds,
  type EditorGameModeDraft,
  type EditorProject,
} from "./editor-project.js";

const MODE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/u;

export function addGameMode(project: EditorProject, id: string): void {
  assertModeId(id);
  if (project.gameModes.modes.some((mode) => mode.id === id))
    throw new Error(`游戏模式已存在：${id}`);
  project.gameModes.modes.push({
    id,
    nodeStates: initialNodeStates(project),
    awardCelebrationPopupId: null,
  });
}

export function renameGameMode(
  project: EditorProject,
  currentId: string,
  nextId: string,
): void {
  assertModeId(nextId);
  const mode = requireMode(project, currentId);
  if (
    nextId !== currentId &&
    project.gameModes.modes.some((candidate) => candidate.id === nextId)
  )
    throw new Error(`游戏模式已存在：${nextId}`);
  mode.id = nextId;
  if (project.gameModes.initialMode === currentId)
    project.gameModes.initialMode = nextId;
}

export function deleteGameMode(project: EditorProject, id: string): void {
  if (project.gameModes.modes.length <= 1)
    throw new Error("layout 至少必须保留一个游戏模式。");
  if (project.gameModes.initialMode === id)
    throw new Error("删除 initial mode 前必须先选择其它 initial mode。");
  const index = project.gameModes.modes.findIndex((mode) => mode.id === id);
  if (index < 0) throw new Error(`未知游戏模式：${id}`);
  project.gameModes.modes.splice(index, 1);
}

export function setInitialGameMode(project: EditorProject, id: string): void {
  const mode = requireMode(project, id);
  const expected = initialNodeStates(project);
  for (const [nodeId, state] of Object.entries(expected))
    if (mode.nodeStates[nodeId] !== state)
      throw new Error(
        `initial mode ${id} 的节点 ${nodeId} 必须绑定初始状态 ${state}。`,
      );
  project.gameModes.initialMode = id;
}

export function setGameModeNodeState(
  project: EditorProject,
  modeId: string,
  nodeId: string,
  state: string,
): void {
  const mode = requireMode(project, modeId);
  const node = project.nodes.find((candidate) => candidate.id === nodeId);
  if (!node?.playback || node.playback.kind !== "state-machine")
    throw new Error(`节点不是 stateful Spine node：${nodeId}`);
  if (!node.playback.states.some((candidate) => candidate.id === state))
    throw new Error(`节点 ${nodeId} 不存在稳定状态：${state}`);
  if (
    project.gameModes.initialMode === modeId &&
    state !== node.playback.initialState
  )
    throw new Error(`initial mode 的节点 ${nodeId} 必须保持初始状态。`);
  mode.nodeStates[nodeId] = state;
}

export function bindGameModePopup(
  project: EditorProject,
  modeId: string,
  popupId: string | null,
): void {
  const mode = requireMode(project, modeId);
  if (popupId !== null && !project.popupDependencies.has(popupId))
    throw new Error(`未知 Popup dependency：${popupId}`);
  mode.awardCelebrationPopupId = popupId;
}

export function importPopupDependency(
  project: EditorProject,
  imported: ImportedPopupPackage,
): void {
  const id = imported.manifest.id;
  if (project.popupDependencies.has(id))
    throw new Error(`Popup dependency ${id} 已存在，可使用替换。`);
  project.popupDependencies.set(id, {
    id,
    files: cloneFiles(imported.files),
    placements: Object.fromEntries(
      activeVariantIds(project).map((variantId) => [
        variantId,
        { x: 0, y: 0, scale: 1 },
      ]),
    ),
  });
}

export function replacePopupDependency(
  project: EditorProject,
  id: string,
  imported: ImportedPopupPackage,
): void {
  const current = project.popupDependencies.get(id);
  if (!current) throw new Error(`未知 Popup dependency：${id}`);
  if (imported.manifest.id !== id)
    throw new Error(
      `替换 Popup id 必须保持 ${id}，实际为 ${imported.manifest.id}。`,
    );
  project.popupDependencies.set(id, {
    ...current,
    files: cloneFiles(imported.files),
  });
}

export function deletePopupDependency(
  project: EditorProject,
  id: string,
): void {
  if (!project.popupDependencies.has(id))
    throw new Error(`未知 Popup dependency：${id}`);
  const users = project.gameModes.modes
    .filter((mode) => mode.awardCelebrationPopupId === id)
    .map((mode) => mode.id);
  if (users.length)
    throw new Error(`Popup ${id} 仍被游戏模式引用：${users.join(", ")}`);
  project.popupDependencies.delete(id);
}

export function setPopupPlacement(
  project: EditorProject,
  popupId: string,
  variantId: SceneLayoutVariantId,
  placement: { x: number; y: number; scale: number },
): void {
  const dependency = project.popupDependencies.get(popupId);
  if (!dependency) throw new Error(`未知 Popup dependency：${popupId}`);
  if (
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.scale) ||
    placement.scale <= 0
  )
    throw new Error("Popup placement 必须使用有限 x/y 与正数 scale。");
  dependency.placements[variantId] = { ...placement };
}

export function synchronizeGameModeNodeStates(project: EditorProject): void {
  const defaults = initialNodeStates(project);
  const valid = new Map(
    project.nodes.flatMap((node) =>
      node.playback?.kind === "state-machine"
        ? [
            [
              node.id,
              new Set(node.playback.states.map((state) => state.id)),
            ] as const,
          ]
        : [],
    ),
  );
  for (const mode of project.gameModes.modes) {
    const next: Record<string, string> = {};
    for (const [nodeId, initial] of Object.entries(defaults)) {
      const current = mode.nodeStates[nodeId];
      next[nodeId] =
        current && valid.get(nodeId)?.has(current) ? current : initial;
    }
    mode.nodeStates = next;
  }
  requireMode(project, project.gameModes.initialMode).nodeStates = defaults;
}

function initialNodeStates(project: EditorProject): Record<string, string> {
  return Object.fromEntries(
    project.nodes.flatMap((node) =>
      node.playback?.kind === "state-machine"
        ? [[node.id, node.playback.initialState]]
        : [],
    ),
  );
}

function requireMode(project: EditorProject, id: string): EditorGameModeDraft {
  const mode = project.gameModes.modes.find((candidate) => candidate.id === id);
  if (!mode) throw new Error(`未知游戏模式：${id}`);
  return mode;
}

function assertModeId(id: string): void {
  if (!MODE_ID.test(id))
    throw new Error(`游戏模式 id 必须匹配 ${MODE_ID.source}。`);
}

function cloneFiles(
  files: ReadonlyMap<string, Uint8Array>,
): ReadonlyMap<string, Uint8Array> {
  return new Map([...files].map(([path, bytes]) => [path, bytes.slice()]));
}
