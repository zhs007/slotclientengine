import type {
  AwardPopupLayerV5,
  AwardTierId,
  PopupManifest,
  PopupManifestV5,
  PopupOverlayLayer,
  PopupSegment,
  PopupVisibilityState,
  SpinePopupOverlayLayerV5,
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

export function popupLayerVisibleInState(
  manifest: PopupManifest,
  layer: { readonly visibleStates?: readonly PopupVisibilityState[] },
  state: PopupVisibilityState,
): boolean {
  return manifest.version !== 5 || layer.visibleStates!.includes(state);
}
