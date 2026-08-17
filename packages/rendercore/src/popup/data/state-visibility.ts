import type {
  AwardPopupLayerV5,
  AwardPopupLayerV6,
  AwardTierId,
  PopupManifest,
  PopupManifestV5,
  PopupManifestV6,
  PopupOverlayLayer,
  PopupSegment,
  PopupVisibilityState,
  SpinePopupOverlayLayerV5,
  SpinePopupOverlayLayerV6,
} from "./types.js";

export const POPUP_SEGMENTS = Object.freeze([
  "start",
  "loop",
  "end",
] as const satisfies readonly PopupSegment[]);

export const AWARD_POPUP_STATES = Object.freeze([
  "base",
  "standard",
  "bigwin",
  "superwin",
  "megawin",
] as const satisfies readonly AwardTierId[]);

export function popupVisibilityStates(
  type: PopupManifest["type"],
): readonly PopupVisibilityState[] {
  return type === "award-celebration" ? AWARD_POPUP_STATES : POPUP_SEGMENTS;
}

export function migrateLegacyPopupSegments<State extends PopupVisibilityState>(
  segments: readonly PopupSegment[],
  target: readonly State[],
): readonly State[] {
  if (!segments.length)
    throw new Error("legacy popup segments must be non-empty.");
  const selected = POPUP_SEGMENTS.map((segment) => segments.includes(segment));
  if (selected.every(Boolean)) return Object.freeze([...target]);
  const migrated = target.filter((_, index) => selected[index]);
  if (!migrated.length)
    throw new Error(
      "legacy popup segment migration produced no visible state.",
    );
  return Object.freeze(migrated);
}

export function upgradePopupManifestToV5(
  manifest: PopupManifest,
): PopupManifestV5 {
  if (manifest.version === 5) return manifest;
  if (manifest.version >= 6)
    throw new Error(
      `popup manifest v${manifest.version} cannot be downgraded to v5.`,
    );
  const attachment = (layer: {
    readonly attachment?: unknown;
    readonly parent?: unknown;
  }) => layer.attachment ?? layer.parent ?? { kind: "popup-root" as const };
  const modern = manifest.version !== 1;
  const common = {
    version: 5 as const,
    kind: "popup" as const,
    id: manifest.id,
    name: modern ? manifest.name : manifest.id,
    adaptation: modern
      ? manifest.adaptation
      : {
          mode: "maximized-focus" as const,
          focus: {
            left: manifest.designViewport.width / 2,
            right: manifest.designViewport.width / 2,
            top: manifest.designViewport.height / 2,
            bottom: manifest.designViewport.height / 2,
          },
        },
    resources: manifest.resources,
  };
  if (manifest.type === "spine") {
    const states = POPUP_SEGMENTS;
    const overlays: SpinePopupOverlayLayerV5[] = (
      manifest.spine.overlays ?? []
    ).map((layer) => {
      const legacy =
        "visibleSegments" in layer && layer.visibleSegments
          ? layer.visibleSegments
          : POPUP_SEGMENTS;
      const {
        visibleSegments: _segments,
        parent: _parent,
        ...rest
      } = layer as any;
      return {
        ...rest,
        alpha: layer.alpha ?? 1,
        attachment: attachment(layer),
        visibleStates: migrateLegacyPopupSegments(legacy, states),
      } as SpinePopupOverlayLayerV5;
    });
    const prompt = manifest.spine.prompt;
    if (prompt) {
      if (
        overlays.some(
          (layer) =>
            layer.id === "prompt" ||
            layer.order === prompt.order ||
            ((layer.kind === "text" || layer.kind === "image-string") &&
              layer.name === "prompt"),
        )
      )
        throw new Error(
          "legacy popup prompt conflicts with overlay id/name/order.",
        );
      overlays.push({
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
        },
        visibleStates: ["start", "loop"],
      });
      overlays.sort((left, right) => left.order - right.order);
    }
    return Object.freeze({
      ...common,
      type: "spine" as const,
      backdrop: {
        ...(modern
          ? manifest.backdrop
          : { enabled: false, color: "#000000", alpha: 0.5 }),
        visibleStates: states,
      },
      spine: {
        resource: manifest.spine.resource,
        transform: manifest.spine.transform,
        playback: manifest.spine.playback,
        ...(overlays.length ? { overlays: Object.freeze(overlays) } : {}),
      },
    });
  }
  const states = AWARD_POPUP_STATES;
  const upgradeTier = (tier: {
    readonly countDurationSeconds: number;
    readonly layers: readonly any[];
  }) => ({
    countDurationSeconds: tier.countDurationSeconds,
    layers: Object.freeze(
      tier.layers.map((layer) => {
        const legacy = layer.visibleSegments ?? POPUP_SEGMENTS;
        const { visibleSegments: _segments, parent: _parent, ...rest } = layer;
        return {
          ...rest,
          alpha: layer.alpha ?? 1,
          attachment: attachment(layer),
          visibleStates: migrateLegacyPopupSegments(legacy, states),
        } as AwardPopupLayerV5;
      }),
    ),
  });
  return Object.freeze({
    ...common,
    type: "award-celebration" as const,
    backdrop: {
      ...(modern
        ? manifest.backdrop
        : { enabled: false, color: "#000000", alpha: 0.5 }),
      visibleStates: states,
    },
    amountFormat: manifest.amountFormat,
    awardCelebration: {
      base: upgradeTier(manifest.awardCelebration.base),
      standard: upgradeTier(manifest.awardCelebration.standard),
      celebrationTiers: Object.freeze(
        manifest.awardCelebration.celebrationTiers.map((tier) => ({
          id: tier.id,
          thresholdMultiplier: tier.thresholdMultiplier,
          ...upgradeTier(tier),
        })),
      ),
    },
  });
}

export function upgradePopupManifestToV6(
  manifest: PopupManifest,
): PopupManifestV6 {
  if (manifest.version === 6) return manifest;
  if (manifest.version === 7)
    throw new Error("popup manifest v7 cannot be downgraded to v6.");
  const legacy = upgradePopupManifestToV5(manifest);
  if (legacy.type === "spine")
    return Object.freeze({
      ...legacy,
      version: 6 as const,
      spine: {
        ...legacy.spine,
        ...(legacy.spine.overlays
          ? {
              overlays: Object.freeze(
                legacy.spine.overlays.map(
                  (layer) => structuredClone(layer) as SpinePopupOverlayLayerV6,
                ),
              ),
            }
          : {}),
      },
    });

  const allLegacyTiers = [
    legacy.awardCelebration.base,
    legacy.awardCelebration.standard,
    ...legacy.awardCelebration.celebrationTiers,
  ];
  const identities = new Map<string, string>([
    [
      "win-amount",
      JSON.stringify({
        kind: "image-string",
        name: "win-amount",
        binding: "win-amount",
      }),
    ],
  ]);
  const allocatedIds = new Set([
    "win-amount",
    ...allLegacyTiers.flatMap(({ layers }) => layers.map(({ id }) => id)),
  ]);
  const upgradeTier = (
    state: AwardTierId,
    tier: {
      readonly countDurationSeconds: number;
      readonly layers: readonly AwardPopupLayerV5[];
    },
  ) => {
    const idMap = new Map<string, string>();
    const candidates = tier.layers.map((layer) => {
      const preferred =
        layer.kind === "image-string" && layer.binding === "win-amount"
          ? "win-amount"
          : layer.id;
      const signature = layerIdentitySignature(layer);
      const existing = identities.get(preferred);
      const id =
        existing === undefined || existing === signature
          ? preferred
          : allocateStateLayerId(preferred, state, allocatedIds);
      identities.set(id, signature);
      allocatedIds.add(id);
      idMap.set(layer.id, id);
      const {
        visibleStates: _visibleStates,
        visibleSegments: _visibleSegments,
        ...rest
      } = layer as AwardPopupLayerV5 & { readonly visibleSegments?: unknown };
      return { ...rest, id } as AwardPopupLayerV6;
    });
    const layers = candidates
      .map((layer) => ({
        ...layer,
        attachment: rewriteAttachmentIds(layer.attachment, idMap),
      }))
      .sort((left, right) => left.order - right.order);
    return Object.freeze({
      countDurationSeconds: tier.countDurationSeconds,
      layers: Object.freeze(layers),
    });
  };
  return Object.freeze({
    ...legacy,
    version: 6 as const,
    awardCelebration: {
      base: upgradeTier("base", legacy.awardCelebration.base),
      standard: upgradeTier("standard", legacy.awardCelebration.standard),
      celebrationTiers: Object.freeze(
        legacy.awardCelebration.celebrationTiers.map((tier) => ({
          id: tier.id,
          thresholdMultiplier: tier.thresholdMultiplier,
          ...upgradeTier(tier.id, tier),
        })),
      ),
    },
  });
}

function layerIdentitySignature(layer: AwardPopupLayerV5): string {
  return JSON.stringify({
    kind: layer.kind,
    ...((layer.kind === "text" || layer.kind === "image-string") && layer.name
      ? { name: layer.name }
      : {}),
    ...(layer.kind === "image-string" ? { binding: layer.binding } : {}),
  });
}

function allocateStateLayerId(
  preferred: string,
  state: AwardTierId,
  allocated: ReadonlySet<string>,
): string {
  const base = `${preferred}-${state}`;
  if (!allocated.has(base)) return base;
  for (let suffix = 2; ; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!allocated.has(candidate)) return candidate;
  }
}

function rewriteAttachmentIds(
  attachment: AwardPopupLayerV6["attachment"],
  ids: ReadonlyMap<string, string>,
): AwardPopupLayerV6["attachment"] {
  if (attachment.kind === "vni-text-layer")
    return {
      ...attachment,
      vniLayerId: ids.get(attachment.vniLayerId) ?? attachment.vniLayerId,
    };
  if (attachment.kind === "spine-slot" && attachment.target.kind === "layer")
    return {
      ...attachment,
      target: {
        ...attachment.target,
        layerId:
          ids.get(attachment.target.layerId) ?? attachment.target.layerId,
      },
    };
  return attachment;
}

export function popupLayerVisibleInState(
  manifest: PopupManifest,
  layer: { readonly visibleStates?: readonly PopupVisibilityState[] },
  state: PopupVisibilityState,
): boolean {
  return !layer.visibleStates || layer.visibleStates.includes(state);
}
