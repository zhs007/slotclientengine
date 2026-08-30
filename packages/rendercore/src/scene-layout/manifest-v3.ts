import {
  assertAudioRoute,
  parseAudioCatalogManifestV1,
  parseAudioEventTrackBindingV1,
} from "@slotclientengine/audiocore/data";
import { parseGameLayoutRuntimeAddress } from "./data/runtime-address.js";
import { SceneLayoutError } from "./errors.js";
import {
  normalizeLegacySceneLayoutPresentationOrders,
  parseSceneLayoutManifestV2,
  upgradeSceneLayoutManifestToV2,
} from "./manifest-v2.js";
import {
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutRuntimeAllocation,
} from "./runtime-allocation.js";
import type {
  SceneLayoutManifestLatest,
  SceneLayoutManifestV3,
  SceneLayoutManifestV4,
  SceneLayoutManifestV5,
} from "./types.js";
import {
  parseSceneLayoutManifestV6,
  upgradeSceneLayoutManifestV5ToV6,
} from "./manifest-v6.js";

export function parseSceneLayoutManifestV3(
  value: unknown,
): SceneLayoutManifestV3 {
  const root = record(value, "scene layout manifest");
  if (root.version !== 3)
    throw new SceneLayoutError("scene layout manifest.version must be 3.");
  if (!Object.hasOwn(root, "runtimeAllocation"))
    throw new SceneLayoutError(
      "scene layout manifest v3.runtimeAllocation is required.",
    );
  const { runtimeAllocation, ...source } = root;
  const parsedV2 = parseSceneLayoutManifestV2({ ...source, version: 2 });
  const allocation = parseSceneLayoutRuntimeAllocation(
    runtimeAllocation,
    parsedV2,
  );
  return deepFreeze({
    ...parsedV2,
    version: 3,
    runtimeAllocation: allocation,
  });
}

export function upgradeSceneLayoutManifestToLatest(
  value: unknown,
): SceneLayoutManifestLatest {
  const root = record(value, "scene layout manifest");
  if (root.version === 6) return parseSceneLayoutManifestV6(value);
  if (root.version === 5)
    return upgradeSceneLayoutManifestV5ToV6(parseSceneLayoutManifestV5(value));
  if (root.version === 4)
    return upgradeSceneLayoutManifestV5ToV6(
      upgradeV4ToV5(parseSceneLayoutManifestV4(value)),
    );
  if (root.version === 3) {
    const normalized = normalizeLegacySceneLayoutPresentationOrders(value);
    if (normalized === value)
      return upgradeSceneLayoutManifestV5ToV6(
        upgradeV4ToV5(upgradeV3ToV4(parseSceneLayoutManifestV3(value))),
      );
    const { runtimeAllocation: _allocation, ...source } = record(
      normalized,
      "scene layout manifest",
    );
    const parsedV2 = parseSceneLayoutManifestV2({ ...source, version: 2 });
    return upgradeSceneLayoutManifestV5ToV6(
      upgradeV4ToV5(
        upgradeV3ToV4(
          parseSceneLayoutManifestV3({
            ...parsedV2,
            version: 3,
            runtimeAllocation: createSceneLayoutRuntimeAllocation(parsedV2),
          }),
        ),
      ),
    );
  }
  const source = upgradeSceneLayoutManifestToV2(value);
  return upgradeSceneLayoutManifestV5ToV6(
    upgradeV4ToV5(
      upgradeV3ToV4(
        parseSceneLayoutManifestV3({
          ...source,
          version: 3,
          runtimeAllocation: createSceneLayoutRuntimeAllocation(source),
        }),
      ),
    ),
  );
}

export function parseSceneLayoutManifestV5(
  value: unknown,
): SceneLayoutManifestV5 {
  const root = record(value, "scene layout manifest");
  if (root.version !== 5)
    throw new SceneLayoutError("scene layout manifest.version must be 5.");
  if (!Object.hasOwn(root, "eventAudio"))
    throw new SceneLayoutError(
      "scene layout manifest v5.eventAudio is required.",
    );
  const eventAudio = record(
    root.eventAudio,
    "scene layout manifest.eventAudio",
  );
  known(
    eventAudio,
    ["version", "ignoreLegacyAudio", "bindings"],
    "scene layout manifest.eventAudio",
  );
  if (eventAudio.version !== 1)
    throw new SceneLayoutError(
      "scene layout manifest.eventAudio.version must be 1.",
    );
  if (typeof eventAudio.ignoreLegacyAudio !== "boolean")
    throw new SceneLayoutError(
      "scene layout manifest.eventAudio.ignoreLegacyAudio must be boolean.",
    );
  if (!Array.isArray(eventAudio.bindings))
    throw new SceneLayoutError(
      "scene layout manifest.eventAudio.bindings must be an array.",
    );
  const startEvents = new Set<string>();
  const trackNames = new Set<string>();
  const bindings = eventAudio.bindings.map((value, index) => {
    const label = `scene layout manifest.eventAudio.bindings[${index}]`;
    const binding = record(value, label);
    known(binding, ["event", "audio", "endEvent"], label);
    const event = parseRuntimeEventAddress(binding.event, `${label}.event`);
    if (startEvents.has(event))
      throw new SceneLayoutError(`${label}.event duplicates ${event}.`);
    startEvents.add(event);
    let audio;
    try {
      audio = parseAudioEventTrackBindingV1(binding.audio, `${label}.audio`);
    } catch (error) {
      throw new SceneLayoutError(
        error instanceof Error ? error.message : String(error),
      );
    }
    if (trackNames.has(audio.name))
      throw new SceneLayoutError(
        `${label}.audio.name duplicates ${audio.name}.`,
      );
    trackNames.add(audio.name);
    const endEvent =
      binding.endEvent === undefined
        ? undefined
        : parseRuntimeEventAddress(binding.endEvent, `${label}.endEvent`);
    if (audio.playback === "loop" && !endEvent)
      throw new SceneLayoutError(
        `${label}.endEvent is required for loop audio.`,
      );
    if (audio.playback === "once" && endEvent)
      throw new SceneLayoutError(
        `${label}.endEvent is forbidden for once audio.`,
      );
    if (endEvent === event)
      throw new SceneLayoutError(`${label}.endEvent must differ from event.`);
    return deepFreeze({ event, audio, ...(endEvent ? { endEvent } : {}) });
  });
  const { eventAudio: _eventAudio, version: _version, ...source } = root;
  const parsedV4 = parseSceneLayoutManifestV4({ ...source, version: 4 });
  return deepFreeze({
    ...parsedV4,
    version: 5,
    eventAudio: {
      version: 1,
      ignoreLegacyAudio: eventAudio.ignoreLegacyAudio,
      bindings,
    },
  });
}

export function parseSceneLayoutManifestV4(
  value: unknown,
): SceneLayoutManifestV4 {
  const root = record(value, "scene layout manifest");
  if (root.version !== 4)
    throw new SceneLayoutError("scene layout manifest.version must be 4.");
  if (!Object.hasOwn(root, "audio"))
    throw new SceneLayoutError("scene layout manifest v4.audio is required.");

  const audioRoot = record(root.audio, "scene layout manifest.audio");
  const programmaticSource = audioRoot.programmaticEffects;
  if (!Array.isArray(programmaticSource))
    throw new SceneLayoutError(
      "scene layout manifest.audio.programmaticEffects must be an array.",
    );
  const catalog = parseAudioCatalogManifestV1({
    ...audioRoot,
    programmaticEffects: [],
  });
  const programmaticEffects = programmaticSource.map((route, index) => {
    try {
      return assertAudioRoute(route);
    } catch (error) {
      throw new SceneLayoutError(
        `scene layout manifest.audio.programmaticEffects[${index}] is invalid: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  });
  if (new Set(programmaticEffects).size !== programmaticEffects.length)
    throw new SceneLayoutError(
      "scene layout manifest.audio.programmaticEffects contains duplicates.",
    );
  const ownEffectNames = new Set(catalog.effects.map(({ name }) => name));
  for (const route of programmaticEffects) {
    if (!route.includes(".") && !ownEffectNames.has(route))
      throw new SceneLayoutError(
        `scene layout programmatic effect is not declared: ${route}.`,
      );
  }

  const gameModesRoot = record(root.gameModes, "scene layout gameModes");
  if (!Array.isArray(gameModesRoot.modes))
    throw new SceneLayoutError(
      "scene layout gameModes.modes must be an array.",
    );
  const bgmByMode = new Map<string, string>();
  const modes = gameModesRoot.modes.map((value, index) => {
    const mode = record(value, `scene layout gameModes.modes[${index}]`);
    const { bgm, ...legacyMode } = mode;
    if (bgm !== undefined) {
      if (typeof bgm !== "string")
        throw new SceneLayoutError(
          `scene layout gameModes.modes[${index}].bgm must be a string.`,
        );
      if (typeof mode.id === "string") bgmByMode.set(mode.id, bgm);
    }
    return legacyMode;
  });
  const {
    audio: _audio,
    version: _version,
    gameModes: _gameModes,
    ...legacyRoot
  } = root;
  const parsedV3 = parseSceneLayoutManifestV3({
    ...legacyRoot,
    version: 3,
    gameModes: { ...gameModesRoot, modes },
  });
  const musicNames = new Set(catalog.music.map(({ name }) => name));
  const parsedModes = parsedV3.gameModes.modes.map((mode) => {
    const bgm = bgmByMode.get(mode.id);
    if (bgm !== undefined && !musicNames.has(bgm))
      throw new SceneLayoutError(
        `scene layout game mode "${mode.id}" references unknown BGM "${bgm}".`,
      );
    return { ...mode, ...(bgm === undefined ? {} : { bgm }) };
  });
  return deepFreeze({
    ...parsedV3,
    version: 4,
    gameModes: { ...parsedV3.gameModes, modes: parsedModes },
    audio: { ...catalog, programmaticEffects },
  });
}

function upgradeV3ToV4(value: SceneLayoutManifestV3): SceneLayoutManifestV4 {
  return parseSceneLayoutManifestV4({
    ...value,
    version: 4,
    audio: { version: 1, effects: [], music: [], programmaticEffects: [] },
  });
}

function upgradeV4ToV5(value: SceneLayoutManifestV4): SceneLayoutManifestV5 {
  return parseSceneLayoutManifestV5({
    ...value,
    version: 5,
    eventAudio: { version: 1, ignoreLegacyAudio: false, bindings: [] },
  });
}

function parseRuntimeEventAddress(value: unknown, label: string) {
  if (typeof value !== "string")
    throw new SceneLayoutError(`${label} must be a string.`);
  try {
    return parseGameLayoutRuntimeAddress(value);
  } catch (error) {
    throw new SceneLayoutError(
      `${label} is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function known(
  value: Record<string, unknown>,
  allowed: readonly string[],
  label: string,
): void {
  const set = new Set(allowed);
  for (const key of Object.keys(value))
    if (!set.has(key))
      throw new SceneLayoutError(`${label} contains unknown field "${key}".`);
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
