import { parsePopupManifest } from "./manifest.js";
import { upgradePopupManifestToV6 } from "./state-visibility.js";
import type {
  PopupManifest,
  PopupManifestV8,
  PopupManifestV9,
} from "./types.js";

export const LATEST_POPUP_MANIFEST_VERSION = 9 as const;
export type LatestPopupManifest = PopupManifestV9;

export interface LoadedPopupManifest {
  readonly sourceVersion: PopupManifest["version"];
  readonly manifest: LatestPopupManifest;
}

/** Strictly parses any supported source version and normalizes it to latest. */
export function loadPopupManifest(value: unknown): LoadedPopupManifest {
  const source = parsePopupManifest(value);
  const latest = parsePopupManifest(
    source.version === 9
      ? source
      : addDefaultTextWidthRanges(
          source.version === 8
            ? source
            : ({
                ...(source.version === 7
                  ? source
                  : {
                      ...upgradePopupManifestToV6(source),
                      version: 7,
                      audio: { version: 1, effects: [], cues: [] },
                    }),
                version: 8,
              } as PopupManifestV8),
        ),
  );
  if (latest.version !== LATEST_POPUP_MANIFEST_VERSION)
    throw new Error(
      `popup latest normalization expected v${LATEST_POPUP_MANIFEST_VERSION}.`,
    );
  return Object.freeze({ sourceVersion: source.version, manifest: latest });
}

function addDefaultTextWidthRanges(manifest: PopupManifestV8): unknown {
  const style = (layer: any) =>
    layer.kind === "text"
      ? {
          ...layer,
          style: {
            ...layer.style,
            widthRange: { minWidth: 0, maxWidth: 0 },
          },
        }
      : layer;
  const layers = (values: readonly unknown[]) => values.map(style);
  const tier = (value: any) => ({ ...value, layers: layers(value.layers) });
  if (manifest.type === "spine")
    return {
      ...manifest,
      version: 9,
      spine: {
        ...manifest.spine,
        ...(manifest.spine.overlays
          ? { overlays: layers(manifest.spine.overlays) }
          : {}),
      },
    };
  if (manifest.type === "single-state")
    return {
      ...manifest,
      version: 9,
      singleState: { layers: layers(manifest.singleState.layers) },
    };
  return {
    ...manifest,
    version: 9,
    awardCelebration: {
      base: tier(manifest.awardCelebration.base),
      standard: tier(manifest.awardCelebration.standard),
      celebrationTiers: manifest.awardCelebration.celebrationTiers.map(tier),
    },
  };
}
