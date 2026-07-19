import {
  assertCanonicalPackagePath,
  resolvePackagePath,
} from "@slotclientengine/browserartifactio";
import {
  collectSymbolManifestResourcePaths,
  createDefaultSymbolStatePreset,
  inspectSymbolSpineAtlas,
  inspectSymbolSpineSkeleton,
  inspectSymbolVniProject,
  parseSymbolPackageGameConfig,
  parseSymbolStateTextureManifest,
  validateSymbolPackageGameConfig,
  type SymbolCascadeWinPresentation,
  type SymbolManifestAnimationSpec,
  type SymbolManifestLayeredNormal,
  type SymbolManifestNormal,
  type SymbolManifestSpineAnimationTransform,
  type SymbolPackageGameConfigSymbol,
  type SymbolPackageManifestV1,
  type SymbolImageStringNodeSpec,
  type SymbolValuePresentationSpec,
} from "@slotclientengine/rendercore/symbol";
import {
  parseImageStringManifest,
  validateImageStringPackageContents,
  type ImageStringManifestV1,
} from "@slotclientengine/rendercore/image-string";

export type EditorAssetKind =
  | "image"
  | "spine-skeleton"
  | "spine-atlas"
  | "vni-project"
  | "image-string-manifest"
  | "json-unknown"
  | "unsupported";

export interface EditorAssetRecord {
  readonly path: string;
  readonly bytes: Uint8Array;
  readonly kind: EditorAssetKind;
  readonly size: number;
  readonly uploadBatchId: string;
  readonly metadata?: Readonly<Record<string, unknown>>;
  readonly diagnostics: readonly string[];
}

export interface EditorUploadBatch {
  readonly id: string;
  readonly label: string;
  readonly paths: readonly string[];
}

export interface EditorAssetLibrary {
  readonly records: Map<string, EditorAssetRecord>;
  batches: EditorUploadBatch[];
}

export interface EditorStateDefinition {
  readonly id: string;
  readonly source: "builtin" | "custom";
  readonly phase: "stable" | "once";
  readonly playback: "static" | "loop" | "once";
}

export interface EditorImageLayer {
  readonly index: number;
  readonly texturePath: string;
  readonly keyframePaths: readonly string[];
}

export type EditorBaseVisual =
  | { readonly kind: "empty"; readonly width: number; readonly height: number }
  | { readonly kind: "image"; readonly imagePath: string }
  | {
      readonly kind: "layered-image";
      readonly layers: readonly EditorImageLayer[];
    };

export type EditorStateVisual =
  | EditorBaseVisual
  | {
      readonly kind: "spine";
      readonly baseVisual?: EditorBaseVisual;
      readonly skeletonPath: string;
      readonly atlasPath: string;
      readonly texturePath: string;
      readonly animationName: string;
      readonly transform?: SymbolManifestSpineAnimationTransform;
    }
  | {
      readonly kind: "vni";
      readonly baseVisual?: EditorBaseVisual;
      readonly projectPath: string;
      readonly startTime: number;
      readonly endTime: number;
    }
  | { readonly kind: "static"; readonly durationSeconds: number }
  | { readonly kind: "builtin"; readonly durationSeconds: number }
  | { readonly kind: "activeSpine"; readonly animationName: string }
  | { readonly kind: "empty-state"; readonly durationSeconds: number };

export interface EditorSymbolDraft {
  readonly code: number;
  readonly symbol: string;
  included: boolean;
  scale: number;
  renderPriority: number;
  stateOrder: string[];
  states: Map<string, EditorStateVisual>;
  valuePresentation?: SymbolValuePresentationSpec;
  cascadeWinPresentation?: SymbolCascadeWinPresentation;
  imageStringNodes: SymbolImageStringNodeSpec[];
}

export interface EditorImageStringDependency {
  readonly id: string;
  readonly manifest: ImageStringManifestV1;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly fingerprint: string;
}

export interface SymbolEditorProject {
  id: string;
  cellSize: { width: number; height: number };
  rawGameConfig: unknown;
  gameConfigFileName: string;
  symbols: Map<string, EditorSymbolDraft>;
  stateDefinitions: EditorStateDefinition[];
  legacyTextureStateOrder: string[];
  legacyStateSettings: Record<string, unknown>;
  assetLibrary: EditorAssetLibrary;
  imageStringDependencies: Map<string, EditorImageStringDependency>;
  nextUploadBatch: number;
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

export interface EditorAssetReference {
  readonly path: string;
  readonly location: string;
}

export const DEFAULT_CELL_SIZE = 160;
export const DEFAULT_EMPTY_STATE_DURATION = 1 / 60;

export function createFromGameConfig(options: {
  readonly rawGameConfig: unknown;
  readonly fileName: string;
}): SymbolEditorProject {
  const { symbols } = parseSymbolPackageGameConfig(options.rawGameConfig);
  const id = normalizeProjectId(fileStem(options.fileName));
  return {
    id,
    cellSize: { width: DEFAULT_CELL_SIZE, height: DEFAULT_CELL_SIZE },
    rawGameConfig: cloneValue(options.rawGameConfig),
    gameConfigFileName: options.fileName,
    symbols: new Map(
      symbols.map(({ code, symbol }) => [
        symbol,
        createBlankSymbol(code, symbol, DEFAULT_CELL_SIZE, DEFAULT_CELL_SIZE),
      ]),
    ),
    stateDefinitions: createEditorStateDefinitions([]),
    legacyTextureStateOrder: [],
    legacyStateSettings: {},
    assetLibrary: { records: new Map(), batches: [] },
    imageStringDependencies: new Map(),
    nextUploadBatch: 1,
  };
}

export function createFromImportedPackage(options: {
  readonly packageManifest: SymbolPackageManifestV1;
  readonly rawGameConfig: unknown;
  readonly rawSymbolManifest: unknown;
  readonly assets: ReadonlyMap<string, Uint8Array>;
}): SymbolEditorProject {
  const parsed = parseSymbolStateTextureManifest(options.rawSymbolManifest);
  const configSymbols = parseSymbolPackageGameConfig(
    options.rawGameConfig,
  ).symbols;
  const rawManifest = asRecord(options.rawSymbolManifest, "symbol manifest");
  const rawManifestSymbols = asRecord(
    rawManifest.symbols,
    "symbol manifest symbols",
  );
  const builtinIds = new Set(
    createDefaultSymbolStatePreset().states.map((definition) => definition.id),
  );
  const stateDefinitions: EditorStateDefinition[] =
    parsed.statePreset.states.map((definition) => ({
      id: definition.id,
      source: builtinIds.has(definition.id) ? "builtin" : "custom",
      phase: definition.phase,
      playback: definition.playback,
    }));
  const symbols = new Map<string, EditorSymbolDraft>();
  for (const configSymbol of configSymbols) {
    const manifestSymbol = parsed.symbols[configSymbol.symbol];
    if (!manifestSymbol) {
      symbols.set(
        configSymbol.symbol,
        createBlankSymbol(
          configSymbol.code,
          configSymbol.symbol,
          options.packageManifest.cellSize.width,
          options.packageManifest.cellSize.height,
          false,
        ),
      );
      continue;
    }
    const rawSymbol = asRecord(
      rawManifestSymbols[configSymbol.symbol],
      `symbol ${configSymbol.symbol}`,
    );
    const baseVisual = normalToBaseVisual(
      manifestSymbol.normal,
      options.packageManifest.entrypoints.symbolManifest,
    );
    const states = new Map<string, EditorStateVisual>();
    const normalAnimation = manifestSymbol.animations.normal;
    states.set(
      "normal",
      normalAnimation
        ? animationToVisual(
            normalAnimation,
            options.packageManifest.entrypoints.symbolManifest,
            baseVisual,
          )
        : baseVisual,
    );
    const stateOrder = ["normal"];
    for (const state of parsed.states) {
      const texture = manifestSymbol.states[state];
      if (texture) {
        states.set(state, {
          kind: "image",
          imagePath: resolvePackagePath(
            options.packageManifest.entrypoints.symbolManifest,
            texture,
          ),
        });
        stateOrder.push(state);
      }
    }
    for (const [state, animation] of Object.entries(
      manifestSymbol.animations,
    )) {
      if (state === "normal" || !animation) continue;
      states.set(
        state,
        animationToVisual(
          animation,
          options.packageManifest.entrypoints.symbolManifest,
        ),
      );
      if (!stateOrder.includes(state)) stateOrder.push(state);
    }
    symbols.set(configSymbol.symbol, {
      code: configSymbol.code,
      symbol: configSymbol.symbol,
      included: true,
      scale: manifestSymbol.scale,
      renderPriority: manifestSymbol.renderPriority,
      stateOrder,
      states,
      ...(manifestSymbol.valuePresentation
        ? { valuePresentation: cloneValue(manifestSymbol.valuePresentation) }
        : {}),
      ...(manifestSymbol.cascadeWinPresentation
        ? {
            cascadeWinPresentation: cloneValue(
              manifestSymbol.cascadeWinPresentation,
            ),
          }
        : {}),
      imageStringNodes: manifestSymbol.imageStringNodes.map((node) =>
        cloneValue(node),
      ),
    });
    void rawSymbol;
  }
  const rawSettings =
    rawManifest.settings && typeof rawManifest.settings === "object"
      ? cloneValue(rawManifest.settings as Record<string, unknown>)
      : {};
  delete rawSettings.additionalStateDefinitions;
  const library: EditorAssetLibrary = { records: new Map(), batches: [] };
  const importedBatch: EditorUploadBatch = {
    id: "imported",
    label: "导入 ZIP",
    paths: Object.freeze([...options.assets.keys()].sort(comparePath)),
  };
  library.batches.push(importedBatch);
  for (const [path, bytes] of options.assets) {
    library.records.set(path, createAssetRecord(path, bytes, importedBatch.id));
  }
  const imageStringDependencies = collectImportedImageStringDependencies(
    options.assets,
  );
  return {
    id: options.packageManifest.id,
    cellSize: { ...options.packageManifest.cellSize },
    rawGameConfig: cloneValue(options.rawGameConfig),
    gameConfigFileName: options.packageManifest.entrypoints.gameConfig,
    symbols,
    stateDefinitions,
    legacyTextureStateOrder: [...parsed.states],
    legacyStateSettings: rawSettings,
    assetLibrary: library,
    imageStringDependencies,
    nextUploadBatch: 1,
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
    symbols: new Map(
      [...project.symbols].map(([symbol, draft]) => [
        symbol,
        {
          ...draft,
          stateOrder: [...draft.stateOrder],
          states: new Map(
            [...draft.states].map(([state, visual]) => [
              state,
              cloneValue(visual),
            ]),
          ),
          ...(draft.valuePresentation
            ? { valuePresentation: cloneValue(draft.valuePresentation) }
            : {}),
          ...(draft.cascadeWinPresentation
            ? {
                cascadeWinPresentation: cloneValue(
                  draft.cascadeWinPresentation,
                ),
              }
            : {}),
          imageStringNodes: draft.imageStringNodes.map((node) =>
            cloneValue(node),
          ),
        },
      ]),
    ),
    stateDefinitions: cloneValue(project.stateDefinitions),
    legacyTextureStateOrder: [...project.legacyTextureStateOrder],
    legacyStateSettings: cloneValue(project.legacyStateSettings),
    assetLibrary: {
      records: new Map(
        [...project.assetLibrary.records].map(([path, record]) => [
          path,
          cloneAssetRecord(record),
        ]),
      ),
      batches: cloneValue(project.assetLibrary.batches),
    },
    imageStringDependencies: new Map(
      [...project.imageStringDependencies].map(([id, dependency]) => [
        id,
        cloneImageStringDependency(dependency),
      ]),
    ),
    nextUploadBatch: project.nextUploadBatch,
  };
}

export function getGameConfigSymbols(
  project: SymbolEditorProject,
): readonly SymbolPackageGameConfigSymbol[] {
  return parseSymbolPackageGameConfig(project.rawGameConfig).symbols;
}

export function getIncludedSymbols(
  project: SymbolEditorProject,
): readonly EditorSymbolDraft[] {
  return Object.freeze(
    [...project.symbols.values()]
      .filter((symbol) => symbol.included)
      .sort((left, right) => left.code - right.code),
  );
}

export function setSymbolIncluded(
  project: SymbolEditorProject,
  symbol: string,
  included: boolean,
): void {
  requireSymbol(project, symbol).included = included;
}

export function setAllSymbolsIncluded(
  project: SymbolEditorProject,
  mode: "all" | "none" | "invert",
): void {
  for (const symbol of project.symbols.values()) {
    symbol.included =
      mode === "all" ? true : mode === "none" ? false : !symbol.included;
  }
}

export function setSymbolScale(
  project: SymbolEditorProject,
  symbol: string,
  scale: number,
): void {
  requireSymbol(project, symbol).scale = scale;
}

export function setSymbolRenderPriority(
  project: SymbolEditorProject,
  symbol: string,
  priority: number,
): void {
  requireSymbol(project, symbol).renderPriority = priority;
}

export function addSymbolState(
  project: SymbolEditorProject,
  symbol: string,
  state: string,
): void {
  const draft = requireSymbol(project, symbol);
  if (!project.stateDefinitions.some((definition) => definition.id === state)) {
    throw new Error(`未知 state：${state}。`);
  }
  if (draft.states.has(state)) throw new Error(`${symbol}.${state} 已存在。`);
  draft.states.set(state, {
    kind: "empty-state",
    durationSeconds: DEFAULT_EMPTY_STATE_DURATION,
  });
  draft.stateOrder.push(state);
}

export function removeSymbolState(
  project: SymbolEditorProject,
  symbol: string,
  state: string,
): void {
  if (state === "normal") throw new Error("normal state 不可删除。");
  const draft = requireSymbol(project, symbol);
  const references = getStateReferences(draft, state);
  if (references.length > 0) {
    throw new Error(`${symbol}.${state} 仍被引用：${references.join("、")}。`);
  }
  draft.states.delete(state);
  draft.stateOrder = draft.stateOrder.filter(
    (candidate) => candidate !== state,
  );
}

export function moveSymbolState(
  project: SymbolEditorProject,
  symbol: string,
  state: string,
  direction: -1 | 1,
): void {
  const draft = requireSymbol(project, symbol);
  const index = draft.stateOrder.indexOf(state);
  const next = index + direction;
  if (index <= 0 || next <= 0 || next >= draft.stateOrder.length) return;
  [draft.stateOrder[index], draft.stateOrder[next]] = [
    draft.stateOrder[next]!,
    draft.stateOrder[index]!,
  ];
}

export function setStateVisual(
  project: SymbolEditorProject,
  symbol: string,
  state: string,
  visual: EditorStateVisual,
): void {
  const draft = requireSymbol(project, symbol);
  if (!draft.states.has(state))
    throw new Error(`${symbol}.${state} 尚未添加。`);
  draft.states.set(state, cloneValue(visual));
}

export function addCustomStateDefinition(
  project: SymbolEditorProject,
  definition: Readonly<{
    id: string;
    phase: "once" | "stable";
    playback: "once" | "loop";
  }>,
): void {
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/u.test(definition.id)) {
    throw new Error("custom state id 必须以字母开头，只含字母、数字、_、-。");
  }
  if (
    project.stateDefinitions.some((candidate) => candidate.id === definition.id)
  ) {
    throw new Error(`state ${definition.id} 已存在。`);
  }
  if (
    !(
      (definition.phase === "once" && definition.playback === "once") ||
      (definition.phase === "stable" && definition.playback === "loop")
    )
  ) {
    throw new Error("custom state 只支持 once/once 或 stable/loop。");
  }
  project.stateDefinitions.push({ ...definition, source: "custom" });
}

export function removeCustomStateDefinition(
  project: SymbolEditorProject,
  state: string,
): void {
  const definition = project.stateDefinitions.find((item) => item.id === state);
  if (!definition || definition.source !== "custom") {
    throw new Error(`state ${state} 不是可删除的 custom state。`);
  }
  const usedBy = [...project.symbols.values()]
    .filter((symbol) => symbol.states.has(state))
    .map((symbol) => symbol.symbol);
  if (usedBy.length > 0)
    throw new Error(`state ${state} 仍被 ${usedBy.join(",")} 使用。`);
  project.stateDefinitions = project.stateDefinitions.filter(
    (item) => item.id !== state,
  );
}

export function setCascadeWinPresentation(
  project: SymbolEditorProject,
  symbol: string,
  value: SymbolCascadeWinPresentation | undefined,
): void {
  const draft = requireSymbol(project, symbol);
  if (value === undefined) delete draft.cascadeWinPresentation;
  else draft.cascadeWinPresentation = cloneValue(value);
}

export function setValuePresentation(
  project: SymbolEditorProject,
  symbol: string,
  value: SymbolValuePresentationSpec | undefined,
): void {
  const draft = requireSymbol(project, symbol);
  if (value === undefined) {
    delete draft.valuePresentation;
    draft.states.set("normal", {
      kind: "empty",
      width: project.cellSize.width,
      height: project.cellSize.height,
    });
  } else {
    draft.valuePresentation = cloneValue(value);
  }
}

export function setValuePresentationField(
  project: SymbolEditorProject,
  symbol: string,
  path: string,
  value: unknown,
): void {
  const presentation = requireSymbol(project, symbol).valuePresentation;
  if (!presentation)
    throw new Error(`symbol ${symbol} 没有 valuePresentation。`);
  setNestedValue(
    presentation as unknown as Record<string, unknown>,
    path,
    value,
  );
}

export function setSymbolImageStringNodes(
  project: SymbolEditorProject,
  symbol: string,
  nodes: readonly SymbolImageStringNodeSpec[],
): void {
  requireSymbol(project, symbol).imageStringNodes = nodes.map((node) =>
    cloneValue(node),
  );
}

export function installImageStringDependency(
  project: SymbolEditorProject,
  dependency: EditorImageStringDependency,
  mode: "import" | "replace" = "import",
): void {
  const existing = project.imageStringDependencies.get(dependency.id);
  if (existing && mode === "import") {
    if (imageStringDependenciesEqual(existing, dependency)) return;
    throw new Error(
      `image-string dependency id 冲突：${dependency.id} 内容不同，请显式替换。`,
    );
  }
  if (!existing && mode === "replace") {
    throw new Error(`image-string dependency 不存在：${dependency.id}。`);
  }
  const prefix = imageStringDependencyPrefix(dependency.id);
  const nextPaths = [...dependency.files.keys()].map(
    (path) => `${prefix}${path}`,
  );
  const oldPaths = existing
    ? [...existing.files.keys()].map((path) => `${prefix}${path}`)
    : [];
  const conflicts = nextPaths.filter(
    (path) =>
      project.assetLibrary.records.has(path) && !oldPaths.includes(path),
  );
  if (conflicts.length > 0) {
    throw new Error(`image-string vendor path 冲突：${conflicts.join(", ")}。`);
  }
  for (const path of oldPaths) project.assetLibrary.records.delete(path);
  const batchId = `image-string-${dependency.id}`;
  for (const [path, bytes] of dependency.files) {
    const vendorPath = `${prefix}${path}`;
    project.assetLibrary.records.set(
      vendorPath,
      createAssetRecord(vendorPath, bytes, batchId),
    );
  }
  project.assetLibrary.batches = project.assetLibrary.batches.filter(
    (batch) => batch.id !== batchId,
  );
  project.assetLibrary.batches.push({
    id: batchId,
    label: `ImgNumber · ${dependency.id}`,
    paths: Object.freeze(nextPaths.sort(comparePath)),
  });
  project.imageStringDependencies.set(
    dependency.id,
    cloneImageStringDependency(dependency),
  );
}

export function removeImageStringDependency(
  project: SymbolEditorProject,
  id: string,
): void {
  const dependency = project.imageStringDependencies.get(id);
  if (!dependency) throw new Error(`image-string dependency 不存在：${id}。`);
  const usedBy = [...project.symbols.values()].flatMap((symbol) =>
    symbol.imageStringNodes
      .filter((node) => imageStringDependencyId(node.resource) === id)
      .map((node) => `${symbol.symbol}.${node.name}`),
  );
  if (usedBy.length > 0) {
    throw new Error(
      `image-string dependency ${id} 仍被引用：${usedBy.join("、")}。`,
    );
  }
  const prefix = imageStringDependencyPrefix(id);
  for (const path of dependency.files.keys()) {
    project.assetLibrary.records.delete(`${prefix}${path}`);
  }
  project.assetLibrary.batches = project.assetLibrary.batches.filter(
    (batch) => batch.id !== `image-string-${id}`,
  );
  project.imageStringDependencies.delete(id);
}

export function uploadAssetBatch(
  project: SymbolEditorProject,
  files: readonly { readonly path: string; readonly bytes: Uint8Array }[],
  label = "上传资源",
): string {
  if (files.length === 0) throw new Error("上传批次不能为空。");
  const normalized = files.map((file) => ({
    path: assertCanonicalPackagePath(file.path.normalize("NFC")),
    bytes: file.bytes.slice(),
  }));
  const duplicates = normalized
    .map((file) => file.path)
    .filter((path, index, paths) => paths.indexOf(path) !== index);
  const conflicts = normalized
    .map((file) => file.path)
    .filter((path) => project.assetLibrary.records.has(path));
  if (duplicates.length > 0 || conflicts.length > 0) {
    throw new Error(
      `资源 path 冲突：${[...new Set([...duplicates, ...conflicts])].join(", ")}。请从资源列表显式替换。`,
    );
  }
  const batchId = `upload-${project.nextUploadBatch++}`;
  const records = normalized.map((file) =>
    createAssetRecord(file.path, file.bytes, batchId),
  );
  for (const record of records)
    project.assetLibrary.records.set(record.path, record);
  project.assetLibrary.batches.push({
    id: batchId,
    label,
    paths: Object.freeze(
      records.map((record) => record.path).sort(comparePath),
    ),
  });
  return batchId;
}

/** Backward-compatible call shape; unlike the old implementation this never binds by filename. */
export function replaceUploadedFiles(
  project: SymbolEditorProject,
  files: readonly { readonly name: string; readonly bytes: Uint8Array }[],
): void {
  uploadAssetBatch(
    project,
    files.map((file) => ({ path: file.name, bytes: file.bytes })),
  );
}

export function replaceAsset(
  project: SymbolEditorProject,
  path: string,
  bytes: Uint8Array,
): void {
  const existing = project.assetLibrary.records.get(path);
  if (!existing) throw new Error(`资源不存在：${path}。`);
  project.assetLibrary.records.set(
    path,
    createAssetRecord(path, bytes, existing.uploadBatchId),
  );
}

export function deleteAsset(project: SymbolEditorProject, path: string): void {
  const references = getAssetReferences(project, path);
  if (references.length > 0) {
    throw new Error(
      `资源 ${path} 仍被引用：${references.map((item) => item.location).join("、")}。`,
    );
  }
  project.assetLibrary.records.delete(path);
  project.assetLibrary.batches = project.assetLibrary.batches
    .map((batch) => ({
      ...batch,
      paths: batch.paths.filter((candidate) => candidate !== path),
    }))
    .filter((batch) => batch.paths.length > 0);
}

export function getAssetReferences(
  project: SymbolEditorProject,
  onlyPath?: string,
): readonly EditorAssetReference[] {
  const references: EditorAssetReference[] = [];
  for (const symbol of project.symbols.values()) {
    for (const [state, visual] of symbol.states) {
      for (const path of collectVisualPaths(visual)) {
        references.push({ path, location: `${symbol.symbol}.${state}` });
      }
      if (visual.kind === "vni") {
        const assetPaths = project.assetLibrary.records.get(visual.projectPath)
          ?.metadata?.assetPaths;
        if (Array.isArray(assetPaths)) {
          for (const assetPath of assetPaths) {
            if (typeof assetPath === "string") {
              references.push({
                path: resolvePackagePath(visual.projectPath, assetPath),
                location: `${symbol.symbol}.${state} → ${visual.projectPath}`,
              });
            }
          }
        }
      }
    }
    if (symbol.valuePresentation) {
      walkLocalReferences(symbol.valuePresentation, (path) => {
        references.push({
          path: stripLocalRef(path),
          location: `${symbol.symbol}.valuePresentation`,
        });
      });
    }
    for (const node of symbol.imageStringNodes) {
      references.push({
        path: stripLocalRef(node.resource),
        location: `${symbol.symbol}.imageStringNodes.${node.name}`,
      });
    }
  }
  return Object.freeze(
    references.filter(
      (reference) => onlyPath === undefined || reference.path === onlyPath,
    ),
  );
}

export function compileSymbolEditorManifest(
  project: SymbolEditorProject,
): unknown {
  validateProjectBasics(project);
  const definitions = new Map(
    project.stateDefinitions.map((definition) => [definition.id, definition]),
  );
  const included = getIncludedSymbols(project);
  const textureStates: string[] = [];
  const addTextureState = (state: string): void => {
    if (!textureStates.includes(state)) textureStates.push(state);
  };
  for (const state of project.legacyTextureStateOrder) {
    if (
      project.legacyStateSettings[state] !== undefined ||
      included.some((symbol) => symbol.states.get(state)?.kind === "image")
    ) {
      addTextureState(state);
    }
  }
  for (const symbol of included) {
    for (const state of symbol.stateOrder) {
      if (state !== "normal" && symbol.states.get(state)?.kind === "image") {
        addTextureState(state);
      }
    }
  }
  const customDefinitions = project.stateDefinitions
    .filter((definition) => definition.source === "custom")
    .map(({ id, phase, playback }) => ({ id, phase, playback }));
  const settings: Record<string, unknown> = {};
  for (const state of textureStates) {
    if (project.legacyStateSettings[state] !== undefined) {
      settings[state] = cloneValue(project.legacyStateSettings[state]);
    }
  }
  if (customDefinitions.length > 0) {
    settings.additionalStateDefinitions = customDefinitions;
  }
  const manifestSymbols: Record<string, unknown> = {};
  for (const symbol of included) {
    const entry: Record<string, unknown> = { scale: symbol.scale };
    if (symbol.renderPriority !== 0)
      entry.renderPriority = symbol.renderPriority;
    const animations: Record<string, SymbolManifestAnimationSpec> = {};
    if (symbol.valuePresentation) {
      entry.valuePresentation = compileValuePresentation(
        symbol.valuePresentation,
      );
    } else {
      const normalVisual = requireStateVisual(symbol, "normal");
      entry.normal = compileBaseVisual(
        getBaseVisual(normalVisual, project.cellSize),
      );
      const normalAnimation = compileAnimation(
        normalVisual,
        definitions.get("normal")!,
        "normal",
      );
      if (normalAnimation) animations.normal = normalAnimation;
    }
    for (const state of symbol.stateOrder) {
      if (state === "normal") continue;
      const visual = requireStateVisual(symbol, state);
      const definition = definitions.get(state);
      if (!definition)
        throw new Error(`${symbol.symbol}.${state} 没有 state definition。`);
      if (visual.kind === "image") {
        if (symbol.valuePresentation) {
          const presentation = entry.valuePresentation as Record<
            string,
            unknown
          >;
          const reelStates = presentation.reelStates as Record<string, unknown>;
          reelStates[state] = toLocalRef(visual.imagePath);
        } else {
          entry[state] = toLocalRef(visual.imagePath);
        }
        if (definition.playback !== "static") {
          animations[state] = {
            kind: "static",
            durationSeconds: DEFAULT_EMPTY_STATE_DURATION,
          };
        }
      } else {
        const animation = compileAnimation(visual, definition, state);
        if (animation) animations[state] = animation;
      }
    }
    if (Object.keys(animations).length > 0) entry.animations = animations;
    if (symbol.imageStringNodes.length > 0) {
      entry.imageStringNodes = symbol.imageStringNodes.map((node) =>
        cloneValue(node),
      );
    }
    if (symbol.cascadeWinPresentation) {
      entry.cascadeWinPresentation = cloneValue(symbol.cascadeWinPresentation);
    }
    manifestSymbols[symbol.symbol] = entry;
  }
  return {
    version: 1,
    states: textureStates,
    ...(Object.keys(settings).length > 0 ? { settings } : {}),
    symbols: manifestSymbols,
  };
}

export function exportSnapshot(
  project: SymbolEditorProject,
): SymbolEditorExportSnapshot {
  const symbolManifest = compileSymbolEditorManifest(project);
  parseSymbolStateTextureManifest(symbolManifest);
  validateSymbolPackageGameConfig({
    rawGameConfig: project.rawGameConfig,
    symbolManifest,
  });
  const allFiles = new Map(
    [...project.assetLibrary.records].map(([path, record]) => [
      path,
      record.bytes,
    ]),
  );
  const resources = collectSymbolManifestResourcePaths({
    symbolManifest,
    symbolManifestPath: "symbol-state-textures.manifest.json",
    files: allFiles,
  });
  const missing = resources.filter((path) => !allFiles.has(path));
  if (missing.length > 0) throw new Error(`缺少资源：${missing.join(", ")}。`);
  for (const path of resources) {
    const record = project.assetLibrary.records.get(path)!;
    if (record.diagnostics.length > 0) {
      throw new Error(`资源 ${path} 无效：${record.diagnostics.join("；")}。`);
    }
  }
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
  return Object.freeze({
    packageManifest,
    rawGameConfig: cloneValue(project.rawGameConfig),
    symbolManifest,
    assets: new Map(
      resources.map((path) => [path, allFiles.get(path)!.slice()] as const),
    ),
  });
}

export function createPreviewSnapshot(
  project: SymbolEditorProject,
): SymbolEditorExportSnapshot | null {
  try {
    return exportSnapshot(project);
  } catch {
    const previewProject = cloneSymbolEditorProject(project);
    let ready = 0;
    for (const symbol of previewProject.symbols.values()) {
      const status = getSymbolResourceStatus(project, symbol.symbol);
      symbol.included = symbol.included && status.ready;
      if (symbol.included) ready += 1;
    }
    if (ready === 0) return null;
    return exportSnapshot(previewProject);
  }
}

export function getSymbolResourceStatus(
  project: SymbolEditorProject,
  symbol: string,
): SymbolResourceStatus {
  const draft = requireSymbol(project, symbol);
  if (!draft.included) return { ready: false, required: [], missing: [] };
  try {
    const preview = cloneSymbolEditorProject(project);
    for (const candidate of preview.symbols.values()) {
      candidate.included = candidate.symbol === symbol;
    }
    const manifest = compileSymbolEditorManifest(preview);
    const files = new Map(
      [...project.assetLibrary.records].map(([path, record]) => [
        path,
        record.bytes,
      ]),
    );
    const required = collectSymbolManifestResourcePaths({
      symbolManifest: manifest,
      files,
    });
    const missing = required.filter((path) => !files.has(path));
    return { ready: missing.length === 0, required, missing };
  } catch (error) {
    return {
      ready: false,
      required: [],
      missing: [],
      error: formatError(error),
    };
  }
}

export function getProjectDiagnostics(
  project: SymbolEditorProject,
): readonly string[] {
  const diagnostics: string[] = [];
  try {
    exportSnapshot(project);
  } catch (error) {
    diagnostics.push(formatError(error));
  }
  for (const record of project.assetLibrary.records.values()) {
    for (const diagnostic of record.diagnostics)
      diagnostics.push(`${record.path}: ${diagnostic}`);
  }
  return Object.freeze(diagnostics);
}

export function normalizeProjectId(value: string): string {
  const id = value
    .normalize("NFKD")
    .replace(/[^A-Za-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLowerCase();
  return id || "symbols-project";
}

function createBlankSymbol(
  code: number,
  symbol: string,
  width: number,
  height: number,
  included = true,
): EditorSymbolDraft {
  return {
    code,
    symbol,
    included,
    scale: 1,
    renderPriority: 0,
    stateOrder: ["normal"],
    states: new Map([
      ["normal", { kind: "empty", width, height } satisfies EditorBaseVisual],
    ]),
    imageStringNodes: [],
  };
}

function createEditorStateDefinitions(
  custom: readonly EditorStateDefinition[],
): EditorStateDefinition[] {
  return [
    ...createDefaultSymbolStatePreset().states.map((definition) => ({
      id: definition.id,
      source: "builtin" as const,
      phase: definition.phase,
      playback: definition.playback,
    })),
    ...custom,
  ];
}

function normalToBaseVisual(
  normal: SymbolManifestNormal,
  manifestPath: string,
): EditorBaseVisual {
  if (typeof normal === "string") {
    return {
      kind: "image",
      imagePath: resolvePackagePath(manifestPath, normal),
    };
  }
  if (normal.kind === "transparent") {
    return { kind: "empty", width: normal.width, height: normal.height };
  }
  return {
    kind: "layered-image",
    layers: normal.layers.map((layer) => ({
      index: layer.index,
      texturePath: resolvePackagePath(manifestPath, layer.texture),
      keyframePaths: layer.keyframes.map((path) =>
        resolvePackagePath(manifestPath, path),
      ),
    })),
  };
}

function animationToVisual(
  animation: SymbolManifestAnimationSpec,
  manifestPath: string,
  baseVisual?: EditorBaseVisual,
): EditorStateVisual {
  switch (animation.kind) {
    case "spine":
      return {
        kind: "spine",
        ...(baseVisual ? { baseVisual } : {}),
        skeletonPath: resolvePackagePath(manifestPath, animation.skeleton),
        atlasPath: resolvePackagePath(manifestPath, animation.atlas),
        texturePath: resolvePackagePath(manifestPath, animation.texture),
        animationName: animation.playback.animationName,
        ...(animation.transform
          ? { transform: cloneValue(animation.transform) }
          : {}),
      };
    case "vni":
      return {
        kind: "vni",
        ...(baseVisual ? { baseVisual } : {}),
        projectPath: resolvePackagePath(manifestPath, animation.project),
        startTime: animation.playback.startTime,
        endTime: animation.playback.endTime,
      };
    case "static":
      return { kind: "static", durationSeconds: animation.durationSeconds };
    case "builtin":
      return { kind: "builtin", durationSeconds: animation.durationSeconds };
    case "activeSpine":
      return {
        kind: "activeSpine",
        animationName: animation.playback.animationName,
      };
    case "empty":
      return {
        kind: "empty-state",
        durationSeconds: animation.durationSeconds,
      };
  }
}

function compileAnimation(
  visual: EditorStateVisual,
  definition: EditorStateDefinition,
  state: string,
): SymbolManifestAnimationSpec | undefined {
  switch (visual.kind) {
    case "spine":
      return {
        kind: "spine",
        skeleton: toLocalRef(visual.skeletonPath),
        atlas: toLocalRef(visual.atlasPath),
        texture: toLocalRef(visual.texturePath),
        playback: {
          mode: "animation",
          animationName: visual.animationName,
          loop: state === "normal" || definition.playback === "loop",
        },
        ...(visual.transform
          ? { transform: cloneValue(visual.transform) }
          : {}),
      };
    case "vni":
      return {
        kind: "vni",
        project: toLocalRef(visual.projectPath),
        playback: {
          mode: "range",
          startTime: visual.startTime,
          endTime: visual.endTime,
          loop: state === "normal" || definition.playback === "loop",
        },
      };
    case "static":
      return { kind: "static", durationSeconds: visual.durationSeconds };
    case "builtin":
      if (state !== "appear" && state !== "win") {
        throw new Error(`${state} 没有明确 builtin runtime 实现。`);
      }
      return { kind: "builtin", durationSeconds: visual.durationSeconds };
    case "activeSpine":
      return {
        kind: "activeSpine",
        playback: {
          mode: "animation",
          animationName: visual.animationName,
          loop: definition.playback === "loop",
        },
      };
    case "empty-state":
      return { kind: "empty", durationSeconds: visual.durationSeconds };
    case "image":
    case "layered-image":
    case "empty":
      return undefined;
  }
}

function getBaseVisual(
  visual: EditorStateVisual,
  cellSize: { readonly width: number; readonly height: number },
): EditorBaseVisual {
  if (
    visual.kind === "image" ||
    visual.kind === "layered-image" ||
    visual.kind === "empty"
  ) {
    return visual;
  }
  if (visual.kind === "spine" || visual.kind === "vni") {
    return (
      visual.baseVisual ?? {
        kind: "empty",
        width: cellSize.width,
        height: cellSize.height,
      }
    );
  }
  return { kind: "empty", width: cellSize.width, height: cellSize.height };
}

function compileBaseVisual(visual: EditorBaseVisual): SymbolManifestNormal {
  if (visual.kind === "empty") {
    return { kind: "transparent", width: visual.width, height: visual.height };
  }
  if (visual.kind === "image") return toLocalRef(visual.imagePath);
  return {
    kind: "layered",
    layers: visual.layers.map((layer) => ({
      index: layer.index,
      texture: toLocalRef(layer.texturePath),
      keyframes: layer.keyframePaths.map(toLocalRef),
    })),
  } satisfies SymbolManifestLayeredNormal;
}

function compileValuePresentation(
  value: SymbolValuePresentationSpec,
): Record<string, unknown> {
  const clone = cloneValue(value) as unknown as Record<string, unknown>;
  const reelStates = clone.reelStates as Record<string, unknown>;
  const parsedStates = (
    value.reelStates as SymbolValuePresentationSpec["reelStates"]
  ).states;
  for (const [state, path] of Object.entries(parsedStates)) {
    reelStates[state] = path;
  }
  delete reelStates.states;
  return clone;
}

function createAssetRecord(
  path: string,
  bytes: Uint8Array,
  uploadBatchId: string,
): EditorAssetRecord {
  const lower = path.toLowerCase();
  const diagnostics: string[] = [];
  let kind: EditorAssetKind = "unsupported";
  let metadata: Record<string, unknown> | undefined;
  if (/\.(?:png|jpe?g|webp)$/u.test(lower)) {
    kind = "image";
    try {
      metadata = readImageMetadata(bytes);
    } catch (error) {
      diagnostics.push(`图片解析失败：${formatError(error)}`);
    }
  } else if (lower.endsWith(".atlas")) {
    kind = "spine-atlas";
    try {
      metadata = { ...inspectSymbolSpineAtlas(decodeUtf8(bytes, path)) };
    } catch (error) {
      diagnostics.push(formatError(error));
    }
  } else if (lower.endsWith(".json")) {
    try {
      const raw = JSON.parse(decodeUtf8(bytes, path)) as unknown;
      try {
        metadata = { ...parseImageStringManifest(raw) };
        kind = "image-string-manifest";
      } catch {
        try {
          metadata = { ...inspectSymbolVniProject(raw) };
          kind = "vni-project";
        } catch {
          try {
            metadata = { ...inspectSymbolSpineSkeleton(raw) };
            kind = "spine-skeleton";
          } catch {
            kind = "json-unknown";
            diagnostics.push(
              "JSON 既不是有效 image-string、VNI project，也不是 official Spine 4.3 skeleton",
            );
          }
        }
      }
    } catch (error) {
      kind = "json-unknown";
      diagnostics.push(`JSON 解析失败：${formatError(error)}`);
    }
  } else {
    diagnostics.push("不支持的资源类型");
  }
  return Object.freeze({
    path,
    bytes: bytes.slice(),
    kind,
    size: bytes.byteLength,
    uploadBatchId,
    ...(metadata ? { metadata: Object.freeze(metadata) } : {}),
    diagnostics: Object.freeze(diagnostics),
  });
}

function cloneAssetRecord(record: EditorAssetRecord): EditorAssetRecord {
  return Object.freeze({
    ...record,
    bytes: record.bytes.slice(),
    ...(record.metadata ? { metadata: cloneValue(record.metadata) } : {}),
    diagnostics: Object.freeze([...record.diagnostics]),
  });
}

function collectVisualPaths(visual: EditorStateVisual): readonly string[] {
  switch (visual.kind) {
    case "image":
      return [visual.imagePath];
    case "layered-image":
      return visual.layers.flatMap((layer) => [
        layer.texturePath,
        ...layer.keyframePaths,
      ]);
    case "spine":
      return [
        ...collectVisualPaths(
          visual.baseVisual ?? { kind: "empty", width: 1, height: 1 },
        ),
        visual.skeletonPath,
        visual.atlasPath,
        visual.texturePath,
      ];
    case "vni":
      return [
        ...collectVisualPaths(
          visual.baseVisual ?? { kind: "empty", width: 1, height: 1 },
        ),
        visual.projectPath,
      ];
    default:
      return [];
  }
}

function getStateReferences(
  symbol: EditorSymbolDraft,
  state: string,
): readonly string[] {
  const presentation = symbol.cascadeWinPresentation?.playback;
  const references = presentation
    ? Object.entries(presentation)
        .filter(([key, value]) => key !== "mode" && value === state)
        .map(([key]) => `cascade.${key}`)
    : [];
  references.push(
    ...symbol.imageStringNodes
      .filter((node) => node.target.state === state)
      .map((node) => `imageStringNodes.${node.name}`),
  );
  return references;
}

function requireSymbol(
  project: SymbolEditorProject,
  symbol: string,
): EditorSymbolDraft {
  const draft = project.symbols.get(symbol);
  if (!draft) throw new Error(`未知 symbol：${symbol}。`);
  return draft;
}

function requireStateVisual(
  symbol: EditorSymbolDraft,
  state: string,
): EditorStateVisual {
  const visual = symbol.states.get(state);
  if (!visual) throw new Error(`${symbol.symbol}.${state} 尚未配置。`);
  return visual;
}

function validateProjectBasics(project: SymbolEditorProject): void {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(project.id)) {
    throw new Error("project id 必须是小写 ASCII kebab-case。");
  }
  for (const [key, value] of Object.entries(project.cellSize)) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
      throw new Error(`cellSize.${key} 必须是有限正数。`);
    }
  }
  if (getIncludedSymbols(project).length === 0)
    throw new Error("display set 不能为空。");
  for (const symbol of project.symbols.values()) {
    if (!Number.isFinite(symbol.scale) || symbol.scale <= 0) {
      throw new Error(`${symbol.symbol}.scale 必须是有限正数。`);
    }
    if (
      !Number.isSafeInteger(symbol.renderPriority) ||
      symbol.renderPriority < 0
    ) {
      throw new Error(`${symbol.symbol}.renderPriority 必须是非负安全整数。`);
    }
  }
}

function setNestedValue(
  target: Record<string, unknown>,
  path: string,
  value: unknown,
): void {
  const segments = path.split(".");
  let current: Record<string, unknown> | unknown[] = target;
  for (const segment of segments.slice(0, -1)) {
    const key = /^\d+$/u.test(segment) ? Number(segment) : segment;
    let next = (current as Record<string | number, unknown>)[key];
    if (!next || typeof next !== "object") {
      next = {};
      (current as Record<string | number, unknown>)[key] = next;
    }
    current = next as Record<string, unknown>;
  }
  const last = segments.at(-1)!;
  const key = /^\d+$/u.test(last) ? Number(last) : last;
  if (value === undefined)
    delete (current as Record<string | number, unknown>)[key];
  else (current as Record<string | number, unknown>)[key] = cloneValue(value);
}

function walkLocalReferences(
  value: unknown,
  visit: (path: string) => void,
): void {
  if (typeof value === "string" && value.startsWith("./")) visit(value);
  else if (Array.isArray(value))
    for (const child of value) walkLocalReferences(child, visit);
  else if (value && typeof value === "object") {
    for (const child of Object.values(value)) walkLocalReferences(child, visit);
  }
}

function toLocalRef(path: string): string {
  return `./${assertCanonicalPackagePath(path)}`;
}

function stripLocalRef(path: string): string {
  return path.startsWith("./") ? path.slice(2) : path;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} 必须是 object。`);
  }
  return value as Record<string, unknown>;
}

function decodeUtf8(bytes: Uint8Array, path: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${path} 不是合法 UTF-8：${formatError(error)}`);
  }
}

function readImageMetadata(bytes: Uint8Array): Record<string, unknown> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length >= 24 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return {
      mime: "image/png",
      width: view.getUint32(16),
      height: view.getUint32(20),
    };
  }
  if (bytes.length >= 10 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = bytes[offset + 1]!;
      const size = view.getUint16(offset + 2);
      if (
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf)
      ) {
        return {
          mime: "image/jpeg",
          width: view.getUint16(offset + 7),
          height: view.getUint16(offset + 5),
        };
      }
      if (size < 2) break;
      offset += size + 2;
    }
  }
  if (
    bytes.length >= 30 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP"
  ) {
    const chunk = ascii(bytes, 12, 16);
    if (chunk === "VP8X") {
      return {
        mime: "image/webp",
        width: 1 + readUint24(bytes, 24),
        height: 1 + readUint24(bytes, 27),
      };
    }
    if (chunk === "VP8 " && bytes.length >= 30) {
      return {
        mime: "image/webp",
        width: view.getUint16(26, true) & 0x3fff,
        height: view.getUint16(28, true) & 0x3fff,
      };
    }
  }
  throw new Error("不支持或损坏的 PNG/JPEG/WebP 内容");
}

function ascii(bytes: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...bytes.slice(start, end));
}

function readUint24(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! | (bytes[offset + 1]! << 8) | (bytes[offset + 2]! << 16)
  );
}

function collectImportedImageStringDependencies(
  assets: ReadonlyMap<string, Uint8Array>,
): Map<string, EditorImageStringDependency> {
  const dependencies = new Map<string, EditorImageStringDependency>();
  const manifestPattern =
    /^dependencies\/image-strings\/([a-z0-9]+(?:-[a-z0-9]+)*)\/image-string\.manifest\.json$/u;
  for (const path of assets.keys()) {
    const match = manifestPattern.exec(path);
    if (!match) continue;
    const id = match[1]!;
    const prefix = imageStringDependencyPrefix(id);
    const files = new Map<string, Uint8Array>();
    for (const [assetPath, bytes] of assets) {
      if (assetPath.startsWith(prefix)) {
        files.set(assetPath.slice(prefix.length), bytes.slice());
      }
    }
    const manifestBytes = files.get("image-string.manifest.json");
    if (!manifestBytes)
      throw new Error(`image-string dependency ${id} 缺 manifest。`);
    const raw = JSON.parse(decodeUtf8(manifestBytes, path));
    const manifest = validateImageStringPackageContents({
      manifest: raw,
      files,
    });
    if (manifest.id !== id) {
      throw new Error(
        `image-string vendor directory ${id} 与 manifest id ${manifest.id} 不一致。`,
      );
    }
    dependencies.set(
      id,
      Object.freeze({
        id,
        manifest,
        files,
        fingerprint: fingerprintFiles(files),
      }),
    );
  }
  return dependencies;
}

function cloneImageStringDependency(
  dependency: EditorImageStringDependency,
): EditorImageStringDependency {
  return Object.freeze({
    id: dependency.id,
    manifest: cloneValue(dependency.manifest),
    files: new Map(
      [...dependency.files].map(([path, bytes]) => [path, bytes.slice()]),
    ),
    fingerprint: dependency.fingerprint,
  });
}

function imageStringDependenciesEqual(
  left: EditorImageStringDependency,
  right: EditorImageStringDependency,
): boolean {
  if (left.files.size !== right.files.size) return false;
  for (const [path, leftBytes] of left.files) {
    const rightBytes = right.files.get(path);
    if (!rightBytes || leftBytes.length !== rightBytes.length) return false;
    if (leftBytes.some((byte, index) => byte !== rightBytes[index]))
      return false;
  }
  return true;
}

function imageStringDependencyPrefix(id: string): string {
  return `dependencies/image-strings/${id}/`;
}

function imageStringDependencyId(resource: string): string | null {
  return (
    /^\.\/dependencies\/image-strings\/([^/]+)\/image-string\.manifest\.json$/u.exec(
      resource,
    )?.[1] ?? null
  );
}

function fingerprintFiles(files: ReadonlyMap<string, Uint8Array>): string {
  let hash = 0x811c9dc5;
  for (const [path, bytes] of [...files].sort(([a], [b]) =>
    comparePath(a, b),
  )) {
    for (const byte of new TextEncoder().encode(path)) {
      hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
    }
    for (const byte of bytes) hash = Math.imul(hash ^ byte, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function fileStem(fileName: string): string {
  const name = fileName.split(/[\\/]/u).at(-1) ?? fileName;
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

function comparePath(left: string, right: string): number {
  return left.localeCompare(right, "en");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function cloneValue<T>(value: T): T {
  return structuredClone(value);
}
