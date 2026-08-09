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
  createGridCellCascadeDropdownPlan,
  createSceneLayoutPackageRuntime,
  getInitialSceneLayoutSymbolPackageResource,
  deriveGridCellCascadeSettledValues,
  type SceneLayoutPackageResource,
  type SceneLayoutPackageRuntime,
} from "@slotclientengine/rendercore";
import { Application } from "pixi.js";
import { createGame002v2DefaultSceneValueResolver } from "./default-scene-values.js";
import { Game002v2NearwinController } from "./nearwin.js";
import {
  createGame002v2PresentationValues,
  sameGame002v2PresentationValues,
  type Game002v2PresentationValues,
} from "./round-values.js";
import {
  buildGame002v2AnticipationRefillPlan,
  buildGame002v2AnticipationSweep,
  buildGame002v2InitialSpinPlan,
  buildGame002v2FreeGameSpinPlan,
  createGame002v2ContinuousSpinInput,
  resolveGame002v2SpinSymbolCodes,
  type Game002v2SpinSymbolCodes,
} from "./spin-presentation.js";
import type { Game002v2PerformanceTrace } from "./performance-trace.js";
import {
  createGame002v2EffectController,
  type Game002v2ReelPresentation,
} from "./reel-presentation.js";

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
  reelPresentation: Game002v2ReelPresentation,
  performanceTrace?: Game002v2PerformanceTrace,
): SlotGameAdapter {
  return new DirectRoundAdapter(resource, reelPresentation, performanceTrace);
}

class DirectRoundAdapter implements SlotGameAdapter {
  readonly #resource: SceneLayoutPackageResource;
  readonly #performanceTrace: Game002v2PerformanceTrace | undefined;
  readonly #reelPresentation: Game002v2ReelPresentation;
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
  #spinStartPaintPending = false;
  #anticipationActive = false;
  #preSpinActive = false;
  #preSpinInputScene: SceneMatrix | null = null;
  #preSpinInputValues: readonly (readonly (number | null | -1)[])[] | null =
    null;

  constructor(
    resource: SceneLayoutPackageResource,
    reelPresentation: Game002v2ReelPresentation,
    performanceTrace?: Game002v2PerformanceTrace,
  ) {
    this.#resource = resource;
    this.#reelPresentation = reelPresentation;
    this.#performanceTrace = performanceTrace;
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
    this.#performanceTrace?.markStartup("runtime-init-start");
    const runtime = createSceneLayoutPackageRuntime({
      resource: this.#resource,
      reelPresentation: {
        kind: "grid-cell",
        version: 1,
        direction: "forward",
        order: "top-down-left-right",
        timing: this.#reelPresentation.manifest.spin.timing,
        bounceStrength: this.#reelPresentation.manifest.spin.bounceStrength,
      },
      gridCellPresentation: {
        createEffectController: () =>
          createGame002v2EffectController(
            this.#resource,
            this.#reelPresentation,
          ),
        presentationValueResolver:
          createGame002v2DefaultSceneValueResolver(symbols),
      },
    });
    this.#resourceOwned = false;
    try {
      await runtime.init({
        reels: {
          main: {
            scene: state.defaultScene,
            localPhaseYs: this.localPhases(),
          },
        },
      });
      this.#performanceTrace?.markStartup("runtime-init-complete");
    } catch (error) {
      runtime.destroy();
      throw error;
    }
    const context = this.#context;
    if (!context) throw new Error("game002v2 adapter is not mounted.");
    this.#runtime = runtime;
    this.#performanceTrace?.markStartup("initial-scene-committed");
    this.#app.stage.addChild(runtime.container);
    runtime.applyViewport(context.getViewport().frameDesignSize);
    this.#performanceTrace?.markStartup("runtime-attached");
    this.#unbindPopup = runtime.bindPopupInput({
      canvas: this.#app.canvas,
      keyboardTarget: window,
      onError: (error) => console.error(error),
    });
    await nextAnimationFrame();
    this.#performanceTrace?.markStartup("first-scene-paint");
  }

  startSpinPresentation(): void {
    if (this.#preSpinActive)
      throw new Error("game002v2 pre-spin presentation is already active.");
    if (this.#spinWaiter)
      throw new Error("game002v2 reel activity is already in progress.");
    const runtime = this.requireRuntime();
    runtime.dismissActiveAwardCelebrationImmediately();
    this.#anticipationActive = false;
    const freeGame = runtime.getGameModeSnapshot().stableMode === "FreeGame";
    const inputScene = runtime.getMainReelSceneSnapshot();
    const inputValues = runtime.getMainReelCascadeValues();
    runtime.startMainReelContinuousSpin(
      createGame002v2ContinuousSpinInput(
        inputScene,
        this.requireSpinCodes(),
        this.#reelPresentation,
        freeGame,
      ),
    );
    this.#preSpinInputScene = inputScene;
    this.#preSpinInputValues = inputValues;
    this.#preSpinActive = true;
  }

  cancelSpinPresentation(_error: Error): void {
    if (!this.#preSpinActive) return;
    this.#preSpinActive = false;
    this.#preSpinInputScene = null;
    this.#preSpinInputValues = null;
    this.finishNearwin();
    this.requireRuntime().cancelMainReelContinuousSpin();
  }

  async playSpin(logic: GameLogic): Promise<void> {
    const runtime = this.requireRuntime();
    runtime.dismissActiveAwardCelebrationImmediately();
    const steps = logic.getSteps();
    if (steps.length === 0) throw new Error("game002v2 round has no steps.");
    this.#anticipationActive = false;
    let settledPreSpin = false;

    for (const step of steps) {
      const landingScene = readLandingScene(step);
      if (landingScene) {
        const symbols = getInitialSceneLayoutSymbolPackageResource(
          this.#resource,
        );
        const wildCode = this.requireSpinCodes().wild;
        if (step.hasComponent("bg-dropdown"))
          await this.cascadeTo(step, landingScene, symbols, wildCode);
        else {
          const runtime = this.requireRuntime();
          const isFreeGameSpin = step.hasComponent("fg-spin");
          const currentScene =
            !settledPreSpin && this.#preSpinInputScene
              ? this.#preSpinInputScene
              : runtime.getMainReelSceneSnapshot();
          const currentValues =
            !settledPreSpin && this.#preSpinInputValues
              ? this.#preSpinInputValues
              : runtime.getMainReelCascadeValues();
          await this.spinTo(
            landingScene,
            readPresentationValues(
              step,
              landingScene,
              symbols,
              isFreeGameSpin
                ? { scene: currentScene, values: currentValues }
                : undefined,
            ),
            step.hasComponent("bg-spin")
              ? "base"
              : isFreeGameSpin
                ? "freegame"
                : "plain",
            currentScene,
            !settledPreSpin && this.#preSpinActive,
          );
          this.#performanceTrace?.markActiveSpin("reel-presentation-complete");
          if (this.#preSpinActive === false) settledPreSpin = true;
        }
      }
      await this.playFeatureStates(step, runtime.getMainReelSceneSnapshot());
      this.#performanceTrace?.markActiveSpin("feature-states-complete");
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
      this.#performanceTrace?.markActiveSpin("wins-complete");
      await this.removeWonSymbols(step);
      this.#performanceTrace?.markActiveSpin("remove-complete");
      if (
        step.hasComponent("bg-triggerfg") &&
        runtime.getGameModeSnapshot().stableMode !== "FreeGame"
      ) {
        await runtime.prepareGameModeTransition("FreeGame");
        await runtime.requestGameMode("FreeGame");
      }
    }

    if (this.#preSpinActive)
      throw new Error(
        "game002v2 round did not provide a pre-spin landing scene.",
      );

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
    this.#preSpinActive = false;
    this.#preSpinInputScene = null;
    this.#preSpinInputValues = null;
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
      let remainingSeconds = Math.min(this.#app.ticker.deltaMS / 1000, 0.25);
      while (remainingSeconds > 0) {
        const sliceSeconds = Math.min(remainingSeconds, 1 / 30);
        runtime.update(sliceSeconds);
        remainingSeconds -= sliceSeconds;
      }
      const started = runtime.drainMainReelStartedPositions();
      if (started.length > 0 && !this.#spinStartPaintPending) {
        this.#spinStartPaintPending = true;
        this.#performanceTrace?.markActiveSpin("first-cell-start");
        requestAnimationFrame(() => {
          this.#spinStartPaintPending = false;
          if (!this.#destroyed)
            this.#performanceTrace?.markActiveSpin("first-cell-paint");
        });
      }
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
    kind: "base" | "freegame" | "plain",
    inputScene: SceneMatrix,
    settlePreSpin = false,
  ): Promise<void> {
    if (this.#spinWaiter)
      throw new Error("game002v2 reel is already spinning.");
    const runtime = this.requireRuntime();
    this.#nearwin = null;
    try {
      this.#performanceTrace?.markActiveSpin("plan-start");
      const input = {
        scene,
        localPhaseYs: this.localPhases(),
        random: secureRandom,
        presentationValues,
        ...(kind !== "plain"
          ? {
              buildGridCellSpinPlan: (stage) => {
                if (kind === "freegame")
                  return buildGame002v2FreeGameSpinPlan(
                    stage,
                    inputScene,
                    this.requireSpinCodes(),
                  );
                const presentation = buildGame002v2InitialSpinPlan(
                  stage,
                  this.requireSpinCodes(),
                  this.#reelPresentation,
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
      } as const;
      if (settlePreSpin) {
        runtime.settleMainReelContinuousSpin(input);
        this.#preSpinActive = false;
        this.#preSpinInputScene = null;
        this.#preSpinInputValues = null;
      } else runtime.spinMainReelToScene(input);
      this.#performanceTrace?.markActiveSpin("spin-call-complete");
    } catch (error) {
      this.#nearwin = null;
      throw error;
    }
    return new Promise<void>((resolve, reject) => {
      this.#spinWaiter = { resolve, reject };
    });
  }

  private async cascadeTo(
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
    const refillPositions = holes(dropdown);
    const planOptions = {
      sourceScene,
      sourceValues,
      settledScene: dropdown,
      settledValues,
      targetScene,
      targetValues,
      refillPositions,
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
    } as const;
    if (!this.#anticipationActive) {
      runtime.startMainReelCascadeDrop(
        createGridCellCascadeDropPlan(planOptions),
      );
      await this.waitForReelActivity();
      if (
        countCode(dropdown, this.requireSpinCodes().wild) < 2 &&
        countCode(targetScene, this.requireSpinCodes().wild) >= 2
      )
        this.#anticipationActive = true;
      return;
    }

    runtime.startMainReelCascadeDrop(
      createGridCellCascadeDropdownPlan(planOptions),
    );
    await this.waitForReelActivity();
    runtime.startMainReelEffectSweep(
      buildGame002v2AnticipationSweep(refillPositions, this.#reelPresentation),
    );
    await this.waitForReelActivity();
    runtime.spinMainReelToScene({
      scene: targetScene,
      localPhaseYs: this.localPhases(),
      random: secureRandom,
      presentationValues: targetValues,
      buildGridCellSpinPlan: (stage) =>
        buildGame002v2AnticipationRefillPlan(
          stage,
          refillPositions,
          this.#reelPresentation,
        ),
    });
    await this.waitForReelActivity();
  }

  private async playWins(step: GameLogicStep): Promise<void> {
    const positions = WIN_COMPONENTS.flatMap((name) =>
      step.getComponentResults(name).flatMap((result) => pairs(result.pos)),
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
    const winningPositions = WIN_COMPONENTS.flatMap((name) =>
      step.getComponentResults(name).flatMap((result) => pairs(result.pos)),
    );
    const targetHoles = holes(removeScene);
    const positions = [...winningPositions, ...targetHoles];
    if (positions.length === 0)
      throw new Error("bg-remove requires winning occurrence positions.");
    const runtime = this.requireRuntime();
    const result = await runtime.removeMainReelSymbols({
      positions,
      state: "remove",
      playback: {
        transitionMode: "immediate",
        completion: "once-complete",
      },
      canRemoveOccurrence: ({ code }) => code !== this.requireSpinCodes().wild,
    });
    assertSamePositions(result.removed, targetHoles, "removed");
    for (const retained of result.retained)
      if (removeScene[retained.x]?.[retained.y] !== retained.code)
        throw new Error(
          `game002v2 retained remove occurrence changed at (${retained.x},${retained.y}).`,
        );
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
    if (activated.length > 0) this.#anticipationActive = true;
  }

  private finishNearwin(): void {
    const nearwin = this.#nearwin;
    this.#nearwin = null;
    nearwin?.finish();
  }

  private waitForReelActivity(): Promise<void> {
    if (this.#spinWaiter) throw new Error("game002v2 reel is already active.");
    return new Promise<void>((resolve, reject) => {
      this.#spinWaiter = { resolve, reject };
    });
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

function countCode(scene: SceneMatrix, expected: number): number {
  return scene.reduce(
    (total, column) =>
      total + column.filter((code) => code === expected).length,
    0,
  );
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

function nextAnimationFrame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

function assertSamePositions(
  left: readonly Position[],
  right: readonly Position[],
  label: string,
): void {
  const keys = (positions: readonly Position[]) =>
    [...new Set(positions.map(({ x, y }) => `${x}:${y}`))].sort();
  if (JSON.stringify(keys(left)) !== JSON.stringify(keys(right)))
    throw new Error(`game002v2 ${label} positions do not match target scene.`);
}
