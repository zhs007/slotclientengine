import rawImageStringManifest from "../../../assets/game002-s3/dependencies/image-strings/cn-digits/image-string.manifest.json";
import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import rawReelManifest from "../../../assets/game002-s3/reel.manifest.json";
import rawStateManifest from "../../../assets/game002-s3/symbol-state-textures.manifest.json";
import {
  createDefaultSymbolAnimationResolver,
  createSymbolAnimationCapabilityMapFromManifest,
  createSymbolCascadeWinPresentationMapFromManifest,
  createSymbolLandingAppearSymbolsFromManifest,
  createSymbolStatePresetFromManifest,
  parseImageStringManifest,
  parseReelManifest,
  parseSymbolStateTextureManifest,
  type SymbolValuePresentationResourceMap,
} from "@slotclientengine/rendercore";
import {
  createGame002SymbolRenderPriorityMapFromManifest,
  createGame002SymbolScaleMapFromManifest,
  getGame002DisplaySymbolsFromManifest,
} from "../src/assets.js";
import {
  GAME002_FOCUS_REGION,
  GAME002_GRID_LAYOUT,
  GAME002_REELS_NAME,
} from "../src/game-layout.js";
import {
  GAME002_REEL_PRESENTATION_EXTENSION,
  type Game002SkinConfig,
} from "../src/skin-config.js";

const normalModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const stateModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN}.{spinBlur,disabled}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const spineSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;
const reelEffectSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{Nearwin1,Nearwin2}.json",
  { eager: true, import: "default" },
) as Record<string, unknown>;

type TestGame002SkinConfig = Game002SkinConfig & {
  readonly symbolModules: Record<string, string>;
  readonly spineSkeletonModules: Record<string, unknown>;
  readonly reelEffectSkeletonModules: Record<string, unknown>;
};

export function getTestGame002SkinConfig(): TestGame002SkinConfig {
  const displaySymbols = getGame002DisplaySymbolsFromManifest(rawStateManifest);
  return Object.freeze({
    id: "2",
    label: "test-game002",
    reelsName: GAME002_REELS_NAME,
    rawGameConfig,
    reelEffectResources:
      GAME002_REEL_PRESENTATION_EXTENSION.reelEffectResources,
    reelEffectPoolCapacities:
      GAME002_REEL_PRESENTATION_EXTENSION.reelEffectPoolCapacities,
    stateTextureManifest: rawStateManifest,
    reelManifest: parseReelManifest(rawReelManifest),
    displaySymbols,
    emptySymbols: Object.freeze([]),
    symbolScales: createGame002SymbolScaleMapFromManifest({
      stateTextureManifest: rawStateManifest,
      displaySymbols,
      requireExplicitScale: true,
    }),
    symbolRenderPriorities: createGame002SymbolRenderPriorityMapFromManifest({
      stateTextureManifest: rawStateManifest,
      displaySymbols,
    }),
    symbolAnimationCapabilities: createSymbolAnimationCapabilityMapFromManifest(
      {
        manifest: rawStateManifest,
        displaySymbols,
        requiredStates: ["spinBlur", "disabled"],
      },
    ),
    symbolStatePreset: createSymbolStatePresetFromManifest(rawStateManifest),
    cascadeWinPresentations: createSymbolCascadeWinPresentationMapFromManifest({
      manifest: rawStateManifest,
      displaySymbols,
      requiredStates: ["spinBlur", "disabled"],
    }),
    landingAppearSymbols: createSymbolLandingAppearSymbolsFromManifest({
      manifest: rawStateManifest,
      displaySymbols,
      requiredStates: ["spinBlur", "disabled"],
    }),
    symbolAnimationResolver: createDefaultSymbolAnimationResolver(),
    symbolValuePresentationResources:
      createTestValueResources(rawStateManifest),
    gridLayout: GAME002_GRID_LAYOUT,
    focusRegion: GAME002_FOCUS_REGION,
    symbolModules: Object.freeze({ ...normalModules, ...stateModules }),
    spineSkeletonModules: Object.freeze(spineSkeletonModules),
    reelEffectSkeletonModules: Object.freeze(reelEffectSkeletonModules),
    presentation: Object.freeze({
      kind: "scene-layout",
    }) as Game002SkinConfig["presentation"],
  } satisfies TestGame002SkinConfig);
}

function createTestValueResources(
  rawManifest: unknown,
): SymbolValuePresentationResourceMap {
  const parsed = parseSymbolStateTextureManifest(rawManifest);
  const entry = parsed.symbols.CN;
  const presentation = entry.valuePresentation;
  if (!presentation || presentation.text.type !== "image-string") {
    throw new Error("game002 CN test fixture requires ImgNumber.");
  }
  const imageStringResource = Object.freeze({
    manifest: parseImageStringManifest(rawImageStringManifest),
    textures: Object.freeze({}),
    destroyed: false,
    assertUsable() {},
    async destroy() {},
  });
  return Object.freeze({
    CN: Object.freeze({
      symbol: "CN",
      defaultValues: presentation.defaultValues,
      activeSpineAnimations: Object.freeze(
        Object.fromEntries(
          Object.entries(entry.animations).flatMap(([state, animation]) =>
            animation?.kind === "activeSpine"
              ? [[state, animation.playback]]
              : [],
          ),
        ),
      ),
      tiers: Object.freeze(
        presentation.tiers.map((tier) =>
          Object.freeze({
            ...(tier.maxExclusive === undefined
              ? {}
              : { maxExclusive: tier.maxExclusive }),
            spec: tier.animation,
            skeleton: {},
            atlasText: "Symbol.png\n",
            textureUrl: "/Symbol.png",
            atlasPage: "Symbol.png",
          }),
        ),
      ),
      text: presentation.text,
      textImageUrls: Object.freeze({}),
      imageStringTierBindings: Object.freeze(
        presentation.text.tiers.map((binding) =>
          Object.freeze({
            resourcePath: binding.resource,
            resource: imageStringResource,
            slot: binding.slot,
            anchor: binding.anchor,
            transform: binding.transform,
            followSlotColor: binding.followSlotColor,
          }),
        ),
      ),
    }),
  });
}
