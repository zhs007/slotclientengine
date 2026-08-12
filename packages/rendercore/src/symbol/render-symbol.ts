import { Container, Sprite, Texture } from "pixi.js";
import { VisualEntity } from "@slotclientengine/pixiani/core";
import { assertValidDeltaSeconds, resetBaseDisplay } from "./ani.js";
import { assertResolvedSymbolAni } from "./animation-resolver.js";
import { SymbolAnimationError } from "./errors.js";
import { SymbolStateMachine } from "./state-machine.js";
import { destroyVniSymbolAnimationCache } from "./vni-animation.js";
import type {
  RenderSymbolOptions,
  RenderSymbolUpdateResult,
  SymbolAni,
  SymbolAnimationContext,
  SymbolNormalTextureSource,
  SymbolStateId,
  SymbolStatePlaybackCompletion,
  SymbolStatePlaybackOptions,
  SymbolStateSnapshot,
  SymbolStateTransitionMode,
  SymbolVisualLayer,
  RenderSymbolValueController,
  RenderSymbolImageStringController,
} from "./types.js";
import type { SymbolManifestAnimationPlaybackSpec } from "./manifest.js";

interface ActiveSymbolStatePlayback {
  readonly id: number;
  readonly requestedState: SymbolStateId;
  readonly resolvedState: SymbolStateId;
  readonly completion: SymbolStatePlaybackCompletion;
  readonly resolve: () => void;
  readonly reject: (error: Error) => void;
  readonly signal?: AbortSignal;
  readonly abortListener?: () => void;
  readonly terminalComplete?: () => void;
  entered: boolean;
}

export class RenderSymbol extends VisualEntity<void> {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly texture: Texture;
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures: readonly SymbolStateId[];
  readonly sprite: Sprite;
  readonly underlayLayer: Container;
  readonly gameUnderlayLayer: Container;
  readonly baseLayer: Container;
  readonly layers: readonly SymbolVisualLayer[];
  readonly stateSprite: Sprite;
  readonly overlayLayer: Container;
  readonly imageStringOverlayLayer: Container;
  readonly gameOverlayLayer: Container;
  readonly normalSource: SymbolNormalTextureSource<Texture>;
  readonly renderPriority: number;
  readonly #stateMachine: SymbolStateMachine;
  readonly #animationResolver: RenderSymbolOptions["animationResolver"];
  readonly #valueController: RenderSymbolValueController | null;
  readonly #imageStringController: RenderSymbolImageStringController | null;
  readonly #landingAppearEnabled: boolean;
  readonly #animationCapabilities: ReadonlySet<SymbolStateId>;
  #currentAni: SymbolAni;
  #lastAniKey: string;
  #defaultScaleX = 1;
  #defaultScaleY = 1;
  #presentationValue: number | null = null;
  #loopCompletionCount = 0;
  #onceCompletionCount = 0;
  #playbackSequence = 0;
  #activePlayback: ActiveSymbolStatePlayback | null = null;
  #destroyed = false;

  constructor(options: RenderSymbolOptions) {
    super();
    this.code = options.definition.code;
    this.symbol = options.definition.symbol;
    this.pays = Object.freeze([...options.definition.pays]);
    this.normalSource = normalizeRenderSymbolNormalSource(options.texture);
    this.texture =
      this.normalSource.kind === "single"
        ? this.normalSource.texture
        : this.normalSource.kind === "transparent"
          ? Texture.EMPTY
          : this.normalSource.layers[0].texture;
    this.stateTextures = Object.freeze({ ...(options.stateTextures ?? {}) });
    this.requiredStateTextures = Object.freeze([
      ...(options.requiredStateTextures ?? []),
    ]);
    this.renderPriority = normalizeRenderPriority(
      options.renderPriority ?? 0,
      this.symbol,
    );
    this.underlayLayer = new Container();
    this.gameUnderlayLayer = new Container();
    this.baseLayer = new Container();
    this.layers = Object.freeze(createVisualLayers(this.normalSource));
    this.sprite = this.layers[0].sprite;
    this.stateSprite = new Sprite(this.texture);
    this.overlayLayer = new Container();
    this.imageStringOverlayLayer = new Container();
    this.gameOverlayLayer = new Container();
    this.#stateMachine = new SymbolStateMachine(options.definition);
    this.#animationResolver = options.animationResolver;
    this.#landingAppearEnabled = options.landingAppearEnabled ?? false;
    this.#animationCapabilities = new Set(options.animationCapabilities ?? []);

    this.stateSprite.anchor.set(0.5);
    this.stateSprite.visible = false;
    this.baseLayer.addChild(...this.layers.map((layer) => layer.sprite));
    this.addChild(
      this.underlayLayer,
      this.gameUnderlayLayer,
      this.baseLayer,
      this.stateSprite,
      this.overlayLayer,
      this.imageStringOverlayLayer,
      this.gameOverlayLayer,
    );
    this.#valueController = options.valueControllerFactory?.(this) ?? null;
    this.#imageStringController =
      options.imageStringControllerFactory?.(this) ?? null;

    this.#lastAniKey = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#currentAni = this.createCurrentAni();
    this.#currentAni.reset();
    this.#imageStringController?.syncState(
      this.getImageStringPresentationState(this.#stateMachine.getSnapshot()),
    );
    this.#valueController?.syncState(
      this.getImageStringPresentationState(this.#stateMachine.getSnapshot()),
    );
  }

  init(): void {
    this.beginLifecycle();
    this.#defaultScaleX = this.scale.x;
    this.#defaultScaleY = this.scale.y;
    this.reset();
  }

  getStateSnapshot(): SymbolStateSnapshot {
    return this.#stateMachine.getSnapshot();
  }

  getAnimationCompletionSnapshot(): Readonly<{
    loopCompletionCount: number;
    onceCompletionCount: number;
  }> {
    this.assertNotDestroyed();
    return Object.freeze({
      loopCompletionCount: this.#loopCompletionCount,
      onceCompletionCount: this.#onceCompletionCount,
    });
  }

  getMainSprite(): Sprite {
    return this.sprite;
  }

  getUnderlayLayer(): Container {
    return this.underlayLayer;
  }

  getGameUnderlayLayer(): Container {
    this.assertNotDestroyed();
    return this.gameUnderlayLayer;
  }

  getGameOverlayLayer(): Container {
    this.assertNotDestroyed();
    return this.gameOverlayLayer;
  }

  getLayerSprites(): readonly SymbolVisualLayer[] {
    return Object.freeze([...this.layers]);
  }

  getBaseLayer(): Container {
    return this.baseLayer;
  }

  getStateSprite(): Sprite {
    return this.stateSprite;
  }

  setDefaultState(state: string): void {
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#stateMachine.setDefaultState(state);
    this.syncAniIfNeeded(before, false);
  }

  requestState(
    state: string,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    this.cancelActivePlayback(
      new SymbolAnimationError(
        `Render symbol "${this.symbol}" state playback was superseded by requestState("${state}").`,
      ),
    );
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#stateMachine.requestState(state, transitionMode);
    const stateChanged = this.syncAniIfNeeded(before);
    const current = this.#stateMachine.getSnapshot();
    if (
      !stateChanged &&
      current.resolvedState === this.#stateMachine.resolveState(state) &&
      this.#stateMachine.getCurrentStateDefinition().playback === "once"
    ) {
      this.#currentAni.reset();
    }
  }

  validateStateRequest(
    state: SymbolStateId,
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): void {
    this.assertNotDestroyed();
    if (transitionMode !== "boundary" && transitionMode !== "immediate")
      throw new SymbolAnimationError(
        `Unknown symbol state transition mode "${String(transitionMode)}".`,
      );
    this.#stateMachine.resolveState(state);
  }

  validateStatePlayback(
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): void {
    this.assertNotDestroyed();
    if (this.#activePlayback) {
      throw new SymbolAnimationError(
        `Render symbol "${this.symbol}" already has an active state playback.`,
      );
    }
    const transitionMode = options.transitionMode ?? "boundary";
    if (transitionMode !== "boundary" && transitionMode !== "immediate") {
      throw new SymbolAnimationError(
        `Unknown symbol state transition mode "${String(transitionMode)}".`,
      );
    }
    if (
      options.completion !== "entered" &&
      options.completion !== "once-complete" &&
      options.completion !== "next-loop-complete"
    ) {
      throw new SymbolAnimationError(
        `Unknown symbol state playback completion "${String(options.completion)}".`,
      );
    }
    const resolvedState = this.#stateMachine.resolveState(state);
    const playback =
      this.#stateMachine.getStateDefinition(resolvedState).playback;
    if (options.completion === "once-complete" && playback !== "once") {
      throw new SymbolAnimationError(
        `Symbol state "${state}" resolves to playback "${playback}", expected "once" for once-complete.`,
      );
    }
    if (options.completion === "next-loop-complete" && playback !== "loop") {
      throw new SymbolAnimationError(
        `Symbol state "${state}" resolves to playback "${playback}", expected "loop" for next-loop-complete.`,
      );
    }
    const current = this.#stateMachine.getSnapshot();
    if (
      transitionMode === "boundary" &&
      current.isOnce &&
      current.requestedState !== state
    ) {
      throw new SymbolAnimationError(
        `Cannot await boundary transition to symbol state "${state}" while once state "${current.requestedState}" is active.`,
      );
    }
    if (options.signal?.aborted) {
      throw toPlaybackError(
        options.signal.reason,
        `Render symbol "${this.symbol}" state playback was aborted before it started.`,
      );
    }
  }

  playState(
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
  ): Promise<void> {
    this.validateStatePlayback(state, options);
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#stateMachine.requestState(
      state,
      options.transitionMode ?? "boundary",
    );
    const stateChanged = this.syncAniIfNeeded(before);
    const current = this.#stateMachine.getSnapshot();
    if (
      !stateChanged &&
      current.resolvedState === this.#stateMachine.resolveState(state) &&
      this.#stateMachine.getCurrentStateDefinition().playback === "once"
    ) {
      this.#currentAni.reset();
    }

    let resolve!: () => void;
    let reject!: (error: Error) => void;
    const promise = new Promise<void>((resolvePromise, rejectPromise) => {
      resolve = resolvePromise;
      reject = rejectPromise;
    });
    const id = ++this.#playbackSequence;
    const abortListener = options.signal
      ? () => {
          if (this.#activePlayback?.id !== id) return;
          this.cancelActivePlayback(
            toPlaybackError(
              options.signal?.reason,
              `Render symbol "${this.symbol}" state playback was aborted.`,
            ),
          );
        }
      : undefined;
    this.#activePlayback = {
      id,
      requestedState: state,
      resolvedState: this.#stateMachine.resolveState(state),
      completion: options.completion,
      resolve,
      reject,
      ...(options.signal ? { signal: options.signal } : {}),
      ...(abortListener ? { abortListener } : {}),
      entered: false,
    };
    options.signal?.addEventListener("abort", abortListener!, { once: true });
    this.markActivePlaybackEntered(this.#stateMachine.getSnapshot());
    return promise;
  }

  playTerminalState(
    state: SymbolStateId,
    options: SymbolStatePlaybackOptions,
    terminalComplete: () => void,
  ): Promise<void> {
    if (typeof terminalComplete !== "function") {
      throw new SymbolAnimationError(
        `Render symbol "${this.symbol}" terminal completion must be a function.`,
      );
    }
    const definition = this.#stateMachine.getStateDefinition(
      this.#stateMachine.resolveState(state),
    );
    if (
      options.completion !== "once-complete" ||
      definition.afterComplete !== "terminal"
    ) {
      throw new SymbolAnimationError(
        `Symbol state "${state}" terminal playback requires once-complete and afterComplete "terminal".`,
      );
    }
    const promise = this.playState(state, options);
    if (!this.#activePlayback) {
      throw new SymbolAnimationError(
        `Render symbol "${this.symbol}" terminal playback did not start.`,
      );
    }
    this.#activePlayback = {
      ...this.#activePlayback,
      terminalComplete,
    };
    return promise;
  }

  hasTerminalState(state: SymbolStateId): boolean {
    this.assertNotDestroyed();
    const resolved = this.#stateMachine.resolveState(state);
    return (
      this.#stateMachine.getStateDefinition(resolved).afterComplete ===
      "terminal"
    );
  }

  returnToDefaultState(): void {
    this.assertNotDestroyed();
    this.cancelActivePlayback(
      new SymbolAnimationError(
        `Render symbol "${this.symbol}" state playback was interrupted by returnToDefaultState().`,
      ),
    );
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#stateMachine.reset();
    this.syncAniIfNeeded(before);
  }

  hasAnimationCapability(state: SymbolStateId): boolean {
    return this.#animationCapabilities.has(state);
  }

  createActiveSpineAnimation(
    context: SymbolAnimationContext,
    playback?: SymbolManifestAnimationPlaybackSpec,
  ): SymbolAni | null {
    return (
      this.#valueController?.createActiveSpineAnimation(context, playback) ??
      null
    );
  }

  setPresentationValue(value: number | null): void {
    this.assertNotDestroyed();
    if (value !== null && (!Number.isSafeInteger(value) || value <= 0)) {
      throw new Error(
        "Render symbol presentation value must be a positive safe integer or null.",
      );
    }
    const previous = this.#presentationValue;
    if (this.#valueController) {
      try {
        this.#valueController.setValue(value);
      } finally {
        this.#presentationValue = this.#valueController.getValue();
      }
    } else {
      this.#presentationValue = value;
    }
    if (this.#valueController && previous !== value) {
      const before = this.#lastAniKey;
      this.#lastAniKey = "";
      this.syncAniIfNeeded(before, false);
    }
  }

  getPresentationValue(): number | null {
    return this.#presentationValue;
  }

  getImageStringNodeNames(): readonly string[] {
    this.assertNotDestroyed();
    return this.#imageStringController?.getNodeNames() ?? Object.freeze([]);
  }

  setImageStringText(name: string, text: string): void {
    this.assertNotDestroyed();
    if (!this.#imageStringController) {
      throw new SymbolAnimationError(
        `Render symbol "${this.symbol}" has no image-string node named "${name}".`,
      );
    }
    this.#imageStringController.setText(name, text);
  }

  getImageStringText(name: string): string {
    this.assertNotDestroyed();
    if (!this.#imageStringController) {
      throw new SymbolAnimationError(
        `Render symbol "${this.symbol}" has no image-string node named "${name}".`,
      );
    }
    return this.#imageStringController.getText(name);
  }

  requestLandingAppear(
    transitionMode: SymbolStateTransitionMode = "boundary",
  ): boolean {
    this.assertNotDestroyed();
    if (!this.#landingAppearEnabled) return false;
    this.requestState("appear", transitionMode);
    return true;
  }

  isLandingAppearActive(): boolean {
    if (!this.#landingAppearEnabled) return false;
    return this.#stateMachine.getSnapshot().resolvedState === "appear";
  }

  update(deltaSeconds: number): RenderSymbolUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    try {
      const beforeSnapshot = this.#stateMachine.getSnapshot();
      const before = this.createAniKey(beforeSnapshot);
      const aniResult = this.#currentAni.update(deltaSeconds);
      if (aniResult.loopCompleted) {
        this.#loopCompletionCount += 1;
        this.#stateMachine.notifyLoopComplete();
      }
      if (aniResult.onceCompleted) {
        this.#onceCompletionCount += 1;
        const terminal = this.completeActiveTerminalPlayback(beforeSnapshot);
        if (terminal) {
          const snapshot = this.#stateMachine.getSnapshot();
          return Object.freeze({
            requestedState: snapshot.requestedState,
            resolvedState: snapshot.resolvedState,
            loopCompleted: aniResult.loopCompleted,
            onceCompleted: true,
            stateChanged: false,
          });
        }
        this.#stateMachine.notifyOnceComplete();
      }

      const stateChanged = this.syncAniIfNeeded(before);
      const snapshot = this.#stateMachine.getSnapshot();
      this.advanceActivePlayback(beforeSnapshot, snapshot, aniResult);

      return Object.freeze({
        requestedState: snapshot.requestedState,
        resolvedState: snapshot.resolvedState,
        loopCompleted: aniResult.loopCompleted,
        onceCompleted: aniResult.onceCompleted,
        stateChanged,
      });
    } catch (error) {
      this.cancelActivePlayback(
        toPlaybackError(
          error,
          `Render symbol "${this.symbol}" state playback failed during update.`,
        ),
      );
      throw error;
    }
  }

  reset(): void {
    this.assertNotDestroyed();
    this.cancelActivePlayback(
      new SymbolAnimationError(
        `Render symbol "${this.symbol}" state playback was interrupted by reset().`,
      ),
    );
    this.#loopCompletionCount = 0;
    this.#onceCompletionCount = 0;
    this.#stateMachine.reset();
    resetBaseDisplay(this.createAnimationContext());
    const before = this.#lastAniKey;
    this.#lastAniKey = "";
    this.syncAniIfNeeded(before, false);
  }

  resetForPoolRelease(): void {
    this.assertNotDestroyed();
    this.cancelActivePlayback(
      new SymbolAnimationError(
        `Render symbol "${this.symbol}" state playback was interrupted by pool release.`,
      ),
    );
    this.#loopCompletionCount = 0;
    this.#onceCompletionCount = 0;
    this.#currentAni.destroy?.();
    this.#valueController?.resetForPoolRelease();
    this.#imageStringController?.resetForPoolRelease();
    this.#presentationValue = null;
    this.gameUnderlayLayer.removeChildren();
    this.gameOverlayLayer.removeChildren();
    this.#stateMachine.reset();
    this.#lastAniKey = "";
    this.#currentAni = createReleasedSymbolAni();
    resetBaseDisplay(this.createAnimationContext());
    this.visible = true;
    this.renderable = true;
    this.alpha = 1;
    this.position.set(0);
    this.scale.set(this.#defaultScaleX, this.#defaultScaleY);
    this.rotation = 0;
    this.pivot.set(0);
    this.mask = null;
    this.filters = null;
    this.zIndex = 0;
  }

  override destroy(options?: Parameters<Container["destroy"]>[0]): void {
    if (this.#destroyed) {
      return;
    }
    this.cancelActivePlayback(
      new SymbolAnimationError(
        `Render symbol "${this.symbol}" state playback was interrupted by destroy().`,
      ),
    );
    this.#destroyed = true;
    this.#currentAni.destroy?.();
    this.#valueController?.destroy();
    this.#imageStringController?.destroy();
    // Game attachments are borrowed. Detach them before Container.destroy()
    // processes RenderSymbol-owned children.
    this.gameUnderlayLayer.removeChildren();
    this.gameOverlayLayer.removeChildren();
    destroyVniSymbolAnimationCache(this);
    super.destroy(options);
  }

  private syncAniIfNeeded(
    previousKey: string,
    preserveEquivalentTimeline = true,
  ): boolean {
    const snapshot = this.#stateMachine.getSnapshot();
    const nextKey = this.createAniKey(snapshot);
    if (nextKey === previousKey && nextKey === this.#lastAniKey) {
      return false;
    }

    const nextAni = this.createCurrentAni();
    const previousAni = this.#currentAni;
    this.#lastAniKey = nextKey;
    if (
      preserveEquivalentTimeline &&
      previousAni.continuityKey !== undefined &&
      nextAni.continuityKey === previousAni.continuityKey
    ) {
      // The semantic state changed, but both states resolve to the same live
      // animation. Keep the current player and timeline instead of resetting
      // an equivalent animation (for example normal Loop -> dropdown Loop).
      previousAni.adoptContinuation?.(nextAni);
      nextAni.destroy?.();
      this.#imageStringController?.syncState(
        this.getImageStringPresentationState(snapshot),
      );
      this.#valueController?.syncState(
        this.getImageStringPresentationState(snapshot),
      );
      return false;
    }
    this.#currentAni = nextAni;
    this.#imageStringController?.syncState(
      this.getImageStringPresentationState(snapshot),
    );
    this.#valueController?.syncState(
      this.getImageStringPresentationState(snapshot),
    );
    this.#currentAni.reset();
    previousAni.destroy?.();
    return true;
  }

  private getImageStringPresentationState(
    snapshot: SymbolStateSnapshot,
  ): SymbolStateId {
    return snapshot.requestedState !== snapshot.resolvedState &&
      this.stateTextures[snapshot.requestedState]
      ? snapshot.requestedState
      : snapshot.resolvedState;
  }

  private createCurrentAni(): SymbolAni {
    const context = this.createAnimationContext();
    const active = this.#valueController?.createActiveSpineAnimation(context);
    if (active) return active;
    const ani = this.#animationResolver(context);
    assertResolvedSymbolAni(ani, context.resolvedState);
    if (ani.playback !== context.state.playback) {
      throw new SymbolAnimationError(
        `Animation resolver returned playback "${ani.playback}" for state "${context.resolvedState}", expected "${context.state.playback}".`,
      );
    }
    return ani;
  }

  private createAnimationContext(): SymbolAnimationContext {
    const snapshot = this.#stateMachine.getSnapshot();
    return Object.freeze({
      code: this.code,
      symbol: this.symbol,
      pays: this.pays,
      requestedState: snapshot.requestedState,
      resolvedState: snapshot.resolvedState,
      state: this.#stateMachine.getCurrentStateDefinition(),
      texture: this.texture,
      stateTextures: this.stateTextures,
      requiredStateTextures: this.requiredStateTextures,
      root: this,
      createActiveSpineAnimation: (
        playback?: SymbolManifestAnimationPlaybackSpec,
      ) =>
        this.#valueController?.createActiveSpineAnimation(
          this.createAnimationContextWithoutActiveFactory(),
          playback,
        ) ?? null,
      underlayLayer: this.underlayLayer,
      baseLayer: this.baseLayer,
      sprite: this.sprite,
      layers: this.layers,
      stateSprite: this.stateSprite,
      overlayLayer: this.overlayLayer,
    });
  }

  private createAniKey(snapshot: SymbolStateSnapshot): string {
    return `${snapshot.requestedState}->${snapshot.resolvedState}`;
  }

  private createAnimationContextWithoutActiveFactory(): SymbolAnimationContext {
    const snapshot = this.#stateMachine.getSnapshot();
    return Object.freeze({
      code: this.code,
      symbol: this.symbol,
      pays: this.pays,
      requestedState: snapshot.requestedState,
      resolvedState: snapshot.resolvedState,
      state: this.#stateMachine.getCurrentStateDefinition(),
      texture: this.texture,
      stateTextures: this.stateTextures,
      requiredStateTextures: this.requiredStateTextures,
      root: this,
      underlayLayer: this.underlayLayer,
      baseLayer: this.baseLayer,
      sprite: this.sprite,
      layers: this.layers,
      stateSprite: this.stateSprite,
      overlayLayer: this.overlayLayer,
    });
  }

  private advanceActivePlayback(
    before: SymbolStateSnapshot,
    after: SymbolStateSnapshot,
    result: Readonly<{ loopCompleted: boolean; onceCompleted: boolean }>,
  ): void {
    const active = this.#activePlayback;
    if (!active) return;
    const wasTarget = this.isActivePlaybackTarget(active, before);
    const enteredNow = this.markActivePlaybackEntered(after);
    if (!this.#activePlayback || enteredNow) return;
    if (!active.entered || !wasTarget) return;
    if (active.completion === "once-complete" && result.onceCompleted) {
      this.resolveActivePlayback();
    } else if (
      active.completion === "next-loop-complete" &&
      result.loopCompleted
    ) {
      this.resolveActivePlayback();
    }
  }

  private completeActiveTerminalPlayback(
    snapshot: SymbolStateSnapshot,
  ): boolean {
    const active = this.#activePlayback;
    if (
      !active?.terminalComplete ||
      active.completion !== "once-complete" ||
      !active.entered ||
      !this.isActivePlaybackTarget(active, snapshot)
    ) {
      return false;
    }
    const detached = this.detachActivePlayback();
    if (!detached) return false;
    try {
      detached.terminalComplete?.();
      detached.resolve();
    } catch (error) {
      detached.reject(
        toPlaybackError(
          error,
          `Render symbol "${this.symbol}" terminal completion failed.`,
        ),
      );
    }
    return true;
  }

  private markActivePlaybackEntered(snapshot: SymbolStateSnapshot): boolean {
    const active = this.#activePlayback;
    if (
      !active ||
      active.entered ||
      !this.isActivePlaybackTarget(active, snapshot)
    ) {
      return false;
    }
    active.entered = true;
    if (active.completion === "entered") this.resolveActivePlayback();
    return true;
  }

  private isActivePlaybackTarget(
    active: ActiveSymbolStatePlayback,
    snapshot: SymbolStateSnapshot,
  ): boolean {
    return (
      snapshot.pendingState === null &&
      snapshot.requestedState === active.requestedState &&
      snapshot.resolvedState === active.resolvedState
    );
  }

  private resolveActivePlayback(): void {
    const active = this.detachActivePlayback();
    active?.resolve();
  }

  private cancelActivePlayback(error: Error): void {
    const active = this.detachActivePlayback();
    active?.reject(error);
  }

  private detachActivePlayback(): ActiveSymbolStatePlayback | null {
    const active = this.#activePlayback;
    if (!active) return null;
    this.#activePlayback = null;
    if (active.signal && active.abortListener) {
      active.signal.removeEventListener("abort", active.abortListener);
    }
    return active;
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError(
        `Render symbol "${this.symbol}" was destroyed.`,
      );
    }
  }
}

function toPlaybackError(value: unknown, fallback: string): Error {
  return value instanceof Error ? value : new SymbolAnimationError(fallback);
}

function createReleasedSymbolAni(): SymbolAni {
  return Object.freeze({
    stateId: "__released__",
    playback: "static",
    reset: () => undefined,
    update: () =>
      Object.freeze({
        loopCompleted: false,
        onceCompleted: false,
      }),
  });
}

function normalizeRenderSymbolNormalSource(
  texture: Texture | SymbolNormalTextureSource<Texture>,
): SymbolNormalTextureSource<Texture> {
  if (isNormalSource(texture)) {
    if (texture.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture: assertTexture(texture.texture, "single normal"),
      });
    }
    if (texture.kind === "transparent") {
      return Object.freeze({
        kind: "transparent",
        width: assertPositiveDimension(texture.width, "transparent width"),
        height: assertPositiveDimension(texture.height, "transparent height"),
      });
    }
    if (texture.layers.length === 0) {
      throw new SymbolAnimationError(
        "Layered symbol normal texture must include at least one layer.",
      );
    }
    return Object.freeze({
      kind: "layered",
      layers: Object.freeze(
        [...texture.layers]
          .sort((left, right) => left.index - right.index)
          .map((layer, expectedIndex) => {
            if (layer.index !== expectedIndex) {
              throw new SymbolAnimationError(
                "Layered symbol normal texture must use consecutive indexes from 0.",
              );
            }
            const layerTexture = assertTexture(
              layer.texture,
              `layer ${layer.index}`,
            );
            const keyframes = normalizeLayerKeyframes(
              layer.index,
              layerTexture,
              layer.keyframes ?? [],
            );
            return Object.freeze({
              index: layer.index,
              texture: layerTexture,
              keyframes,
            });
          }),
      ),
    });
  }

  return Object.freeze({
    kind: "single",
    texture: assertTexture(texture, "normal"),
  });
}

function createVisualLayers(
  normalSource: SymbolNormalTextureSource<Texture>,
): SymbolVisualLayer[] {
  if (normalSource.kind === "transparent") {
    const sprite = new Sprite(Texture.EMPTY);
    sprite.anchor.set(0.5);
    sprite.alpha = 0;
    sprite.width = normalSource.width;
    sprite.height = normalSource.height;
    return [
      Object.freeze({
        index: 0,
        texture: Texture.EMPTY,
        keyframes: Object.freeze([]),
        sprite,
        transparent: true,
        width: normalSource.width,
        height: normalSource.height,
      }),
    ];
  }

  const layerSources =
    normalSource.kind === "single"
      ? [
          Object.freeze({
            index: 0,
            texture: normalSource.texture,
            keyframes: Object.freeze([]),
          }),
        ]
      : normalSource.layers;

  return layerSources.map((layer) => {
    const sprite = new Sprite(layer.texture);
    sprite.anchor.set(0.5);
    return Object.freeze({
      index: layer.index,
      texture: layer.texture,
      keyframes: layer.keyframes ?? Object.freeze([]),
      sprite,
    });
  });
}

function normalizeLayerKeyframes(
  index: number,
  texture: Texture,
  keyframes: readonly Texture[],
): readonly Texture[] {
  if (keyframes.length === 0) {
    return Object.freeze([]);
  }
  if (keyframes[0] !== texture) {
    throw new SymbolAnimationError(
      `Symbol layer ${index} keyframes must start with the layer texture.`,
    );
  }
  const width = getTextureWidth(texture);
  const height = getTextureHeight(texture);
  return Object.freeze(
    keyframes.map((keyframe, keyframeIndex) => {
      const loadedKeyframe = assertTexture(
        keyframe,
        `layer ${index} keyframe ${keyframeIndex}`,
      );
      if (
        getTextureWidth(loadedKeyframe) !== width ||
        getTextureHeight(loadedKeyframe) !== height
      ) {
        throw new SymbolAnimationError(
          `Symbol layer ${index} keyframe textures must match the layer texture dimensions.`,
        );
      }
      return loadedKeyframe;
    }),
  );
}

function isNormalSource(
  texture: Texture | SymbolNormalTextureSource<Texture>,
): texture is SymbolNormalTextureSource<Texture> {
  return (
    typeof texture === "object" &&
    texture !== null &&
    "kind" in texture &&
    (texture.kind === "single" ||
      texture.kind === "layered" ||
      texture.kind === "transparent")
  );
}

function assertTexture(texture: Texture, label: string): Texture {
  if (!texture || typeof texture !== "object") {
    throw new SymbolAnimationError(`Symbol ${label} texture must exist.`);
  }
  return texture;
}

function getTextureWidth(texture: Texture): number {
  return Math.max(
    0,
    texture.width || texture.source?.width || texture.orig?.width || 0,
  );
}

function getTextureHeight(texture: Texture): number {
  return Math.max(
    0,
    texture.height || texture.source?.height || texture.orig?.height || 0,
  );
}

function assertPositiveDimension(value: number, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new SymbolAnimationError(`Symbol ${label} must be positive.`);
  }
  return value;
}

function normalizeRenderPriority(value: number, symbol: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new SymbolAnimationError(
      `Render symbol "${symbol}" renderPriority must be a non-negative safe integer.`,
    );
  }
  return value;
}
