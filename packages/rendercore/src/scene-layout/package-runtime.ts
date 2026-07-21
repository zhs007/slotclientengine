import type { LogicReels } from "@slotclientengine/logiccore";
import { Container } from "pixi.js";
import {
  createAwardCelebrationPlayer,
  type AwardCelebrationPlayer,
} from "../popup/index.js";
import {
  RenderGridCellReelSet,
  RenderReelSet,
  createGridCellOrder,
  createReelLayout,
  type ReelSymbolRegistry,
  type ReelSymbolRegistryEntry,
  type ReelSymbolRegistryValidation,
  type SymbolPresentationValueMatrix,
} from "../reel/index.js";
import {
  createSymbolPackageValueControllerFactory,
  type RenderSymbol,
  type SymbolCatalogModel,
  type SymbolPackageResource,
} from "../symbol/index.js";
import type { RenderViewportSize } from "../viewport/index.js";
import { SceneLayoutError } from "./errors.js";
import { createSceneLayoutRuntime } from "./runtime.js";
import type {
  AttachChildOptions,
  AttachRelativeOptions,
  ResolvedSceneLayoutReelGrid,
  SceneLayoutGameMode,
  SceneLayoutGameModeSnapshot,
  SceneLayoutInitialReelScene,
  SceneLayoutNodeStateSnapshot,
  SceneLayoutPackageResource,
  SceneLayoutPackageRuntime,
  SceneLayoutSnapshot,
  SceneLayoutSymbolPackageBinding,
} from "./types.js";

type ReelPresentation = RenderReelSet | RenderGridCellReelSet;

export function createSceneLayoutPackageRuntime(options: {
  readonly resource: SceneLayoutPackageResource;
}): SceneLayoutPackageRuntime {
  return new DefaultSceneLayoutPackageRuntime(options.resource);
}

class DefaultSceneLayoutPackageRuntime implements SceneLayoutPackageRuntime {
  readonly container: Container;
  readonly #resource: SceneLayoutPackageResource;
  readonly #layout;
  #reel: ReelPresentation | null = null;
  #catalog: SymbolCatalogModel | null = null;
  #activeSymbolPackageId: string | null = null;
  #targetSymbolPackageId: string | null = null;
  #activeBackgroundNodes: readonly string[] = Object.freeze([]);
  readonly #popups = new Map<string, AwardCelebrationPlayer>();
  #initialized = false;
  #initializing = false;
  #destroyed = false;
  #stableMode: string | null = null;
  #targetMode: string | null = null;
  #activePopupId: string | null = null;

  constructor(resource: SceneLayoutPackageResource) {
    this.#resource = resource;
    this.#layout = createSceneLayoutRuntime({ resource: resource.layout });
    this.container = this.#layout.container;
  }

  async init(
    options: {
      readonly reels?: Readonly<
        Partial<Record<"main", SceneLayoutInitialReelScene>>
      >;
    } = {},
  ): Promise<void> {
    this.assertAlive();
    if (this.#initialized || this.#initializing)
      throw new SceneLayoutError(
        "Scene layout package runtime is already initializing or initialized.",
      );
    this.#initializing = true;
    try {
      await this.#layout.init();
      const initialModeId =
        this.#resource.manifest.gameModes?.initialMode ?? null;
      const initialMode = initialModeId
        ? this.requireMode(initialModeId)
        : null;
      this.commitBackgroundVisibility(initialMode);
      const activeBinding = this.resolveModeSymbolBinding(initialMode);
      if (activeBinding) {
        const initial = options.reels?.main;
        if (!initial)
          throw new SceneLayoutError(
            "Scene layout package runtime requires initial reels.main input.",
          );
        const symbolPackage = activeBinding.resource;
        this.#catalog = await symbolPackage.createCatalog();
        this.assertAlive();
        this.#reel = this.createReelPresentation(
          symbolPackage,
          this.#catalog,
          activeBinding.binding,
        );
        this.attachReel(this.#reel);
        this.applyReelScene(
          this.#reel,
          symbolPackage,
          activeBinding.binding,
          initial,
        );
        this.#activeSymbolPackageId = activeBinding.id;
      } else if (options.reels?.main) {
        throw new SceneLayoutError(
          "Scene layout package has no symbol binding and must not receive reels.main input.",
        );
      }
      for (const [id, resource] of Object.entries(
        this.#resource.popupPackages,
      )) {
        const popup = createAwardCelebrationPlayer({ resource });
        await popup.init();
        this.assertAlive();
        this.#popups.set(id, popup);
        this.container.addChild(popup.container);
      }
      this.#stableMode = initialModeId;
      this.#initialized = true;
    } catch (error) {
      this.destroy();
      throw asSceneLayoutError(error);
    } finally {
      this.#initializing = false;
    }
  }

  applyViewport(viewportSize: RenderViewportSize): SceneLayoutSnapshot {
    this.assertReady();
    const snapshot = this.#layout.applyViewport(viewportSize);
    if (this.#reel) {
      const grid = snapshot.reels.main;
      if (!grid)
        throw new SceneLayoutError(
          'Bound scene layout reel "main" is missing.',
        );
      this.#reel.position.set(grid.artRect.x, grid.artRect.y);
    }
    for (const [id, popup] of this.#popups) {
      const binding = this.#resource.manifest.popups?.[id];
      const placement = binding?.placements[snapshot.variantId];
      if (!binding || !placement)
        throw new SceneLayoutError(
          `Scene layout popup "${id}" has no ${snapshot.variantId} placement.`,
        );
      popup.container.position.set(
        viewportSize.width / 2 + placement.x,
        viewportSize.height / 2 + placement.y,
      );
      popup.container.scale.set(placement.scale);
    }
    return snapshot;
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    this.#layout.update(deltaSeconds);
    this.#reel?.update(deltaSeconds);
    for (const popup of this.#popups.values())
      if (popup.isPlaying()) popup.update(deltaSeconds);
    if (
      this.#activePopupId &&
      !this.#popups.get(this.#activePopupId)?.isPlaying()
    )
      this.#activePopupId = null;
  }

  resetReelScene(reelId: "main", input: SceneLayoutInitialReelScene): void {
    this.assertAlive();
    const reel = this.requireReel(reelId);
    const mode = this.#stableMode ? this.requireMode(this.#stableMode) : null;
    const binding = this.resolveModeSymbolBinding(mode);
    if (!binding)
      throw new SceneLayoutError(
        "Current scene layout game mode has no symbol package binding.",
      );
    this.applyReelScene(reel, binding.resource, binding.binding, input);
  }

  getReelPresentation(reelId: "main"): Container {
    this.assertReady();
    return this.requireReel(reelId);
  }

  getAwardCelebrationPopup(id: string): AwardCelebrationPlayer {
    this.assertReady();
    const popup = this.#popups.get(id);
    if (!popup)
      throw new SceneLayoutError(
        `Scene layout award celebration popup "${id}" is unavailable.`,
      );
    return popup;
  }

  getGameModeIds(): readonly string[] {
    this.assertReady();
    return Object.freeze(this.requireGameModes().modes.map((mode) => mode.id));
  }

  getGameModeSnapshot(): SceneLayoutGameModeSnapshot {
    this.assertReady();
    this.requireGameModes();
    return Object.freeze({
      stableMode: this.#stableMode!,
      targetMode: this.#targetMode,
      phase: this.#targetMode ? "transitioning" : "stable",
      stableSymbolPackage: this.#activeSymbolPackageId,
      targetSymbolPackage: this.#targetMode
        ? this.#targetSymbolPackageId
        : null,
      activeBackgroundNodes: this.#activeBackgroundNodes,
    });
  }

  async requestGameMode(
    modeId: string,
    options: {
      readonly recreateReel?: boolean;
      readonly reels?: Readonly<
        Partial<Record<"main", SceneLayoutInitialReelScene>>
      >;
    } = {},
  ): Promise<void> {
    this.assertReady();
    const modes = this.requireGameModes();
    const mode = modes.modes.find((candidate) => candidate.id === modeId);
    if (!mode)
      throw new SceneLayoutError(`Unknown scene layout game mode "${modeId}".`);
    if (this.#targetMode)
      throw new SceneLayoutError(
        `Scene layout game mode transition to "${this.#targetMode}" is already in progress.`,
      );
    if (this.playingPopupId())
      throw new SceneLayoutError(
        "Cannot change scene layout game mode while an award celebration is active.",
      );
    if (
      options.recreateReel !== undefined &&
      typeof options.recreateReel !== "boolean"
    )
      throw new SceneLayoutError(
        "recreateReel must be a boolean when provided.",
      );
    const recreateReel = options.recreateReel === true;
    if (mode.id === this.#stableMode && !recreateReel) {
      if (options.reels?.main)
        throw new SceneLayoutError(
          "Current game mode must not receive a redundant reels.main input.",
        );
      return;
    }
    const source = modes.modes.find(
      (candidate) => candidate.id === this.#stableMode,
    )!;
    const sourceBinding = this.resolveModeSymbolBinding(source);
    const targetBinding = this.resolveModeSymbolBinding(mode);
    if (recreateReel && !targetBinding)
      throw new SceneLayoutError(
        `Scene layout game mode "${mode.id}" has no symbol package to recreate.`,
      );
    const bindingChanged =
      sourceBinding?.id !== targetBinding?.id || recreateReel;
    const targetInput = options.reels?.main;
    if (!bindingChanged && targetInput)
      throw new SceneLayoutError(
        "Game modes sharing a symbol package must not receive reels.main input.",
      );
    if (bindingChanged && targetBinding && !targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${mode.id}" requires target reels.main input.`,
      );
    if (!targetBinding && targetInput)
      throw new SceneLayoutError(
        `Scene layout game mode "${mode.id}" has no symbol package and must not receive reels.main input.`,
      );
    let prepared: {
      readonly reel: ReelPresentation;
      readonly catalog: SymbolCatalogModel;
    } | null = null;
    if (bindingChanged && targetBinding) {
      const catalog = await targetBinding.resource.createCatalog();
      this.assertAlive();
      const reel = this.createReelPresentation(
        targetBinding.resource,
        catalog,
        targetBinding.binding,
      );
      try {
        this.applyReelScene(
          reel,
          targetBinding.resource,
          targetBinding.binding,
          targetInput!,
        );
      } catch (error) {
        reel.destroy({ children: true });
        throw error;
      }
      prepared = { reel, catalog };
    }
    const transitions = this.modeTransitionEntries(source, mode);
    try {
      for (const [nodeId, state] of transitions) {
        if (!this.#layout.canRequestNodeState(nodeId, state))
          throw new SceneLayoutError(
            `Scene layout node "${nodeId}" cannot transition to state "${state}".`,
          );
      }
    } catch (error) {
      prepared?.reel.destroy({ children: true });
      throw error;
    }
    this.#targetMode = mode.id;
    this.#targetSymbolPackageId = targetBinding?.id ?? null;
    try {
      await Promise.all(
        transitions.map(([nodeId, state]) =>
          this.#layout.requestNodeState(nodeId, state),
        ),
      );
      this.assertAlive();
      this.commitBackgroundVisibility(mode);
      if (bindingChanged) {
        const previous = this.#reel;
        if (prepared) {
          this.attachReel(prepared.reel);
          this.#reel = prepared.reel;
          this.#catalog = prepared.catalog;
        } else {
          this.#reel = null;
          this.#catalog = null;
        }
        this.#activeSymbolPackageId = targetBinding?.id ?? null;
        this.#stableMode = mode.id;
        if (previous) {
          previous.parent?.removeChild(previous);
          previous.destroy({ children: true });
        }
      } else {
        this.#stableMode = mode.id;
      }
    } catch (error) {
      if (prepared && prepared.reel !== this.#reel)
        prepared.reel.destroy({ children: true });
      throw error;
    } finally {
      this.#targetMode = null;
      this.#targetSymbolPackageId = null;
    }
  }

  startAwardCelebrationForCurrentMode(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): void {
    this.assertReady();
    const modes = this.requireGameModes();
    if (this.#targetMode)
      throw new SceneLayoutError(
        "Cannot start an award celebration during a game mode transition.",
      );
    if (this.playingPopupId())
      throw new SceneLayoutError("An award celebration is already active.");
    if (!Number.isSafeInteger(input.betAmountRaw) || input.betAmountRaw <= 0)
      throw new SceneLayoutError(
        "betAmountRaw must be a positive safe integer.",
      );
    if (!Number.isSafeInteger(input.winAmountRaw) || input.winAmountRaw < 0)
      throw new SceneLayoutError(
        "winAmountRaw must be a non-negative safe integer.",
      );
    const mode = modes.modes.find(
      (candidate) => candidate.id === this.#stableMode,
    )!;
    if (!mode.awardCelebrationPopup)
      throw new SceneLayoutError(
        `Scene layout game mode "${mode.id}" has no award celebration popup.`,
      );
    const popup = this.getAwardCelebrationPopup(mode.awardCelebrationPopup);
    popup.start(input);
    if (popup.isPlaying()) this.#activePopupId = mode.awardCelebrationPopup;
  }

  requestAdvanceAwardCelebration(): void {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) throw new SceneLayoutError("No award celebration is active.");
    this.getAwardCelebrationPopup(id).requestAdvance();
  }

  dismissActiveAwardCelebrationImmediately(): void {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) return;
    this.getAwardCelebrationPopup(id).dismissImmediately();
    this.#activePopupId = null;
  }

  getActiveAwardCelebrationSnapshot() {
    this.assertReady();
    const id = this.#activePopupId ?? this.playingPopupId();
    if (!id) return null;
    return this.getAwardCelebrationPopup(id).getSnapshot();
  }

  getSnapshot(): SceneLayoutSnapshot {
    this.assertReady();
    return this.#layout.getSnapshot();
  }

  getNode(id: string): Container {
    this.assertReady();
    return this.#layout.getNode(id);
  }

  attachChild(options: AttachChildOptions): () => void {
    this.assertReady();
    return this.#layout.attachChild(options);
  }

  attachRelative(options: AttachRelativeOptions): () => void {
    this.assertReady();
    return this.#layout.attachRelative(options);
  }

  getReelGrid(id: string): ResolvedSceneLayoutReelGrid {
    this.assertReady();
    return this.#layout.getReelGrid(id);
  }

  getImageStringNodeNames(): readonly string[] {
    this.assertReady();
    return this.#layout.getImageStringNodeNames();
  }

  setImageStringText(nodeId: string, text: string): void {
    this.assertReady();
    this.#layout.setImageStringText(nodeId, text);
  }

  getImageStringText(nodeId: string): string {
    this.assertReady();
    return this.#layout.getImageStringText(nodeId);
  }

  requestNodeState(nodeId: string, state: string): Promise<void> {
    this.assertReady();
    return this.#layout.requestNodeState(nodeId, state);
  }

  canRequestNodeState(nodeId: string, state: string): boolean {
    this.assertReady();
    return this.#layout.canRequestNodeState(nodeId, state);
  }

  getNodeStateSnapshot(nodeId: string): SceneLayoutNodeStateSnapshot {
    this.assertReady();
    return this.#layout.getNodeStateSnapshot(nodeId);
  }

  setNodeActive(nodeId: string, active: boolean): void {
    this.assertReady();
    this.#layout.setNodeActive(nodeId, active);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#reel?.destroy({ children: true });
    this.#reel = null;
    this.#catalog = null;
    for (const popup of this.#popups.values()) popup.destroy();
    this.#popups.clear();
    this.#layout.destroy();
    this.#resource.destroy();
    this.#initialized = false;
    this.#stableMode = null;
    this.#targetMode = null;
    this.#activePopupId = null;
    this.#activeSymbolPackageId = null;
    this.#targetSymbolPackageId = null;
    this.#activeBackgroundNodes = Object.freeze([]);
  }

  private createReelPresentation(
    resource: SymbolPackageResource,
    catalog: SymbolCatalogModel,
    binding: SceneLayoutSymbolPackageBinding,
  ): ReelPresentation {
    const geometry = this.#resource.manifest.reels.main!;
    const reels = resource.gameConfig.getReels(binding.reelSet);
    const registry = createCatalogRegistry(resource, catalog);
    if (binding.renderMode === "standard") {
      return new RenderReelSet({
        reels,
        registry,
        layout: createReelLayout({
          reelCount: geometry.columns,
          visibleRows: geometry.rows,
          cellWidth: geometry.cellSize.width,
          cellHeight: geometry.cellSize.height,
          columnGap: geometry.gap.x,
          rowGap: geometry.gap.y,
        }),
      });
    }
    return new RenderGridCellReelSet({
      reels,
      registry,
      columns: geometry.columns,
      rows: geometry.rows,
      cellWidth: geometry.cellSize.width,
      cellHeight: geometry.cellSize.height,
      columnGap: geometry.gap.x,
      rowGap: geometry.gap.y,
      order: createGridCellOrder({
        columns: geometry.columns,
        rows: geometry.rows,
        mode: "top-down-left-right",
      }),
    });
  }

  private applyReelScene(
    reel: ReelPresentation,
    packageResource: SymbolPackageResource,
    binding: SceneLayoutSymbolPackageBinding,
    input: SceneLayoutInitialReelScene,
  ): void {
    const geometry = this.#resource.manifest.reels.main;
    if (!geometry)
      throw new SceneLayoutError('Scene layout reel "main" is missing.');
    const scene = validateScene(
      input.scene,
      geometry.columns,
      geometry.rows,
      packageResource,
    );
    const reels = packageResource.gameConfig.getReels(binding.reelSet);
    const phases = validatePhases(input.localPhaseYs, geometry.columns, reels);
    const values = validateValues(
      input.presentationValues,
      geometry.columns,
      geometry.rows,
    );
    if (reel instanceof RenderGridCellReelSet) {
      reel.resetToScene(scene, phases, undefined, values);
      return;
    }
    reel.resetToVisibleScene(scene, phases);
    if (values) {
      for (let x = 0; x < geometry.columns; x += 1)
        reel.reels[x].resetToVisibleSymbols(scene[x], phases[x], values[x]);
    }
  }

  private attachReel(reel: ReelPresentation): void {
    const order = this.#resource.manifest.reels.main?.order;
    if (order === undefined)
      throw new SceneLayoutError(
        "Scene layout reels.main.order is required for a bound reel.",
      );
    const insertionIndex = this.#resource.manifest.nodes.filter(
      (node) => node.order < order,
    ).length;
    this.container.addChildAt(reel, insertionIndex);
    const grid = this.#layout.getReelGrid("main");
    reel.position.set(grid.artRect.x, grid.artRect.y);
  }

  private resolveModeSymbolBinding(mode: SceneLayoutGameMode | null): {
    readonly id: string;
    readonly binding: SceneLayoutSymbolPackageBinding;
    readonly resource: SymbolPackageResource;
  } | null {
    const legacyBinding = this.#resource.manifest.symbolPackage;
    if (legacyBinding) {
      const resource = this.#resource.symbolPackage;
      if (!resource)
        throw new SceneLayoutError(
          "Scene layout legacy symbol package resource is unavailable.",
        );
      return {
        id: resource.packageManifest.id,
        binding: legacyBinding,
        resource,
      };
    }
    const id = mode?.symbolPackage;
    if (!id) return null;
    const binding = this.#resource.manifest.symbolPackages?.[id];
    const resource = this.#resource.symbolPackages[id];
    if (!binding || !resource)
      throw new SceneLayoutError(
        `Scene layout symbol package "${id}" is unavailable.`,
      );
    return { id, binding, resource };
  }

  private modeTransitionEntries(
    source: SceneLayoutGameMode,
    target: SceneLayoutGameMode,
  ): readonly (readonly [string, string])[] {
    const candidates = new Set(
      this.requireGameModes().modes.flatMap((mode) =>
        Object.values(mode.backgroundNodes ?? {}),
      ),
    );
    const sourceBackgrounds = new Set(
      Object.values(source.backgroundNodes ?? {}),
    );
    const targetBackgrounds = new Set(
      Object.values(target.backgroundNodes ?? {}),
    );
    return Object.freeze(
      Object.entries(target.nodeStates)
        .filter(
          ([nodeId]) =>
            !candidates.has(nodeId) ||
            (sourceBackgrounds.has(nodeId) && targetBackgrounds.has(nodeId)),
        )
        .map(([nodeId, state]) => Object.freeze([nodeId, state] as const)),
    );
  }

  private commitBackgroundVisibility(mode: SceneLayoutGameMode | null): void {
    const modes = this.#resource.manifest.gameModes?.modes ?? [];
    const candidates = new Set(
      modes.flatMap((candidate) =>
        Object.values(candidate.backgroundNodes ?? {}),
      ),
    );
    if (candidates.size === 0) return;
    const active = new Set(Object.values(mode?.backgroundNodes ?? {}));
    for (const nodeId of candidates)
      this.#layout.setNodeActive(nodeId, active.has(nodeId));
    this.#activeBackgroundNodes = Object.freeze([...active].sort());
  }

  private requireReel(id: "main"): ReelPresentation {
    if (id !== "main" || !this.#reel)
      throw new SceneLayoutError(
        `Scene layout reel presentation "${id}" is unavailable.`,
      );
    return this.#reel;
  }

  private requireGameModes() {
    const gameModes = this.#resource.manifest.gameModes;
    if (!gameModes)
      throw new SceneLayoutError(
        "Scene layout manifest does not declare gameModes.",
      );
    return gameModes;
  }

  private requireMode(id: string): SceneLayoutGameMode {
    const mode = this.#resource.manifest.gameModes?.modes.find(
      (candidate) => candidate.id === id,
    );
    if (!mode)
      throw new SceneLayoutError(`Unknown scene layout game mode "${id}".`);
    return mode;
  }

  private playingPopupId(): string | null {
    for (const [id, popup] of this.#popups) if (popup.isPlaying()) return id;
    return null;
  }

  private assertReady(): void {
    this.assertAlive();
    if (!this.#initialized)
      throw new SceneLayoutError(
        "Scene layout package runtime has not initialized.",
      );
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw new SceneLayoutError("Scene layout package runtime was destroyed.");
  }
}

function createCatalogRegistry(
  resource: SymbolPackageResource,
  catalog: SymbolCatalogModel,
): ReelSymbolRegistry {
  const entries = resource.displaySymbols.map((symbol) => {
    const code = resource.gameConfig.getSymbolCode(symbol);
    if (code === undefined)
      throw new SceneLayoutError(
        `Display symbol "${symbol}" has no paytable code.`,
      );
    return Object.freeze({ code, symbol, kind: "textured" as const });
  });
  const byCode = new Map(entries.map((entry) => [entry.code, entry]));
  const bySymbol = new Map(entries.map((entry) => [entry.symbol, entry]));
  const validation: ReelSymbolRegistryValidation = Object.freeze({
    texturedSymbols: Object.freeze(entries.map((entry) => entry.symbol)),
    configuredEmptySymbols: Object.freeze([]),
    configuredEmptySymbolsWithAssets: Object.freeze([]),
    missingAssetEmptySymbols: Object.freeze([]),
    ignoredAssetsWithoutPaytable: Object.freeze([]),
  });
  const requireEntry = <T>(entry: T | undefined, label: string): T => {
    if (!entry) throw new SceneLayoutError(`Unknown display symbol ${label}.`);
    return entry;
  };
  return Object.freeze({
    getValidation: () => validation,
    getEntryByCode: (code: number): ReelSymbolRegistryEntry =>
      requireEntry(byCode.get(code), `code ${code}`),
    getEntryBySymbol: (symbol: string): ReelSymbolRegistryEntry =>
      requireEntry(bySymbol.get(symbol), `"${symbol}"`),
    getCellSize: () => resource.packageManifest.cellSize,
    createRenderSymbolByCode(code: number): RenderSymbol {
      const entry = requireEntry(byCode.get(code), `code ${code}`);
      return catalog.createRenderSymbol(entry.symbol, {
        valueControllerFactory: createSymbolPackageValueControllerFactory(
          resource,
          entry.symbol,
        ),
      });
    },
  });
}

function validateScene(
  scene: readonly (readonly number[])[],
  columns: number,
  rows: number,
  resource: SymbolPackageResource,
): readonly (readonly number[])[] {
  if (!Array.isArray(scene) || scene.length !== columns)
    throw new SceneLayoutError(
      `Reel scene must be an x-first ${columns}x${rows} matrix.`,
    );
  const displayCodes = new Set(
    resource.displaySymbols.map((symbol) =>
      resource.gameConfig.getSymbolCode(symbol),
    ),
  );
  return Object.freeze(
    scene.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows)
        throw new SceneLayoutError(
          `Reel scene column ${x} must contain ${rows} rows.`,
        );
      return Object.freeze(
        column.map((code, y) => {
          if (!Number.isSafeInteger(code) || !displayCodes.has(code))
            throw new SceneLayoutError(
              `Reel scene[${x}][${y}] code ${String(code)} is not displayable.`,
            );
          return code;
        }),
      );
    }),
  );
}

function validatePhases(
  phases: readonly number[],
  columns: number,
  reels: LogicReels,
): readonly number[] {
  if (!Array.isArray(phases) || phases.length !== columns)
    throw new SceneLayoutError(`localPhaseYs must contain ${columns} values.`);
  return Object.freeze(
    phases.map((phase, x) => {
      if (!Number.isSafeInteger(phase))
        throw new SceneLayoutError(
          `localPhaseYs[${x}] must be a finite safe integer.`,
        );
      return reels.normalizeY(x, phase);
    }),
  );
}

function validateValues(
  values: SceneLayoutInitialReelScene["presentationValues"],
  columns: number,
  rows: number,
): SymbolPresentationValueMatrix | undefined {
  if (values === undefined) return undefined;
  if (!Array.isArray(values) || values.length !== columns)
    throw new SceneLayoutError(
      `presentationValues must be an x-first ${columns}x${rows} matrix.`,
    );
  return Object.freeze(
    values.map((column, x) => {
      if (!Array.isArray(column) || column.length !== rows)
        throw new SceneLayoutError(
          `presentationValues column ${x} must contain ${rows} rows.`,
        );
      return Object.freeze(
        column.map((value, y) => {
          if (value !== null && (!Number.isSafeInteger(value) || value <= 0))
            throw new SceneLayoutError(
              `presentationValues[${x}][${y}] must be null or a positive safe integer.`,
            );
          return value;
        }),
      );
    }),
  );
}

function asSceneLayoutError(error: unknown): SceneLayoutError {
  return error instanceof SceneLayoutError
    ? error
    : new SceneLayoutError(
        error instanceof Error ? error.message : String(error),
      );
}
