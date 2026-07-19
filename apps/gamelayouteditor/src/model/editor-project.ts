import {
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
  type SceneLayoutNode,
  type SceneLayoutVariantId,
} from "@slotclientengine/rendercore/scene-layout";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string";
import {
  collectSymbolPackageEntryPaths,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol";
import { deriveNodeId } from "../io/filename-policy.js";
import {
  editorResourcePaths,
  editorResourceSignature,
  type EditorImageLayoutResource,
  type EditorImageStringLayoutResource,
  type EditorLayoutResource,
  type EditorSpineLayoutResource,
} from "./editor-resource.js";

type EditorLayoutResourceDraft =
  | Omit<EditorImageLayoutResource, "id">
  | Omit<EditorSpineLayoutResource, "id">
  | Omit<EditorImageStringLayoutResource, "id">;

export type EditorMode = "maximized-focus" | "orientation-focus";

export const DEFAULT_REEL_COLUMNS = 5;
export const DEFAULT_REEL_ROWS = 3;
export const DEFAULT_REEL_CELL_SIZE = 160;
export const DEFAULT_FOCUS_PADDING = 60;

export interface EditorFocusOffsets {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface EditorVariantDraft {
  artSize: { width: number; height: number };
  focusOffsets: EditorFocusOffsets;
  focusRect: { x: number; y: number; width: number; height: number };
  frameFocusRect: { width: number; height: number };
  minFocusMargin: { left: number; right: number; top: number; bottom: number };
  backgroundNode: string;
}

export type EditorSpinePlaybackDraft =
  | { readonly kind: "loop"; animation: string }
  | {
      readonly kind: "state-machine";
      initialState: string;
      states: Array<{ id: string; animation: string }>;
      transitions: Array<{ from: string; to: string; animation: string }>;
    };

export interface EditorNodeDraft {
  id: string;
  order: number;
  resourceId: string;
  playback?: EditorSpinePlaybackDraft;
  imageString?: {
    text: string;
    anchor: { x: number; y: number };
  };
  placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number; scale: number }>
  >;
}

export interface EditorSymbolPackageDependency {
  readonly packageId: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  reelSet: string;
  renderMode: "standard" | "grid-cell";
  includeInExport: boolean;
}

export interface EditorProject {
  id: string;
  mode: EditorMode;
  variants: {
    default: EditorVariantDraft;
    landscape: EditorVariantDraft;
    portrait: EditorVariantDraft;
  };
  nodes: EditorNodeDraft[];
  reel: {
    order: number | null;
    columns: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
    gapX: number;
    gapY: number;
    placements: Partial<Record<SceneLayoutVariantId, { x: number; y: number }>>;
  };
  resources: Map<string, EditorLayoutResource>;
  assets: Map<string, Uint8Array>;
  symbolDependency: EditorSymbolPackageDependency | null;
}

export function activeVariantIds(
  project: Pick<EditorProject, "mode">,
): readonly SceneLayoutVariantId[] {
  return project.mode === "maximized-focus"
    ? ["default"]
    : ["landscape", "portrait"];
}

export function createNewEditorProject(mode: EditorMode): EditorProject {
  return {
    id: "new-layout",
    mode,
    variants: {
      default: createEmptyVariant(),
      landscape: createEmptyVariant(),
      portrait: createEmptyVariant(),
    },
    nodes: [],
    reel: {
      order: null,
      columns: DEFAULT_REEL_COLUMNS,
      rows: DEFAULT_REEL_ROWS,
      cellWidth: DEFAULT_REEL_CELL_SIZE,
      cellHeight: DEFAULT_REEL_CELL_SIZE,
      gapX: 0,
      gapY: 0,
      placements:
        mode === "maximized-focus"
          ? { default: { x: 0, y: 0 } }
          : { landscape: { x: 0, y: 0 }, portrait: { x: 0, y: 0 } },
    },
    resources: new Map(),
    assets: new Map(),
    symbolDependency: null,
  };
}

export function initializeVariantFromBackground(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
  artSize: { readonly width: number; readonly height: number },
): void {
  if (!(artSize.width > 0) || !(artSize.height > 0)) return;
  const reel = project.reel;
  const availableWidth = Math.max(1, artSize.width - DEFAULT_FOCUS_PADDING * 2);
  const availableHeight = Math.max(
    1,
    artSize.height - DEFAULT_FOCUS_PADDING * 2,
  );
  const gapsWidth = Math.max(0, reel.columns - 1) * Math.max(0, reel.gapX);
  const gapsHeight = Math.max(0, reel.rows - 1) * Math.max(0, reel.gapY);
  reel.cellWidth = Math.max(
    1,
    Math.min(
      reel.cellWidth,
      Math.floor((availableWidth - gapsWidth) / reel.columns),
    ),
  );
  reel.cellHeight = Math.max(
    1,
    Math.min(
      reel.cellHeight,
      Math.floor((availableHeight - gapsHeight) / reel.rows),
    ),
  );
  const reelSize = calculateReelSize(project);
  reel.placements[variantId] = {
    x: Math.round((artSize.width - reelSize.width) / 2),
    y: Math.round((artSize.height - reelSize.height) / 2),
  };
  updateVariantFocusFromReel(project, variantId);
}

export function resetVariantGeometry(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
  artSize?: { readonly width: number; readonly height: number },
): void {
  const variant = project.variants[variantId];
  variant.artSize = artSize ? { ...artSize } : { width: 0, height: 0 };
  variant.focusRect = { x: 0, y: 0, width: 0, height: 0 };
  variant.frameFocusRect = { width: 0, height: 0 };
  variant.focusOffsets = {
    left: -DEFAULT_FOCUS_PADDING,
    top: -DEFAULT_FOCUS_PADDING,
    right: DEFAULT_FOCUS_PADDING,
    bottom: DEFAULT_FOCUS_PADDING,
  };
  if (artSize) initializeVariantFromBackground(project, variantId, artSize);
}

export function updateVariantFocusFromReel(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
): void {
  const variant = project.variants[variantId];
  const placement = project.reel.placements[variantId];
  const offsets = variant.focusOffsets;
  if (
    !placement ||
    !(variant.artSize.width > 0) ||
    !(variant.artSize.height > 0) ||
    !(project.reel.columns > 0) ||
    !(project.reel.rows > 0) ||
    !(project.reel.cellWidth > 0) ||
    !(project.reel.cellHeight > 0) ||
    !Object.values(offsets).every(Number.isFinite)
  ) {
    return;
  }
  const reelSize = calculateReelSize(project);
  const left = Math.max(0, placement.x + offsets.left);
  const top = Math.max(0, placement.y + offsets.top);
  const right = Math.min(
    variant.artSize.width,
    placement.x + reelSize.width + offsets.right,
  );
  const bottom = Math.min(
    variant.artSize.height,
    placement.y + reelSize.height + offsets.bottom,
  );
  variant.focusRect = {
    x: left,
    y: top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
  variant.frameFocusRect = {
    width: variant.focusRect.width,
    height: variant.focusRect.height,
  };
}

export function updateVariantFocusOffsetsFromRect(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
): void {
  const variant = project.variants[variantId];
  const placement = project.reel.placements[variantId];
  if (!placement) return;
  const reelSize = calculateReelSize(project);
  variant.focusOffsets = {
    left: variant.focusRect.x - placement.x,
    top: variant.focusRect.y - placement.y,
    right:
      variant.focusRect.x +
      variant.focusRect.width -
      (placement.x + reelSize.width),
    bottom:
      variant.focusRect.y +
      variant.focusRect.height -
      (placement.y + reelSize.height),
  };
}

export function applySymbolPackageCellSize(
  project: EditorProject,
  cellSize: { readonly width: number; readonly height: number },
): void {
  if (
    !Number.isFinite(cellSize.width) ||
    cellSize.width <= 0 ||
    !Number.isFinite(cellSize.height) ||
    cellSize.height <= 0
  ) {
    throw new Error("symbols package cellSize 必须是有限正数。");
  }
  project.reel.cellWidth = cellSize.width;
  project.reel.cellHeight = cellSize.height;
  for (const variantId of activeVariantIds(project)) {
    updateVariantFocusFromReel(project, variantId);
    const variant = project.variants[variantId];
    const placement = project.reel.placements[variantId];
    if (!placement || variant.artSize.width <= 0 || variant.artSize.height <= 0)
      continue;
    const size = calculateReelSize(project);
    if (
      placement.x < 0 ||
      placement.y < 0 ||
      placement.x + size.width > variant.artSize.width ||
      placement.y + size.height > variant.artSize.height
    ) {
      throw new Error(
        `symbols package cellSize 使 ${variantId} main grid 越出 art；禁止 auto-fit。`,
      );
    }
    const focus = variant.focusRect;
    if (
      focus.x > placement.x ||
      focus.y > placement.y ||
      focus.x + focus.width < placement.x + size.width ||
      focus.y + focus.height < placement.y + size.height
    ) {
      throw new Error(
        `symbols package cellSize 使 ${variantId} main grid 越出 focus；禁止 auto-fit。`,
      );
    }
  }
}

export function resolveEditorNodeResource(
  project: Pick<EditorProject, "resources" | "assets">,
  node: EditorNodeDraft,
): SceneLayoutNode["resource"] {
  const resource = project.resources.get(node.resourceId);
  if (!resource) {
    throw new Error(`节点 ${node.id} 引用未知资源：${node.resourceId}`);
  }
  for (const path of editorResourcePaths(resource)) {
    if (!project.assets.has(path)) {
      throw new Error(`资源 ${resource.id} 缺少 bytes：${path}`);
    }
  }
  if (resource.kind === "image") {
    if (node.playback !== undefined || node.imageString !== undefined)
      throw new Error(`图片节点 ${node.id} 不得声明 playback/imageString。`);
    return {
      kind: "image",
      path: resource.path,
      size: resource.size,
    };
  }
  if (resource.kind === "image-string") {
    if (node.playback !== undefined)
      throw new Error(`image-string 节点 ${node.id} 不得声明 Spine playback。`);
    if (!node.imageString)
      throw new Error(`image-string 节点 ${node.id} 缺少 text/anchor。`);
    return {
      kind: "image-string",
      manifest: resource.manifestPath,
      text: node.imageString.text,
      anchor: { ...node.imageString.anchor },
    };
  }
  if (node.imageString !== undefined)
    throw new Error(`Spine 节点 ${node.id} 不得声明 imageString。`);
  const playback = node.playback;
  if (!playback)
    throw new Error(`Spine 节点 ${node.id} 必须明确选择 playback。`);
  validateEditorSpinePlayback(playback, resource.animationNames, node.id);
  const playbackSpec =
    playback.kind === "loop"
      ? { defaultAnimation: playback.animation, loop: true as const }
      : {
          stateMachine: {
            initialState: playback.initialState,
            states: Object.fromEntries(
              playback.states.map((state) => [
                state.id,
                { animation: state.animation },
              ]),
            ),
            transitions: playback.transitions.map((transition) => ({
              ...transition,
            })),
          },
        };
  return {
    kind: "spine",
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: resource.textures,
    ...playbackSpec,
  };
}

export function editorProjectToPreviewManifest(
  project: EditorProject,
  preferredVariant: SceneLayoutVariantId,
  includeSymbolPackage = false,
): SceneLayoutManifestV1 | null {
  try {
    const manifest = editorProjectToManifest(project);
    if (!manifest.symbolPackage || includeSymbolPackage) return manifest;
    return parseSceneLayoutManifest({
      version: manifest.version,
      kind: manifest.kind,
      id: manifest.id,
      adaptation: manifest.adaptation,
      nodes: manifest.nodes,
      reels: manifest.reels,
    });
  } catch {
    const available = previewVariantOrder(project.mode, preferredVariant).find(
      (variantId) => project.variants[variantId].backgroundNode,
    );
    if (!available) return null;
    const variant = project.variants[available];
    const placement = project.reel.placements[available];
    if (!placement) return null;
    const nodes = project.nodes.flatMap((node) => {
      const nodePlacement = node.placements[available];
      if (!nodePlacement) return [];
      try {
        return [
          {
            id: node.id,
            order: node.order,
            resource: resolveEditorNodeResource(project, node),
            placements: { default: nodePlacement },
          },
        ];
      } catch {
        return [];
      }
    });
    if (!nodes.some((node) => node.id === variant.backgroundNode)) return null;
    try {
      return parseSceneLayoutManifest({
        version: 1,
        kind: "scene-layout",
        id: project.id,
        adaptation: {
          mode: "maximized-focus",
          artSize: variant.artSize,
          focusRect: variant.focusRect,
          backgroundNode: variant.backgroundNode,
        },
        nodes,
        reels: {
          main: {
            ...(project.reel.order === null
              ? {}
              : { order: project.reel.order }),
            columns: project.reel.columns,
            rows: project.reel.rows,
            cellSize: {
              width: project.reel.cellWidth,
              height: project.reel.cellHeight,
            },
            gap: { x: project.reel.gapX, y: project.reel.gapY },
            placements: { default: placement },
          },
        },
      });
    } catch {
      return null;
    }
  }
}

export function editorProjectToManifest(
  project: EditorProject,
): SceneLayoutManifestV1 {
  const adaptation =
    project.mode === "maximized-focus"
      ? {
          mode: "maximized-focus" as const,
          artSize: project.variants.default.artSize,
          focusRect: project.variants.default.focusRect,
          backgroundNode: project.variants.default.backgroundNode,
        }
      : {
          mode: "orientation-focus" as const,
          variants: {
            landscape: toOrientationVariant(project.variants.landscape),
            portrait: toOrientationVariant(project.variants.portrait),
          },
        };
  return parseSceneLayoutManifest({
    version: 1,
    kind: "scene-layout",
    id: project.id,
    adaptation,
    nodes: project.nodes.map((node) => ({
      id: node.id,
      order: node.order,
      resource: resolveEditorNodeResource(project, node),
      placements: node.placements,
    })),
    reels: {
      main: {
        ...(project.reel.order === null ? {} : { order: project.reel.order }),
        columns: project.reel.columns,
        rows: project.reel.rows,
        cellSize: {
          width: project.reel.cellWidth,
          height: project.reel.cellHeight,
        },
        gap: { x: project.reel.gapX, y: project.reel.gapY },
        placements: project.reel.placements,
      },
    },
    ...(project.symbolDependency?.includeInExport
      ? {
          symbolPackage: {
            manifest: `dependencies/symbols/${project.symbolDependency.packageId}/symbols.package.json`,
            reel: "main",
            reelSet: project.symbolDependency.reelSet,
            renderMode: project.symbolDependency.renderMode,
          },
        }
      : {}),
  });
}

export function manifestToEditorProject(
  manifest: SceneLayoutManifestV1,
  assets: ReadonlyMap<string, Uint8Array>,
): EditorProject {
  const parsed = parseSceneLayoutManifest(manifest);
  const project = createNewEditorProject(parsed.adaptation.mode);
  project.id = parsed.id;
  const resourceIdsBySignature = new Map<string, string>();
  const pathsByResource = new Map<string, string>();
  project.nodes = parsed.nodes.map((node) => {
    const resourceDraft = manifestResourceToEditorResource(
      node.resource,
      assets,
    );
    const resourceWithTemporaryId = {
      ...resourceDraft,
      id: "imported-resource",
    } as EditorLayoutResource;
    const signature = editorResourceSignature(resourceWithTemporaryId);
    let resourceId = resourceIdsBySignature.get(signature);
    if (!resourceId) {
      resourceId = uniqueResourceId(
        project.resources,
        deriveNodeId(
          (resourceDraft.kind === "image"
            ? resourceDraft.path
            : resourceDraft.kind === "spine"
              ? resourceDraft.skeleton
              : resourceDraft.manifest.id
          )
            .split("/")
            .at(-1)!,
        ),
      );
      const resource = {
        ...resourceDraft,
        id: resourceId,
      } as EditorLayoutResource;
      for (const path of editorResourcePaths(resource)) {
        const owner = pathsByResource.get(path);
        if (owner && owner !== signature) {
          throw new Error(`导入资源路径 ${path} 被不同素材签名复用。`);
        }
        pathsByResource.set(path, signature);
      }
      project.resources.set(resourceId, resource);
      resourceIdsBySignature.set(signature, resourceId);
    }
    return {
      id: node.id,
      order: node.order,
      resourceId,
      ...(node.resource.kind === "spine"
        ? {
            playback:
              "stateMachine" in node.resource
                ? {
                    kind: "state-machine" as const,
                    initialState: node.resource.stateMachine.initialState,
                    states: Object.entries(
                      node.resource.stateMachine.states,
                    ).map(([id, state]) => ({
                      id,
                      animation: state.animation,
                    })),
                    transitions: node.resource.stateMachine.transitions.map(
                      (transition) => ({ ...transition }),
                    ),
                  }
                : {
                    kind: "loop" as const,
                    animation: node.resource.defaultAnimation,
                  },
          }
        : node.resource.kind === "image-string"
          ? {
              imageString: {
                text: node.resource.text,
                anchor: { ...node.resource.anchor },
              },
            }
          : {}),
      placements: structuredClone(node.placements),
    };
  });
  const reel = parsed.reels.main;
  if (!reel) throw new Error('导入 manifest 必须包含 reel "main"。');
  project.reel = {
    order: reel.order ?? null,
    columns: reel.columns,
    rows: reel.rows,
    cellWidth: reel.cellSize.width,
    cellHeight: reel.cellSize.height,
    gapX: reel.gap.x,
    gapY: reel.gap.y,
    placements: structuredClone(reel.placements),
  };
  if (parsed.adaptation.mode === "maximized-focus") {
    project.variants.default = {
      ...createEmptyVariant(),
      artSize: { ...parsed.adaptation.artSize },
      focusRect: { ...parsed.adaptation.focusRect },
      frameFocusRect: {
        width: parsed.adaptation.focusRect.width,
        height: parsed.adaptation.focusRect.height,
      },
      backgroundNode: parsed.adaptation.backgroundNode,
    };
    updateVariantFocusOffsetsFromRect(project, "default");
  } else {
    project.variants.landscape = fromOrientationVariant(
      parsed.adaptation.variants.landscape,
    );
    project.variants.portrait = fromOrientationVariant(
      parsed.adaptation.variants.portrait,
    );
    updateVariantFocusOffsetsFromRect(project, "landscape");
    updateVariantFocusOffsetsFromRect(project, "portrait");
  }
  project.assets = new Map(
    [...assets].map(([path, bytes]) => [path, bytes.slice()]),
  );
  if (parsed.symbolPackage) {
    const prefix = `dependencies/symbols/${parsed.symbolPackage.manifest.split("/").at(-2)}/`;
    const files = new Map(
      [...assets.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .map(
          ([path, bytes]) =>
            [path.slice(prefix.length), bytes.slice()] as const,
        ),
    );
    const nested = parseSymbolPackageManifest(
      parseJsonBytes(files.get("symbols.package.json"), "symbols.package.json"),
    );
    const expected = collectSymbolPackageEntryPaths(nested);
    if (
      JSON.stringify([...files.keys()].sort()) !==
      JSON.stringify([...expected].sort())
    )
      throw new Error("导入 symbols dependency 闭包不精确。");
    project.symbolDependency = {
      packageId: nested.id,
      files,
      reelSet: parsed.symbolPackage.reelSet,
      renderMode: parsed.symbolPackage.renderMode,
      includeInExport: true,
    };
    for (const path of [...project.assets.keys()])
      if (path.startsWith(prefix)) project.assets.delete(path);
  }
  return project;
}

export function cloneEditorProject(project: EditorProject): EditorProject {
  return {
    ...structuredClone({ ...project, resources: undefined, assets: undefined }),
    resources: new Map(
      [...project.resources].map(([id, resource]) => [
        id,
        structuredClone(resource),
      ]),
    ),
    assets: new Map(
      [...project.assets].map(([path, bytes]) => [path, bytes.slice()]),
    ),
    symbolDependency: project.symbolDependency
      ? {
          ...structuredClone({ ...project.symbolDependency, files: undefined }),
          files: new Map(
            [...project.symbolDependency.files].map(([path, bytes]) => [
              path,
              bytes.slice(),
            ]),
          ),
        }
      : null,
  } as EditorProject;
}

export function calculateReelSize(project: EditorProject): {
  width: number;
  height: number;
} {
  const reel = project.reel;
  return {
    width:
      reel.columns * reel.cellWidth + Math.max(0, reel.columns - 1) * reel.gapX,
    height:
      reel.rows * reel.cellHeight + Math.max(0, reel.rows - 1) * reel.gapY,
  };
}

function createEmptyVariant(): EditorVariantDraft {
  return {
    artSize: { width: 0, height: 0 },
    focusOffsets: {
      left: -DEFAULT_FOCUS_PADDING,
      top: -DEFAULT_FOCUS_PADDING,
      right: DEFAULT_FOCUS_PADDING,
      bottom: DEFAULT_FOCUS_PADDING,
    },
    focusRect: { x: 0, y: 0, width: 0, height: 0 },
    frameFocusRect: { width: 0, height: 0 },
    minFocusMargin: { left: 0, right: 0, top: 0, bottom: 0 },
    backgroundNode: "",
  };
}

function previewVariantOrder(
  mode: EditorMode,
  preferred: SceneLayoutVariantId,
): readonly SceneLayoutVariantId[] {
  if (mode === "maximized-focus") return ["default"];
  return preferred === "portrait"
    ? ["portrait", "landscape"]
    : ["landscape", "portrait"];
}

function toOrientationVariant(variant: EditorVariantDraft) {
  const margin = variant.minFocusMargin;
  const hasMargin = Object.values(margin).some((value) => value !== 0);
  return {
    artSize: variant.artSize,
    focusRect: variant.focusRect,
    frameFocusRect: variant.frameFocusRect,
    ...(hasMargin ? { minFocusMargin: margin } : {}),
    backgroundNode: variant.backgroundNode,
  };
}

function fromOrientationVariant(variant: {
  readonly artSize: { readonly width: number; readonly height: number };
  readonly focusRect: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly frameFocusRect: { readonly width: number; readonly height: number };
  readonly minFocusMargin?: {
    readonly left?: number;
    readonly right?: number;
    readonly top?: number;
    readonly bottom?: number;
  };
  readonly backgroundNode: string;
}): EditorVariantDraft {
  return {
    artSize: { ...variant.artSize },
    focusOffsets: {
      left: -DEFAULT_FOCUS_PADDING,
      top: -DEFAULT_FOCUS_PADDING,
      right: DEFAULT_FOCUS_PADDING,
      bottom: DEFAULT_FOCUS_PADDING,
    },
    focusRect: { ...variant.focusRect },
    frameFocusRect: { ...variant.frameFocusRect },
    minFocusMargin: {
      left: variant.minFocusMargin?.left ?? 0,
      right: variant.minFocusMargin?.right ?? 0,
      top: variant.minFocusMargin?.top ?? 0,
      bottom: variant.minFocusMargin?.bottom ?? 0,
    },
    backgroundNode: variant.backgroundNode,
  };
}

function manifestResourceToEditorResource(
  resource: SceneLayoutNode["resource"],
  assets: ReadonlyMap<string, Uint8Array>,
): EditorLayoutResourceDraft {
  if (resource.kind === "image") {
    return {
      kind: "image",
      path: resource.path,
      size: { ...resource.size },
    };
  }
  if (resource.kind === "image-string") {
    const bytes = assets.get(resource.manifest);
    const manifest = parseImageStringManifest(
      parseJsonBytes(bytes, resource.manifest),
    );
    const directory = resource.manifest.slice(
      0,
      resource.manifest.lastIndexOf("/"),
    );
    const assetPaths = collectImageStringAssetPaths(manifest).map(
      (path) => `${directory}/${path}`,
    );
    return {
      kind: "image-string",
      manifestPath: resource.manifest,
      manifest,
      assetPaths,
    };
  }
  const skeletonBytes = assets.get(resource.skeleton);
  if (!skeletonBytes)
    throw new Error(`导入缺少 skeleton：${resource.skeleton}`);
  const metadata = readSpineMetadata(skeletonBytes);
  return {
    kind: "spine",
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: { ...resource.textures },
    animationNames: metadata.animationNames,
    ...(metadata.bounds ? { bounds: metadata.bounds } : {}),
  };
}

export function validateEditorSpinePlayback(
  playback: EditorSpinePlaybackDraft,
  animationNames: readonly string[],
  nodeId = "node",
): void {
  const available = new Set(animationNames);
  if (playback.kind === "loop") {
    if (!available.has(playback.animation))
      throw new Error(
        `Spine 节点 ${nodeId} 的 animation ${playback.animation} 不存在。`,
      );
    return;
  }
  const stateIds = new Set(playback.states.map((state) => state.id));
  if (stateIds.size !== playback.states.length || playback.states.length === 0)
    throw new Error(`Spine 节点 ${nodeId} 的 state 必须非空且 id 唯一。`);
  for (const state of playback.states) {
    if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(state.id))
      throw new Error(
        `Spine 节点 ${nodeId} 的 state id ${state.id} 格式无效。`,
      );
  }
  if (!stateIds.has(playback.initialState))
    throw new Error(`Spine 节点 ${nodeId} 的 initialState 不存在。`);
  const pairs = new Set<string>();
  for (const transition of playback.transitions) {
    if (!stateIds.has(transition.from) || !stateIds.has(transition.to))
      throw new Error(`Spine 节点 ${nodeId} 的 transition 引用了未知 state。`);
    if (transition.from === transition.to)
      throw new Error(`Spine 节点 ${nodeId} 的 transition 不得自循环。`);
    const pair = `${transition.from}\u0000${transition.to}`;
    if (pairs.has(pair))
      throw new Error(`Spine 节点 ${nodeId} 的 transition 有向边必须唯一。`);
    pairs.add(pair);
  }
  const animations = [
    ...playback.states.map((state) => state.animation),
    ...playback.transitions.map((transition) => transition.animation),
  ];
  for (const animation of animations)
    if (!available.has(animation))
      throw new Error(
        `Spine 节点 ${nodeId} 的 animation ${animation} 不存在。`,
      );
  if (new Set(animations).size !== animations.length)
    throw new Error(`Spine 节点 ${nodeId} 的 animation 语义槽必须全局唯一。`);
}

function parseJsonBytes(bytes: Uint8Array | undefined, path: string): unknown {
  if (!bytes) throw new Error(`导入缺少 JSON：${path}`);
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `${path} JSON 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function readSpineMetadata(bytes: Uint8Array): {
  readonly animationNames: readonly string[];
  readonly bounds?: { readonly width: number; readonly height: number };
} {
  let skeleton: {
    readonly skeleton?: { readonly width?: unknown; readonly height?: unknown };
    readonly animations?: Readonly<Record<string, unknown>>;
  };
  try {
    skeleton = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as typeof skeleton;
  } catch (error) {
    throw new Error(
      `Spine skeleton JSON 无效：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const animationNames = Object.keys(skeleton.animations ?? {});
  const width = skeleton.skeleton?.width;
  const height = skeleton.skeleton?.height;
  const hasBounds =
    typeof width === "number" &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === "number" &&
    Number.isFinite(height) &&
    height > 0;
  return {
    animationNames,
    ...(hasBounds ? { bounds: { width, height } } : {}),
  };
}

function uniqueResourceId(
  resources: ReadonlyMap<string, EditorLayoutResource>,
  base: string,
): string {
  if (!resources.has(base)) return base;
  let suffix = 2;
  while (resources.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
