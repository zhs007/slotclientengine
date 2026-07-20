import {
  createSceneLayoutRuntime,
  createSceneLayoutPackageRuntime,
  resolveSceneLayoutFrameViewport,
  type SceneLayoutFrameViewport,
  type SceneLayoutManifestV1,
  type SceneLayoutRuntime,
  type SceneLayoutPackageRuntime,
  type SceneLayoutSnapshot,
} from "@slotclientengine/rendercore/scene-layout";
import {
  createSymbolPackageValueControllerFactory,
  type RenderSymbol,
  type SymbolCatalogModel,
  type SymbolPackageResource,
} from "@slotclientengine/rendercore/symbol";
import { Application, Container, Graphics } from "pixi.js";
import {
  validateLayoutAssets,
  type ImportedLayoutPackage,
} from "../io/imported-layout-zip.js";
import { drawPreviewGuides } from "./preview-guides.js";
import {
  createWebCryptoRandomUint32Source,
  inspectReelSets,
  requireCompatibleReelSets,
  sampleRandomReelScene,
  type RandomReelSceneSnapshot,
  type RandomUint32Source,
  type ReelSetPreviewInfo,
} from "./random-reel-scene.js";
import {
  clampPreviewZoom,
  validatePreviewSize,
  type PreviewSize,
} from "./preview-size.js";
import {
  createOtherScenePreview,
  type OtherScenePreviewSnapshot,
  type SymbolOtherScenePreviewBinding,
} from "./other-scene-preview.js";

export interface SymbolPreviewGridSize {
  readonly columns: number;
  readonly rows: number;
}

export interface PreviewSpineNodeState {
  readonly nodeId: string;
  readonly states: readonly string[];
  readonly stableState: string;
  readonly targetState: string | null;
  readonly phase: "stable" | "transitioning";
}

export interface SymbolPackagePreviewSnapshot {
  readonly packageId: string;
  readonly cellSize: Readonly<{ width: number; height: number }>;
  readonly displaySymbolCount: number;
  readonly reelSets: readonly ReelSetPreviewInfo[];
  readonly selectedReelSet: string | null;
  readonly status: "ready" | "pending-selection" | "incompatible";
  readonly message: string;
  readonly scene: RandomReelSceneSnapshot | null;
  readonly availableTargets: Readonly<
    Record<string, readonly SymbolOtherScenePreviewBinding["target"][]>
  >;
  readonly numberWeightTableNames: readonly string[];
  readonly bindings: readonly SymbolOtherScenePreviewBinding[];
  readonly otherScene: OtherScenePreviewSnapshot | null;
}

export class LayoutPreview {
  readonly #host: HTMLElement;
  readonly #diagnostics: HTMLElement;
  #randomSource: RandomUint32Source | null;
  readonly #app = new Application();
  readonly #guides = new Graphics();
  readonly #symbolOverlay = new Container();
  #package: ImportedLayoutPackage | null = null;
  #runtime: SceneLayoutRuntime | null = null;
  #packageRuntime: SceneLayoutPackageRuntime | null = null;
  #manifest: SceneLayoutManifestV1 | null = null;
  #lastLayoutSnapshot: SceneLayoutSnapshot | null = null;
  #frameViewport: SceneLayoutFrameViewport | null = null;
  #pageSize: PreviewSize = { width: 1920, height: 1080 };
  #zoom = 1;
  #showFocus = true;
  #showReels = true;
  #ready = false;
  #destroyed = false;
  #layoutRequest = 0;
  #symbolRequest = 0;
  #symbolResource: SymbolPackageResource | null = null;
  #symbolCatalog: SymbolCatalogModel | null = null;
  #symbolPreview: SymbolPackagePreviewSnapshot | null = null;
  #symbolGrid: SymbolPreviewGridSize | null = null;
  #renderSymbols: RenderSymbol[] = [];
  #symbolDiagnostic = "";
  #symbolBindings: readonly SymbolOtherScenePreviewBinding[] = Object.freeze(
    [],
  );

  constructor(
    host: HTMLElement,
    diagnostics: HTMLElement,
    options: { readonly randomSource?: RandomUint32Source } = {},
  ) {
    this.#host = host;
    this.#diagnostics = diagnostics;
    this.#randomSource = options.randomSource ?? null;
    this.#symbolOverlay.sortableChildren = true;
  }

  async init(): Promise<void> {
    if (this.#ready || this.#destroyed)
      throw new Error("Preview init 状态非法。");
    await this.#app.init({
      width: 1,
      height: 1,
      background: "#050914",
      antialias: true,
    });
    this.#app.canvas.setAttribute("aria-label", "布局预览画布");
    this.#host.replaceChildren(this.#app.canvas);
    this.#app.stage.addChild(this.#symbolOverlay, this.#guides);
    this.#app.ticker.add((ticker) => {
      if (this.#runtime) this.#runtime.update(ticker.deltaMS / 1000);
      for (const symbol of this.#renderSymbols)
        symbol.update(ticker.deltaMS / 1000);
    });
    this.#ready = true;
  }

  async setLayout(
    manifest: SceneLayoutManifestV1,
    assets: ReadonlyMap<string, Uint8Array>,
  ): Promise<void> {
    this.assertReady();
    const request = ++this.#layoutRequest;
    const packageScene = manifest.symbolPackage
      ? this.requirePackagePreviewScene(manifest)
      : null;
    const nextPackage = await validateLayoutAssets(manifest, assets);
    if (request !== this.#layoutRequest || this.#destroyed) {
      nextPackage.destroy();
      return;
    }
    const needsPackageRuntime = Boolean(
      manifest.symbolPackage || manifest.popups || manifest.gameModes,
    );
    const nextRuntime = needsPackageRuntime
      ? createSceneLayoutPackageRuntime({
          resource: nextPackage.packageResource,
        })
      : createSceneLayoutRuntime({ resource: nextPackage.resource });
    try {
      if (needsPackageRuntime) {
        await (nextRuntime as SceneLayoutPackageRuntime).init(
          manifest.symbolPackage
            ? {
                reels: {
                  main: {
                    scene: packageScene!.codes,
                    localPhaseYs: packageScene!.stopYs,
                  },
                },
              }
            : {},
        );
      } else {
        await nextRuntime.init();
      }
    } catch (error) {
      nextRuntime.destroy();
      nextPackage.destroy();
      throw error;
    }
    if (request !== this.#layoutRequest || this.#destroyed) {
      nextRuntime.destroy();
      nextPackage.destroy();
      return;
    }
    this.clearRuntime();
    this.#package = nextPackage;
    this.#runtime = nextRuntime;
    this.#packageRuntime = needsPackageRuntime
      ? (nextRuntime as SceneLayoutPackageRuntime)
      : null;
    this.#manifest = manifest;
    this.#app.stage.addChildAt(nextRuntime.container, 0);
    this.applySize();
  }

  playAwardCelebration(input: {
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }): void {
    if (!this.#packageRuntime)
      throw new Error("当前 layout preview 没有 package runtime。");
    this.#packageRuntime.dismissActiveAwardCelebrationImmediately();
    this.#packageRuntime.startAwardCelebrationForCurrentMode(input);
  }

  advanceAwardCelebration(): void {
    if (!this.#packageRuntime)
      throw new Error("当前 layout preview 没有 package runtime。");
    this.#packageRuntime.requestAdvanceAwardCelebration();
  }

  dismissAwardCelebrationImmediately(): void {
    if (!this.#packageRuntime)
      throw new Error("当前 layout preview 没有 package runtime。");
    this.#packageRuntime.dismissActiveAwardCelebrationImmediately();
  }

  getGameModeIds(): readonly string[] {
    return this.#packageRuntime?.getGameModeIds() ?? Object.freeze([]);
  }

  getGameModeSnapshot() {
    return this.#packageRuntime?.getGameModeSnapshot() ?? null;
  }

  getActiveAwardCelebrationSnapshot() {
    return this.#packageRuntime?.getActiveAwardCelebrationSnapshot() ?? null;
  }

  async requestGameMode(modeId: string): Promise<void> {
    if (!this.#packageRuntime)
      throw new Error("当前 layout preview 没有 package runtime。");
    await this.#packageRuntime.requestGameMode(modeId);
  }

  clear(): void {
    this.assertReady();
    this.#layoutRequest += 1;
    this.clearRuntime();
    this.clearRenderSymbols();
    this.#manifest = null;
    this.#guides.clear();
    this.#diagnostics.textContent = "配置未通过严格校验，预览与导出已暂停。";
  }

  async setSymbolPackage(
    resource: SymbolPackageResource | null,
    grid?: SymbolPreviewGridSize,
  ): Promise<SymbolPackagePreviewSnapshot | null> {
    this.assertReady();
    const request = ++this.#symbolRequest;
    if (!resource) {
      this.clearSymbolPackage();
      if (this.#runtime) this.applySize();
      return null;
    }
    const targetGrid = grid ?? this.#symbolGrid;
    if (!targetGrid) {
      resource.destroy();
      throw new Error("导入 symbols package 前必须存在有效 main grid。");
    }
    let catalog: SymbolCatalogModel;
    let prepared: SymbolPackagePreviewSnapshot;
    const previousBindings = this.#symbolBindings;
    this.#symbolBindings = Object.freeze([]);
    try {
      catalog = await resource.createCatalog();
      prepared = this.createSymbolPreview(resource, targetGrid, null, true);
    } catch (error) {
      this.#symbolBindings = previousBindings;
      resource.destroy();
      throw error;
    }
    if (request !== this.#symbolRequest || this.#destroyed) {
      this.#symbolBindings = previousBindings;
      resource.destroy();
      return null;
    }
    this.clearSymbolPackage();
    this.#symbolResource = resource;
    this.#symbolCatalog = catalog;
    this.#symbolGrid = freezeGrid(targetGrid);
    this.#symbolPreview = prepared;
    if (this.#lastLayoutSnapshot)
      this.layoutSymbolOverlay(this.#lastLayoutSnapshot);
    return prepared;
  }

  setSymbolGrid(
    grid: SymbolPreviewGridSize,
  ): SymbolPackagePreviewSnapshot | null {
    this.assertReady();
    const nextGrid = freezeGrid(grid);
    const previousGrid = this.#symbolGrid;
    this.#symbolGrid = nextGrid;
    const resource = this.#symbolResource;
    if (!resource) return null;
    if (
      previousGrid &&
      previousGrid.columns === nextGrid.columns &&
      previousGrid.rows === nextGrid.rows
    ) {
      return this.#symbolPreview;
    }
    const selected = this.#symbolPreview?.selectedReelSet ?? null;
    const previousPreview = this.#symbolPreview;
    try {
      this.#symbolPreview = this.createSymbolPreview(
        resource,
        nextGrid,
        selected,
        false,
      );
      if (this.#lastLayoutSnapshot)
        this.layoutSymbolOverlay(this.#lastLayoutSnapshot);
      return this.#symbolPreview;
    } catch (error) {
      this.#symbolGrid = previousGrid;
      this.#symbolPreview = previousPreview;
      throw error;
    }
  }

  setSelectedReelSet(name: string): SymbolPackagePreviewSnapshot {
    this.assertReady();
    const resource = this.#symbolResource;
    const preview = this.#symbolPreview;
    const grid = this.#symbolGrid;
    if (!resource || !preview || !grid)
      throw new Error("尚未导入可用的 symbols package。");
    const selected = preview.reelSets.find((info) => info.name === name);
    if (!selected?.compatible) {
      throw new Error(
        `reel set "${name}" 不可选择${selected?.reason ? `：${selected.reason}` : "。"}`,
      );
    }
    try {
      this.#symbolPreview = this.createReadySymbolPreview(
        resource,
        grid,
        preview.reelSets,
        name,
      );
      this.syncPackageReel();
      if (this.#lastLayoutSnapshot)
        this.layoutSymbolOverlay(this.#lastLayoutSnapshot);
      return this.#symbolPreview;
    } catch (error) {
      this.#symbolPreview = preview;
      throw error;
    }
  }

  randomizeSymbols(): SymbolPackagePreviewSnapshot {
    this.assertReady();
    const resource = this.#symbolResource;
    const preview = this.#symbolPreview;
    const grid = this.#symbolGrid;
    if (!resource || !preview || !grid || !preview.selectedReelSet) {
      throw new Error("请选择兼容 reel set 后再重新随机。");
    }
    this.#symbolRequest += 1;
    try {
      this.#symbolPreview = this.createReadySymbolPreview(
        resource,
        grid,
        preview.reelSets,
        preview.selectedReelSet,
      );
      this.syncPackageReel();
      if (this.#lastLayoutSnapshot)
        this.layoutSymbolOverlay(this.#lastLayoutSnapshot);
      return this.#symbolPreview;
    } catch (error) {
      this.#symbolPreview = preview;
      throw error;
    }
  }

  setOtherSceneBindings(
    bindings: readonly SymbolOtherScenePreviewBinding[],
  ): SymbolPackagePreviewSnapshot {
    this.assertReady();
    const resource = this.#symbolResource;
    const preview = this.#symbolPreview;
    if (!resource || !preview) {
      throw new Error("尚未导入可用的 symbols package。");
    }
    const previous = this.#symbolBindings;
    const previousPreview = this.#symbolPreview;
    this.#symbolBindings = Object.freeze(
      bindings.map((binding) => structuredClone(binding)),
    );
    try {
      this.#symbolPreview = preview.scene
        ? this.createReadySnapshotFromScene(
            resource,
            preview.reelSets,
            preview.scene,
          )
        : Object.freeze({
            ...preview,
            bindings: this.#symbolBindings,
            otherScene: null,
          });
      this.syncPackageReel();
      if (this.#lastLayoutSnapshot)
        this.layoutSymbolOverlay(this.#lastLayoutSnapshot);
      return this.#symbolPreview;
    } catch (error) {
      this.#symbolBindings = previous;
      this.#symbolPreview = previousPreview;
      throw error;
    }
  }

  getSymbolPreviewSnapshot(): SymbolPackagePreviewSnapshot | null {
    return this.#symbolPreview;
  }

  getSpineNodeStates(): readonly PreviewSpineNodeState[] {
    this.assertReady();
    const runtime = this.#runtime;
    const manifest = this.#manifest;
    const variantId = this.#lastLayoutSnapshot?.variantId;
    if (!runtime || !manifest || !variantId) return Object.freeze([]);
    return Object.freeze(
      manifest.nodes.flatMap((node) => {
        if (
          node.resource.kind !== "spine" ||
          !("stateMachine" in node.resource) ||
          !node.placements[variantId]
        )
          return [];
        return [
          Object.freeze({
            nodeId: node.id,
            states: Object.freeze(
              Object.keys(node.resource.stateMachine.states),
            ),
            ...runtime.getNodeStateSnapshot(node.id),
          }),
        ];
      }),
    );
  }

  async requestNodeState(nodeId: string, state: string): Promise<void> {
    this.assertReady();
    const runtime = this.#runtime;
    if (!runtime) throw new Error("布局 preview 尚未初始化。");
    await runtime.requestNodeState(nodeId, state);
  }

  setPageSize(size: PreviewSize): void {
    this.#pageSize = validatePreviewSize(size);
    if (this.#runtime) this.applySize();
  }

  setZoom(zoom: number): void {
    this.#zoom = clampPreviewZoom(zoom);
    if (this.#runtime) this.applyDisplaySize();
  }

  setGuideVisibility(options: {
    showFocus: boolean;
    showReels: boolean;
  }): void {
    this.#showFocus = options.showFocus;
    this.#showReels = options.showReels;
    if (this.#runtime) this.applySize();
  }

  get pageSize(): PreviewSize {
    return this.#pageSize;
  }

  get zoom(): number {
    return this.#zoom;
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#layoutRequest += 1;
    this.#symbolRequest += 1;
    this.clearRuntime();
    this.clearSymbolPackage();
    this.#symbolOverlay.destroy({ children: true });
    this.#guides.destroy();
    this.#app.destroy(true, { children: true, texture: true });
    this.#host.replaceChildren();
  }

  private createSymbolPreview(
    resource: SymbolPackageResource,
    grid: SymbolPreviewGridSize,
    preferredSelection: string | null,
    requireCompatible: boolean,
  ): SymbolPackagePreviewSnapshot {
    const reelSets = inspectReelSets({
      gameConfig: resource.gameConfig,
      displaySymbols: resource.displaySymbols,
      columns: grid.columns,
    });
    const compatible = requireCompatible
      ? requireCompatibleReelSets(reelSets, grid.columns)
      : reelSets.filter((info) => info.compatible);
    const retained = compatible.some((info) => info.name === preferredSelection)
      ? preferredSelection
      : null;
    const selected =
      retained ?? (compatible.length === 1 ? compatible[0].name : null);
    if (selected)
      return this.createReadySymbolPreview(resource, grid, reelSets, selected);
    const base = this.createSymbolPreviewBase(resource, reelSets);
    if (compatible.length > 1) {
      return Object.freeze({
        ...base,
        selectedReelSet: null,
        status: "pending-selection" as const,
        message: `有 ${compatible.length} 个兼容 reel set，请显式选择。`,
        scene: null,
      });
    }
    return Object.freeze({
      ...base,
      selectedReelSet: null,
      status: "incompatible" as const,
      message: incompatibleMessage(reelSets, grid.columns),
      scene: null,
    });
  }

  private createReadySymbolPreview(
    resource: SymbolPackageResource,
    grid: SymbolPreviewGridSize,
    reelSets: readonly ReelSetPreviewInfo[],
    selected: string,
  ): SymbolPackagePreviewSnapshot {
    const scene = sampleRandomReelScene({
      gameConfig: resource.gameConfig,
      displaySymbols: resource.displaySymbols,
      reelSetName: selected,
      columns: grid.columns,
      rows: grid.rows,
      randomSource: this.getRandomSource(),
    });
    return this.createReadySnapshotFromScene(resource, reelSets, scene);
  }

  private createReadySnapshotFromScene(
    resource: SymbolPackageResource,
    reelSets: readonly ReelSetPreviewInfo[],
    scene: RandomReelSceneSnapshot,
  ): SymbolPackagePreviewSnapshot {
    const base = this.createSymbolPreviewBase(resource, reelSets);
    const otherScene = createOtherScenePreview({
      scene,
      bindings: this.#symbolBindings,
      gameConfig: resource.gameConfig,
      randomSource: this.getRandomSource(),
      validateTarget: (symbol, target) =>
        validatePreviewTarget(base.availableTargets, symbol, target),
    });
    return Object.freeze({
      ...base,
      selectedReelSet: scene.reelSetName,
      status: "ready" as const,
      message: `reel set "${scene.reelSetName}" 已生成 ${scene.columns}×${scene.rows} 随机场景。`,
      scene,
      bindings: this.#symbolBindings,
      otherScene,
    });
  }

  private createSymbolPreviewBase(
    resource: SymbolPackageResource,
    reelSets: readonly ReelSetPreviewInfo[],
  ) {
    const availableTargets = Object.freeze(
      Object.fromEntries(
        resource.displaySymbols.map((symbol) => {
          const manifest = resource.symbolManifest.symbols[symbol]!;
          const targets: SymbolOtherScenePreviewBinding["target"][] = (
            manifest.imageStringNodes ?? []
          ).map((node) =>
            Object.freeze({
              kind: "image-string-node" as const,
              name: node.name,
            }),
          );
          if (targets.length === 0 && manifest.valuePresentation) {
            targets.push(Object.freeze({ kind: "legacy-presentation-value" }));
          }
          return [symbol, Object.freeze(targets)] as const;
        }),
      ),
    );
    return {
      packageId: resource.packageManifest.id,
      cellSize: resource.packageManifest.cellSize,
      displaySymbolCount: resource.displaySymbols.length,
      reelSets,
      availableTargets,
      numberWeightTableNames:
        typeof resource.gameConfig.getNumberWeightTableNames === "function"
          ? resource.gameConfig.getNumberWeightTableNames()
          : Object.freeze([]),
      bindings: this.#symbolBindings,
      otherScene: null,
    };
  }

  private applySize(): void {
    const manifest = this.#manifest;
    const runtime = this.#runtime;
    if (!manifest || !runtime) return;
    const frameViewport = resolveSceneLayoutFrameViewport({
      manifest,
      pageSize: this.#pageSize,
    });
    this.#frameViewport = frameViewport;
    this.#app.renderer.resize(
      frameViewport.frameDesignSize.width,
      frameViewport.frameDesignSize.height,
    );
    const snapshot = runtime.applyViewport(frameViewport.frameDesignSize);
    this.#lastLayoutSnapshot = snapshot;
    const reel = snapshot.reels.main;
    if (reel) this.setSymbolGrid({ columns: reel.columns, rows: reel.rows });
    this.layoutSymbolOverlay(snapshot);
    drawPreviewGuides({
      graphics: this.#guides,
      snapshot,
      showFocus: this.#showFocus,
      showReels: this.#showReels,
    });
    this.#diagnostics.textContent = [
      `variant=${snapshot.variantId}`,
      `page=${round(this.#pageSize.width)}×${round(this.#pageSize.height)}`,
      `logical=${round(frameViewport.frameDesignSize.width)}×${round(frameViewport.frameDesignSize.height)}`,
      `css=${round(frameViewport.cssSize.width)}×${round(frameViewport.cssSize.height)}`,
      `frameOffset=(${round(frameViewport.offsetX)}, ${round(frameViewport.offsetY)})`,
      `visible=${formatRect(snapshot.visibleRect)}`,
      `world=(${round(snapshot.worldOffset.x)}, ${round(snapshot.worldOffset.y)})`,
      ...(this.#symbolDiagnostic ? [this.#symbolDiagnostic] : []),
    ].join(" · ");
    this.applyDisplaySize();
  }

  private applyDisplaySize(): void {
    const frameViewport = this.#frameViewport;
    if (!frameViewport) return;
    const availableWidth = Math.max(
      280,
      this.#host.parentElement?.clientWidth ?? 900,
    );
    const availableHeight = Math.max(
      240,
      this.#host.parentElement?.clientHeight ?? 700,
    );
    const fit = Math.min(
      availableWidth / this.#pageSize.width,
      availableHeight / this.#pageSize.height,
      1,
    );
    const displayScale = fit * this.#zoom;
    this.#host.style.width = `${this.#pageSize.width * displayScale}px`;
    this.#host.style.height = `${this.#pageSize.height * displayScale}px`;
    this.#app.canvas.style.width = `${frameViewport.cssSize.width * displayScale}px`;
    this.#app.canvas.style.height = `${frameViewport.cssSize.height * displayScale}px`;
    this.#app.canvas.style.marginLeft = `${frameViewport.offsetX * displayScale}px`;
    this.#app.canvas.style.marginTop = `${frameViewport.offsetY * displayScale}px`;
  }

  private clearRuntime(): void {
    this.#runtime?.destroy();
    this.#runtime = null;
    this.#packageRuntime = null;
    this.#lastLayoutSnapshot = null;
    this.#frameViewport = null;
    this.#package?.destroy();
    this.#package = null;
  }

  private layoutSymbolOverlay(snapshot: SceneLayoutSnapshot): void {
    this.#symbolDiagnostic = "";
    const resource = this.#symbolResource;
    const catalog = this.#symbolCatalog;
    const preview = this.#symbolPreview;
    const scene = preview?.scene;
    const reel = snapshot.reels.main;
    if (this.#packageRuntime) {
      this.clearRenderSymbols();
      this.#symbolDiagnostic = preview?.scene
        ? `symbols=${preview.packageId} · combined-runtime · reel=${preview.scene.reelSetName} · stops=[${preview.scene.stopYs.join(",")}]`
        : "symbols=combined-runtime · waiting for an explicit local scene";
      return;
    }
    if (!resource || !catalog || !preview || !reel) {
      this.clearRenderSymbols();
      return;
    }
    if (!scene) {
      this.clearRenderSymbols();
      this.#symbolDiagnostic = `symbols=${preview.packageId} · ${preview.message}`;
      return;
    }
    if (scene.columns !== reel.columns || scene.rows !== reel.rows) {
      this.clearRenderSymbols();
      this.#symbolDiagnostic = `symbols=${preview.packageId} · sampled scene ${scene.columns}×${scene.rows} 与 runtime grid ${reel.columns}×${reel.rows} 不匹配`;
      return;
    }
    const cellCount = reel.columns * reel.rows;
    const nextSymbols: RenderSymbol[] = [];
    const assignmentByCell = new Map(
      (preview.otherScene?.assignments ?? []).map((assignment) => [
        `${assignment.x},${assignment.y}`,
        assignment,
      ]),
    );
    try {
      for (let y = 0; y < reel.rows; y += 1) {
        for (let x = 0; x < reel.columns; x += 1) {
          const symbol = scene.symbols[x][y];
          const renderSymbol = catalog.createRenderSymbol(symbol, {
            valueControllerFactory: createSymbolPackageValueControllerFactory(
              resource,
              symbol,
            ),
          });
          const orderIndex = y * reel.columns + x;
          renderSymbol.scale.set(resource.symbolScales[symbol] ?? 1);
          renderSymbol.zIndex =
            (resource.symbolRenderPriorities[symbol] ?? 0) * cellCount +
            orderIndex;
          renderSymbol.init();
          renderSymbol.position.set(
            reel.viewportRect.x +
              x * reel.stride.width +
              reel.cellSize.width / 2,
            reel.viewportRect.y +
              y * reel.stride.height +
              reel.cellSize.height / 2,
          );
          const presentation =
            resource.symbolManifest.symbols[symbol]?.valuePresentation;
          if (presentation)
            renderSymbol.setPresentationValue(presentation.defaultValues[0]);
          const assignment = assignmentByCell.get(`${x},${y}`);
          if (assignment?.target.kind === "image-string-node") {
            renderSymbol.setImageStringText(
              assignment.target.name,
              String(assignment.value),
            );
          } else if (assignment) {
            renderSymbol.setPresentationValue(assignment.value);
          }
          nextSymbols.push(renderSymbol);
        }
      }
    } catch (error) {
      for (const symbol of nextSymbols) symbol.destroy();
      throw error;
    }
    this.clearRenderSymbols();
    this.#symbolOverlay.addChild(...nextSymbols);
    this.#renderSymbols = nextSymbols;
    this.#symbolDiagnostic = `symbols=${preview.packageId} · reel=${scene.reelSetName} · stops=[${scene.stopYs.join(",")}] · mappings=${formatBindings(preview.bindings)} · otherScene=${formatOtherScene(preview.otherScene?.matrix ?? [])}`;
  }

  private clearRenderSymbols(): void {
    for (const symbol of this.#renderSymbols) symbol.destroy();
    this.#renderSymbols = [];
    this.#symbolOverlay.removeChildren();
  }

  private clearSymbolPackage(): void {
    this.clearRenderSymbols();
    this.#symbolCatalog = null;
    this.#symbolResource?.destroy();
    this.#symbolResource = null;
    this.#symbolPreview = null;
    this.#symbolBindings = Object.freeze([]);
    this.#symbolDiagnostic = "";
  }

  private requirePackagePreviewScene(
    manifest: SceneLayoutManifestV1,
  ): RandomReelSceneSnapshot {
    const binding = manifest.symbolPackage;
    const scene = this.#symbolPreview?.scene;
    if (!binding || !scene)
      throw new Error(
        "组合 preview 要求先显式选择兼容 reel set 并生成本地场景。",
      );
    if (scene.reelSetName !== binding.reelSet)
      throw new Error(
        `组合 preview scene reelSet=${scene.reelSetName} 与 binding=${binding.reelSet} 不一致。`,
      );
    return scene;
  }

  private syncPackageReel(): void {
    const runtime = this.#packageRuntime;
    const manifest = this.#manifest;
    if (!runtime || !manifest?.symbolPackage) return;
    const scene = this.requirePackagePreviewScene(manifest);
    runtime.resetReelScene("main", {
      scene: scene.codes,
      localPhaseYs: scene.stopYs,
    });
  }

  private getRandomSource(): RandomUint32Source {
    this.#randomSource ??= createWebCryptoRandomUint32Source();
    return this.#randomSource;
  }

  private assertReady(): void {
    if (!this.#ready || this.#destroyed)
      throw new Error("Preview 尚未初始化或已销毁。");
  }
}

function freezeGrid(grid: SymbolPreviewGridSize): SymbolPreviewGridSize {
  if (!Number.isSafeInteger(grid.columns) || grid.columns <= 0)
    throw new Error(
      `layout columns 必须是正安全整数，实际为 ${grid.columns}。`,
    );
  if (!Number.isSafeInteger(grid.rows) || grid.rows <= 0)
    throw new Error(`layout rows 必须是正安全整数，实际为 ${grid.rows}。`);
  return Object.freeze({ columns: grid.columns, rows: grid.rows });
}

function incompatibleMessage(
  infos: readonly ReelSetPreviewInfo[],
  columns: number,
): string {
  return `layout columns=${columns} 没有兼容 reel set：${infos
    .map(
      (info) =>
        `${info.name} (${info.reelCount} reels${info.reason ? `；${info.reason}` : ""})`,
    )
    .join("；")}。`;
}

function round(value: number): string {
  return Number(value.toFixed(2)).toString();
}

function formatRect(rect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): string {
  return `${round(rect.x)},${round(rect.y)},${round(rect.width)},${round(rect.height)}`;
}

function validatePreviewTarget(
  available: SymbolPackagePreviewSnapshot["availableTargets"],
  symbol: string,
  target: SymbolOtherScenePreviewBinding["target"],
): void {
  const targets = available[symbol];
  if (!targets)
    throw new Error(`mapped symbol "${symbol}" 不在 package display set。`);
  const found = targets.some((candidate) =>
    candidate.kind === "image-string-node" &&
    target.kind === "image-string-node"
      ? candidate.name === target.name
      : candidate.kind === target.kind,
  );
  if (!found) {
    throw new Error(
      `symbol "${symbol}" 不存在 target ${
        target.kind === "image-string-node"
          ? `image-string-node:${target.name}`
          : target.kind
      }。`,
    );
  }
}

function formatBindings(
  bindings: readonly SymbolOtherScenePreviewBinding[],
): string {
  if (bindings.length === 0) return "none";
  return bindings
    .map((binding) => {
      const target =
        binding.target.kind === "image-string-node"
          ? binding.target.name
          : "legacy";
      const source =
        binding.source.kind === "number-weight-table"
          ? binding.source.tableName
          : String(binding.source.value);
      return `${binding.symbol}->${target}->${source}`;
    })
    .join(",");
}

function formatOtherScene(matrix: readonly (readonly number[])[]): string {
  if (matrix.length === 0) return "[]";
  const rows = matrix[0]?.length ?? 0;
  return Array.from({ length: rows }, (_, y) =>
    matrix.map((column) => column[y]).join(","),
  ).join(";");
}
