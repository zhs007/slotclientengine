import {
  collectSymbolManifestResourcePaths,
  parseSymbolPackageGameConfig,
  parseSymbolStateTextureManifest,
  validateSymbolPackageGameConfig,
  type SymbolManifestAnimationSpec,
  type SymbolPackageGameConfigSymbol,
  type SymbolPackageManifestV1,
} from "@slotclientengine/rendercore/symbol";

export interface SymbolEditorProject {
  id: string;
  cellSize: { width: number; height: number };
  rawGameConfig: unknown;
  gameConfigFileName: string;
  manifestDraft: Record<string, unknown>;
  includedSymbols: Set<string>;
  assets: Map<string, Uint8Array>;
  unmappedFiles: Map<string, Uint8Array>;
}

export interface SymbolEditorExportSnapshot {
  readonly packageManifest: SymbolPackageManifestV1;
  readonly rawGameConfig: unknown;
  readonly symbolManifest: unknown;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}

export interface SymbolResourceStatus {
  readonly ready: boolean;
  readonly required: readonly string[];
  readonly missing: readonly string[];
  readonly error?: string;
}

export const DEFAULT_CELL_SIZE = 160;
export const DEFAULT_TEXTURE_STATES = Object.freeze(["spinBlur", "disabled"]);

export function createFromGameConfig(options: {
  readonly rawGameConfig: unknown;
  readonly fileName: string;
}): SymbolEditorProject {
  const { symbols } = parseSymbolPackageGameConfig(options.rawGameConfig);
  const id = normalizeProjectId(fileStem(options.fileName));
  const manifestSymbols = Object.fromEntries(
    symbols.map(({ symbol }) => [symbol, createDefaultSymbolEntry(symbol)]),
  );
  return {
    id,
    cellSize: { width: DEFAULT_CELL_SIZE, height: DEFAULT_CELL_SIZE },
    rawGameConfig: cloneValue(options.rawGameConfig),
    gameConfigFileName: options.fileName,
    manifestDraft: {
      version: 1,
      states: [...DEFAULT_TEXTURE_STATES],
      settings: {
        spinBlur: { kind: "verticalBoxBlur", kernelHeight: 21 },
        disabled: { kind: "grayscale", brightness: 0.72 },
      },
      symbols: manifestSymbols,
    },
    includedSymbols: new Set(symbols.map(({ symbol }) => symbol)),
    assets: new Map(),
    unmappedFiles: new Map(),
  };
}

export function createFromImportedPackage(options: {
  readonly packageManifest: SymbolPackageManifestV1;
  readonly rawGameConfig: unknown;
  readonly rawSymbolManifest: unknown;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}): SymbolEditorProject {
  const parsed = parseSymbolStateTextureManifest(options.rawSymbolManifest);
  parseSymbolPackageGameConfig(options.rawGameConfig);
  return {
    id: options.packageManifest.id,
    cellSize: { ...options.packageManifest.cellSize },
    rawGameConfig: cloneValue(options.rawGameConfig),
    gameConfigFileName: options.packageManifest.entrypoints.gameConfig,
    manifestDraft: cloneValue(options.rawSymbolManifest) as Record<
      string,
      unknown
    >,
    includedSymbols: new Set(Object.keys(parsed.symbols)),
    assets: new Map(
      [...options.assets].map(([path, bytes]) => [path, bytes.slice()]),
    ),
    unmappedFiles: new Map(),
  };
}

export function cloneSymbolEditorProject(
  project: SymbolEditorProject,
): SymbolEditorProject {
  return {
    id: project.id,
    cellSize: { ...project.cellSize },
    rawGameConfig: cloneValue(project.rawGameConfig),
    gameConfigFileName: project.gameConfigFileName,
    manifestDraft: cloneValue(project.manifestDraft),
    includedSymbols: new Set(project.includedSymbols),
    assets: cloneBytesMap(project.assets),
    unmappedFiles: cloneBytesMap(project.unmappedFiles),
  };
}

export function getGameConfigSymbols(
  project: SymbolEditorProject,
): readonly SymbolPackageGameConfigSymbol[] {
  return parseSymbolPackageGameConfig(project.rawGameConfig).symbols;
}

export function setSymbolIncluded(
  project: SymbolEditorProject,
  symbol: string,
  included: boolean,
): void {
  const symbols = rawSymbols(project);
  if (included) {
    project.includedSymbols.add(symbol);
    symbols[symbol] ??= createDefaultSymbolEntry(symbol);
  } else {
    project.includedSymbols.delete(symbol);
    delete symbols[symbol];
  }
}

export function setSymbolScale(
  project: SymbolEditorProject,
  symbol: string,
  scale: number,
): void {
  rawSymbol(project, symbol).scale = scale;
}

export function setSymbolRenderPriority(
  project: SymbolEditorProject,
  symbol: string,
  priority: number,
): void {
  const entry = rawSymbol(project, symbol);
  if (priority === 0) delete entry.renderPriority;
  else entry.renderPriority = priority;
}

export function setTextureStates(
  project: SymbolEditorProject,
  states: readonly string[],
): void {
  if (
    states.length === 0 ||
    states.some((state) => !state.trim() || state.includes("/")) ||
    new Set(states).size !== states.length
  ) {
    throw new Error("texture states 必须是非空、唯一的 state id 列表。");
  }
  const previous = new Set(
    (project.manifestDraft.states as readonly string[] | undefined) ?? [],
  );
  project.manifestDraft.states = [...states];
  const settings = (project.manifestDraft.settings ??= {}) as Record<
    string,
    unknown
  >;
  for (const state of previous)
    if (!states.includes(state)) delete settings[state];
  for (const [symbol, entry] of Object.entries(rawSymbols(project))) {
    const presentation = entry.valuePresentation as
      | Record<string, unknown>
      | undefined;
    const target = presentation
      ? (presentation.reelStates as Record<string, unknown>)
      : entry;
    for (const state of previous)
      if (!states.includes(state)) delete target[state];
    for (const state of states) {
      target[state] ??= `./${symbol}.${state}.png`;
    }
  }
}

export function setTextureStateSetting(
  project: SymbolEditorProject,
  state: string,
  setting: Record<string, unknown>,
): void {
  const settings = (project.manifestDraft.settings ??= {}) as Record<
    string,
    unknown
  >;
  settings[state] = cloneValue(setting);
}

export function setSymbolTexturePath(
  project: SymbolEditorProject,
  symbol: string,
  state: "normal" | string,
  path: string,
): void {
  const entry = rawSymbol(project, symbol);
  if (entry.valuePresentation) {
    throw new Error(
      "valuePresentation symbol 的 reel texture 必须在结构化 value 表单编辑。",
    );
  }
  entry[state] = path;
}

export function setSymbolNormal(
  project: SymbolEditorProject,
  symbol: string,
  normal:
    | string
    | {
        readonly kind: "layered";
        readonly layers: readonly {
          readonly index: number;
          readonly texture: string;
          readonly keyframes: readonly string[];
        }[];
      },
): void {
  const entry = rawSymbol(project, symbol);
  if (entry.valuePresentation) {
    throw new Error(
      "valuePresentation symbol 的透明 normal 必须在结构化 value 表单编辑。",
    );
  }
  entry.normal = cloneValue(normal);
}

export function setValuePresentationField(
  project: SymbolEditorProject,
  symbol: string,
  path: string,
  value: unknown,
): void {
  const entry = rawSymbol(project, symbol);
  const presentation = entry.valuePresentation;
  if (!presentation || typeof presentation !== "object") {
    throw new Error(`symbol ${symbol} 没有 valuePresentation。`);
  }
  const segments = path.split(".");
  let target = presentation as Record<string, unknown> | unknown[];
  for (const segment of segments.slice(0, -1)) {
    const key = /^\d+$/u.test(segment) ? Number(segment) : segment;
    let next = (target as Record<string | number, unknown>)[key];
    if (!next || typeof next !== "object") {
      if (value === undefined) return;
      next = {};
      (target as Record<string | number, unknown>)[key] = next;
    }
    target = next as Record<string, unknown> | unknown[];
  }
  const finalSegment = segments.at(-1)!;
  const finalKey = /^\d+$/u.test(finalSegment)
    ? Number(finalSegment)
    : finalSegment;
  if (value === undefined)
    delete (target as Record<string | number, unknown>)[finalKey];
  else
    (target as Record<string | number, unknown>)[finalKey] = cloneValue(value);
}

export function setAnimationSpec(
  project: SymbolEditorProject,
  symbol: string,
  state: string,
  animation: SymbolManifestAnimationSpec,
): void {
  const entry = rawSymbol(project, symbol);
  const animations = (entry.animations ??= {}) as Record<string, unknown>;
  animations[state] = cloneValue(animation);
}

export function removeAnimationSpec(
  project: SymbolEditorProject,
  symbol: string,
  state: string,
): void {
  const entry = rawSymbol(project, symbol);
  const animations = entry.animations as Record<string, unknown> | undefined;
  if (!animations) return;
  delete animations[state];
  if (Object.keys(animations).length === 0) delete entry.animations;
}

export function replaceUploadedFiles(
  project: SymbolEditorProject,
  files: readonly { name: string; bytes: Uint8Array }[],
): void {
  const expected = new Set(collectExpectedDirectFileNames(project));
  for (const file of files) {
    const name = canonicalUploadName(file.name);
    if (expected.has(name)) {
      project.assets.set(name, file.bytes.slice());
      project.unmappedFiles.delete(name);
    } else {
      project.unmappedFiles.set(name, file.bytes.slice());
    }
  }
}

export function exportSnapshot(
  project: SymbolEditorProject,
): SymbolEditorExportSnapshot {
  validateProjectBasics(project);
  parseSymbolStateTextureManifest(project.manifestDraft);
  const resources = [...project.assets.keys()].sort(comparePath);
  const packageManifest = {
    version: 1,
    kind: "symbol-package",
    id: project.id,
    cellSize: { ...project.cellSize },
    entrypoints: {
      gameConfig: "gameconfig.json",
      symbolManifest: "symbol-state-textures.manifest.json",
    },
    resources,
  } as const satisfies SymbolPackageManifestV1;
  const referenced = collectSymbolManifestResourcePaths({
    symbolManifest: project.manifestDraft,
    symbolManifestPath: packageManifest.entrypoints.symbolManifest,
    files: project.assets,
  });
  if (!sameStrings(referenced, resources)) {
    throw new Error(
      `资源闭包不完整或包含 orphan；required=${referenced.join(",")}, uploaded=${resources.join(",")}。`,
    );
  }
  return Object.freeze({
    packageManifest,
    rawGameConfig: cloneValue(project.rawGameConfig),
    symbolManifest: cloneValue(project.manifestDraft),
    assets: cloneBytesMap(project.assets),
  });
}

export function createPreviewSnapshot(
  project: SymbolEditorProject,
): SymbolEditorExportSnapshot | null {
  const readySymbols = getGameConfigSymbols(project)
    .map(({ symbol }) => symbol)
    .filter(
      (symbol) =>
        project.includedSymbols.has(symbol) &&
        getSymbolResourceStatus(project, symbol).ready,
    );
  if (readySymbols.length === 0) return null;
  const previewProject = cloneSymbolEditorProject(project);
  const sourceSymbols = rawSymbols(previewProject);
  previewProject.manifestDraft.symbols = Object.fromEntries(
    readySymbols.map((symbol) => [symbol, sourceSymbols[symbol]]),
  );
  previewProject.includedSymbols = new Set(readySymbols);
  const resources = collectSymbolManifestResourcePaths({
    symbolManifest: previewProject.manifestDraft,
    files: previewProject.assets,
  });
  previewProject.assets = new Map(
    resources.map((path) => [path, previewProject.assets.get(path)!]),
  );
  previewProject.unmappedFiles.clear();
  return exportSnapshot(previewProject);
}

export function getSymbolResourceStatus(
  project: SymbolEditorProject,
  symbol: string,
): SymbolResourceStatus {
  if (!project.includedSymbols.has(symbol)) {
    return Object.freeze({
      ready: false,
      required: Object.freeze([]),
      missing: Object.freeze([]),
    });
  }
  try {
    const manifest = cloneValue(project.manifestDraft);
    const symbols = rawSymbols(project);
    manifest.symbols = { [symbol]: cloneValue(symbols[symbol]) };
    const required = collectSymbolManifestResourcePaths({
      symbolManifest: manifest,
      files: project.assets,
    });
    const missing = required.filter((path) => !project.assets.has(path));
    return Object.freeze({
      ready: missing.length === 0,
      required,
      missing: Object.freeze(missing),
    });
  } catch (error) {
    return Object.freeze({
      ready: false,
      required: Object.freeze([]),
      missing: Object.freeze([]),
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

export function getProjectDiagnostics(
  project: SymbolEditorProject,
): readonly string[] {
  try {
    validateProjectBasics(project);
    parseSymbolStateTextureManifest(project.manifestDraft);
    validateSymbolPackageGameConfig({
      rawGameConfig: project.rawGameConfig,
      symbolManifest: project.manifestDraft,
    });
    return Object.freeze([]);
  } catch (error) {
    return Object.freeze([
      error instanceof Error ? error.message : String(error),
    ]);
  }
}

export function normalizeProjectId(value: string): string {
  const id = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return id || "symbols-project";
}

function validateProjectBasics(project: SymbolEditorProject): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(project.id))
    throw new Error("project id 必须是小写 ASCII kebab-case。");
  for (const [key, value] of Object.entries(project.cellSize)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0)
      throw new Error(`cellSize.${key} 必须是有限正数。`);
  }
  const { symbols } = parseSymbolPackageGameConfig(project.rawGameConfig);
  const known = new Set(symbols.map(({ symbol }) => symbol));
  for (const symbol of project.includedSymbols)
    if (!known.has(symbol))
      throw new Error(`display symbol ${symbol} 不在 game config。`);
  if (project.includedSymbols.size === 0)
    throw new Error("display set 不能为空。");
}

function collectExpectedDirectFileNames(
  project: SymbolEditorProject,
): readonly string[] {
  const names = new Set<string>();
  const walk = (value: unknown): void => {
    if (typeof value === "string" && value.startsWith("./")) {
      const name = value.slice(2);
      if (!name.includes("/")) names.add(name);
      return;
    }
    if (Array.isArray(value)) for (const child of value) walk(child);
    else if (value && typeof value === "object")
      for (const child of Object.values(value)) walk(child);
  };
  walk(project.manifestDraft);
  return Object.freeze([...names]);
}

function createDefaultSymbolEntry(symbol: string): Record<string, unknown> {
  return {
    normal: `./${symbol}.png`,
    spinBlur: `./${symbol}.spinBlur.png`,
    disabled: `./${symbol}.disabled.png`,
    scale: 1,
  };
}

function rawSymbols(
  project: SymbolEditorProject,
): Record<string, Record<string, unknown>> {
  const symbols = project.manifestDraft.symbols;
  if (!symbols || typeof symbols !== "object" || Array.isArray(symbols))
    throw new Error("manifest symbols 非法。");
  return symbols as Record<string, Record<string, unknown>>;
}

function rawSymbol(
  project: SymbolEditorProject,
  symbol: string,
): Record<string, unknown> {
  const entry = rawSymbols(project)[symbol];
  if (!entry) throw new Error(`symbol ${symbol} 未进入 display set。`);
  return entry;
}

function canonicalUploadName(name: string): string {
  if (
    !name ||
    name.includes("/") ||
    name.includes("\\") ||
    name === "." ||
    name === ".."
  )
    throw new Error(`上传文件名非法：${name}`);
  return name.normalize("NFC");
}

function fileStem(fileName: string): string {
  const name = fileName.split(/[\\/]/u).at(-1) ?? fileName;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function comparePath(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function cloneBytesMap(
  source: ReadonlyMap<string, Uint8Array>,
): Map<string, Uint8Array> {
  return new Map([...source].map(([path, bytes]) => [path, bytes.slice()]));
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
