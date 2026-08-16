import {
  materializeSceneLayoutManifestForMode,
  parseSceneLayoutManifest,
  parseSceneLayoutManifestDocument,
  upgradeSceneLayoutManifestToLatest,
  type SceneLayoutCoordinateOrigin,
  type SceneLayoutManifest,
  type SceneLayoutManifestLatest,
  type SceneLayoutGameModeV2,
  type SceneLayoutNode,
  type SceneLayoutRuntimeResourceSpec,
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
import {
  collectMappedPopupAssetKeys,
  collectPopupPackagePaths,
  parsePopupManifest,
  type PopupManifest,
} from "@slotclientengine/rendercore/popup";
import { assertVNIProject } from "@slotclientengine/vnicore/data";
import {
  editorResourcePaths,
  editorResourceSignature,
  readEditorSpineMetadata,
  type EditorImageLayoutResource,
  type EditorImageStringLayoutResource,
  type EditorLayoutResource,
  type EditorSpineLayoutResource,
  type EditorVniLayoutResource,
  type EditorVideoLayoutResource,
} from "./editor-resource.js";
import { assertCanonicalEditorNodeId } from "./node-id.js";

type EditorLayoutResourceDraft =
  | Omit<EditorImageLayoutResource, "id">
  | Omit<EditorSpineLayoutResource, "id">
  | Omit<EditorImageStringLayoutResource, "id">
  | Omit<EditorVniLayoutResource, "id">
  | Omit<EditorVideoLayoutResource, "id">;

export type EditorMode = "maximized-focus" | "orientation-focus";

export const DEFAULT_REEL_COLUMNS = 5;
export const DEFAULT_REEL_ROWS = 3;
export const DEFAULT_REEL_CELL_SIZE = 160;
export const DEFAULT_REEL_ORDER = 999;
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

export type EditorSpinePlaybackDraft = {
  readonly kind: "loop";
  animation: string;
  loop: boolean;
};

export type EditorVniPlaybackDraft = {
  readonly kind: "vni";
  loop: boolean;
};

export interface EditorNodeDraft {
  id: string;
  order: number;
  /** Missing means the ordinary layer is effective in every game mode. */
  gameMode?: string;
  resourceId: string;
  playback?: EditorSpinePlaybackDraft | EditorVniPlaybackDraft;
  imageString?: {
    text: string;
    anchor: { x: number; y: number };
  };
  placements: Partial<Record<SceneLayoutVariantId, EditorNodePlacement>>;
  /**
   * Editor-only cache for temporarily hidden orientation placements.
   * Export intentionally serializes only `placements`.
   */
  hiddenPlacements?: Partial<Record<SceneLayoutVariantId, EditorNodePlacement>>;
}

export interface EditorNodePlacement {
  x: number;
  y: number;
  scale: number;
  /** Optional only for legacy/in-memory callers; editor-created drafts always materialize it. */
  rotation?: number;
  /** Optional only for legacy/in-memory callers; editor-created drafts always materialize it. */
  center?: { x: number; y: number };
}

export function createDefaultNodePlacement(x = 0, y = 0): EditorNodePlacement {
  return { x, y, scale: 1, rotation: 0, center: { x: 0.5, y: 0.5 } };
}

export interface EditorSymbolPackageDependency {
  readonly packageId: string;
  readonly rootKey: string;
  readonly keys: readonly string[];
}

export interface EditorModeSymbolBinding {
  readonly packageId: string;
  reelSet: string;
  renderMode: "standard" | "grid-cell";
}

export interface EditorPopupDependency {
  readonly id: string;
  readonly type: PopupManifest["type"];
  readonly rootKey: string;
  readonly keys: readonly string[];
  order: number;
  placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number; scale: number }>
  >;
}

export interface EditorGameModeDraft {
  id: string;
  mode: EditorMode;
  reelEnabled: boolean;
  variants: EditorProject["variants"];
  reelPlacements: EditorProject["reel"]["placements"];
  backgroundNodes: Partial<Record<SceneLayoutVariantId, string>>;
  nodeStates: Record<string, string>;
  symbols: EditorModeSymbolBinding | null;
  awardCelebrationPopupId: string | null;
  primaryActionTargetMode: string | null;
}

interface EditorGameModeTransitionBaseDraft {
  fromModeId: string;
  toModeId: string;
  preludePopupId?: string | null;
}

export interface EditorSpineGameModeTransitionDraft extends EditorGameModeTransitionBaseDraft {
  kind: "spine";
  resourceId: string;
  animation: string;
  switchEvent: string;
  placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number; scale: number }>
  >;
}

export interface EditorVideoGameModeTransitionDraft extends EditorGameModeTransitionBaseDraft {
  kind: "video";
  resourceId: string;
  fit: "contain";
  fadeOutSeconds: number;
}

export interface EditorNoneGameModeTransitionDraft extends EditorGameModeTransitionBaseDraft {
  kind: "none";
}

export type EditorGameModeTransitionDraft =
  | EditorNoneGameModeTransitionDraft
  | EditorSpineGameModeTransitionDraft
  | EditorVideoGameModeTransitionDraft;

export interface EditorProject {
  id: string;
  mode: EditorMode;
  coordinateOrigin: SceneLayoutCoordinateOrigin;
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
  symbolDependencies: Map<string, EditorSymbolPackageDependency>;
  popupDependencies: Map<string, EditorPopupDependency>;
  registeredSpinePopupIds: Set<string>;
  runtimeResourceBindings: Map<string, string>;
  gameModes: {
    activeModeId: string;
    initialMode: string;
    modes: EditorGameModeDraft[];
    transitions: EditorGameModeTransitionDraft[];
  };
}

export function activeVariantIds(
  project: Pick<EditorProject, "mode"> | Pick<EditorGameModeDraft, "mode">,
): readonly SceneLayoutVariantId[] {
  return project.mode === "maximized-focus"
    ? ["default"]
    : ["landscape", "portrait"];
}

export function createNewEditorProject(mode: EditorMode): EditorProject {
  const geometry = createEmptyModeGeometry(mode);
  const project: EditorProject = {
    id: "new-layout",
    mode,
    coordinateOrigin: "top-left",
    variants: {
      default: geometry.variants.default,
      landscape: geometry.variants.landscape,
      portrait: geometry.variants.portrait,
    },
    nodes: [],
    reel: {
      order: DEFAULT_REEL_ORDER,
      columns: DEFAULT_REEL_COLUMNS,
      rows: DEFAULT_REEL_ROWS,
      cellWidth: DEFAULT_REEL_CELL_SIZE,
      cellHeight: DEFAULT_REEL_CELL_SIZE,
      gapX: 0,
      gapY: 0,
      placements: geometry.reelPlacements,
    },
    resources: new Map(),
    assets: new Map(),
    symbolDependencies: new Map(),
    popupDependencies: new Map(),
    registeredSpinePopupIds: new Set(),
    runtimeResourceBindings: new Map(),
    gameModes: {
      activeModeId: "BaseGame",
      initialMode: "BaseGame",
      transitions: [],
      modes: [
        {
          id: "BaseGame",
          mode,
          reelEnabled: true,
          variants: geometry.variants,
          reelPlacements: geometry.reelPlacements,
          backgroundNodes: geometry.backgroundNodes,
          nodeStates: {},
          symbols: null,
          awardCelebrationPopupId: null,
          primaryActionTargetMode: null,
        },
      ],
    },
  };
  return project;
}

export function createSplashFirstEditorProject(
  splashMode: EditorMode,
  baseGameMode: EditorMode,
): EditorProject {
  const project = createNewEditorProject(baseGameMode);
  const splash = createEditorGameModeDraft("Splash", splashMode, false);
  splash.primaryActionTargetMode = "BaseGame";
  project.gameModes.modes.unshift(splash);
  project.gameModes.transitions.push({
    kind: "none",
    fromModeId: "Splash",
    toModeId: "BaseGame",
    preludePopupId: null,
  });
  project.gameModes.initialMode = "Splash";
  activateEditorGameMode(project, "Splash");
  return project;
}

export function activateEditorGameMode(
  project: EditorProject,
  modeId: string,
): void {
  const mode = project.gameModes.modes.find(
    (candidate) => candidate.id === modeId,
  );
  if (!mode) throw new Error(`未知游戏模式：${modeId}`);
  project.gameModes.activeModeId = mode.id;
  project.mode = mode.mode;
  project.variants = mode.variants;
  project.reel.placements = mode.reelPlacements;
}

export function createEditorGameModeDraft(
  id: string,
  mode: EditorMode,
  reelEnabled = true,
): EditorGameModeDraft {
  const geometry = createEmptyModeGeometry(mode);
  return {
    id,
    mode,
    reelEnabled,
    variants: geometry.variants,
    reelPlacements: geometry.reelPlacements,
    backgroundNodes: geometry.backgroundNodes,
    nodeStates: {},
    symbols: null,
    awardCelebrationPopupId: null,
    primaryActionTargetMode: null,
  };
}

export function initializeVariantFromBackground(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
  artSize: { readonly width: number; readonly height: number },
): void {
  if (!(artSize.width > 0) || !(artSize.height > 0)) return;
  const activeMode = project.gameModes.modes.find(
    (mode) => mode.id === project.gameModes.activeModeId,
  );
  if (activeMode && !activeMode.reelEnabled) {
    const variant = project.variants[variantId];
    variant.artSize = { ...artSize };
    variant.focusOffsets = { left: 0, top: 0, right: 0, bottom: 0 };
    variant.focusRect = { x: 0, y: 0, ...artSize };
    variant.frameFocusRect = { ...artSize };
    return;
  }
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
    x:
      project.coordinateOrigin === "center"
        ? 0
        : Math.round((artSize.width - reelSize.width) / 2),
    y:
      project.coordinateOrigin === "center"
        ? 0
        : Math.round((artSize.height - reelSize.height) / 2),
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
  const offsets = variant.focusOffsets;
  const activeMode = project.gameModes.modes.find(
    (mode) => mode.id === project.gameModes.activeModeId,
  );
  if (activeMode && !activeMode.reelEnabled) {
    if (
      !(variant.artSize.width > 0) ||
      !(variant.artSize.height > 0) ||
      !Object.values(offsets).every(Number.isFinite)
    )
      return;
    const left = Math.max(0, offsets.left);
    const top = Math.max(0, offsets.top);
    const right = Math.min(
      variant.artSize.width,
      variant.artSize.width + offsets.right,
    );
    const bottom = Math.min(
      variant.artSize.height,
      variant.artSize.height + offsets.bottom,
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
    return;
  }
  const placement = project.reel.placements[variantId];
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
  const reelTopLeft = resolveEditorReelTopLeft(project, variantId);
  const left = Math.max(0, reelTopLeft.x + offsets.left);
  const top = Math.max(0, reelTopLeft.y + offsets.top);
  const right = Math.min(
    variant.artSize.width,
    reelTopLeft.x + reelSize.width + offsets.right,
  );
  const bottom = Math.min(
    variant.artSize.height,
    reelTopLeft.y + reelSize.height + offsets.bottom,
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

export function setVariantArtSizeDimension(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
  dimension: "width" | "height",
  value: number,
): void {
  const variant = project.variants[variantId];
  const previousSize = { ...variant.artSize };
  const previousComplete = previousSize.width > 0 && previousSize.height > 0;
  const reelSize = calculateReelSize(project);
  const reelPlacement = project.reel.placements[variantId];
  const reelWasCentered =
    !previousComplete ||
    (Boolean(reelPlacement) &&
      (project.coordinateOrigin === "center"
        ? reelPlacement!.x === 0 && reelPlacement!.y === 0
        : reelPlacement!.x ===
            Math.round((previousSize.width - reelSize.width) / 2) &&
          reelPlacement!.y ===
            Math.round((previousSize.height - reelSize.height) / 2)));

  variant.artSize[dimension] = value;

  const background = project.nodes.find(
    (node) => node.id === variant.backgroundNode,
  );
  const backgroundResource = background
    ? project.resources.get(background.resourceId)
    : undefined;
  const placement = background?.placements[variantId];
  const placementAxis = dimension === "width" ? "x" : "y";
  if (
    backgroundResource?.kind === "spine" &&
    placement &&
    Number.isFinite(value) &&
    value > 0
  ) {
    const previousCenter =
      project.coordinateOrigin === "center" ? 0 : previousSize[dimension] / 2;
    const nextCenter = project.coordinateOrigin === "center" ? 0 : value / 2;
    if (
      placement[placementAxis] === 0 ||
      placement[placementAxis] === previousCenter
    ) {
      placement[placementAxis] = nextCenter;
    }
  }

  const nextComplete = variant.artSize.width > 0 && variant.artSize.height > 0;
  if (nextComplete && reelWasCentered) {
    initializeVariantFromBackground(project, variantId, variant.artSize);
  } else {
    updateVariantFocusFromReel(project, variantId);
  }
}

export function updateVariantFocusOffsetsFromRect(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
): void {
  const variant = project.variants[variantId];
  const activeMode = project.gameModes.modes.find(
    (mode) => mode.id === project.gameModes.activeModeId,
  );
  if (activeMode && !activeMode.reelEnabled) {
    variant.focusOffsets = {
      left: variant.focusRect.x,
      top: variant.focusRect.y,
      right:
        variant.focusRect.x + variant.focusRect.width - variant.artSize.width,
      bottom:
        variant.focusRect.y + variant.focusRect.height - variant.artSize.height,
    };
    return;
  }
  const placement = project.reel.placements[variantId];
  if (!placement) return;
  const reelSize = calculateReelSize(project);
  const reelTopLeft = resolveEditorReelTopLeft(project, variantId);
  variant.focusOffsets = {
    left: variant.focusRect.x - reelTopLeft.x,
    top: variant.focusRect.y - reelTopLeft.y,
    right:
      variant.focusRect.x +
      variant.focusRect.width -
      (reelTopLeft.x + reelSize.width),
    bottom:
      variant.focusRect.y +
      variant.focusRect.height -
      (reelTopLeft.y + reelSize.height),
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
    const topLeft = resolveEditorReelTopLeft(project, variantId);
    if (
      topLeft.x < 0 ||
      topLeft.y < 0 ||
      topLeft.x + size.width > variant.artSize.width ||
      topLeft.y + size.height > variant.artSize.height
    ) {
      throw new Error(
        `symbols package cellSize 使 ${variantId} main grid 越出 art；禁止 auto-fit。`,
      );
    }
    const focus = variant.focusRect;
    if (
      focus.x > topLeft.x ||
      focus.y > topLeft.y ||
      focus.x + focus.width < topLeft.x + size.width ||
      focus.y + focus.height < topLeft.y + size.height
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
  if (resource.kind === "vni") {
    if (node.imageString !== undefined)
      throw new Error(`VNI 节点 ${node.id} 不得声明 imageString。`);
    if (node.playback?.kind !== "vni")
      throw new Error(`VNI 节点 ${node.id} 必须明确选择 playback。`);
    return {
      kind: "vni",
      project: resource.projectPath,
      loop: node.playback.loop,
    };
  }
  if (resource.kind === "video")
    throw new Error(`video 资源 ${resource.id} 不能创建 scene node。`);
  if (node.imageString !== undefined)
    throw new Error(`Spine 节点 ${node.id} 不得声明 imageString。`);
  const playback = node.playback;
  if (!playback)
    throw new Error(`Spine 节点 ${node.id} 必须明确选择 playback。`);
  if (playback.kind !== "loop")
    throw new Error(`Spine 节点 ${node.id} playback 类型无效。`);
  validateEditorSpinePlayback(playback, resource.animationNames, node.id);
  return {
    kind: "spine",
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: resource.textures,
    defaultAnimation: playback.animation,
    loop: playback.loop,
  };
}

export function editorProjectToPreviewManifest(
  project: EditorProject,
  preferredVariant: SceneLayoutVariantId,
  includeSymbolPackage = false,
): SceneLayoutManifest | null {
  try {
    const manifest = editorProjectToManifest(project);
    const preview = includeSymbolPackage
      ? manifest
      : {
          ...manifest,
          symbolPackage: undefined,
          symbolPackages: undefined,
          gameModes: {
            ...manifest.gameModes,
            modes: manifest.gameModes.modes.map(
              ({ symbolPackage: _symbolPackage, ...mode }) => mode,
            ),
          },
        };
    return parseSceneLayoutManifestDocument(preview);
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
      if (
        !nodePlacement ||
        (node.gameMode !== undefined &&
          node.gameMode !== project.gameModes.initialMode)
      )
        return [];
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
): SceneLayoutManifestLatest {
  for (const node of project.nodes) assertCanonicalEditorNodeId(node.id);
  const initialMode = project.gameModes.modes.find(
    (mode) => mode.id === project.gameModes.initialMode,
  );
  if (!initialMode)
    throw new Error(`initial 主状态不存在：${project.gameModes.initialMode}`);
  return upgradeSceneLayoutManifestToLatest({
    version: 2,
    kind: "scene-layout",
    id: project.id,
    coordinateOrigin: project.coordinateOrigin,
    nodes: project.nodes.map((node) => ({
      id: node.id,
      order: node.order,
      ...(node.gameMode ? { gameMode: node.gameMode } : {}),
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
      },
    },
    ...(() => {
      const bindings = new Map<string, EditorModeSymbolBinding>();
      for (const mode of project.gameModes.modes) {
        if (!mode.symbols) continue;
        const dependency = project.symbolDependencies.get(
          mode.symbols.packageId,
        );
        if (!dependency)
          throw new Error(
            `主状态 ${mode.id} 引用了未知 Symbols dependency：${mode.symbols.packageId}`,
          );
        const existing = bindings.get(mode.symbols.packageId);
        if (
          existing &&
          (existing.reelSet !== mode.symbols.reelSet ||
            existing.renderMode !== mode.symbols.renderMode)
        )
          throw new Error(
            `共享 Symbols dependency ${mode.symbols.packageId} 的 reelSet/renderMode 必须一致。`,
          );
        bindings.set(mode.symbols.packageId, mode.symbols);
      }
      if (bindings.size === 0) return {};
      return {
        symbolPackages: Object.fromEntries(
          [...bindings].map(([id, binding]) => [
            id,
            {
              manifest: project.symbolDependencies.get(id)!.rootKey,
              reel: "main",
              reelSet: binding.reelSet,
              renderMode: binding.renderMode,
            },
          ]),
        ),
      };
    })(),
    ...(() => {
      const referenced = new Set(
        project.gameModes.modes.flatMap((mode) =>
          mode.awardCelebrationPopupId ? [mode.awardCelebrationPopupId] : [],
        ),
      );
      for (const transition of project.gameModes.transitions)
        if (transition.preludePopupId)
          referenced.add(transition.preludePopupId);
      for (const id of project.registeredSpinePopupIds) referenced.add(id);
      if (referenced.size === 0) return {};
      return {
        popups: Object.fromEntries(
          [...referenced].map((id) => {
            const dependency = project.popupDependencies.get(id);
            if (!dependency)
              throw new Error(`游戏模式引用了未知 Popup dependency：${id}`);
            return [
              id,
              {
                type: dependency.type,
                manifest: dependency.rootKey,
                order: dependency.order,
                placements: dependency.placements,
              },
            ];
          }),
        ),
      };
    })(),
    ...(project.runtimeResourceBindings.size > 0
      ? {
          runtimeResources: Object.fromEntries(
            [...project.runtimeResourceBindings]
              .sort(([left], [right]) => left.localeCompare(right, "en"))
              .map(([key, resourceId]) => {
                const resource = project.resources.get(resourceId);
                if (!resource)
                  throw new Error(
                    `程序资源 ${key} 引用了未知资源：${resourceId}`,
                  );
                return [key, editorResourceToRuntimeSpec(resource)];
              }),
          ),
        }
      : {}),
    gameModes: {
      initialMode: project.gameModes.initialMode,
      modes: project.gameModes.modes.map((mode) => ({
        id: mode.id,
        adaptation:
          mode.mode === "maximized-focus"
            ? {
                mode: "maximized-focus" as const,
                artSize: mode.variants.default.artSize,
                focusRect: mode.variants.default.focusRect,
              }
            : {
                mode: "orientation-focus" as const,
                variants: {
                  landscape: toOrientationVariantV2(mode.variants.landscape),
                  portrait: toOrientationVariantV2(mode.variants.portrait),
                },
              },
        reelEnabled: mode.reelEnabled,
        reelPlacements: mode.reelEnabled ? { main: mode.reelPlacements } : {},
        backgroundNodes: mode.backgroundNodes,
        nodeStates: {},
        ...(mode.primaryActionTargetMode
          ? {
              primaryAction: {
                kind: "request-game-mode" as const,
                targetMode: mode.primaryActionTargetMode,
              },
            }
          : {}),
        ...(mode.symbols ? { symbolPackage: mode.symbols.packageId } : {}),
        ...(mode.awardCelebrationPopupId
          ? { awardCelebrationPopup: mode.awardCelebrationPopupId }
          : {}),
      })),
      transitions: [...project.gameModes.transitions]
        .sort((left, right) => {
          const from =
            project.gameModes.modes.findIndex(
              (mode) => mode.id === left.fromModeId,
            ) -
            project.gameModes.modes.findIndex(
              (mode) => mode.id === right.fromModeId,
            );
          if (from !== 0) return from;
          return (
            project.gameModes.modes.findIndex(
              (mode) => mode.id === left.toModeId,
            ) -
            project.gameModes.modes.findIndex(
              (mode) => mode.id === right.toModeId,
            )
          );
        })
        .map((transition) => {
          if (transition.kind === "none")
            return {
              from: transition.fromModeId,
              to: transition.toModeId,
              ...(transition.preludePopupId
                ? { preludePopup: transition.preludePopupId }
                : {}),
              overlay: { kind: "none" as const },
            };
          const resource = project.resources.get(transition.resourceId);
          if (transition.kind === "video") {
            if (!resource || resource.kind !== "video")
              throw new Error(
                `转场 ${transition.fromModeId} -> ${transition.toModeId} 必须绑定 video resource。`,
              );
            if (
              !Number.isFinite(transition.fadeOutSeconds) ||
              transition.fadeOutSeconds <= 0 ||
              transition.fadeOutSeconds >= resource.durationSeconds
            )
              throw new Error(
                `转场 ${transition.fromModeId} -> ${transition.toModeId} fadeOutSeconds 必须小于视频实际时长。`,
              );
            return {
              from: transition.fromModeId,
              to: transition.toModeId,
              ...(transition.preludePopupId
                ? { preludePopup: transition.preludePopupId }
                : {}),
              overlay: {
                resource: {
                  kind: "video" as const,
                  path: resource.path,
                  mimeType: "video/mp4" as const,
                },
                fit: "contain" as const,
                fadeOutSeconds: transition.fadeOutSeconds,
              },
            };
          }
          if (!resource || resource.kind !== "spine")
            throw new Error(
              `转场 ${transition.fromModeId} -> ${transition.toModeId} 必须绑定 Spine resource。`,
            );
          validateEditorTransitionEvent(resource, transition);
          return {
            from: transition.fromModeId,
            to: transition.toModeId,
            ...(transition.preludePopupId
              ? { preludePopup: transition.preludePopupId }
              : {}),
            overlay: {
              resource: {
                kind: "spine" as const,
                skeleton: resource.skeleton,
                atlas: resource.atlas,
                textures: resource.textures,
              },
              animation: transition.animation,
              switchEvent: transition.switchEvent,
              placements: transition.placements,
            },
          };
        }),
    },
  });
}

export function validateEditorTransitionEvent(
  resource: EditorSpineLayoutResource,
  transition: Pick<
    EditorSpineGameModeTransitionDraft,
    "animation" | "switchEvent"
  >,
): void {
  if (!resource.animationNames.includes(transition.animation))
    throw new Error(
      `转场 animation ${transition.animation || "<empty>"} 不存在。`,
    );
  const count = (resource.animationEvents[transition.animation] ?? []).filter(
    (event) => event.name === transition.switchEvent,
  ).length;
  if (!transition.switchEvent || count !== 1)
    throw new Error(
      `转场 switch event ${transition.switchEvent || "<empty>"} 必须在 ${transition.animation} 中恰好出现一次，实际 ${count} 次。`,
    );
}

export function manifestToEditorProject(
  manifest: SceneLayoutManifest,
  assets: ReadonlyMap<string, Uint8Array>,
  videoMetadata: ReadonlyMap<
    string,
    {
      readonly width: number;
      readonly height: number;
      readonly durationSeconds: number;
      readonly hasAudio: boolean | "unknown";
    }
  > = new Map(),
): EditorProject {
  const latest = upgradeSceneLayoutManifestToLatest(manifest);
  const parsed = materializeSceneLayoutManifestForMode(
    latest,
    latest.gameModes.initialMode,
  );
  if (
    parsed.nodes.some(
      (node) =>
        node.resource.kind === "spine" && "stateMachine" in node.resource,
    ) ||
    parsed.gameModes?.modes.some(
      (mode) => Object.keys(mode.nodeStates).length > 0,
    )
  )
    throw new Error(
      "旧 state-machine 主状态转场无法自动迁移：缺少可确定的 switch event；请拆分稳定背景并在“转场”Tab 重新配置。",
    );
  const initialLatestMode = latest.gameModes.modes.find(
    (mode) => mode.id === latest.gameModes.initialMode,
  )!;
  const project = createNewEditorProject(initialLatestMode.adaptation.mode);
  project.id = parsed.id;
  project.coordinateOrigin = parsed.coordinateOrigin ?? "top-left";
  const resourceIdsBySignature = new Map<string, string>();
  const pathsByResource = new Map<
    string,
    {
      readonly signature: string;
      readonly kind: EditorLayoutResource["kind"];
      readonly spineLeaf: boolean;
    }
  >();
  const registerResource = (
    resourceDraft: EditorLayoutResourceDraft,
  ): string => {
    const resourceKey =
      resourceDraft.kind === "image"
        ? resourceDraft.path
        : resourceDraft.kind === "spine"
          ? resourceDraft.skeleton
          : resourceDraft.kind === "vni"
            ? resourceDraft.projectPath
            : resourceDraft.kind === "video"
              ? resourceDraft.path
              : resourceDraft.manifestPath;
    const temporary = {
      ...resourceDraft,
      id: resourceKey,
    } as EditorLayoutResource;
    const signature = editorResourceSignature(temporary);
    const existing = resourceIdsBySignature.get(signature);
    if (existing) return existing;
    if (project.resources.has(resourceKey))
      throw new Error(`导入 filename key 被不同资源复用：${resourceKey}`);
    const resource = {
      ...resourceDraft,
      id: resourceKey,
    } as EditorLayoutResource;
    for (const path of editorResourcePaths(resource)) {
      const owner = pathsByResource.get(path);
      const sharedSpineLeaf =
        owner?.kind === "spine" &&
        owner.spineLeaf &&
        resource.kind === "spine" &&
        path !== resource.skeleton;
      if (owner && owner.signature !== signature && !sharedSpineLeaf)
        throw new Error(`导入资源路径 ${path} 被不同素材签名复用。`);
      pathsByResource.set(path, {
        signature,
        kind: resource.kind,
        spineLeaf: resource.kind === "spine" && path !== resource.skeleton,
      });
    }
    project.resources.set(resourceKey, resource);
    resourceIdsBySignature.set(signature, resourceKey);
    return resourceKey;
  };
  for (const [key, runtimeResource] of Object.entries(
    parsed.runtimeResources ?? {},
  )) {
    const resourceId = registerResource(
      manifestRuntimeResourceToEditorResource(
        runtimeResource,
        assets,
        videoMetadata,
      ),
    );
    if ([...project.runtimeResourceBindings.values()].includes(resourceId))
      throw new Error(`导入程序资源 ${key} 重复绑定了资源 ${resourceId}。`);
    project.runtimeResourceBindings.set(key, resourceId);
  }
  project.nodes = latest.nodes.map((node) => {
    const resourceDraft = manifestResourceToEditorResource(
      node.resource,
      assets,
    );
    const resourceId = registerResource(resourceDraft);
    return {
      id: node.id,
      order: node.order,
      ...(node.gameMode ? { gameMode: node.gameMode } : {}),
      resourceId,
      ...(node.resource.kind === "spine"
        ? {
            playback: {
              kind: "loop" as const,
              animation:
                "defaultAnimation" in node.resource
                  ? node.resource.defaultAnimation
                  : (() => {
                      throw new Error("旧 Spine state-machine 无法导入。");
                    })(),
              loop:
                "defaultAnimation" in node.resource ? node.resource.loop : true,
            },
          }
        : node.resource.kind === "vni"
          ? {
              playback: {
                kind: "vni" as const,
                loop: node.resource.loop,
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
  const transitionResourceIds = new Map<string, string>();
  for (const transition of latest.gameModes.transitions ?? []) {
    const overlay = transition.overlay;
    if ("kind" in overlay) continue;
    let draft: EditorLayoutResourceDraft;
    if ("fadeOutSeconds" in overlay) {
      const metadata = videoMetadata.get(overlay.resource.path);
      if (!metadata)
        throw new Error(
          `导入 video 缺少浏览器 metadata：${overlay.resource.path}`,
        );
      draft = {
        kind: "video",
        path: overlay.resource.path,
        mimeType: "video/mp4",
        size: { width: metadata.width, height: metadata.height },
        durationSeconds: metadata.durationSeconds,
        hasAudio: metadata.hasAudio,
      };
    } else {
      draft = manifestResourceToEditorResource(
        {
          ...overlay.resource,
          defaultAnimation: overlay.animation,
          loop: true,
        },
        assets,
      );
    }
    transitionResourceIds.set(
      `${transition.from}\u0000${transition.to}`,
      registerResource(draft),
    );
  }
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
  const importedSymbolBindings = latest.symbolPackage
    ? [
        [
          latest.symbolPackage.manifest.split("/").at(-2)!,
          latest.symbolPackage,
        ] as const,
      ]
    : Object.entries(latest.symbolPackages ?? {});
  for (const [bindingId, binding] of importedSymbolBindings) {
    const mapped = !binding.manifest.includes("/");
    const prefix = mapped
      ? ""
      : binding.manifest.slice(0, binding.manifest.lastIndexOf("/") + 1);
    const rootBytes = assets.get(binding.manifest);
    const files = new Map<string, Uint8Array>([
      ["symbols.package.json", requiredAsset(rootBytes, binding.manifest)],
    ]);
    const nested = parseSymbolPackageManifest(
      parseJsonBytes(files.get("symbols.package.json"), "symbols.package.json"),
    );
    const expected = collectSymbolPackageEntryPaths(nested);
    for (const path of expected) {
      if (path === "symbols.package.json") continue;
      const source = mapped ? path : `${prefix}${path}`;
      files.set(path, requiredAsset(assets.get(source), source));
    }
    if (
      JSON.stringify([...files.keys()].sort()) !==
      JSON.stringify([...expected].sort())
    )
      throw new Error("导入 symbols dependency 闭包不精确。");
    project.symbolDependencies.set(bindingId, {
      packageId: nested.id,
      rootKey: binding.manifest,
      keys: Object.freeze(
        expected.map((path) =>
          path === "symbols.package.json" ? binding.manifest : path,
        ),
      ),
    });
  }
  for (const [id, binding] of Object.entries(latest.popups ?? {})) {
    const mapped = !binding.manifest.includes("/");
    const prefix = mapped
      ? ""
      : binding.manifest.slice(0, binding.manifest.lastIndexOf("/") + 1);
    const rootBytes = requiredAsset(
      assets.get(binding.manifest),
      binding.manifest,
    );
    const nested = parsePopupManifest(
      parseJsonBytes(rootBytes, "popup.manifest.json"),
    );
    if (nested.id !== id)
      throw new Error(`导入 Popup dependency id 不一致：${id}`);
    if (nested.type !== binding.type)
      throw new Error(
        `导入 Popup dependency ${id} 类型不一致：binding=${binding.type}, nested=${nested.type}`,
      );
    const keys = collectMappedPopupKeys(nested, assets, mapped, prefix);
    const files = new Map<string, Uint8Array>([
      ["popup.manifest.json", rootBytes],
      ...keys.map(
        (key) =>
          [
            key,
            requiredAsset(assets.get(mapped ? key : `${prefix}${key}`), key),
          ] as const,
      ),
    ]);
    collectPopupPackagePaths({ manifest: nested, files });
    project.popupDependencies.set(id, {
      id,
      type: nested.type,
      rootKey: binding.manifest,
      keys: Object.freeze([binding.manifest, ...keys]),
      order: binding.order,
      placements: structuredClone(binding.placements),
    });
    const usedAsPrelude = (latest.gameModes.transitions ?? []).some(
      (transition) =>
        "preludePopup" in transition && transition.preludePopup === id,
    );
    if (nested.type === "spine" && !usedAsPrelude)
      project.registeredSpinePopupIds.add(id);
  }
  project.gameModes = {
    activeModeId: latest.gameModes.initialMode,
    initialMode: latest.gameModes.initialMode,
    transitions: (latest.gameModes.transitions ?? []).map((transition) => {
      const overlay = transition.overlay;
      const common = {
        fromModeId: transition.from,
        toModeId: transition.to,
        preludePopupId: transition.preludePopup ?? null,
      };
      return "kind" in overlay
        ? { ...common, kind: "none" as const }
        : "fadeOutSeconds" in overlay
          ? {
              ...common,
              kind: "video" as const,
              resourceId: transitionResourceIds.get(
                `${transition.from}\u0000${transition.to}`,
              )!,
              fit: "contain" as const,
              fadeOutSeconds: overlay.fadeOutSeconds,
            }
          : {
              ...common,
              kind: "spine" as const,
              resourceId: transitionResourceIds.get(
                `${transition.from}\u0000${transition.to}`,
              )!,
              animation: overlay.animation,
              switchEvent: overlay.switchEvent,
              placements: structuredClone(overlay.placements),
            };
    }),
    modes: latest.gameModes.modes.map((mode) => {
      const geometry = editorGeometryFromLatestMode(mode);
      return {
        id: mode.id,
        mode: mode.adaptation.mode,
        reelEnabled: mode.reelEnabled,
        variants: geometry.variants,
        reelPlacements: structuredClone(
          mode.reelPlacements.main ?? geometry.reelPlacements,
        ),
        backgroundNodes: structuredClone(mode.backgroundNodes),
        nodeStates: { ...mode.nodeStates },
        symbols: mode.symbolPackage
          ? {
              packageId: mode.symbolPackage,
              reelSet: latest.symbolPackages![mode.symbolPackage]!.reelSet,
              renderMode:
                latest.symbolPackages![mode.symbolPackage]!.renderMode,
            }
          : latest.symbolPackage
            ? {
                packageId: latest.symbolPackage.manifest.split("/").at(-2)!,
                reelSet: latest.symbolPackage.reelSet,
                renderMode: latest.symbolPackage.renderMode,
              }
            : null,
        awardCelebrationPopupId: mode.awardCelebrationPopup ?? null,
        primaryActionTargetMode: mode.primaryAction?.targetMode ?? null,
      };
    }),
  };
  for (const mode of project.gameModes.modes) {
    activateEditorGameMode(project, mode.id);
    for (const variant of activeVariantIds(project))
      updateVariantFocusOffsetsFromRect(project, variant);
  }
  activateEditorGameMode(project, latest.gameModes.initialMode);
  return project;
}

export function cloneEditorProject(project: EditorProject): EditorProject {
  const clone = {
    ...structuredClone({
      ...project,
      resources: undefined,
      assets: undefined,
      symbolDependencies: undefined,
      popupDependencies: undefined,
      registeredSpinePopupIds: undefined,
      runtimeResourceBindings: undefined,
    }),
    resources: new Map(
      [...project.resources].map(([id, resource]) => [
        id,
        structuredClone(resource),
      ]),
    ),
    assets: new Map(
      [...project.assets].map(([path, bytes]) => [path, bytes.slice()]),
    ),
    symbolDependencies: new Map(
      [...project.symbolDependencies].map(([id, dependency]) => [
        id,
        structuredClone(dependency),
      ]),
    ),
    popupDependencies: new Map(
      [...project.popupDependencies].map(([id, dependency]) => [
        id,
        structuredClone(dependency),
      ]),
    ),
    registeredSpinePopupIds: new Set(project.registeredSpinePopupIds),
    runtimeResourceBindings: new Map(project.runtimeResourceBindings),
  } as EditorProject;
  activateEditorGameMode(clone, clone.gameModes.activeModeId);
  return clone;
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

export function resolveEditorReelTopLeft(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
): { x: number; y: number } {
  const placement = project.reel.placements[variantId];
  if (!placement) throw new Error(`main reel 缺少 ${variantId} placement。`);
  if (project.coordinateOrigin === "top-left")
    return { x: placement.x, y: placement.y };
  const artSize = project.variants[variantId].artSize;
  const size = calculateReelSize(project);
  return {
    x: artSize.width / 2 + placement.x - size.width / 2,
    y: artSize.height / 2 + placement.y - size.height / 2,
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

function createEmptyModeGeometry(mode: EditorMode): {
  variants: EditorProject["variants"];
  reelPlacements: EditorProject["reel"]["placements"];
  backgroundNodes: Partial<Record<SceneLayoutVariantId, string>>;
} {
  const variants = {
    default: createEmptyVariant(),
    landscape: createEmptyVariant(),
    portrait: createEmptyVariant(),
  };
  const reelPlacements =
    mode === "maximized-focus"
      ? { default: { x: 0, y: 0 } }
      : {
          landscape: { x: 0, y: 0 },
          portrait: { x: 0, y: 0 },
        };
  const backgroundNodes =
    mode === "maximized-focus"
      ? { default: "" }
      : { landscape: "", portrait: "" };
  return { variants, reelPlacements, backgroundNodes };
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

function toOrientationVariant(
  variant: EditorVariantDraft,
  backgroundNode: string,
) {
  const margin = variant.minFocusMargin;
  const hasMargin = Object.values(margin).some((value) => value !== 0);
  return {
    artSize: variant.artSize,
    focusRect: variant.focusRect,
    frameFocusRect: variant.frameFocusRect,
    ...(hasMargin ? { minFocusMargin: margin } : {}),
    backgroundNode,
  };
}

function toOrientationVariantV2(variant: EditorVariantDraft) {
  const { backgroundNode: _backgroundNode, ...result } = toOrientationVariant(
    variant,
    "",
  );
  return result;
}

function editorGeometryFromLatestMode(mode: SceneLayoutGameModeV2): {
  variants: EditorProject["variants"];
  reelPlacements: EditorProject["reel"]["placements"];
} {
  const variants = {
    default: createEmptyVariant(),
    landscape: createEmptyVariant(),
    portrait: createEmptyVariant(),
  };
  if (mode.adaptation.mode === "maximized-focus") {
    variants.default = {
      ...createEmptyVariant(),
      artSize: { ...mode.adaptation.artSize },
      focusRect: { ...mode.adaptation.focusRect },
      frameFocusRect: {
        width: mode.adaptation.focusRect.width,
        height: mode.adaptation.focusRect.height,
      },
      backgroundNode: mode.backgroundNodes.default ?? "",
    };
  } else {
    variants.landscape = fromOrientationVariant({
      ...mode.adaptation.variants.landscape,
      backgroundNode: mode.backgroundNodes.landscape ?? "",
    });
    variants.portrait = fromOrientationVariant({
      ...mode.adaptation.variants.portrait,
      backgroundNode: mode.backgroundNodes.portrait ?? "",
    });
  }
  return {
    variants,
    reelPlacements: createEmptyModeGeometry(mode.adaptation.mode)
      .reelPlacements,
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
    const mapped = !resource.manifest.includes("/");
    const directory = mapped
      ? ""
      : resource.manifest.slice(0, resource.manifest.lastIndexOf("/"));
    const assetPaths = collectImageStringAssetPaths(manifest).map((path) =>
      mapped ? path : `${directory}/${path}`,
    );
    return {
      kind: "image-string",
      manifestPath: resource.manifest,
      manifest,
      assetPaths,
    };
  }
  if (resource.kind === "vni") {
    const project = assertVNIProject(
      parseJsonBytes(assets.get(resource.project), resource.project),
    );
    if (project.exportProfile?.purpose !== "runtime")
      throw new Error(
        `导入 VNI project 必须声明 runtime exportProfile：${resource.project}`,
      );
    const mapped = !resource.project.includes("/");
    const directory = mapped
      ? ""
      : resource.project.slice(0, resource.project.lastIndexOf("/"));
    return {
      kind: "vni",
      projectPath: resource.project,
      project,
      assetPaths: project.assets.map((asset) =>
        mapped ? asset.path : `${directory}/${asset.path}`,
      ),
    };
  }
  const skeletonBytes = assets.get(resource.skeleton);
  if (!skeletonBytes)
    throw new Error(`导入缺少 skeleton：${resource.skeleton}`);
  const metadata = readEditorSpineMetadata(skeletonBytes);
  return {
    kind: "spine",
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: { ...resource.textures },
    animationNames: metadata.animationNames,
    animationEvents: metadata.animationEvents,
    ...(metadata.bounds ? { bounds: metadata.bounds } : {}),
  };
}

function editorResourceToRuntimeSpec(
  resource: EditorLayoutResource,
): SceneLayoutRuntimeResourceSpec {
  if (resource.kind === "image")
    return { kind: "image", path: resource.path, size: resource.size };
  if (resource.kind === "image-string")
    return { kind: "image-string", manifest: resource.manifestPath };
  if (resource.kind === "vni")
    return { kind: "vni", project: resource.projectPath };
  if (resource.kind === "video")
    return { kind: "video", path: resource.path, mimeType: "video/mp4" };
  return {
    kind: "spine",
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: resource.textures,
  };
}

function manifestRuntimeResourceToEditorResource(
  resource: SceneLayoutRuntimeResourceSpec,
  assets: ReadonlyMap<string, Uint8Array>,
  videoMetadata: ReadonlyMap<
    string,
    {
      readonly width: number;
      readonly height: number;
      readonly durationSeconds: number;
      readonly hasAudio: boolean | "unknown";
    }
  >,
): EditorLayoutResourceDraft {
  if (resource.kind === "video") {
    const metadata = videoMetadata.get(resource.path);
    if (!metadata)
      throw new Error(`导入程序 video 缺少浏览器 metadata：${resource.path}`);
    return {
      kind: "video",
      path: resource.path,
      mimeType: "video/mp4",
      size: { width: metadata.width, height: metadata.height },
      durationSeconds: metadata.durationSeconds,
      hasAudio: metadata.hasAudio,
    };
  }
  if (resource.kind === "spine")
    return manifestResourceToEditorResource(
      { ...resource, defaultAnimation: "__runtime__", loop: true },
      assets,
    );
  if (resource.kind === "image-string")
    return manifestResourceToEditorResource(
      {
        ...resource,
        text: "",
        anchor: { x: 0.5, y: 0.5 },
      },
      assets,
    );
  if (resource.kind === "vni")
    return manifestResourceToEditorResource(
      { ...resource, loop: true },
      assets,
    );
  return manifestResourceToEditorResource(resource, assets);
}

function collectMappedPopupKeys(
  manifest: ReturnType<typeof parsePopupManifest>,
  assets: ReadonlyMap<string, Uint8Array>,
  mapped: boolean,
  prefix: string,
): readonly string[] {
  const virtual = new Map<string, Uint8Array>();
  for (const [path, bytes] of assets) {
    if (mapped) virtual.set(path, bytes);
    else if (path.startsWith(prefix))
      virtual.set(path.slice(prefix.length), bytes);
  }
  return collectMappedPopupAssetKeys({ manifest, files: virtual });
}

function requiredAsset(
  bytes: Uint8Array | undefined,
  path: string,
): Uint8Array {
  if (!bytes) throw new Error(`导入资源闭包缺少 bytes：${path}`);
  return bytes.slice();
}

export function validateEditorSpinePlayback(
  playback: EditorSpinePlaybackDraft,
  animationNames: readonly string[],
  nodeId = "node",
): void {
  if (playback.kind !== "loop")
    throw new Error(`Spine 节点 ${nodeId} playback 类型无效。`);
  const available = new Set(animationNames);
  if (!available.has(playback.animation))
    throw new Error(
      `Spine 节点 ${nodeId} 的 animation ${playback.animation} 不存在。`,
    );
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
