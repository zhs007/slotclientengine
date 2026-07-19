import type { LogicReels } from "@slotclientengine/logiccore";
import { Container } from "pixi.js";
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
  SceneLayoutInitialReelScene,
  SceneLayoutNodeStateSnapshot,
  SceneLayoutPackageResource,
  SceneLayoutPackageRuntime,
  SceneLayoutSnapshot,
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
  #initialized = false;
  #initializing = false;
  #destroyed = false;

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
      const binding = this.#resource.manifest.symbolPackage;
      if (binding) {
        const initial = options.reels?.main;
        if (!initial)
          throw new SceneLayoutError(
            "Scene layout package runtime requires initial reels.main input.",
          );
        const symbolPackage = this.requireSymbolPackage();
        this.#catalog = await symbolPackage.createCatalog();
        this.assertAlive();
        this.#reel = this.createReelPresentation(symbolPackage, this.#catalog);
        const order = this.#resource.manifest.reels.main?.order;
        if (order === undefined)
          throw new SceneLayoutError(
            "Scene layout reels.main.order is required for a bound reel.",
          );
        const insertionIndex = this.#resource.manifest.nodes.filter(
          (node) => node.order < order,
        ).length;
        this.container.addChildAt(this.#reel, insertionIndex);
        this.resetReelScene("main", initial);
      } else if (options.reels?.main) {
        throw new SceneLayoutError(
          "Scene layout package has no symbol binding and must not receive reels.main input.",
        );
      }
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
    return snapshot;
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    this.#layout.update(deltaSeconds);
    this.#reel?.update(deltaSeconds);
  }

  resetReelScene(reelId: "main", input: SceneLayoutInitialReelScene): void {
    this.assertAlive();
    const reel = this.requireReel(reelId);
    const packageResource = this.requireSymbolPackage();
    const geometry = this.#resource.manifest.reels.main;
    if (!geometry)
      throw new SceneLayoutError('Scene layout reel "main" is missing.');
    const scene = validateScene(
      input.scene,
      geometry.columns,
      geometry.rows,
      packageResource,
    );
    const reels = packageResource.gameConfig.getReels(
      this.#resource.manifest.symbolPackage!.reelSet,
    );
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
      for (let x = 0; x < geometry.columns; x += 1) {
        reel.reels[x].resetToVisibleSymbols(scene[x], phases[x], values[x]);
      }
    }
  }

  getReelPresentation(reelId: "main"): Container {
    this.assertReady();
    return this.requireReel(reelId);
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

  getNodeStateSnapshot(nodeId: string): SceneLayoutNodeStateSnapshot {
    this.assertReady();
    return this.#layout.getNodeStateSnapshot(nodeId);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#reel?.destroy({ children: true });
    this.#reel = null;
    this.#catalog = null;
    this.#layout.destroy();
    this.#resource.destroy();
    this.#initialized = false;
  }

  private createReelPresentation(
    resource: SymbolPackageResource,
    catalog: SymbolCatalogModel,
  ): ReelPresentation {
    const binding = this.#resource.manifest.symbolPackage!;
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

  private requireReel(id: "main"): ReelPresentation {
    if (id !== "main" || !this.#reel)
      throw new SceneLayoutError(
        `Scene layout reel presentation "${id}" is unavailable.`,
      );
    return this.#reel;
  }

  private requireSymbolPackage(): SymbolPackageResource {
    const resource = this.#resource.symbolPackage;
    if (!resource)
      throw new SceneLayoutError(
        "Scene layout package has no symbol package binding.",
      );
    return resource;
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
