import {
  parseWinResultPositions,
  type GameLogic,
  type SceneMatrix,
  type SlotRoundFlowProfileV1,
} from "@slotclientengine/logiccore";
import { Application } from "pixi.js";
import { SceneLayoutError } from "./errors.js";
import { createSceneLayoutPackageRuntime } from "./package-runtime.js";
import type {
  SceneLayoutPackageResource,
  SceneLayoutPackageRuntime,
} from "./types.js";
import type { SlotTemplatePresentationProfileV1 } from "./template-presentation.js";

export interface ConfiguredSceneLayoutAdapterMountContext {
  readonly gameLayer: HTMLElement;
  getViewport(): {
    readonly frameDesignSize: {
      readonly width: number;
      readonly height: number;
    };
  };
  onViewportChange(
    listener: (viewport: {
      readonly frameDesignSize: {
        readonly width: number;
        readonly height: number;
      };
    }) => void,
  ): () => void;
}

export interface ConfiguredSceneLayoutRoundAdapter {
  mount(context: ConfiguredSceneLayoutAdapterMountContext): Promise<void>;
  applyInitialState(state: {
    readonly defaultScene?: SceneMatrix;
  }): Promise<void>;
  playSpin(logic: GameLogic): Promise<void>;
  destroy(): void;
}

interface PendingRound {
  phase: "spin" | "win";
  readonly winGroups: readonly {
    readonly positions: readonly { readonly x: number; readonly y: number }[];
  }[];
  winIndex: number;
  readonly finalScenes: readonly SceneMatrix[];
  resolve(): void;
  reject(error: Error): void;
}

export function createConfiguredSceneLayoutRoundAdapter(options: {
  readonly packageResource: SceneLayoutPackageResource;
  readonly roundFlow: SlotRoundFlowProfileV1;
  readonly presentation: SlotTemplatePresentationProfileV1;
  readonly random?: () => number;
  /** @internal Deterministic construction seam for non-browser acceptance tests. */
  readonly applicationFactory?: () => Application;
  /** @internal Deterministic construction seam for non-browser acceptance tests. */
  readonly runtimeFactory?: (
    options: Parameters<typeof createSceneLayoutPackageRuntime>[0],
  ) => SceneLayoutPackageRuntime;
}): ConfiguredSceneLayoutRoundAdapter {
  return new DefaultConfiguredSceneLayoutRoundAdapter(options);
}

class DefaultConfiguredSceneLayoutRoundAdapter implements ConfiguredSceneLayoutRoundAdapter {
  readonly #resource: SceneLayoutPackageResource;
  readonly #roundFlow: SlotRoundFlowProfileV1;
  readonly #presentation: SlotTemplatePresentationProfileV1;
  readonly #random: () => number;
  readonly #applicationFactory: () => Application;
  readonly #runtimeFactory: (
    options: Parameters<typeof createSceneLayoutPackageRuntime>[0],
  ) => SceneLayoutPackageRuntime;
  #app: Application | null = null;
  #runtime: SceneLayoutPackageRuntime | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #pending: PendingRound | null = null;
  #destroyed = false;
  #resourceOwned = true;

  constructor(options: {
    readonly packageResource: SceneLayoutPackageResource;
    readonly roundFlow: SlotRoundFlowProfileV1;
    readonly presentation: SlotTemplatePresentationProfileV1;
    readonly random?: () => number;
    readonly applicationFactory?: () => Application;
    readonly runtimeFactory?: (
      options: Parameters<typeof createSceneLayoutPackageRuntime>[0],
    ) => SceneLayoutPackageRuntime;
  }) {
    this.#resource = options.packageResource;
    this.#roundFlow = options.roundFlow;
    this.#presentation = options.presentation;
    this.#random = options.random ?? secureRandom;
    this.#applicationFactory =
      options.applicationFactory ?? (() => new Application());
    this.#runtimeFactory =
      options.runtimeFactory ?? createSceneLayoutPackageRuntime;
  }

  async mount(
    context: ConfiguredSceneLayoutAdapterMountContext,
  ): Promise<void> {
    this.assertAlive();
    if (this.#app)
      throw new SceneLayoutError(
        "Configured scene-layout adapter is already mounted.",
      );
    const viewport = context.getViewport().frameDesignSize;
    const app = this.#applicationFactory();
    await app.init({
      width: viewport.width,
      height: viewport.height,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    this.assertAlive();
    context.gameLayer.replaceChildren(app.canvas);
    app.ticker.add(this.#onTick);
    this.#app = app;
    this.#unsubscribeViewport = context.onViewportChange((next) => {
      this.applyViewport(next.frameDesignSize);
    });
  }

  async applyInitialState(state: {
    readonly defaultScene?: SceneMatrix;
  }): Promise<void> {
    this.assertAlive();
    if (!state.defaultScene)
      throw new SceneLayoutError(
        "Scene-layout template requires live userInfo.defaultScene.",
      );
    if (this.#runtime)
      throw new SceneLayoutError(
        "Scene-layout template initial state was already applied.",
      );
    const app = this.requireApp();
    const runtime = this.#runtimeFactory({
      resource: this.#resource,
      reelPresentation: this.#presentation.reel,
    });
    this.#resourceOwned = false;
    try {
      await runtime.init({
        reels: {
          main: {
            scene: state.defaultScene,
            localPhaseYs: this.createLocalPhases(),
          },
        },
      });
      this.assertAlive();
      app.stage.addChild(runtime.container);
      this.#runtime = runtime;
      this.applyViewport({
        width: app.renderer.width,
        height: app.renderer.height,
      });
    } catch (error) {
      runtime.destroy();
      throw asError(error);
    }
  }

  playSpin(logic: GameLogic): Promise<void> {
    try {
      this.assertAlive();
      if (this.#pending)
        throw new SceneLayoutError(
          "Configured scene-layout round is already in progress.",
        );
      const runtime = this.requireRuntime();
      const targetScene = requireSingleComponentScene(
        logic,
        this.#roundFlow.components.spin,
      );
      const geometry = this.#resource.manifest.reels.main;
      if (!geometry)
        throw new SceneLayoutError("Scene layout has no reels.main.");
      validateSceneDimensions(
        targetScene,
        geometry.columns,
        geometry.rows,
        "main spin target",
      );
      const winGroups = this.compileWinGroups(
        logic,
        geometry.columns,
        geometry.rows,
      );
      const finalScenes = this.compileCascadeFinalScenes(logic);
      runtime.dismissActiveAwardCelebrationImmediately();
      runtime.spinMainReelToScene({
        scene: targetScene,
        localPhaseYs: this.createLocalPhases(),
        random: this.#random,
      });
      return new Promise((resolve, reject) => {
        this.#pending = {
          phase: "spin",
          winGroups,
          winIndex: 0,
          finalScenes,
          resolve,
          reject,
        };
      });
    } catch (error) {
      return Promise.reject(asError(error));
    }
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#unsubscribeViewport?.();
    this.#unsubscribeViewport = null;
    if (this.#pending) {
      this.#pending.reject(
        new SceneLayoutError(
          "Configured scene-layout adapter was destroyed during a round.",
        ),
      );
      this.#pending = null;
    }
    this.#app?.ticker.remove(this.#onTick);
    this.#runtime?.destroy();
    this.#runtime = null;
    if (this.#resourceOwned) void this.#resource.destroy();
    this.#resourceOwned = false;
    this.#app?.destroy();
    this.#app = null;
  }

  readonly #onTick = (): void => {
    const app = this.#app;
    const runtime = this.#runtime;
    if (!app || !runtime || this.#destroyed) return;
    try {
      runtime.update(Math.min(app.ticker.deltaMS / 1000, 1 / 30));
      this.advancePendingRound(runtime);
    } catch (error) {
      const pending = this.#pending;
      this.#pending = null;
      pending?.reject(asError(error));
    }
  };

  private advancePendingRound(runtime: SceneLayoutPackageRuntime): void {
    const pending = this.#pending;
    if (!pending) return;
    if (pending.phase === "spin") {
      if (runtime.isMainReelSpinning()) return;
      pending.phase = "win";
      this.startNextWinGroup(runtime, pending);
      return;
    }
    const group = pending.winGroups[pending.winIndex - 1];
    if (
      group &&
      runtime
        .getMainReelSymbolStateSnapshots(group.positions)
        .some((snapshot) => snapshot.isOnce)
    )
      return;
    this.startNextWinGroup(runtime, pending);
  }

  private startNextWinGroup(
    runtime: SceneLayoutPackageRuntime,
    pending: PendingRound,
  ): void {
    const group = pending.winGroups[pending.winIndex];
    if (group) {
      pending.winIndex += 1;
      runtime.requestMainReelSymbolStates(
        group.positions,
        this.#presentation.flow.symbolStates.win,
      );
      return;
    }
    for (const scene of pending.finalScenes)
      runtime.resetReelScene("main", {
        scene,
        localPhaseYs: this.createLocalPhases(),
      });
    this.#pending = null;
    pending.resolve();
  }

  private compileWinGroups(
    logic: GameLogic,
    columns: number,
    rows: number,
  ): readonly {
    readonly positions: readonly { readonly x: number; readonly y: number }[];
  }[] {
    const groups: {
      readonly positions: readonly { readonly x: number; readonly y: number }[];
    }[] = [];
    for (const step of logic.getSteps()) {
      for (const componentName of this.#roundFlow.components.wins) {
        for (const result of step.getComponentResults(componentName)) {
          const positions = parseWinResultPositions(
            result,
            `step[${step.getIndex()}] component "${componentName}" win result`,
          );
          for (const position of positions)
            if (position.x >= columns || position.y >= rows)
              throw new SceneLayoutError(
                `Win position (${position.x},${position.y}) is outside ${columns}x${rows}.`,
              );
          groups.push({
            positions,
          });
        }
      }
    }
    return Object.freeze(groups);
  }

  private compileCascadeFinalScenes(logic: GameLogic): readonly SceneMatrix[] {
    const cascade = this.#roundFlow.cascade;
    if (!cascade) return Object.freeze([]);
    const scenes: SceneMatrix[] = [];
    for (const step of logic.getSteps()) {
      const refill = step.getComponentScenes(cascade.components.refill);
      if (refill.length > 1)
        throw new SceneLayoutError(
          `Cascade refill component "${cascade.components.refill}" must reference at most one scene per step.`,
        );
      if (refill[0]) scenes.push(refill[0]);
    }
    return Object.freeze(scenes);
  }

  private createLocalPhases(): readonly number[] {
    const geometry = this.#resource.manifest.reels.main;
    if (!geometry)
      throw new SceneLayoutError("Scene layout has no reels.main.");
    return Object.freeze(
      Array.from({ length: geometry.columns }, () =>
        Math.floor(this.#random() * 1_000_000),
      ),
    );
  }

  private applyViewport(size: {
    readonly width: number;
    readonly height: number;
  }): void {
    const app = this.#app;
    if (!app) return;
    app.renderer.resize(size.width, size.height);
    this.#runtime?.applyViewport(size);
  }

  private requireApp(): Application {
    if (!this.#app)
      throw new SceneLayoutError(
        "Configured scene-layout adapter is not mounted.",
      );
    return this.#app;
  }

  private requireRuntime(): SceneLayoutPackageRuntime {
    if (!this.#runtime)
      throw new SceneLayoutError(
        "Configured scene-layout adapter has no initial scene.",
      );
    return this.#runtime;
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw new SceneLayoutError(
        "Configured scene-layout adapter is destroyed.",
      );
  }
}

function requireSingleComponentScene(
  logic: GameLogic,
  componentName: string,
): SceneMatrix {
  const scenes = logic
    .getSteps()
    .flatMap((step) => step.getComponentScenes(componentName));
  if (scenes.length !== 1)
    throw new SceneLayoutError(
      `Main spin component "${componentName}" must reference exactly one authoritative scene; received ${scenes.length}.`,
    );
  return scenes[0];
}

function validateSceneDimensions(
  scene: SceneMatrix,
  columns: number,
  rows: number,
  label: string,
): void {
  if (scene.length !== columns)
    throw new SceneLayoutError(
      `${label} must contain ${columns} columns; received ${scene.length}.`,
    );
  for (const [x, column] of scene.entries())
    if (column.length !== rows)
      throw new SceneLayoutError(
        `${label}[${x}] must contain ${rows} rows; received ${column.length}.`,
      );
}

function secureRandom(): number {
  if (!globalThis.crypto?.getRandomValues)
    throw new SceneLayoutError(
      "Web Crypto getRandomValues is required for local reel phase randomization.",
    );
  const value = new Uint32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] / 0x1_0000_0000;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new SceneLayoutError(String(error));
}
