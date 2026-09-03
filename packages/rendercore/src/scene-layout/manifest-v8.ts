import { SceneLayoutError } from "./errors.js";
import { parseSceneLayoutManifestV7 } from "./manifest-v7.js";
import type {
  SceneLayoutGameModesV7,
  SceneLayoutGameModesV8,
  SceneLayoutManifestV7,
  SceneLayoutManifestV8,
} from "./types.js";

export function resolveSceneLayoutStartupMode(
  gameModes: Pick<SceneLayoutGameModesV8, "initialMode" | "splashMode">,
): string {
  return gameModes.splashMode ?? gameModes.initialMode;
}

export function parseSceneLayoutManifestV8(
  value: unknown,
): SceneLayoutManifestV8 {
  const root = record(value, "scene layout manifest");
  if (root.version !== 8) fail("scene layout manifest.version must be 8.");
  const rawGameModes = record(root.gameModes, "scene layout gameModes");
  known(
    rawGameModes,
    new Set(["initialMode", "splashMode", "modes", "transitions"]),
    "scene layout gameModes",
  );
  const splashMode =
    rawGameModes.splashMode === undefined
      ? undefined
      : nonEmpty(rawGameModes.splashMode, "scene layout gameModes.splashMode");
  const { splashMode: _splashMode, ...v7GameModes } = rawGameModes;
  const parsedV7 = parseSceneLayoutManifestV7({
    ...root,
    version: 7,
    gameModes: v7GameModes,
  });
  const gameModes = parseGameModesV8(parsedV7.gameModes, splashMode);
  return deepFreeze({
    ...parsedV7,
    version: 8 as const,
    gameModes,
  });
}

export function upgradeSceneLayoutManifestV7ToV8(
  source: SceneLayoutManifestV7,
): SceneLayoutManifestV8 {
  return parseSceneLayoutManifestV8({
    ...source,
    version: 8,
  });
}

function parseGameModesV8(
  source: SceneLayoutGameModesV7,
  splashMode: string | undefined,
): SceneLayoutGameModesV8 {
  if (splashMode === undefined) return deepFreeze({ ...source });
  if (splashMode === source.initialMode)
    fail("scene layout gameModes.splashMode must differ from initialMode.");
  const splash = source.modes.find((mode) => mode.id === splashMode);
  if (!splash)
    fail("scene layout gameModes.splashMode must reference a declared mode.");
  const edge = source.transitions?.find(
    (transition) =>
      transition.from === splashMode && transition.to === source.initialMode,
  );
  if (!edge)
    fail(
      "scene layout configured splashMode requires a direct transition to initialMode.",
    );
  if (
    splash.primaryAction !== undefined &&
    splash.primaryAction.targetMode !== source.initialMode
  )
    fail(
      "scene layout configured splashMode primaryAction must target initialMode.",
    );
  return deepFreeze({ ...source, splashMode });
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    fail(`${label} must be an object.`);
  return value as Record<string, unknown>;
}

function known(
  value: Record<string, unknown>,
  keys: ReadonlySet<string>,
  label: string,
): void {
  for (const key of Object.keys(value))
    if (!keys.has(key)) fail(`${label} has unknown field "${key}".`);
}

function nonEmpty(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0)
    fail(`${label} must be a non-empty string.`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== "object" || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function fail(message: string): never {
  throw new SceneLayoutError(message);
}
