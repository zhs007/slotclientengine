import { gsap } from "gsap";
import type { Container } from "pixi.js";
import type {
  CodeAnimationEffectType,
  CodeAnimationStep,
} from "../animations/types.js";
import type { BuiltLayer } from "./layer-factory.js";

type EffectContext = {
  layer: BuiltLayer;
  target: Container;
  step: CodeAnimationStep;
};

type EffectFactory = (
  context: EffectContext,
) => gsap.core.Tween | gsap.core.Timeline;

function numberParam(step: CodeAnimationStep, name: string, fallback: number) {
  const value = step.params?.[name];
  return typeof value === "number" ? value : fallback;
}

function easeParam(step: CodeAnimationStep) {
  const value = step.params?.ease;
  return typeof value === "string" ? value : "sine.inOut";
}

export const animationEffects = {
  fadeIn({ layer, target, step }) {
    const fromAlpha = numberParam(step, "fromAlpha", 0);
    return gsap.fromTo(
      target,
      { alpha: fromAlpha },
      {
        alpha: layer.initial.alpha,
        duration: step.duration,
        ease: easeParam(step),
        immediateRender: false,
      },
    );
  },

  fadeOut({ target, step }) {
    return gsap.to(target, {
      alpha: numberParam(step, "toAlpha", 0),
      duration: step.duration,
      ease: easeParam(step),
      immediateRender: false,
    });
  },

  pulse({ layer, target, step }) {
    const scale = numberParam(step, "scale", 1.1);
    const speed = numberParam(step, "speed", 2);
    const minAlphaRaw = numberParam(step, "minAlpha", layer.initial.alpha);
    const minAlpha = minAlphaRaw > 1 ? minAlphaRaw / 100 : minAlphaRaw;
    const timeline = gsap.timeline();
    timeline.to(
      target,
      {
        alpha: minAlpha,
        duration: Math.max(0.05, step.duration / Math.max(1, speed)),
        ease: "sine.inOut",
        repeat: Math.max(1, Math.round(speed)),
        yoyo: true,
        immediateRender: false,
      },
      0,
    );
    timeline.to(
      target.scale,
      {
        x: layer.initial.scaleX * scale,
        y: layer.initial.scaleY * scale,
        duration: Math.max(0.05, step.duration / Math.max(1, speed)),
        ease: "sine.inOut",
        repeat: Math.max(1, Math.round(speed)),
        yoyo: true,
        immediateRender: false,
      },
      0,
    );
    return timeline;
  },

  starlight({ layer, target, step }) {
    const count = Math.max(1, Math.round(numberParam(step, "count", 8)));
    const size = numberParam(step, "size", 18) / 100;
    const tick = step.duration / count;
    const timeline = gsap.timeline();
    for (let index = 0; index < count; index += 1) {
      timeline.to(target, {
        alpha: index % 2 === 0 ? 0.35 : 1,
        rotation: layer.initial.rotation + (index % 2 === 0 ? 0.08 : -0.08),
        duration: tick / 2,
        ease: "sine.inOut",
      });
      timeline.to(
        target.scale,
        {
          x: layer.initial.scaleX * (1 + size),
          y: layer.initial.scaleY * (1 + size),
          duration: tick / 2,
          ease: "sine.inOut",
        },
        "<",
      );
      timeline.to(target, {
        alpha: layer.initial.alpha,
        rotation: layer.initial.rotation,
        duration: tick / 2,
        ease: "sine.inOut",
      });
      timeline.to(
        target.scale,
        {
          x: layer.initial.scaleX,
          y: layer.initial.scaleY,
          duration: tick / 2,
          ease: "sine.inOut",
        },
        "<",
      );
    }
    return timeline;
  },

  sweepLight({ target, step }) {
    const startX = numberParam(step, "startX", -200);
    const endX = numberParam(step, "endX", 800);
    const startAlpha = numberParam(step, "startAlpha", 0);
    const midAlpha = numberParam(step, "midAlpha", 1);
    const endAlpha = numberParam(step, "endAlpha", 0);
    return gsap.fromTo(
      target,
      { x: startX, alpha: startAlpha },
      {
        x: endX,
        alpha: endAlpha,
        duration: step.duration,
        ease: easeParam(step),
        keyframes: [
          { alpha: midAlpha, duration: step.duration / 2 },
          { alpha: endAlpha },
        ],
      },
    );
  },

  swing({ layer, target, step }) {
    const angle = numberParam(step, "angle", 0.12);
    return gsap.to(target, {
      rotation: layer.initial.rotation + angle,
      duration: step.duration / 2,
      ease: "sine.inOut",
      repeat: 1,
      yoyo: true,
      immediateRender: false,
    });
  },
} satisfies Record<CodeAnimationEffectType, EffectFactory>;

export function createAnimationEffect(context: EffectContext) {
  return animationEffects[context.step.type](context);
}
