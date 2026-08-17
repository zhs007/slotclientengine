import { parsePopupManifest } from "./manifest.js";
import { upgradePopupManifestToV6 } from "./state-visibility.js";
import type { PopupManifest, PopupManifestV7 } from "./types.js";

export const LATEST_POPUP_MANIFEST_VERSION = 7 as const;
export type LatestPopupManifest = PopupManifestV7;

export interface LoadedPopupManifest {
  readonly sourceVersion: PopupManifest["version"];
  readonly manifest: LatestPopupManifest;
}

/** Strictly parses any supported source version and normalizes it to latest. */
export function loadPopupManifest(value: unknown): LoadedPopupManifest {
  const source = parsePopupManifest(value);
  const latest = parsePopupManifest(
    source.version === 7
      ? source
      : {
          ...upgradePopupManifestToV6(source),
          version: 7,
          audio: { version: 1, effects: [], cues: [] },
        },
  );
  if (latest.version !== LATEST_POPUP_MANIFEST_VERSION)
    throw new Error(
      `popup latest normalization expected v${LATEST_POPUP_MANIFEST_VERSION}.`,
    );
  return Object.freeze({ sourceVersion: source.version, manifest: latest });
}
