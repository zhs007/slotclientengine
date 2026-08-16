import {
  compileConfiguredSlotRoundOperationPlanV2,
  type GameLogic,
  type SceneMatrix,
  type SlotOperationSnapshot,
  type SlotRoundCapability,
  type SlotRoundDropdownStepPlan,
  type SlotRoundOccurrenceSnapshot,
  type SlotRoundRefillStepPlan,
  type SlotRoundFlowProfileV1,
  type SlotRoundWinGroupPlan,
  type SlotRoundWinStepPlan,
} from "@slotclientengine/logiccore";
import { Application } from "pixi.js";
import {
  createSlotOperationCoordinator,
  createSlotOperationHandlerRegistry,
  registerSlotRoundProfileOperationHandlers,
} from "../slot-operation/index.js";
import type {
  GridCellCascadeDropMovement,
  GridCellCascadeDropPlan,
} from "../reel/index.js";
import {
  createSymbolCascadeWinPresentationMapFromManifest,
  type SymbolPackageResource,
} from "../symbol/index.js";
import {
  createSymbolCascadePlayer,
  type SymbolCascadeGroup,
  type SymbolCascadeGroupContext,
  type SymbolCascadeGroupPositionContext,
  type SymbolCascadePlayer,
  type SymbolCascadeTarget,
} from "../symbol-cascade/index.js";
import { SceneLayoutError } from "./errors.js";
import { getInitialSceneLayoutSymbolPackageResource } from "./package-resource.js";
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
  #coordinator: ReturnType<typeof createSlotOperationCoordinator> | null = null;
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
      const target = new ConfiguredRoundTarget({
        runtime,
        symbolResource: getInitialSceneLayoutSymbolPackageResource(
          this.#resource,
        ),
        roundFlow: this.#roundFlow,
        presentation: this.#presentation,
        createLocalPhases: () => this.createLocalPhases(),
        random: this.#random,
      });
      const registry = createSlotOperationHandlerRegistry();
      registerSlotRoundProfileOperationHandlers({ registry, target });
      this.#coordinator = createSlotOperationCoordinator({
        registry,
        cleanup: (reason) => target.cleanup(reason),
      });
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
      if (this.#coordinator?.isRunning())
        throw new SceneLayoutError(
          "Configured scene-layout round is already in progress.",
        );
      const runtime = this.requireRuntime();
      const geometry = this.#resource.manifest.reels.main;
      if (!geometry)
        throw new SceneLayoutError("Scene layout has no reels.main.");
      const symbolResource = getInitialSceneLayoutSymbolPackageResource(
        this.#resource,
      );
      const symbolCodes = Object.fromEntries(
        symbolResource.displaySymbols.map((symbol) => {
          const code = symbolResource.gameConfig.getSymbolCode(symbol);
          if (code === undefined)
            throw new SceneLayoutError(
              `Active symbol package has no code for "${symbol}".`,
            );
          return [symbol, code];
        }),
      );
      const plan = compileConfiguredSlotRoundOperationPlanV2(
        this.#roundFlow,
        logic,
        {
          symbolCodes,
          columns: geometry.columns,
          rows: geometry.rows,
        },
        { includeCompletion: false },
      );
      const completion = this.requireCoordinator().start(plan);
      return completion.then(() => {
        if (this.#presentation.flow.popup.enabled && logic.getTotalWin() > 0)
          runtime.startAwardCelebrationForCurrentMode({
            betAmountRaw: logic.getBet() * logic.getLines(),
            winAmountRaw: logic.getTotalWin(),
          });
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
    this.#coordinator?.destroy();
    this.#coordinator = null;
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
      const deltaSeconds = Math.max(0, app.ticker.deltaMS / 1000);
      const coordinator = this.#coordinator;
      if (coordinator?.isRunning()) coordinator.update(deltaSeconds);
      else runtime.update(deltaSeconds);
    } catch (error) {
      this.#coordinator?.cleanup("execution-failure");
    }
  };

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

  private requireCoordinator(): ReturnType<
    typeof createSlotOperationCoordinator
  > {
    if (!this.#coordinator)
      throw new SceneLayoutError(
        "Configured scene-layout adapter has no round coordinator.",
      );
    return this.#coordinator;
  }

  private assertAlive(): void {
    if (this.#destroyed)
      throw new SceneLayoutError(
        "Configured scene-layout adapter is destroyed.",
      );
  }
}

class ConfiguredRoundTarget {
  readonly capabilities: ReadonlySet<SlotRoundCapability>;
  readonly #runtime: SceneLayoutPackageRuntime;
  readonly #symbolResource: SymbolPackageResource;
  readonly #roundFlow: SlotRoundFlowProfileV1;
  readonly #presentation: SlotTemplatePresentationProfileV1;
  readonly #createLocalPhases: () => readonly number[];
  readonly #random: () => number;
  readonly #cascadePlayer: SymbolCascadePlayer | null;
  #playerStep: SlotRoundWinStepPlan | null = null;
  #win: {
    readonly step: SlotRoundWinStepPlan;
    phase: "emphasis" | "remove";
    elapsedSeconds: number;
    removal?: {
      readonly controller: AbortController;
      completed: boolean;
      error: unknown;
    };
  } | null = null;
  #dropdown: SlotRoundDropdownStepPlan | null = null;
  #refill: SlotRoundRefillStepPlan | null = null;

  constructor(options: {
    readonly runtime: SceneLayoutPackageRuntime;
    readonly symbolResource: SymbolPackageResource;
    readonly roundFlow: SlotRoundFlowProfileV1;
    readonly presentation: SlotTemplatePresentationProfileV1;
    readonly createLocalPhases: () => readonly number[];
    readonly random: () => number;
  }) {
    this.#runtime = options.runtime;
    this.#symbolResource = options.symbolResource;
    this.#roundFlow = options.roundFlow;
    this.#presentation = options.presentation;
    this.#createLocalPhases = options.createLocalPhases;
    this.#random = options.random;
    this.capabilities = new Set([
      "spin",
      "visible-symbol-states",
      "remove",
      "dropdown",
      "refill",
      ...(options.presentation.flow.version === 2
        ? (["sequential-collect"] as const)
        : []),
    ]);
    this.#cascadePlayer =
      options.presentation.flow.version === 2
        ? this.createCascadePlayer(options.presentation.flow)
        : null;
  }

  cleanup(
    reason:
      | "next-spin"
      | "compile-failure"
      | "execution-failure"
      | "fatal"
      | "destroy",
  ): void {
    this.#win?.removal?.controller.abort();
    if (reason === "destroy") this.#cascadePlayer?.destroy();
    else this.#cascadePlayer?.clear();
    this.#playerStep = null;
    this.#win = null;
    this.#dropdown = null;
    this.#refill = null;
    this.#runtime.clearMainReelSymbolDimming();
    this.#runtime.dismissActiveAwardCelebrationImmediately();
  }

  startInitialSpin(snapshot: SlotOperationSnapshot): void {
    this.#runtime.spinMainReelToScene({
      scene: snapshot.scene,
      presentationValues: toPresentationValues(snapshot.values),
      localPhaseYs: this.#createLocalPhases(),
      random: this.#random,
    });
  }

  isInitialSpinComplete(): boolean {
    return !this.#runtime.isMainReelSpinning();
  }

  startWin(step: SlotRoundWinStepPlan): void {
    if (this.#cascadePlayer) {
      this.#playerStep = step;
      const prepared = this.#cascadePlayer.prepare(
        step.groups.map(toSymbolCascadeGroup),
      );
      this.#win = { step, phase: "emphasis", elapsedSeconds: 0 };
      this.#cascadePlayer.start(prepared);
      return;
    }
    const positions = step.groups.flatMap((group) => group.positions);
    this.#runtime.setMainReelSymbolDimming(
      positions,
      this.#presentation.flow.dimmingAlpha,
    );
    this.#runtime.requestMainReelSymbolStates(
      positions,
      this.#presentation.flow.symbolStates.win,
    );
    this.#win = { step, phase: "emphasis", elapsedSeconds: 0 };
  }

  updateWin(deltaSeconds: number): { readonly completed: boolean } {
    const active = this.#win;
    if (!active)
      throw new SceneLayoutError("No configured win step is active.");
    if (this.#cascadePlayer) {
      const result = this.#cascadePlayer.update(deltaSeconds);
      if (result.completed) {
        this.#win = null;
        this.#playerStep = null;
      }
      return result;
    }
    active.elapsedSeconds += deltaSeconds;
    if (active.phase === "emphasis") {
      const total =
        (this.#presentation.flow.cascade.emphasisFadeInMs +
          this.#presentation.flow.cascade.emphasisHoldMs +
          this.#presentation.flow.cascade.emphasisFadeOutMs) /
        1000;
      if (
        active.elapsedSeconds < total ||
        hasPendingOnce(
          this.#runtime,
          active.step.groups.flatMap((g) => g.positions),
        )
      )
        return { completed: false };
      this.#runtime.clearMainReelSymbolDimming();
      const releasePositions = active.step.groups.flatMap(
        (group) => group.removePositions,
      );
      if (releasePositions.length === 0) {
        this.#win = null;
        return { completed: true };
      }
      const controller = new AbortController();
      const removal = {
        controller,
        completed: false,
        error: undefined as unknown,
      };
      active.removal = removal;
      void this.#runtime
        .removeMainReelSymbols({
          positions: releasePositions,
          state: this.#presentation.flow.symbolStates.remove,
          playback: { completion: "once-complete" },
          signal: controller.signal,
          onComplete: () => {
            removal.completed = true;
          },
        })
        .catch((error: unknown) => {
          removal.error = error;
        });
      active.phase = "remove";
      return { completed: false };
    }
    if (!active.removal)
      throw new SceneLayoutError("Configured terminal removal is missing.");
    if (active.removal.error !== undefined) throw active.removal.error;
    if (!active.removal.completed) return { completed: false };
    this.#win = null;
    return { completed: true };
  }

  startDropdown(step: SlotRoundDropdownStepPlan): void {
    this.#dropdown = step;
    this.#runtime.startMainReelCascadeDrop(
      createRendererMovementPlan(step, this.#presentation),
    );
  }

  isDropdownComplete(): boolean {
    if (!this.#dropdown)
      throw new SceneLayoutError("No configured dropdown step is active.");
    if (this.#runtime.isMainReelSpinning()) return false;
    this.#dropdown = null;
    return true;
  }

  startRefill(step: SlotRoundRefillStepPlan): void {
    this.#refill = step;
    this.#runtime.startMainReelCascadeDrop(
      createRendererMovementPlan(step, this.#presentation),
    );
  }

  isRefillComplete(): boolean {
    if (!this.#refill)
      throw new SceneLayoutError("No configured refill step is active.");
    if (this.#runtime.isMainReelSpinning()) return false;
    this.#refill = null;
    return true;
  }

  update(deltaSeconds: number): void {
    if (this.#cascadePlayer && this.#win) return;
    this.#runtime.update(deltaSeconds);
  }

  private createCascadePlayer(
    flow: Extract<
      SlotTemplatePresentationProfileV1["flow"],
      { readonly version: 2 }
    >,
  ): SymbolCascadePlayer {
    const reel = this.#runtime.getReelPresentation("main");
    const player = createSymbolCascadePlayer({
      target: reel as unknown as SymbolCascadeTarget,
      formatAmount: (amount) => formatConfiguredCents(amount, flow),
      amountText: flow.collect.amountText,
      emphasisSeconds: flow.cascade.emphasisHoldMs / 1000,
      dimmingInSeconds: flow.cascade.emphasisFadeInMs / 1000,
      dimmingOutSeconds: flow.cascade.emphasisFadeOutMs / 1000,
      nonWinningDimmingAlpha: flow.dimmingAlpha,
      startPresentationsWithEmphasis:
        flow.collect.startPresentationsWithEmphasis,
      winSummaryCollect: {
        presentations: createSymbolCascadeWinPresentationMapFromManifest({
          manifest: this.#symbolResource.rawSymbolManifest,
          displaySymbols: this.#symbolResource.displaySymbols,
        }),
        resolveGroupSymbol: (context) => this.resolveGroupSymbol(context),
        resolveSymbol: (context) => this.resolvePositionSymbol(context),
        allowCompanionPosition: ({ symbol }) =>
          this.#roundFlow.cascade?.symbols.sequentialWinCompanionSymbols.includes(
            symbol,
          ) === true,
        resolveGroupAmount: ({ group }) => group.amount,
        resolveItemAmount: (context) => this.resolveItemCashAmount(context),
        sortItems: (items) =>
          Object.freeze(
            [...items].sort(
              (left, right) =>
                left.position.y - right.position.y ||
                left.position.x - right.position.x,
            ),
          ),
        formatter: (amount) => formatConfiguredCents(amount, flow),
        countDurationSeconds: flow.collect.summary.countDurationSeconds,
        sequentialCollectStartIntervalSeconds:
          flow.collect.summary.startIntervalSeconds,
        position: flow.collect.summary.position,
        textStyle: flow.collect.summary.textStyle,
      },
    });
    player.container.position.set(reel.position.x, reel.position.y);
    this.#runtime.container.addChild(player.container);
    return player;
  }

  private resolveGroupSymbol(context: SymbolCascadeGroupContext): string {
    return this.resolveResultSymbol(
      context.group.result,
      context.group.resultIndex,
    );
  }

  private resolveResultSymbol(result: unknown, resultIndex: number): string {
    const code = (result as { readonly symbol?: unknown }).symbol;
    if (!Number.isSafeInteger(code) || (code as number) < 0)
      throw new SceneLayoutError(
        `Configured round result[${resultIndex}].symbol must be a non-negative safe integer.`,
      );
    const symbol = this.#symbolResource.gameConfig.getPaytableEntry(
      code as number,
    )?.symbol;
    if (!symbol)
      throw new SceneLayoutError(
        `Configured round result[${resultIndex}] symbol code ${String(code)} is not in the active symbol package.`,
      );
    return symbol;
  }

  private resolvePositionSymbol(
    context: SymbolCascadeGroupPositionContext,
  ): string {
    return requirePlanOccurrence(
      this.requirePlayerStep().input,
      context.position,
    ).symbol;
  }

  private resolveItemCashAmount(
    context: SymbolCascadeGroupPositionContext,
  ): number {
    const occurrence = requirePlanOccurrence(
      this.requirePlayerStep().input,
      context.position,
    );
    return resolveConfiguredCollectCashShare({
      group: context.group,
      itemValue: occurrence.value,
      amount: this.#roundFlow.cascade?.amount,
    });
  }

  private requirePlayerStep(): SlotRoundWinStepPlan {
    if (!this.#playerStep)
      throw new SceneLayoutError("Configured collect step is not active.");
    return this.#playerStep;
  }
}

function requirePlanOccurrence(
  snapshot: SlotRoundOccurrenceSnapshot,
  position: { readonly x: number; readonly y: number },
) {
  const occurrence = snapshot.occurrences.find(
    (candidate) =>
      candidate.position.x === position.x &&
      candidate.position.y === position.y,
  );
  if (!occurrence)
    throw new SceneLayoutError(
      `Configured round has no occurrence at (${position.x},${position.y}).`,
    );
  return occurrence;
}

function toSymbolCascadeGroup(
  group: SlotRoundWinGroupPlan,
): SymbolCascadeGroup {
  return Object.freeze({
    componentName: group.componentName,
    stepIndex: group.stepIndex,
    resultIndex: group.resultIndex,
    result: group.result,
    positions: group.positions,
    amount: group.amount,
    removePositions: group.removePositions,
  });
}

function resolveConfiguredCollectCashShare(options: {
  readonly group: Pick<SymbolCascadeGroup, "result" | "resultIndex" | "amount">;
  readonly itemValue: number | null;
  readonly amount: SlotRoundFlowProfileV1["amount"] | undefined;
}): number {
  const coinFields = options.amount?.coinFields;
  if (!coinFields || coinFields.length === 0)
    throw new SceneLayoutError(
      "Configured sequential collect requires explicit coinFields.",
    );
  const field = coinFields.find(
    (candidate) => options.group.result[candidate] !== undefined,
  );
  if (!field)
    throw new SceneLayoutError(
      `Configured collect result[${options.group.resultIndex}] has no selected coin amount.`,
    );
  const coinAmount = options.group.result[field];
  if (
    typeof coinAmount !== "number" ||
    !Number.isSafeInteger(coinAmount) ||
    coinAmount <= 0
  )
    throw new SceneLayoutError(
      `Configured collect result[${options.group.resultIndex}].${field} must be a positive safe integer.`,
    );
  const itemValue = options.itemValue;
  if (
    typeof itemValue !== "number" ||
    !Number.isSafeInteger(itemValue) ||
    itemValue <= 0
  )
    throw new SceneLayoutError(
      "Configured collect item value must be a positive safe integer.",
    );
  const weighted = itemValue * options.group.amount;
  if (!Number.isSafeInteger(weighted) || weighted % coinAmount !== 0)
    throw new SceneLayoutError(
      "Configured collect item cash share must divide the group cash amount exactly.",
    );
  const share = weighted / coinAmount;
  if (!Number.isSafeInteger(share) || share <= 0)
    throw new SceneLayoutError(
      "Configured collect item cash share must be a positive safe integer.",
    );
  return share;
}

function formatConfiguredCents(
  amount: number,
  flow: Extract<
    SlotTemplatePresentationProfileV1["flow"],
    { readonly version: 2 }
  >,
): string {
  if (!Number.isSafeInteger(amount) || amount <= 0)
    throw new SceneLayoutError(
      "Configured collect cash amount must be a positive safe integer.",
    );
  return `${flow.collect.formatter.prefix}${(amount / 100).toFixed(2)}`;
}

function hasPendingOnce(
  runtime: SceneLayoutPackageRuntime,
  positions: readonly { readonly x: number; readonly y: number }[],
): boolean {
  return (
    positions.length > 0 &&
    runtime
      .getMainReelSymbolStateSnapshots(uniquePositions(positions))
      .some((snapshot) => snapshot.isOnce)
  );
}

function uniquePositions(
  positions: readonly { readonly x: number; readonly y: number }[],
): readonly { readonly x: number; readonly y: number }[] {
  const seen = new Set<string>();
  return Object.freeze(
    positions.filter((position) => {
      const key = `${position.x},${position.y}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }),
  );
}

function createRendererMovementPlan(
  step: SlotRoundDropdownStepPlan | SlotRoundRefillStepPlan,
  presentation: SlotTemplatePresentationProfileV1,
): GridCellCascadeDropPlan {
  const timing = presentation.flow.cascade;
  const movements: GridCellCascadeDropMovement[] = step.movements.map(
    (movement) => {
      const rows = Math.max(1, movement.target.y - movement.source.y);
      const fallSeconds = Math.min(
        timing.maxFallSeconds,
        timing.baseFallSeconds + rows * timing.perRowFallSeconds,
      );
      const common = {
        x: movement.target.x,
        sourceY: movement.source.y,
        targetY: movement.target.y,
        startSeconds: 0,
        fallSeconds,
        settleSeconds: timing.settleSeconds,
        overshootPixels: 0,
      };
      return Object.freeze(
        movement.kind === "refill"
          ? {
              kind: movement.kind,
              ...common,
              outputCode: movement.code,
              outputPresentationValue: movement.value,
            }
          : { kind: movement.kind, ...common },
      );
    },
  );
  const totalSeconds = movements.reduce(
    (maximum, movement) =>
      Math.max(
        maximum,
        movement.startSeconds + movement.fallSeconds + movement.settleSeconds,
      ),
    0,
  );
  return Object.freeze({
    columns: step.input.scene.length,
    rows: step.input.scene[0]?.length ?? 0,
    movements: Object.freeze(movements),
    valueCommits: Object.freeze(
      step.output.scene.flatMap((column, x) =>
        column.flatMap((code, y) =>
          code === -1
            ? []
            : [
                Object.freeze({
                  x,
                  y,
                  presentationValue: step.output.values[x]![y] as number | null,
                }),
              ],
        ),
      ),
    ),
    totalSeconds,
  });
}

function toPresentationValues(
  values: readonly (readonly (number | null | -1)[])[],
): readonly (readonly (number | null)[])[] {
  return Object.freeze(
    values.map((column) =>
      Object.freeze(column.map((value) => (value === -1 ? null : value))),
    ),
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
