import type { SceneLayoutVariantId } from "@slotclientengine/rendercore/scene-layout";
import {
  createAssetPath,
  deriveNodeId,
  rewriteAtlasPageNamesToLowercase,
} from "../io/filename-policy.js";
import {
  initializeVariantFromBackground,
  type EditorNodeDraft,
  type EditorProject,
} from "./editor-project.js";

export async function addImageFileToProject(options: {
  readonly project: EditorProject;
  readonly file: File;
  readonly variants: readonly SceneLayoutVariantId[];
  readonly backgroundVariant?: SceneLayoutVariantId;
  readonly decodeImage?: (
    file: File,
  ) => Promise<{ readonly width: number; readonly height: number }>;
}): Promise<EditorNodeDraft> {
  const path = createAssetPath(options.file.name);
  const id = deriveNodeId(options.file.name);
  assertNoCollision(options.project, id, [path]);
  assertBackgroundAvailable(options.project, options.backgroundVariant);
  const decoded = await (options.decodeImage ?? decodeImageFile)(options.file);
  const bytes = new Uint8Array(await options.file.arrayBuffer());
  const node: EditorNodeDraft = {
    id,
    order: nextOrder(options.project),
    resource: {
      kind: "image",
      path,
      size: { width: decoded.width, height: decoded.height },
    },
    placements: Object.fromEntries(
      options.variants.map((variant) => [variant, { x: 0, y: 0, scale: 1 }]),
    ),
  };
  options.project.assets.set(path, bytes);
  options.project.nodes.push(node);
  if (options.backgroundVariant) {
    const variant = options.project.variants[options.backgroundVariant];
    variant.backgroundNode = id;
    variant.artSize = { width: decoded.width, height: decoded.height };
    initializeVariantFromBackground(
      options.project,
      options.backgroundVariant,
      variant.artSize,
    );
  }
  return node;
}

export async function addSpineFilesToProject(options: {
  readonly project: EditorProject;
  readonly files: readonly File[];
  readonly variants: readonly SceneLayoutVariantId[];
  readonly backgroundVariant?: SceneLayoutVariantId;
}): Promise<EditorNodeDraft> {
  const jsonFiles = options.files.filter((file) =>
    file.name.toLowerCase().endsWith(".json"),
  );
  const atlasFiles = options.files.filter((file) =>
    file.name.toLowerCase().endsWith(".atlas"),
  );
  const textureFiles = options.files.filter((file) =>
    /\.(png|jpe?g|webp)$/i.test(file.name),
  );
  if (
    jsonFiles.length !== 1 ||
    atlasFiles.length !== 1 ||
    textureFiles.length === 0
  ) {
    throw new Error(
      "Spine 上传必须恰好包含一个 JSON、一个 atlas 和至少一张 texture。",
    );
  }
  const skeletonFile = jsonFiles[0];
  const atlasFile = atlasFiles[0];
  const skeletonPath = createAssetPath(skeletonFile.name);
  const atlasPath = createAssetPath(atlasFile.name);
  const id = deriveNodeId(skeletonFile.name);
  const atlasResult = rewriteAtlasPageNamesToLowercase(await atlasFile.text());
  const texturesByName = new Map(
    textureFiles.map((file) => [file.name.toLowerCase(), file]),
  );
  const textures: Record<string, string> = {};
  for (const page of atlasResult.pages) {
    const file = texturesByName.get(page);
    if (!file) throw new Error(`Spine atlas page 缺少 texture：${page}`);
    textures[page] = createAssetPath(file.name);
  }
  if (texturesByName.size !== atlasResult.pages.length) {
    throw new Error("Spine 上传包含 atlas 未引用的 texture。");
  }
  const paths = [skeletonPath, atlasPath, ...Object.values(textures)];
  assertNoCollision(options.project, id, paths);
  assertBackgroundAvailable(options.project, options.backgroundVariant);
  const skeletonBytes = new Uint8Array(await skeletonFile.arrayBuffer());
  const skeleton = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(skeletonBytes),
  ) as {
    readonly skeleton?: { readonly width?: number; readonly height?: number };
    readonly animations?: Readonly<Record<string, unknown>>;
  };
  const animationNames = Object.keys(skeleton.animations ?? {});
  if (animationNames.length === 0)
    throw new Error("Spine skeleton 没有 animation。");
  const node: EditorNodeDraft = {
    id,
    order: nextOrder(options.project),
    resource: {
      kind: "spine",
      skeleton: skeletonPath,
      atlas: atlasPath,
      textures,
      defaultAnimation: "",
      loop: true,
    },
    animationNames,
    placements: Object.fromEntries(
      options.variants.map((variant) => [variant, { x: 0, y: 0, scale: 1 }]),
    ),
  };
  options.project.assets.set(skeletonPath, skeletonBytes);
  options.project.assets.set(
    atlasPath,
    new TextEncoder().encode(atlasResult.atlasText),
  );
  for (const [page, path] of Object.entries(textures)) {
    options.project.assets.set(
      path,
      new Uint8Array(await texturesByName.get(page)!.arrayBuffer()),
    );
  }
  options.project.nodes.push(node);
  if (options.backgroundVariant) {
    const variant = options.project.variants[options.backgroundVariant];
    variant.backgroundNode = id;
    const width = skeleton.skeleton?.width;
    const height = skeleton.skeleton?.height;
    if (
      typeof width === "number" &&
      Number.isFinite(width) &&
      width > 0 &&
      typeof height === "number" &&
      Number.isFinite(height) &&
      height > 0
    ) {
      variant.artSize = { width, height };
      initializeVariantFromBackground(
        options.project,
        options.backgroundVariant,
        variant.artSize,
      );
    }
  }
  return node;
}

function assertBackgroundAvailable(
  project: EditorProject,
  backgroundVariant: SceneLayoutVariantId | undefined,
): void {
  if (!backgroundVariant) return;
  if (project.variants[backgroundVariant].backgroundNode) {
    throw new Error(`${backgroundVariant} 背景已经设置。`);
  }
}

export function removeNodeFromProject(
  project: EditorProject,
  nodeId: string,
): void {
  const references = Object.entries(project.variants)
    .filter(([, variant]) => variant.backgroundNode === nodeId)
    .map(([variantId]) => `${variantId}.backgroundNode`);
  if (references.length > 0) {
    throw new Error(
      `节点 ${nodeId} 仍被 ${references.join(", ")} 引用，不能删除。`,
    );
  }
  const index = project.nodes.findIndex((node) => node.id === nodeId);
  if (index < 0) throw new Error(`未知节点：${nodeId}`);
  const [node] = project.nodes.splice(index, 1);
  for (const path of resourcePaths(node)) project.assets.delete(path);
}

function assertNoCollision(
  project: EditorProject,
  id: string,
  paths: readonly string[],
): void {
  if (project.nodes.some((node) => node.id === id)) {
    throw new Error(`节点 id 冲突：${id}`);
  }
  for (const path of paths) {
    if (project.assets.has(path)) throw new Error(`资源路径冲突：${path}`);
  }
}

function nextOrder(project: EditorProject): number {
  return (
    project.nodes.reduce((maximum, node) => Math.max(maximum, node.order), -1) +
    1
  );
}

function resourcePaths(node: EditorNodeDraft): readonly string[] {
  const resource = node.resource;
  return resource.kind === "image"
    ? [resource.path]
    : [resource.skeleton, resource.atlas, ...Object.values(resource.textures)];
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
