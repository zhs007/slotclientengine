import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout/data";
import type { ImportedPopupPackage } from "../io/imported-popup-package.js";
import type { ImportedPopupObjectPackage } from "../io/imported-popup-object-package.js";
import type { ImportedSymbolPackage } from "../io/imported-symbol-package.js";
import {
  activeVariantIds,
  activateEditorGameMode,
  createEditorGameModeDraft,
  validateEditorTransitionEvent,
  type EditorGameModeTransitionDraft,
  type EditorGameModeDraft,
  type EditorProject,
} from "./editor-project.js";
import { editorResourcePaths } from "./editor-resource.js";
import {
  nextAvailablePopupOrder,
  setPopupOrder as setEditorPopupOrder,
} from "./layer-order.js";

const MODE_ID = /^[A-Za-z][A-Za-z0-9_-]*$/u;

export function addGameMode(project: EditorProject, id: string): void {
  assertModeId(id);
  if (project.gameModes.modes.some((mode) => mode.id === id))
    throw new Error(`游戏模式已存在：${id}`);
  project.gameModes.modes.push(createEditorGameModeDraft(id));
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
  for (const node of project.nodes) {
    if (!node.scope || !(currentId in node.scope)) continue;
    const scope = Object.fromEntries(
      project.gameModes.modes.flatMap((candidate) => {
        const id = candidate.id === nextId ? currentId : candidate.id;
        const variants = node.scope?.[id];
        return variants ? [[candidate.id, variants] as const] : [];
      }),
    );
    node.scope = scope;
  }
  for (const transition of project.gameModes.transitions) {
    if (transition.fromModeId === currentId) transition.fromModeId = nextId;
    if (transition.toModeId === currentId) transition.toModeId = nextId;
  }
  for (const candidate of project.gameModes.modes)
    if (candidate.primaryActionTargetMode === currentId)
      candidate.primaryActionTargetMode = nextId;
  if (project.gameModes.initialMode === currentId)
    project.gameModes.initialMode = nextId;
  if (project.gameModes.activeModeId === currentId)
    project.gameModes.activeModeId = nextId;
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
  const actionReferences = project.gameModes.modes
    .filter((mode) => mode.primaryActionTargetMode === id)
    .map((mode) => mode.id);
  if (actionReferences.length)
    throw new Error(
      `游戏模式 ${id} 仍被 primary action 引用：${actionReferences.join(", ")}`,
    );
  const layerReferences = project.nodes
    .filter((node) => Boolean(node.scope?.[id]))
    .map((node) => node.id);
  if (layerReferences.length)
    throw new Error(
      `游戏模式 ${id} 仍被普通图层引用：${layerReferences.join(", ")}`,
    );
  const index = project.gameModes.modes.findIndex((mode) => mode.id === id);
  if (index < 0) throw new Error(`未知游戏模式：${id}`);
  project.gameModes.modes.splice(index, 1);
  normalizeGameModeNodeOrders(project);
}

export function setInitialGameMode(project: EditorProject, id: string): void {
  requireMode(project, id);
  project.gameModes.initialMode = id;
  normalizeGameModeNodeOrders(project);
}

export function setGameModeReelEnabled(
  project: EditorProject,
  id: string,
  enabled: boolean,
): void {
  const mode = requireMode(project, id);
  if (!enabled && mode.symbols)
    throw new Error(
      `主状态 ${id} 已绑定 Symbols，关闭主转轮前必须先解除绑定。`,
    );
  mode.mainEnabled = enabled;
}

export function normalizeGameModeNodeOrders(project: EditorProject): void {
  if (hasValidAuthoredOrders(project)) {
    project.nodes.sort((left, right) => left.order - right.order);
    return;
  }
  const nodes = project.nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => {
      return left.node.order - right.node.order || left.index - right.index;
    });
  const reelOrder = project.reel.order;
  if (reelOrder === null || !Number.isSafeInteger(reelOrder)) {
    project.nodes = nodes.map(({ node }, order) => ({ ...node, order }));
    return;
  }

  let reelInsertionIndex = nodes.filter(
    ({ node }) => node.order < reelOrder,
  ).length;
  const availableBelow = reelOrder - Number.MIN_SAFE_INTEGER;
  const availableAbove = Number.MAX_SAFE_INTEGER - reelOrder;
  reelInsertionIndex = Math.min(reelInsertionIndex, availableBelow);
  reelInsertionIndex = Math.max(
    reelInsertionIndex,
    nodes.length - availableAbove,
  );
  const belowStart =
    reelOrder >= reelInsertionIndex ? 0 : reelOrder - reelInsertionIndex;
  project.nodes = nodes.map(({ node }, index) => ({
    ...node,
    order:
      index < reelInsertionIndex
        ? belowStart + index
        : reelOrder + 1 + index - reelInsertionIndex,
  }));
}

function hasValidAuthoredOrders(project: EditorProject): boolean {
  const orders = project.nodes.map((node) => node.order);
  if (orders.some((order) => !Number.isSafeInteger(order))) return false;
  if (new Set(orders).size !== orders.length) return false;
  if (
    project.reel.order !== null &&
    (!Number.isSafeInteger(project.reel.order) ||
      orders.includes(project.reel.order))
  )
    return false;
  return true;
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
  const sourceMode = requireMode(project, fromModeId);
  project.gameModes.transitions.push({
    fromModeId,
    toModeId,
    kind: "spine",
    preludePopupId: null,
    resourceId: "",
    animation: "",
    switchEvent: "",
    placements: Object.fromEntries(
      activeVariantIds(sourceMode).map((variant) => [
        variant,
        { x: 0, y: 0, scale: 1 },
      ]),
    ),
  });
}

export function setGameModeTransitionKind(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  kind: "none" | "spine" | "video",
): EditorGameModeTransitionDraft {
  if (transition.kind === kind) return transition;
  const index = project.gameModes.transitions.indexOf(transition);
  if (index < 0) throw new Error("所选转场已不存在。");
  const common = {
    fromModeId: transition.fromModeId,
    toModeId: transition.toModeId,
    preludePopupId: transition.preludePopupId,
  };
  const replacement: EditorGameModeTransitionDraft =
    kind === "none"
      ? { ...common, kind: "none" }
      : kind === "spine"
        ? {
            ...common,
            kind: "spine",
            resourceId: "",
            animation: "",
            switchEvent: "",
            placements: Object.fromEntries(
              activeVariantIds(requireMode(project, transition.fromModeId)).map(
                (variant) => [variant, { x: 0, y: 0, scale: 1 }],
              ),
            ),
          }
        : {
            ...common,
            kind: "video",
            resourceId: "",
            fit: "contain",
            fadeOutSeconds: 0.5,
          };
  project.gameModes.transitions[index] = replacement;
  return replacement;
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
  if (transition.kind !== "spine")
    throw new Error("当前转场类型不是 Spine 顶层特效。");
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

export function setGameModeTransitionPreludePopup(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  popupId: string | null,
): void {
  if (popupId) {
    const dependency = project.popupDependencies.get(popupId);
    if (!dependency || dependency.type !== "spine")
      throw new Error(`转场前弹窗必须是已有普通 Spine Popup：${popupId}`);
  }
  transition.preludePopupId = popupId;
}

export function setGameModeTransitionAnimation(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  animation: string,
): void {
  if (transition.kind !== "spine")
    throw new Error("当前转场类型不是 Spine 顶层特效。");
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
  if (transition.kind !== "spine")
    throw new Error("当前转场类型不是 Spine 顶层特效。");
  const resource = project.resources.get(transition.resourceId);
  if (!resource || resource.kind !== "spine")
    throw new Error("请先选择转场 Spine resource。");
  validateEditorTransitionEvent(resource, {
    animation: transition.animation,
    switchEvent,
  });
  transition.switchEvent = switchEvent;
}

export function setGameModeVideoTransitionResource(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  resourceId: string,
): void {
  if (transition.kind !== "video")
    throw new Error("当前转场类型不是黑场视频。");
  const resource = project.resources.get(resourceId);
  if (!resource || resource.kind !== "video")
    throw new Error(`转场资源必须是已有 video resource：${resourceId}`);
  if (transition.fadeOutSeconds >= resource.durationSeconds)
    throw new Error("fadeOutSeconds 必须小于视频实际时长。");
  transition.resourceId = resourceId;
}

export function setGameModeVideoTransitionFadeOut(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  fadeOutSeconds: number,
): void {
  if (transition.kind !== "video")
    throw new Error("当前转场类型不是黑场视频。");
  if (!Number.isFinite(fadeOutSeconds) || fadeOutSeconds <= 0)
    throw new Error("fadeOutSeconds 必须是有限正数。");
  const resource = project.resources.get(transition.resourceId);
  if (resource?.kind === "video" && fadeOutSeconds >= resource.durationSeconds)
    throw new Error("fadeOutSeconds 必须小于视频实际时长。");
  transition.fadeOutSeconds = fadeOutSeconds;
}

export function setGameModeTransitionPlacement(
  project: EditorProject,
  transition: EditorGameModeTransitionDraft,
  variant: SceneLayoutVariantId,
  placement: { readonly x: number; readonly y: number; readonly scale: number },
): void {
  if (transition.kind !== "spine")
    throw new Error("video 转场没有中心坐标 placement。");
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
  if (binding && !mode.mainEnabled)
    throw new Error(`主状态 ${modeId} 未启用主转轮，不能绑定 Symbols。`);
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
  mergeDependencyAssets(project, imported.files);
  project.symbolDependencies.set(id, {
    packageId: id,
    rootKey: imported.rootKey,
    keys: Object.freeze([...imported.files.keys()].sort()),
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
  const previousKeys = project.symbolDependencies.get(id)!.keys;
  mergeDependencyAssets(
    project,
    imported.files,
    exclusiveDependencyKeys(project, "symbols", id, previousKeys),
  );
  project.symbolDependencies.set(id, {
    packageId: id,
    rootKey: imported.rootKey,
    keys: Object.freeze([...imported.files.keys()].sort()),
  });
  garbageCollectDependencyAssets(project, previousKeys);
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
  const dependency = project.symbolDependencies.get(id)!;
  project.symbolDependencies.delete(id);
  garbageCollectDependencyAssets(project, dependency.keys);
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
  if (popupId !== null) {
    const dependency = project.popupDependencies.get(popupId);
    if (!dependency) throw new Error(`未知 Popup dependency：${popupId}`);
    if (dependency.type !== "award-celebration")
      throw new Error(`游戏模式获奖庆祝只能绑定 award-celebration Popup。`);
  }
  mode.awardCelebrationPopupId = popupId;
}

export function importPopupDependency(
  project: EditorProject,
  imported: ImportedPopupPackage,
): void {
  const id = imported.manifest.id;
  if (project.popupDependencies.has(id))
    throw new Error(`Popup dependency ${id} 已存在，可使用替换。`);
  mergeDependencyAssets(project, imported.files);
  project.popupDependencies.set(id, {
    id,
    type: imported.manifest.type,
    rootKey: imported.rootKey,
    keys: Object.freeze([...imported.files.keys()].sort()),
    order: nextAvailablePopupOrder(project),
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
  if (imported.manifest.type !== current.type)
    throw new Error(
      `替换 Popup type 必须保持 ${current.type}，实际为 ${imported.manifest.type}。`,
    );
  const previousKeys = current.keys;
  mergeDependencyAssets(
    project,
    imported.files,
    exclusiveDependencyKeys(project, "popup", id, previousKeys),
  );
  project.popupDependencies.set(id, {
    ...current,
    type: imported.manifest.type,
    rootKey: imported.rootKey,
    keys: Object.freeze([...imported.files.keys()].sort()),
  });
  garbageCollectDependencyAssets(project, previousKeys);
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
  if (project.programmaticPopupIds.has(id))
    throw new Error(`Popup ${id} 仍配置为程序 Popup。`);
  const transitions = project.gameModes.transitions
    .filter((transition) => transition.preludePopupId === id)
    .map((transition) => `${transition.fromModeId} -> ${transition.toModeId}`);
  if (transitions.length)
    throw new Error(`Popup ${id} 仍被转场引用：${transitions.join(", ")}`);
  const dependency = project.popupDependencies.get(id)!;
  project.popupDependencies.delete(id);
  garbageCollectDependencyAssets(project, dependency.keys);
}

export function setPopupProgrammatic(
  project: EditorProject,
  id: string,
  programmatic: boolean,
): void {
  const dependency = project.popupDependencies.get(id);
  if (!dependency) throw new Error(`未知 Popup dependency：${id}`);
  if (programmatic) project.programmaticPopupIds.add(id);
  else project.programmaticPopupIds.delete(id);
}

export function importPopupObjectDependency(
  project: EditorProject,
  imported: ImportedPopupObjectPackage,
): void {
  const name = imported.manifest.name;
  if (project.popupObjectDependencies.has(name))
    throw new Error(`Popup Object dependency ${name} 已存在，可使用替换。`);
  mergeDependencyAssets(project, imported.files);
  project.popupObjectDependencies.set(name, {
    name,
    rootKey: imported.rootKey,
    keys: Object.freeze([...imported.files.keys()].sort()),
  });
}

export function replacePopupObjectDependency(
  project: EditorProject,
  name: string,
  imported: ImportedPopupObjectPackage,
): void {
  const current = project.popupObjectDependencies.get(name);
  if (!current) throw new Error(`未知 Popup Object dependency：${name}`);
  if (imported.manifest.name !== name)
    throw new Error(
      `替换 Popup Object name 必须保持 ${name}，实际为 ${imported.manifest.name}。`,
    );
  const previousKeys = current.keys;
  mergeDependencyAssets(
    project,
    imported.files,
    exclusiveDependencyKeys(project, "popup-object", name, previousKeys),
  );
  project.popupObjectDependencies.set(name, {
    name,
    rootKey: imported.rootKey,
    keys: Object.freeze([...imported.files.keys()].sort()),
  });
  garbageCollectDependencyAssets(project, previousKeys);
}

export function setTapInfoObjectDependency(
  project: EditorProject,
  name: string | null,
): void {
  if (name !== null && !project.popupObjectDependencies.has(name))
    throw new Error(`未知 Popup Object dependency：${name}`);
  project.tapInfoObjectName = name;
}

export function deletePopupObjectDependency(
  project: EditorProject,
  name: string,
): void {
  const dependency = project.popupObjectDependencies.get(name);
  if (!dependency) throw new Error(`未知 Popup Object dependency：${name}`);
  if (project.tapInfoObjectName === name)
    throw new Error(`Popup Object ${name} 仍被 Tap info 项目配置引用。`);
  project.popupObjectDependencies.delete(name);
  garbageCollectDependencyAssets(project, dependency.keys);
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

export function setPopupOrder(
  project: EditorProject,
  popupId: string,
  order: number,
): void {
  setEditorPopupOrder(project, popupId, order);
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

function mergeDependencyAssets(
  project: EditorProject,
  files: ReadonlyMap<string, Uint8Array>,
  replaceableKeys: ReadonlySet<string> = new Set(),
): void {
  const aliases = new Map(
    [...project.assets.keys()]
      .filter((key) => !replaceableKeys.has(key))
      .map((key) => [key.normalize("NFC").toLocaleLowerCase("en-US"), key]),
  );
  for (const [key, bytes] of files) {
    const existingKey = aliases.get(
      key.normalize("NFC").toLocaleLowerCase("en-US"),
    );
    if (existingKey && existingKey !== key)
      throw new Error(
        `全局扁平 filename key 大小写冲突：${existingKey} / ${key}`,
      );
    const previous = project.assets.get(key);
    if (previous && !replaceableKeys.has(key) && !bytesEqual(previous, bytes))
      throw new Error(`dependency filename key 与已有 bytes 冲突：${key}`);
    aliases.set(key.normalize("NFC").toLocaleLowerCase("en-US"), key);
  }
  for (const [key, bytes] of files) project.assets.set(key, bytes.slice());
}

function exclusiveDependencyKeys(
  project: EditorProject,
  kind: "symbols" | "popup" | "popup-object",
  id: string,
  candidates: readonly string[],
): ReadonlySet<string> {
  const ownedElsewhere = new Set([
    ...[...project.resources.values()].flatMap(editorResourcePaths),
    ...[...project.symbolDependencies]
      .filter(([candidateId]) => kind !== "symbols" || candidateId !== id)
      .flatMap(([, dependency]) => dependency.keys),
    ...[...project.popupDependencies]
      .filter(([candidateId]) => kind !== "popup" || candidateId !== id)
      .flatMap(([, dependency]) => dependency.keys),
    ...[...project.popupObjectDependencies]
      .filter(([candidateId]) => kind !== "popup-object" || candidateId !== id)
      .flatMap(([, dependency]) => dependency.keys),
  ]);
  return new Set(candidates.filter((key) => !ownedElsewhere.has(key)));
}

function bytesEqual(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

function garbageCollectDependencyAssets(
  project: EditorProject,
  candidates: Iterable<string>,
): void {
  const retained = new Set([
    ...[...project.resources.values()].flatMap((resource) =>
      editorResourcePaths(resource),
    ),
    ...[...project.symbolDependencies.values()].flatMap(
      (dependency) => dependency.keys,
    ),
    ...[...project.popupDependencies.values()].flatMap(
      (dependency) => dependency.keys,
    ),
    ...[...project.popupObjectDependencies.values()].flatMap(
      (dependency) => dependency.keys,
    ),
  ]);
  for (const key of candidates)
    if (!retained.has(key)) project.assets.delete(key);
}
