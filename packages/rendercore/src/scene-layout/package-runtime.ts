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
import {
  createOfficialSpinePlayer,
  type RendercoreSpinePlayer,
} from "../spine/runtime-player.js";
import { SceneLayoutError } from "./errors.js";
import { transitionResourceKey } from "./resource.js";
import { createSceneLayoutRuntime } from "./runtime.js";
import type {
  AttachChildOptions,
  AttachRelativeOptions,
  ResolvedSceneLayoutReelGrid,
  SceneLayoutGameMode,
  SceneLayoutGameModeTransition,
  SceneLayoutGameModeSnapshot,
  SceneLayoutInitialReelScene,
  SceneLayoutNodeStateSnapshot,
  SceneLayoutPackageResource,
  SceneLayoutPackageRuntime,
  SceneLayoutSnapshot,
  SceneLayoutSymbolPackageBinding,
} from "./types.js";

type ReelPresentation = RenderReelSet | RenderGridCellReelSet;

interface PreparedModeTarget {
  readonly reel: ReelPresentation;
  readonly catalog: SymbolCatalogModel;
}

interface ActiveModeTransition {
  readonly spec: SceneLayoutGameModeTransition;
  readonly source: SceneLayoutGameMode;
  readonly target: SceneLayoutGameMode;
  readonly player: RendercoreSpinePlayer;
  readonly prepared: PreparedModeTarget | null;
  readonly bindingChanged: boolean;
  switched: boolean;
  switchEventCount: number;
  readonly resolve: () => void;
  readonly reject: (error: SceneLayoutError) => void;
}

export function createSceneLayoutPackageRuntime(options: {
  readonly resource: SceneLayoutPackageResource;
  readonly createTransitionPlayer?: (options: {
    readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
  }) => RendercoreSpinePlayer;
}): SceneLayoutPackageRuntime {
  return new DefaultSceneLayoutPackageRuntime(
    options.resource,
    options.createTransitionPlayer,
  );
}

class DefaultSceneLayoutPackageRuntime implements SceneLayoutPackageRuntime {
  readonly container: Container;
  readonly #resource: SceneLayoutPackageResource;
  readonly #layout;
  readonly #createTransitionPlayer: (options: {
    readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
  }) => RendercoreSpinePlayer;
  readonly #transitionRoot = new Container();
  #reel: ReelPresentation | null = null;
  #catalog: SymbolCatalogModel | null = null;
  #activeSymbolPackageId: string | null = null;
  #stableSymbolPackageId: string | null = null;
  #targetSymbolPackageId: string | null = null;
  #activeBackgroundNodes: readonly string[] = Object.freeze([]);
  readonly #popups = new Map<string, AwardCelebrationPlayer>();
  #initialized = false;
  #initializing = false;
  #destroyed = false;
  #stableMode: string | null = null;
  #displayedMode: string | null = null;
  #targetMode: string | null = null;
  #modeRequestInProgress = false;
  #activeTransition: ActiveModeTransition | null = null;
  #activePopupId: string | null = null;

  constructor(
    resource: SceneLayoutPackageResource,
    createTransitionPlayer:
      | ((options: {
          readonly resource: SceneLayoutPackageResource["layout"]["spineResources"][string];
        }) => RendercoreSpinePlayer)
      | undefined,
  ) {
    this.#resource = resource;
    this.#layout = createSceneLayoutRuntime({ resource: resource.layout });
    this.#createTransitionPlayer =
      createTransitionPlayer ??
      ((options) =>
        createOfficialSpinePlayer({
          resource: options.resource,
          createError: (message) => new SceneLayoutError(message),
        }));
    this.container = this.#layout.container;
    this.#transitionRoot.label = "scene-transition-overlay";
    this.container.addChild(this.#transitionRoot);
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
        this.#stableSymbolPackageId = activeBinding.id;
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
        this.container.addChildAt(
          popup.container,
          this.container.getChildIndex(this.#transitionRoot),
        );
      }
      this.#stableMode = initialModeId;
      this.#displayedMode = initialModeId;
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
    const activeTransition = this.#activeTransition;
    if (activeTransition) {
      const placement =
        activeTransition.spec.overlay.placements[snapshot.variantId];
      if (!placement)
        throw new SceneLayoutError(
          `Scene transition ${activeTransition.spec.from} -> ${activeTransition.spec.to} has no ${snapshot.variantId} placement.`,
        );
      activeTransition.player.view.position.set(placement.x, placement.y);
      activeTransition.player.view.scale.set(placement.scale);
    }
    return snapshot;
  }

  update(deltaSeconds: number): void {
    this.assertReady();
    this.#layout.update(deltaSeconds);
    this.#reel?.update(deltaSeconds);
    for (const popup of this.#popups.values())
      if (popup.isPlaying()) popup.update(deltaSeconds);
    this.updateActiveTransition(deltaSeconds);
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
      displayedMode: this.#displayedMode!,
      targetMode: this.#targetMode,
      phase: this.#targetMode ? "transitioning" : "stable",
      transitionPhase: this.#activeTransition
        ? this.#activeTransition.switched
          ? "after-switch"
          : "before-switch"
        : null,
      transition: this.#activeTransition
        ? Object.freeze({
            from: this.#activeTransition.spec.from,
            to: this.#activeTransition.spec.to,
          })
        : null,
      stableSymbolPackage: this.#stableSymbolPackageId,
      displayedSymbolPackage: this.#activeSymbolPackageId,
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
    if (this.#modeRequestInProgress || this.#targetMode)
      throw new SceneLayoutError(
        `A scene layout game mode transition is already in progress${this.#targetMode ? ` to "${this.#targetMode}"` : " during target preparation"}.`,
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
    const transition = (modes.transitions ?? []).find(
      (candidate) => candidate.from === source.id && candidate.to === mode.id,
    );
    if (!transition)
      throw new SceneLayoutError(
        `No direct scene transition exists from "${source.id}" to "${mode.id}".`,
      );
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
    this.#modeRequestInProgress = true;
    try {
      let prepared: PreparedModeTarget | null = null;
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
      const playerResource =
        this.#resource.layout.spineResources[
          transitionResourceKey(transition.from, transition.to)
        ];
      if (!playerResource) {
        prepared?.reel.destroy({ children: true });
        throw new SceneLayoutError(
          `Scene transition resource ${transition.from} -> ${transition.to} is unavailable.`,
        );
      }
      const player = this.#createTransitionPlayer({ resource: playerResource });
      try {
        await player.init();
        this.assertReady();
        player.play({
          animationName: transition.overlay.animation,
          loop: false,
        });
      } catch (error) {
        player.destroy();
        prepared?.reel.destroy({ children: true });
        throw asSceneLayoutError(error);
      }
      this.#targetMode = mode.id;
      this.#targetSymbolPackageId = targetBinding?.id ?? null;
      this.#transitionRoot.addChild(player.view);
      const snapshot = this.#layout.getSnapshot();
      const placement = transition.overlay.placements[snapshot.variantId]!;
      player.view.position.set(placement.x, placement.y);
      player.view.scale.set(placement.scale);
      return await new Promise<void>((resolve, reject) => {
        this.#activeTransition = {
          spec: transition,
          source,
          target: mode,
          player,
          prepared,
          bindingChanged,
          switched: false,
          switchEventCount: 0,
          resolve,
          reject,
        };
      });
    } finally {
      this.#modeRequestInProgress = false;
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
    if (this.#activeTransition) {
      const active = this.#activeTransition;
      this.#activeTransition = null;
      active.player.destroy();
      if (!active.switched) active.prepared?.reel.destroy({ children: true });
      active.reject(
        new SceneLayoutError(
          "Scene layout package runtime was destroyed during a game mode transition.",
        ),
      );
    }
    this.#reel?.destroy({ children: true });
    this.#reel = null;
    this.#catalog = null;
    for (const popup of this.#popups.values()) popup.destroy();
    this.#popups.clear();
    this.#layout.destroy();
    this.#resource.destroy();
    this.#initialized = false;
    this.#stableMode = null;
    this.#displayedMode = null;
    this.#targetMode = null;
    this.#modeRequestInProgress = false;
    this.#activePopupId = null;
    this.#activeSymbolPackageId = null;
    this.#stableSymbolPackageId = null;
    this.#targetSymbolPackageId = null;
    this.#activeBackgroundNodes = Object.freeze([]);
  }

  private updateActiveTransition(deltaSeconds: number): void {
    const active = this.#activeTransition;
    if (!active) return;
    let result;
    try {
      result = active.player.update(deltaSeconds);
      for (const event of result.events) {
        if (event.name !== active.spec.overlay.switchEvent) continue;
        active.switchEventCount += 1;
        if (active.switchEventCount !== 1)
          throw new SceneLayoutError(
            `Scene transition ${active.spec.from} -> ${active.spec.to} emitted switch event "${event.name}" more than once.`,
          );
        this.commitActiveTransition(active);
      }
      if (!result.completed) return;
      if (!active.switched)
        throw new SceneLayoutError(
          `Scene transition ${active.spec.from} -> ${active.spec.to} completed without switch event "${active.spec.overlay.switchEvent}".`,
        );
      this.completeActiveTransition(active);
    } catch (error) {
      this.failActiveTransition(active, asSceneLayoutError(error));
    }
  }

  private commitActiveTransition(active: ActiveModeTransition): void {
    if (active.switched) return;
    this.commitBackgroundVisibility(active.target);
    if (active.bindingChanged) {
      const previous = this.#reel;
      if (active.prepared) {
        this.attachReel(active.prepared.reel);
        this.#reel = active.prepared.reel;
        this.#catalog = active.prepared.catalog;
      } else {
        this.#reel = null;
        this.#catalog = null;
      }
      this.#activeSymbolPackageId = this.#targetSymbolPackageId;
      if (previous) {
        previous.parent?.removeChild(previous);
        previous.destroy({ children: true });
      }
    }
    this.#displayedMode = active.target.id;
    active.switched = true;
  }

  private completeActiveTransition(active: ActiveModeTransition): void {
    if (this.#activeTransition !== active) return;
    active.player.destroy();
    this.#stableMode = active.target.id;
    this.#displayedMode = active.target.id;
    this.#stableSymbolPackageId = this.#activeSymbolPackageId;
    this.#targetMode = null;
    this.#targetSymbolPackageId = null;
    this.#activeTransition = null;
    active.resolve();
  }

  private failActiveTransition(
    active: ActiveModeTransition,
    error: SceneLayoutError,
  ): void {
    if (this.#activeTransition !== active) return;
    active.player.destroy();
    if (!active.switched) active.prepared?.reel.destroy({ children: true });
    else {
      this.#stableMode = active.target.id;
      this.#stableSymbolPackageId = this.#activeSymbolPackageId;
    }
    this.#targetMode = null;
    this.#targetSymbolPackageId = null;
    this.#activeTransition = null;
    active.reject(error);
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
