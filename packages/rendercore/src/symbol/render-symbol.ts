import { Container, Sprite, Texture } from "pixi.js";
import { VisualEntity } from "@slotclientengine/pixiani/core";
import { assertValidDeltaSeconds, resetBaseDisplay } from "./ani.js";
import { assertResolvedSymbolAni } from "./animation-resolver.js";
import { SymbolAnimationError } from "./errors.js";
import { SymbolStateMachine } from "./state-machine.js";
import type {
  RenderSymbolOptions,
  RenderSymbolUpdateResult,
  SymbolAni,
  SymbolAnimationContext,
  SymbolStateId,
  SymbolStateSnapshot
} from "./types.js";

export class RenderSymbol extends VisualEntity<void> {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly texture: Texture;
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures: readonly SymbolStateId[];
  readonly sprite: Sprite;
  readonly overlayLayer: Container;
  readonly #stateMachine: SymbolStateMachine;
  readonly #animationResolver: RenderSymbolOptions["animationResolver"];
  #currentAni: SymbolAni;
  #lastAniKey: string;

  constructor(options: RenderSymbolOptions) {
    super();
    this.code = options.definition.code;
    this.symbol = options.definition.symbol;
    this.pays = Object.freeze([...options.definition.pays]);
    this.texture = options.texture;
    this.stateTextures = Object.freeze({ ...(options.stateTextures ?? {}) });
    this.requiredStateTextures = Object.freeze([...(options.requiredStateTextures ?? [])]);
    this.sprite = new Sprite(options.texture);
    this.overlayLayer = new Container();
    this.#stateMachine = new SymbolStateMachine(options.definition);
    this.#animationResolver = options.animationResolver;

    this.sprite.anchor.set(0.5);
    this.addChild(this.sprite, this.overlayLayer);

    this.#lastAniKey = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#currentAni = this.createCurrentAni();
    this.#currentAni.reset();
  }

  init(): void {
    this.beginLifecycle();
    this.reset();
  }

  getStateSnapshot(): SymbolStateSnapshot {
    return this.#stateMachine.getSnapshot();
  }

  getMainSprite(): Sprite {
    return this.sprite;
  }

  setDefaultState(state: string): void {
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#stateMachine.setDefaultState(state);
    this.syncAniIfNeeded(before);
  }

  requestState(state: string): void {
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#stateMachine.requestState(state);
    this.syncAniIfNeeded(before);
  }

  update(deltaSeconds: number): RenderSymbolUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    const aniResult = this.#currentAni.update(deltaSeconds);

    if (aniResult.loopCompleted) {
      this.#stateMachine.notifyLoopComplete();
    }
    if (aniResult.onceCompleted) {
      this.#stateMachine.notifyOnceComplete();
    }

    const stateChanged = this.syncAniIfNeeded(before);
    const snapshot = this.#stateMachine.getSnapshot();

    return Object.freeze({
      requestedState: snapshot.requestedState,
      resolvedState: snapshot.resolvedState,
      loopCompleted: aniResult.loopCompleted,
      onceCompleted: aniResult.onceCompleted,
      stateChanged
    });
  }

  reset(): void {
    this.#stateMachine.reset();
    resetBaseDisplay(this.createAnimationContext());
    const before = this.#lastAniKey;
    this.#lastAniKey = "";
    this.syncAniIfNeeded(before);
  }

  private syncAniIfNeeded(previousKey: string): boolean {
    const snapshot = this.#stateMachine.getSnapshot();
    const nextKey = this.createAniKey(snapshot);
    if (nextKey === previousKey && nextKey === this.#lastAniKey) {
      return false;
    }

    this.#lastAniKey = nextKey;
    this.#currentAni = this.createCurrentAni();
    this.#currentAni.reset();
    return true;
  }

  private createCurrentAni(): SymbolAni {
    const context = this.createAnimationContext();
    const ani = this.#animationResolver(context);
    assertResolvedSymbolAni(ani, context.resolvedState);
    if (ani.playback !== context.state.playback) {
      throw new SymbolAnimationError(
        `Animation resolver returned playback "${ani.playback}" for state "${context.resolvedState}", expected "${context.state.playback}".`
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
      sprite: this.sprite,
      overlayLayer: this.overlayLayer
    });
  }

  private createAniKey(snapshot: SymbolStateSnapshot): string {
    return `${snapshot.requestedState}->${snapshot.resolvedState}`;
  }
}
