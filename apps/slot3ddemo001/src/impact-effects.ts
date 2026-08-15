import {
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Group,
  Points,
  PointsMaterial,
  type Object3D,
} from "three";

export interface ImpactCameraOffset {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

interface DustBurst {
  readonly points: Points<BufferGeometry, PointsMaterial>;
  readonly positions: Float32Array;
  readonly velocities: Float32Array;
  readonly lifetimeSeconds: number;
  ageSeconds: number;
}

export function sampleImpactCameraOffset(
  timeSeconds: number,
  energy: number,
): ImpactCameraOffset {
  if (!Number.isFinite(timeSeconds)) {
    throw new RangeError("Impact time must be finite.");
  }
  if (!Number.isFinite(energy) || energy < 0) {
    throw new RangeError("Impact energy must be a non-negative finite number.");
  }
  if (energy === 0) return Object.freeze({ x: 0, y: 0, z: 0 });
  return Object.freeze({
    x: Math.sin(timeSeconds * 79) * 0.055 * energy,
    y: Math.sin(timeSeconds * 61 + 0.8) * 0.11 * energy,
    z: Math.sin(timeSeconds * 43 + 1.7) * 0.13 * energy,
  });
}

export class ImpactDustSystem {
  readonly #root = new Group();
  readonly #texture = createDustTexture();
  readonly #bursts: DustBurst[] = [];

  constructor(parent: Object3D) {
    this.#root.name = "megalith-impact-dust";
    parent.add(this.#root);
  }

  spawn(x: number, y: number, seed: number): void {
    const particleCount = 30;
    const positions = new Float32Array(particleCount * 3);
    const velocities = new Float32Array(particleCount * 3);
    const random = createSeededRandom(seed);
    for (let particle = 0; particle < particleCount; particle += 1) {
      const offset = particle * 3;
      positions[offset] = (random() - 0.5) * 0.9;
      positions[offset + 1] = random() * 0.2;
      positions[offset + 2] = random() * 0.18;
      velocities[offset] = (random() - 0.5) * 3.8;
      velocities[offset + 1] = 0.55 + random() * 2.5;
      velocities[offset + 2] = 0.35 + random() * 1.65;
    }

    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(positions, 3));
    const material = new PointsMaterial({
      color: 0xbca47a,
      map: this.#texture,
      alphaMap: this.#texture,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      size: 0.5,
      sizeAttenuation: true,
    });
    const points = new Points(geometry, material);
    points.position.set(x, y, 0.45);
    points.renderOrder = 3;
    this.#root.add(points);
    this.#bursts.push({
      points,
      positions,
      velocities,
      lifetimeSeconds: 0.78 + random() * 0.18,
      ageSeconds: 0,
    });
  }

  update(deltaSeconds: number): void {
    for (let index = this.#bursts.length - 1; index >= 0; index -= 1) {
      const burst = this.#bursts[index]!;
      burst.ageSeconds += deltaSeconds;
      if (burst.ageSeconds >= burst.lifetimeSeconds) {
        this.#disposeBurst(index);
        continue;
      }
      const life = burst.ageSeconds / burst.lifetimeSeconds;
      burst.points.material.opacity = (1 - life) ** 1.6 * 0.72;
      burst.points.material.size = 0.5 + life * 0.38;
      for (let offset = 0; offset < burst.positions.length; offset += 3) {
        burst.velocities[offset + 1] -= 5.2 * deltaSeconds;
        burst.velocities[offset] *= Math.exp(-2.2 * deltaSeconds);
        burst.velocities[offset + 2] *= Math.exp(-2.6 * deltaSeconds);
        burst.positions[offset] += burst.velocities[offset] * deltaSeconds;
        burst.positions[offset + 1] +=
          burst.velocities[offset + 1] * deltaSeconds;
        burst.positions[offset + 2] +=
          burst.velocities[offset + 2] * deltaSeconds;
      }
      const attribute = burst.points.geometry.getAttribute("position");
      attribute.needsUpdate = true;
    }
  }

  clear(): void {
    for (let index = this.#bursts.length - 1; index >= 0; index -= 1) {
      this.#disposeBurst(index);
    }
  }

  destroy(): void {
    this.clear();
    this.#texture.dispose();
    this.#root.removeFromParent();
  }

  #disposeBurst(index: number): void {
    const [burst] = this.#bursts.splice(index, 1);
    if (!burst) return;
    burst.points.removeFromParent();
    burst.points.geometry.dispose();
    burst.points.material.dispose();
  }
}

function createDustTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Unable to create impact dust texture.");
  const gradient = context.createRadialGradient(32, 32, 1, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,0.9)");
  gradient.addColorStop(0.3, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
