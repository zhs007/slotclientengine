import game002ReelManifest from "../config/reel-presentation.manifest.json";
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
  GAME002_CRAVE_ASSETS_MAP_FILES,
  resolveGame002CraveResourceUrl,
} from "./crave-package-paths.js";

export interface Game002PackageConfig {
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

export interface Game002PackageResourceOwner {
  destroy(): Promise<void> | void;
}

export const GAME002_REEL_MANIFEST = parseReelManifest(game002ReelManifest);

export async function prepareGame002PackageConfig(
  options: {
    readonly craveFiles?: ReadonlyMap<string, Uint8Array>;
    readonly decodeImage?: DecodeImageStringImage;
  } = {},
): Promise<{
  readonly packageConfig: Game002PackageConfig;
  readonly resourceOwner: Game002PackageResourceOwner;
}> {
  if (!options.craveFiles)
    throw new Error("game002 requires loaded Crave package files.");
  return prepareGame002Package(options.craveFiles, options.decodeImage);
}

async function prepareGame002Package(
  files: ReadonlyMap<string, Uint8Array>,
  decodeImage?: DecodeImageStringImage,
): Promise<{
  readonly packageConfig: Game002PackageConfig;
  readonly resourceOwner: Game002PackageResourceOwner;
}> {
  const resource = await createSceneLayoutPackageResource({
    files,
    lazyRuntimeResources: true,
    loadRuntimeResourceBytes: loadCraveRuntimeResourceBytes,
    ...(decodeImage ? { decodeImage } : {}),
  });
  try {
    const [nearwin1, nearwin2] = await Promise.all([
      resource.loadRuntimeResource("nearwin1", "spine"),
      resource.loadRuntimeResource("nearwin2", "spine"),
    ]);
    const reelEffectResources = createGridCellEffectResourcesFromManifest({
      manifest: GAME002_REEL_MANIFEST,
      skeletonModules: Object.freeze({
        "./nearwin1": nearwin1.skeleton,
        "./nearwin2": nearwin2.skeleton,
      }),
      atlasModules: Object.freeze({ "./symbol.atlas": nearwin1.atlasText }),
      textureModules: Object.freeze({
        "./symbol.png": requireSpineTexture(nearwin1, "Symbol.png"),
      }),
    });
    const reelEffectPoolCapacities = deriveGridCellEffectPoolCapacities({
      manifest: GAME002_REEL_MANIFEST,
      resources: reelEffectResources,
      cellCount: 6 * 9,
    });
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
    const packageConfig: Game002PackageConfig = Object.freeze({
      label: "crave",
      reelsName: symbolBinding.reelSet,
      rawGameConfig: symbolPackage.rawGameConfig,
      reelEffectResources,
      reelEffectPoolCapacities,
      stateTextureManifest,
      reelManifest: GAME002_REEL_MANIFEST,
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
    return Object.freeze({ packageConfig, resourceOwner: resource });
  } catch (error) {
    await resource.destroy();
    throw error;
  }
}

async function loadCraveRuntimeResourceBytes(
  logicalKey: string,
): Promise<Uint8Array> {
  const physicalPath = GAME002_CRAVE_ASSETS_MAP_FILES[logicalKey]?.path;
  if (!physicalPath)
    throw new Error(
      `game002 Crave logical resource "${logicalKey}" is unavailable.`,
    );
  const url = resolveGame002CraveResourceUrl(physicalPath);
  const response = await fetch(url);
  if (!response.ok)
    throw new Error(
      `game002 Crave runtime resource fetch failed (${response.status}): ${logicalKey}.`,
    );
  return new Uint8Array(await response.arrayBuffer());
}

function requireSpineTexture(
  resource: Extract<
    import("@slotclientengine/rendercore").SceneLayoutRuntimeResource,
    { readonly kind: "spine" }
  >,
  page: string,
): string {
  const url = resource.textureUrls[page];
  if (!url)
    throw new Error(
      `game002 runtime Spine texture page "${page}" is unavailable.`,
    );
  return url;
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
