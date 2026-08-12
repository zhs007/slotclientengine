import { Application } from "pixi.js";
import type {
  SceneMatrix,
  SlotGameAdapter,
  SlotGameInitialState,
  SlotGameMountContext,
  SlotOperationV2,
} from "@slotclientengine/gameframeworks";
import {
  createSceneLayoutPackageRuntime,
  createSlotOperationCoordinator,
  createSlotOperationHandlerRegistry,
  createSymbolWinCarousel,
  type SceneLayoutPackageRuntime,
  type SlotOperationExecutionContext,
  type SymbolWinCarousel,
  type SymbolWinCarouselGroup,
} from "@slotclientengine/rendercore";
import { GAME003V2_CONFIG } from "./config.js";
import { formatGame003v2Amount } from "./money.js";
import type { Game003v2Resource } from "./resource.js";
import {
  compileGame003v2Round,
  type Game003v2WinGroup,
} from "./round-compiler.js";

export function createGame003v2RoundAdapter(
  resource: Game003v2Resource,
): SlotGameAdapter {
  return new Game003v2RoundAdapter(resource);
}

class Game003v2RoundAdapter implements SlotGameAdapter {
  readonly #resource: Game003v2Resource;
  readonly #app = new Application();
  #context: SlotGameMountContext | null = null;
  #runtime: SceneLayoutPackageRuntime | null = null;
  #carousel: SymbolWinCarousel | null = null;
  #coordinator: ReturnType<typeof createSlotOperationCoordinator> | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #unbindPopup: (() => void) | null = null;
  #preSpinActive = false;
  #destroyed = false;

  constructor(resource: Game003v2Resource) {
    this.#resource = resource;
  }

  async mount(context: SlotGameMountContext): Promise<void> {
    if (this.#context) throw new Error("game003v2 adapter is already mounted.");
    this.#context = context;
    const size = context.getViewport().frameDesignSize;
    await this.#app.init({
      width: size.width,
      height: size.height,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    context.gameLayer.replaceChildren(this.#app.canvas);
    this.#app.ticker.add(this.#tick);
    this.#unsubscribeViewport = context.onViewportChange((viewport) => {
      this.#app.renderer.resize(
        viewport.frameDesignSize.width,
        viewport.frameDesignSize.height,
      );
      this.#runtime?.applyViewport(viewport.frameDesignSize);
    });
  }

  async applyInitialState(state: SlotGameInitialState): Promise<void> {
    if (!state.defaultScene)
      throw new Error("game003v2 requires userInfo.defaultScene.");
    if (this.#runtime)
      throw new Error("game003v2 initial state was already applied.");
    const runtime = createSceneLayoutPackageRuntime({
      resource: this.#resource.package,
      reelPresentation: {
        kind: "standard",
        version: 1,
        ...GAME003V2_CONFIG.reel,
        startDelayMs: 0,
        bounceStrength: 0,
      },
      formatPopupAmount: formatGame003v2Amount,
    });
    try {
      await runtime.init({
        reels: {
          main: {
            scene: validateScene(state.defaultScene),
            localPhaseYs: localPhases(this.#resource.columns),
          },
        },
      });
      const carousel = createSymbolWinCarousel({
        target: {
          requestVisibleSymbolStates: (positions, symbolState) =>
            runtime.requestMainReelSymbolStates(
              positions,
              symbolState,
              "immediate",
            ),
          getVisibleSymbolStateSnapshots: (positions) =>
            runtime.getMainReelSymbolStateSnapshots(positions),
          getVisibleSymbolGeometrySnapshots: (positions) =>
            runtime.getMainReelSymbolGeometrySnapshots(positions),
          update: () => undefined,
        },
        resolveAmount: () => {
          throw new Error("game003v2 uses compiler-produced win amounts.");
        },
        formatAmount: formatGame003v2Amount,
        ...GAME003V2_CONFIG.winCarousel,
      });
      runtime.getReelPresentation("main").addChild(carousel.container);
      const registry = this.createRegistry(runtime, carousel);
      const coordinator = createSlotOperationCoordinator({
        registry,
        updateRuntime: (deltaSeconds) => runtime.update(deltaSeconds),
        cleanup: (reason) => {
          carousel.clear();
          runtime.dismissActiveAwardCelebrationImmediately();
          if (reason === "next-spin") return;
          this.cancelActiveReels(runtime);
          this.#preSpinActive = false;
        },
      });
      this.#runtime = runtime;
      this.#carousel = carousel;
      this.#coordinator = coordinator;
      this.#app.stage.addChild(runtime.container);
      const context = this.requireContext();
      runtime.applyViewport(context.getViewport().frameDesignSize);
      this.#unbindPopup = runtime.bindPopupInput({
        canvas: this.#app.canvas,
        keyboardTarget: window,
        onError: console.error,
      });
    } catch (error) {
      runtime.destroy();
      throw error;
    }
  }

  startSpinPresentation(): void {
    if (this.#preSpinActive)
      throw new Error("game003v2 continuous spin is already active.");
    const runtime = this.requireRuntime();
    if (this.requireCoordinator().getSnapshot().running)
      throw new Error("game003v2 operation plan is still running.");
    const reelSpin = runtime.getReelSpin("main");
    const started: number[] = [];
    try {
      for (let x = 0; x < this.#resource.columns; x += 1) {
        reelSpin.start(x);
        started.push(x);
      }
      this.#preSpinActive = true;
    } catch (error) {
      for (const x of started.reverse()) reelSpin.cancel(x);
      throw error;
    }
  }

  cancelSpinPresentation(_error: Error): void {
    if (!this.#preSpinActive) return;
    const runtime = this.requireRuntime();
    this.cancelActiveReels(runtime);
    this.#preSpinActive = false;
  }

  playSpin(logic: Parameters<SlotGameAdapter["playSpin"]>[0]): Promise<void> {
    const compilation = compileGame003v2Round({
      logic,
      gameConfig: this.#resource.symbols.gameConfig,
      displaySymbols: this.#resource.symbols.displaySymbols,
    });
    return this.requireCoordinator().start(compilation.plan);
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#unsubscribeViewport?.();
    this.#unsubscribeViewport = null;
    this.#unbindPopup?.();
    this.#unbindPopup = null;
    this.#app.ticker.remove(this.#tick);
    this.#coordinator?.destroy();
    this.#carousel?.destroy();
    this.#runtime?.destroy();
    if (!this.#runtime) void this.#resource.package.destroy();
    this.#app.destroy();
    this.#runtime = null;
    this.#carousel = null;
    this.#coordinator = null;
    this.#context = null;
  }

  private createRegistry(
    runtime: SceneLayoutPackageRuntime,
    carousel: SymbolWinCarousel,
  ) {
    const registry = createSlotOperationHandlerRegistry();
    registry.register({
      kind: "slot:spin",
      version: 2,
      handler: {
        start: (operation, context) => this.land(runtime, operation, context),
      },
    });
    registry.register({
      kind: "game003:wins",
      version: 2,
      handler: {
        start: (operation, context) => playWins(carousel, operation, context),
      },
    });
    registry.register({
      kind: "game003:award",
      version: 2,
      handler: {
        start: (operation, context) => playAward(runtime, operation, context),
      },
    });
    return registry;
  }

  private async land(
    runtime: SceneLayoutPackageRuntime,
    operation: SlotOperationV2,
    context: SlotOperationExecutionContext,
  ): Promise<void> {
    if (operation.effect !== "scene-landing")
      throw new Error(
        "game003v2 landing handler received a non-landing operation.",
      );
    const scene = validateScene(operation.output.scene);
    const values = presentationValues(operation.output.values);
    const reelSpin = runtime.getReelSpin("main");
    const settle = this.#preSpinActive;
    this.#preSpinActive = false;
    const jobs = scene.map(async (symbols, x) => {
      if (x > 0)
        await context.delay((x * GAME003V2_CONFIG.reel.stopDelayMs) / 1000);
      const target = { symbols, values: values[x]! };
      return settle
        ? reelSpin.settle(x, target, { signal: context.signal })
        : reelSpin.roll(x, target, { signal: context.signal });
    });
    try {
      await Promise.all(jobs);
    } catch (error) {
      for (let x = 0; x < scene.length; x += 1) reelSpin.cancel(x);
      await Promise.allSettled(jobs);
      throw error;
    }
  }

  readonly #tick = (ticker: { deltaMS: number }) => {
    const runtime = this.#runtime;
    const coordinator = this.#coordinator;
    if (!runtime || !coordinator) return;
    const deltaSeconds = Math.max(0, ticker.deltaMS / 1000);
    if (coordinator.getSnapshot().running) coordinator.update(deltaSeconds);
    else {
      runtime.update(deltaSeconds);
      if (this.#carousel?.getSnapshot().phase !== "idle")
        this.#carousel?.update(deltaSeconds);
    }
  };

  private requireRuntime(): SceneLayoutPackageRuntime {
    if (!this.#runtime) throw new Error("game003v2 adapter is not ready.");
    return this.#runtime;
  }

  private cancelActiveReels(runtime: SceneLayoutPackageRuntime): void {
    const reelSpin = runtime.getReelSpin("main");
    for (let x = 0; x < this.#resource.columns; x += 1) reelSpin.cancel(x);
  }

  private requireCoordinator() {
    if (!this.#coordinator) throw new Error("game003v2 adapter is not ready.");
    return this.#coordinator;
  }

  private requireContext(): SlotGameMountContext {
    if (!this.#context) throw new Error("game003v2 adapter is not mounted.");
    return this.#context;
  }
}

function playWins(
  carousel: SymbolWinCarousel,
  operation: SlotOperationV2,
  context: SlotOperationExecutionContext,
): Promise<void> {
  const groups = payload(operation).groups;
  if (!Array.isArray(groups))
    throw new Error("game003v2 wins groups are missing.");
  const prepared = carousel.prepareGroups(
    groups as readonly Game003v2WinGroup[],
  );
  const started = carousel.start(prepared);
  if (!started.started) return Promise.resolve();
  return context.waitForFrame(
    (deltaSeconds) => carousel.update(deltaSeconds).firstCycleComplete,
  );
}

function playAward(
  runtime: SceneLayoutPackageRuntime,
  operation: SlotOperationV2,
  context: SlotOperationExecutionContext,
): Promise<void> {
  const value = payload(operation);
  if (
    !Number.isSafeInteger(value.betAmountRaw) ||
    !Number.isSafeInteger(value.winAmountRaw)
  )
    throw new Error("game003v2 award payload is invalid.");
  runtime.startAwardCelebrationForCurrentMode({
    betAmountRaw: value.betAmountRaw as number,
    winAmountRaw: value.winAmountRaw as number,
  });
  return context.waitForFrame(() => {
    const phase = runtime.getActiveAwardCelebrationSnapshot()?.phase;
    return (
      phase === undefined ||
      phase === "awaiting-dismiss" ||
      phase === "complete"
    );
  });
}

function payload(operation: SlotOperationV2): Record<string, unknown> {
  if (
    !operation.payload ||
    typeof operation.payload !== "object" ||
    Array.isArray(operation.payload)
  )
    throw new Error(`game003v2 ${operation.kind} payload must be an object.`);
  return operation.payload as Record<string, unknown>;
}

function presentationValues(
  values: readonly (readonly (number | null | -1)[])[],
): readonly (readonly (number | null)[])[] {
  return Object.freeze(
    values.map((column) =>
      Object.freeze(
        column.map((value) => {
          if (value === -1)
            throw new Error("game003v2 landing contains a value hole.");
          return value;
        }),
      ),
    ),
  );
}

function validateScene(scene: SceneMatrix): SceneMatrix {
  if (scene.length !== 5 || scene.some((column) => column.length !== 5))
    throw new Error("game003v2 scene must be 5x5.");
  return scene;
}

function localPhases(columns: number): readonly number[] {
  return Object.freeze(
    Array.from({ length: columns }, () =>
      Math.floor(secureRandom() * 1_000_000),
    ),
  );
}

function secureRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
}
