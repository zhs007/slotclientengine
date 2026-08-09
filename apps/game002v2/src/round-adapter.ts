import {
  type GameLogic,
  type GameLogicStep,
  type SceneMatrix,
  type SlotGameAdapter,
  type SlotGameInitialState,
  type SlotGameMountContext,
} from "@slotclientengine/gameframeworks";
import {
  createGridCellCascadeDropPlan,
  createSceneLayoutPackageRuntime,
  deriveGridCellCascadeSettledValues,
  type SceneLayoutPackageResource,
  type SceneLayoutPackageRuntime,
} from "@slotclientengine/rendercore";
import { Application } from "pixi.js";
import { createNearwinLandingState } from "./nearwin.js";

const LANDING_COMPONENTS = Object.freeze([
  "bg-spin",
  "bg-refill",
  "bg-genwm",
  "bg-gencm",
  "bg-genco",
  "fg-spin",
]);
const FINAL_COMPONENTS = Object.freeze([
  ...LANDING_COMPONENTS,
  "bg-wm2cn",
  "bg-cm2cn",
  "bg-co",
  "fg-af2cn",
  "fg-vortex",
]);
const WIN_COMPONENTS = Object.freeze(["bg-win", "bg-win2", "fg-win"]);
const VALUE_COMPONENTS = Object.freeze({
  CN: Object.freeze([
    "bg-gencoins",
    "bg-updcn",
    "bg-genwmcn",
    "bg-gencmcn",
    "bg-cogencn",
    "fg-genafcn",
    "fg-cogencn",
  ]),
  WL: Object.freeze(["bg-genwilds", "bg-incwl", "bg-updwl"]),
  WM: Object.freeze(["bg-setwm"]),
  CM: Object.freeze(["bg-setcm"]),
});

export function createGame002v2RoundAdapter(
  resource: SceneLayoutPackageResource,
): SlotGameAdapter {
  return new DirectRoundAdapter(resource);
}

class DirectRoundAdapter implements SlotGameAdapter {
  readonly #resource: SceneLayoutPackageResource;
  readonly #app = new Application();
  #runtime: SceneLayoutPackageRuntime | null = null;
  #context: SlotGameMountContext | null = null;
  #unsubscribeViewport: (() => void) | null = null;
  #unbindPopup: (() => void) | null = null;
  #spinWaiter: { resolve(): void; reject(error: Error): void } | null = null;
  #destroyed = false;
  #resourceOwned = true;

  constructor(resource: SceneLayoutPackageResource) {
    this.#resource = resource;
  }

  async mount(context: SlotGameMountContext): Promise<void> {
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
      throw new Error("game002v2 requires userInfo.defaultScene.");
    const runtime = createSceneLayoutPackageRuntime({
      resource: this.#resource,
      reelPresentation: {
        kind: "grid-cell",
        version: 1,
        direction: "forward",
        order: "top-down-left-right",
        timing: {
          startStepMs: 16,
          stopStepMs: 16,
          settleAfterLastStartMs: 180,
          minimumSpinCycles: 6,
          speedSymbolsPerSecond: 54,
        },
        bounceStrength: 0,
      },
    });
    this.#resourceOwned = false;
    await runtime.init({
      reels: {
        main: {
          scene: state.defaultScene,
          localPhaseYs: this.localPhases(),
        },
      },
    });
    const context = this.#context;
    if (!context) throw new Error("game002v2 adapter is not mounted.");
    this.#runtime = runtime;
    this.#app.stage.addChild(runtime.container);
    runtime.applyViewport(context.getViewport().frameDesignSize);
    this.#unbindPopup = runtime.bindPopupInput({
      canvas: this.#app.canvas,
      keyboardTarget: window,
      onError: (error) => console.error(error),
    });
  }

  async playSpin(logic: GameLogic): Promise<void> {
    const runtime = this.requireRuntime();
    runtime.dismissActiveAwardCelebrationImmediately();
    const steps = logic.getSteps();
    if (steps.length === 0) throw new Error("game002v2 round has no steps.");

    for (const step of steps) {
      const landingScene = readLandingScene(step);
      if (landingScene) {
        const symbols = initialSymbolPackage(this.#resource);
        const wildCode = symbols.gameConfig.getSymbolCode("WL");
        const nearwin =
          step.hasComponent("bg-spin") && wildCode !== undefined
            ? createNearwinLandingState(landingScene, wildCode)
            : null;
        const landingValues = readPresentationValues(
          step,
          landingScene,
          symbols,
        );
        if (step.hasComponent("bg-dropdown"))
          await this.cascadeTo(step, landingScene, landingValues, wildCode);
        else await this.spinTo(landingScene, landingValues, nearwin?.matrix);
        if (nearwin)
          await this.playAvailableState(nearwin.positions, "Reel_NearWin");
      }
      await this.playFeatureStates(step, landingScene);
      const finalScene = readFinalScene(step);
      if (finalScene && landingScene && !sameScene(landingScene, finalScene))
        runtime.applyMainReelSnapshot({
          scene: finalScene,
          presentationValues: readPresentationValues(
            step,
            finalScene,
            initialSymbolPackage(this.#resource),
          ),
          localPhaseYs: this.localPhases(),
        });
      await this.playWins(step);
      await this.removeWonSymbols(step);
      if (
        step.hasComponent("bg-triggerfg") &&
        runtime.getGameModeSnapshot().stableMode !== "FreeGame"
      ) {
        await runtime.prepareGameModeTransition("FreeGame");
        await runtime.requestGameMode("FreeGame");
      }
    }

    if (runtime.getGameModeSnapshot().stableMode === "FreeGame") {
      await runtime.prepareGameModeTransition("BaseGame");
      await runtime.requestGameMode("BaseGame");
    }
    if (logic.getTotalWin() > 0)
      runtime.startAwardCelebrationForCurrentMode({
        betAmountRaw: logic.getBet() * logic.getLines(),
        winAmountRaw: logic.getTotalWin(),
      });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    this.#spinWaiter?.reject(new Error("game002v2 adapter was destroyed."));
    this.#spinWaiter = null;
    this.#unbindPopup?.();
    this.#unsubscribeViewport?.();
    this.#app.ticker.remove(this.#tick);
    this.#runtime?.destroy();
    if (this.#resourceOwned) void this.#resource.destroy();
    this.#app.destroy();
  }

  readonly #tick = (): void => {
    const runtime = this.#runtime;
    if (!runtime || this.#destroyed) return;
    try {
      runtime.update(Math.min(this.#app.ticker.deltaMS / 1000, 1 / 30));
      if (this.#spinWaiter && !runtime.isMainReelSpinning()) {
        const waiter = this.#spinWaiter;
        this.#spinWaiter = null;
        waiter.resolve();
      }
    } catch (error) {
      const waiter = this.#spinWaiter;
      this.#spinWaiter = null;
      waiter?.reject(asError(error));
      throw error;
    }
  };

  private spinTo(
    scene: SceneMatrix,
    presentationValues: readonly (readonly (number | null)[])[],
    landingStates?: readonly (readonly string[])[],
  ): Promise<void> {
    if (this.#spinWaiter)
      throw new Error("game002v2 reel is already spinning.");
    const runtime = this.requireRuntime();
    runtime.spinMainReelToScene({
      scene,
      localPhaseYs: this.localPhases(),
      random: secureRandom,
      presentationValues,
      ...(landingStates ? { landingStates } : {}),
    });
    return new Promise<void>((resolve, reject) => {
      this.#spinWaiter = { resolve, reject };
    });
  }

  private cascadeTo(
    step: GameLogicStep,
    targetScene: SceneMatrix,
    targetValues: readonly (readonly (number | null)[])[],
    wildCode: number | undefined,
  ): Promise<void> {
    if (this.#spinWaiter) throw new Error("game002v2 reel is already active.");
    const runtime = this.requireRuntime();
    const dropdown = step.getComponentScenes("bg-dropdown").at(-1);
    if (!dropdown) throw new Error("bg-dropdown has no scene.");
    const sourceScene = runtime.getMainReelSceneSnapshot();
    const sourceValues = runtime.getMainReelCascadeValues();
    const canDropOccurrence = ({ code }: { readonly code: number }) =>
      code !== wildCode;
    const settledValues = deriveGridCellCascadeSettledValues({
      sourceScene,
      sourceValues,
      settledScene: dropdown,
      canDropOccurrence,
    });
    const geometry = this.#resource.manifest.reels.main!;
    runtime.startMainReelCascadeDrop(
      createGridCellCascadeDropPlan({
        sourceScene,
        sourceValues,
        settledScene: dropdown,
        settledValues,
        targetScene,
        targetValues,
        refillPositions: holes(dropdown),
        canDropOccurrence,
        cellHeight: geometry.cellSize.height,
        rowGap: geometry.gap.y,
        motion: {
          columnStartStaggerSeconds: 0.045,
          startStaggerSeconds: 0.018,
          baseFallSeconds: 0.11,
          perRowFallSeconds: 0.04,
          maxFallSeconds: 0.36,
          overshootCellRatio: 0.16,
          settleSeconds: 0.09,
        },
      }),
    );
    return new Promise<void>((resolve, reject) => {
      this.#spinWaiter = { resolve, reject };
    });
  }

  private async playWins(step: GameLogicStep): Promise<void> {
    const positions = WIN_COMPONENTS.flatMap((name) =>
      step.getComponentResults(name).flatMap((result) => pairs(result.pos)),
    );
    await this.playAvailableState(positions, "win", "winStart");
  }

  private async removeWonSymbols(step: GameLogicStep): Promise<void> {
    const removeScene = step.getComponentScenes("bg-remove").at(-1);
    if (!removeScene) return;
    const positions = holes(removeScene);
    await this.playAvailableState(positions, "remove");
    this.requireRuntime().releaseMainReelSymbols(positions);
  }

  private async playFeatureStates(
    step: GameLogicStep,
    scene: SceneMatrix | null,
  ): Promise<void> {
    if (!scene) return;
    const symbolPackage = initialSymbolPackage(this.#resource);
    const plays: Array<readonly [string, string]> = [];
    if (step.hasComponent("bg-genwm") || step.hasComponent("bg-wm2cn"))
      plays.push(["WM", "multStart"], ["WM", "change"]);
    if (step.hasComponent("bg-gencm") || step.hasComponent("bg-cm2cn"))
      plays.push(["CM", "feature1"], ["CM", "change"]);
    if (step.hasComponent("bg-triggerco") || step.hasComponent("fg-triggerco"))
      plays.push(["CO", "feature"]);
    if (step.hasComponent("fg-rollaf"))
      plays.push(["AF", "feature"], ["AF", "change"]);
    for (const [symbol, state] of plays) {
      const code = symbolPackage.gameConfig.getSymbolCode(symbol);
      if (code === undefined) continue;
      await this.playAvailableState(findCode(scene, code), state);
    }
  }

  private async playAvailableState(
    positions: readonly Position[],
    ...states: readonly string[]
  ): Promise<void> {
    const runtime = this.requireRuntime();
    const remaining = [...positions];
    for (const state of states) {
      const playable = remaining.filter((position) =>
        runtime.hasMainReelSymbolStateCapability(position, state),
      );
      if (playable.length === 0) continue;
      await runtime.playMainReelSymbolStateBatch([
        {
          positions: playable,
          state,
          options: {
            transitionMode: "immediate",
            completion: "once-complete",
          },
        },
      ]);
      runtime.requestMainReelSymbolStates(playable, "normal", "immediate");
    }
  }

  private localPhases(): readonly number[] {
    const columns = this.#resource.manifest.reels.main?.columns ?? 0;
    return Object.freeze(
      Array.from({ length: columns }, () =>
        Math.floor(secureRandom() * 1_000_000),
      ),
    );
  }

  private requireRuntime(): SceneLayoutPackageRuntime {
    if (!this.#runtime) throw new Error("game002v2 runtime is not ready.");
    return this.#runtime;
  }
}

interface Position {
  readonly x: number;
  readonly y: number;
}

function readLandingScene(step: GameLogicStep): SceneMatrix | null {
  return (
    step.getLastComponentScenes(LANDING_COMPONENTS).at(-1) ??
    step.getScenes().at(-1) ??
    null
  );
}

function readFinalScene(step: GameLogicStep): SceneMatrix | null {
  return (
    step.getLastComponentScenes(FINAL_COMPONENTS).at(-1) ??
    step.getScenes().at(-1) ??
    null
  );
}

function pairs(values: readonly number[]): readonly Position[] {
  const output: Position[] = [];
  for (let index = 0; index < values.length; index += 2)
    output.push({ x: values[index]!, y: values[index + 1]! });
  return output;
}

function findCode(scene: SceneMatrix, code: number): readonly Position[] {
  const output: Position[] = [];
  for (let x = 0; x < scene.length; x++)
    for (let y = 0; y < scene[x]!.length; y++)
      if (scene[x]![y] === code) output.push({ x, y });
  return output;
}

function holes(scene: SceneMatrix): readonly Position[] {
  return findCode(scene, -1);
}

function sameScene(left: SceneMatrix, right: SceneMatrix): boolean {
  return (
    left.length === right.length &&
    left.every(
      (column, x) =>
        column.length === right[x]?.length &&
        column.every((code, y) => code === right[x]?.[y]),
    )
  );
}

function readPresentationValues(
  step: GameLogicStep,
  scene: SceneMatrix,
  symbols: ReturnType<typeof initialSymbolPackage>,
): readonly (readonly (number | null)[])[] {
  const values: Array<Array<number | null>> = scene.map((column) =>
    column.map(() => null),
  );
  for (const [symbol, componentNames] of Object.entries(VALUE_COMPONENTS)) {
    const code = symbols.gameConfig.getSymbolCode(symbol);
    if (code === undefined) continue;
    for (const name of componentNames)
      for (const matrix of step.getComponentOtherScenes(name))
        for (let x = 0; x < scene.length; x++)
          for (let y = 0; y < scene[x]!.length; y++) {
            const value = matrix[x]?.[y];
            if (scene[x]![y] === code && typeof value === "number" && value > 0)
              values[x]![y] = value;
          }
  }
  return Object.freeze(values.map((column) => Object.freeze(column)));
}

function initialSymbolPackage(resource: SceneLayoutPackageResource) {
  const modes = resource.manifest.gameModes;
  const initial = modes?.modes.find((mode) => mode.id === modes.initialMode);
  const id = initial?.symbolPackage;
  const symbols = id ? resource.symbolPackages[id] : resource.symbolPackage;
  if (!symbols) throw new Error("Crave initial symbol package is unavailable.");
  return symbols;
}

function secureRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
