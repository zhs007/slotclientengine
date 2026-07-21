import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";
import type { ImportedPopupPackage } from "../io/imported-popup-package.js";
import type { ImportedSymbolPackage } from "../io/imported-symbol-package.js";
import {
  activeVariantIds,
  validateEditorTransitionEvent,
  type EditorGameModeTransitionDraft,
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
    backgroundNodes: Object.fromEntries(
      activeVariantIds(project).map((variant) => [
        variant,
        project.variants[variant].backgroundNode,
      ]),
    ),
    nodeStates: {},
    symbols: null,
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
  for (const transition of project.gameModes.transitions) {
    if (transition.fromModeId === currentId) transition.fromModeId = nextId;
    if (transition.toModeId === currentId) transition.toModeId = nextId;
  }
  if (project.gameModes.initialMode === currentId)
    project.gameModes.initialMode = nextId;
}

export function deleteGameMode(project: EditorProject, id: string): void {
  if (project.gameModes.modes.length <= 1)
    throw new Error("layout 至少必须保留一个游戏模式。");
  if (project.gameModes.initialMode === id)
    throw new Error("删除 initial mode 前必须先选择其它 initial mode。");
  const references = project.gameModes.transitions.filter(
    (transition) => transition.fromModeId === id || transition.toModeId === id,
  );
  if (references.length)
    throw new Error(
      `游戏模式 ${id} 仍被转场引用：${references
        .map(
          (transition) => `${transition.fromModeId} -> ${transition.toModeId}`,
        )
        .join(", ")}`,
    );
  const index = project.gameModes.modes.findIndex((mode) => mode.id === id);
  if (index < 0) throw new Error(`未知游戏模式：${id}`);
  project.gameModes.modes.splice(index, 1);
}

export function setInitialGameMode(project: EditorProject, id: string): void {
  const mode = requireMode(project, id);
  project.gameModes.initialMode = id;
  for (const variant of activeVariantIds(project))
    project.variants[variant].backgroundNode =
      mode.backgroundNodes[variant] ?? "";
}

export function bindGameModeBackground(
  project: EditorProject,
  modeId: string,
  variant: SceneLayoutVariantId,
  nodeId: string,
): void {
  if (!activeVariantIds(project).includes(variant))
    throw new Error(`当前项目不使用 ${variant} variant。`);
  const mode = requireMode(project, modeId);
  const node = project.nodes.find((candidate) => candidate.id === nodeId);
  if (!node) throw new Error(`未知背景节点：${nodeId}`);
  const resource = project.resources.get(node.resourceId);
  if (!resource || resource.kind === "image-string")
    throw new Error(`背景节点不能使用 image-string：${nodeId}`);
  if (!node.placements[variant])
    throw new Error(`背景节点 ${nodeId} 缺少 ${variant} placement。`);
  mode.backgroundNodes[variant] = nodeId;
  if (project.gameModes.initialMode === modeId)
    project.variants[variant].backgroundNode = nodeId;
}

export function createGameModeTransition(
  project: EditorProject,
  fromModeId: string,
  toModeId: string,
): void {
  requireMode(project, fromModeId);
  requireMode(project, toModeId);
  if (fromModeId === toModeId) throw new Error("转场不得自循环。");
  if (
    project.gameModes.transitions.some(
      (item) => item.fromModeId === fromModeId && item.toModeId === toModeId,
    )
  )
    throw new Error(`转场已存在：${fromModeId} -> ${toModeId}`);
  project.gameModes.transitions.push({
    fromModeId,
    toModeId,
    resourceId: "",
    animation: "",
    switchEvent: "",
    placements: Object.fromEntries(
      activeVariantIds(project).map((variant) => [
        variant,
        { x: 0, y: 0, scale: 1 },
      ]),
    ),
  });
}

export function deleteGameModeTransition(
  project: EditorProject,
  fromModeId: string,
  toModeId: string,
): void {
  const index = project.gameModes.transitions.findIndex(
    (item) => item.fromModeId === fromModeId && item.toModeId === toModeId,
  );
  if (index < 0) throw new Error(`未知转场：${fromModeId} -> ${toModeId}`);
  project.gameModes.transitions.splice(index, 1);
}

export function setGameModeTransitionResource(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  resourceId: string,
): void {
  const resource = project.resources.get(resourceId);
  if (!resource || resource.kind !== "spine")
    throw new Error(`转场资源必须是已有 Spine resource：${resourceId}`);
  transition.resourceId = resourceId;
  if (!resource.animationNames.includes(transition.animation)) {
    transition.animation = "";
    transition.switchEvent = "";
  } else {
    try {
      validateEditorTransitionEvent(resource, transition);
    } catch {
      transition.switchEvent = "";
    }
  }
}

export function setGameModeTransitionAnimation(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  animation: string,
): void {
  const resource = project.resources.get(transition.resourceId);
  if (!resource || resource.kind !== "spine")
    throw new Error("请先选择转场 Spine resource。");
  if (!resource.animationNames.includes(animation))
    throw new Error(`转场 animation 不存在：${animation}`);
  transition.animation = animation;
  try {
    validateEditorTransitionEvent(resource, transition);
  } catch {
    transition.switchEvent = "";
  }
}

export function setGameModeTransitionEvent(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  switchEvent: string,
): void {
  const resource = project.resources.get(transition.resourceId);
  if (!resource || resource.kind !== "spine")
    throw new Error("请先选择转场 Spine resource。");
  validateEditorTransitionEvent(resource, {
    animation: transition.animation,
    switchEvent,
  });
  transition.switchEvent = switchEvent;
}

export function setGameModeTransitionPlacement(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  variant: SceneLayoutVariantId,
  placement: { readonly x: number; readonly y: number; readonly scale: number },
): void {
  if (!activeVariantIds(project).includes(variant))
    throw new Error(`当前项目不使用 ${variant} variant。`);
  if (
    !Number.isFinite(placement.x) ||
    !Number.isFinite(placement.y) ||
    !Number.isFinite(placement.scale) ||
    placement.scale <= 0
  )
    throw new Error("转场 placement 必须使用有限 x/y 与正数 scale。");
  transition.placements[variant] = { ...placement };
}

export function bindGameModeSymbols(
  project: EditorProject,
  modeId: string,
  binding: {
    readonly packageId: string;
    readonly reelSet: string;
    readonly renderMode: "standard" | "grid-cell";
  } | null,
): void {
  const mode = requireMode(project, modeId);
  if (binding && !project.symbolDependencies.has(binding.packageId))
    throw new Error(`未知 Symbols dependency：${binding.packageId}`);
  mode.symbols = binding ? { ...binding } : null;
  if (binding && project.reel.order === null) {
    project.reel.order =
      project.nodes.reduce(
        (maximum, node) => Math.max(maximum, node.order),
        -1,
      ) + 1;
  }
}

export function importSymbolDependency(
  project: EditorProject,
  imported: ImportedSymbolPackage,
): void {
  const id = imported.resource.packageManifest.id;
  if (project.symbolDependencies.has(id))
    throw new Error(`Symbols dependency ${id} 已存在，可使用替换。`);
  project.symbolDependencies.set(id, {
    packageId: id,
    files: cloneFiles(imported.files),
  });
}

export function replaceSymbolDependency(
  project: EditorProject,
  id: string,
  imported: ImportedSymbolPackage,
): void {
  if (!project.symbolDependencies.has(id))
    throw new Error(`未知 Symbols dependency：${id}`);
  if (imported.resource.packageManifest.id !== id)
    throw new Error(
      `替换 Symbols id 必须保持 ${id}，实际为 ${imported.resource.packageManifest.id}。`,
    );
  for (const mode of project.gameModes.modes)
    if (mode.symbols?.packageId === id)
      validateSymbolBinding(project, imported, mode.symbols.reelSet);
  project.symbolDependencies.set(id, {
    packageId: id,
    files: cloneFiles(imported.files),
  });
}

export function deleteSymbolDependency(
  project: EditorProject,
  id: string,
): void {
  if (!project.symbolDependencies.has(id))
    throw new Error(`未知 Symbols dependency：${id}`);
  const users = project.gameModes.modes
    .filter((mode) => mode.symbols?.packageId === id)
    .map((mode) => mode.id);
  if (users.length)
    throw new Error(`Symbols ${id} 仍被主状态引用：${users.join(", ")}`);
  project.symbolDependencies.delete(id);
}

export function validateSymbolBinding(
  project: EditorProject,
  imported: ImportedSymbolPackage,
  reelSet: string,
): void {
  const resource = imported.resource;
  const cell = resource.packageManifest.cellSize;
  if (
    cell.width !== project.reel.cellWidth ||
    cell.height !== project.reel.cellHeight
  )
    throw new Error(
      `Symbols ${resource.packageManifest.id} cellSize ${cell.width}x${cell.height} 与 main ${project.reel.cellWidth}x${project.reel.cellHeight} 不一致。`,
    );
  const reels = resource.gameConfig.getReels(reelSet);
  if (reels.getReelCount() !== project.reel.columns)
    throw new Error(
      `Symbols reelSet ${reelSet} 的 reel count ${reels.getReelCount()} 与 columns ${project.reel.columns} 不一致。`,
    );
  const displayCodes = new Set(
    resource.displaySymbols.map((symbol) =>
      resource.gameConfig.getSymbolCode(symbol),
    ),
  );
  for (let x = 0; x < reels.getReelCount(); x += 1)
    for (let y = 0; y < reels.getLength(x); y += 1)
      if (!displayCodes.has(reels.get(x, y)))
        throw new Error(
          `Symbols reelSet ${reelSet} 含非 display symbol code ${reels.get(x, y)}。`,
        );
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
  for (const mode of project.gameModes.modes) mode.nodeStates = {};
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
