import { parsePopupManifest, validatePopupId } from "./manifest.js";
import type {
  PopupObjectManifestV1,
  PopupObjectLayerV1,
  PopupObjectResourceSpecV1,
  SingleStatePopupManifestV9,
} from "./types.js";

export const POPUP_OBJECT_MANIFEST_PATH = "popup-object.manifest.json";

/** Strictly parses the standalone, state-free Popup Object authoring contract. */
export function parsePopupObjectManifest(
  value: unknown,
): PopupObjectManifestV1 {
  const record = object(value, "popup object manifest");
  keys(
    record,
    ["version", "kind", "name", "resources", "layers"],
    "popup object manifest",
  );
  if (record.version !== 1)
    throw new Error("popup object manifest.version must be 1.");
  if (record.kind !== "popup-object")
    throw new Error('popup object manifest.kind must be "popup-object".');
  const name = validatePopupId(record.name, "popup object manifest.name");
  const rawResources = object(
    record.resources,
    "popup object manifest.resources",
  );
  for (const [id, raw] of Object.entries(rawResources))
    if (object(raw, `popup object resources.${id}`).kind === "popup-object")
      throw new Error(
        `popup object resources.${id} cannot contain another popup-object.`,
      );
  if (Array.isArray(record.layers))
    for (const [index, raw] of record.layers.entries())
      if (object(raw, `popup object layers[${index}]`).kind === "popup-object")
        throw new Error(
          `popup object layer ${index} cannot contain another popup-object.`,
        );
  const popup = parsePopupManifest({
    version: 9,
    kind: "popup",
    id: name,
    name,
    type: "single-state",
    adaptation: {
      mode: "maximized-focus",
      focus: { left: 1, right: 1, top: 1, bottom: 1 },
    },
    backdrop: {
      enabled: false,
      color: "#000000",
      alpha: 0,
      visibleStates: ["active"],
    },
    resources: record.resources,
    audio: { version: 1, effects: [], cues: [] },
    singleState: { layers: record.layers },
  });
  if (popup.type !== "single-state" || popup.version !== 9)
    throw new Error("popup object internal single-state normalization failed.");
  for (const [id, resource] of Object.entries(popup.resources))
    if (resource.kind === "popup-object")
      throw new Error(
        `popup object resources.${id} cannot contain another popup-object.`,
      );
  for (const layer of popup.singleState.layers)
    if (layer.kind === "popup-object")
      throw new Error(
        `popup object layer ${layer.id} cannot contain another popup-object.`,
      );
  return Object.freeze({
    version: 1,
    kind: "popup-object",
    name,
    resources: popup.resources as Readonly<
      Record<string, PopupObjectResourceSpecV1>
    >,
    layers: popup.singleState.layers as readonly PopupObjectLayerV1[],
  });
}

/** Projects an object definition onto the existing layer runtime without adding Popup state. */
export function popupObjectToSingleStateManifest(
  value: PopupObjectManifestV1,
): SingleStatePopupManifestV9 {
  const objectManifest = parsePopupObjectManifest(value);
  return parsePopupManifest({
    version: 9,
    kind: "popup",
    id: objectManifest.name,
    name: objectManifest.name,
    type: "single-state",
    adaptation: {
      mode: "maximized-focus",
      focus: { left: 1, right: 1, top: 1, bottom: 1 },
    },
    backdrop: {
      enabled: false,
      color: "#000000",
      alpha: 0,
      visibleStates: ["active"],
    },
    resources: objectManifest.resources,
    audio: { version: 1, effects: [], cues: [] },
    singleState: { layers: objectManifest.layers },
  }) as SingleStatePopupManifestV9;
}

export function collectPopupObjectDirectPaths(
  value: PopupObjectManifestV1,
): readonly string[] {
  const manifest = parsePopupObjectManifest(value);
  const paths = new Set<string>();
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image" || resource.kind === "font")
      paths.add(resource.path);
    else if (resource.kind === "image-string") paths.add(resource.manifest);
    else if (resource.kind === "vni") paths.add(resource.project);
    else {
      paths.add(resource.skeleton);
      paths.add(resource.atlas);
      for (const path of Object.values(resource.textures)) paths.add(path);
    }
  }
  return Object.freeze(
    [...paths].sort((left, right) => left.localeCompare(right, "en")),
  );
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function keys(
  record: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  for (const key of Object.keys(record))
    if (!allowed.includes(key))
      throw new Error(`${label} contains unknown key: ${key}`);
  for (const key of allowed)
    if (!Object.hasOwn(record, key))
      throw new Error(`${label} missing key: ${key}`);
}
