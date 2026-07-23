import {
  createSlotPlatformBootstrapSnapshot,
  throwIfAborted,
  type SlotPlatformBootstrapHandle,
  type SlotPlatformBootstrapProvider,
  type SlotPlatformBootstrapWarning,
} from "@slotclientengine/platformbootstrap";
import { createIndexedDbLeoSettingsStore } from "./indexed-db-settings.js";
import { loadLeoLauncherConfig } from "./launcher-config.js";
import { validateCurrency, type LeoLauncherParameters } from "./params.js";
import {
  applyLeoSettingPolicy,
  createSettingFallbackWarning,
  DEFAULT_LEO_SETTING,
  loadRemoteLeoSetting,
  parseLeoSetting,
  type LeoSetting,
  type LeoSettingsStore,
  type LeoSettingsStoreFactory,
} from "./settings.js";
import { loadLeoTranslations } from "./translations.js";

export interface LeoPlatformBootstrapOptions {
  readonly params: LeoLauncherParameters;
  readonly presentation: {
    readonly brandLabel: string;
    readonly defaultCurrency: string;
    readonly defaultLocale: string;
    readonly localeByLanguage?: Readonly<Record<string, string>>;
  };
  readonly fetch?: typeof globalThis.fetch;
  readonly settingsStoreFactory?: LeoSettingsStoreFactory;
  readonly expectedGameServerUrl?: string;
}

export function createLeoPlatformBootstrapProvider(
  options: LeoPlatformBootstrapOptions,
): SlotPlatformBootstrapProvider {
  const fetchImplementation = options.fetch ?? globalThis.fetch;
  if (typeof fetchImplementation !== "function") {
    throw new Error("Leo platform bootstrap requires fetch.");
  }
  const presentation = normalizePresentation(
    options.presentation,
    options.params,
  );
  return Object.freeze({
    async prepare(signal: AbortSignal): Promise<SlotPlatformBootstrapHandle> {
      throwIfAborted(signal);
      let settingsStore: LeoSettingsStore | null = null;
      let handleCreated = false;
      try {
        const config = await loadLeoLauncherConfig({
          params: options.params,
          fetch: fetchImplementation,
          signal,
        });
        throwIfAborted(signal);
        if (options.params.mode === "fun") {
          settingsStore =
            options.settingsStoreFactory?.() ??
            createIndexedDbLeoSettingsStore();
        }
        const [translationResult, settingResult] = await Promise.all([
          loadLeoTranslations({ config, fetch: fetchImplementation, signal }),
          loadSetting({
            params: options.params,
            config,
            fetch: fetchImplementation,
            signal,
            settingsStore,
          }),
        ]);
        throwIfAborted(signal);
        const warnings: SlotPlatformBootstrapWarning[] = [
          ...translationResult.warnings,
          ...settingResult.warnings,
        ];
        if (
          options.expectedGameServerUrl !== undefined &&
          new URL(config.gameServerConfig.gameServerApi).toString() !==
            new URL(options.expectedGameServerUrl).toString()
        ) {
          warnings.push(
            Object.freeze({
              code: "leo-game-server-mismatch",
              message:
                "Launcher game server differs from the fixed application server; the fixed server remains in use.",
            }),
          );
        }
        const snapshot = createSlotPlatformBootstrapSnapshot({
          platform: "leo",
          mode: options.params.mode,
          gameCode: options.params.gameCode,
          businessCode: options.params.businessCode,
          language: options.params.language,
          jurisdiction: options.params.jurisdiction,
          presentation,
          initialPreferences: {
            muted:
              settingResult.setting.sound <= 0 &&
              settingResult.setting.music <= 0,
            fastMode: settingResult.setting.fastplays,
            autoMode: false,
          },
          translations: translationResult.translations,
          warnings,
        });
        let destroyed = false;
        handleCreated = true;
        return Object.freeze({
          snapshot,
          destroy(): void {
            if (destroyed) return;
            destroyed = true;
            settingsStore?.destroy();
            settingsStore = null;
          },
        });
      } catch (error) {
        if (!handleCreated) settingsStore?.destroy();
        throw error;
      }
    },
  });
}

async function loadSetting(options: {
  readonly params: LeoLauncherParameters;
  readonly config: Awaited<ReturnType<typeof loadLeoLauncherConfig>>;
  readonly fetch: typeof globalThis.fetch;
  readonly signal: AbortSignal;
  readonly settingsStore: LeoSettingsStore | null;
}): Promise<{
  readonly setting: LeoSetting;
  readonly warnings: readonly SlotPlatformBootstrapWarning[];
}> {
  try {
    const raw =
      options.params.mode === "fun"
        ? await options.settingsStore?.load(
            options.params.gameCode,
            options.signal,
          )
        : await loadRemoteLeoSetting({
            settingApi: options.config.gameServerConfig.settingApi,
            credential: options.params.credential,
            gameCode: options.params.gameCode,
            fetch: options.fetch,
            signal: options.signal,
          });
    throwIfAborted(options.signal);
    const setting =
      raw === undefined ? DEFAULT_LEO_SETTING : parseLeoSetting(raw);
    return Object.freeze({
      setting: applyLeoSettingPolicy(
        setting,
        options.config.quickStop,
        options.config.disableSpacebar,
      ),
      warnings: Object.freeze([]),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw error;
    return Object.freeze({
      setting: applyLeoSettingPolicy(
        DEFAULT_LEO_SETTING,
        options.config.quickStop,
        options.config.disableSpacebar,
      ),
      warnings: Object.freeze([createSettingFallbackWarning()]),
    });
  }
}

function normalizePresentation(
  input: LeoPlatformBootstrapOptions["presentation"],
  params: LeoLauncherParameters,
) {
  const brandLabel = requireText(input.brandLabel, "brandLabel");
  const currency = validateCurrency(params.currency ?? input.defaultCurrency);
  const mappedLocale = input.localeByLanguage?.[params.language];
  validateLocale(input.defaultLocale);
  const locale = mappedLocale
    ? validateLocale(mappedLocale)
    : validateLocale(params.language);
  return Object.freeze({ brandLabel, currency, locale });
}

function validateLocale(language: string): string {
  try {
    return new Intl.Locale(language).toString();
  } catch {
    throw new Error("Leo presentation locale is invalid.");
  }
}

function requireText(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}
