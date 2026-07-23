import type {
  SlotPlatformBootstrapSnapshot,
  SlotPlatformBootstrapWarning,
  SlotPlatformMode,
} from "./types.js";

const FORBIDDEN_TRANSLATION_KEYS = new Set([
  "__proto__",
  "constructor",
  "prototype",
]);

export function createSlotPlatformBootstrapSnapshot(
  input: SlotPlatformBootstrapSnapshot,
): SlotPlatformBootstrapSnapshot {
  assertRecord(input, "platform bootstrap snapshot");
  const translations = createStringMap(input.translations, "translations");
  if (!Array.isArray(input.warnings)) {
    throw new Error("platform bootstrap warnings must be an array.");
  }
  const warnings = Object.freeze(input.warnings.map(copyWarning));
  const mode = assertMode(input.mode);
  return Object.freeze({
    platform: requireText(input.platform, "platform"),
    mode,
    gameCode: requireText(input.gameCode, "gameCode"),
    businessCode: requireText(input.businessCode, "businessCode"),
    language: requireText(input.language, "language"),
    jurisdiction: requireText(input.jurisdiction, "jurisdiction"),
    presentation: Object.freeze({
      brandLabel: requireText(input.presentation?.brandLabel, "brandLabel"),
      currency: requireText(input.presentation?.currency, "currency"),
      locale: requireText(input.presentation?.locale, "locale"),
    }),
    initialPreferences: Object.freeze({
      muted: requireBoolean(input.initialPreferences?.muted, "muted"),
      fastMode: requireBoolean(input.initialPreferences?.fastMode, "fastMode"),
      autoMode: requireBoolean(input.initialPreferences?.autoMode, "autoMode"),
    }),
    translations,
    warnings,
  });
}

export function createStringMap(
  input: unknown,
  label: string,
): Readonly<Record<string, string>> {
  assertRecord(input, label);
  const output = Object.create(null) as Record<string, string>;
  for (const [key, value] of Object.entries(input)) {
    if (key.trim().length === 0 || FORBIDDEN_TRANSLATION_KEYS.has(key)) {
      throw new Error(`${label} contains an invalid key.`);
    }
    if (typeof value !== "string") {
      throw new Error(`${label} values must be strings.`);
    }
    output[key] = value;
  }
  return Object.freeze(output);
}

export function throwIfAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Platform bootstrap was aborted.", "AbortError");
  }
}

function copyWarning(
  warning: SlotPlatformBootstrapWarning,
): SlotPlatformBootstrapWarning {
  assertRecord(warning, "platform bootstrap warning");
  return Object.freeze({
    code: requireText(warning.code, "warning code"),
    message: requireText(warning.message, "warning message"),
  });
}

function assertMode(value: unknown): SlotPlatformMode {
  if (value !== "real" && value !== "fun" && value !== "replay") {
    throw new Error("platform bootstrap mode is invalid.");
  }
  return value;
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new Error(`${label} must be a boolean.`);
  }
  return value;
}

function assertRecord(
  value: unknown,
  label: string,
): asserts value is Record<string, unknown> {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    (Object.getPrototypeOf(value) !== Object.prototype &&
      Object.getPrototypeOf(value) !== null)
  ) {
    throw new Error(`${label} must be a plain object.`);
  }
}
