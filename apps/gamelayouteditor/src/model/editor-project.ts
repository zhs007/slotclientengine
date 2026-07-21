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
import {
  collectPopupPackagePaths,
  parsePopupManifest,
} from "@slotclientengine/rendercore/popup";
import { deriveNodeId } from "../io/filename-policy.js";
import {
  editorResourcePaths,
  editorResourceSignature,
  readEditorSpineMetadata,
  type EditorImageLayoutResource,
  type EditorImageStringLayoutResource,
  type EditorLayoutResource,
  type EditorSpineLayoutResource,
  type EditorVideoLayoutResource,
} from "./editor-resource.js";

type EditorLayoutResourceDraft =
  | Omit<EditorImageLayoutResource, "id">
  | Omit<EditorSpineLayoutResource, "id">
  | Omit<EditorImageStringLayoutResource, "id">
  | Omit<EditorVideoLayoutResource, "id">;

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

export type EditorSpinePlaybackDraft = {
  readonly kind: "loop";
  animation: string;
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
}

export interface EditorModeSymbolBinding {
  readonly packageId: string;
  reelSet: string;
  renderMode: "standard" | "grid-cell";
}

export interface EditorPopupDependency {
  readonly id: string;
  readonly files: ReadonlyMap<string, Uint8Array>;
  placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number; scale: number }>
  >;
}

export interface EditorGameModeDraft {
  id: string;
  backgroundNodes: Partial<Record<SceneLayoutVariantId, string>>;
  nodeStates: Record<string, string>;
  symbols: EditorModeSymbolBinding | null;
  awardCelebrationPopupId: string | null;
}

interface EditorGameModeTransitionBaseDraft {
  fromModeId: string;
  toModeId: string;
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

export type EditorGameModeTransitionDraft =
  | EditorSpineGameModeTransitionDraft
  | EditorVideoGameModeTransitionDraft;

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
  symbolDependencies: Map<string, EditorSymbolPackageDependency>;
  popupDependencies: Map<string, EditorPopupDependency>;
  gameModes: {
    initialMode: string;
    modes: EditorGameModeDraft[];
    transitions: EditorGameModeTransitionDraft[];
  };
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
    symbolDependencies: new Map(),
    popupDependencies: new Map(),
    gameModes: {
      initialMode: "BaseGame",
      transitions: [],
      modes: [
        {
          id: "BaseGame",
          backgroundNodes:
            mode === "maximized-focus"
              ? { default: "" }
              : { landscape: "", portrait: "" },
          nodeStates: {},
          symbols: null,
          awardCelebrationPopupId: null,
        },
      ],
    },
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
      reelPlacement!.x ===
        Math.round((previousSize.width - reelSize.width) / 2) &&
      reelPlacement!.y ===
        Math.round((previousSize.height - reelSize.height) / 2));

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
    const previousCenter = previousSize[dimension] / 2;
    if (
      placement[placementAxis] === 0 ||
      placement[placementAxis] === previousCenter
    ) {
      placement[placementAxis] = value / 2;
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
  if (resource.kind === "video")
    throw new Error(`video 资源 ${resource.id} 不能创建 scene node。`);
  if (node.imageString !== undefined)
    throw new Error(`Spine 节点 ${node.id} 不得声明 imageString。`);
  const playback = node.playback;
  if (!playback)
    throw new Error(`Spine 节点 ${node.id} 必须明确选择 playback。`);
  validateEditorSpinePlayback(playback, resource.animationNames, node.id);
  return {
    kind: "spine",
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: resource.textures,
    defaultAnimation: playback.animation,
    loop: true,
  };
}

export function editorProjectToPreviewManifest(
  project: EditorProject,
  preferredVariant: SceneLayoutVariantId,
  includeSymbolPackage = false,
): SceneLayoutManifestV1 | null {
  try {
    const manifest = editorProjectToManifest(project);
    if (!manifest.symbolPackages || includeSymbolPackage) return manifest;
    return parseSceneLayoutManifest({
      version: manifest.version,
      kind: manifest.kind,
      id: manifest.id,
      adaptation: manifest.adaptation,
      nodes: manifest.nodes,
      reels: manifest.reels,
      ...(manifest.popups ? { popups: manifest.popups } : {}),
      ...(manifest.gameModes
        ? {
            gameModes: {
              initialMode: manifest.gameModes.initialMode,
              modes: manifest.gameModes.modes.map((mode) => ({
                id: mode.id,
                ...(mode.backgroundNodes
                  ? { backgroundNodes: mode.backgroundNodes }
                  : {}),
                nodeStates: mode.nodeStates,
                ...(mode.awardCelebrationPopup
                  ? {
                      awardCelebrationPopup: mode.awardCelebrationPopup,
                    }
                  : {}),
              })),
              transitions: manifest.gameModes.transitions ?? [],
            },
          }
        : {}),
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
  const initialMode = project.gameModes.modes.find(
    (mode) => mode.id === project.gameModes.initialMode,
  );
  if (!initialMode)
    throw new Error(`initial 主状态不存在：${project.gameModes.initialMode}`);
  const adaptation =
    project.mode === "maximized-focus"
      ? {
          mode: "maximized-focus" as const,
          artSize: project.variants.default.artSize,
          focusRect: project.variants.default.focusRect,
          backgroundNode: initialMode.backgroundNodes.default ?? "",
        }
      : {
          mode: "orientation-focus" as const,
          variants: {
            landscape: toOrientationVariant(
              project.variants.landscape,
              initialMode.backgroundNodes.landscape ?? "",
            ),
            portrait: toOrientationVariant(
              project.variants.portrait,
              initialMode.backgroundNodes.portrait ?? "",
            ),
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
              manifest: `dependencies/symbols/${id}/symbols.package.json`,
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
                type: "award-celebration",
                manifest: `dependencies/popups/${id}/popup.manifest.json`,
                placements: dependency.placements,
              },
            ];
          }),
        ),
      };
    })(),
    gameModes: {
      initialMode: project.gameModes.initialMode,
      modes: project.gameModes.modes.map((mode) => ({
        id: mode.id,
        backgroundNodes: mode.backgroundNodes,
        nodeStates: {},
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
  manifest: SceneLayoutManifestV1,
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
  const parsed = parseSceneLayoutManifest(manifest);
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
  const project = createNewEditorProject(parsed.adaptation.mode);
  project.id = parsed.id;
  const resourceIdsBySignature = new Map<string, string>();
  const pathsByResource = new Map<string, string>();
  const registerResource = (
    resourceDraft: EditorLayoutResourceDraft,
  ): string => {
    const temporary = {
      ...resourceDraft,
      id: "imported-resource",
    } as EditorLayoutResource;
    const signature = editorResourceSignature(temporary);
    const existing = resourceIdsBySignature.get(signature);
    if (existing) return existing;
    const resourceId = uniqueResourceId(
      project.resources,
      deriveNodeId(
        (resourceDraft.kind === "image"
          ? resourceDraft.path
          : resourceDraft.kind === "spine"
            ? resourceDraft.skeleton
            : resourceDraft.kind === "video"
              ? resourceDraft.path
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
      if (owner && owner !== signature)
        throw new Error(`导入资源路径 ${path} 被不同素材签名复用。`);
      pathsByResource.set(path, signature);
    }
    project.resources.set(resourceId, resource);
    resourceIdsBySignature.set(signature, resourceId);
    return resourceId;
  };
  project.nodes = parsed.nodes.map((node) => {
    const resourceDraft = manifestResourceToEditorResource(
      node.resource,
      assets,
    );
    const resourceId = registerResource(resourceDraft);
    return {
      id: node.id,
      order: node.order,
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
  for (const transition of parsed.gameModes?.transitions ?? []) {
    const overlay = transition.overlay;
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
  const importedSymbolBindings = parsed.symbolPackage
    ? [
        [
          parsed.symbolPackage.manifest.split("/").at(-2)!,
          parsed.symbolPackage,
        ] as const,
      ]
    : Object.entries(parsed.symbolPackages ?? {});
  for (const [bindingId] of importedSymbolBindings) {
    const prefix = `dependencies/symbols/${bindingId}/`;
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
    project.symbolDependencies.set(bindingId, {
      packageId: nested.id,
      files,
    });
    for (const path of [...project.assets.keys()])
      if (path.startsWith(prefix)) project.assets.delete(path);
  }
  for (const [id, binding] of Object.entries(parsed.popups ?? {})) {
    const prefix = `dependencies/popups/${id}/`;
    const files = new Map(
      [...assets.entries()]
        .filter(([path]) => path.startsWith(prefix))
        .map(
          ([path, bytes]) =>
            [path.slice(prefix.length), bytes.slice()] as const,
        ),
    );
    const nested = parsePopupManifest(
      parseJsonBytes(files.get("popup.manifest.json"), "popup.manifest.json"),
    );
    if (nested.id !== id)
      throw new Error(`导入 Popup dependency id 不一致：${id}`);
    collectPopupPackagePaths({ manifest: nested, files });
    project.popupDependencies.set(id, {
      id,
      files,
      placements: structuredClone(binding.placements),
    });
    for (const path of [...project.assets.keys()])
      if (path.startsWith(prefix)) project.assets.delete(path);
  }
  project.gameModes = parsed.gameModes
    ? {
        initialMode: parsed.gameModes.initialMode,
        transitions: (parsed.gameModes.transitions ?? []).map((transition) => {
          const overlay = transition.overlay;
          const common = {
            fromModeId: transition.from,
            toModeId: transition.to,
            resourceId: transitionResourceIds.get(
              `${transition.from}\u0000${transition.to}`,
            )!,
          };
          return "fadeOutSeconds" in overlay
            ? {
                ...common,
                kind: "video" as const,
                fit: "contain" as const,
                fadeOutSeconds: overlay.fadeOutSeconds,
              }
            : {
                ...common,
                kind: "spine" as const,
                animation: overlay.animation,
                switchEvent: overlay.switchEvent,
                placements: structuredClone(overlay.placements),
              };
        }),
        modes: parsed.gameModes.modes.map((mode) => ({
          id: mode.id,
          backgroundNodes: structuredClone(
            mode.backgroundNodes ?? adaptationBackgroundNodes(parsed),
          ),
          nodeStates: { ...mode.nodeStates },
          symbols: mode.symbolPackage
            ? {
                packageId: mode.symbolPackage,
                reelSet: parsed.symbolPackages![mode.symbolPackage]!.reelSet,
                renderMode:
                  parsed.symbolPackages![mode.symbolPackage]!.renderMode,
              }
            : parsed.symbolPackage
              ? {
                  packageId: parsed.symbolPackage.manifest.split("/").at(-2)!,
                  reelSet: parsed.symbolPackage.reelSet,
                  renderMode: parsed.symbolPackage.renderMode,
                }
              : null,
          awardCelebrationPopupId: mode.awardCelebrationPopup ?? null,
        })),
      }
    : {
        initialMode: "BaseGame",
        transitions: [],
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: adaptationBackgroundNodes(parsed),
            nodeStates: {},
            symbols: parsed.symbolPackage
              ? {
                  packageId: parsed.symbolPackage.manifest.split("/").at(-2)!,
                  reelSet: parsed.symbolPackage.reelSet,
                  renderMode: parsed.symbolPackage.renderMode,
                }
              : null,
            awardCelebrationPopupId: null,
          },
        ],
      };
  return project;
}

export function cloneEditorProject(project: EditorProject): EditorProject {
  return {
    ...structuredClone({
      ...project,
      resources: undefined,
      assets: undefined,
      symbolDependencies: undefined,
      popupDependencies: undefined,
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
        {
          packageId: dependency.packageId,
          files: new Map(
            [...dependency.files].map(([path, bytes]) => [path, bytes.slice()]),
          ),
        },
      ]),
    ),
    popupDependencies: new Map(
      [...project.popupDependencies].map(([id, dependency]) => [
        id,
        {
          ...structuredClone({ ...dependency, files: undefined }),
          files: new Map(
            [...dependency.files].map(([path, bytes]) => [path, bytes.slice()]),
          ),
        },
      ]),
    ),
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

function adaptationBackgroundNodes(
  manifest: SceneLayoutManifestV1,
): Partial<Record<SceneLayoutVariantId, string>> {
  return manifest.adaptation.mode === "maximized-focus"
    ? { default: manifest.adaptation.backgroundNode }
    : {
        landscape: manifest.adaptation.variants.landscape.backgroundNode,
        portrait: manifest.adaptation.variants.portrait.backgroundNode,
      };
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

export function validateEditorSpinePlayback(
  playback: EditorSpinePlaybackDraft,
  animationNames: readonly string[],
  nodeId = "node",
): void {
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

function uniqueResourceId(
  resources: ReadonlyMap<string, EditorLayoutResource>,
  base: string,
): string {
  if (!resources.has(base)) return base;
  let suffix = 2;
  while (resources.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
}
