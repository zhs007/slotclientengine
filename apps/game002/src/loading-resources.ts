import game002BackgroundAtlasUrl from "../../../assets/game002-s3/BG.atlas?url";
import game002BackgroundSkeletonUrl from "../../../assets/game002-s3/BG.json?url";
import game002BackgroundManifestUrl from "../../../assets/game002-s3/background.manifest.json?url";
import game002ReelManifestUrl from "../../../assets/game002-s3/reel.manifest.json?url";
import game002SpineAtlasUrl from "../../../assets/game002-s3/Symbol.atlas?url";
import game002SpineTextureUrl from "../../../assets/game002-s3/Symbol.png?url";
import game002SymbolManifestUrl from "../../../assets/game002-s3/symbol-state-textures.manifest.json?url";
import game002WinAmountManifestUrl from "../../../assets/game002-s3/win-amount/win-amount.manifest.json?url";
import type { GameLoadingResource } from "@slotclientengine/gameloading";
import { symbolValueLoadingResources } from "./generated/symbol-value-resources.generated.js";

export const GAME002_RUNTIME_MODULE_RESOURCE_ID = "game002-runtime-module";

const normalModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const spinBlurModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.spinBlur.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const disabledModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.disabled.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const skeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.json",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const reelEffectSkeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{Nearwin1,Nearwin2}.json",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const rawBackgroundTextureModules = import.meta.glob(
  "../../../assets/game002-s3/{BG,BG_2,BG_3,BG_4,BG_5,BG_6,BG_7,BG_8}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const backgroundTextureModules = createAtlasPageUrlModules(
  rawBackgroundTextureModules,
);
const winAmountProjectModules = import.meta.glob(
  "../../../assets/game002-s3/win-amount/{bigwin,superwin,megawin}.json",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const winAmountAssetModules = import.meta.glob(
  "../../../assets/game002-s3/win-amount/assets/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const symbolValuePixiTextureUrls = new Set(
  symbolValueLoadingResources
    .filter(
      (resource) =>
        resource.kind === "texture" ||
        resource.kind === "state-texture" ||
        resource.kind === "image-string-glyph",
    )
    .map((resource) => resource.url),
);

export interface Game002PreparedLoadingSessionLike {
  readonly readiness: { destroy(): void };
}

export interface Game002EnteredGameLike {
  destroy(): Promise<void>;
}

export interface Game002RuntimeModule {
  finalizeGame002At99(options: {
    readonly readinessResult: import("./game002-bootstrap.js").Game002ReadinessResult;
    readonly signal: AbortSignal;
  }): Promise<Game002PreparedLoadingSessionLike>;
  enterGame002(options: {
    readonly root: HTMLElement;
    readonly prepared: Game002PreparedLoadingSessionLike;
  }): Promise<Game002EnteredGameLike>;
}

interface LoadingGlobGroup {
  readonly id: string;
  readonly modules: Record<string, string>;
  readonly weight?: number;
}

export const GAME002_LOADING_RESOURCE_URLS = createLoadingResourceUrls();

export function deduplicateGame002LoadingResourceUrls(
  candidates: readonly GameLoadingResource[],
): readonly GameLoadingResource[] {
  const resources: GameLoadingResource[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  for (const resource of candidates) {
    if (seenIds.has(resource.id)) {
      throw new Error(
        `Duplicate game002 loading resource id "${resource.id}".`,
      );
    }
    seenIds.add(resource.id);
    if (!resource.url) {
      throw new Error(
        `Missing game002 loading resource URL for "${resource.id}".`,
      );
    }
    if (seenUrls.has(resource.url)) {
      continue;
    }
    seenUrls.add(resource.url);
    resources.push(Object.freeze(resource));
  }
  return Object.freeze(resources);
}

export function createGame002LoadingResources(): readonly GameLoadingResource[] {
  return Object.freeze([
    ...GAME002_LOADING_RESOURCE_URLS,
    Object.freeze({
      id: GAME002_RUNTIME_MODULE_RESOURCE_ID,
      weight: 10,
      load: () => import("./game-entry.js"),
    } satisfies GameLoadingResource),
  ]);
}

export function readGame002RuntimeModule(
  loadedResources: ReadonlyMap<string, unknown>,
): Game002RuntimeModule {
  const runtimeModule = loadedResources.get(GAME002_RUNTIME_MODULE_RESOURCE_ID);
  if (!isRecord(runtimeModule)) {
    throw new Error("game002 runtime module was not loaded.");
  }
  if (
    typeof runtimeModule.finalizeGame002At99 !== "function" ||
    typeof runtimeModule.enterGame002 !== "function"
  ) {
    throw new Error("game002 runtime module is missing required exports.");
  }
  return runtimeModule as unknown as Game002RuntimeModule;
}

function createLoadingResourceUrls(): readonly GameLoadingResource[] {
  const pathResources: readonly GameLoadingResource[] = Object.freeze([
    Object.freeze({
      id: "game002-background-manifest",
      url: game002BackgroundManifestUrl,
    }),
    Object.freeze({
      id: "game002-background-spine-skeleton",
      url: game002BackgroundSkeletonUrl,
    }),
    Object.freeze({
      id: "game002-background-spine-atlas",
      url: game002BackgroundAtlasUrl,
    }),
    Object.freeze({
      id: "game002-symbol-manifest",
      url: game002SymbolManifestUrl,
    }),
    Object.freeze({
      id: "game002-reel-manifest",
      url: game002ReelManifestUrl,
    }),
    Object.freeze({
      id: "game002-symbol-spine-atlas",
      url: game002SpineAtlasUrl,
    }),
    Object.freeze({
      id: "game002-symbol-spine-texture",
      url: game002SpineTextureUrl,
      weight: 3,
    }),
    Object.freeze({
      id: "game002-win-amount-manifest",
      url: game002WinAmountManifestUrl,
    }),
  ]);
  const globGroups: readonly LoadingGlobGroup[] = Object.freeze([
    {
      id: "game002-background-spine-textures",
      modules: backgroundTextureModules,
      weight: 8,
    },
    { id: "game002-symbol-normal-pngs", modules: normalModules, weight: 10 },
    {
      id: "game002-symbol-spin-blur-pngs",
      modules: spinBlurModules,
      weight: 6,
    },
    {
      id: "game002-symbol-disabled-pngs",
      modules: disabledModules,
      weight: 6,
    },
    { id: "game002-symbol-spine-skeletons", modules: skeletonModules },
    {
      id: "game002-reel-effect-spine-skeletons",
      modules: reelEffectSkeletonModules,
    },
    {
      id: "game002-win-amount-vni-projects",
      modules: winAmountProjectModules,
    },
    { id: "game002-win-amount-vni-assets", modules: winAmountAssetModules },
  ]);
  const candidates: GameLoadingResource[] = [];
  const add = (resource: GameLoadingResource) => {
    candidates.push(resource);
  };
  for (const resource of pathResources) {
    add(resource);
  }
  for (const resource of symbolValueLoadingResources) {
    add({
      id: `game002-symbol-value-${resource.kind}:${resource.path.slice(2)}`,
      url: resource.url,
    });
  }
  for (const group of globGroups) {
    const entries = Object.entries(group.modules).sort(([left], [right]) =>
      left.localeCompare(right),
    );
    if (entries.length === 0) {
      throw new Error(`game002 loading glob "${group.id}" matched no files.`);
    }
    const weight =
      group.weight === undefined ? undefined : group.weight / entries.length;
    for (const [modulePath, url] of entries) {
      add({
        id: `${group.id}:${getBaseName(modulePath)}`,
        url,
        ...(weight === undefined ? {} : { weight }),
      });
    }
  }
  return Object.freeze(
    deduplicateGame002LoadingResourceUrls(candidates).map(
      withGame002PixiTextureLoader,
    ),
  );
}

function withGame002PixiTextureLoader(
  resource: GameLoadingResource,
): GameLoadingResource {
  const url = resource.url;
  if (!url || !symbolValuePixiTextureUrls.has(url)) {
    return resource;
  }
  return Object.freeze({
    ...resource,
    load: () => loadGame002PixiTexture(url),
  });
}

async function loadGame002PixiTexture(url: string): Promise<unknown> {
  const { Assets } = await import("pixi.js");
  return Assets.load(url);
}

function getBaseName(modulePath: string): string {
  const name = modulePath.split("/").at(-1);
  if (!name) {
    throw new Error(
      `Cannot derive game002 loading basename from "${modulePath}".`,
    );
  }
  return name;
}

function createAtlasPageUrlModules(
  modules: Readonly<Record<string, string>>,
): Readonly<Record<string, string>> {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(modules).map(([modulePath, url]) => {
        const page = getBaseName(modulePath);
        const separator = url.includes("?") ? "&" : "?";
        return [
          modulePath,
          `${url}${separator}spineAtlasPage=${encodeURIComponent(page)}`,
        ];
      }),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
