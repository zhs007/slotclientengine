import gsap from "gsap";
import { DisplacementFilter, Graphics, Sprite, Texture } from "pixi.js";
import { getBooleanParam, getNullableNumberParam, getNumberParam, getStringParam } from "../runtime/animation-context.js";
import { createNoiseCanvas, createParticleSprite, removeDisplayObject } from "../runtime/animation-context.js";
import type { AnimationRegistry } from "../runtime/animation-registry.js";

const TAU = Math.PI * 2;

export function registerBuiltinAnimations(registry: AnimationRegistry) {
  registry.register("fadeIn", ({ target, duration, params }) =>
    gsap.from(target, {
      alpha: getNumberParam(params, "fromAlpha", 0),
      duration,
      ease: getStringParam(params, "ease", "power2.out")
    })
  );

  registry.register("fadeOut", ({ target, duration, params }) =>
    gsap.to(target, {
      alpha: getNumberParam(params, "toAlpha", 0),
      duration,
      ease: getStringParam(params, "ease", "power2.in")
    })
  );

  registry.register("slideIn", ({ target, duration, params }) =>
    gsap.from(target, {
      x: getNullableNumberParam(params, "fromX") ?? target.x - 500,
      y: getNullableNumberParam(params, "fromY") ?? target.y,
      duration,
      ease: getStringParam(params, "ease", "power2.out")
    })
  );

  registry.register("slideOut", ({ target, duration, params }) =>
    gsap.to(target, {
      x: getNullableNumberParam(params, "toX") ?? target.x + 500,
      y: getNullableNumberParam(params, "toY") ?? target.y,
      duration,
      ease: getStringParam(params, "ease", "power1.in")
    })
  );

  registry.register("bounceIn", ({ target, duration, params }) =>
    gsap.from(target.scale, {
      x: 0,
      y: 0,
      duration,
      ease: `elastic.out(1, ${getNumberParam(params, "elasticity", 0.3)})`
    })
  );

  registry.register("zoomIn", ({ target, duration }) =>
    gsap.from(target.scale, {
      x: 0,
      y: 0,
      duration,
      ease: "back.out(1.7)"
    })
  );

  registry.register("float", ({ target, duration, params }) =>
    gsap.to(target, {
      y: `-=${getNumberParam(params, "amplitude", 20)}`,
      duration: 0.5,
      repeat: computeRepeat(duration, 0.5),
      yoyo: true,
      ease: "sine.inOut"
    })
  );

  registry.register("pulse", ({ target, duration, params }) =>
    gsap.to(target.scale, {
      x: `*=${getNumberParam(params, "scale", 1.1)}`,
      y: `*=${getNumberParam(params, "scale", 1.1)}`,
      duration: 0.5,
      repeat: computeRepeat(duration, 0.5),
      yoyo: true,
      ease: "sine.inOut"
    })
  );

  registry.register("rotate", ({ target, duration, params }) => {
    const cycle = getNumberParam(params, "cycle", 1);
    return gsap.to(target, {
      rotation: `+=${TAU}`,
      duration: cycle,
      repeat: computeRepeat(duration, cycle),
      ease: "none"
    });
  });

  registry.register("wave", ({ target, duration, params }) =>
    gsap.to(target, {
      y: `+=${getNumberParam(params, "amplitude", 30)}`,
      x: `+=${getNumberParam(params, "horizontal", 10)}`,
      rotation: getNumberParam(params, "rotate", 0.05),
      duration: 0.5,
      repeat: computeRepeat(duration, 0.5),
      yoyo: true,
      ease: "sine.inOut"
    })
  );

  registry.register("swing", ({ target, duration, params }) => {
    const cycle = getNumberParam(params, "cycle", 1);
    const angle = getNumberParam(params, "angle", 0.2);
    return gsap.fromTo(
      target,
      { rotation: -angle },
      {
        rotation: angle,
        duration: cycle,
        repeat: computeRepeat(duration, cycle),
        yoyo: true,
        ease: "sine.inOut"
      }
    );
  });

  registry.register("flipX", ({ target, duration }) =>
    gsap.fromTo(
      target.scale,
      { x: target.scale.x },
      {
        x: -target.scale.x,
        duration: 0.5,
        repeat: computeRepeat(duration, 0.5),
        yoyo: true,
        ease: "power1.inOut"
      }
    )
  );

  registry.register("flipY", ({ target, duration }) =>
    gsap.fromTo(
      target.scale,
      { y: target.scale.y },
      {
        y: -target.scale.y,
        duration: 0.5,
        repeat: computeRepeat(duration, 0.5),
        yoyo: true,
        ease: "power1.inOut"
      }
    )
  );

  registry.register("sweepLight", ({ target, duration, params }) => {
    const cycle = Math.max(0.01, getNumberParam(params, "cycle", duration));
    const explicitRepeat = getNullableNumberParam(params, "repeat");
    return gsap.fromTo(
      target,
      {
        x: getNullableNumberParam(params, "startX") ?? -200
      },
      {
        x: getNullableNumberParam(params, "endX") ?? 800,
        duration: cycle,
        repeat: explicitRepeat ?? computeRepeat(duration, cycle),
        ease: "none"
      }
    );
  });

  registry.register("plexus", ({ container, target, duration, params, registerCleanup }) => {
    const graphics = new Graphics();
    const count = Math.max(2, Math.floor(getNumberParam(params, "count", 20)));
    const distance = getNumberParam(params, "distance", 120);
    const range = getNumberParam(params, "range", 300);
    const speed = getNumberParam(params, "speed", 1);
    const dots = Array.from({ length: count }, () => ({
      x: target.x + (Math.random() - 0.5) * range,
      y: target.y + (Math.random() - 0.5) * range,
      vx: (Math.random() - 0.5) * 2 * speed,
      vy: (Math.random() - 0.5) * 2 * speed
    }));

    container.addChild(graphics);

    registerCleanup(() => {
      graphics.clear();
      removeDisplayObject(graphics);
    });

    return gsap.to({}, {
      duration,
      onUpdate: () => {
        graphics.clear();
        for (const dot of dots) {
          dot.x += dot.vx;
          dot.y += dot.vy;
          if (Math.abs(dot.x - target.x) > range / 2) {
            dot.vx *= -1;
          }
          if (Math.abs(dot.y - target.y) > range / 2) {
            dot.vy *= -1;
          }

          graphics.beginFill(0x7bc8ff, 0.85);
          graphics.drawCircle(dot.x, dot.y, 2);
          graphics.endFill();
        }

        for (let firstIndex = 0; firstIndex < dots.length; firstIndex += 1) {
          for (let secondIndex = firstIndex + 1; secondIndex < dots.length; secondIndex += 1) {
            const deltaX = dots[firstIndex].x - dots[secondIndex].x;
            const deltaY = dots[firstIndex].y - dots[secondIndex].y;
            const squaredDistance = deltaX * deltaX + deltaY * deltaY;
            if (squaredDistance > distance * distance) {
              continue;
            }

            graphics.lineStyle(1, 0x7bc8ff, 1 - Math.sqrt(squaredDistance) / distance);
            graphics.moveTo(dots[firstIndex].x, dots[firstIndex].y);
            graphics.lineTo(dots[secondIndex].x, dots[secondIndex].y);
          }
        }
      }
    });
  });

  registry.register("glitch", ({ target, duration, params }) => {
    const delay = getNumberParam(params, "delay", 1);
    const cycle = delay + 0.4;
    const intensity = getNumberParam(params, "intensity", 1);
    const timeline = gsap.timeline({ repeat: computeRepeat(duration, cycle), repeatDelay: delay });

    for (let index = 0; index < 5; index += 1) {
      timeline.to(target, {
        x: target.x + (Math.random() - 0.5) * 12 * intensity,
        alpha: 0.5 + Math.random() * 0.5,
        duration: 0.05
      });
      timeline.to(target, {
        x: target.x,
        alpha: 1,
        duration: 0.03
      });
    }

    return timeline;
  });

  registry.register("magicShine", ({ container, target, duration, params, registerCleanup }) => {
    const delay = getNumberParam(params, "delay", 0.5);
    const shineDuration = getNumberParam(params, "shineDur", 1);
    const cycle = delay + shineDuration;
    const shine = new Graphics();
    shine.beginFill(0xffffff, 0.45);
    shine.drawRect(-120, -1000, 240, 2000);
    shine.endFill();
    shine.rotation = Math.PI / 4;
    shine.x = -1000;
    shine.mask = target;
    container.addChild(shine);

    registerCleanup(() => {
      shine.mask = null;
      removeDisplayObject(shine);
    });

    return gsap.fromTo(
      shine,
      { x: -500 },
      {
        x: 1500,
        duration: shineDuration,
        repeat: computeRepeat(duration, cycle),
        repeatDelay: delay,
        ease: "power1.inOut"
      }
    );
  });

  registry.register("cloudSea", ({ container, target, duration, params, registerCleanup }) =>
    createDisplacementAnimation({
      container,
      target,
      duration,
      params,
      registerCleanup,
      strengthFallback: 40,
      speedVector: { x: 512, y: 256 },
      scaleMultiplier: { x: 1.3, y: 0.7 }
    })
  );

  registry.register("fireDistortion", ({ container, target, duration, params, registerCleanup }) =>
    createDisplacementAnimation({
      container,
      target,
      duration,
      params,
      registerCleanup,
      strengthFallback: 30,
      speedVector: { x: 128, y: -512 },
      scaleMultiplier: { x: 1.2, y: 0.8 }
    })
  );

  registry.register("firework", ({ container, target, duration, params, registerCleanup }) => {
    const timeline = gsap.timeline();
    const startX = getNullableNumberParam(params, "startX") ?? target.x;
    const startY = getNullableNumberParam(params, "startY") ?? target.y + 400;
    const count = Math.max(8, Math.floor(getNumberParam(params, "count", 40)));
    const size = getNumberParam(params, "size", 0.15);
    const range = getNumberParam(params, "range", 250);
    const particles: Sprite[] = [];

    timeline.fromTo(
      target,
      { x: startX, y: startY, alpha: 1 },
      { x: target.x, y: target.y, alpha: 1, duration: duration * 0.4, ease: "power2.out" }
    );
    timeline.fromTo(
      target.scale,
      { x: 0.2, y: 0.2 },
      { x: 0.5, y: 0.5, duration: duration * 0.4, ease: "power2.out" },
      0
    );
    timeline.to(target, { alpha: 0, duration: 0.01 });

    timeline.add(() => {
      for (let index = 0; index < count; index += 1) {
        const particle = createParticleSprite(target);
        particle.scale.set(size);
        particle.x = target.x;
        particle.y = target.y;
        particle.blendMode = target.blendMode;
        container.addChild(particle);
        particles.push(particle);

        const angle = Math.random() * TAU;
        const distance = range * (0.5 + Math.random() * 0.5);
        gsap.to(particle, {
          x: target.x + Math.cos(angle) * distance,
          y: target.y + Math.sin(angle) * distance,
          alpha: 0,
          rotation: Math.random() * 10,
          duration: duration * 0.6,
          ease: "power3.out",
          onComplete: () => removeDisplayObject(particle)
        });
      }
    });

    registerCleanup(() => {
      for (const particle of particles) {
        removeDisplayObject(particle);
      }
    });

    return timeline;
  });

  registry.register("particleBurst", ({ container, target, duration, params, registerCleanup }) => {
    const timeline = gsap.timeline();
    const count = Math.max(1, Math.floor(getNumberParam(params, "count", 30)));
    const emissionTime = getNumberParam(params, "emissionTime", 0);
    const range = getNumberParam(params, "range", 200);
    const scale = getNumberParam(params, "size", 0.2);
    const speed = Math.max(0.01, getNumberParam(params, "speed", 1));
    const particles: Sprite[] = [];

    for (let index = 0; index < count; index += 1) {
      const particle = createParticleSprite(target);
      particle.scale.set(scale);
      particle.x = target.x;
      particle.y = target.y;
      particle.alpha = 0;
      particle.blendMode = target.blendMode;
      container.addChild(particle);
      particles.push(particle);

      const angle = Math.random() * TAU;
      const travel = range * (0.4 + Math.random() * 0.6);
      const delay = Math.random() * emissionTime;
      timeline.to(
        particle,
        {
          x: target.x + Math.cos(angle) * travel,
          y: target.y + Math.sin(angle) * travel,
          alpha: 1,
          rotation: Math.random() * TAU,
          duration: 0.2,
          ease: "power1.out"
        },
        delay
      );
      timeline.to(
        particle,
        {
          alpha: 0,
          duration: duration / speed,
          ease: "power2.in",
          onComplete: () => removeDisplayObject(particle)
        },
        delay + 0.2
      );
      timeline.to(
        particle.scale,
        {
          x: 0,
          y: 0,
          duration: duration / speed,
          ease: "power2.in"
        },
        delay + 0.2
      );
    }

    registerCleanup(() => {
      for (const particle of particles) {
        removeDisplayObject(particle);
      }
    });

    return timeline;
  });

  registry.register("starlight", ({ container, target, duration, params, registerCleanup }) => {
    const timeline = gsap.timeline();
    const count = Math.max(1, Math.floor(getNumberParam(params, "count", 20)));
    const range = getNumberParam(params, "range", 400);
    const flashDuration = getNumberParam(params, "flashDuration", 1);
    const interval = getNumberParam(params, "interval", 0.5);
    const size = getNumberParam(params, "size", 20);
    const cycle = flashDuration + interval;
    const stars: Sprite[] = [];

    for (let index = 0; index < count; index += 1) {
      const star = createParticleSprite(target);
      star.alpha = 0;
      star.blendMode = target.blendMode;
      const texture = star.texture;
      if (texture === Texture.WHITE) {
        star.width = size;
        star.height = size;
      } else {
        const ratio = size / Math.max(texture.width || size, texture.height || size);
        star.scale.set(ratio);
      }
      container.addChild(star);
      stars.push(star);

      const delay = Math.random() * duration;
      const repeats = Math.max(0, Math.floor((duration - delay) / cycle));
      const starTimeline = gsap.timeline({ repeat: repeats, delay });
      starTimeline.add(() => {
        star.x = target.x + (Math.random() - 0.5) * range;
        star.y = target.y + (Math.random() - 0.5) * range;
      });
      starTimeline.to(star, { alpha: 1, duration: flashDuration / 2, ease: "sine.inOut" });
      starTimeline.to(star, { alpha: 0, duration: flashDuration / 2, ease: "sine.inOut" });
      starTimeline.to({}, { duration: interval });
      timeline.add(starTimeline, 0);
    }

    registerCleanup(() => {
      for (const star of stars) {
        removeDisplayObject(star);
      }
    });

    return timeline;
  });

  registry.register("sequenceScale", ({ target, params }) => {
    const timeline = gsap.timeline();
    const firstDuration = getNumberParam(params, "s1_dur", 0.6);
    const secondDuration = getNumberParam(params, "s2_dur", 2.5);
    const thirdDuration = getNumberParam(params, "s3_dur", 0.4);

    timeline.fromTo(
      target.scale,
      {
        x: getNumberParam(params, "s1_startScale", 0.2),
        y: getNumberParam(params, "s1_startScale", 0.2)
      },
      {
        x: getNumberParam(params, "s1_endScale", 1),
        y: getNumberParam(params, "s1_endScale", 1),
        duration: firstDuration,
        ease: "power2.out"
      }
    );
    timeline.fromTo(
      target,
      { alpha: getNumberParam(params, "s1_startAlpha", 0) },
      { alpha: getNumberParam(params, "s1_endAlpha", 1), duration: firstDuration, ease: "power2.out" },
      0
    );
    timeline.to(target.scale, {
      x: getNumberParam(params, "s2_endScale", 1.15),
      y: getNumberParam(params, "s2_endScale", 1.15),
      duration: secondDuration,
      ease: "none"
    });
    timeline.to(
      target,
      {
        alpha: getNumberParam(params, "s2_endAlpha", 1),
        duration: secondDuration,
        ease: "none"
      },
      "<"
    );
    timeline.to(target.scale, {
      x: getNumberParam(params, "s3_endScale", 2.5),
      y: getNumberParam(params, "s3_endScale", 2.5),
      duration: thirdDuration,
      ease: "power2.in"
    });
    timeline.to(
      target,
      {
        alpha: getNumberParam(params, "s3_endAlpha", 0),
        duration: thirdDuration,
        ease: "power2.in"
      },
      "<"
    );
    return timeline;
  });

  registry.register("shatter", ({ container, target, duration, params, registerCleanup }) => {
    const timeline = gsap.timeline();
    const rows = Math.max(2, Math.floor(getNumberParam(params, "rows", 8)));
    const cols = Math.max(2, Math.floor(getNumberParam(params, "cols", 8)));
    const force = getNumberParam(params, "force", 400);
    const gravity = getNumberParam(params, "gravity", 300);
    const width = Math.max(40, (target as Sprite).width || 160);
    const height = Math.max(40, (target as Sprite).height || 80);
    const pieces: Graphics[] = [];

    timeline.to(target, { alpha: 0, duration: 0.1 });
    timeline.add(() => {
      for (let row = 0; row < rows; row += 1) {
        for (let col = 0; col < cols; col += 1) {
          const piece = new Graphics();
          const pieceWidth = width / cols;
          const pieceHeight = height / rows;
          piece.beginFill(0xffffff, 0.9);
          piece.drawRect(-pieceWidth / 2, -pieceHeight / 2, pieceWidth, pieceHeight);
          piece.endFill();
          piece.x = target.x + (col - cols / 2 + 0.5) * pieceWidth * target.scale.x;
          piece.y = target.y + (row - rows / 2 + 0.5) * pieceHeight * target.scale.y;
          container.addChild(piece);
          pieces.push(piece);

          const angle = Math.random() * TAU;
          const magnitude = Math.random() * force;
          gsap.to(piece, {
            x: piece.x + Math.cos(angle) * magnitude,
            y: piece.y + Math.sin(angle) * magnitude + gravity,
            rotation: (Math.random() - 0.5) * 10,
            alpha: 0,
            duration,
            ease: "power2.out",
            onComplete: () => removeDisplayObject(piece)
          });
        }
      }
    });

    registerCleanup(() => {
      for (const piece of pieces) {
        removeDisplayObject(piece);
      }
    });

    return timeline;
  });
}

function computeRepeat(duration: number, cycle: number) {
  return Math.max(0, Math.floor(duration / Math.max(cycle, 0.01)) - 1);
}

function createDisplacementAnimation({
  container,
  target,
  duration,
  params,
  registerCleanup,
  strengthFallback,
  speedVector,
  scaleMultiplier
}: {
  container: NonNullable<Sprite["parent"]>;
  target: any;
  duration: number;
  params: Record<string, string | number | boolean | null>;
  registerCleanup: (cleanup: () => void) => void;
  strengthFallback: number;
  speedVector: { x: number; y: number };
  scaleMultiplier: { x: number; y: number };
}) {
  const timeline = gsap.timeline();
  const strength = getNumberParam(params, "strength", strengthFallback);
  const speed = getNumberParam(params, "speed", 1.2);
  const frequency = getNumberParam(params, "frequency", 1.5);
  const noiseSize = getNumberParam(params, "noiseSize", 32);

  const noiseTexture = Texture.from(createNoiseCanvas(noiseSize));
  const noiseSprite = new Sprite(noiseTexture);
  noiseSprite.scale.set(4 / Math.max(frequency, 0.01));
  noiseSprite.alpha = 0;
  const filter = new DisplacementFilter({ sprite: noiseSprite, scale: strength });
  container.addChild(noiseSprite);
  target.filters = [...((target.filters ?? []) as unknown[]), filter];

  registerCleanup(() => {
    target.filters = ((target.filters ?? []) as unknown[]).filter((existingFilter) => existingFilter !== filter);
    removeDisplayObject(noiseSprite);
    if (!noiseTexture.destroyed) {
      noiseTexture.destroy(true);
    }
  });

  timeline.to(
    noiseSprite,
    {
      x: `+=${speedVector.x * speed}`,
      y: `+=${speedVector.y * speed}`,
      duration,
      ease: "none"
    },
    0
  );
  timeline.to(
    filter.scale,
    {
      x: strength * scaleMultiplier.x,
      y: strength * scaleMultiplier.y,
      duration: 0.5,
      repeat: computeRepeat(duration, 0.5),
      yoyo: true,
      ease: "sine.inOut"
    },
    0
  );

  return timeline;
}