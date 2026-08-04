import { readFileSync } from "node:fs";
import { resolve } from "node:path";

interface AssetsMap {
  readonly files: Readonly<
    Record<
      string,
      {
        readonly path: string;
        readonly mediaType: string;
      }
    >
  >;
}

interface SymbolStateManifest {
  readonly symbols: Readonly<
    Record<
      string,
      {
        readonly normal: string;
        readonly spinBlur: string;
        readonly disabled: string;
        readonly animations?: Readonly<
          Record<
            string,
            {
              readonly project?: string;
              readonly skeleton?: string;
              readonly atlas?: string;
              readonly texture?: string;
            }
          >
        >;
      }
    >
  >;
}

export const MINECART2_ROOT = resolve(process.cwd(), "../../assets/minecart2");

const MINECART2_ASSETS_MAP = JSON.parse(
  readFileSync(resolve(MINECART2_ROOT, "assets.map.json"), "utf8"),
) as AssetsMap;

export function getMinecart2LogicalEntry(logicalPath: string): {
  readonly logicalPath: string;
  readonly physicalPath: string;
  readonly mediaType: string;
} {
  const normalized = logicalPath.replace(/^\.\//u, "");
  const entry = MINECART2_ASSETS_MAP.files[normalized];
  if (!entry) {
    throw new Error(`Minecart2 logical asset "${normalized}" is unavailable.`);
  }
  return Object.freeze({
    logicalPath: normalized,
    physicalPath: resolve(MINECART2_ROOT, entry.path),
    mediaType: entry.mediaType,
  });
}

export function readMinecart2LogicalBytes(
  logicalPath: string,
): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(
    readFileSync(getMinecart2LogicalEntry(logicalPath).physicalPath),
  );
}

export function readMinecart2LogicalText(logicalPath: string): string {
  return readFileSync(
    getMinecart2LogicalEntry(logicalPath).physicalPath,
    "utf8",
  );
}

export function readMinecart2LogicalJson(logicalPath: string): unknown {
  return JSON.parse(readMinecart2LogicalText(logicalPath)) as unknown;
}

export function getMinecart2SymbolResourcePath(
  symbol: string,
  resource:
    | "normal"
    | "spinBlur"
    | "disabled"
    | "skeleton"
    | "atlas"
    | "texture",
): string {
  const manifest = readSymbolStateManifest();
  const spec = manifest.symbols[symbol];
  if (!spec) throw new Error(`Minecart2 symbol "${symbol}" is unavailable.`);
  if (
    resource === "normal" ||
    resource === "spinBlur" ||
    resource === "disabled"
  ) {
    return spec[resource].replace(/^\.\//u, "");
  }
  for (const animation of Object.values(spec.animations ?? {})) {
    const path = animation[resource];
    if (path) return path.replace(/^\.\//u, "");
  }
  throw new Error(`Minecart2 symbol "${symbol}" has no ${resource} resource.`);
}

export function readMinecart2SymbolBytes(
  symbol: string,
  resource: Parameters<typeof getMinecart2SymbolResourcePath>[1],
): Uint8Array<ArrayBuffer> {
  return readMinecart2LogicalBytes(
    getMinecart2SymbolResourcePath(symbol, resource),
  );
}

export function readMinecart2SymbolFixtureBytes(
  name: string,
): Uint8Array<ArrayBuffer> {
  const match =
    /^(WL|H[1-5]|CL|SC|L[1-5])(?:\.(spinBlur|disabled))?\.png$/u.exec(name);
  if (match) {
    return readMinecart2SymbolBytes(
      match[1],
      match[2] === "spinBlur" || match[2] === "disabled" ? match[2] : "normal",
    );
  }
  const skeleton = /^(WL|H[1-5]|CL|SC)\.json$/u.exec(name);
  if (skeleton) return readMinecart2SymbolBytes(skeleton[1], "skeleton");
  const project = /^(L[1-5])-wins\.json$/u.exec(name);
  if (project) {
    const spec = readSymbolStateManifest().symbols[project[1]];
    const projectPath = spec?.animations?.win?.project;
    if (!projectPath) {
      throw new Error(`Minecart2 symbol "${project[1]}" has no win project.`);
    }
    return readMinecart2LogicalBytes(projectPath);
  }
  if (name === "Symbol.png") {
    return readMinecart2SymbolBytes("WL", "texture");
  }
  if (name === "Symbol.atlas") {
    const texturePath = getMinecart2SymbolResourcePath("WL", "texture");
    return new TextEncoder().encode(
      readMinecart2LogicalText(
        getMinecart2SymbolResourcePath("WL", "atlas"),
      ).replace(texturePath, "Symbol.png"),
    );
  }
  throw new Error(`Unknown Minecart2 symbol fixture "${name}".`);
}

function readSymbolStateManifest(): SymbolStateManifest {
  return readMinecart2LogicalJson(
    "symbol-state-textures.manifest.json",
  ) as SymbolStateManifest;
}
