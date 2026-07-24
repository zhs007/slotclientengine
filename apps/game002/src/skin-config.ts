import rawGame002Config from "../../../assets/gamecfg002/gameconfig.json";
import game002S3SpineAtlasRaw from "../../../assets/game002-s3/Symbol.atlas?raw";
import game002S3SpineTextureUrl from "../../../assets/game002-s3/Symbol.png?url";
import game002S3ReelManifest from "../../../assets/game002-s3/reel.manifest.json";
import game002S3StateTextureManifest from "../../../assets/game002-s3/symbol-state-textures.manifest.json";
import {
  createDefaultSymbolAnimationResolver,
  createGridCellEffectResourcesFromManifest,
  deriveGridCellEffectPoolCapacities,
  createSymbolAnimationCapabilityMapFromManifest,
  createSymbolLandingAppearSymbolsFromManifest,
  createSymbolManifestAnimationResolver,
  createSymbolStatePresetFromManifest,
  createSymbolCascadeWinPresentationMapFromManifest,
  createSymbolValuePresentationResourceBundleFromManifest,
  createSceneLayoutPackageResource,
  createSymbolPackageReelRegistry,
  parseReelManifest,
  type ParsedReelManifest,
  type GridCellEffectResourceMap,
  type ReelSymbolRenderPriorityMap,
  type ReelSymbolAnimationCapabilityMap,
  type ReelSymbolScaleMap,
  type SymbolAnimationResolver,
  type SymbolValuePresentationResourceMap,
  type SymbolStatePreset,
  type SymbolCascadeWinPresentationMap,
  type SceneLayoutPackageResource,
  type ReelSymbolRegistry,
  type SymbolPackageResource,
  type DecodeImageStringImage,
} from "@slotclientengine/rendercore";
import type { SpineBackgroundResource } from "@slotclientengine/rendercore/background";
import {
  GAME002_EMPTY_SYMBOLS,
  createGame002SymbolRenderPriorityMapFromManifest,
  createGame002SymbolScaleMapFromManifest,
  getGame002DisplaySymbolsFromManifest,
} from "./assets.js";
import {
  GAME002_GRID_LAYOUT,
  GAME002_REELS_NAME,
  type Game002FocusRegion,
  type Game002GridLayout,
} from "./game-layout.js";
import { GAME002_BACKGROUND_RESOURCE } from "./background-config.js";
import {
  GAME002_SUPPORTED_SKINS,
  parseGame002SkinId,
  type Game002SkinId,
} from "./skin-id.js";
import {
  symbolValueSpineAtlasModules,
  symbolValueReelStateTextureModules,
  symbolValueSpineSkeletonModules,
  symbolValueSpineTextureModules,
  symbolValueTextImageModules,
  symbolValueImageStringManifestModules,
  symbolValueImageStringImageModules,
} from "./generated/symbol-value-resources.generated.js";

const game002S3NormalModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const game002S3SpinBlurModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.spinBlur.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const game002S3DisabledModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.disabled.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const game002S3SpineSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;
const game002S3ReelEffectSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{Nearwin1,Nearwin2}.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

const game002S3SymbolModules = Object.freeze({
  ...game002S3NormalModules,
  ...game002S3SpinBlurModules,
  ...game002S3DisabledModules,
  ...symbolValueReelStateTextureModules,
});
const game002S3SpineAtlasModules = Object.freeze({
  "../../../assets/game002-s3/Symbol.atlas": game002S3SpineAtlasRaw,
});
const game002S3SpineTextureModules = Object.freeze({
  "../../../assets/game002-s3/Symbol.png": game002S3SpineTextureUrl,
});
const game002S3DisplaySymbols = getGame002DisplaySymbolsFromManifest(
  game002S3StateTextureManifest,
);
const defaultAnimationResolver = createDefaultSymbolAnimationResolver();

export interface Game002SkinConfig {
  readonly id: Game002SkinId;
  readonly label: string;
  readonly reelsName: string;
  readonly rawGameConfig: unknown;
  readonly reelEffectResources: GridCellEffectResourceMap;
  readonly reelEffectPoolCapacities: Readonly<Record<string, number>>;
  readonly stateTextureManifest: unknown;
  readonly reelManifest: ParsedReelManifest;
  readonly displaySymbols: readonly string[];
  readonly emptySymbols: readonly string[];
  readonly symbolScales: ReelSymbolScaleMap;
  readonly symbolRenderPriorities: ReelSymbolRenderPriorityMap;
  readonly symbolAnimationCapabilities: ReelSymbolAnimationCapabilityMap;
  readonly symbolStatePreset: SymbolStatePreset;
  readonly cascadeWinPresentations: SymbolCascadeWinPresentationMap;
  readonly landingAppearSymbols: readonly string[];
  readonly symbolAnimationResolver: SymbolAnimationResolver;
  readonly symbolValuePresentationResources: SymbolValuePresentationResourceMap;
  readonly gridLayout: Game002GridLayout;
  readonly focusRegion: Game002FocusRegion;
  readonly presentation:
    | Readonly<{
        kind: "legacy";
        background: SpineBackgroundResource;
        symbolModules: Record<string, string>;
        spineSkeletonModules: Record<string, unknown>;
        spineAtlasModules: Record<string, string>;
        spineTextureModules: Record<string, string>;
        reelEffectSkeletonModules: Record<string, unknown>;
      }>
    | Readonly<{
        kind: "scene-layout";
        resource: SceneLayoutPackageResource;
        symbolPackage: SymbolPackageResource;
        symbolRegistry: ReelSymbolRegistry;
        initialMode: string;
        awardCelebrationPopup: string;
      }>;
}

export interface Game002Skin1Config extends Game002SkinConfig {
  readonly id: "1";
  readonly presentation: Extract<
    Game002SkinConfig["presentation"],
    { readonly kind: "legacy" }
  >;
  readonly background: SpineBackgroundResource;
  readonly symbolModules: Record<string, string>;
  readonly spineSkeletonModules: Record<string, unknown>;
  readonly spineAtlasModules: Record<string, string>;
  readonly spineTextureModules: Record<string, string>;
  readonly reelEffectSkeletonModules: Record<string, unknown>;
}

const GAME002_SKIN1_CONFIG = createGame002Skin1Config();

function createGame002Skin1Config(): Game002Skin1Config {
  const reelManifest = parseReelManifest(game002S3ReelManifest);
  const reelEffectResources = createGridCellEffectResourcesFromManifest({
    manifest: reelManifest,
    skeletonModules: game002S3ReelEffectSkeletonModules,
    atlasModules: game002S3SpineAtlasModules,
    textureModules: game002S3SpineTextureModules,
  });
  const presentation = Object.freeze({
    kind: "legacy" as const,
    background: GAME002_BACKGROUND_RESOURCE,
    symbolModules: game002S3SymbolModules,
    spineSkeletonModules: game002S3SpineSkeletonModules,
    spineAtlasModules: game002S3SpineAtlasModules,
    spineTextureModules: game002S3SpineTextureModules,
    reelEffectSkeletonModules: game002S3ReelEffectSkeletonModules,
  });
  return Object.freeze({
    id: "1",
    label: "game002-s3",
    reelsName: GAME002_REELS_NAME,
    background: GAME002_BACKGROUND_RESOURCE,
    rawGameConfig: rawGame002Config,
    symbolModules: game002S3SymbolModules,
    spineSkeletonModules: game002S3SpineSkeletonModules,
    spineAtlasModules: game002S3SpineAtlasModules,
    spineTextureModules: game002S3SpineTextureModules,
    reelEffectSkeletonModules: game002S3ReelEffectSkeletonModules,
    reelEffectResources,
    reelEffectPoolCapacities: deriveGridCellEffectPoolCapacities({
      manifest: reelManifest,
      resources: reelEffectResources,
      cellCount: 6 * 9,
    }),
    stateTextureManifest: game002S3StateTextureManifest,
    reelManifest,
    displaySymbols: game002S3DisplaySymbols,
    emptySymbols: GAME002_EMPTY_SYMBOLS,
    symbolScales: createGame002SymbolScaleMapFromManifest({
      stateTextureManifest: game002S3StateTextureManifest,
      displaySymbols: game002S3DisplaySymbols,
      requireExplicitScale: true,
    }),
    symbolRenderPriorities: createGame002SymbolRenderPriorityMapFromManifest({
      stateTextureManifest: game002S3StateTextureManifest,
      displaySymbols: game002S3DisplaySymbols,
    }),
    symbolAnimationCapabilities: createSymbolAnimationCapabilityMapFromManifest(
      {
        manifest: game002S3StateTextureManifest,
        displaySymbols: game002S3DisplaySymbols,
        requiredStates: ["spinBlur", "disabled"],
      },
    ),
    symbolStatePreset: createSymbolStatePresetFromManifest(
      game002S3StateTextureManifest,
    ),
    cascadeWinPresentations: createSymbolCascadeWinPresentationMapFromManifest({
      manifest: game002S3StateTextureManifest,
      displaySymbols: game002S3DisplaySymbols,
      requiredStates: ["spinBlur", "disabled"],
    }),
    landingAppearSymbols: createSymbolLandingAppearSymbolsFromManifest({
      manifest: game002S3StateTextureManifest,
      displaySymbols: game002S3DisplaySymbols,
      requiredStates: ["spinBlur", "disabled"],
    }),
    symbolAnimationResolver: createSymbolManifestAnimationResolver({
      manifest: game002S3StateTextureManifest,
      requiredStates: ["spinBlur", "disabled"],
      vniProjectModules: {},
      vniAssetModules: {},
      spineSkeletonModules: game002S3SpineSkeletonModules,
      spineAtlasModules: game002S3SpineAtlasModules,
      spineTextureModules: game002S3SpineTextureModules,
      fallback: defaultAnimationResolver,
    }),
    symbolValuePresentationResources: Object.freeze({}),
    gridLayout: GAME002_GRID_LAYOUT,
    focusRegion: GAME002_BACKGROUND_RESOURCE.manifest.adaptation.focusRect,
    presentation,
  });
}

export interface Game002SkinResourceOwner {
  destroy(): Promise<void> | void;
}

export async function prepareGame002SkinConfig(
  id: Game002SkinId,
  options: {
    readonly craveFiles?: ReadonlyMap<string, Uint8Array>;
    readonly decodeImage?: DecodeImageStringImage;
  } = {},
): Promise<{
  readonly skin: Game002SkinConfig;
  readonly valuePresentationResourceBundle: Game002SkinResourceOwner;
}> {
  if (id === "2") {
    if (!options.craveFiles) {
      throw new Error("game002 skin=2 requires loaded Crave package files.");
    }
    return prepareGame002Skin2Config(options.craveFiles, options.decodeImage);
  }
  const staticSkin = GAME002_SKIN1_CONFIG;
  const valuePresentationResourceBundle =
    await createSymbolValuePresentationResourceBundleFromManifest({
      manifest: game002S3StateTextureManifest,
      symbolManifestPath: "symbol-state-textures.manifest.json",
      requiredStates: ["spinBlur", "disabled"],
      spineSkeletonModules: symbolValueSpineSkeletonModules,
      spineAtlasModules: symbolValueSpineAtlasModules,
      spineTextureModules: symbolValueSpineTextureModules,
      textImageModules: symbolValueTextImageModules,
      imageStringManifestModules: symbolValueImageStringManifestModules,
      imageStringImageModules: symbolValueImageStringImageModules,
    });
  return Object.freeze({
    skin: Object.freeze({
      ...staticSkin,
      symbolValuePresentationResources:
        valuePresentationResourceBundle.resources,
    }),
    valuePresentationResourceBundle,
  });
}

async function prepareGame002Skin2Config(
  files: ReadonlyMap<string, Uint8Array>,
  decodeImage?: DecodeImageStringImage,
): Promise<{
  readonly skin: Game002SkinConfig;
  readonly valuePresentationResourceBundle: Game002SkinResourceOwner;
}> {
  const resource = await createSceneLayoutPackageResource({
    files,
    ...(decodeImage ? { decodeImage } : {}),
  });
  try {
    const gameModes = resource.manifest.gameModes;
    if (!gameModes) {
      throw new Error("game002 Crave layout must declare gameModes.");
    }
    const initialMode = gameModes.modes.find(
      (mode) => mode.id === gameModes.initialMode,
    );
    if (!initialMode?.symbolPackage) {
      throw new Error(
        "game002 Crave initial mode must declare a symbol package.",
      );
    }
    if (!initialMode.awardCelebrationPopup) {
      throw new Error(
        "game002 Crave initial mode must declare an award celebration popup.",
      );
    }
    const symbolPackage = resource.symbolPackages[initialMode.symbolPackage];
    if (!symbolPackage) {
      throw new Error(
        `game002 Crave symbol package "${initialMode.symbolPackage}" is unavailable.`,
      );
    }
    const geometry = resource.manifest.reels.main;
    const symbolBinding =
      resource.manifest.symbolPackages?.[initialMode.symbolPackage];
    if (!symbolBinding) {
      throw new Error(
        `game002 Crave symbol binding "${initialMode.symbolPackage}" is unavailable.`,
      );
    }
    const placement = geometry?.placements.default;
    if (!geometry || !placement) {
      throw new Error(
        "game002 Crave layout must declare reels.main default geometry.",
      );
    }
    if (geometry.columns !== 6 || geometry.rows !== 9) {
      throw new Error("game002 Crave reels.main geometry must be 6x9.");
    }
    const reelManifest = parseReelManifest(game002S3ReelManifest);
    const reelEffectResources = createGridCellEffectResourcesFromManifest({
      manifest: reelManifest,
      skeletonModules: game002S3ReelEffectSkeletonModules,
      atlasModules: game002S3SpineAtlasModules,
      textureModules: game002S3SpineTextureModules,
    });
    const displaySymbols = symbolPackage.displaySymbols;
    const stateTextureManifest = symbolPackage.rawSymbolManifest;
    const symbolRegistry = await createSymbolPackageReelRegistry(symbolPackage);
    const skin: Game002SkinConfig = Object.freeze({
      id: "2",
      label: "crave",
      reelsName: symbolBinding.reelSet,
      rawGameConfig: symbolPackage.rawGameConfig,
      reelEffectResources,
      reelEffectPoolCapacities: deriveGridCellEffectPoolCapacities({
        manifest: reelManifest,
        resources: reelEffectResources,
        cellCount: geometry.columns * geometry.rows,
      }),
      stateTextureManifest,
      reelManifest,
      displaySymbols,
      emptySymbols: Object.freeze([]),
      symbolScales: symbolPackage.symbolScales,
      symbolRenderPriorities: symbolPackage.symbolRenderPriorities,
      symbolAnimationCapabilities:
        createSymbolAnimationCapabilityMapFromManifest({
          manifest: stateTextureManifest,
          displaySymbols,
          requiredStates: ["spinBlur", "disabled"],
        }),
      symbolStatePreset: symbolPackage.statePreset,
      cascadeWinPresentations:
        createSymbolCascadeWinPresentationMapFromManifest({
          manifest: stateTextureManifest,
          displaySymbols,
          requiredStates: ["spinBlur", "disabled"],
        }),
      landingAppearSymbols: createSymbolLandingAppearSymbolsFromManifest({
        manifest: stateTextureManifest,
        displaySymbols,
        requiredStates: ["spinBlur", "disabled"],
      }),
      symbolAnimationResolver: symbolPackage.animationResolver,
      symbolValuePresentationResources:
        symbolPackage.valuePresentationResources,
      gridLayout: Object.freeze({
        boardFrame: Object.freeze({
          x: placement.x,
          y: placement.y,
          width:
            geometry.columns * geometry.cellSize.width +
            (geometry.columns - 1) * geometry.gap.x,
          height:
            geometry.rows * geometry.cellSize.height +
            (geometry.rows - 1) * geometry.gap.y,
        }),
        cellWidth: geometry.cellSize.width,
        cellHeight: geometry.cellSize.height,
        columnGap: geometry.gap.x,
        rowGap: geometry.gap.y,
      }),
      focusRegion: requireMaximizedFocusRegion(resource),
      presentation: Object.freeze({
        kind: "scene-layout",
        resource,
        symbolPackage,
        symbolRegistry,
        initialMode: initialMode.id,
        awardCelebrationPopup: initialMode.awardCelebrationPopup,
      }),
    });
    return Object.freeze({
      skin,
      valuePresentationResourceBundle: resource,
    });
  } catch (error) {
    await resource.destroy();
    throw error;
  }
}

export function getGame002SkinConfig(id: "1"): Game002Skin1Config;
export function getGame002SkinConfig(id: Game002SkinId): Game002SkinConfig;
export function getGame002SkinConfig(id: Game002SkinId): Game002SkinConfig {
  if (id !== "1") {
    throw new Error(
      'game002 skin "2" is prepared from its loaded scene-layout package.',
    );
  }
  return GAME002_SKIN1_CONFIG;
}

function requireMaximizedFocusRegion(
  resource: SceneLayoutPackageResource,
): Game002FocusRegion {
  const adaptation = resource.manifest.adaptation;
  if (adaptation.mode !== "maximized-focus") {
    throw new Error(
      'game002 Crave layout adaptation must be "maximized-focus".',
    );
  }
  return adaptation.focusRect;
}

export { GAME002_SUPPORTED_SKINS, parseGame002SkinId, type Game002SkinId };
