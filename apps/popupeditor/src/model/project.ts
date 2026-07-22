import {
  parsePopupManifest,
  type AwardTierId,
  type PopupAmountFormat,
  type PopupLayer,
  type PopupManifestV1,
  type PopupResourceSpec,
} from "@slotclientengine/rendercore/popup";
import type { EditorAssetEntry } from "@slotclientengine/editorresource";

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
export interface PopupEditorProject {
  id: string;
  designViewport: { width: number; height: number };
  amountFormat: PopupAmountFormat;
  resources: Map<string, PopupEditorResource>;
  assets: Map<string, EditorAssetEntry>;
  tiers: Map<AwardTierId, PopupEditorTier>;
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
  };
}

export function clonePopupEditorProject(
  project: PopupEditorProject,
): PopupEditorProject {
  return {
    ...project,
    designViewport: { ...project.designViewport },
    amountFormat: { ...project.amountFormat },
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

export function addLayer(
  project: PopupEditorProject,
  tierId: AwardTierId,
  resourceKey: string,
): void {
  const resource = project.resources.get(resourceKey);
  const tier = project.tiers.get(tierId);
  if (!resource || !tier) throw new Error("resource/tier 不存在。");
  const existingAmount = tier.layers.find(
    (layer) => layer.kind === "image-string",
  );
  if (resource.kind === "image-string" && existingAmount) {
    tier.layers = tier.layers.map((layer) =>
      layer === existingAmount
        ? {
            ...existingAmount,
            resource: resourceKey,
          }
        : layer,
    );
    return;
  }
  const order = tier.layers.length
    ? Math.max(...tier.layers.map((layer) => layer.order)) + 1
    : 0;
  const base = {
    id: `layer-${tierId}-${order}`,
    order,
    resource: resourceKey,
    transform: { x: 0, y: 0, scale: 1 },
  };
  let layer: PopupLayer;
  if (resource.kind === "image-string")
    layer = {
      ...base,
      kind: "image-string",
      binding: "win-amount",
      anchor: { x: 0.5, y: 0.5 },
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
          .layers.some((layer) => layer.kind === "image-string")
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
    const errors: string[] = [];
    try {
      projectToManifest(this.#project);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    listener(this.#project, Object.freeze(errors));
  }
}
