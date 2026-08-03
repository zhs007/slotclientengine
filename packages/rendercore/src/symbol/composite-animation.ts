import { Container, Sprite } from "pixi.js";
import { resetBaseDisplay } from "./ani.js";
import { SymbolAnimationError } from "./errors.js";
import { type SymbolManifestCompositeAnimationSpec } from "./manifest.js";
import type {
  SymbolAni,
  SymbolAniUpdateResult,
  SymbolAnimationContext,
  SymbolVisualLayer,
} from "./types.js";

const EMPTY_UPDATE_RESULT: SymbolAniUpdateResult = Object.freeze({
  loopCompleted: false,
  onceCompleted: false,
});

interface CompositeChild {
  readonly slot: Container;
  readonly animation: SymbolAni;
  completedSinceBoundary: boolean;
}

export class CompositeSymbolAni implements SymbolAni {
  readonly stateId: string;
  readonly playback: SymbolAnimationContext["state"]["playback"];
  readonly continuityKey: string;
  readonly #context: SymbolAnimationContext;
  readonly #spec: SymbolManifestCompositeAnimationSpec;
  readonly #children: CompositeChild[];
  #onceCompleted = false;
  #destroyed = false;

  constructor(options: {
    readonly context: SymbolAnimationContext;
    readonly spec: SymbolManifestCompositeAnimationSpec;
    readonly createAnimation: (
      layer: SymbolManifestCompositeAnimationSpec["layers"][number],
      context: SymbolAnimationContext,
    ) => SymbolAni;
  }) {
    this.#context = options.context;
    this.#spec = options.spec;
    this.stateId = options.context.resolvedState;
    this.playback = options.context.state.playback;
    this.continuityKey = `composite:${options.context.resolvedState}:${JSON.stringify(options.spec)}`;
    const children: CompositeChild[] = [];
    try {
      for (const layer of options.spec.layers) {
        const slot = new Container();
        slot.label = `symbol-composite-${layer.placement}-${layer.id}`;
        const context = createLayerContext(options.context, slot);
        const animation = options.createAnimation(layer, context);
        children.push({ slot, animation, completedSinceBoundary: false });
      }
      this.#children = children;
    } catch (error) {
      for (const child of children) {
        child.animation.destroy?.();
        child.slot.destroy({ children: true });
      }
      throw error;
    }
  }

  reset(): void {
    this.assertNotDestroyed();
    this.#onceCompleted = false;
    resetBaseDisplay(this.#context);
    if (this.#spec.base.kind === "normal") {
      this.#context.baseLayer.visible = true;
      this.#context.stateSprite.visible = false;
      for (const layer of this.#context.layers) {
        layer.sprite.texture = layer.texture;
        layer.sprite.visible = true;
      }
    } else if (!this.#context.stateTextures[this.#context.requestedState]) {
      throw new SymbolAnimationError(
        `Symbol "${this.#context.symbol}" composite state "${this.#context.resolvedState}" is missing its state texture base.`,
      );
    }
    try {
      for (let index = 0; index < this.#children.length; index += 1) {
        const child = this.#children[index]!;
        const spec = this.#spec.layers[index]!;
        const parent =
          spec.placement === "underlay"
            ? this.#context.underlayLayer
            : this.#context.overlayLayer;
        parent.addChild(child.slot);
        child.completedSinceBoundary = false;
        child.animation.reset();
      }
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  update(deltaSeconds: number): SymbolAniUpdateResult {
    this.assertNotDestroyed();
    if (this.playback === "static") {
      try {
        for (const child of this.#children)
          child.animation.update(deltaSeconds);
      } catch (error) {
        this.destroy();
        throw error;
      }
      return EMPTY_UPDATE_RESULT;
    }
    try {
      for (const child of this.#children) {
        const result = child.animation.update(deltaSeconds);
        if (result.loopCompleted || result.onceCompleted) {
          child.completedSinceBoundary = true;
        }
      }
    } catch (error) {
      this.destroy();
      throw error;
    }
    if (this.#children.some((child) => !child.completedSinceBoundary)) {
      return EMPTY_UPDATE_RESULT;
    }
    if (this.playback === "once") {
      if (this.#onceCompleted) return EMPTY_UPDATE_RESULT;
      this.#onceCompleted = true;
      return Object.freeze({ loopCompleted: false, onceCompleted: true });
    }
    for (const child of this.#children) child.completedSinceBoundary = false;
    return Object.freeze({ loopCompleted: true, onceCompleted: false });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#destroyed = true;
    for (const child of this.#children) {
      child.animation.destroy?.();
      child.slot.parent?.removeChild(child.slot);
      child.slot.destroy({ children: true });
    }
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new SymbolAnimationError(
        `Composite symbol animation for "${this.#context.symbol}" was destroyed.`,
      );
    }
  }
}

function createLayerContext(
  source: SymbolAnimationContext,
  slot: Container,
): SymbolAnimationContext {
  const sprite = new Sprite(source.texture);
  const baseLayer = new Container();
  const underlayLayer = new Container();
  const stateSprite = new Sprite(source.texture);
  const visualLayer: SymbolVisualLayer = Object.freeze({
    index: 0,
    texture: source.texture,
    keyframes: Object.freeze([]),
    sprite,
  });
  baseLayer.addChild(sprite);
  return Object.freeze({
    ...source,
    underlayLayer,
    baseLayer,
    sprite,
    layers: Object.freeze([visualLayer]),
    stateSprite,
    overlayLayer: slot,
    stateTextures: Object.freeze({}),
    requiredStateTextures: Object.freeze([]),
  });
}
