import { getSlotGameStaticSkin } from "@slotclientengine/gameframeworks/static-config";
import {
  createDefaultSymbolAnimationResolver,
  createSymbolManifestAnimationResolver,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
} from "@slotclientengine/rendercore";
import {
  createGame003SymbolScaleMapFromManifest,
  getGame003DisplaySymbolsFromManifest,
} from "./assets.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
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
}

const game003StaticSkin1 = getSlotGameStaticSkin(GAME003_STATIC_CONFIG, "1");
const game003DefaultAnimationResolver = createDefaultSymbolAnimationResolver();
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

export { GAME003_SUPPORTED_SKINS, parseGame003SkinId, type Game003SkinId };
