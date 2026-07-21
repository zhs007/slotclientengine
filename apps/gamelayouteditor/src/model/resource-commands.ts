import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
  validateImageStringPackageContents,
  validateImageStringText,
} from "@slotclientengine/rendercore/image-string";
import {
  allocateContentAddressedPath,
  createBoundedSourceIndex,
  detectRasterAssetType,
  extractBoundedZip,
  sha256Hex,
  suggestLogicalResourceId,
} from "@slotclientengine/browserartifactio";
import {
  activeVariantIds,
  resetVariantGeometry,
  type EditorNodeDraft,
  type EditorProject,
  type EditorSpinePlaybackDraft,
  validateEditorSpinePlayback,
} from "./editor-project.js";
import { synchronizeGameModeNodeStates } from "./game-mode-commands.js";
import {
  editorResourcePaths,
  editorResourcePrimaryPath,
  editorResourceArtSize,
  type EditorLayoutResource,
  type EditorImageStringLayoutResource,
  type EditorResourceReference,
  type EditorSpineLayoutResource,
} from "./editor-resource.js";

interface PreparedResource {
  readonly resource: EditorLayoutResource;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

export const IMAGE_STRING_ZIP_LIMITS = Object.freeze({
  maxEntries: 512,
  maxCompressedBytes: 50 * 1024 * 1024,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 100 * 1024 * 1024,
});

export const EDITOR_SOURCE_LIMITS = Object.freeze({
  maxEntries: 4096,
  maxFileBytes: 50 * 1024 * 1024,
  maxTotalBytes: 500 * 1024 * 1024,
});

export function importImageStringZip(options: {
  readonly project: EditorProject;
  readonly zipBytes: Uint8Array;
}): EditorImageStringLayoutResource {
  const files = extractBoundedZip(options.zipBytes, {
    limits: IMAGE_STRING_ZIP_LIMITS,
    pathPolicy: { requireLowercase: true },
  });
  const manifestBytes = files.get("image-string.manifest.json");
  if (!manifestBytes)
    throw new Error(
      "image-string ZIP 根目录必须包含 image-string.manifest.json。",
    );
  const manifest = parseImageStringManifest(
    JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(manifestBytes)),
  );
  validateImageStringPackageContents({ manifest, files });
  const prefix = `dependencies/image-strings/${manifest.id}`;
  const resource: EditorImageStringLayoutResource = Object.freeze({
    id: manifest.id,
    kind: "image-string",
    manifestPath: `${prefix}/image-string.manifest.json`,
    manifest,
    assetPaths: Object.freeze(
      collectImageStringAssetPaths(manifest).map((path) => `${prefix}/${path}`),
    ),
    provenance: {
      sourceNames: Object.freeze(["image-string.manifest.json"]),
      sourceKind: "zip" as const,
      batchLabel: `zip:${manifest.id}`,
    },
  });
  const prepared: PreparedResource = {
    resource,
    assets: new Map(
      [...files].map(([path, bytes]) => [`${prefix}/${path}`, bytes] as const),
    ),
  };
  assertNewResourceAvailable(options.project, resource);
  commitNewResource(options.project, prepared);
  return resource;
}

export function replaceImageStringResource(options: {
  readonly project: EditorProject;
  readonly resourceId: string;
  readonly zipBytes: Uint8Array;
}): EditorImageStringLayoutResource {
  const candidate = structuredCloneProjectWithoutResource(
    options.project,
    options.resourceId,
  );
  const imported = importImageStringZip({
    project: candidate,
    zipBytes: options.zipBytes,
  });
  const replacement: EditorImageStringLayoutResource = Object.freeze({
    ...imported,
    id: options.resourceId,
    manifestPath: `dependencies/image-strings/${options.resourceId}/image-string.manifest.json`,
    assetPaths: Object.freeze(
      imported.assetPaths.map((path) =>
        path.replace(
          `dependencies/image-strings/${imported.id}/`,
          `dependencies/image-strings/${options.resourceId}/`,
        ),
      ),
    ),
  });
  if (imported.manifest.id !== options.resourceId)
    throw new Error(
      "替换 image-string 的 nested manifest id 必须与 resource id 相同。",
    );
  const current = requireResource(options.project, options.resourceId);
  if (current.kind !== "image-string")
    throw new Error("资源类型必须保持为 image-string。");
  for (const node of options.project.nodes.filter(
    (node) => node.resourceId === current.id,
  )) {
    validateImageStringText(node.imageString?.text ?? "", imported.manifest);
  }
  const assets = new Map<string, Uint8Array>();
  const sourcePrefix = `dependencies/image-strings/${imported.id}/`;
  const targetPrefix = `dependencies/image-strings/${options.resourceId}/`;
  for (const [path, bytes] of candidate.assets) {
    if (path.startsWith(sourcePrefix))
      assets.set(path.replace(sourcePrefix, targetPrefix), bytes);
  }
  commitResourceReplacement(
    options.project,
    current,
    { resource: replacement, assets },
    false,
  );
  return replacement;
}

export async function uploadImageResource(options: {
  readonly project: EditorProject;
  readonly file: File;
  readonly resourceId?: string;
  readonly decodeImage?: (
    file: File,
  ) => Promise<{ readonly width: number; readonly height: number }>;
}): Promise<EditorLayoutResource> {
  const prepared = await prepareImageResource(options);
  assertNewResourceAvailable(options.project, prepared.resource);
  commitNewResource(options.project, prepared);
  return prepared.resource;
}

export async function uploadSpineResource(options: {
  readonly project: EditorProject;
  readonly files: readonly File[];
  readonly resourceId?: string;
}): Promise<EditorSpineLayoutResource> {
  const prepared = await prepareSpineResource(options);
  assertNewResourceAvailable(options.project, prepared.resource);
  commitNewResource(options.project, prepared);
  return prepared.resource;
}

export async function replaceImageResource(options: {
  readonly project: EditorProject;
  readonly resourceId: string;
  readonly file: File;
  readonly reinitializeBackgrounds?: boolean;
  readonly decodeImage?: (
    file: File,
  ) => Promise<{ readonly width: number; readonly height: number }>;
}): Promise<EditorLayoutResource> {
  const current = requireResource(options.project, options.resourceId);
  if (current.kind !== "image") throw new Error("资源类型必须保持为 image。");
  const prepared = await prepareImageResource({
    ...options,
    resourceId: options.resourceId,
  });
  commitResourceReplacement(
    options.project,
    current,
    prepared,
    options.reinitializeBackgrounds ?? false,
  );
  return prepared.resource;
}

export async function replaceSpineResource(options: {
  readonly project: EditorProject;
  readonly resourceId: string;
  readonly files: readonly File[];
  readonly reinitializeBackgrounds?: boolean;
}): Promise<EditorSpineLayoutResource> {
  const current = requireResource(options.project, options.resourceId);
  if (current.kind !== "spine") throw new Error("资源类型必须保持为 Spine。");
  const prepared = await prepareSpineResource({
    ...options,
    resourceId: options.resourceId,
  });
  commitResourceReplacement(
    options.project,
    current,
    prepared,
    options.reinitializeBackgrounds ?? false,
  );
  return prepared.resource;
}

export function getLayoutResourceReferences(
  project: EditorProject,
  resourceId: string,
): readonly EditorResourceReference[] {
  return project.nodes
    .filter((node) => node.resourceId === resourceId)
    .map((node) => {
      const variants = activeVariantIds(project).filter((variant) =>
        project.gameModes.modes.some(
          (mode) => mode.backgroundNodes[variant] === node.id,
        ),
      );
      return Object.freeze({
        nodeId: node.id,
        role:
          variants.length > 0 ? ("background" as const) : ("layer" as const),
        variants: Object.freeze(variants),
      });
    });
}

export function deleteLayoutResource(
  project: EditorProject,
  resourceId: string,
): void {
  const resource = requireResource(project, resourceId);
  const references = getLayoutResourceReferences(project, resourceId);
  if (references.length > 0) {
    throw new Error(
      `资源 ${resourceId} 仍被 ${references
        .map((reference) =>
          reference.role === "background"
            ? `${reference.nodeId} (${reference.variants.join(", ")} 背景)`
            : `${reference.nodeId} (图层)`,
        )
        .join("、")} 引用，不能删除。`,
    );
  }
  project.resources.delete(resourceId);
  garbageCollectAssetPaths(project, editorResourcePaths(resource));
}

export function addLayerFromResource(options: {
  readonly project: EditorProject;
  readonly resourceId: string;
  readonly nodeId: string;
  readonly variants: readonly SceneLayoutVariantId[];
  readonly defaultAnimation?: string;
}): EditorNodeDraft {
  const resource = requireResource(options.project, options.resourceId);
  assertNodeIdAvailable(options.project, options.nodeId);
  assertVariantsAllowed(options.project, options.variants);
  const defaultAnimation = validateAnimation(
    resource,
    options.defaultAnimation,
  );
  const node: EditorNodeDraft = {
    id: options.nodeId,
    order: nextOrder(options.project),
    resourceId: resource.id,
    ...(resource.kind === "spine"
      ? { playback: { kind: "loop" as const, animation: defaultAnimation! } }
      : resource.kind === "image-string"
        ? { imageString: { text: "", anchor: { x: 0.5, y: 0.5 } } }
        : {}),
    placements: Object.fromEntries(
      options.variants.map((variant) => [variant, { x: 0, y: 0, scale: 1 }]),
    ),
  };
  options.project.nodes.push(node);
  return node;
}

export function rebindLayerResource(options: {
  readonly project: EditorProject;
  readonly nodeId: string;
  readonly resourceId: string;
  readonly defaultAnimation?: string;
}): void {
  const node = requireLayer(options.project, options.nodeId);
  const resource = requireResource(options.project, options.resourceId);
  const defaultAnimation = validateAnimation(
    resource,
    options.defaultAnimation,
  );
  node.resourceId = resource.id;
  delete node.playback;
  delete node.imageString;
  if (resource.kind === "spine")
    node.playback = { kind: "loop", animation: defaultAnimation! };
  else if (resource.kind === "image-string")
    node.imageString = { text: "", anchor: { x: 0.5, y: 0.5 } };
}

export function assignBackgroundResource(options: {
  readonly project: EditorProject;
  readonly modeId?: string;
  readonly variant: SceneLayoutVariantId;
  readonly resourceId: string;
  readonly nodeId?: string;
  readonly defaultAnimation?: string;
  readonly reinitialize?: boolean;
}): EditorNodeDraft {
  assertVariantsAllowed(options.project, [options.variant]);
  const resource = requireResource(options.project, options.resourceId);
  if (resource.kind === "image-string")
    throw new Error("image-string 资源不能设为背景。");
  const animation = validateAnimation(resource, options.defaultAnimation);
  const variant = options.project.variants[options.variant];
  const modeId = options.modeId ?? options.project.gameModes.initialMode;
  const mode = options.project.gameModes.modes.find(
    (candidate) => candidate.id === modeId,
  );
  if (!mode) throw new Error(`未知主状态：${modeId}`);
  const currentBackgroundNode = mode.backgroundNodes[options.variant] ?? "";
  let node = currentBackgroundNode
    ? options.project.nodes.find((item) => item.id === currentBackgroundNode)
    : undefined;
  const reusableNode = options.project.gameModes.modes
    .filter((candidate) => candidate.id !== modeId)
    .map((candidate) => candidate.backgroundNodes[options.variant])
    .filter((nodeId): nodeId is string => Boolean(nodeId))
    .map((nodeId) =>
      options.project.nodes.find((candidate) => candidate.id === nodeId),
    )
    .find((candidate) => candidate?.resourceId === resource.id);
  const replacedNode =
    reusableNode && reusableNode.id !== node?.id ? node : undefined;
  if (reusableNode) node = reusableNode;
  const sharedByAnotherMode =
    node &&
    options.project.gameModes.modes.some(
      (candidate) =>
        candidate.id !== modeId &&
        Object.values(candidate.backgroundNodes).includes(node!.id),
    );
  if (node && sharedByAnotherMode && node.resourceId !== resource.id)
    node = undefined;
  const previousSize = variant.artSize;
  const nextSize = editorResourceArtSize(resource);
  const hasPreviousSize = previousSize.width > 0 && previousSize.height > 0;
  const sizeChanged =
    Boolean(nextSize) &&
    hasPreviousSize &&
    (previousSize.width !== nextSize!.width ||
      previousSize.height !== nextSize!.height);
  if (sizeChanged && !options.reinitialize) {
    throw new Error(
      `${options.variant} 背景尺寸将从 ${previousSize.width}×${previousSize.height} 变为 ${nextSize!.width}×${nextSize!.height}；必须明确选择使用新尺寸并重新初始化。`,
    );
  }
  if (!node) {
    const nodeId =
      options.nodeId ?? suggestNodeId(options.project, resource.id);
    assertNodeIdAvailable(options.project, nodeId);
    node = {
      id: nodeId,
      order: nextOrder(options.project),
      resourceId: resource.id,
      ...(resource.kind === "spine"
        ? { playback: { kind: "loop" as const, animation: animation! } }
        : {}),
      placements: {
        [options.variant]: defaultBackgroundPlacement(resource, previousSize),
      },
    };
    options.project.nodes.push(node);
  } else {
    const previousResource = requireResource(options.project, node.resourceId);
    const resourceChanged = previousResource.id !== resource.id;
    node.resourceId = resource.id;
    node.placements[options.variant] ??= defaultBackgroundPlacement(
      resource,
      previousSize,
    );
    if (previousResource.kind !== resource.kind) {
      node.placements[options.variant] = defaultBackgroundPlacement(
        resource,
        previousSize,
      );
    }
    delete node.imageString;
    if (resource.kind === "spine" && resourceChanged)
      node.playback = { kind: "loop", animation: animation! };
    else if (resource.kind !== "spine") delete node.playback;
  }
  mode.backgroundNodes[options.variant] = node.id;
  if (resource.kind === "spine")
    bindSharedSpineBackgroundState(options.project, modeId, node, animation!);
  if (options.project.gameModes.initialMode === modeId)
    variant.backgroundNode = node.id;
  if (nextSize && (!hasPreviousSize || sizeChanged || options.reinitialize)) {
    resetVariantGeometry(options.project, options.variant, nextSize);
  }
  if (
    replacedNode &&
    !options.project.gameModes.modes.some((candidate) =>
      Object.values(candidate.backgroundNodes).includes(replacedNode.id),
    )
  ) {
    options.project.nodes = options.project.nodes.filter(
      (candidate) => candidate.id !== replacedNode.id,
    );
  }
  synchronizeGameModeNodeStates(options.project);
  normalizeNodeOrders(options.project);
  return node;
}

function bindSharedSpineBackgroundState(
  project: EditorProject,
  modeId: string,
  node: EditorNodeDraft,
  animation: string,
): void {
  const users = project.gameModes.modes.filter((mode) =>
    Object.values(mode.backgroundNodes).includes(node.id),
  );
  if (users.length < 2) {
    if (node.playback?.kind === "loop") node.playback.animation = animation;
    return;
  }

  if (!node.playback || node.playback.kind === "loop") {
    const previousAnimation =
      node.playback?.kind === "loop" ? node.playback.animation : animation;
    const previousUsers = users.filter((mode) => mode.id !== modeId);
    const previousStateId = uniqueSpineStateId(
      [],
      previousUsers[0]?.id ?? project.gameModes.initialMode,
    );
    const states = [{ id: previousStateId, animation: previousAnimation }];
    const targetStateId =
      animation === previousAnimation
        ? previousStateId
        : uniqueSpineStateId(states, modeId);
    if (targetStateId !== previousStateId)
      states.push({ id: targetStateId, animation });
    const initialState =
      project.gameModes.initialMode === modeId
        ? targetStateId
        : previousStateId;
    node.playback = {
      kind: "state-machine",
      initialState,
      states,
      transitions: [],
    };
    for (const user of previousUsers)
      user.nodeStates[node.id] = previousStateId;
    users.find((user) => user.id === modeId)!.nodeStates[node.id] =
      targetStateId;
    return;
  }

  const transitionUsingAnimation = node.playback.transitions.find(
    (transition) => transition.animation === animation,
  );
  if (transitionUsingAnimation)
    throw new Error(
      `animation ${animation} 已用于 transition ${transitionUsingAnimation.from} → ${transitionUsingAnimation.to}，不能同时作为稳定状态。`,
    );
  let state = node.playback.states.find(
    (candidate) => candidate.animation === animation,
  );
  if (!state) {
    state = {
      id: uniqueSpineStateId(node.playback.states, modeId),
      animation,
    };
    node.playback.states.push(state);
  }
  if (project.gameModes.initialMode === modeId)
    node.playback.initialState = state.id;
  users.find((user) => user.id === modeId)!.nodeStates[node.id] = state.id;
}

function uniqueSpineStateId(
  states: readonly { readonly id: string }[],
  preferred: string,
): string {
  if (!states.some((state) => state.id === preferred)) return preferred;
  let suffix = 2;
  while (states.some((state) => state.id === `${preferred}${suffix}`))
    suffix += 1;
  return `${preferred}${suffix}`;
}

function defaultBackgroundPlacement(
  resource: EditorLayoutResource,
  artSize: { readonly width: number; readonly height: number },
): { x: number; y: number; scale: number } {
  if (resource.kind === "spine" && artSize.width > 0 && artSize.height > 0) {
    return { x: artSize.width / 2, y: artSize.height / 2, scale: 1 };
  }
  return { x: 0, y: 0, scale: 1 };
}

export function clearBackground(
  project: EditorProject,
  modeIdOrVariant: string,
  explicitVariantId?: SceneLayoutVariantId,
): void {
  const modeId = explicitVariantId
    ? modeIdOrVariant
    : project.gameModes.initialMode;
  const variantId =
    explicitVariantId ?? (modeIdOrVariant as SceneLayoutVariantId);
  assertVariantsAllowed(project, [variantId]);
  const variant = project.variants[variantId];
  const mode = project.gameModes.modes.find(
    (candidate) => candidate.id === modeId,
  );
  if (!mode) throw new Error(`未知主状态：${modeId}`);
  const nodeId = mode.backgroundNodes[variantId] ?? "";
  if (!nodeId) throw new Error(`${variantId} 背景尚未设置。`);
  mode.backgroundNodes[variantId] = "";
  if (project.gameModes.initialMode === modeId) {
    variant.backgroundNode = "";
    resetVariantGeometry(project, variantId);
  }
  const stillBackground = project.gameModes.modes.some((candidate) =>
    Object.values(candidate.backgroundNodes).includes(nodeId),
  );
  if (!stillBackground) {
    const index = project.nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) project.nodes.splice(index, 1);
  } else {
    const node = project.nodes.find((item) => item.id === nodeId);
    const stillUsedInVariant = project.gameModes.modes.some(
      (candidate) => candidate.backgroundNodes[variantId] === nodeId,
    );
    if (node && !stillUsedInVariant) delete node.placements[variantId];
  }
  normalizeNodeOrders(project);
}

export function removeLayer(project: EditorProject, nodeId: string): void {
  requireLayer(project, nodeId);
  const index = project.nodes.findIndex((node) => node.id === nodeId);
  project.nodes.splice(index, 1);
  normalizeNodeOrders(project);
}

export function moveLayer(
  project: EditorProject,
  nodeId: string,
  direction: -1 | 1,
): void {
  requireLayer(project, nodeId);
  const layers = project.nodes
    .filter((node) => !isBackgroundNode(project, node.id))
    .sort((left, right) => left.order - right.order);
  const index = layers.findIndex((node) => node.id === nodeId);
  const target = index + direction;
  if (target < 0 || target >= layers.length) return;
  [layers[index].order, layers[target].order] = [
    layers[target].order,
    layers[index].order,
  ];
  project.nodes.sort((left, right) => left.order - right.order);
}

export function renameNode(
  project: EditorProject,
  nodeId: string,
  nextNodeId: string,
): void {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`未知节点：${nodeId}`);
  if (nodeId === nextNodeId) return;
  assertNodeIdAvailable(project, nextNodeId);
  for (const mode of project.gameModes.modes) {
    if (Object.hasOwn(mode.nodeStates, nodeId)) {
      mode.nodeStates[nextNodeId] = mode.nodeStates[nodeId];
      delete mode.nodeStates[nodeId];
    }
    for (const variant of activeVariantIds(project))
      if (mode.backgroundNodes[variant] === nodeId)
        mode.backgroundNodes[variant] = nextNodeId;
  }
  node.id = nextNodeId;
  for (const variant of activeVariantIds(project)) {
    if (project.variants[variant].backgroundNode === nodeId) {
      project.variants[variant].backgroundNode = nextNodeId;
    }
  }
}

export function setNodeDefaultAnimation(
  project: EditorProject,
  nodeId: string,
  animation: string,
): void {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`未知节点：${nodeId}`);
  const resource = requireResource(project, node.resourceId);
  const value = validateAnimation(resource, animation);
  if (!value) throw new Error("图片节点没有 animation。");
  node.playback = { kind: "loop", animation: value };
  synchronizeGameModeNodeStates(project);
}

export function setNodeSpinePlayback(
  project: EditorProject,
  nodeId: string,
  playback: EditorSpinePlaybackDraft,
): void {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`未知节点：${nodeId}`);
  const resource = requireResource(project, node.resourceId);
  if (resource.kind !== "spine") throw new Error(`节点 ${nodeId} 不是 Spine。`);
  validateEditorSpinePlayback(playback, resource.animationNames, nodeId);
  node.playback = structuredClone(playback);
  synchronizeGameModeNodeStates(project);
}

export function setSpinePlaybackKind(
  project: EditorProject,
  nodeId: string,
  kind: EditorSpinePlaybackDraft["kind"],
): void {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`未知节点：${nodeId}`);
  const resource = requireResource(project, node.resourceId);
  if (resource.kind !== "spine") throw new Error(`节点 ${nodeId} 不是 Spine。`);
  if (node.playback?.kind === kind) return;
  const animation = resource.animationNames[0];
  if (!animation) throw new Error("Spine resource 没有 animation。");
  node.playback =
    kind === "loop"
      ? { kind: "loop", animation }
      : {
          kind: "state-machine",
          initialState: "State1",
          states: [{ id: "State1", animation }],
          transitions: [],
        };
  synchronizeGameModeNodeStates(project);
}

export function addSpineState(
  project: EditorProject,
  nodeId: string,
  state: { readonly id: string; readonly animation: string },
): void {
  const playback = requireStateMachine(project, nodeId);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(state.id))
    throw new Error("state id 格式无效。");
  if (playback.states.some((item) => item.id === state.id))
    throw new Error(`state id 冲突：${state.id}`);
  const resource = requireSpineNodeResource(project, nodeId);
  if (!resource.animationNames.includes(state.animation))
    throw new Error(`animation ${state.animation} 不存在。`);
  commitStateMachineMutation(project, nodeId, (candidate) => {
    candidate.states.push({ ...state });
  });
}

export function setSpineStateAnimation(
  project: EditorProject,
  nodeId: string,
  stateId: string,
  animation: string,
): void {
  const playback = requireStateMachine(project, nodeId);
  const state = playback.states.find((item) => item.id === stateId);
  if (!state) throw new Error(`未知 state：${stateId}`);
  const resource = requireSpineNodeResource(project, nodeId);
  if (!resource.animationNames.includes(animation))
    throw new Error(`animation ${animation} 不存在。`);
  commitStateMachineMutation(project, nodeId, (candidate) => {
    candidate.states.find((item) => item.id === stateId)!.animation = animation;
  });
}

export function setSpineInitialState(
  project: EditorProject,
  nodeId: string,
  stateId: string,
): void {
  const playback = requireStateMachine(project, nodeId);
  if (!playback.states.some((state) => state.id === stateId))
    throw new Error(`未知 state：${stateId}`);
  commitStateMachineMutation(project, nodeId, (candidate) => {
    candidate.initialState = stateId;
  });
}

export function addSpineTransition(
  project: EditorProject,
  nodeId: string,
  transition: {
    readonly from: string;
    readonly to: string;
    readonly animation: string;
  },
): void {
  const playback = requireStateMachine(project, nodeId);
  if (transition.from === transition.to)
    throw new Error("transition 不得自循环。");
  if (
    !playback.states.some((state) => state.id === transition.from) ||
    !playback.states.some((state) => state.id === transition.to)
  )
    throw new Error("transition 必须引用已声明 state。");
  if (
    playback.transitions.some(
      (item) => item.from === transition.from && item.to === transition.to,
    )
  )
    throw new Error("transition 有向边重复。");
  const resource = requireSpineNodeResource(project, nodeId);
  if (!resource.animationNames.includes(transition.animation))
    throw new Error(`animation ${transition.animation} 不存在。`);
  commitStateMachineMutation(project, nodeId, (candidate) => {
    candidate.transitions.push({ ...transition });
  });
}

export function deleteSpineTransition(
  project: EditorProject,
  nodeId: string,
  index: number,
): void {
  const playback = requireStateMachine(project, nodeId);
  if (
    !Number.isSafeInteger(index) ||
    index < 0 ||
    index >= playback.transitions.length
  )
    throw new Error("transition index 越界。");
  commitStateMachineMutation(project, nodeId, (candidate) => {
    candidate.transitions.splice(index, 1);
  });
}

export function renameSpineState(
  project: EditorProject,
  nodeId: string,
  currentId: string,
  nextId: string,
): void {
  const playback = requireStateMachine(project, nodeId);
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(nextId))
    throw new Error("state id 格式无效。");
  if (playback.states.some((state) => state.id === nextId))
    throw new Error(`state id 冲突：${nextId}`);
  const state = playback.states.find((item) => item.id === currentId);
  if (!state) throw new Error(`未知 state：${currentId}`);
  const referencedModes = project.gameModes.modes
    .filter((mode) => mode.nodeStates[nodeId] === currentId)
    .map((mode) => mode.id);
  commitStateMachineMutation(project, nodeId, (candidate) => {
    candidate.states.find((item) => item.id === currentId)!.id = nextId;
    if (candidate.initialState === currentId) candidate.initialState = nextId;
    for (const transition of candidate.transitions) {
      if (transition.from === currentId) transition.from = nextId;
      if (transition.to === currentId) transition.to = nextId;
    }
  });
  for (const mode of project.gameModes.modes)
    if (referencedModes.includes(mode.id)) mode.nodeStates[nodeId] = nextId;
}

export function deleteSpineState(
  project: EditorProject,
  nodeId: string,
  stateId: string,
): void {
  const playback = requireStateMachine(project, nodeId);
  if (
    playback.initialState === stateId ||
    playback.transitions.some(
      (transition) => transition.from === stateId || transition.to === stateId,
    )
  )
    throw new Error(`state ${stateId} 仍被 initial/transition 引用。`);
  const index = playback.states.findIndex((state) => state.id === stateId);
  if (index < 0) throw new Error(`未知 state：${stateId}`);
  commitStateMachineMutation(project, nodeId, (candidate) => {
    candidate.states.splice(index, 1);
  });
}

export function setImageStringLayerText(
  project: EditorProject,
  nodeId: string,
  text: string,
): void {
  const { node, resource } = requireImageStringNode(project, nodeId);
  validateImageStringText(text, resource.manifest);
  node.imageString!.text = text;
}

export function setImageStringLayerAnchor(
  project: EditorProject,
  nodeId: string,
  anchor: { readonly x: number; readonly y: number },
): void {
  if (
    !Number.isFinite(anchor.x) ||
    anchor.x < 0 ||
    anchor.x > 1 ||
    !Number.isFinite(anchor.y) ||
    anchor.y < 0 ||
    anchor.y > 1
  )
    throw new Error("image-string anchor 必须位于 0..1。");
  requireImageStringNode(project, nodeId).node.imageString!.anchor = {
    ...anchor,
  };
}

export function setLayerVariantVisibility(
  project: EditorProject,
  nodeId: string,
  variant: SceneLayoutVariantId,
  visible: boolean,
): void {
  const node = requireLayer(project, nodeId);
  assertVariantsAllowed(project, [variant]);
  if (visible) node.placements[variant] = { x: 0, y: 0, scale: 1 };
  else delete node.placements[variant];
}

export function suggestNodeId(
  project: EditorProject,
  resourceId: string,
): string {
  if (!project.nodes.some((node) => node.id === resourceId)) return resourceId;
  let suffix = 2;
  while (project.nodes.some((node) => node.id === `${resourceId}-${suffix}`)) {
    suffix += 1;
  }
  return `${resourceId}-${suffix}`;
}

function requireResource(
  project: EditorProject,
  resourceId: string,
): EditorLayoutResource {
  const resource = project.resources.get(resourceId);
  if (!resource) throw new Error(`未知资源：${resourceId}`);
  return resource;
}

function requireLayer(project: EditorProject, nodeId: string): EditorNodeDraft {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`未知节点：${nodeId}`);
  if (isBackgroundNode(project, nodeId)) {
    throw new Error(`节点 ${nodeId} 是背景引用，不能作为普通图层操作。`);
  }
  return node;
}

function isBackgroundNode(project: EditorProject, nodeId: string): boolean {
  return project.gameModes.modes.some((mode) =>
    Object.values(mode.backgroundNodes).includes(nodeId),
  );
}

function assertVariantsAllowed(
  project: EditorProject,
  variants: readonly SceneLayoutVariantId[],
): void {
  if (variants.length === 0) throw new Error("至少选择一个可见 variant。");
  const allowed = new Set(activeVariantIds(project));
  const duplicate = new Set<SceneLayoutVariantId>();
  for (const variant of variants) {
    if (!allowed.has(variant))
      throw new Error(`当前模式不允许 variant：${variant}`);
    if (duplicate.has(variant)) throw new Error(`variant 重复：${variant}`);
    duplicate.add(variant);
  }
}

function assertNodeIdAvailable(project: EditorProject, nodeId: string): void {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(nodeId)) {
    throw new Error(`node id 必须是小写字母数字与连字符：${nodeId}`);
  }
  if (project.nodes.some((node) => node.id === nodeId)) {
    throw new Error(`节点 id 冲突：${nodeId}`);
  }
}

function validateAnimation(
  resource: EditorLayoutResource,
  animation: string | undefined,
): string | undefined {
  if (resource.kind !== "spine") {
    if (animation) throw new Error("图片资源不得选择 Spine animation。");
    return undefined;
  }
  if (!animation) throw new Error("Spine 节点必须明确选择 default animation。");
  if (!resource.animationNames.includes(animation)) {
    throw new Error(
      `Spine animation ${animation} 不存在于资源 ${resource.id}；名称区分大小写。`,
    );
  }
  return animation;
}

function nextOrder(project: EditorProject): number {
  return (
    project.nodes.reduce((maximum, node) => Math.max(maximum, node.order), -1) +
    1
  );
}

function normalizeNodeOrders(project: EditorProject): void {
  const backgrounds = new Set(
    project.gameModes.modes
      .flatMap((mode) => Object.values(mode.backgroundNodes))
      .filter(Boolean),
  );
  project.nodes = project.nodes
    .map((node, index) => ({ node, index }))
    .sort((left, right) => {
      const leftBackground = backgrounds.has(left.node.id);
      const rightBackground = backgrounds.has(right.node.id);
      if (leftBackground !== rightBackground) return leftBackground ? -1 : 1;
      return left.node.order - right.node.order || left.index - right.index;
    })
    .map(({ node }, order) => ({ ...node, order }));
}

async function prepareImageResource(options: {
  readonly file: File;
  readonly resourceId?: string;
  readonly decodeImage?: (
    file: File,
  ) => Promise<{ readonly width: number; readonly height: number }>;
}): Promise<PreparedResource> {
  createBoundedSourceIndex([options.file], EDITOR_SOURCE_LIMITS);
  const id = options.resourceId ?? requiredResourceId(options.file.name);
  const decoded = await (options.decodeImage ?? decodeImageFile)(options.file);
  if (
    !Number.isFinite(decoded.width) ||
    decoded.width <= 0 ||
    !Number.isFinite(decoded.height) ||
    decoded.height <= 0
  ) {
    throw new Error(`图片尺寸必须是有限正数：${options.file.name}`);
  }
  const bytes = new Uint8Array(await options.file.arrayBuffer());
  const type = detectRasterAssetType(bytes);
  const path = allocateContentAddressedPath({
    digest: await sha256Hex(bytes),
    extension: type.extension,
  });
  return {
    resource: {
      id,
      kind: "image",
      path,
      size: { width: decoded.width, height: decoded.height },
      provenance: {
        sourceNames: Object.freeze([options.file.name]),
        sourceKind: options.file.webkitRelativePath ? "directory" : "files",
        batchLabel: `image:${options.file.name}`,
      },
    },
    assets: new Map([[path, bytes]]),
  };
}

async function prepareSpineResource(options: {
  readonly files: readonly File[];
  readonly resourceId?: string;
}): Promise<
  PreparedResource & { readonly resource: EditorSpineLayoutResource }
> {
  createBoundedSourceIndex(options.files, EDITOR_SOURCE_LIMITS);
  const jsonFiles = options.files.filter((file) =>
    file.name.toLowerCase().endsWith(".json"),
  );
  const atlasFiles = options.files.filter((file) =>
    file.name.toLowerCase().endsWith(".atlas"),
  );
  const textureFiles = options.files.filter((file) =>
    /\.(png|jpe?g|webp)$/iu.test(file.name),
  );
  if (
    jsonFiles.length !== 1 ||
    atlasFiles.length !== 1 ||
    textureFiles.length === 0 ||
    jsonFiles.length + atlasFiles.length + textureFiles.length !==
      options.files.length
  ) {
    throw new Error(
      "Spine 上传必须恰好包含一个 JSON、一个 atlas 和 atlas 精确引用的全部 texture。",
    );
  }
  const skeletonFile = jsonFiles[0];
  const atlasFile = atlasFiles[0];
  const id = options.resourceId ?? requiredResourceId(skeletonFile.name);
  const atlasText = await atlasFile.text();
  const atlasPages = inspectAtlasPages(atlasText);
  const texturesByName = new Map<string, File>();
  for (const file of textureFiles) {
    const key = file.name.normalize("NFC").toLocaleLowerCase("en-US");
    if (texturesByName.has(key))
      throw new Error(`Spine texture 文件名冲突：${key}`);
    texturesByName.set(key, file);
  }
  const textures: Record<string, string> = {};
  const assets = new Map<string, Uint8Array>();
  const pageMapping = new Map<string, string>();
  for (const page of atlasPages) {
    const file = texturesByName.get(
      page.normalize("NFC").toLocaleLowerCase("en-US"),
    );
    if (!file) throw new Error(`Spine atlas page 缺少 texture：${page}`);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = detectRasterAssetType(bytes);
    const path = allocateContentAddressedPath({
      digest: await sha256Hex(bytes),
      extension: type.extension,
    });
    textures[page] = path;
    pageMapping.set(page, page);
    putAsset(assets, path, bytes);
  }
  if (texturesByName.size !== atlasPages.length) {
    throw new Error("Spine 上传包含 atlas 未引用的 texture。");
  }
  const sourceSkeletonBytes = new Uint8Array(await skeletonFile.arrayBuffer());
  let skeleton: {
    readonly skeleton?: {
      readonly spine?: unknown;
      readonly width?: unknown;
      readonly height?: unknown;
    };
    readonly animations?: Readonly<Record<string, unknown>>;
  };
  try {
    skeleton = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(sourceSkeletonBytes),
    ) as typeof skeleton;
  } catch (error) {
    throw new Error(`Spine skeleton JSON/UTF-8 无效：${formatError(error)}`);
  }
  const version = skeleton.skeleton?.spine;
  if (typeof version !== "string" || !/^4\.3(?:\.|$)/u.test(version)) {
    throw new Error(
      `Spine skeleton 版本必须是 4.3.x，实际为 ${String(version)}。`,
    );
  }
  const animationNames = Object.keys(skeleton.animations ?? {});
  if (animationNames.length === 0)
    throw new Error("Spine skeleton 没有 animation。");
  const width = skeleton.skeleton?.width;
  const height = skeleton.skeleton?.height;
  const hasAnyBounds = width !== undefined || height !== undefined;
  const hasBounds =
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0;
  if (hasAnyBounds && !hasBounds) {
    throw new Error("Spine skeleton bounds 必须同时是有限正数，或同时省略。");
  }
  const skeletonBytes = encodeStableJson(skeleton);
  const skeletonPath = allocateContentAddressedPath({
    digest: await sha256Hex(skeletonBytes),
    extension: "json",
  });
  putAsset(assets, skeletonPath, skeletonBytes);
  const atlasBytes = new TextEncoder().encode(
    rewriteAtlasPages(atlasText, pageMapping),
  );
  const atlasPath = allocateContentAddressedPath({
    digest: await sha256Hex(atlasBytes),
    extension: "atlas",
  });
  putAsset(assets, atlasPath, atlasBytes);
  return {
    resource: {
      id,
      kind: "spine",
      skeleton: skeletonPath,
      atlas: atlasPath,
      textures,
      animationNames,
      ...(hasBounds ? { bounds: { width, height } } : {}),
      provenance: {
        sourceNames: Object.freeze(options.files.map((file) => file.name)),
        sourceKind: options.files.some((file) => file.webkitRelativePath)
          ? "directory"
          : "files",
        batchLabel: `spine:${skeletonFile.name}`,
      },
    },
    assets,
  };
}

function assertNewResourceAvailable(
  project: EditorProject,
  resource: EditorLayoutResource,
): void {
  if (!/^[a-z0-9][a-z0-9-]*$/u.test(resource.id)) {
    throw new Error(`resource id 必须是小写字母数字与连字符：${resource.id}`);
  }
  if (project.resources.has(resource.id)) {
    throw new Error(`资源 id 冲突：${resource.id}`);
  }
  assertPathsAvailable(project, editorResourcePaths(resource));
}

function assertPathsAvailable(
  project: EditorProject,
  paths: readonly string[],
  ignoredPaths: ReadonlySet<string> = new Set(),
): void {
  const local = new Set<string>();
  for (const path of paths) {
    const lower = path.toLowerCase();
    if (local.has(lower) && !local.has(path))
      throw new Error(`资源内部 lowercase path alias 冲突：${path}`);
    local.add(lower);
    for (const existing of project.assets.keys()) {
      if (
        !ignoredPaths.has(existing) &&
        existing !== path &&
        existing.toLowerCase() === lower
      ) {
        throw new Error(`资源路径冲突：${path}`);
      }
    }
  }
}

function commitNewResource(
  project: EditorProject,
  prepared: PreparedResource,
): void {
  project.resources.set(prepared.resource.id, prepared.resource);
  for (const [path, bytes] of prepared.assets)
    putAsset(project.assets, path, bytes);
}

function commitResourceReplacement(
  project: EditorProject,
  current: EditorLayoutResource,
  prepared: PreparedResource,
  reinitializeBackgrounds: boolean,
): void {
  if (current.kind !== prepared.resource.kind) {
    throw new Error(
      "替换资源必须保持 logical resource kind；类型切换请重绑节点。",
    );
  }
  const oldPaths = new Set(editorResourcePaths(current));
  assertPathsAvailable(
    project,
    editorResourcePaths(prepared.resource),
    oldPaths,
  );
  const references = getLayoutResourceReferences(project, current.id);
  const replacement = prepared.resource;
  if (replacement.kind === "spine") {
    const invalid = references
      .map(
        (reference) =>
          project.nodes.find((node) => node.id === reference.nodeId)!,
      )
      .filter(
        (node) =>
          !node.playback ||
          (() => {
            try {
              validateEditorSpinePlayback(
                node.playback,
                replacement.animationNames,
                node.id,
              );
              return false;
            } catch {
              return true;
            }
          })(),
      )
      .map((node) => node.id);
    if (invalid.length > 0) {
      throw new Error(
        `替换资源缺少引用节点使用的 animation：${invalid.join(", ")}。`,
      );
    }
  }
  const backgroundVariants = references.flatMap(
    (reference) => reference.variants,
  );
  const nextSize = editorResourceArtSize(prepared.resource);
  for (const variantId of backgroundVariants) {
    const currentSize = project.variants[variantId].artSize;
    const changed =
      nextSize &&
      currentSize.width > 0 &&
      currentSize.height > 0 &&
      (nextSize.width !== currentSize.width ||
        nextSize.height !== currentSize.height);
    if (changed && !reinitializeBackgrounds) {
      throw new Error(
        `${variantId} 背景替换尺寸不一致；必须明确选择使用新尺寸并重新初始化。`,
      );
    }
  }
  project.resources.set(current.id, prepared.resource);
  garbageCollectAssetPaths(project, oldPaths);
  for (const [path, bytes] of prepared.assets)
    putAsset(project.assets, path, bytes);
  for (const variantId of backgroundVariants) {
    const currentSize = project.variants[variantId].artSize;
    if (
      nextSize &&
      (reinitializeBackgrounds ||
        currentSize.width <= 0 ||
        currentSize.height <= 0)
    ) {
      resetVariantGeometry(project, variantId, nextSize);
    }
  }
}

function decodeImageFile(
  file: File,
): Promise<{ width: number; height: number }> {
  const url = URL.createObjectURL(file);
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: image.naturalWidth, height: image.naturalHeight });
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`图片无法解码：${file.name}`));
    };
    image.src = url;
  });
}

function requiredResourceId(sourceName: string): string {
  const id = suggestLogicalResourceId(sourceName);
  if (!id) {
    throw new Error(
      `无法从 ${sourceName} 建议 lowercase ASCII kebab-case resource id，请在导入审查中显式填写。`,
    );
  }
  return id;
}

function inspectAtlasPages(atlasText: string): readonly string[] {
  const lines = atlasText.replace(/\r\n?/gu, "\n").split("\n");
  const pages: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]!;
    if (!line || /^\s/u.test(line) || line.includes(":")) continue;
    const next = lines
      .slice(index + 1)
      .find((candidate) => candidate.length > 0);
    if (next?.startsWith("size:")) pages.push(line);
  }
  if (pages.length === 0) throw new Error("Spine atlas 没有可识别的 page。");
  const folded = pages.map((page) =>
    page.normalize("NFC").toLocaleLowerCase("en-US"),
  );
  if (new Set(folded).size !== folded.length)
    throw new Error("Spine atlas page 存在 case-fold/NFC collision。");
  return Object.freeze(pages);
}

function rewriteAtlasPages(
  atlasText: string,
  mapping: ReadonlyMap<string, string>,
): string {
  const lines = atlasText.replace(/\r\n?/gu, "\n").split("\n");
  const rewritten = lines.map((line) => mapping.get(line) ?? line);
  if ([...mapping.keys()].some((page) => !lines.includes(page)))
    throw new Error("Spine atlas page rewrite closure 不完整。");
  return `${rewritten.join("\n").replace(/\n+$/u, "")}\n`;
}

function encodeStableJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(
    `${JSON.stringify(sortValue(value), null, 2)}\n`,
  );
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([key, child]) => [key, sortValue(child)]),
  );
}

function putAsset(
  assets: Map<string, Uint8Array>,
  path: string,
  bytes: Uint8Array,
): void {
  const current = assets.get(path);
  if (current && !equalBytes(current, bytes))
    throw new Error(`content-addressed path collision：${path}`);
  if (!current) assets.set(path, bytes.slice());
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
  return (
    left.byteLength === right.byteLength &&
    left.every((value, index) => value === right[index])
  );
}

function garbageCollectAssetPaths(
  project: EditorProject,
  candidates: Iterable<string>,
): void {
  const retained = new Set(
    [...project.resources.values()].flatMap((resource) =>
      editorResourcePaths(resource),
    ),
  );
  for (const path of candidates)
    if (!retained.has(path)) project.assets.delete(path);
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function describeResource(resource: EditorLayoutResource): string {
  if (resource.kind === "image")
    return `${editorResourcePrimaryPath(resource)} · ${resource.size.width}×${resource.size.height}`;
  if (resource.kind === "image-string")
    return `${editorResourcePrimaryPath(resource)} · ${Object.keys(resource.manifest.glyphs).length} glyphs · lineHeight ${resource.manifest.metrics.lineHeight}`;
  return `${editorResourcePrimaryPath(resource)} · ${resource.animationNames.length} animations${resource.bounds ? ` · export bounds ${resource.bounds.width}×${resource.bounds.height}（非 art size）` : " · 无 export bounds"}`;
}

function requireStateMachine(
  project: EditorProject,
  nodeId: string,
): Extract<EditorSpinePlaybackDraft, { kind: "state-machine" }> {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node?.playback || node.playback.kind !== "state-machine")
    throw new Error(`节点 ${nodeId} 未使用 Spine state machine。`);
  return node.playback;
}

function commitStateMachineMutation(
  project: EditorProject,
  nodeId: string,
  mutate: (
    playback: Extract<EditorSpinePlaybackDraft, { kind: "state-machine" }>,
  ) => void,
): void {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node?.playback || node.playback.kind !== "state-machine")
    throw new Error(`节点 ${nodeId} 未使用 Spine state machine。`);
  const resource = requireSpineNodeResource(project, nodeId);
  const candidate = structuredClone(node.playback);
  mutate(candidate);
  validateEditorSpinePlayback(candidate, resource.animationNames, nodeId);
  node.playback = candidate;
  synchronizeGameModeNodeStates(project);
}

function requireImageStringNode(project: EditorProject, nodeId: string) {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node?.imageString) throw new Error(`节点 ${nodeId} 不是 image-string。`);
  const resource = requireResource(project, node.resourceId);
  if (resource.kind !== "image-string")
    throw new Error(`节点 ${nodeId} 的资源不是 image-string。`);
  return { node, resource };
}

function requireSpineNodeResource(project: EditorProject, nodeId: string) {
  const node = project.nodes.find((item) => item.id === nodeId);
  if (!node) throw new Error(`未知节点：${nodeId}`);
  const resource = requireResource(project, node.resourceId);
  if (resource.kind !== "spine") throw new Error(`节点 ${nodeId} 不是 Spine。`);
  return resource;
}

function structuredCloneProjectWithoutResource(
  project: EditorProject,
  resourceId: string,
): EditorProject {
  const clone = {
    ...structuredClone({
      ...project,
      resources: undefined,
      assets: undefined,
      symbolDependencies: undefined,
    }),
    resources: new Map(project.resources),
    assets: new Map(project.assets),
    symbolDependencies: project.symbolDependencies,
  } as EditorProject;
  const current = clone.resources.get(resourceId);
  if (!current) throw new Error(`未知资源：${resourceId}`);
  clone.resources.delete(resourceId);
  for (const path of editorResourcePaths(current)) clone.assets.delete(path);
  return clone;
}
