import craveAssetsMap from "../../../assets/crave/assets.map.json";

export const GAME002_CRAVE_ROOT_FILES = Object.freeze([
  "layout.manifest.json",
  "assets.map.json",
] as const);

export const GAME002_CRAVE_ASSETS_MAP_FILES: Readonly<
  Record<string, Readonly<{ readonly path: string }>>
> = craveAssetsMap.files;

export const GAME002_CRAVE_DEFERRED_PHYSICAL_PATHS = new Set(
  ["nearwin1.json", "nearwin2.json", "nearwin3.json"].flatMap((key) => {
    const path = GAME002_CRAVE_ASSETS_MAP_FILES[key]?.path;
    return typeof path === "string" ? [path] : [];
  }),
);

export function listGame002CravePhysicalPaths(): readonly string[] {
  return Object.freeze([
    ...GAME002_CRAVE_ROOT_FILES,
    ...new Set(
      Object.values(GAME002_CRAVE_ASSETS_MAP_FILES).map((asset) => asset.path),
    ),
  ]);
}

export function resolveGame002CraveResourceUrl(path: string): string {
  assertCanonicalCravePath(path);
  return new URL(path, getGame002CravePackageBaseUrl()).href;
}

function getGame002CravePackageBaseUrl(): URL {
  if (typeof document === "undefined" || !document.baseURI) {
    throw new Error("game002 Crave package URL requires document.baseURI.");
  }
  return new URL("./", document.baseURI);
}

function assertCanonicalCravePath(path: string): void {
  if (
    path.length === 0 ||
    path.startsWith("/") ||
    path.endsWith("/") ||
    path.includes("\\") ||
    path.split("/").some((part) => part === "" || part === "." || part === "..")
  ) {
    throw new Error(`game002 Crave resource path "${path}" is not canonical.`);
  }
}
