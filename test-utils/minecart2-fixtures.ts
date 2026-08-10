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

interface LayoutManifest {
  readonly gameModes?: {
    readonly initialMode: string;
    readonly modes: readonly {
      readonly id: string;
      readonly symbolPackage?: string;
      readonly awardCelebrationPopup?: string;
    }[];
  };
  readonly symbolPackages?: Readonly<
    Record<string, { readonly manifest: string }>
  >;
  readonly popups?: Readonly<Record<string, { readonly manifest: string }>>;
}

interface SymbolPackageManifest {
  readonly entrypoints: { readonly symbolManifest: string };
}

interface PopupManifest {
  readonly awardCelebration?: {
    readonly celebrationTiers: readonly {
      readonly id: string;
      readonly layers: readonly {
        readonly kind: string;
        readonly resource: string;
      }[];
    }[];
  };
  readonly resources: Readonly<
    Record<string, { readonly kind: string; readonly project?: string }>
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

export function getMinecart2AwardVniProjectPath(tierId: string): string {
  const layout = readMinecart2LayoutManifest();
  const initialMode = requireInitialMode(layout);
  const popupId = initialMode.awardCelebrationPopup;
  if (!popupId)
    throw new Error("Minecart2 initial mode has no award celebration popup.");
  const popupBinding = layout.popups?.[popupId];
  if (!popupBinding)
    throw new Error(`Minecart2 popup binding "${popupId}" is unavailable.`);
  const popup = readMinecart2LogicalJson(
    popupBinding.manifest,
  ) as PopupManifest;
  const tier = popup.awardCelebration?.celebrationTiers.find(
    (candidate) => candidate.id === tierId,
  );
  const layer = tier?.layers.find((candidate) => candidate.kind === "vni");
  const resource = layer && popup.resources[layer.resource];
  if (!resource?.project)
    throw new Error(`Minecart2 award tier "${tierId}" has no VNI project.`);
  return resource.project;
}

export function getMinecart2SymbolManifestPath(): string {
  const layout = readMinecart2LayoutManifest();
  const packageId = requireInitialMode(layout).symbolPackage;
  if (!packageId)
    throw new Error("Minecart2 initial mode has no symbol package.");
  const binding = layout.symbolPackages?.[packageId];
  if (!binding)
    throw new Error(`Minecart2 symbol binding "${packageId}" is unavailable.`);
  const symbolPackage = readMinecart2LogicalJson(
    binding.manifest,
  ) as SymbolPackageManifest;
  return symbolPackage.entrypoints.symbolManifest;
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
    return new TextEncoder().encode(
      readMinecart2LogicalText(
        getMinecart2SymbolResourcePath("WL", "atlas"),
      ).replace(/^[^\r\n]+/u, "Symbol.png"),
    );
  }
  throw new Error(`Unknown Minecart2 symbol fixture "${name}".`);
}

function readSymbolStateManifest(): SymbolStateManifest {
  return readMinecart2LogicalJson(
    getMinecart2SymbolManifestPath(),
  ) as SymbolStateManifest;
}

function readMinecart2LayoutManifest(): LayoutManifest {
  return JSON.parse(
    readFileSync(resolve(MINECART2_ROOT, "layout.manifest.json"), "utf8"),
  ) as LayoutManifest;
}

function requireInitialMode(layout: LayoutManifest) {
  const modes = layout.gameModes;
  const initial = modes?.modes.find((mode) => mode.id === modes.initialMode);
  if (!initial) throw new Error("Minecart2 initial game mode is unavailable.");
  return initial;
}
