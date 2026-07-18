import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";
import {
  createAssetPath,
  deriveNodeId,
  rewriteAtlasPageNamesToLowercase,
} from "../io/filename-policy.js";
import {
  activeVariantIds,
  resetVariantGeometry,
  type EditorNodeDraft,
  type EditorProject,
} from "./editor-project.js";
import {
  editorResourcePaths,
  editorResourcePrimaryPath,
  editorResourceSize,
  type EditorLayoutResource,
  type EditorResourceReference,
  type EditorSpineLayoutResource,
} from "./editor-resource.js";

interface PreparedResource {
  readonly resource: EditorLayoutResource;
  readonly assets: ReadonlyMap<string, Uint8Array>;
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
      const variants = activeVariantIds(project).filter(
        (variant) => project.variants[variant].backgroundNode === node.id,
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
  for (const path of editorResourcePaths(resource)) project.assets.delete(path);
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
    ...(defaultAnimation ? { defaultAnimation } : {}),
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
  if (defaultAnimation) node.defaultAnimation = defaultAnimation;
  else delete node.defaultAnimation;
}

export function assignBackgroundResource(options: {
  readonly project: EditorProject;
  readonly variant: SceneLayoutVariantId;
  readonly resourceId: string;
  readonly nodeId?: string;
  readonly defaultAnimation?: string;
  readonly reinitialize?: boolean;
}): EditorNodeDraft {
  assertVariantsAllowed(options.project, [options.variant]);
  const resource = requireResource(options.project, options.resourceId);
  const animation = validateAnimation(resource, options.defaultAnimation);
  const variant = options.project.variants[options.variant];
  let node = variant.backgroundNode
    ? options.project.nodes.find((item) => item.id === variant.backgroundNode)
    : undefined;
  const previousSize = variant.artSize;
  const nextSize = editorResourceSize(resource);
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
      ...(animation ? { defaultAnimation: animation } : {}),
      placements: { [options.variant]: { x: 0, y: 0, scale: 1 } },
    };
    options.project.nodes.push(node);
  } else {
    node.resourceId = resource.id;
    node.placements[options.variant] ??= { x: 0, y: 0, scale: 1 };
    if (animation) node.defaultAnimation = animation;
    else delete node.defaultAnimation;
  }
  variant.backgroundNode = node.id;
  if (!nextSize) {
    resetVariantGeometry(options.project, options.variant);
  } else if (!hasPreviousSize || sizeChanged || options.reinitialize) {
    resetVariantGeometry(options.project, options.variant, nextSize);
  }
  normalizeNodeOrders(options.project);
  return node;
}

export function clearBackground(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
): void {
  assertVariantsAllowed(project, [variantId]);
  const variant = project.variants[variantId];
  const nodeId = variant.backgroundNode;
  if (!nodeId) throw new Error(`${variantId} 背景尚未设置。`);
  variant.backgroundNode = "";
  resetVariantGeometry(project, variantId);
  const stillBackground = activeVariantIds(project).some(
    (id) => project.variants[id].backgroundNode === nodeId,
  );
  if (!stillBackground) {
    const index = project.nodes.findIndex((node) => node.id === nodeId);
    if (index >= 0) project.nodes.splice(index, 1);
  } else {
    const node = project.nodes.find((item) => item.id === nodeId);
    if (node) delete node.placements[variantId];
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
  node.defaultAnimation = value;
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
  return activeVariantIds(project).some(
    (variant) => project.variants[variant].backgroundNode === nodeId,
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
  if (resource.kind === "image") {
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
    activeVariantIds(project)
      .map((variant) => project.variants[variant].backgroundNode)
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
  const path = createAssetPath(options.file.name);
  const id = options.resourceId ?? deriveNodeId(options.file.name);
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
  return {
    resource: {
      id,
      kind: "image",
      path,
      size: { width: decoded.width, height: decoded.height },
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
  const skeletonPath = createAssetPath(skeletonFile.name);
  const atlasPath = createAssetPath(atlasFile.name);
  const id = options.resourceId ?? deriveNodeId(skeletonFile.name);
  const atlasResult = rewriteAtlasPageNamesToLowercase(await atlasFile.text());
  const texturesByName = new Map<string, File>();
  for (const file of textureFiles) {
    const key = file.name.toLowerCase();
    if (texturesByName.has(key))
      throw new Error(`Spine texture 文件名冲突：${key}`);
    texturesByName.set(key, file);
  }
  const textures: Record<string, string> = {};
  for (const page of atlasResult.pages) {
    const file = texturesByName.get(page);
    if (!file) throw new Error(`Spine atlas page 缺少 texture：${page}`);
    textures[page] = createAssetPath(file.name);
  }
  if (texturesByName.size !== atlasResult.pages.length) {
    throw new Error("Spine 上传包含 atlas 未引用的 texture。");
  }
  const skeletonBytes = new Uint8Array(await skeletonFile.arrayBuffer());
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
      new TextDecoder("utf-8", { fatal: true }).decode(skeletonBytes),
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
  const assets = new Map<string, Uint8Array>([
    [skeletonPath, skeletonBytes],
    [atlasPath, new TextEncoder().encode(atlasResult.atlasText)],
  ]);
  for (const [page, path] of Object.entries(textures)) {
    assets.set(
      path,
      new Uint8Array(await texturesByName.get(page)!.arrayBuffer()),
    );
  }
  return {
    resource: {
      id,
      kind: "spine",
      skeleton: skeletonPath,
      atlas: atlasPath,
      textures,
      animationNames,
      ...(hasBounds ? { bounds: { width, height } } : {}),
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
    if (local.has(lower))
      throw new Error(`资源内部 lowercase path 冲突：${path}`);
    local.add(lower);
    for (const existing of project.assets.keys()) {
      if (!ignoredPaths.has(existing) && existing.toLowerCase() === lower) {
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
    project.assets.set(path, bytes.slice());
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
          !node.defaultAnimation ||
          !replacement.animationNames.includes(node.defaultAnimation),
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
  const nextSize = editorResourceSize(prepared.resource);
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
  for (const path of oldPaths) project.assets.delete(path);
  project.resources.set(current.id, prepared.resource);
  for (const [path, bytes] of prepared.assets)
    project.assets.set(path, bytes.slice());
  for (const variantId of backgroundVariants) {
    const currentSize = project.variants[variantId].artSize;
    if (!nextSize) resetVariantGeometry(project, variantId);
    else if (
      reinitializeBackgrounds ||
      currentSize.width <= 0 ||
      currentSize.height <= 0
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

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function describeResource(resource: EditorLayoutResource): string {
  return resource.kind === "image"
    ? `${editorResourcePrimaryPath(resource)} · ${resource.size.width}×${resource.size.height}`
    : `${editorResourcePrimaryPath(resource)} · ${resource.animationNames.length} animations${resource.bounds ? ` · ${resource.bounds.width}×${resource.bounds.height}` : " · 无 bounds"}`;
}
