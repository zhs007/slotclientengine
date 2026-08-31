import {
  parsePopupManifest,
  AWARD_POPUP_STATES,
  POPUP_SEGMENTS,
  migrateLegacyPopupSegments,
  resolvePopupLayerAttachment,
  validatePopupLayerAttachmentGraph,
  type AwardTierId,
  type PopupAmountFormat,
  type PopupLayer,
  type PopupManifest,
  type PopupOverlayLayer,
  type PopupResourceSpec,
  type SingleStatePopupLayerV9,
  type PopupVisibilityState,
} from "@slotclientengine/rendercore/popup/editor";
import { validateOfficialSpineResource } from "@slotclientengine/rendercore";
import type { EditorAssetEntry } from "@slotclientengine/editorresource";
import { assertVNIProject } from "@slotclientengine/vnicore/data";

export interface PopupEditorResource {
  readonly rootKey: string;
  readonly kind: PopupResourceSpec["kind"];
  readonly spec: PopupResourceSpec;
  readonly keys: readonly string[];
}
export interface PopupEditorTier {
  countDurationSeconds: number;
  layers: PopupLayer[];
  thresholdMultiplier?: number;
}
export interface PopupEditorTierBindingSuggestion {
  readonly tierId: AwardTierId;
  readonly countDurationSeconds: number;
  readonly playback: {
    readonly loopStartTime: number;
    readonly loopEndTime: number;
    readonly keepParticlesAlive: boolean;
  };
}
export interface PopupVniTextLayerTarget {
  readonly vniLayerId: string;
  readonly textLayerId: string;
  readonly textLayerName: string;
}
export interface PopupSpineAttachmentTarget {
  readonly key: "main-spine" | string;
  readonly label: string;
  readonly slotNames: readonly string[];
}
export interface PopupEditorProject {
  formatVersion: 9;
  name: string;
  type: "award-celebration" | "spine" | "single-state";
  id: string;
  adaptation: {
    focus: { left: number; right: number; top: number; bottom: number };
  };
  backdrop: {
    enabled: boolean;
    color: string;
    alpha: number;
    visibleStates: PopupVisibilityState[];
  };
  amountFormat: PopupAmountFormat;
  resources: Map<string, PopupEditorResource>;
  assets: Map<string, EditorAssetEntry>;
  tiers: Map<AwardTierId, PopupEditorTier>;
  spine: {
    resource: string | null;
    transform: { x: number; y: number; scale: number };
    playback: {
      startAnimation: string;
      loopAnimation: string;
      endAnimation: string;
    };
    prompt: {
      enabled: boolean;
      font: string | null;
      defaultText: string;
      fill: string;
      order: number;
      area: { x: number; y: number; width: number; height: number };
    };
    overlays: PopupOverlayLayer[];
  };
  singleState: {
    layers: SingleStatePopupLayerV9[];
  };
}

export type PopupAmountFormatPresetId = "integer" | "decimal";
export const POPUP_AMOUNT_FORMAT_PRESETS: Readonly<
  Record<PopupAmountFormatPresetId, PopupAmountFormat>
> = Object.freeze({
  integer: Object.freeze({
    rawScale: 1,
    fractionDigits: 0,
    useGrouping: false,
    groupSeparator: ",",
    decimalSeparator: ".",
    prefix: "",
    suffix: "",
    rounding: "floor",
  }),
  decimal: Object.freeze({
    rawScale: 100,
    fractionDigits: 2,
    useGrouping: false,
    groupSeparator: ",",
    decimalSeparator: ".",
    prefix: "",
    suffix: "",
    rounding: "floor",
  }),
});

export function popupEditorVisibilityStates(
  type: PopupEditorProject["type"],
): readonly PopupVisibilityState[] {
  return type === "award-celebration"
    ? AWARD_POPUP_STATES
    : type === "single-state"
      ? (["active"] as const)
      : POPUP_SEGMENTS;
}

export function migratePopupEditorVisibility(
  project: PopupEditorProject,
  legacy = true,
): void {
  const states = popupEditorVisibilityStates(project.type);
  if (legacy) project.backdrop.visibleStates = [...states];
  const layers =
    project.type === "award-celebration"
      ? [...project.tiers.values()].flatMap(({ layers }) => layers)
      : project.type === "single-state"
        ? project.singleState.layers
        : project.spine.overlays;
  for (const layer of layers) {
    if (project.type === "award-celebration") {
      delete (layer as { visibleStates?: unknown }).visibleStates;
      delete (layer as { visibleSegments?: unknown }).visibleSegments;
      continue;
    }
    if (project.type === "single-state") continue;
    if (!legacy && "visibleStates" in layer && layer.visibleStates) continue;
    const legacySegments =
      "visibleSegments" in layer && layer.visibleSegments
        ? layer.visibleSegments
        : POPUP_SEGMENTS;
    (layer as { visibleStates?: PopupVisibilityState[] }).visibleStates = [
      ...migrateLegacyPopupSegments(legacySegments, states as readonly any[]),
    ];
    delete (layer as { visibleSegments?: unknown }).visibleSegments;
  }
}

export function createPopupAmountFormat(
  presetId: PopupAmountFormatPresetId,
): PopupAmountFormat {
  return { ...POPUP_AMOUNT_FORMAT_PRESETS[presetId] };
}

export function detectPopupAmountFormatPreset(
  format: PopupAmountFormat,
): PopupAmountFormatPresetId | "custom" {
  for (const presetId of ["integer", "decimal"] as const) {
    const preset = POPUP_AMOUNT_FORMAT_PRESETS[presetId];
    if (
      (Object.keys(preset) as (keyof PopupAmountFormat)[]).every(
        (key) => format[key] === preset[key],
      )
    )
      return presetId;
  }
  return "custom";
}

export function createPopupEditorProject(
  options: {
    readonly name?: string;
    readonly id?: string;
    readonly type?: "award-celebration" | "spine" | "single-state";
  } = {},
): PopupEditorProject {
  const empty = (): PopupEditorTier => ({
    countDurationSeconds: 1.5,
    layers: [],
  });
  return {
    formatVersion: 9,
    name: options.name ?? "Untitled Popup",
    type: options.type ?? "award-celebration",
    id: options.id ?? "untitled-popup",
    adaptation: {
      focus: { left: 540, right: 540, top: 960, bottom: 960 },
    },
    backdrop: {
      enabled: true,
      color: "#000000",
      alpha: 0.5,
      visibleStates: [
        ...popupEditorVisibilityStates(options.type ?? "award-celebration"),
      ],
    },
    amountFormat: createPopupAmountFormat("integer"),
    resources: new Map(),
    assets: new Map(),
    tiers: new Map([
      ["base", empty()],
      ["standard", { ...empty(), countDurationSeconds: 3 }],
      [
        "bigwin",
        { ...empty(), countDurationSeconds: 2.9, thresholdMultiplier: 15 },
      ],
      [
        "superwin",
        { ...empty(), countDurationSeconds: 2.9, thresholdMultiplier: 25 },
      ],
      [
        "megawin",
        { ...empty(), countDurationSeconds: 2.9, thresholdMultiplier: 50 },
      ],
    ]),
    spine: {
      resource: null,
      transform: { x: 0, y: 0, scale: 1 },
      playback: {
        startAnimation: "",
        loopAnimation: "",
        endAnimation: "",
      },
      prompt: {
        enabled: false,
        font: null,
        defaultText: "Press any key to continue",
        fill: "#ffffff",
        order: 100,
        area: { x: 0, y: 500, width: 800, height: 80 },
      },
      overlays: [],
    },
    singleState: { layers: [] },
  };
}

export function clonePopupEditorProject(
  project: PopupEditorProject,
): PopupEditorProject {
  return {
    ...project,
    adaptation: structuredClone(project.adaptation),
    backdrop: {
      ...project.backdrop,
      visibleStates: [...project.backdrop.visibleStates],
    },
    amountFormat: { ...project.amountFormat },
    spine: structuredClone(project.spine),
    singleState: structuredClone(project.singleState),
    resources: new Map(
      [...project.resources].map(([id, resource]) => [
        id,
        {
          ...resource,
          spec: structuredClone(resource.spec),
          keys: [...resource.keys],
        },
      ]),
    ),
    assets: new Map(
      [...project.assets].map(([key, asset]) => [
        key,
        { ...asset, bytes: asset.bytes.slice() },
      ]),
    ),
    tiers: new Map(
      [...project.tiers].map(([id, tier]) => [
        id,
        { ...tier, layers: structuredClone(tier.layers) },
      ]),
    ),
  };
}

export function projectToManifest(project: PopupEditorProject): PopupManifest {
  const common = {
    version: 9 as const,
    kind: "popup" as const,
    id: project.id,
    name: project.name,
    adaptation: {
      mode: "maximized-focus" as const,
      focus: { ...project.adaptation.focus },
    },
    backdrop: {
      ...project.backdrop,
      visibleStates: [...project.backdrop.visibleStates] as any,
    },
    audio: { version: 1 as const, effects: [], cues: [] },
  };
  const canonicalLayer = <T extends PopupLayer>(layer: T) => {
    const {
      parent: _parent,
      visibleSegments: _segments,
      visibleStates: _states,
      ...rest
    } = layer as T & {
      parent?: unknown;
      visibleSegments?: unknown;
      visibleStates?: unknown;
    };
    return {
      ...rest,
      alpha: layer.alpha ?? 1,
      attachment: resolvePopupLayerAttachment(layer),
    };
  };
  const canonicalOverlay = <T extends PopupOverlayLayer>(layer: T) => {
    const { visibleSegments: _segments, ...rest } = layer as any;
    return {
      ...rest,
      alpha: layer.alpha ?? 1,
      attachment: resolvePopupLayerAttachment(layer),
      visibleStates: [...(layer.visibleStates ?? POPUP_SEGMENTS)] as any,
    };
  };
  if (project.type === "single-state") {
    const used = new Set(
      project.singleState.layers.flatMap(({ resource }) =>
        resource ? [resource] : [],
      ),
    );
    return parsePopupManifest({
      ...common,
      type: "single-state",
      resources: Object.fromEntries(
        [...used].sort().map((id) => {
          const resource = project.resources.get(id);
          if (!resource)
            throw new Error(`single-state layer 引用缺失 resource：${id}`);
          return [id, resource.spec];
        }),
      ),
      singleState: {
        layers: structuredClone(project.singleState.layers),
      },
    });
  }
  if (project.type === "spine") {
    if (project.spine.prompt.enabled)
      throw new Error(
        "v9 项目不能导出 legacy prompt；请先迁移为命名的字体文字 overlay。",
      );
    const resourceKey = project.spine.resource;
    if (!resourceKey)
      throw new Error("普通 Spine Popup 尚未绑定 Spine resource。");
    const resource = project.resources.get(resourceKey);
    if (!resource || resource.kind !== "spine")
      throw new Error(`普通 Spine Popup resource 无效：${resourceKey}`);
    return parsePopupManifest({
      ...common,
      type: "spine",
      resources: Object.fromEntries(
        [
          resourceKey,
          ...project.spine.overlays.flatMap(({ resource }) =>
            resource ? [resource] : [],
          ),
        ].map((id) => {
          const selected = project.resources.get(id);
          if (!selected)
            throw new Error(`普通 Spine Popup resource 缺失：${id}`);
          return [id, selected.spec];
        }),
      ),
      spine: {
        resource: resourceKey,
        transform: project.spine.transform,
        playback: {
          mode: "segmented-animations",
          ...project.spine.playback,
        },
        ...(project.spine.overlays.length
          ? { overlays: project.spine.overlays.map(canonicalOverlay) }
          : {}),
      },
    });
  }
  const used = new Set<string>();
  for (const tier of project.tiers.values())
    for (const layer of tier.layers)
      if (layer.resource) used.add(layer.resource);
  const resources = Object.fromEntries(
    [...used].sort().map((id) => {
      const resource = project.resources.get(id);
      if (!resource) throw new Error(`layer 引用缺失 resource：${id}`);
      return [id, resource.spec];
    }),
  );
  const tier = (id: AwardTierId) => {
    const value = project.tiers.get(id);
    if (!value) throw new Error(`缺失 tier：${id}`);
    return {
      countDurationSeconds: value.countDurationSeconds,
      layers: value.layers.map(canonicalLayer),
    };
  };
  return parsePopupManifest({
    ...common,
    type: "award-celebration",
    amountFormat: project.amountFormat,
    resources,
    awardCelebration: {
      base: tier("base"),
      standard: tier("standard"),
      celebrationTiers: (["bigwin", "superwin", "megawin"] as const).map(
        (id) => ({
          id,
          thresholdMultiplier: project.tiers.get(id)!.thresholdMultiplier,
          ...tier(id),
        }),
      ),
    },
  });
}

export function migratePopupPromptToTextLayer(
  project: PopupEditorProject,
): boolean {
  if (!project.spine.prompt.enabled) return false;
  if (
    project.spine.overlays.some(
      (layer) =>
        layer.id === "prompt" ||
        ((layer.kind === "text" || layer.kind === "image-string") &&
          layer.name === "prompt") ||
        layer.order === project.spine.prompt.order,
    )
  )
    throw new Error(
      "legacy prompt 无法迁移：overlay id/name=prompt 或 order 已被占用。",
    );
  const prompt = project.spine.prompt;
  project.spine.overlays.push({
    id: "prompt",
    kind: "text",
    name: "prompt",
    defaultText: prompt.defaultText,
    order: prompt.order,
    ...(prompt.font ? { resource: prompt.font } : {}),
    transform: {
      x: prompt.area.x,
      y: prompt.area.y,
      scale: 1,
      rotation: 0,
    },
    alpha: 1,
    attachment: { kind: "popup-root" },
    anchor: { x: 0.5, y: 0.5 },
    style: {
      fontSize: prompt.area.height,
      letterSpacing: 0,
      fill: { kind: "solid", color: prompt.fill },
      arcDegrees: 0,
      widthRange: { minWidth: 0, maxWidth: 0 },
    },
    visibleStates: ["start", "loop"],
  });
  project.spine.prompt.enabled = false;
  project.spine.prompt.font = null;
  return true;
}

export function popupEditorProjectDiagnostics(
  project: PopupEditorProject,
): readonly string[] {
  try {
    validatePopupEditorAttachments(project);
  } catch (error) {
    return Object.freeze([
      error instanceof Error ? error.message : String(error),
    ]);
  }
  if (project.type === "spine") {
    try {
      projectToManifest(project);
      return Object.freeze([]);
    } catch (error) {
      return Object.freeze([
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }
  if (project.type === "single-state") {
    try {
      projectToManifest(project);
      return Object.freeze([]);
    } catch (error) {
      return Object.freeze([
        error instanceof Error ? error.message : String(error),
      ]);
    }
  }
  const incompleteTiers = (
    ["base", "standard", "bigwin", "superwin", "megawin"] as const
  ).filter((tierId) => !project.tiers.get(tierId)?.layers.length);
  if (incompleteTiers.length)
    return Object.freeze([
      `项目尚未完成：${incompleteTiers.join("、")} 档位尚未添加图层。资源导入已独立保存；请在“档位”页显式绑定资源。`,
    ]);
  const amountResources = new Set(
    [...project.tiers.values()]
      .flatMap(({ layers }) => layers)
      .filter(
        (layer): layer is Extract<PopupLayer, { kind: "image-string" }> =>
          layer.kind === "image-string" && layer.binding === "win-amount",
      )
      .map(({ resource }) => resource),
  );
  if (amountResources.size !== 1)
    return Object.freeze([
      "获奖庆祝模板必须让五档共享同一个 win-amount ImgNumber 资源。",
    ]);
  const missingVni = (["bigwin", "superwin", "megawin"] as const).filter(
    (tierId) =>
      !project.tiers.get(tierId)?.layers.some((layer) => layer.kind === "vni"),
  );
  if (missingVni.length)
    return Object.freeze([
      `获奖庆祝模板缺少必需 VNI：${missingVni.join("、")}。`,
    ]);
  try {
    projectToManifest(project);
    for (const [tierId, tier] of project.tiers) {
      const amount = tier.layers.find(
        (layer): layer is Extract<PopupLayer, { kind: "image-string" }> =>
          layer.kind === "image-string" && layer.binding === "win-amount",
      );
      if (!amount) continue;
      const amountParent = resolvePopupLayerAttachment(amount);
      if (amountParent.kind !== "vni-text-layer") continue;
      const matches = getPopupVniTextLayerTargets(project, tierId).some(
        (target) =>
          target.vniLayerId === amountParent.vniLayerId &&
          target.textLayerId === amountParent.textLayerId,
      );
      if (!matches)
        throw new Error(
          `${tierId} ImgNumber parent 引用的 VNI 文字层不存在：${amountParent.vniLayerId}/${amountParent.textLayerId}。`,
        );
    }
    return Object.freeze([]);
  } catch (error) {
    return Object.freeze([
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

export function getPopupVniTextLayerTargets(
  project: PopupEditorProject,
  tierId: AwardTierId | "single-state",
): readonly PopupVniTextLayerTarget[] {
  const layers =
    tierId === "single-state"
      ? project.singleState.layers
      : project.tiers.get(tierId)?.layers;
  if (!layers) throw new Error(`tier 不存在：${tierId}`);
  const targets: PopupVniTextLayerTarget[] = [];
  for (const layer of layers) {
    if (layer.kind !== "vni") continue;
    if (!layer.resource)
      throw new Error(`VNI layer 缺少 resource：${layer.id}`);
    const resource = project.resources.get(layer.resource);
    if (resource?.spec.kind !== "vni")
      throw new Error(`VNI layer resource 无效：${layer.id}`);
    const bytes = project.assets.get(resource.spec.project)?.bytes;
    if (!bytes)
      throw new Error(`VNI project bytes 缺失：${resource.spec.project}`);
    const projectConfig = assertVNIProject(
      JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
    );
    for (const textLayer of projectConfig.layers)
      if (textLayer.type === "text")
        targets.push(
          Object.freeze({
            vniLayerId: layer.id,
            textLayerId: textLayer.id,
            textLayerName: textLayer.name,
          }),
        );
  }
  return Object.freeze(targets);
}

export function addSingleStateLayer(
  project: PopupEditorProject,
  resourceKey: string,
): void {
  const resource = project.resources.get(resourceKey);
  if (!resource) throw new Error(`resource 不存在：${resourceKey}`);
  const layers = project.singleState.layers;
  const order = layers.length
    ? Math.max(...layers.map((layer) => layer.order)) + 1
    : 0;
  const id = allocateSingleStateLayerId(project, resource.kind);
  const base = {
    id,
    order,
    resource: resourceKey,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    alpha: 1,
    attachment: { kind: "popup-root" as const },
  };
  const layer: SingleStatePopupLayerV9 =
    resource.kind === "image-string"
      ? {
          ...base,
          kind: "image-string",
          defaultText: "0",
          anchor: { x: 0.5, y: 0.5 },
        }
      : resource.kind === "font"
        ? {
            ...base,
            kind: "text",
            defaultText: "TEXT",
            anchor: { x: 0.5, y: 0.5 },
            style: defaultPopupTextStyle(),
          }
        : resource.kind === "image"
          ? { ...base, kind: "image", anchor: { x: 0.5, y: 0.5 } }
          : resource.kind === "vni"
            ? { ...base, kind: "vni" }
            : { ...base, kind: "spine" };
  project.singleState.layers = [...layers, layer];
}

export function addSingleStateTextLayer(project: PopupEditorProject): void {
  const layers = project.singleState.layers;
  const order = layers.length
    ? Math.max(...layers.map((layer) => layer.order)) + 1
    : 0;
  const id = allocateSingleStateLayerId(project, "text");
  project.singleState.layers = [
    ...layers,
    {
      id,
      kind: "text",
      defaultText: "TEXT",
      order,
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      alpha: 1,
      attachment: { kind: "popup-root" },
      anchor: { x: 0.5, y: 0.5 },
      style: defaultPopupTextStyle(),
    },
  ];
}

export function renameSingleStateLayer(
  project: PopupEditorProject,
  previousId: string,
  nextId: string,
): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(nextId))
    throw new Error("single-state 图层 name 必须是 lowercase kebab-case。");
  if (
    previousId !== nextId &&
    project.singleState.layers.some(({ id }) => id === nextId)
  )
    throw new Error(`single-state 图层 name 重复：${nextId}`);
  const target = project.singleState.layers.find(({ id }) => id === previousId);
  if (!target) throw new Error(`single-state 图层不存在：${previousId}`);
  (target as { id: string }).id = nextId;
  for (const layer of project.singleState.layers) {
    const attachment = layer.attachment;
    if (
      attachment.kind === "spine-slot" &&
      attachment.target.kind === "layer" &&
      attachment.target.layerId === previousId
    )
      (attachment.target as { layerId: string }).layerId = nextId;
    if (
      attachment.kind === "vni-text-layer" &&
      attachment.vniLayerId === previousId
    )
      (attachment as { vniLayerId: string }).vniLayerId = nextId;
  }
}

function allocateSingleStateLayerId(
  project: PopupEditorProject,
  kind: PopupResourceSpec["kind"] | "text",
): string {
  const stem = kind === "image-string" ? "imgnumber" : kind;
  const used = new Set(project.singleState.layers.map(({ id }) => id));
  for (let index = 0; ; index += 1) {
    const candidate = `${stem}-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

function defaultPopupTextStyle() {
  return {
    fontSize: 72,
    letterSpacing: 0,
    fill: { kind: "solid" as const, color: "#ffffff" },
    stroke: { color: "#000000", width: 4 },
    shadow: {
      color: "#000000",
      alpha: 0.5,
      blur: 4,
      distance: 6,
      angleDegrees: 90,
    },
    arcDegrees: 0,
    widthRange: { minWidth: 0, maxWidth: 0 },
  };
}

export function addLayer(
  project: PopupEditorProject,
  tierId: AwardTierId,
  resourceKey: string,
): void {
  const resource = project.resources.get(resourceKey);
  const tier = project.tiers.get(tierId);
  if (!resource || !tier) throw new Error("resource/tier 不存在。");
  const existingAmount = tier.layers.find(
    (layer) => layer.kind === "image-string" && layer.binding === "win-amount",
  );
  const order = tier.layers.length
    ? Math.max(...tier.layers.map((layer) => layer.order)) + 1
    : 0;
  const base = {
    id: allocateAwardLayerId(project),
    order,
    resource: resourceKey,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
    alpha: 1,
    attachment: { kind: "popup-root" as const },
  };
  let layer: PopupLayer;
  if (resource.kind === "image-string" && !existingAmount)
    layer = {
      ...base,
      id: "win-amount",
      kind: "image-string",
      name: "win-amount",
      binding: "win-amount",
      anchor: { x: 0.5, y: 0.5 },
      parent: { kind: "popup-root" },
    };
  else if (resource.kind === "image-string")
    layer = {
      ...base,
      kind: "image-string",
      name: `imgnumber-${order}`,
      binding: "manual",
      defaultText: "0",
      anchor: { x: 0.5, y: 0.5 },
      parent: { kind: "popup-root" },
    };
  else if (resource.kind === "font")
    layer = {
      ...base,
      kind: "text",
      name: `text-${order}`,
      defaultText: "CONGRATULATIONS!",
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 72,
        letterSpacing: 0,
        fill: { kind: "solid", color: "#ffffff" },
        stroke: { color: "#a40000", width: 6 },
        shadow: {
          color: "#000000",
          alpha: 0.65,
          blur: 4,
          distance: 6,
          angleDegrees: 90,
        },
        arcDegrees: 0,
        widthRange: { minWidth: 0, maxWidth: 0 },
      },
    };
  else if (resource.kind === "image")
    layer = {
      ...base,
      kind: "image",
      anchor: { x: 0.5, y: 0.5 },
    };
  else if (resource.kind === "vni")
    layer = {
      ...base,
      kind: "vni",
      playback: {
        mode: "segmented",
        loopStartTime: 1,
        loopEndTime: 2.5,
        keepParticlesAlive: true,
      },
    };
  else
    layer = {
      ...base,
      kind: "spine",
      playback: {
        mode: "segmented-animations",
        startAnimation: "Start",
        loopAnimation: "Loop",
        endAnimation: "End",
      },
    };
  tier.layers = [...tier.layers, layer];
}

export function addAwardTextLayer(
  project: PopupEditorProject,
  tierId: AwardTierId,
): void {
  const tier = project.tiers.get(tierId);
  if (!tier) throw new Error(`tier 不存在：${tierId}`);
  const id = allocateAwardLayerId(project);
  const order = tier.layers.length
    ? Math.max(...tier.layers.map((layer) => layer.order)) + 1
    : 0;
  tier.layers = [
    ...tier.layers,
    {
      id,
      kind: "text",
      name: id,
      defaultText: "TEXT",
      order,
      alpha: 1,
      attachment: { kind: "popup-root" },
      transform: { x: 0, y: 0, scale: 1, rotation: 0 },
      anchor: { x: 0.5, y: 0.5 },
      style: {
        fontSize: 72,
        letterSpacing: 0,
        fill: { kind: "solid", color: "#ffffff" },
        stroke: { color: "#000000", width: 4 },
        shadow: {
          color: "#000000",
          alpha: 0.5,
          blur: 4,
          distance: 6,
          angleDegrees: 90,
        },
        arcDegrees: 0,
        widthRange: { minWidth: 0, maxWidth: 0 },
      },
    },
  ];
}

export function reuseAwardLayerInTier(
  project: PopupEditorProject,
  tierId: AwardTierId,
  layerId: string,
): void {
  const tier = project.tiers.get(tierId);
  if (!tier) throw new Error(`tier 不存在：${tierId}`);
  if (tier.layers.some(({ id }) => id === layerId))
    throw new Error(`${tierId} 已包含逻辑图层：${layerId}`);
  const source = [...project.tiers.values()]
    .flatMap(({ layers }) => layers)
    .find(({ id }) => id === layerId);
  if (!source) throw new Error(`逻辑图层不存在：${layerId}`);
  if (
    source.kind === "image-string" &&
    source.binding === "win-amount" &&
    tier.layers.some(
      (layer) =>
        layer.kind === "image-string" && layer.binding === "win-amount",
    )
  )
    throw new Error(`${tierId} 已包含 win-amount。`);
  const order = tier.layers.length
    ? Math.max(...tier.layers.map((layer) => layer.order)) + 1
    : 0;
  tier.layers = [
    ...tier.layers,
    { ...structuredClone(source), order } as PopupLayer,
  ];
}

function allocateAwardLayerId(project: PopupEditorProject): string {
  const used = new Set(
    [...project.tiers.values()].flatMap(({ layers }) =>
      layers.map(({ id }) => id),
    ),
  );
  for (let index = 0; ; index += 1) {
    const candidate = `layer-${index}`;
    if (!used.has(candidate)) return candidate;
  }
}

export function getPopupSpineAttachmentTargets(
  project: PopupEditorProject,
  options:
    | { readonly kind: "award"; readonly tierId: AwardTierId }
    | { readonly kind: "spine-popup" }
    | { readonly kind: "single-state" },
): readonly PopupSpineAttachmentTarget[] {
  const targets: PopupSpineAttachmentTarget[] = [];
  if (options.kind === "spine-popup" && project.spine.resource)
    targets.push(
      Object.freeze({
        key: "main-spine",
        label: "主 Spine",
        slotNames: popupSpineSlotNames(project, project.spine.resource),
      }),
    );
  const layers =
    options.kind === "award"
      ? (project.tiers.get(options.tierId)?.layers ?? [])
      : options.kind === "single-state"
        ? project.singleState.layers
        : project.spine.overlays;
  for (const layer of layers) {
    if (layer.kind !== "spine" || !layer.resource) continue;
    targets.push(
      Object.freeze({
        key: layer.id,
        label: `Spine 图层：${layer.id}`,
        slotNames: popupSpineSlotNames(project, layer.resource),
      }),
    );
  }
  return Object.freeze(targets);
}

export function assertPopupLayerCanDelete(
  layers: readonly (PopupLayer | PopupOverlayLayer | SingleStatePopupLayerV9)[],
  layerId: string,
): void {
  const dependents = layers
    .filter((layer) => {
      const attachment = resolvePopupLayerAttachment(layer);
      return (
        (attachment.kind === "spine-slot" &&
          attachment.target.kind === "layer" &&
          attachment.target.layerId === layerId) ||
        (attachment.kind === "vni-text-layer" &&
          attachment.vniLayerId === layerId)
      );
    })
    .map(({ id }) => id);
  if (dependents.length)
    throw new Error(
      `图层 ${layerId} 仍被以下图层作为父节点，禁止删除：${dependents.join("、")}。`,
    );
}

export function validatePopupEditorAttachments(
  project: PopupEditorProject,
): void {
  const validateScope = (
    layers: readonly (
      | PopupLayer
      | PopupOverlayLayer
      | SingleStatePopupLayerV9
    )[],
    label: string,
    allowMainSpine: boolean,
    getTargets: () => readonly PopupSpineAttachmentTarget[],
  ) => {
    validatePopupLayerAttachmentGraph({ layers, label, allowMainSpine });
    const targets = getTargets();
    const byKey = new Map(targets.map((target) => [target.key, target]));
    for (const layer of layers) {
      const attachment = layer.attachment;
      if (attachment?.kind !== "spine-slot") continue;
      const targetKey =
        attachment.target.kind === "main-spine"
          ? "main-spine"
          : attachment.target.layerId;
      const target = byKey.get(targetKey);
      if (!target?.slotNames.includes(attachment.slot))
        throw new Error(
          `${label} 图层 ${layer.id} 引用的 Spine slot 不存在：${targetKey}/${attachment.slot}。`,
        );
    }
  };
  if (project.type === "spine") {
    validateScope(project.spine.overlays, "spine.overlays", true, () =>
      getPopupSpineAttachmentTargets(project, { kind: "spine-popup" }),
    );
    return;
  }
  if (project.type === "single-state") {
    validateScope(project.singleState.layers, "singleState.layers", false, () =>
      getPopupSpineAttachmentTargets(project, { kind: "single-state" }),
    );
    return;
  }
  for (const [tierId, tier] of project.tiers)
    validateScope(tier.layers, `awardCelebration.${tierId}.layers`, false, () =>
      getPopupSpineAttachmentTargets(project, { kind: "award", tierId }),
    );
}

function popupSpineSlotNames(
  project: PopupEditorProject,
  resourceKey: string,
): readonly string[] {
  const resource = project.resources.get(resourceKey);
  if (!resource || resource.spec.kind !== "spine")
    throw new Error(`Spine attachment target resource 无效：${resourceKey}`);
  const skeletonBytes = project.assets.get(resource.spec.skeleton)?.bytes;
  const atlasBytes = project.assets.get(resource.spec.atlas)?.bytes;
  if (!skeletonBytes || !atlasBytes)
    throw new Error(`Spine attachment target bytes 缺失：${resourceKey}`);
  let skeleton: unknown;
  try {
    skeleton = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(skeletonBytes),
    );
  } catch (error) {
    throw new Error(
      `Spine attachment target skeleton JSON 无效：${resourceKey}：${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const atlasText = new TextDecoder("utf-8", { fatal: true }).decode(
    atlasBytes,
  );
  return validateOfficialSpineResource({
    resource: {
      skeleton,
      atlasText,
      textureUrls: Object.fromEntries(
        Object.keys(resource.spec.textures).map((page) => [
          page,
          `memory:${page}`,
        ]),
      ),
    },
    requiredAnimations: [],
  }).slotNames;
}

export function setPopupVniPlaybackMode(
  project: PopupEditorProject,
  tierId: AwardTierId,
  layerId: string,
  mode: "segmented" | "once",
): void {
  const tier = project.tiers.get(tierId);
  if (!tier) throw new Error(`Popup tier 不存在：${tierId}`);
  const layer = tier.layers.find(({ id }) => id === layerId);
  if (!layer || layer.kind !== "vni")
    throw new Error(`VNI layer 不存在：${layerId}`);
  if (layer.playback.mode === mode) return;
  tier.layers = tier.layers.map((candidate) =>
    candidate.id !== layerId
      ? candidate
      : {
          ...layer,
          playback:
            mode === "once"
              ? { mode: "once" }
              : {
                  mode: "segmented",
                  loopStartTime: 1,
                  loopEndTime: 2.5,
                  keepParticlesAlive: true,
                },
        },
  );
}

export function applyImportedResourceBindings(
  project: PopupEditorProject,
  resourceKey: string,
  suggestions: readonly PopupEditorTierBindingSuggestion[] = [],
): void {
  const resource = project.resources.get(resourceKey);
  if (!resource) throw new Error(`resource 不存在：${resourceKey}`);
  if (project.type === "single-state") {
    addSingleStateLayer(project, resourceKey);
    return;
  }
  if (resource.kind === "image-string") {
    for (const tierId of project.tiers.keys())
      if (
        !project.tiers
          .get(tierId)!
          .layers.some(
            (layer) =>
              layer.kind === "image-string" && layer.binding === "win-amount",
          )
      )
        addLayer(project, tierId, resourceKey);
    return;
  }
  for (const suggestion of suggestions) {
    addLayer(project, suggestion.tierId, resourceKey);
    const tier = project.tiers.get(suggestion.tierId)!;
    tier.countDurationSeconds = suggestion.countDurationSeconds;
    const layer = tier.layers.at(-1)!;
    if (layer.kind !== "vni")
      throw new Error("win-amount 建议绑定只能应用到 VNI resource。");
    tier.layers[tier.layers.length - 1] = {
      ...layer,
      playback: { mode: "segmented", ...suggestion.playback },
    };
  }
}

export function resourceReferenceCount(
  project: PopupEditorProject,
  resourceKey: string,
): number {
  let count = 0;
  if (project.spine.resource === resourceKey) count += 1;
  if (project.spine.prompt.enabled && project.spine.prompt.font === resourceKey)
    count += 1;
  count += project.spine.overlays.filter(
    (overlay) => overlay.resource === resourceKey,
  ).length;
  count += project.singleState.layers.filter(
    (layer) => layer.resource === resourceKey,
  ).length;
  for (const tier of project.tiers.values())
    count += tier.layers.filter(
      (layer) => layer.resource === resourceKey,
    ).length;
  return count;
}

export function removePopupResource(
  project: PopupEditorProject,
  resourceKey: string,
): void {
  if (resourceReferenceCount(project, resourceKey))
    throw new Error(`resource ${resourceKey} 仍被 layer 引用，禁止删除。`);
  const resource = project.resources.get(resourceKey);
  if (!resource) throw new Error(`resource 不存在：${resourceKey}`);
  project.resources.delete(resourceKey);
  garbageCollectResourceStorage(project);
}

export function garbageCollectResourceStorage(
  project: PopupEditorProject,
): void {
  const liveKeys = new Set(
    [...project.resources.values()].flatMap((resource) => resource.keys),
  );
  for (const key of project.assets.keys())
    if (!liveKeys.has(key)) project.assets.delete(key);
}

export class PopupEditorStore {
  #project: PopupEditorProject;
  readonly #listeners = new Set<
    (project: PopupEditorProject, errors: readonly string[]) => void
  >();
  constructor(project = createPopupEditorProject()) {
    this.#project = project;
  }
  get project() {
    return this.#project;
  }
  transact(update: (draft: PopupEditorProject) => void) {
    const draft = clonePopupEditorProject(this.#project);
    update(draft);
    this.#project = draft;
    this.emit();
  }
  replace(project: PopupEditorProject) {
    this.#project = clonePopupEditorProject(project);
    this.emit();
  }
  subscribe(
    listener: (project: PopupEditorProject, errors: readonly string[]) => void,
  ) {
    this.#listeners.add(listener);
    this.notify(listener);
    return () => this.#listeners.delete(listener);
  }
  private emit() {
    for (const listener of this.#listeners) this.notify(listener);
  }
  private notify(
    listener: (project: PopupEditorProject, errors: readonly string[]) => void,
  ) {
    listener(this.#project, popupEditorProjectDiagnostics(this.#project));
  }
}
