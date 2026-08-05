import {
  parsePopupManifest,
  type AwardTierId,
  type PopupAmountFormat,
  type PopupLayer,
  type PopupManifestV1,
  type PopupOverlayLayer,
  type PopupResourceSpec,
} from "@slotclientengine/rendercore/popup";
import type { EditorAssetEntry } from "@slotclientengine/editorresource";
import { assertVNIProject } from "@slotclientengine/vnicore/core";

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
export interface PopupEditorProject {
  type: "award-celebration" | "spine";
  id: string;
  designViewport: { width: number; height: number };
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

export function createPopupEditorProject(): PopupEditorProject {
  const empty = (): PopupEditorTier => ({
    countDurationSeconds: 1.5,
    layers: [],
  });
  return {
    type: "award-celebration",
    id: "award-celebration",
    designViewport: { width: 1080, height: 1920 },
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
  };
}

export function clonePopupEditorProject(
  project: PopupEditorProject,
): PopupEditorProject {
  return {
    ...project,
    designViewport: { ...project.designViewport },
    amountFormat: { ...project.amountFormat },
    spine: structuredClone(project.spine),
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

export function projectToManifest(
  project: PopupEditorProject,
): PopupManifestV1 {
  if (project.type === "spine") {
    const resourceKey = project.spine.resource;
    if (!resourceKey)
      throw new Error("普通 Spine Popup 尚未绑定 Spine resource。");
    const resource = project.resources.get(resourceKey);
    if (!resource || resource.kind !== "spine")
      throw new Error(`普通 Spine Popup resource 无效：${resourceKey}`);
    return parsePopupManifest({
      version: 1,
      kind: "popup",
      id: project.id,
      type: "spine",
      designViewport: project.designViewport,
      resources: Object.fromEntries(
        [
          resourceKey,
          ...(project.spine.prompt.enabled && project.spine.prompt.font
            ? [project.spine.prompt.font]
            : []),
          ...project.spine.overlays.map(({ resource }) => resource),
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
        ...(project.spine.prompt.enabled
          ? {
              prompt: {
                ...(project.spine.prompt.font
                  ? { font: project.spine.prompt.font }
                  : {}),
                defaultText: project.spine.prompt.defaultText,
                fill: project.spine.prompt.fill,
                order: project.spine.prompt.order,
                area: project.spine.prompt.area,
              },
            }
          : {}),
        ...(project.spine.overlays.length
          ? { overlays: project.spine.overlays }
          : {}),
      },
    });
  }
  const used = new Set<string>();
  for (const tier of project.tiers.values())
    for (const layer of tier.layers) used.add(layer.resource);
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
      layers: value.layers,
    };
  };
  return parsePopupManifest({
    version: 1,
    kind: "popup",
    id: project.id,
    type: "award-celebration",
    designViewport: project.designViewport,
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

export function popupEditorProjectDiagnostics(
  project: PopupEditorProject,
): readonly string[] {
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
  const incompleteTiers = (
    ["base", "standard", "bigwin", "superwin", "megawin"] as const
  ).filter((tierId) => !project.tiers.get(tierId)?.layers.length);
  if (incompleteTiers.length)
    return Object.freeze([
      `项目尚未完成：${incompleteTiers.join("、")} 档位尚未添加图层。资源导入已独立保存；请在“档位”页显式绑定资源。`,
    ]);
  try {
    projectToManifest(project);
    for (const [tierId, tier] of project.tiers) {
      const amount = tier.layers.find(
        (layer): layer is Extract<PopupLayer, { kind: "image-string" }> =>
          layer.kind === "image-string" && layer.binding === "win-amount",
      );
      if (!amount) continue;
      const amountParent = amount.parent;
      if (amountParent.kind === "popup-root") continue;
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
  tierId: AwardTierId,
): readonly PopupVniTextLayerTarget[] {
  const tier = project.tiers.get(tierId);
  if (!tier) throw new Error(`tier 不存在：${tierId}`);
  const targets: PopupVniTextLayerTarget[] = [];
  for (const layer of tier.layers) {
    if (layer.kind !== "vni") continue;
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
    id: `layer-${tierId}-${order}`,
    order,
    resource: resourceKey,
    transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  };
  let layer: PopupLayer;
  if (resource.kind === "image-string" && !existingAmount)
    layer = {
      ...base,
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
      visibleSegments: ["start", "loop", "end"],
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
      },
      visibleSegments: ["start", "loop", "end"],
    };
  else if (resource.kind === "image")
    layer = {
      ...base,
      kind: "image",
      anchor: { x: 0.5, y: 0.5 },
      visibleSegments: ["start", "loop", "end"],
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
