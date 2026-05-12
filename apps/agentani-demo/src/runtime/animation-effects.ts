import { gsap } from "gsap";
import {
  DisplacementFilter,
  Sprite,
  Texture,
  WRAP_MODES,
  type Container,
  type Filter,
} from "pixi.js";
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

function createNoiseCanvas(noiseSize: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable.");
  }

  const gridSize = Math.max(2, Math.floor(noiseSize));
  for (let x = 0; x < canvas.width; x += gridSize) {
    for (let y = 0; y < canvas.height; y += gridSize) {
      const channel = Math.floor(Math.random() * 255);
      context.fillStyle = `rgb(${channel},${channel},${channel})`;
      context.fillRect(x, y, gridSize, gridSize);
    }
  }

  context.filter = `blur(${gridSize}px)`;
  context.drawImage(canvas, 0, 0);
  return canvas;
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
        immediateRender: true,
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
    return gsap.to(target.scale, {
      x: layer.initial.scaleX * scale,
      y: layer.initial.scaleY * scale,
      duration: 0.5,
      ease: "sine.inOut",
      repeat: Math.max(0, Math.floor(step.duration / 0.5) - 1),
      yoyo: true,
      immediateRender: false,
    });
  },

  particleBurst({ layer, target, step }) {
    const parent = target.parent;
    if (!parent) {
      return gsap.timeline();
    }

    const count = Math.max(1, Math.round(numberParam(step, "count", 30)));
    const range = numberParam(step, "range", 160);
    const speed = numberParam(step, "speed", 2);
    const size = numberParam(step, "size", 0.2);
    const emissionTime = numberParam(step, "emissionTime", 0);
    const particles: Sprite[] = [];
    const timeline = gsap.timeline();

    for (let index = 0; index < count; index += 1) {
      const particle = new Sprite(layer.sprite.texture);
      particle.anchor.set(0.5);
      particle.scale.set(size);
      particle.position.set(layer.initial.x, layer.initial.y);
      particle.alpha = 0;
      particle.blendMode = target.blendMode;
      parent.addChild(particle);
      particles.push(particle);

      const angle = Math.random() * Math.PI * 2;
      const distance = range * (0.4 + Math.random() * 0.6);
      const delay = Math.random() * emissionTime;

      timeline.to(
        particle,
        {
          x: layer.initial.x + Math.cos(angle) * distance,
          y: layer.initial.y + Math.sin(angle) * distance,
          alpha: 1,
          rotation: Math.random() * Math.PI * 2,
          duration: 0.2,
          ease: "power1.out",
        },
        delay,
      );
      timeline.to(
        particle,
        {
          alpha: 0,
          scaleX: 0,
          scaleY: 0,
          duration: step.duration / Math.max(0.1, speed),
          ease: "power2.in",
          onComplete: () => {
            particle.parent?.removeChild(particle);
            if (!particle.destroyed) {
              particle.destroy({ children: true, texture: false });
            }
          },
        },
        delay + 0.2,
      );
    }

    timeline.add(
      () => {
        for (const particle of particles) {
          gsap.killTweensOf(particle);
          particle.parent?.removeChild(particle);
          if (!particle.destroyed) {
            particle.destroy({ children: true, texture: false });
          }
        }
      },
      step.duration + emissionTime + 0.25,
    );

    return timeline;
  },

  fireDistortion({ layer, step }) {
    const strength = numberParam(step, "strength", 30);
    const speed = numberParam(step, "speed", 1.2);
    const frequency = Math.max(0.01, numberParam(step, "frequency", 1.5));
    const noiseSize = numberParam(step, "noiseSize", 32);
    const noiseTexture = Texture.from(createNoiseCanvas(noiseSize));
    noiseTexture.source.wrapMode = WRAP_MODES.REPEAT;
    const noiseSprite = new Sprite(noiseTexture);
    noiseSprite.scale.set(4 / frequency);
    noiseSprite.alpha = 0;

    const filter = new DisplacementFilter(noiseSprite, strength);
    layer.container.addChild(noiseSprite);
    layer.sprite.filters = [...((layer.sprite.filters ?? []) as Filter[]), filter];

    const timeline = gsap.timeline();
    timeline.to(
      noiseSprite,
      {
        x: `+=${128 * speed * 0.2}`,
        y: `-=${512 * speed}`,
        duration: step.duration,
        ease: "none",
      },
      0,
    );
    timeline.to(
      filter.scale,
      {
        x: strength * 1.2,
        y: strength * 0.8,
        duration: 0.5,
        repeat: Math.max(0, Math.floor(step.duration / 0.5) - 1),
        yoyo: true,
        ease: "sine.inOut",
      },
      0,
    );
    timeline.add(() => {
      layer.sprite.filters = ((layer.sprite.filters ?? []) as Filter[]).filter(
        (existingFilter) => existingFilter !== filter,
      );
      gsap.killTweensOf(noiseSprite);
      gsap.killTweensOf(filter.scale);
      noiseSprite.parent?.removeChild(noiseSprite);
      if (!noiseSprite.destroyed) {
        noiseSprite.destroy({ children: true, texture: false });
      }
      if (!noiseTexture.destroyed) {
        noiseTexture.destroy(true);
      }
    }, step.duration);

    return timeline;
  },

  slideOut({ layer, target, step }) {
    const fallbackX =
      layer.initial.x >= 600 ? layer.initial.x + 700 : layer.initial.x - 700;
    const timeline = gsap.timeline();
    timeline.to(target, {
      x: numberParam(step, "toX", fallbackX),
      y: numberParam(step, "toY", layer.initial.y),
      alpha: numberParam(step, "toAlpha", layer.initial.alpha),
      duration: step.duration,
      ease: easeParam(step),
      immediateRender: false,
    });
    timeline.set(target, { alpha: 0, visible: false });
    return timeline;
  },

  float({ layer, target, step }) {
    const amplitude = numberParam(step, "amplitude", 8);
    const speed = numberParam(step, "speed", 4);
    return gsap.to(target, {
      y: layer.initial.y - amplitude,
      duration: Math.max(0.05, step.duration / Math.max(1, speed)),
      ease: "sine.inOut",
      repeat: Math.max(1, Math.round(speed)),
      yoyo: true,
      immediateRender: false,
    });
  },

  leafFall({ layer, target, step }) {
    const swing = numberParam(step, "swing", 40);
    const speed = numberParam(step, "speed", 4);
    const timeline = gsap.timeline();
    timeline.to(target, {
      x: layer.initial.x + swing,
      y: layer.initial.y + 360,
      rotation: layer.initial.rotation + 0.6,
      alpha: 0,
      duration: step.duration,
      ease: speed > 4 ? "power1.in" : "sine.in",
      immediateRender: false,
    });
    timeline.set(target, { alpha: 0, visible: false });
    return timeline;
  },

  zoomIn({ layer, target, step }) {
    const fromScale = numberParam(step, "fromScale", 0.2);
    const timeline = gsap.timeline();
    timeline.fromTo(
      target.scale,
      {
        x: layer.initial.scaleX * fromScale,
        y: layer.initial.scaleY * fromScale,
      },
      {
        x: layer.initial.scaleX,
        y: layer.initial.scaleY,
        duration: step.duration,
        ease: easeParam(step),
        immediateRender: true,
      },
      0,
    );
    timeline.fromTo(
      target,
      { alpha: 0 },
      {
        alpha: layer.initial.alpha,
        duration: step.duration,
        ease: easeParam(step),
        immediateRender: true,
      },
      0,
    );
    return timeline;
  },

  starlight({ layer, target, step }) {
    const parent = target.parent;
    if (!parent) {
      return gsap.timeline();
    }

    const count = Math.max(1, Math.round(numberParam(step, "count", 8)));
    const range = numberParam(step, "range", 400);
    const flashDuration = numberParam(step, "flashDuration", 1);
    const interval = numberParam(step, "interval", 0.5);
    const size = numberParam(step, "size", 20);
    const texture =
      layer.sprite.texture && layer.sprite.texture !== Texture.WHITE
        ? layer.sprite.texture
        : Texture.WHITE;
    const stars: Sprite[] = [];
    const timeline = gsap.timeline();

    for (let index = 0; index < count; index += 1) {
      const star = new Sprite(texture);
      star.anchor.set(0.5);
      star.alpha = 0;
      star.blendMode = target.blendMode;
      if (texture === Texture.WHITE) {
        star.width = size;
        star.height = size;
      } else {
        const ratio = size / Math.max(texture.width, texture.height);
        star.scale.set(ratio);
      }
      parent.addChild(star);
      stars.push(star);

      const delay = Math.random() * step.duration;
      const cycle = flashDuration + interval;
      const repeat = Math.max(0, Math.floor((step.duration - delay) / cycle));
      const starTimeline = gsap.timeline({ repeat, delay });
      starTimeline.add(() => {
        star.position.set(
          layer.initial.x + (Math.random() - 0.5) * range,
          layer.initial.y + (Math.random() - 0.5) * range,
        );
      });
      starTimeline.to(star, {
        alpha: 1,
        duration: flashDuration / 2,
        ease: "sine.inOut",
      });
      starTimeline.to(star, {
        alpha: 0,
        duration: flashDuration / 2,
        ease: "sine.inOut",
      });
      starTimeline.to({}, { duration: interval });
      timeline.add(starTimeline, 0);
    }

    timeline.add(() => {
      for (const star of stars) {
        gsap.killTweensOf(star);
        star.parent?.removeChild(star);
        if (!star.destroyed) {
          star.destroy({ children: true, texture: false });
        }
      }
    }, step.duration);

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
