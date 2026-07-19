import {
  parsePopupManifest,
  type AwardTierId,
  type PopupAmountFormat,
  type PopupLayer,
  type PopupManifestV1,
  type PopupResourceSpec,
} from "@slotclientengine/rendercore/popup";

export interface PopupEditorAssetBlob {
  readonly digest: string;
  readonly extension: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly bytes: Uint8Array;
}
export interface PopupEditorResourceProvenance {
  readonly sourceNames: readonly string[];
  readonly sourceKind: "files" | "directory" | "zip" | "package-import";
  readonly batchLabel: string;
}
export interface PopupEditorLogicalResource {
  readonly id: string;
  readonly kind: PopupResourceSpec["kind"];
  readonly provenance: PopupEditorResourceProvenance;
  readonly spec: PopupResourceSpec;
  readonly paths: readonly string[];
}
export interface PopupEditorTier {
  countDurationSeconds: number;
  layers: PopupLayer[];
  thresholdMultiplier?: number;
}
export interface PopupEditorProject {
  id: string;
  designViewport: { width: number; height: number };
  amountFormat: PopupAmountFormat;
  resources: Map<string, PopupEditorLogicalResource>;
  blobs: Map<string, PopupEditorAssetBlob>;
  packageFiles: Map<string, Uint8Array>;
  tiers: Map<AwardTierId, PopupEditorTier>;
}

export function createPopupEditorProject(): PopupEditorProject {
  const empty = (): PopupEditorTier => ({
    countDurationSeconds: 1.5,
    layers: [],
  });
  return {
    id: "award-celebration",
    designViewport: { width: 1080, height: 1920 },
    amountFormat: {
      rawScale: 100,
      fractionDigits: 2,
      useGrouping: true,
      groupSeparator: ",",
      decimalSeparator: ".",
      prefix: "$",
      suffix: "",
      rounding: "floor",
    },
    resources: new Map(),
    blobs: new Map(),
    packageFiles: new Map(),
    tiers: new Map([
      ["base", empty()],
      ["standard", { ...empty(), countDurationSeconds: 3 }],
      [
        "bigwin",
        { ...empty(), countDurationSeconds: 2.9, thresholdMultiplier: 15 },
      ],
      [
        "superwin",
        { ...empty(), countDurationSeconds: 2.9, thresholdMultiplier: 30 },
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
          provenance: {
            ...resource.provenance,
            sourceNames: [...resource.provenance.sourceNames],
          },
          spec: structuredClone(resource.spec),
          paths: [...resource.paths],
        },
      ]),
    ),
    blobs: new Map(
      [...project.blobs].map(([key, blob]) => [
        key,
        { ...blob, bytes: blob.bytes.slice() },
      ]),
    ),
    packageFiles: new Map(
      [...project.packageFiles].map(([path, bytes]) => [path, bytes.slice()]),
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
  resourceId: string,
): void {
  const resource = project.resources.get(resourceId);
  const tier = project.tiers.get(tierId);
  if (!resource || !tier) throw new Error("resource/tier 不存在。");
  const order = tier.layers.length
    ? Math.max(...tier.layers.map((layer) => layer.order)) + 1
    : 0;
  const base = {
    id: `${resourceId}-${order}`,
    order,
    resource: resourceId,
    transform: { x: 0, y: 0, scale: 1 },
  };
  let layer: PopupLayer;
  if (resource.kind === "image-string")
    layer = {
      ...base,
      kind: "image-string",
      binding: "win-amount",
      anchor: { x: 0.5, y: 0.5 },
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

export function resourceReferenceCount(
  project: PopupEditorProject,
  resourceId: string,
): number {
  let count = 0;
  for (const tier of project.tiers.values())
    count += tier.layers.filter(
      (layer) => layer.resource === resourceId,
    ).length;
  return count;
}

export function removeLogicalResource(
  project: PopupEditorProject,
  resourceId: string,
): void {
  if (resourceReferenceCount(project, resourceId))
    throw new Error(`resource ${resourceId} 仍被 layer 引用，禁止删除。`);
  const resource = project.resources.get(resourceId);
  if (!resource) throw new Error(`resource 不存在：${resourceId}`);
  project.resources.delete(resourceId);
  garbageCollectResourceStorage(project);
}

export function garbageCollectResourceStorage(
  project: PopupEditorProject,
): void {
  const livePaths = new Set(
    [...project.resources.values()].flatMap((resource) => resource.paths),
  );
  for (const path of project.packageFiles.keys())
    if (!livePaths.has(path)) project.packageFiles.delete(path);
  const liveBlobKeys = new Set(
    [...livePaths].map((path) => path.split("/").at(-1)!),
  );
  for (const key of project.blobs.keys())
    if (!liveBlobKeys.has(key)) project.blobs.delete(key);
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
