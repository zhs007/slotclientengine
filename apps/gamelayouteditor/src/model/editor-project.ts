import {
  parseSceneLayoutManifest,
  type SceneLayoutManifestV1,
  type SceneLayoutNode,
  type SceneLayoutVariantId,
} from "@slotclientengine/rendercore/scene-layout";

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

export interface EditorNodeDraft {
  id: string;
  order: number;
  resource: SceneLayoutNode["resource"];
  animationNames?: string[];
  placements: Partial<
    Record<SceneLayoutVariantId, { x: number; y: number; scale: number }>
  >;
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
    columns: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
    gapX: number;
    gapY: number;
    placements: Partial<Record<SceneLayoutVariantId, { x: number; y: number }>>;
  };
  assets: Map<string, Uint8Array>;
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
    assets: new Map(),
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
  const variants =
    project.mode === "maximized-focus"
      ? (["default"] as const)
      : (["landscape", "portrait"] as const);
  for (const variantId of variants) {
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

export function editorProjectToPreviewManifest(
  project: EditorProject,
  preferredVariant: SceneLayoutVariantId,
): SceneLayoutManifestV1 | null {
  try {
    return editorProjectToManifest(project);
  } catch {
    const available = previewVariantOrder(project.mode, preferredVariant).find(
      (variantId) => project.variants[variantId].backgroundNode,
    );
    if (!available) return null;
    const variant = project.variants[available];
    const placement = project.reel.placements[available];
    if (!placement) return null;
    const nodes = project.nodes
      .filter((node) => {
        if (!node.placements[available]) return false;
        return (
          node.resource.kind === "image" ||
          node.resource.defaultAnimation.length > 0
        );
      })
      .map((node) => ({
        id: node.id,
        order: node.order,
        resource: node.resource,
        placements: { default: node.placements[available] },
      }));
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
      resource: node.resource,
      placements: node.placements,
    })),
    reels: {
      main: {
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
  });
}

export function manifestToEditorProject(
  manifest: SceneLayoutManifestV1,
  assets: ReadonlyMap<string, Uint8Array>,
): EditorProject {
  const parsed = parseSceneLayoutManifest(manifest);
  const project = createNewEditorProject(parsed.adaptation.mode);
  project.id = parsed.id;
  project.nodes = parsed.nodes.map((node) => ({
    id: node.id,
    order: node.order,
    resource: node.resource,
    ...(node.resource.kind === "spine"
      ? {
          animationNames: readAnimationNames(
            assets.get(node.resource.skeleton),
          ),
        }
      : {}),
    placements: { ...node.placements },
  }));
  const reel = parsed.reels.main;
  if (!reel) throw new Error('导入 manifest 必须包含 reel "main"。');
  project.reel = {
    columns: reel.columns,
    rows: reel.rows,
    cellWidth: reel.cellSize.width,
    cellHeight: reel.cellSize.height,
    gapX: reel.gap.x,
    gapY: reel.gap.y,
    placements: { ...reel.placements },
  };
  if (parsed.adaptation.mode === "maximized-focus") {
    project.variants.default = {
      ...createEmptyVariant(),
      artSize: { ...parsed.adaptation.artSize },
      focusRect: { ...parsed.adaptation.focusRect },
      frameFocusRect: { ...parsed.adaptation.focusRect },
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
  return project;
}

export function cloneEditorProject(project: EditorProject): EditorProject {
  return manifestLikeClone(project);
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

function calculateReelSize(project: EditorProject): {
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

function manifestLikeClone(project: EditorProject): EditorProject {
  return {
    ...structuredClone({ ...project, assets: undefined }),
    assets: new Map(
      [...project.assets].map(([path, bytes]) => [path, bytes.slice()]),
    ),
  } as EditorProject;
}

function readAnimationNames(bytes: Uint8Array | undefined): string[] {
  if (!bytes) return [];
  try {
    const skeleton = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as {
      readonly animations?: Readonly<Record<string, unknown>>;
    };
    return Object.keys(skeleton.animations ?? {});
  } catch {
    return [];
  }
}
