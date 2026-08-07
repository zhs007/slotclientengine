import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import rawGameConfig from "../../../assets/gamecfg002/gameconfig.json";
import rawAssetsMap from "../../../assets/crave/assets.map.json";
import {
  createDefaultSymbolAnimationResolver,
  createGridCellEffectResourcesFromManifest,
  deriveGridCellEffectPoolCapacities,
  createSymbolAnimationCapabilityMapFromManifest,
  createSymbolCascadeWinPresentationMapFromManifest,
  createSymbolRenderPriorityMapFromManifest,
  createSymbolScaleMapFromManifest,
  createSymbolLandingAppearSymbolsFromManifest,
  createSymbolStatePresetFromManifest,
  getSymbolDisplaySymbolsFromManifest,
  parseImageStringManifest,
  parseSymbolStateTextureManifest,
  type SymbolValuePresentationResourceMap,
} from "@slotclientengine/rendercore";
import {
  GAME002_FOCUS_REGION,
  GAME002_GRID_LAYOUT,
  GAME002_REELS_NAME,
} from "../src/game-layout.js";
import {
  GAME002_REEL_MANIFEST,
  type Game002PackageConfig,
} from "../src/package-config.js";

const CRAVE_ROOT = resolve(process.cwd(), "../../assets/crave");
const logicalFiles = rawAssetsMap.files as Record<
  string,
  { readonly path: string }
>;
const readLogicalJson = (key: string): unknown =>
  JSON.parse(
    readFileSync(resolve(CRAVE_ROOT, requireLogicalPath(key)), "utf8"),
  );
const readLogicalText = (key: string): string =>
  readFileSync(resolve(CRAVE_ROOT, requireLogicalPath(key)), "utf8");
const logicalUrl = (key: string): string =>
  resolve(CRAVE_ROOT, requireLogicalPath(key));
const requireLogicalPath = (key: string): string => {
  const path = logicalFiles[key]?.path;
  if (!path) throw new Error(`missing Crave logical fixture "${key}"`);
  return path;
};
const expectedSymbols = [
  "WL",
  "H1",
  "H2",
  "L1",
  "L2",
  "L3",
  "L4",
  "WM",
  "CN",
  "CM",
  "CO",
  "AF",
  "BN",
] as const;
const sourceStateManifest = readLogicalJson(
  resolveInitialSymbolManifestKey(),
) as {
  readonly symbols: Readonly<Record<string, unknown>>;
};
const rawStateManifest = Object.freeze({
  ...sourceStateManifest,
  symbols: Object.fromEntries(
    expectedSymbols.map((symbol) => [
      symbol,
      sourceStateManifest.symbols[symbol],
    ]),
  ),
});
const rawImageStringManifest = readLogicalJson("image-string.manifest.json");
const displayFixtureSymbols = expectedSymbols.filter(
  (symbol) => symbol !== "CN",
);
const allImageModules = Object.fromEntries(
  Object.keys(logicalFiles)
    .filter((key) => /\.(?:webp|png|jpg|jpeg)$/u.test(key))
    .map((key) => [`./${key}`, logicalUrl(key)]),
);
const normalModules = allImageModules;
const stateModules = allImageModules;
const spineSkeletonModules = Object.fromEntries(
  Object.keys(logicalFiles)
    .filter((key) => key.endsWith(".json"))
    .map((key) => [`./${key}`, readLogicalJson(key)]),
);
const reelEffectSkeletonModules = Object.freeze({
  "./nearwin1": readLogicalJson("nearwin1.json"),
  "./nearwin2": readLogicalJson("nearwin2.json"),
});
const reelEffectResources = createGridCellEffectResourcesFromManifest({
  manifest: GAME002_REEL_MANIFEST,
  skeletonModules: reelEffectSkeletonModules,
  atlasModules: { "./symbol.atlas": readLogicalText("symbol.atlas") },
  textureModules: { "./symbol.png": logicalUrl("symbol.webp") },
});
const reelEffectPoolCapacities = deriveGridCellEffectPoolCapacities({
  manifest: GAME002_REEL_MANIFEST,
  resources: reelEffectResources,
  cellCount: 54,
});

function resolveInitialSymbolManifestKey(): string {
  const layout = JSON.parse(
    readFileSync(resolve(CRAVE_ROOT, "layout.manifest.json"), "utf8"),
  ) as {
    readonly gameModes?: {
      readonly initialMode: string;
      readonly modes: readonly {
        readonly id: string;
        readonly symbolPackage?: string;
      }[];
    };
    readonly symbolPackages?: Readonly<
      Record<string, { readonly manifest: string }>
    >;
  };
  const initialMode = layout.gameModes?.modes.find(
    (mode) => mode.id === layout.gameModes?.initialMode,
  );
  const packageKey = initialMode?.symbolPackage;
  const packageManifestKey = packageKey
    ? layout.symbolPackages?.[packageKey]?.manifest
    : undefined;
  if (!packageManifestKey)
    throw new Error("Crave fixture is missing its initial symbol package.");
  const packageManifest = readLogicalJson(packageManifestKey) as {
    readonly entrypoints?: { readonly symbolManifest?: string };
  };
  const symbolManifestKey = packageManifest.entrypoints?.symbolManifest;
  if (!symbolManifestKey)
    throw new Error("Crave fixture symbol package has no symbol manifest.");
  return symbolManifestKey;
}

type TestGame002PackageConfig = Game002PackageConfig & {
  readonly symbolModules: Record<string, string>;
  readonly spineSkeletonModules: Record<string, unknown>;
  readonly reelEffectSkeletonModules: Record<string, unknown>;
};

export function getTestGame002PackageConfig(): TestGame002PackageConfig {
  const displaySymbols = getSymbolDisplaySymbolsFromManifest(rawStateManifest, {
    requiredStates: ["spinBlur", "disabled"],
  });
  return Object.freeze({
    label: "test-game002",
    reelsName: GAME002_REELS_NAME,
    rawGameConfig,
    reelEffectResources,
    reelEffectPoolCapacities,
    stateTextureManifest: rawStateManifest,
    reelManifest: GAME002_REEL_MANIFEST,
    displaySymbols,
    emptySymbols: Object.freeze([]),
    symbolScales: createSymbolScaleMapFromManifest({
      manifest: rawStateManifest,
      displaySymbols,
      requiredStates: ["spinBlur", "disabled"],
      requireExplicitScale: true,
    }),
    symbolRenderPriorities: createSymbolRenderPriorityMapFromManifest({
      manifest: rawStateManifest,
      displaySymbols,
      requiredStates: ["spinBlur", "disabled"],
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
    }) as Game002PackageConfig["presentation"],
  } satisfies TestGame002PackageConfig);
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
  if (!("tiers" in presentation.text)) {
    throw new Error("game002 CN test fixture requires legacy tier bindings.");
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
            specialValueImages: Object.freeze({}),
          }),
        ),
      ),
    }),
  });
}
