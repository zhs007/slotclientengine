import { Container } from "pixi.js";
import {
  createStandaloneSymbolCatalog,
  type RenderSymbol,
  type SymbolAssetMap,
} from "@slotclientengine/rendercore";
import {
  getGame003BgBarSlotCenter,
  type Game003BgBarLayout,
} from "./bg-bar-layout.js";
import type {
  Game003BgBarFeature,
  Game003BgBarSpinPlan,
} from "./bg-bar-sequence.js";
import type { Game003BgBarSkinConfig } from "./skin-config.js";

export const GAME003_BG_BAR_SHIFT_DURATION_SECONDS = 0.28;
export const GAME003_BG_BAR_TERMINAL_WIN_DURATION_SECONDS = 0.2;

export interface Game003BgBarRuntimeOptions {
  readonly config: Game003BgBarSkinConfig;
  readonly symbolAssets: SymbolAssetMap;
}

export interface Game003BgBarRuntimeSnapshot {
  readonly phase: "idle" | "shifting" | "terminal-win" | "destroyed";
  readonly idleQueue: readonly Game003BgBarFeature[] | null;
  readonly items: readonly {
    readonly feature: Game003BgBarFeature;
    readonly slotIndex: number | null;
    readonly visible: boolean;
    readonly requestedState: string;
  }[];
}

export interface Game003BgBarRuntimeUpdateResult {
  readonly completed: boolean;
  readonly terminalFeatureCompleted?: Game003BgBarFeature;
}

interface RuntimeItem {
  readonly feature: Game003BgBarFeature;
  readonly symbol: RenderSymbol;
  startSlotIndex: number | null;
  targetSlotIndex: number;
}

export interface Game003BgBarRuntime {
  readonly container: Container;
  applyLayout(layout: Game003BgBarLayout): void;
  reset(): void;
  startSpin(plan: Game003BgBarSpinPlan): void;
  update(deltaSeconds: number): Game003BgBarRuntimeUpdateResult;
  isPlaying(): boolean;
  getSnapshot(): Game003BgBarRuntimeSnapshot;
  destroy(): void;
}

export function createGame003BgBarRuntime(
  options: Game003BgBarRuntimeOptions,
): Game003BgBarRuntime {
  return new Game003BgBarRuntimeModel(options);
}

class Game003BgBarRuntimeModel implements Game003BgBarRuntime {
  readonly container = new Container();
  readonly #config: Game003BgBarSkinConfig;
  readonly #catalog: ReturnType<typeof createStandaloneSymbolCatalog>;
  #layout: Game003BgBarLayout | null = null;
  #phase: Game003BgBarRuntimeSnapshot["phase"] = "idle";
  #idleQueue: readonly Game003BgBarFeature[] | null = null;
  #items: RuntimeItem[] = [];
  #shiftElapsedSeconds = 0;
  #destroyed = false;

  constructor(options: Game003BgBarRuntimeOptions) {
    this.#config = options.config;
    this.#catalog = createStandaloneSymbolCatalog({
      assets: options.symbolAssets,
      displaySymbols: this.#config.displaySymbols,
      symbolScales: this.#config.symbolScales,
      symbolRenderPriorities: this.#config.symbolRenderPriorities,
      animationResolver: this.#config.symbolAnimationResolver,
      texturePolicy: {
        requiredStateTextures: [],
      },
    });
    const validation = this.#catalog.getValidation();
    if (validation.ignoredAssetsWithoutPaytable.length > 0) {
      throw new Error(
        `game003 bg-bar has unused symbol assets: ${validation.ignoredAssetsWithoutPaytable.join(", ")}`,
      );
    }
  }

  applyLayout(layout: Game003BgBarLayout): void {
    this.assertNotDestroyed();
    this.#layout = layout;
    this.container.position.set(layout.conveyorFrame.x, layout.conveyorFrame.y);
    this.syncItemPositions();
  }

  reset(): void {
    this.assertNotDestroyed();
    this.clearItems();
    this.#phase = "idle";
    this.#idleQueue = null;
    this.#shiftElapsedSeconds = 0;
  }

  startSpin(plan: Game003BgBarSpinPlan): void {
    this.assertNotDestroyed();
    if (!this.#layout) {
      throw new Error("game003 bg-bar layout must be applied before spin.");
    }
    if (this.isPlaying()) {
      throw new Error("game003 bg-bar animation is already in progress.");
    }
    this.clearItems();
    this.#items = createSpinItems(this.#catalog, plan.features);
    this.container.addChild(...this.#items.map((item) => item.symbol));
    this.#phase = "shifting";
    this.#shiftElapsedSeconds = 0;
    this.syncItemPositions();
  }

  update(deltaSeconds: number): Game003BgBarRuntimeUpdateResult {
    this.assertNotDestroyed();
    assertDeltaSeconds(deltaSeconds);
    if (this.#phase === "idle") {
      for (const item of this.#items) {
        item.symbol.update(deltaSeconds);
      }
      return Object.freeze({ completed: true });
    }
    if (this.#phase === "shifting") {
      this.#shiftElapsedSeconds = Math.min(
        this.#shiftElapsedSeconds + deltaSeconds,
        GAME003_BG_BAR_SHIFT_DURATION_SECONDS,
      );
      this.syncItemPositions();
      for (const item of this.#items) {
        item.symbol.update(deltaSeconds);
      }
      if (this.#shiftElapsedSeconds < GAME003_BG_BAR_SHIFT_DURATION_SECONDS) {
        return Object.freeze({ completed: false });
      }
      const terminal = this.#items.find(
        (item) => item.targetSlotIndex === this.#config.terminalSlotIndex,
      );
      if (!terminal) {
        throw new Error("game003 bg-bar terminal symbol is missing.");
      }
      terminal.symbol.requestState("win");
      this.#phase = "terminal-win";
      return Object.freeze({ completed: false });
    }

    const terminal = this.#items.find(
      (item) => item.targetSlotIndex === this.#config.terminalSlotIndex,
    );
    if (!terminal) {
      throw new Error("game003 bg-bar terminal symbol is missing.");
    }
    const result = terminal.symbol.update(deltaSeconds);
    for (const item of this.#items) {
      if (item !== terminal) {
        item.symbol.update(deltaSeconds);
      }
    }
    if (!result.onceCompleted) {
      return Object.freeze({ completed: false });
    }
    const terminalFeature = terminal.feature;
    terminal.symbol.visible = false;
    this.settleItems(terminal);
    return Object.freeze({
      completed: true,
      terminalFeatureCompleted: terminalFeature,
    });
  }

  isPlaying(): boolean {
    return this.#phase === "shifting" || this.#phase === "terminal-win";
  }

  getSnapshot(): Game003BgBarRuntimeSnapshot {
    return Object.freeze({
      phase: this.#phase,
      idleQueue:
        this.#idleQueue === null ? null : Object.freeze([...this.#idleQueue]),
      items: Object.freeze(
        this.#items.map((item) => {
          const snapshot = item.symbol.getStateSnapshot();
          return Object.freeze({
            feature: item.feature,
            slotIndex: this.#phase === "shifting" ? null : item.targetSlotIndex,
            visible: item.symbol.visible,
            requestedState: snapshot.requestedState,
          });
        }),
      ),
    });
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.clearItems();
    this.container.destroy({ children: true });
    this.#phase = "destroyed";
    this.#destroyed = true;
  }

  private syncItemPositions(): void {
    if (!this.#layout) {
      return;
    }
    if (this.#phase === "shifting") {
      const progress =
        this.#shiftElapsedSeconds / GAME003_BG_BAR_SHIFT_DURATION_SECONDS;
      for (const item of this.#items) {
        const start = this.getItemStartCenter(item);
        const target = getGame003BgBarSlotCenter(
          this.#layout,
          item.targetSlotIndex,
        );
        item.symbol.position.set(
          start.x + (target.x - start.x) * progress,
          start.y + (target.y - start.y) * progress,
        );
        item.symbol.visible = true;
      }
      return;
    }
    for (const item of this.#items) {
      const center = getGame003BgBarSlotCenter(
        this.#layout,
        item.targetSlotIndex,
      );
      item.symbol.position.set(center.x, center.y);
    }
  }

  private getItemStartCenter(item: RuntimeItem): {
    readonly x: number;
    readonly y: number;
  } {
    if (!this.#layout) {
      throw new Error("game003 bg-bar layout is missing.");
    }
    if (item.startSlotIndex !== null) {
      return getGame003BgBarSlotCenter(this.#layout, item.startSlotIndex);
    }
    const slot0 = getGame003BgBarSlotCenter(this.#layout, 0);
    const slot1 = getGame003BgBarSlotCenter(this.#layout, 1);
    return Object.freeze({
      x: slot0.x - (slot1.x - slot0.x),
      y: slot0.y - (slot1.y - slot0.y),
    });
  }

  private settleItems(terminal: RuntimeItem): void {
    const survivors = this.#items.filter((item) => item !== terminal);
    terminal.symbol.destroy({ children: true });
    this.#items = survivors.map((item) => {
      item.startSlotIndex = item.targetSlotIndex;
      return item;
    });
    this.#idleQueue = Object.freeze(survivors.map((item) => item.feature));
    this.#phase = "idle";
    this.#shiftElapsedSeconds = 0;
    this.syncItemPositions();
  }

  private clearItems(): void {
    for (const item of this.#items) {
      item.symbol.destroy({ children: true });
    }
    this.#items = [];
    this.container.removeChildren();
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error("game003 bg-bar runtime was destroyed.");
    }
  }
}

function createSpinItems(
  catalog: ReturnType<typeof createStandaloneSymbolCatalog>,
  features: Game003BgBarSpinPlan["features"],
): RuntimeItem[] {
  const mappings = [
    { featureIndex: 0, startSlotIndex: 3, targetSlotIndex: 4 },
    { featureIndex: 1, startSlotIndex: 2, targetSlotIndex: 3 },
    { featureIndex: 2, startSlotIndex: 1, targetSlotIndex: 2 },
    { featureIndex: 3, startSlotIndex: 0, targetSlotIndex: 1 },
    { featureIndex: 4, startSlotIndex: null, targetSlotIndex: 0 },
  ] as const;
  return mappings.map((mapping) => {
    const feature = features[mapping.featureIndex];
    const symbol = catalog.createRenderSymbol(feature);
    symbol.visible = true;
    symbol.requestState(mapping.featureIndex === 4 ? "appear" : "normal");
    return {
      feature,
      symbol,
      startSlotIndex: mapping.startSlotIndex,
      targetSlotIndex: mapping.targetSlotIndex,
    };
  });
}

function assertDeltaSeconds(deltaSeconds: number): void {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
    throw new Error(
      "game003 bg-bar deltaSeconds must be a finite non-negative number.",
    );
  }
}
