import { SceneLayoutError } from "./errors.js";
import { parseSceneLayoutManifestV2 } from "./manifest-v2.js";
import { parseSceneLayoutManifestV5 } from "./manifest-v3.js";
import {
  createSceneLayoutRuntimeAllocation,
  createSceneLayoutRuntimeAllocationV1,
  parseSceneLayoutRuntimeAllocation,
} from "./runtime-allocation.js";
import type {
  SceneLayoutManifestV5,
  SceneLayoutManifestV6,
  SceneLayoutNode,
  SceneLayoutVariantId,
} from "./types.js";

export function parseSceneLayoutManifestV6(
  value: unknown,
): SceneLayoutManifestV6 {
  const root = record(value, "scene layout manifest");
  if (root.version !== 6)
    throw new SceneLayoutError("scene layout manifest.version must be 6.");
  if (!Object.hasOwn(root, "runtimeAllocation"))
    throw new SceneLayoutError(
      "scene layout manifest v6.runtimeAllocation is required.",
    );

  const parsedV5 = parseSceneLayoutManifestV5(v6AsStrictV5(root));
  validateV6NodePlacements(parsedV5);
  const draft = {
    ...parsedV5,
    version: 6 as const,
    runtimeAllocation: root.runtimeAllocation,
  } as SceneLayoutManifestV6;
  const runtimeAllocation = parseSceneLayoutRuntimeAllocation(
    root.runtimeAllocation,
    draft,
  );
  if (runtimeAllocation.version !== 2)
    throw new SceneLayoutError(
      "scene layout manifest v6.runtimeAllocation.version must be 2.",
    );
  return deepFreeze({ ...draft, runtimeAllocation });
}

export function upgradeSceneLayoutManifestV5ToV6(
  value: SceneLayoutManifestV5,
): SceneLayoutManifestV6 {
  const parsed = parseSceneLayoutManifestV5(value);
  const backgroundIds = collectBackgroundIds(parsed);
  const nodes = parsed.nodes.map((node) => {
    if (backgroundIds.has(node.id)) return structuredClone(node);
    const usedByMaximizedMode = parsed.gameModes.modes.some(
      (mode) =>
        mode.adaptation.mode === "maximized-focus" &&
        (node.gameMode === undefined || node.gameMode === mode.id),
    );
    if (!usedByMaximizedMode) {
      const placements = orientationPlacements(node);
      if (!placements.landscape && !placements.portrait)
        throw new SceneLayoutError(
          `scene layout ordinary node "${node.id}" must have a landscape or portrait placement.`,
        );
      return { ...structuredClone(node), placements };
    }
    const placement = node.placements.default;
    if (!placement)
      throw new SceneLayoutError(
        `scene layout ordinary node "${node.id}" has no default placement to upgrade.`,
      );
    return {
      ...structuredClone(node),
      placements: {
        landscape: structuredClone(placement),
        portrait: structuredClone(placement),
      },
    };
  });
  const draft = {
    ...structuredClone(parsed),
    version: 6 as const,
    nodes,
    runtimeAllocation: undefined as never,
  } as SceneLayoutManifestV6;
  const runtimeAllocation = createSceneLayoutRuntimeAllocation(draft);
  if (runtimeAllocation.version !== 2)
    throw new SceneLayoutError("Failed to create Scene Layout v6 allocation.");
  return parseSceneLayoutManifestV6({ ...draft, runtimeAllocation });
}

function v6AsStrictV5(root: Record<string, unknown>): SceneLayoutManifestV5 {
  const {
    version: _version,
    runtimeAllocation: _runtimeAllocation,
    audio: _audio,
    eventAudio: _eventAudio,
    ...v2Root
  } = root;
  const gameModes = record(v2Root.gameModes, "scene layout gameModes");
  if (!Array.isArray(gameModes.modes))
    throw new SceneLayoutError(
      "scene layout gameModes.modes must be an array.",
    );
  const modes = gameModes.modes.map((value, index) => {
    const mode = record(value, `scene layout gameModes.modes[${index}]`);
    const { bgm: _bgm, ...legacyMode } = mode;
    return legacyMode;
  });
  const parsedV2 = parseSceneLayoutManifestV2({
    ...v2Root,
    version: 2,
    gameModes: { ...gameModes, modes },
  });
  return parseSceneLayoutManifestV5({
    ...root,
    version: 5,
    runtimeAllocation: createSceneLayoutRuntimeAllocationV1(parsedV2),
  });
}

function validateV6NodePlacements(manifest: SceneLayoutManifestV5): void {
  const backgroundVariants = new Map<string, Set<SceneLayoutVariantId>>();
  for (const mode of manifest.gameModes.modes) {
    for (const [variant, nodeId] of Object.entries(mode.backgroundNodes)) {
      if (!nodeId) continue;
      let variants = backgroundVariants.get(nodeId);
      if (!variants) {
        variants = new Set();
        backgroundVariants.set(nodeId, variants);
      }
      variants.add(variant as SceneLayoutVariantId);
    }
  }
  for (const node of manifest.nodes) {
    const actual = Object.keys(node.placements) as SceneLayoutVariantId[];
    const required = backgroundVariants.get(node.id);
    if (required) {
      for (const key of actual)
        if (!required.has(key))
          throw new SceneLayoutError(
            `scene layout background node "${node.id}" contains inactive placement "${key}".`,
          );
      for (const key of required)
        if (!node.placements[key])
          throw new SceneLayoutError(
            `scene layout background node "${node.id}" requires ${key} placement.`,
          );
      continue;
    }
    for (const key of actual)
      if (key !== "landscape" && key !== "portrait")
        throw new SceneLayoutError(
          `scene layout ordinary node "${node.id}" contains invalid placement "${key}".`,
        );
    if (!node.placements.landscape && !node.placements.portrait)
      throw new SceneLayoutError(
        `scene layout ordinary node "${node.id}" must have a landscape or portrait placement.`,
      );
  }
}

function collectBackgroundIds(manifest: SceneLayoutManifestV5): Set<string> {
  return new Set(
    manifest.gameModes.modes.flatMap((mode) =>
      Object.values(mode.backgroundNodes),
    ),
  );
}

function orientationPlacements(node: SceneLayoutNode) {
  return {
    ...(node.placements.landscape
      ? { landscape: structuredClone(node.placements.landscape) }
      : {}),
    ...(node.placements.portrait
      ? { portrait: structuredClone(node.placements.portrait) }
      : {}),
  };
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new SceneLayoutError(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>))
      deepFreeze(child);
  }
  return value;
}
