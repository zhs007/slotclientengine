import { getSlotGameStaticSkin } from "@slotclientengine/gameframeworks/static-config";
import {
  createDefaultSymbolAnimationResolver,
  createSceneLayoutPackageResource,
  createSymbolManifestAnimationResolver,
  type DecodeImageStringImage,
  type ReelSymbolRenderPriorityMap,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
  type SceneLayoutPackageResource,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore";
import {
  GAME003_BG_BAR_DISPLAY_SYMBOLS,
  createGame003BgBarSymbolRenderPriorityMapFromManifest,
  createGame003BgBarSymbolScaleMapFromManifest,
  createGame003SymbolRenderPriorityMapFromManifest,
  createGame003SymbolScaleMapFromManifest,
  getGame003DisplaySymbolsFromManifest,
} from "./assets.js";
import {
  getGame003CoinOverlayConfig,
  type Game003CoinOverlayConfig,
} from "./coin-overlay-config.js";
import { GAME003_STATIC_CONFIG } from "./generated/game-static.generated.js";
import {
  getGame003MinecartInteractionConfig,
  type Game003MinecartInteractionConfig,
} from "./minecart-interaction-config.js";
import {
  getGame003WinSymbolLoopConfig,
  type Game003WinSymbolLoopConfig,
} from "./win-symbol-loop-config.js";
import {
  GAME003_SUPPORTED_SKINS,
  parseGame003SkinId,
  type Game003SkinId,
} from "./skin-id.js";

interface Game003SkinBusinessConfig {
  readonly label: string;
  readonly winSymbolLoop: Game003WinSymbolLoopConfig;
  readonly coinOverlay: Game003CoinOverlayConfig;
}

export interface Game003LegacySkinConfig extends Game003SkinBusinessConfig {
  readonly id: "1";
  readonly presentation: Readonly<{ readonly kind: "legacy" }>;
  readonly landscapeBackgroundUrl: string;
  readonly portraitBackgroundUrl: string;
  readonly mainReelBackgroundUrl: string;
  readonly landscapeConveyorUrl: string;
  readonly portraitConveyorUrl: string;
  readonly symbolModules: Record<string, string>;
  readonly vniProjectModules?: Record<string, unknown>;
  readonly vniAssetModules?: Record<string, string>;
  readonly spineSkeletonModules?: Record<string, unknown>;
  readonly spineAtlasModules?: Record<string, string>;
  readonly spineTextureModules?: Record<string, string>;
  readonly stateTextureManifest: unknown;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly symbolAnimationResolver: SymbolAnimationResolver;
  readonly bgBar: Game003BgBarSkinConfig;
  readonly minecartInteraction: Game003MinecartInteractionConfig;
}

export interface Game003SceneLayoutSkinConfig extends Game003SkinBusinessConfig {
  readonly id: "2";
  readonly rawGameConfig: unknown;
  readonly reelsName: string;
  readonly resource: SceneLayoutPackageResource;
  readonly symbolPackage: SymbolPackageResource;
  readonly initialMode: string;
  readonly awardCelebrationPopup: string;
  readonly presentation: Readonly<{ readonly kind: "scene-layout" }>;
}

export type Game003SkinConfig =
  | Game003LegacySkinConfig
  | Game003SceneLayoutSkinConfig;

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
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
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

const GAME003_SKIN1_CONFIG: Game003LegacySkinConfig = Object.freeze({
  id: "1",
  presentation: Object.freeze({ kind: "legacy" as const }),
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
  spineSkeletonModules: game003StaticSkin1.symbols.spineSkeletonModules,
  spineAtlasModules: game003StaticSkin1.symbols.spineAtlasModules,
  spineTextureModules: game003StaticSkin1.symbols.spineTextureModules,
  stateTextureManifest: game003StaticSkin1.symbols.manifest,
  displaySymbols: game003Skin1DisplaySymbols,
  emptySymbols: game003StaticSkin1.symbols.emptySymbols,
  symbolScales: createGame003SymbolScaleMapFromManifest({
    stateTextureManifest: game003StaticSkin1.symbols.manifest,
    displaySymbols: game003Skin1DisplaySymbols,
    requiredStates: game003StaticSkin1.symbols.requiredStates,
    requireExplicitScale: game003StaticSkin1.symbols.requireExplicitScale,
  }),
  symbolRenderPriorities: createGame003SymbolRenderPriorityMapFromManifest({
    stateTextureManifest: game003StaticSkin1.symbols.manifest,
    displaySymbols: game003Skin1DisplaySymbols,
    requiredStates: game003StaticSkin1.symbols.requiredStates,
  }),
  symbolAnimationResolver: createSymbolManifestAnimationResolver({
    manifest: game003StaticSkin1.symbols.manifest,
    requiredStates: game003StaticSkin1.symbols.requiredStates,
    vniProjectModules: game003StaticSkin1.symbols.vniProjectModules ?? {},
    vniAssetModules: game003StaticSkin1.symbols.vniAssetModules ?? {},
    spineSkeletonModules: game003StaticSkin1.symbols.spineSkeletonModules ?? {},
    spineAtlasModules: game003StaticSkin1.symbols.spineAtlasModules ?? {},
    spineTextureModules: game003StaticSkin1.symbols.spineTextureModules ?? {},
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
    symbolRenderPriorities:
      createGame003BgBarSymbolRenderPriorityMapFromManifest({
        stateTextureManifest: game003StaticSkin1BgBar.symbols.manifest,
        displaySymbols: GAME003_BG_BAR_DISPLAY_SYMBOLS,
      }),
    symbolAnimationResolver: createSymbolManifestAnimationResolver({
      manifest: game003StaticSkin1BgBar.symbols.manifest,
      requiredStates: game003StaticSkin1BgBar.symbols.requiredStates,
      vniProjectModules: {},
      vniAssetModules: {},
      spineSkeletonModules: {},
      spineAtlasModules: {},
      spineTextureModules: {},
      fallback: game003DefaultAnimationResolver,
    }),
    layout: game003StaticSkin1BgBar.layout,
  }),
  minecartInteraction: getGame003MinecartInteractionConfig(
    game003StaticSkin1.appExtensions,
  ),
  winSymbolLoop: getGame003WinSymbolLoopConfig(
    game003StaticSkin1.appExtensions,
  ),
  coinOverlay: getGame003CoinOverlayConfig(game003StaticSkin1.appExtensions),
});

export interface Game003SkinResourceOwner {
  destroy(): Promise<void> | void;
}

export async function prepareGame003SkinConfig(
  id: Game003SkinId,
  options: {
    readonly minecart2Files?: ReadonlyMap<string, Uint8Array>;
    readonly decodeImage?: DecodeImageStringImage;
  } = {},
): Promise<{
  readonly skin: Game003SkinConfig;
  readonly resourceOwner: Game003SkinResourceOwner;
}> {
  if (id === "1") {
    return Object.freeze({
      skin: GAME003_SKIN1_CONFIG,
      resourceOwner: Object.freeze({ destroy() {} }),
    });
  }
  if (!options.minecart2Files) {
    throw new Error("game003 skin=2 requires loaded minecart2 package files.");
  }
  const resource = await createSceneLayoutPackageResource({
    files: options.minecart2Files,
    ...(options.decodeImage ? { decodeImage: options.decodeImage } : {}),
  });
  try {
    const gameModes = resource.manifest.gameModes;
    if (!gameModes) {
      throw new Error("game003 minecart2 layout must declare gameModes.");
    }
    const initialMode = gameModes.modes.find(
      (mode) => mode.id === gameModes.initialMode,
    );
    if (!initialMode?.symbolPackage) {
      throw new Error(
        "game003 minecart2 initial mode must declare a symbol package.",
      );
    }
    if (!initialMode.awardCelebrationPopup) {
      throw new Error(
        "game003 minecart2 initial mode must declare an award celebration popup.",
      );
    }
    const symbolBinding =
      resource.manifest.symbolPackages?.[initialMode.symbolPackage];
    const symbolPackage = resource.symbolPackages[initialMode.symbolPackage];
    if (!symbolBinding || !symbolPackage) {
      throw new Error(
        `game003 minecart2 symbol package "${initialMode.symbolPackage}" is unavailable.`,
      );
    }
    const geometry = resource.manifest.reels.main;
    if (!geometry || geometry.columns !== 5 || geometry.rows !== 5) {
      throw new Error("game003 minecart2 reels.main geometry must be 5x5.");
    }
    if (
      symbolBinding.renderMode !== "standard" ||
      symbolBinding.reelSet !== "bg-reel01"
    ) {
      throw new Error(
        "game003 minecart2 must use standard bg-reel01 presentation.",
      );
    }
    const skin: Game003SceneLayoutSkinConfig = Object.freeze({
      id: "2",
      label: "minecart2",
      rawGameConfig: symbolPackage.rawGameConfig,
      reelsName: symbolBinding.reelSet,
      resource,
      symbolPackage,
      initialMode: initialMode.id,
      awardCelebrationPopup: initialMode.awardCelebrationPopup,
      winSymbolLoop: getGame003WinSymbolLoopConfig(
        game003StaticSkin1.appExtensions,
      ),
      coinOverlay: getGame003CoinOverlayConfig(
        game003StaticSkin1.appExtensions,
      ),
      presentation: Object.freeze({ kind: "scene-layout" as const }),
    });
    return Object.freeze({ skin, resourceOwner: resource });
  } catch (error) {
    await resource.destroy();
    throw error;
  }
}

export function getGame003SkinConfig(id: "1"): Game003LegacySkinConfig {
  if (id !== "1") {
    throw new Error(
      'game003 skin "2" is prepared from its loaded scene-layout package.',
    );
  }
  return GAME003_SKIN1_CONFIG;
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
