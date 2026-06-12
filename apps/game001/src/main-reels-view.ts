import { Container, Graphics } from "pixi.js";
import type { LogicReels, SceneMatrix } from "@slotclientengine/logiccore";
import {
  RenderReel,
  type ReelLayout,
  type ReelSpinPlan,
  type ReelSymbolRegistry,
} from "@slotclientengine/rendercore/reel";
import type { RenderSymbol } from "@slotclientengine/rendercore";
import {
  GAME001_LOCKED_AXIS_INDEX,
  GAME001_LOCKED_CENTER_Y,
  type MainReelsLayerLayout,
} from "./game-layout.js";
import {
  getGame001LockedCenterCode,
  sceneEquals,
  validateGame001Scene,
} from "./scene.js";

const NORMAL_AXIS_INDEXES = Object.freeze([0, 1, 2, 4]);

export interface Game001MainReelsViewOptions {
  readonly reels: LogicReels;
  readonly layout: ReelLayout;
  readonly registry: ReelSymbolRegistry;
  readonly layerLayout: MainReelsLayerLayout;
}

export interface Game001MainReelsViewUpdateResult {
  readonly completed: boolean;
  readonly spinning: boolean;
  readonly startedAxes: readonly number[];
  readonly stoppedAxes: readonly number[];
}

export interface Game001MainReelsVisualSnapshot {
  readonly visible: boolean;
  readonly spinning: boolean;
  readonly normalAxisIndexes: readonly number[];
  readonly startedNormalAxes: readonly number[];
  readonly stoppedNormalAxes: readonly number[];
  readonly normalVisibleScene: readonly (readonly number[])[];
  readonly normalRequestedStates: readonly (readonly (string | null)[])[];
  readonly lockedAxis: {
    readonly xIndex: typeof GAME001_LOCKED_AXIS_INDEX;
    readonly sceneY: typeof GAME001_LOCKED_CENTER_Y;
    readonly code: number | null;
    readonly symbol: string | null;
    readonly x: number;
    readonly y: number;
    readonly rotation: number;
    readonly requestedState: string | null;
    readonly visibleSymbolCount: number;
  };
}

export interface Game001MainReelsView {
  readonly root: Container;
  readonly normalAxisIndexes: readonly number[];
  readonly lockedAxisIndex: typeof GAME001_LOCKED_AXIS_INDEX;
  readonly lockedCenterY: typeof GAME001_LOCKED_CENTER_Y;
  applyScene(scene: SceneMatrix, finalYs: readonly number[]): void;
  spinToScene(
    scene: SceneMatrix,
    finalYs: readonly number[],
    plan: ReelSpinPlan,
  ): void;
  update(deltaSeconds: number): Game001MainReelsViewUpdateResult;
  getCurrentScene(): SceneMatrix | null;
  getTargetScene(): SceneMatrix | null;
  getVisualSnapshot(): Game001MainReelsVisualSnapshot;
  isSpinning(): boolean;
}

export function createGame001MainReelsView(
  options: Game001MainReelsViewOptions,
): Game001MainReelsView {
  return new Game001MainReelsViewModel(options);
}

export function assertGame001MainReelsVisualMatchesTarget(
  snapshot: Game001MainReelsVisualSnapshot,
  targetScene: SceneMatrix,
  label: string,
): void {
  const validTargetScene = validateGame001Scene(targetScene, label);

  for (const [normalIndex, x] of snapshot.normalAxisIndexes.entries()) {
    const actualColumn = snapshot.normalVisibleScene[normalIndex];
    const expectedColumn = validTargetScene[x];
    if (!actualColumn || !sceneEquals([actualColumn], [expectedColumn])) {
      throw new Error(`${label} normal axis ${x} does not match target scene.`);
    }
  }

  const expectedLockedCode = getGame001LockedCenterCode(validTargetScene, label);
  if (snapshot.lockedAxis.code !== expectedLockedCode) {
    throw new Error(`${label} locked axis center symbol does not match target.`);
  }
  if (snapshot.lockedAxis.visibleSymbolCount !== 1) {
    throw new Error(`${label} locked axis must show exactly one symbol.`);
  }
}

class Game001MainReelsViewModel implements Game001MainReelsView {
  readonly root = new Container();
  readonly normalAxisIndexes = NORMAL_AXIS_INDEXES;
  readonly lockedAxisIndex = GAME001_LOCKED_AXIS_INDEX;
  readonly lockedCenterY = GAME001_LOCKED_CENTER_Y;
  readonly #layout: ReelLayout;
  readonly #layerLayout: MainReelsLayerLayout;
  readonly #registry: ReelSymbolRegistry;
  readonly #normalReels: ReadonlyMap<number, RenderReel>;
  readonly #lockedAxisLayer = new Container();
  #lockedSymbol: RenderSymbol | null = null;
  #lockedCode: number | null = null;
  #spinPlan: ReelSpinPlan | null = null;
  #elapsedMs = 0;
  #startedAxes = new Set<number>();
  #currentScene: SceneMatrix | null = null;
  #targetScene: SceneMatrix | null = null;

  constructor(options: Game001MainReelsViewOptions) {
    this.#layout = options.layout;
    this.#layerLayout = options.layerLayout;
    this.#registry = options.registry;
    const reelsLayer = new Container();
    const maskLayer = this.createNormalAxisMask();
    const normalReels = new Map<number, RenderReel>();

    for (const x of this.normalAxisIndexes) {
      const reel = new RenderReel({
        reels: options.reels,
        x,
        layout: options.layout,
        registry: options.registry,
      });
      normalReels.set(x, reel);
      reelsLayer.addChild(reel);
    }

    reelsLayer.mask = maskLayer;
    this.#normalReels = normalReels;
    this.root.addChild(reelsLayer, maskLayer, this.#lockedAxisLayer);
    this.root.x = options.layerLayout.x;
    this.root.y = options.layerLayout.y;
    this.root.scale.set(options.layerLayout.mainReelsFitScale);
    this.root.visible = false;
  }

  applyScene(scene: SceneMatrix, finalYs: readonly number[]): void {
    const validScene = validateGame001Scene(scene, "game001 main reels scene");
    this.assertFinalYs(finalYs);
    this.#spinPlan = null;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
    for (const x of this.normalAxisIndexes) {
      this.requireNormalReel(x).resetToY(finalYs[x]);
    }
    this.syncLockedSymbol(validScene, "game001 main reels scene");
    this.#currentScene = validScene;
    this.#targetScene = null;
    this.root.visible = true;
    assertGame001MainReelsVisualMatchesTarget(
      this.getVisualSnapshot(),
      validScene,
      "game001 main reels scene",
    );
  }

  spinToScene(
    scene: SceneMatrix,
    finalYs: readonly number[],
    plan: ReelSpinPlan,
  ): void {
    if (this.#spinPlan) {
      throw new Error("game001 main reels are already spinning.");
    }
    const validScene = validateGame001Scene(scene, "game001 main reels target");
    this.assertFinalYs(finalYs);
    this.assertSpinPlan(plan);
    this.#targetScene = validScene;
    this.#spinPlan = plan;
    this.#elapsedMs = 0;
    this.#startedAxes = new Set();
    this.startDueAxes();
    this.root.visible = this.#currentScene !== null;
  }

  update(deltaSeconds: number): Game001MainReelsViewUpdateResult {
    this.assertDeltaSeconds(deltaSeconds);

    const previousElapsedMs = this.#elapsedMs;
    if (this.#spinPlan) {
      this.#elapsedMs = Math.min(
        this.#elapsedMs + deltaSeconds * 1000,
        this.#spinPlan.totalDurationMs,
      );
      this.startDueAxes();
    }

    for (const x of this.normalAxisIndexes) {
      const reel = this.requireNormalReel(x);
      const axisPlan = this.#spinPlan?.axes[x];
      let reelDeltaSeconds = deltaSeconds;
      if (axisPlan && this.#startedAxes.has(x)) {
        const activeStart = Math.max(previousElapsedMs, axisPlan.startDelayMs);
        const activeEnd = Math.min(this.#elapsedMs, axisPlan.stopAtMs);
        reelDeltaSeconds = Math.max(0, activeEnd - activeStart) / 1000;
      }
      reel.update(reelDeltaSeconds);
    }
    this.#lockedSymbol?.update(deltaSeconds);

    const completed = Boolean(
      this.#spinPlan &&
        this.normalAxisIndexes.every((x) => this.#startedAxes.has(x)) &&
        this.normalAxisIndexes.every(
          (x) => this.requireNormalReel(x).getSnapshot().phase === "stopped",
        ),
    );

    if (completed && this.#targetScene) {
      this.syncLockedSymbol(this.#targetScene, "game001 main reels target");
      assertGame001MainReelsVisualMatchesTarget(
        this.getVisualSnapshot(),
        this.#targetScene,
        "completed game001 main reels",
      );
      this.#currentScene = this.#targetScene;
      this.#targetScene = null;
      this.#spinPlan = null;
      this.root.visible = true;
    }

    return Object.freeze({
      completed,
      spinning: this.#spinPlan !== null,
      startedAxes: Object.freeze([...this.#startedAxes].sort(compareNumber)),
      stoppedAxes: this.getStoppedNormalAxes(),
    });
  }

  getCurrentScene(): SceneMatrix | null {
    return this.#currentScene;
  }

  getTargetScene(): SceneMatrix | null {
    return this.#targetScene;
  }

  getVisualSnapshot(): Game001MainReelsVisualSnapshot {
    const lockedState = this.#lockedSymbol?.getStateSnapshot() ?? null;
    return Object.freeze({
      visible: this.root.visible,
      spinning: this.#spinPlan !== null,
      normalAxisIndexes: this.normalAxisIndexes,
      startedNormalAxes: Object.freeze([...this.#startedAxes].sort(compareNumber)),
      stoppedNormalAxes: this.getStoppedNormalAxes(),
      normalVisibleScene: Object.freeze(
        this.normalAxisIndexes.map((x) =>
          Object.freeze([...this.requireNormalReel(x).getVisibleScene()]),
        ),
      ),
      normalRequestedStates: Object.freeze(
        this.normalAxisIndexes.map((x) =>
          Object.freeze(
            this.requireNormalReel(x)
              .getSlotSnapshots()
              .filter((slot) => slot.container.visible)
              .map((slot) => slot.requestedState),
          ),
        ),
      ),
      lockedAxis: Object.freeze({
        xIndex: this.lockedAxisIndex,
        sceneY: this.lockedCenterY,
        code: this.#lockedCode,
        symbol: this.#lockedSymbol?.symbol ?? null,
        x: this.#lockedSymbol?.x ?? this.getLockedLocalCenterX(),
        y: this.#lockedSymbol?.y ?? this.getLockedLocalCenterY(),
        rotation: this.#lockedSymbol?.rotation ?? 0,
        requestedState: lockedState?.requestedState ?? null,
        visibleSymbolCount: this.#lockedAxisLayer.children.length,
      }),
    });
  }

  isSpinning(): boolean {
    return this.#spinPlan !== null;
  }

  private createNormalAxisMask(): Graphics {
    const mask = new Graphics();
    for (const x of this.normalAxisIndexes) {
      mask.rect(
        this.#layout.getReelX(x),
        this.#layerLayout.cropY,
        this.#layout.cellWidth,
        this.#layerLayout.cropHeight,
      );
    }
    mask.fill({ color: 0xffffff, alpha: 1 });
    return mask;
  }

  private syncLockedSymbol(scene: SceneMatrix, label: string): void {
    const code = getGame001LockedCenterCode(scene, label);
    const entry = this.#registry.getEntryByCode(code);
    if (entry.kind === "empty") {
      throw new Error(
        `${label} locked axis center symbol code ${code} maps to empty symbol "${entry.symbol}".`,
      );
    }
    if (this.#lockedSymbol && this.#lockedCode === code) {
      this.#lockedSymbol.requestState("normal");
      this.#lockedCode = code;
      return;
    }

    const symbol = this.#registry.createRenderSymbolByCode(code);
    if (!symbol) {
      throw new Error(
        `${label} locked axis center symbol code ${code} must render a visible symbol.`,
      );
    }

    this.#lockedAxisLayer.removeChildren();
    symbol.x = this.getLockedLocalCenterX();
    symbol.y = this.getLockedLocalCenterY();
    symbol.rotation = 0;
    this.#lockedAxisLayer.addChild(symbol);
    symbol.init();
    symbol.requestState("normal");
    this.#lockedSymbol = symbol;
    this.#lockedCode = code;
  }

  private startDueAxes(): void {
    const plan = this.#spinPlan;
    if (!plan) {
      return;
    }

    for (const x of this.normalAxisIndexes) {
      const axis = plan.axes[x];
      if (this.#startedAxes.has(x) || this.#elapsedMs < axis.startDelayMs) {
        continue;
      }
      const reel = this.requireNormalReel(x);
      this.resetNormalReelSymbolsBeforeSpin(reel);
      reel.start(axis);
      this.#startedAxes.add(x);
    }
  }

  private resetNormalReelSymbolsBeforeSpin(reel: RenderReel): void {
    for (const slot of reel.getSlotSnapshots()) {
      slot.symbol?.reset();
    }
  }

  private getStoppedNormalAxes(): readonly number[] {
    return Object.freeze(
      this.normalAxisIndexes.filter(
        (x) => this.requireNormalReel(x).getSnapshot().phase === "stopped",
      ),
    );
  }

  private requireNormalReel(x: number): RenderReel {
    const reel = this.#normalReels.get(x);
    if (!reel) {
      throw new Error(`Missing game001 normal reel for x=${x}.`);
    }
    return reel;
  }

  private assertFinalYs(finalYs: readonly number[]): void {
    if (!Array.isArray(finalYs) || finalYs.length !== this.#layout.reelCount) {
      throw new Error(
        `finalYs length must be ${this.#layout.reelCount} for game001 main reels.`,
      );
    }
    for (const [x, finalY] of finalYs.entries()) {
      if (!Number.isInteger(finalY)) {
        throw new Error(`finalYs[${x}] must be an integer.`);
      }
    }
  }

  private assertSpinPlan(plan: ReelSpinPlan): void {
    if (plan.axes.length !== this.#layout.reelCount) {
      throw new Error(
        `spin plan axes length must be ${this.#layout.reelCount} for game001 main reels.`,
      );
    }
    for (const [x, axis] of plan.axes.entries()) {
      if (axis.x !== x) {
        throw new Error(`spin plan axis ${x} must have x=${x}.`);
      }
    }
  }

  private assertDeltaSeconds(deltaSeconds: number): void {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new Error("deltaSeconds must be a non-negative finite number.");
    }
  }

  private getLockedLocalCenterX(): number {
    return (
      this.#layout.getReelX(GAME001_LOCKED_AXIS_INDEX) +
      this.#layout.cellWidth / 2
    );
  }

  private getLockedLocalCenterY(): number {
    return 1.5 * this.#layout.cellHeight + this.#layout.cellHeight;
  }
}

function compareNumber(left: number, right: number): number {
  return left - right;
}
