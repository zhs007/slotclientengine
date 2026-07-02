import { getSlotGameStaticSkin } from "@slotclientengine/gameframeworks/static-config";
import {
  createDefaultSymbolAnimationResolver,
  createSymbolManifestAnimationResolver,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import {
  GAME003_BG_BAR_DISPLAY_SYMBOLS,
  createGame003BgBarSymbolScaleMapFromManifest,
  createGame003SymbolScaleMapFromManifest,
  getGame003DisplaySymbolsFromManifest,
} from "./assets.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import {
  getGame003MinecartInteractionConfig,
  type Game003MinecartInteractionConfig,
} from "./minecart-interaction-config.js";
import {
  GAME003_SUPPORTED_SKINS,
  parseGame003SkinId,
  type Game003SkinId,
} from "./skin-id.js";

export interface Game003SkinConfig {
  readonly id: Game003SkinId;
  readonly label: string;
  readonly landscapeBackgroundUrl: string;
  readonly portraitBackgroundUrl: string;
  readonly mainReelBackgroundUrl: string;
  readonly landscapeConveyorUrl: string;
  readonly portraitConveyorUrl: string;
  readonly symbolModules: Record<string, string>;
  readonly vniProjectModules?: Record<string, unknown>;
  readonly vniAssetModules?: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolAnimationResolver: SymbolAnimationResolver;
  readonly bgBar: Game003BgBarSkinConfig;
  readonly minecartInteraction: Game003MinecartInteractionConfig;
}

export interface Game003BgBarSkinConfig {
  readonly componentName: "bg-bar";
  readonly queueLength: 5;
  readonly visibleCount: 4;
  readonly terminalSlotIndex: 4;
  readonly emptyFeature: "normal";
  readonly allowedFeatures: readonly ["normal", "wild", "up"];
  readonly symbolModules: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly ["normal", "wild", "up"];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolAnimationResolver: SymbolAnimationResolver;
  readonly layout: NonNullable<
    typeof game003StaticSkin1.featureBars
  >["bgBar"]["layout"];
}

const game003StaticSkin1 = getSlotGameStaticSkin(GAME003_STATIC_CONFIG, "1");
const game003DefaultAnimationResolver = createDefaultSymbolAnimationResolver();
const game003StaticSkin1BgBar = requireGame003BgBar(game003StaticSkin1);
const game003Skin1DisplaySymbols = getGame003DisplaySymbolsFromManifest(
  game003StaticSkin1.symbols.manifest,
  game003StaticSkin1.symbols.requiredStates,
);

const GAME003_SKIN_CONFIGS: Readonly<Record<Game003SkinId, Game003SkinConfig>> =
  Object.freeze({
    "1": Object.freeze({
      id: parseGame003SkinId("1"),
      label: game003StaticSkin1.label,
      landscapeBackgroundUrl:
        game003StaticSkin1.art.variants.landscape.background.url,
      portraitBackgroundUrl:
        game003StaticSkin1.art.variants.portrait.background.url,
      mainReelBackgroundUrl: game003StaticSkin1.art.mainReelBackground.url,
      landscapeConveyorUrl: getGame003ConveyorUrl(
        game003StaticSkin1.art.variants.landscape.conveyor,
        "landscape",
      ),
      portraitConveyorUrl: getGame003ConveyorUrl(
        game003StaticSkin1.art.variants.portrait.conveyor,
        "portrait",
      ),
      symbolModules: game003StaticSkin1.symbols.pngModules,
      vniProjectModules: game003StaticSkin1.symbols.vniProjectModules,
      vniAssetModules: game003StaticSkin1.symbols.vniAssetModules,
      stateTextureManifest: game003StaticSkin1.symbols.manifest,
      displaySymbols: game003Skin1DisplaySymbols,
      emptySymbols: game003StaticSkin1.symbols.emptySymbols,
      symbolScales: createGame003SymbolScaleMapFromManifest({
        stateTextureManifest: game003StaticSkin1.symbols.manifest,
        displaySymbols: game003Skin1DisplaySymbols,
        requiredStates: game003StaticSkin1.symbols.requiredStates,
        requireExplicitScale: game003StaticSkin1.symbols.requireExplicitScale,
      }),
      symbolAnimationResolver: createSymbolManifestAnimationResolver({
        manifest: game003StaticSkin1.symbols.manifest,
        requiredStates: game003StaticSkin1.symbols.requiredStates,
        vniProjectModules: game003StaticSkin1.symbols.vniProjectModules ?? {},
        vniAssetModules: game003StaticSkin1.symbols.vniAssetModules ?? {},
        fallback: game003DefaultAnimationResolver,
      }),
      bgBar: Object.freeze({
        componentName: "bg-bar" as const,
        queueLength: 5 as const,
        visibleCount: 4 as const,
        terminalSlotIndex: 4 as const,
        emptyFeature: "normal" as const,
        allowedFeatures: GAME003_BG_BAR_DISPLAY_SYMBOLS,
        symbolModules: game003StaticSkin1BgBar.symbols.pngModules,
        stateTextureManifest: game003StaticSkin1BgBar.symbols.manifest,
        displaySymbols: GAME003_BG_BAR_DISPLAY_SYMBOLS,
        symbolScales: createGame003BgBarSymbolScaleMapFromManifest({
          stateTextureManifest: game003StaticSkin1BgBar.symbols.manifest,
          displaySymbols: GAME003_BG_BAR_DISPLAY_SYMBOLS,
          requireExplicitScale:
            game003StaticSkin1BgBar.symbols.requireExplicitScale,
        }),
        symbolAnimationResolver: createSymbolManifestAnimationResolver({
          manifest: game003StaticSkin1BgBar.symbols.manifest,
          requiredStates: game003StaticSkin1BgBar.symbols.requiredStates,
          vniProjectModules: {},
          vniAssetModules: {},
          fallback: game003DefaultAnimationResolver,
        }),
        layout: game003StaticSkin1BgBar.layout,
      }),
      minecartInteraction: getGame003MinecartInteractionConfig(
        game003StaticSkin1.appExtensions,
      ),
    }),
  });

export function getGame003SkinConfig(id: Game003SkinId): Game003SkinConfig {
  const config = GAME003_SKIN_CONFIGS[id];
  if (!config) {
    throw new Error(`Unknown game003 skin "${id}".`);
  }
  return config;
}

function getGame003ConveyorUrl(
  conveyor: { readonly url: string } | undefined,
  orientation: "landscape" | "portrait",
): string {
  if (!conveyor) {
    throw new Error(`game003 ${orientation} conveyor config is required.`);
  }
  return conveyor.url;
}

function requireGame003BgBar(skin: typeof game003StaticSkin1) {
  const bgBar = skin.featureBars?.bgBar;
  if (!bgBar) {
    throw new Error("game003 bg-bar static config is required.");
  }
  if (
    bgBar.componentName !== "bg-bar" ||
    bgBar.queueLength !== 5 ||
    bgBar.visibleCount !== 4 ||
    bgBar.terminalSlotIndex !== 4 ||
    bgBar.emptyFeature !== "normal"
  ) {
    throw new Error(
      "game003 bg-bar static config does not match app contract.",
    );
  }
  const allowed = [...bgBar.allowedFeatures].join(",");
  if (allowed !== "normal,wild,up") {
    throw new Error("game003 bg-bar allowed features are invalid.");
  }
  return bgBar;
}

export { GAME003_SUPPORTED_SKINS, parseGame003SkinId, type Game003SkinId };
