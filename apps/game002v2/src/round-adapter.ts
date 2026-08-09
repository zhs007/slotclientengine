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
  getInitialSceneLayoutSymbolPackageResource,
  deriveGridCellCascadeSettledValues,
  type SceneLayoutPackageResource,
  type SceneLayoutPackageRuntime,
} from "@slotclientengine/rendercore";
import { Application } from "pixi.js";
import { createGame002v2DefaultSceneValueResolver } from "./default-scene-values.js";
import { Game002v2NearwinController } from "./nearwin.js";
import { uniqueGame002v2Positions } from "./round-positions.js";
import {
  createGame002v2PresentationValues,
  sameGame002v2PresentationValues,
  type Game002v2PresentationValues,
} from "./round-values.js";
import {
  buildGame002v2InitialSpinPlan,
  resolveGame002v2SpinSymbolCodes,
  type Game002v2SpinSymbolCodes,
} from "./spin-presentation.js";

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
  #spinCodes: Game002v2SpinSymbolCodes | null = null;
  #nearwin: Game002v2NearwinController | null = null;
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
    const symbols = getInitialSceneLayoutSymbolPackageResource(this.#resource);
    this.#spinCodes = resolveGame002v2SpinSymbolCodes(symbols);
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
      gridCellPresentation: {
        presentationValueResolver:
          createGame002v2DefaultSceneValueResolver(symbols),
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
        const symbols = getInitialSceneLayoutSymbolPackageResource(
          this.#resource,
        );
        const wildCode = this.requireSpinCodes().wild;
        if (step.hasComponent("bg-dropdown"))
          await this.cascadeTo(step, landingScene, symbols, wildCode);
        else
          await this.spinTo(
            landingScene,
            readPresentationValues(step, landingScene, symbols),
            step.hasComponent("bg-spin") ? this.requireSpinCodes() : null,
          );
      }
      await this.playFeatureStates(step, runtime.getMainReelSceneSnapshot());
      const finalScene = readFinalScene(step);
      if (finalScene) {
        const currentScene = runtime.getMainReelSceneSnapshot();
        const currentValues = runtime.getMainReelCascadeValues();
        const finalValues = readPresentationValues(
          step,
          finalScene,
          getInitialSceneLayoutSymbolPackageResource(this.#resource),
          { scene: currentScene, values: currentValues },
        );
        if (
          !sameScene(currentScene, finalScene) ||
          !sameGame002v2PresentationValues(currentValues, finalValues)
        )
          runtime.applyMainReelSnapshot({
            scene: finalScene,
            presentationValues: finalValues,
            localPhaseYs: this.localPhases(),
          });
      }
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
    this.finishNearwin();
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
      this.updateNearwin(
        runtime.drainMainReelLandingPositions(),
        runtime.drainMainReelActivationPositions(),
      );
      if (this.#spinWaiter && !runtime.isMainReelSpinning()) {
        const waiter = this.#spinWaiter;
        this.#spinWaiter = null;
        this.finishNearwin();
        waiter.resolve();
      }
    } catch (error) {
      this.finishNearwin();
      const waiter = this.#spinWaiter;
      this.#spinWaiter = null;
      waiter?.reject(asError(error));
      throw error;
    }
  };

  private spinTo(
    scene: SceneMatrix,
    presentationValues: readonly (readonly (number | null)[])[],
    spinCodes: Game002v2SpinSymbolCodes | null,
  ): Promise<void> {
    if (this.#spinWaiter)
      throw new Error("game002v2 reel is already spinning.");
    const runtime = this.requireRuntime();
    this.#nearwin = null;
    try {
      runtime.spinMainReelToScene({
        scene,
        localPhaseYs: this.localPhases(),
        random: secureRandom,
        presentationValues,
        ...(spinCodes
          ? {
              buildGridCellSpinPlan: (stage) => {
                const presentation = buildGame002v2InitialSpinPlan(
                  stage,
                  spinCodes,
                );
                this.#nearwin = presentation.nearwin
                  ? new Game002v2NearwinController(
                      presentation.nearwin,
                      runtime,
                    )
                  : null;
                return presentation.plan;
              },
            }
          : {}),
      });
    } catch (error) {
      this.#nearwin = null;
      throw error;
    }
    return new Promise<void>((resolve, reject) => {
      this.#spinWaiter = { resolve, reject };
    });
  }

  private cascadeTo(
    step: GameLogicStep,
    targetScene: SceneMatrix,
    symbols: ReturnType<typeof getInitialSceneLayoutSymbolPackageResource>,
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
    const targetValues = readPresentationValues(step, targetScene, symbols, {
      scene: dropdown,
      values: settledValues,
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
    const positions = uniqueGame002v2Positions(
      WIN_COMPONENTS.flatMap((name) =>
        step.getComponentResults(name).flatMap((result) => pairs(result.pos)),
      ),
    );
    const scene = this.requireRuntime().getMainReelSceneSnapshot();
    const coinCode = this.requireSpinCodes().coin;
    await this.playState(
      positions.filter(({ x, y }) => scene[x]?.[y] !== coinCode),
      "win",
    );
    await this.playState(
      positions.filter(({ x, y }) => scene[x]?.[y] === coinCode),
      "winStart",
    );
  }

  private async removeWonSymbols(step: GameLogicStep): Promise<void> {
    const removeScene = step.getComponentScenes("bg-remove").at(-1);
    if (!removeScene) return;
    const positions = holes(removeScene);
    await this.playState(positions, "remove");
    this.requireRuntime().releaseMainReelSymbols(positions);
  }

  private async playFeatureStates(
    step: GameLogicStep,
    scene: SceneMatrix | null,
  ): Promise<void> {
    if (!scene) return;
    const symbolPackage = getInitialSceneLayoutSymbolPackageResource(
      this.#resource,
    );
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
      if (code === undefined)
        throw new Error(`game002v2 requires symbol "${symbol}".`);
      await this.playState(findCode(scene, code), state);
    }
  }

  private async playState(
    positions: readonly Position[],
    state: string,
  ): Promise<void> {
    if (positions.length === 0) return;
    const runtime = this.requireRuntime();
    await runtime.playMainReelSymbolStateBatch([
      {
        positions,
        state,
        options: {
          transitionMode: "immediate",
          completion: "once-complete",
        },
      },
    ]);
    runtime.requestMainReelSymbolStates(positions, "normal", "immediate");
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

  private requireSpinCodes(): Game002v2SpinSymbolCodes {
    if (!this.#spinCodes)
      throw new Error("game002v2 spin presentation is not ready.");
    return this.#spinCodes;
  }

  private updateNearwin(
    landed: readonly Position[],
    activated: readonly Position[],
  ): void {
    const nearwin = this.#nearwin;
    if (!nearwin) {
      if (activated.length > 0)
        throw new Error("game002v2 received an unexpected activation edge.");
      return;
    }
    nearwin.update(landed, activated);
  }

  private finishNearwin(): void {
    const nearwin = this.#nearwin;
    this.#nearwin = null;
    nearwin?.finish();
  }
}

interface Position {
  readonly x: number;
  readonly y: number;
}

function readLandingScene(step: GameLogicStep): SceneMatrix | null {
  return step.getLastComponentScenes(LANDING_COMPONENTS).at(-1) ?? null;
}

function readFinalScene(step: GameLogicStep): SceneMatrix | null {
  return step.getLastComponentScenes(FINAL_COMPONENTS).at(-1) ?? null;
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
  symbols: ReturnType<typeof getInitialSceneLayoutSymbolPackageResource>,
  fallback?: Readonly<{
    readonly scene: readonly (readonly number[])[];
    readonly values: readonly (readonly (number | null | -1)[])[];
  }>,
): Game002v2PresentationValues {
  const overlays: Array<{
    readonly code: number;
    readonly values: readonly (readonly number[])[];
  }> = [];
  for (const [symbol, componentNames] of Object.entries(VALUE_COMPONENTS)) {
    const code = symbols.gameConfig.getSymbolCode(symbol);
    if (code === undefined) continue;
    for (const name of componentNames)
      for (const matrix of step.getComponentOtherScenes(name))
        overlays.push({ code, values: matrix });
  }
  return createGame002v2PresentationValues({
    scene,
    overlays,
    ...(fallback ? { fallback } : {}),
  });
}

function secureRandom(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0]! / 0x1_0000_0000;
}

function asError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
