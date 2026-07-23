import type { SlotPlatformBootstrapWarning } from "@slotclientengine/platformbootstrap";
import { requireRecord } from "./launcher-config.js";

export interface LeoSetting {
  readonly sliderCurStep: number;
  readonly fastplays: boolean;
  readonly sound: number;
  readonly music: number;
  readonly spacebar: boolean;
}

export interface LeoSettingsStore {
  load(gameCode: string, signal: AbortSignal): Promise<unknown>;
  destroy(): void;
}

export type LeoSettingsStoreFactory = () => LeoSettingsStore;

export const DEFAULT_LEO_SETTING: LeoSetting = Object.freeze({
  sliderCurStep: 0,
  fastplays: false,
  sound: 100,
  music: 100,
  spacebar: true,
});

export function createLeoSettingRequestUrl(
  settingApi: string,
  credential: string,
  gameCode: string,
): string {
  const url = new URL(settingApi);
  const segments = url.pathname.split("/");
  const indexes = segments.flatMap((segment, index) =>
    segment === "v1" ? [index] : [],
  );
  if (indexes.length !== 1) {
    throw new Error(
      "Leo setting API path must contain exactly one v1 segment.",
    );
  }
  segments[indexes[0] as number] = "v2";
  url.pathname = segments.join("/");
  if (url.searchParams.has("token") || url.searchParams.has("gameCode")) {
    throw new Error(
      "Leo setting API must not predefine credential or game identity query parameters.",
    );
  }
  url.searchParams.append("token", credential);
  url.searchParams.append("gameCode", gameCode);
  return url.toString();
}

export async function loadRemoteLeoSetting(options: {
  readonly settingApi: string;
  readonly credential: string;
  readonly gameCode: string;
  readonly fetch: typeof globalThis.fetch;
  readonly signal: AbortSignal;
}): Promise<LeoSetting> {
  const response = await options.fetch(
    createLeoSettingRequestUrl(
      options.settingApi,
      options.credential,
      options.gameCode,
    ),
    { method: "GET", signal: options.signal },
  );
  if (!response.ok) throw new Error("Leo setting request failed.");
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new Error("Leo setting response must be JSON.");
  }
  return parseLeoSetting(body);
}

export function parseLeoSetting(input: unknown): LeoSetting {
  const setting = requireRecord(input, "Leo setting");
  return Object.freeze({
    sliderCurStep:
      optionalSafeInteger(setting.sliderCurStep, "sliderCurStep") ?? 0,
    fastplays: optionalBoolean(setting.fastplays, "fastplays") ?? false,
    sound: optionalVolume(setting.sound, "sound") ?? 100,
    music: optionalVolume(setting.music, "music") ?? 100,
    spacebar: optionalBoolean(setting.spacebar, "spacebar") ?? true,
  });
}

export function applyLeoSettingPolicy(
  setting: LeoSetting,
  quickStop: boolean,
  disableSpacebar: boolean,
): LeoSetting {
  return Object.freeze({
    ...setting,
    fastplays: quickStop && setting.fastplays,
    spacebar: disableSpacebar ? false : setting.spacebar,
  });
}

export function createSettingFallbackWarning(): SlotPlatformBootstrapWarning {
  return Object.freeze({
    code: "leo-setting-unavailable",
    message: "Platform setting could not be loaded; safe defaults are in use.",
  });
}

function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "boolean")
    throw new Error(`${label} must be a boolean.`);
  return value;
}

function optionalSafeInteger(
  value: unknown,
  label: string,
): number | undefined {
  if (value === undefined) return undefined;
  if (!Number.isSafeInteger(value) || (value as number) < 0) {
    throw new Error(`${label} must be a non-negative safe integer.`);
  }
  return value as number;
}

function optionalVolume(value: unknown, label: string): number | undefined {
  if (value === undefined) return undefined;
  if (
    !Number.isFinite(value) ||
    (value as number) < 0 ||
    (value as number) > 100
  ) {
    throw new Error(`${label} must be a finite number from 0 to 100.`);
  }
  return value as number;
}
