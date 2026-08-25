export interface PointLike {
  x: number;
  y: number;
}

export interface FateThreadOptions {
  segmentsPerSpan?: number;
  sag?: number;
  gravity?: number;
  damping?: number;
  constraintIterations?: number;
  wind?: number;
}

interface Particle {
  position: PointLike;
  previous: PointLike;
  anchorIndex: number | null;
  phase: number;
}

interface DistanceConstraint {
  a: number;
  b: number;
  length: number;
}

const DEFAULT_OPTIONS: Required<FateThreadOptions> = {
  segmentsPerSpan: 10,
  sag: 46,
  gravity: 245,
  damping: 0.985,
  constraintIterations: 10,
  wind: 38,
};

export class FateThreadSimulation {
  readonly #initialAnchors: PointLike[];
  readonly #options: Required<FateThreadOptions>;
  readonly #particles: Particle[] = [];
  readonly #constraints: DistanceConstraint[] = [];
  readonly #anchorParticleIndices: number[] = [];
  readonly #anchors: PointLike[];

  constructor(anchors: readonly PointLike[], options: FateThreadOptions = {}) {
    if (anchors.length < 2) {
      throw new Error("FateThreadSimulation requires at least two anchors");
    }

    this.#options = { ...DEFAULT_OPTIONS, ...options };
    if (this.#options.segmentsPerSpan < 2) {
      throw new Error("segmentsPerSpan must be at least 2");
    }

    this.#initialAnchors = anchors.map(copyPoint);
    this.#anchors = anchors.map(copyPoint);
    this.#rebuildParticles();
  }

  get points(): readonly PointLike[] {
    return this.#particles.map((particle) => particle.position);
  }

  get anchorCount(): number {
    return this.#anchors.length;
  }

  get anchorParticleIndices(): readonly number[] {
    return this.#anchorParticleIndices;
  }

  getAnchor(index: number): Readonly<PointLike> {
    const anchor = this.#anchors[index];
    if (!anchor) {
      throw new Error(`Unknown anchor index: ${index}`);
    }
    return anchor;
  }

  setAnchor(index: number, point: PointLike): void {
    const anchor = this.#anchors[index];
    const particleIndex = this.#anchorParticleIndices[index];
    const particle = this.#particles[particleIndex];
    if (!anchor || particleIndex === undefined || !particle) {
      throw new Error(`Unknown anchor index: ${index}`);
    }

    anchor.x = point.x;
    anchor.y = point.y;
    particle.position.x = point.x;
    particle.position.y = point.y;
    particle.previous.x = point.x;
    particle.previous.y = point.y;
  }

  step(deltaSeconds: number, elapsedSeconds: number): void {
    const safeDelta = Math.min(Math.max(deltaSeconds, 0), 1 / 20);
    const substepCount = Math.max(1, Math.ceil(safeDelta / (1 / 120)));
    const subDelta = safeDelta / substepCount;

    for (let substep = 0; substep < substepCount; substep += 1) {
      this.#integrate(subDelta, elapsedSeconds + substep * subDelta);
      for (
        let iteration = 0;
        iteration < this.#options.constraintIterations;
        iteration += 1
      ) {
        this.#solveConstraints();
        this.#pinAnchors();
      }
    }
  }

  pluck(strength = 18): void {
    const lastIndex = this.#particles.length - 1;
    for (let index = 0; index <= lastIndex; index += 1) {
      const particle = this.#particles[index];
      if (particle.anchorIndex !== null) {
        continue;
      }
      const progress = index / lastIndex;
      const envelope = Math.sin(progress * Math.PI);
      particle.previous.x -= Math.cos(progress * Math.PI * 5) * strength * 0.22;
      particle.previous.y += envelope * strength;
    }
  }

  reset(): void {
    this.#anchors.forEach((anchor, index) => {
      const initial = this.#initialAnchors[index];
      anchor.x = initial.x;
      anchor.y = initial.y;
    });
    this.#rebuildParticles();
  }

  #rebuildParticles(): void {
    this.#particles.length = 0;
    this.#constraints.length = 0;
    this.#anchorParticleIndices.length = 0;

    const { segmentsPerSpan, sag } = this.#options;
    for (let span = 0; span < this.#anchors.length - 1; span += 1) {
      const start = this.#anchors[span];
      const end = this.#anchors[span + 1];
      for (let segment = 0; segment <= segmentsPerSpan; segment += 1) {
        if (span > 0 && segment === 0) {
          continue;
        }

        const t = segment / segmentsPerSpan;
        const interpolatedPoint = {
          x: lerp(start.x, end.x, t),
          y: lerp(start.y, end.y, t) + Math.sin(t * Math.PI) * sag,
        };
        const isStartAnchor = segment === 0;
        const isEndAnchor = segment === segmentsPerSpan;
        const anchorIndex = isStartAnchor
          ? span
          : isEndAnchor
            ? span + 1
            : null;
        const point =
          anchorIndex === null
            ? interpolatedPoint
            : copyPoint(this.#anchors[anchorIndex]);
        const particleIndex = this.#particles.length;

        this.#particles.push({
          position: copyPoint(point),
          previous: copyPoint(point),
          anchorIndex,
          phase: particleIndex * 0.73 + span * 1.37,
        });
        if (anchorIndex !== null) {
          this.#anchorParticleIndices[anchorIndex] = particleIndex;
        }
      }
    }

    for (let index = 0; index < this.#particles.length - 1; index += 1) {
      const a = this.#particles[index].position;
      const b = this.#particles[index + 1].position;
      this.#constraints.push({
        a: index,
        b: index + 1,
        length: Math.hypot(b.x - a.x, b.y - a.y),
      });
    }
  }

  #integrate(deltaSeconds: number, elapsedSeconds: number): void {
    const squaredDelta = deltaSeconds * deltaSeconds;
    for (const particle of this.#particles) {
      if (particle.anchorIndex !== null) {
        continue;
      }

      const velocityX =
        (particle.position.x - particle.previous.x) * this.#options.damping;
      const velocityY =
        (particle.position.y - particle.previous.y) * this.#options.damping;
      particle.previous.x = particle.position.x;
      particle.previous.y = particle.position.y;

      const wind =
        Math.sin(elapsedSeconds * 1.8 + particle.phase) * this.#options.wind +
        Math.sin(elapsedSeconds * 0.71 + particle.phase * 0.31) *
          this.#options.wind *
          0.35;
      particle.position.x += velocityX + wind * squaredDelta;
      particle.position.y += velocityY + this.#options.gravity * squaredDelta;
    }
  }

  #solveConstraints(): void {
    for (const constraint of this.#constraints) {
      const a = this.#particles[constraint.a];
      const b = this.#particles[constraint.b];
      const deltaX = b.position.x - a.position.x;
      const deltaY = b.position.y - a.position.y;
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 0.0001) {
        continue;
      }

      const correction = (distance - constraint.length) / distance;
      const aFree = a.anchorIndex === null;
      const bFree = b.anchorIndex === null;
      const weight = aFree && bFree ? 0.5 : 1;
      if (aFree) {
        a.position.x += deltaX * correction * weight;
        a.position.y += deltaY * correction * weight;
      }
      if (bFree) {
        b.position.x -= deltaX * correction * weight;
        b.position.y -= deltaY * correction * weight;
      }
    }
  }

  #pinAnchors(): void {
    for (
      let anchorIndex = 0;
      anchorIndex < this.#anchors.length;
      anchorIndex += 1
    ) {
      const anchor = this.#anchors[anchorIndex];
      const particle =
        this.#particles[this.#anchorParticleIndices[anchorIndex]];
      particle.position.x = anchor.x;
      particle.position.y = anchor.y;
    }
  }
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

function copyPoint(point: PointLike): PointLike {
  return { x: point.x, y: point.y };
}
