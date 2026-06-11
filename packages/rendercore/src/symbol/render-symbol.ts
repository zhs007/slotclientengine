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
  SymbolNormalTextureSource,
  SymbolStateId,
  SymbolStateSnapshot,
  SymbolVisualLayer
} from "./types.js";

export class RenderSymbol extends VisualEntity<void> {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly texture: Texture;
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures: readonly SymbolStateId[];
  readonly sprite: Sprite;
  readonly baseLayer: Container;
  readonly layers: readonly SymbolVisualLayer[];
  readonly stateSprite: Sprite;
  readonly overlayLayer: Container;
  readonly normalSource: SymbolNormalTextureSource<Texture>;
  readonly #stateMachine: SymbolStateMachine;
  readonly #animationResolver: RenderSymbolOptions["animationResolver"];
  #currentAni: SymbolAni;
  #lastAniKey: string;

  constructor(options: RenderSymbolOptions) {
    super();
    this.code = options.definition.code;
    this.symbol = options.definition.symbol;
    this.pays = Object.freeze([...options.definition.pays]);
    this.normalSource = normalizeRenderSymbolNormalSource(options.texture);
    this.texture =
      this.normalSource.kind === "single"
        ? this.normalSource.texture
        : this.normalSource.layers[0].texture;
    this.stateTextures = Object.freeze({ ...(options.stateTextures ?? {}) });
    this.requiredStateTextures = Object.freeze([...(options.requiredStateTextures ?? [])]);
    this.baseLayer = new Container();
    this.layers = Object.freeze(createVisualLayers(this.normalSource));
    this.sprite = this.layers[0].sprite;
    this.stateSprite = new Sprite(this.texture);
    this.overlayLayer = new Container();
    this.#stateMachine = new SymbolStateMachine(options.definition);
    this.#animationResolver = options.animationResolver;

    this.stateSprite.anchor.set(0.5);
    this.stateSprite.visible = false;
    this.baseLayer.addChild(...this.layers.map((layer) => layer.sprite));
    this.addChild(this.baseLayer, this.stateSprite, this.overlayLayer);

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
      baseLayer: this.baseLayer,
      sprite: this.sprite,
      layers: this.layers,
      stateSprite: this.stateSprite,
      overlayLayer: this.overlayLayer
    });
  }

  private createAniKey(snapshot: SymbolStateSnapshot): string {
    return `${snapshot.requestedState}->${snapshot.resolvedState}`;
  }
}

function normalizeRenderSymbolNormalSource(
  texture: Texture | SymbolNormalTextureSource<Texture>
): SymbolNormalTextureSource<Texture> {
  if (isNormalSource(texture)) {
    if (texture.kind === "single") {
      return Object.freeze({
        kind: "single",
        texture: assertTexture(texture.texture, "single normal")
      });
    }
    if (texture.layers.length === 0) {
      throw new SymbolAnimationError("Layered symbol normal texture must include at least one layer.");
    }
    return Object.freeze({
      kind: "layered",
      layers: Object.freeze(
        [...texture.layers]
          .sort((left, right) => left.index - right.index)
          .map((layer, expectedIndex) => {
            if (layer.index !== expectedIndex) {
              throw new SymbolAnimationError(
                "Layered symbol normal texture must use consecutive indexes from 0."
              );
            }
            const layerTexture = assertTexture(layer.texture, `layer ${layer.index}`);
            const keyframes = normalizeLayerKeyframes(layer.index, layerTexture, layer.keyframes ?? []);
            return Object.freeze({
              index: layer.index,
              texture: layerTexture,
              keyframes
            });
          })
      )
    });
  }

  return Object.freeze({
    kind: "single",
    texture: assertTexture(texture, "normal")
  });
}

function createVisualLayers(normalSource: SymbolNormalTextureSource<Texture>): SymbolVisualLayer[] {
  const layerSources =
    normalSource.kind === "single"
      ? [Object.freeze({ index: 0, texture: normalSource.texture, keyframes: Object.freeze([]) })]
      : normalSource.layers;

  return layerSources.map((layer) => {
    const sprite = new Sprite(layer.texture);
    sprite.anchor.set(0.5);
    return Object.freeze({
      index: layer.index,
      texture: layer.texture,
      keyframes: layer.keyframes ?? Object.freeze([]),
      sprite
    });
  });
}

function normalizeLayerKeyframes(
  index: number,
  texture: Texture,
  keyframes: readonly Texture[]
): readonly Texture[] {
  if (keyframes.length === 0) {
    return Object.freeze([]);
  }
  if (keyframes[0] !== texture) {
    throw new SymbolAnimationError(`Symbol layer ${index} keyframes must start with the layer texture.`);
  }
  const width = getTextureWidth(texture);
  const height = getTextureHeight(texture);
  return Object.freeze(
    keyframes.map((keyframe, keyframeIndex) => {
      const loadedKeyframe = assertTexture(keyframe, `layer ${index} keyframe ${keyframeIndex}`);
      if (getTextureWidth(loadedKeyframe) !== width || getTextureHeight(loadedKeyframe) !== height) {
        throw new SymbolAnimationError(
          `Symbol layer ${index} keyframe textures must match the layer texture dimensions.`
        );
      }
      return loadedKeyframe;
    })
  );
}

function isNormalSource(
  texture: Texture | SymbolNormalTextureSource<Texture>
): texture is SymbolNormalTextureSource<Texture> {
  return (
    typeof texture === "object" &&
    texture !== null &&
    "kind" in texture &&
    (texture.kind === "single" || texture.kind === "layered")
  );
}

function assertTexture(texture: Texture, label: string): Texture {
  if (!texture || typeof texture !== "object") {
    throw new SymbolAnimationError(`Symbol ${label} texture must exist.`);
  }
  return texture;
}

function getTextureWidth(texture: Texture): number {
  return Math.max(0, texture.width || texture.source?.width || texture.orig?.width || 0);
}

function getTextureHeight(texture: Texture): number {
  return Math.max(0, texture.height || texture.source?.height || texture.orig?.height || 0);
}
