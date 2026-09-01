import {
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutJsonData,
  parseSceneLayoutManifestV7,
  upgradeSceneLayoutManifestToLatest,
  type SceneLayoutManifest,
  type SceneLayoutManifestLatest,
  type SceneLayoutGameModeV7,
  type SceneLayoutEventAudioV1,
  type SceneLayoutNode,
  type SceneLayoutRuntimeResourceSpec,
  type SceneLayoutVariantId,
} from "@slotclientengine/rendercore/scene-layout/data";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "@slotclientengine/rendercore/image-string/data";
import {
  collectSymbolPackageEntryPaths,
  parseSymbolPackageManifest,
} from "@slotclientengine/rendercore/symbol/data";
import {
  collectMappedPopupAssetKeys,
  collectPopupPackagePaths,
  parsePopupManifest,
  type PopupManifest,
} from "@slotclientengine/rendercore/popup/editor";
import { assertVNIProject } from "@slotclientengine/vnicore/data";
import type { AudioMediaType } from "@slotclientengine/audiocore/data";
import {
  editorResourcePaths,
  editorResourceSignature,
  readEditorSpineMetadata,
  type EditorImageLayoutResource,
  type EditorAudioLayoutResource,
  type EditorImageStringLayoutResource,
  type EditorJsonLayoutResource,
  type EditorLayoutResource,
  type EditorSpineLayoutResource,
  type EditorVniLayoutResource,
  type EditorVideoLayoutResource,
} from "./editor-resource.js";
import { inspectEditorWorkspaceRuntimeEventCatalog } from "./editor-runtime-event-catalog.js";
import { assertCanonicalEditorNodeId } from "./node-id.js";

type EditorLayoutResourceDraft =
  | Omit<EditorImageLayoutResource, "id">
  | Omit<EditorAudioLayoutResource, "id">
  | Omit<EditorSpineLayoutResource, "id">
  | Omit<EditorImageStringLayoutResource, "id">
  | Omit<EditorVniLayoutResource, "id">
  | Omit<EditorJsonLayoutResource, "id">
  | Omit<EditorVideoLayoutResource, "id">;

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
  x: number;
  y: number;
  /** Positive values expand outwards from the corresponding main edge. */
  focusOffsets: EditorFocusOffsets;
  minFocusMargin: { left: number; right: number; top: number; bottom: number };
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
  /** Missing means every game mode; entries select exact mode/orientation contexts. */
  scope?: Readonly<Record<string, readonly ("landscape" | "portrait")[]>>;
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
  mainEnabled: boolean;
  mainVariants: Record<"landscape" | "portrait", EditorVariantDraft>;
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
  nodes: EditorNodeDraft[];
  reel: {
    order: number | null;
    columns: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
    gapX: number;
    gapY: number;
  };
  resources: Map<string, EditorLayoutResource>;
  assets: Map<string, Uint8Array>;
  symbolDependencies: Map<string, EditorSymbolPackageDependency>;
  popupDependencies: Map<string, EditorPopupDependency>;
  programmaticPopupIds: Set<string>;
  runtimeResourceBindings: Map<string, string>;
  eventAudio: SceneLayoutEventAudioV1;
  gameModes: {
    activeModeId: string;
    initialMode: string;
    modes: EditorGameModeDraft[];
    transitions: EditorGameModeTransitionDraft[];
  };
}

export function activeVariantIds(
  _project?: unknown,
): readonly SceneLayoutVariantId[] {
  return ordinaryLayerVariantIds;
}

export const ordinaryLayerVariantIds = Object.freeze([
  "landscape",
  "portrait",
] as const satisfies readonly SceneLayoutVariantId[]);

export function createNewEditorProject(_legacyMode?: unknown): EditorProject {
  const project: EditorProject = {
    id: "new-layout",
    nodes: [],
    reel: {
      order: DEFAULT_REEL_ORDER,
      columns: DEFAULT_REEL_COLUMNS,
      rows: DEFAULT_REEL_ROWS,
      cellWidth: DEFAULT_REEL_CELL_SIZE,
      cellHeight: DEFAULT_REEL_CELL_SIZE,
      gapX: 0,
      gapY: 0,
    },
    resources: new Map(),
    assets: new Map(),
    symbolDependencies: new Map(),
    popupDependencies: new Map(),
    programmaticPopupIds: new Set(),
    runtimeResourceBindings: new Map(),
    eventAudio: { version: 1, ignoreLegacyAudio: true, bindings: [] },
    gameModes: {
      activeModeId: "BaseGame",
      initialMode: "BaseGame",
      transitions: [],
      modes: [
        {
          id: "BaseGame",
          mainEnabled: true,
          mainVariants: createEmptyMainVariants(),
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
  _splashMode?: unknown,
  _baseGameMode?: unknown,
): EditorProject {
  const project = createNewEditorProject();
  const splash = createEditorGameModeDraft("Splash", false);
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
}

export function createEditorGameModeDraft(
  id: string,
  mainEnabled = true,
): EditorGameModeDraft {
  return {
    id,
    mainEnabled,
    mainVariants: createEmptyMainVariants(),
    nodeStates: {},
    symbols: null,
    awardCelebrationPopupId: null,
    primaryActionTargetMode: null,
  };
}

export function resetVariantGeometry(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
): void {
  activeEditorGameMode(project).mainVariants[orientationVariant(variantId)] =
    createEmptyVariant();
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
  if (
    resource.kind === "video" ||
    resource.kind === "audio" ||
    resource.kind === "json"
  )
    throw new Error(
      `${resource.kind} 资源 ${resource.id} 不能创建 scene node。`,
    );
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
): SceneLayoutManifestLatest | null {
  try {
    const manifest = editorProjectToManifest(project);
    const visualRuntimeResources = Object.fromEntries(
      Object.entries(manifest.runtimeResources ?? {}).filter(
        ([, resource]) => resource.kind !== "json" && resource.kind !== "audio",
      ),
    );
    const visualManifest = {
      ...manifest,
      runtimeResources:
        Object.keys(visualRuntimeResources).length > 0
          ? visualRuntimeResources
          : undefined,
    };
    const previewDraft = includeSymbolPackage
      ? visualManifest
      : {
          ...visualManifest,
          symbolPackage: undefined,
          symbolPackages: undefined,
          gameModes: {
            ...manifest.gameModes,
            modes: manifest.gameModes.modes.map(
              ({ symbolPackage: _symbolPackage, ...mode }) => mode,
            ),
          },
        };
    return parseSceneLayoutManifestV7({
      ...previewDraft,
      runtimeAllocation: createSceneLayoutRuntimeAllocation(previewDraft),
    });
  } catch {
    return null;
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
  const base = {
    version: 7 as const,
    kind: "scene-layout" as const,
    id: project.id,
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
    nodes: project.nodes.map((node) => ({
      id: node.id,
      order: node.order,
      resource: resolveEditorNodeResource(project, node),
      placements: structuredClone(node.placements),
      ...(node.scope ? { scope: structuredClone(node.scope) } : {}),
    })),
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
              reel: "main" as const,
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
      for (const id of project.programmaticPopupIds) referenced.add(id);
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
        main: {
          enabled: mode.mainEnabled,
          variants: {
            landscape: editorMainVariant(project, mode, "landscape"),
            portrait: editorMainVariant(project, mode, "portrait"),
          },
        },
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
    audio: emptyLegacyAudioCatalog(),
    eventAudio: canonicalEditorEventAudio(project),
    runtimeAllocation: undefined as never,
  };
  const latestDraft = {
    ...base,
    version: 7 as const,
    nodes: project.nodes.map((node) => ({
      id: node.id,
      order: node.order,
      resource: resolveEditorNodeResource(project, node),
      placements: structuredClone(node.placements),
      ...(base.nodes.find((candidate) => candidate.id === node.id)?.scope
        ? {
            scope: base.nodes.find((candidate) => candidate.id === node.id)!
              .scope,
          }
        : {}),
    })),
    audio: emptyLegacyAudioCatalog(),
    eventAudio: canonicalEditorEventAudio(project),
    gameModes: base.gameModes,
  } satisfies SceneLayoutManifestLatest;
  const runtimeAllocation = createSceneLayoutRuntimeAllocation(latestDraft);
  if (runtimeAllocation.version !== 3)
    throw new Error("Scene Layout v7 必须生成 runtimeAllocation v3。");
  const manifest = parseSceneLayoutManifestV7({
    ...latestDraft,
    runtimeAllocation,
  });
  if (manifest.eventAudio.bindings.length > 0) {
    const catalog = inspectEditorWorkspaceRuntimeEventCatalog({
      manifest,
      workspaceFiles: project.assets,
    });
    const available = new Set(
      catalog.entries.map(({ descriptor }) => descriptor.address),
    );
    for (const binding of manifest.eventAudio.bindings) {
      if (!available.has(binding.event))
        throw new Error(`Event audio 播放 event 不存在：${binding.event}`);
      if (binding.endEvent && !available.has(binding.endEvent))
        throw new Error(`Event audio 结束 event 不存在：${binding.endEvent}`);
    }
  }
  return manifest;
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
  if (
    latest.nodes.some(
      (node) =>
        node.resource.kind === "spine" && "stateMachine" in node.resource,
    ) ||
    latest.gameModes.modes.some(
      (mode) => Object.keys(mode.nodeStates).length > 0,
    )
  )
    throw new Error(
      "旧 state-machine 主状态转场无法自动迁移：缺少可确定的 switch event；请拆分稳定背景并在“转场”Tab 重新配置。",
    );
  const project = createNewEditorProject();
  project.id = latest.id;
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
        : resourceDraft.kind === "audio"
          ? resourceDraft.path
          : resourceDraft.kind === "spine"
            ? resourceDraft.skeleton
            : resourceDraft.kind === "json"
              ? resourceDraft.path
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
    latest.runtimeResources ?? {},
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
      ...(node.scope ? { scope: structuredClone(node.scope) } : {}),
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
  const reel = latest.main;
  project.reel = {
    order: reel.order ?? null,
    columns: reel.columns,
    rows: reel.rows,
    cellWidth: reel.cellSize.width,
    cellHeight: reel.cellSize.height,
    gapX: reel.gap.x,
    gapY: reel.gap.y,
  };
  project.assets = new Map(
    [...assets].map(([path, bytes]) => [path, bytes.slice()]),
  );
  project.eventAudio = {
    ...structuredClone(latest.eventAudio),
    ignoreLegacyAudio: true,
  };
  const retainedAudioPaths = new Set(
    project.eventAudio.bindings.flatMap(({ audio }) =>
      audio.asset.sources.map(({ path }) => path),
    ),
  );
  for (const resource of Object.values(latest.runtimeResources ?? {}))
    if (resource.kind === "audio") retainedAudioPaths.add(resource.path);
  const legacyAudioPaths = new Set(
    [...latest.audio.music, ...latest.audio.effects].flatMap((binding) =>
      binding.asset.sources.map(({ path }) => path),
    ),
  );
  for (const path of legacyAudioPaths)
    if (!retainedAudioPaths.has(path)) project.assets.delete(path);
  for (const binding of project.eventAudio.bindings.map(({ audio }) => audio)) {
    for (const source of binding.asset.sources) {
      requiredAsset(assets.get(source.path), source.path);
      registerResource({
        kind: "audio",
        path: source.path,
        mediaType: source.mediaType,
      });
    }
  }
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
    const usedAsAward = latest.gameModes.modes.some(
      (mode) => mode.awardCelebrationPopup === id,
    );
    if (!usedAsPrelude && !usedAsAward) project.programmaticPopupIds.add(id);
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
      return {
        id: mode.id,
        mainEnabled: mode.main.enabled,
        mainVariants: {
          landscape: fromCenteredMainVariant(
            project,
            mode.main.variants.landscape,
          ),
          portrait: fromCenteredMainVariant(
            project,
            mode.main.variants.portrait,
          ),
        },
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
  activateEditorGameMode(project, latest.gameModes.initialMode);
  editorProjectToManifest(project);
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
      programmaticPopupIds: undefined,
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
    programmaticPopupIds: new Set(project.programmaticPopupIds),
    runtimeResourceBindings: new Map(project.runtimeResourceBindings),
  } as EditorProject;
  activateEditorGameMode(clone, clone.gameModes.activeModeId);
  return clone;
}

export function calculateReelSize(project: Pick<EditorProject, "reel">): {
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

export function calculateEditorFocusRect(
  project: Pick<EditorProject, "reel">,
  variant: Pick<EditorVariantDraft, "x" | "y" | "focusOffsets">,
): { x: number; y: number; width: number; height: number } {
  const mainSize = calculateReelSize(project);
  const mainLeft = variant.x - mainSize.width / 2;
  const mainTop = variant.y - mainSize.height / 2;
  return {
    x: mainLeft - variant.focusOffsets.left,
    y: mainTop - variant.focusOffsets.top,
    width:
      mainSize.width + variant.focusOffsets.left + variant.focusOffsets.right,
    height:
      mainSize.height + variant.focusOffsets.top + variant.focusOffsets.bottom,
  };
}

export function resolveEditorReelTopLeft(
  project: EditorProject,
  variantId: SceneLayoutVariantId,
): { x: number; y: number } {
  const variant =
    activeEditorGameMode(project).mainVariants[orientationVariant(variantId)];
  const size = calculateReelSize(project);
  return {
    x: variant.x - size.width / 2,
    y: variant.y - size.height / 2,
  };
}

function createEmptyVariant(): EditorVariantDraft {
  return {
    x: 0,
    y: 0,
    focusOffsets: {
      left: DEFAULT_FOCUS_PADDING,
      top: DEFAULT_FOCUS_PADDING,
      right: DEFAULT_FOCUS_PADDING,
      bottom: DEFAULT_FOCUS_PADDING,
    },
    minFocusMargin: { left: 0, right: 0, top: 0, bottom: 0 },
  };
}

function editorMainVariant(
  project: EditorProject,
  mode: EditorGameModeDraft,
  orientation: "landscape" | "portrait",
) {
  const variant = mode.mainVariants[orientation];
  const hasMargin = Object.values(variant.minFocusMargin).some(
    (value) => value !== 0,
  );
  return {
    x: variant.x,
    y: variant.y,
    focusRect: calculateEditorFocusRect(project, variant),
    ...(hasMargin
      ? { minFocusMargin: structuredClone(variant.minFocusMargin) }
      : {}),
  };
}

function fromCenteredMainVariant(
  project: Pick<EditorProject, "reel">,
  variant: SceneLayoutGameModeV7["main"]["variants"]["landscape"],
): EditorVariantDraft {
  const mainSize = calculateReelSize(project);
  const mainLeft = variant.x - mainSize.width / 2;
  const mainTop = variant.y - mainSize.height / 2;
  return {
    x: variant.x,
    y: variant.y,
    focusOffsets: {
      left: mainLeft - variant.focusRect.x,
      top: mainTop - variant.focusRect.y,
      right:
        variant.focusRect.x +
        variant.focusRect.width -
        (mainLeft + mainSize.width),
      bottom:
        variant.focusRect.y +
        variant.focusRect.height -
        (mainTop + mainSize.height),
    },
    minFocusMargin: {
      left: variant.minFocusMargin?.left ?? 0,
      right: variant.minFocusMargin?.right ?? 0,
      top: variant.minFocusMargin?.top ?? 0,
      bottom: variant.minFocusMargin?.bottom ?? 0,
    },
  };
}

function createEmptyMainVariants(): EditorGameModeDraft["mainVariants"] {
  return {
    landscape: createEmptyVariant(),
    portrait: createEmptyVariant(),
  };
}

function activeEditorGameMode(project: EditorProject): EditorGameModeDraft {
  const mode = project.gameModes.modes.find(
    (candidate) => candidate.id === project.gameModes.activeModeId,
  );
  if (!mode) throw new Error(`未知游戏模式：${project.gameModes.activeModeId}`);
  return mode;
}

function orientationVariant(
  variantId: SceneLayoutVariantId,
): "landscape" | "portrait" {
  if (variantId !== "landscape" && variantId !== "portrait")
    throw new Error(`Scene Layout v7 不支持 variant：${variantId}`);
  return variantId;
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
  if (resource.kind === "json") return { kind: "json", path: resource.path };
  if (resource.kind === "image-string")
    return { kind: "image-string", manifest: resource.manifestPath };
  if (resource.kind === "vni")
    return { kind: "vni", project: resource.projectPath };
  if (resource.kind === "video")
    return { kind: "video", path: resource.path, mimeType: "video/mp4" };
  if (resource.kind === "audio")
    return {
      kind: "audio",
      path: resource.path,
      mediaType: resource.mediaType,
    };
  return {
    kind: "spine",
    skeleton: resource.skeleton,
    atlas: resource.atlas,
    textures: resource.textures,
  };
}

function emptyLegacyAudioCatalog() {
  return {
    version: 1 as const,
    effects: [],
    music: [],
    programmaticEffects: [],
  };
}

function canonicalEditorEventAudio(
  project: EditorProject,
): SceneLayoutEventAudioV1 {
  assertEditorAudioSources(
    project,
    project.eventAudio.bindings.map(({ audio }) => audio),
  );
  return {
    ...structuredClone(project.eventAudio),
    ignoreLegacyAudio: true,
  };
}

function assertEditorAudioSources(
  project: EditorProject,
  bindings: readonly {
    readonly name: string;
    readonly asset: {
      readonly sources: readonly {
        readonly path: string;
        readonly mediaType: AudioMediaType;
      }[];
    };
  }[],
): void {
  for (const binding of bindings) {
    for (const source of binding.asset.sources) {
      const resource = [...project.resources.values()].find(
        (candidate): candidate is EditorAudioLayoutResource =>
          candidate.kind === "audio" && candidate.path === source.path,
      );
      if (!resource)
        throw new Error(
          `audio binding ${binding.name} 引用了未知 asset：${source.path}`,
        );
      if (resource.mediaType !== source.mediaType)
        throw new Error(
          `audio binding ${binding.name} media type 与 asset 不一致：${source.path}`,
        );
      if (!project.assets.has(source.path))
        throw new Error(`audio asset 缺少 bytes：${source.path}`);
    }
  }
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
  if (resource.kind === "audio")
    return {
      kind: "audio",
      path: resource.path,
      mediaType: resource.mediaType,
    };
  if (resource.kind === "json") {
    const value = parseSceneLayoutJsonData(
      requiredAsset(assets.get(resource.path), resource.path),
      resource.path,
    );
    return {
      kind: "json",
      path: resource.path,
      rootKind: Array.isArray(value) ? "array" : "object",
    };
  }
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
