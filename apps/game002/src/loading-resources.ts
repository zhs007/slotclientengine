import game002BackgroundUrl from "../../../assets/game002-s3/bg.jpg?url";
import game002SpineAtlasUrl from "../../../assets/game002-s3/Symbol.atlas?url";
import game002SpineTextureUrl from "../../../assets/game002-s3/Symbol.png?url";
import game002SymbolManifestUrl from "../../../assets/game002-s3/symbol-state-textures.manifest.json?url";
import game002WinAmountManifestUrl from "../../../assets/game002-s3/win-amount/win-amount.manifest.json?url";
import type { GameLoadingResource } from "@slotclientengine/gameloading";

export const GAME002_RUNTIME_MODULE_RESOURCE_ID = "game002-runtime-module";

const normalModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN}.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const spinBlurModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN}.spinBlur.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const disabledModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CN,CM,CO,AF,BN}.disabled.png",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const skeletonModules = import.meta.glob(
  "../../../assets/game002-s3/{WL,H1,H2,L1,L2,L3,L4,WM,CM,CO,AF,BN}.json",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const winAmountProjectModules = import.meta.glob(
  "../../../assets/game002-s3/win-amount/{bigwin,superwin,megawin}.json",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;
const winAmountAssetModules = import.meta.glob(
  "../../../assets/game002-s3/win-amount/assets/*.{png,jpg,jpeg,webp}",
  { eager: true, import: "default", query: "?url" },
) as Record<string, string>;

export interface Game002PreparedLoadingSessionLike {
  readonly liveSession: { disconnect(): void };
}

export interface Game002EnteredGameLike {
  destroy(): void;
}

export interface Game002RuntimeModule {
  prepareGame002At99(options: {
    readonly search: string;
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
    typeof runtimeModule.prepareGame002At99 !== "function" ||
    typeof runtimeModule.enterGame002 !== "function"
  ) {
    throw new Error("game002 runtime module is missing required exports.");
  }
  return runtimeModule as unknown as Game002RuntimeModule;
}

function createLoadingResourceUrls(): readonly GameLoadingResource[] {
  const pathResources: readonly GameLoadingResource[] = Object.freeze([
    Object.freeze({ id: "game002-bg", url: game002BackgroundUrl, weight: 8 }),
    Object.freeze({
      id: "game002-symbol-manifest",
      url: game002SymbolManifestUrl,
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
      id: "game002-win-amount-vni-projects",
      modules: winAmountProjectModules,
    },
    { id: "game002-win-amount-vni-assets", modules: winAmountAssetModules },
  ]);
  const resources: GameLoadingResource[] = [];
  const seenIds = new Set<string>();
  const seenUrls = new Set<string>();
  const add = (resource: GameLoadingResource) => {
    if (seenIds.has(resource.id)) {
      throw new Error(
        `Duplicate game002 loading resource id "${resource.id}".`,
      );
    }
    seenIds.add(resource.id);
    if (!resource.url || seenUrls.has(resource.url)) {
      throw new Error(
        `Duplicate or missing game002 loading resource URL for "${resource.id}".`,
      );
    }
    seenUrls.add(resource.url);
    resources.push(Object.freeze(resource));
  };
  for (const resource of pathResources) {
    add(resource);
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
  return Object.freeze(resources);
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
