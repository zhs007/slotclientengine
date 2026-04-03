import type gsap from "gsap";
import type { AnimationRuntimeContext } from "./animation-context.js";

export type AnimationFactory = (context: AnimationRuntimeContext) => gsap.core.Timeline | gsap.core.Tween | undefined;

export class AnimationRegistry {
  private readonly factories = new Map<string, AnimationFactory>();

  register(type: string, factory: AnimationFactory) {
    this.factories.set(type, factory);
  }

  get(type: string) {
    return this.factories.get(type);
  }

  has(type: string) {
    return this.factories.has(type);
  }

  listTypes() {
    return [...this.factories.keys()].sort();
  }
}