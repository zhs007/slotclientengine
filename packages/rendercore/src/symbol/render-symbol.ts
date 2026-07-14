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
  SymbolStateSnapshot,
  SymbolVisualLayer,
  RenderSymbolValueController,
} from "./types.js";

export class RenderSymbol extends VisualEntity<void> {
  readonly code: number;
  readonly symbol: string;
  readonly pays: readonly number[];
  readonly texture: Texture;
  readonly stateTextures: Readonly<Partial<Record<SymbolStateId, Texture>>>;
  readonly requiredStateTextures: readonly SymbolStateId[];
  readonly sprite: Sprite;
  readonly underlayLayer: Container;
  readonly baseLayer: Container;
  readonly layers: readonly SymbolVisualLayer[];
  readonly stateSprite: Sprite;
  readonly overlayLayer: Container;
  readonly normalSource: SymbolNormalTextureSource<Texture>;
  readonly renderPriority: number;
  readonly #stateMachine: SymbolStateMachine;
  readonly #animationResolver: RenderSymbolOptions["animationResolver"];
  readonly #valueController: RenderSymbolValueController | null;
  readonly #landingAppearEnabled: boolean;
  #currentAni: SymbolAni;
  #lastAniKey: string;
  #defaultScaleX = 1;
  #defaultScaleY = 1;
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
    this.baseLayer = new Container();
    this.layers = Object.freeze(createVisualLayers(this.normalSource));
    this.sprite = this.layers[0].sprite;
    this.stateSprite = new Sprite(this.texture);
    this.overlayLayer = new Container();
    this.#stateMachine = new SymbolStateMachine(options.definition);
    this.#animationResolver = options.animationResolver;
    this.#landingAppearEnabled = options.landingAppearEnabled ?? false;

    this.stateSprite.anchor.set(0.5);
    this.stateSprite.visible = false;
    this.baseLayer.addChild(...this.layers.map((layer) => layer.sprite));
    this.addChild(
      this.underlayLayer,
      this.baseLayer,
      this.stateSprite,
      this.overlayLayer,
    );
    this.#valueController = options.valueControllerFactory?.(this) ?? null;

    this.#lastAniKey = this.createAniKey(this.#stateMachine.getSnapshot());
    this.#currentAni = this.createCurrentAni();
    this.#currentAni.reset();
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

  getMainSprite(): Sprite {
    return this.sprite;
  }

  getUnderlayLayer(): Container {
    return this.underlayLayer;
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

  setPresentationValue(value: number | null): void {
    this.assertNotDestroyed();
    const previous = this.#valueController?.getValue() ?? null;
    this.#valueController?.setValue(value);
    if (this.#valueController && previous !== value) {
      const before = this.#lastAniKey;
      this.#lastAniKey = "";
      this.syncAniIfNeeded(before);
    }
  }

  getPresentationValue(): number | null {
    return this.#valueController?.getValue() ?? null;
  }

  requestLandingAppear(): boolean {
    this.assertNotDestroyed();
    if (!this.#landingAppearEnabled) return false;
    if (this.#valueController) {
      return this.#valueController.requestLandingAppear();
    }
    this.requestState("appear");
    return true;
  }

  isLandingAppearActive(): boolean {
    if (!this.#landingAppearEnabled) return false;
    if (this.#valueController) {
      return this.#valueController.isLandingAppearActive();
    }
    return this.#stateMachine.getSnapshot().resolvedState === "appear";
  }

  update(deltaSeconds: number): RenderSymbolUpdateResult {
    assertValidDeltaSeconds(deltaSeconds);
    const before = this.createAniKey(this.#stateMachine.getSnapshot());
    const aniResult = this.#currentAni.update(deltaSeconds);
    this.#valueController?.update(deltaSeconds);

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
      stateChanged,
    });
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#stateMachine.reset();
    resetBaseDisplay(this.createAnimationContext());
    const before = this.#lastAniKey;
    this.#lastAniKey = "";
    this.syncAniIfNeeded(before);
  }

  resetForPoolRelease(): void {
    this.assertNotDestroyed();
    this.#currentAni.destroy?.();
    this.#valueController?.resetForPoolRelease();
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
    this.#destroyed = true;
    this.#currentAni.destroy?.();
    this.#valueController?.destroy();
    destroyVniSymbolAnimationCache(this);
    super.destroy(options);
  }

  private syncAniIfNeeded(previousKey: string): boolean {
    const snapshot = this.#stateMachine.getSnapshot();
    const nextKey = this.createAniKey(snapshot);
    if (nextKey === previousKey && nextKey === this.#lastAniKey) {
      return false;
    }

    const nextAni = this.createCurrentAni();
    const previousAni = this.#currentAni;
    this.#lastAniKey = nextKey;
    this.#currentAni = nextAni;
    this.#currentAni.reset();
    previousAni.destroy?.();
    return true;
  }

  private createCurrentAni(): SymbolAni {
    const context = this.createAnimationContext();
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

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError(
        `Render symbol "${this.symbol}" was destroyed.`,
      );
    }
  }
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
