import game002S3SpineAtlasRaw from "../../../assets/game002-s3/Symbol.atlas?raw";
import game002S3SpineTextureUrl from "../../../assets/game002-s3/Symbol.png?url";
import game002S3ReelManifest from "../../../assets/game002-s3/reel.manifest.json";
import {
  createGridCellEffectResourcesFromManifest,
  deriveGridCellEffectPoolCapacities,
  createSymbolAnimationCapabilityMapFromManifest,
  createSymbolLandingAppearSymbolsFromManifest,
  createSymbolCascadeWinPresentationMapFromManifest,
  createSceneLayoutPackageResource,
  createSymbolPackageReelRegistry,
  parseReelManifest,
  type DecodeImageStringImage,
  type GridCellEffectResourceMap,
  type ParsedReelManifest,
  type ReelSymbolAnimationCapabilityMap,
  type ReelSymbolRegistry,
  type ReelSymbolRenderPriorityMap,
  type ReelSymbolScaleMap,
  type SceneLayoutPackageResource,
  type SymbolAnimationResolver,
  type SymbolCascadeWinPresentationMap,
  type SymbolPackageResource,
  type SymbolStatePreset,
  type SymbolValuePresentationResourceMap,
} from "@slotclientengine/rendercore";
import type { Game002FocusRegion, Game002GridLayout } from "./game-layout.js";
import {
  GAME002_SUPPORTED_SKINS,
  parseGame002SkinId,
  type Game002SkinId,
} from "./skin-id.js";

const game002NearwinSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{Nearwin1,Nearwin2}.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;
const game002NearwinAtlasModules = Object.freeze({
  "../../../assets/game002-s3/Symbol.atlas": game002S3SpineAtlasRaw,
});
const game002NearwinTextureModules = Object.freeze({
  "../../../assets/game002-s3/Symbol.png": game002S3SpineTextureUrl,
});

export interface Game002SkinConfig {
  readonly id: "2";
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
  readonly presentation: Readonly<{
    kind: "scene-layout";
    resource: SceneLayoutPackageResource;
    symbolPackage: SymbolPackageResource;
    symbolRegistry: ReelSymbolRegistry;
    initialMode: string;
    awardCelebrationPopup: string;
  }>;
}

export interface Game002SkinResourceOwner {
  destroy(): Promise<void> | void;
}

export const GAME002_REEL_PRESENTATION_EXTENSION = (() => {
  const reelManifest = parseReelManifest(game002S3ReelManifest);
  const reelEffectResources = createGridCellEffectResourcesFromManifest({
    manifest: reelManifest,
    skeletonModules: game002NearwinSkeletonModules,
    atlasModules: game002NearwinAtlasModules,
    textureModules: game002NearwinTextureModules,
  });
  return Object.freeze({
    reelManifest,
    reelEffectResources,
    reelEffectPoolCapacities: deriveGridCellEffectPoolCapacities({
      manifest: reelManifest,
      resources: reelEffectResources,
      cellCount: 6 * 9,
    }),
  });
})();

export async function prepareGame002SkinConfig(
  id: Game002SkinId,
  options: {
    readonly craveFiles?: ReadonlyMap<string, Uint8Array>;
    readonly decodeImage?: DecodeImageStringImage;
  } = {},
): Promise<{
  readonly skin: Game002SkinConfig;
  readonly resourceOwner: Game002SkinResourceOwner;
}> {
  if (id !== "2")
    throw new Error('game002 production configuration only supports skin "2".');
  if (!options.craveFiles)
    throw new Error("game002 skin=2 requires loaded Crave package files.");
  return prepareGame002Skin2Config(options.craveFiles, options.decodeImage);
}

async function prepareGame002Skin2Config(
  files: ReadonlyMap<string, Uint8Array>,
  decodeImage?: DecodeImageStringImage,
): Promise<{
  readonly skin: Game002SkinConfig;
  readonly resourceOwner: Game002SkinResourceOwner;
}> {
  const resource = await createSceneLayoutPackageResource({
    files,
    ...(decodeImage ? { decodeImage } : {}),
  });
  try {
    const gameModes = resource.manifest.gameModes;
    if (!gameModes)
      throw new Error("game002 Crave layout must declare gameModes.");
    const initialMode = gameModes.modes.find(
      (mode) => mode.id === gameModes.initialMode,
    );
    if (!initialMode?.symbolPackage)
      throw new Error(
        "game002 Crave initial mode must declare a symbol package.",
      );
    if (!initialMode.awardCelebrationPopup)
      throw new Error(
        "game002 Crave initial mode must declare an award celebration popup.",
      );
    const symbolPackage = resource.symbolPackages[initialMode.symbolPackage];
    if (!symbolPackage)
      throw new Error(
        `game002 Crave symbol package "${initialMode.symbolPackage}" is unavailable.`,
      );
    const geometry = resource.manifest.reels.main;
    const symbolBinding =
      resource.manifest.symbolPackages?.[initialMode.symbolPackage];
    const placement = geometry?.placements.default;
    if (!symbolBinding)
      throw new Error(
        `game002 Crave symbol binding "${initialMode.symbolPackage}" is unavailable.`,
      );
    if (!geometry || !placement)
      throw new Error(
        "game002 Crave layout must declare reels.main default geometry.",
      );
    if (geometry.columns !== 6 || geometry.rows !== 9)
      throw new Error("game002 Crave reels.main geometry must be 6x9.");

    const displaySymbols = symbolPackage.displaySymbols;
    const stateTextureManifest = symbolPackage.rawSymbolManifest;
    const symbolRegistry = await createSymbolPackageReelRegistry(symbolPackage);
    const skin: Game002SkinConfig = Object.freeze({
      id: "2",
      label: "crave",
      reelsName: symbolBinding.reelSet,
      rawGameConfig: symbolPackage.rawGameConfig,
      reelEffectResources:
        GAME002_REEL_PRESENTATION_EXTENSION.reelEffectResources,
      reelEffectPoolCapacities:
        GAME002_REEL_PRESENTATION_EXTENSION.reelEffectPoolCapacities,
      stateTextureManifest,
      reelManifest: GAME002_REEL_PRESENTATION_EXTENSION.reelManifest,
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
    return Object.freeze({ skin, resourceOwner: resource });
  } catch (error) {
    await resource.destroy();
    throw error;
  }
}

function requireMaximizedFocusRegion(
  resource: SceneLayoutPackageResource,
): Game002FocusRegion {
  const adaptation = resource.manifest.adaptation;
  if (adaptation.mode !== "maximized-focus")
    throw new Error(
      'game002 Crave layout adaptation must be "maximized-focus".',
    );
  return adaptation.focusRect;
}

export { GAME002_SUPPORTED_SKINS, parseGame002SkinId, type Game002SkinId };
