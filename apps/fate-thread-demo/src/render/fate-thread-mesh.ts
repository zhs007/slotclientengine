import { Container, MeshSimple, Texture } from "pixi.js";
import type { PointLike } from "../physics/fate-thread-simulation.js";

interface RibbonLayerOptions {
  texture: Texture;
  pointCount: number;
  width: number;
  repeatLength: number;
  flowSpeed: number;
  alpha: number;
  blendMode: "normal" | "add" | "screen";
}

const RENDER_SUBDIVISIONS = 4;

class RibbonLayer {
  readonly mesh: MeshSimple;
  readonly #vertices: Float32Array;
  readonly #uvs: Float32Array;
  readonly #width: number;
  readonly #repeatLength: number;
  readonly #flowSpeed: number;

  constructor(options: RibbonLayerOptions) {
    this.#width = options.width;
    this.#repeatLength = options.repeatLength;
    this.#flowSpeed = options.flowSpeed;
    this.#vertices = new Float32Array(options.pointCount * 4);
    this.#uvs = new Float32Array(options.pointCount * 4);
    const indices = buildTriangleIndices(options.pointCount);

    this.mesh = new MeshSimple({
      texture: options.texture,
      vertices: this.#vertices,
      uvs: this.#uvs,
      indices,
    });
    this.mesh.autoUpdate = false;
    this.mesh.alpha = options.alpha;
    this.mesh.blendMode = options.blendMode;
  }

  update(points: readonly PointLike[], elapsedSeconds: number): void {
    let distanceAlongThread = 0;
    for (let index = 0; index < points.length; index += 1) {
      const point = points[index];
      const previous = points[Math.max(0, index - 1)];
      const next = points[Math.min(points.length - 1, index + 1)];
      const tangentX = next.x - previous.x;
      const tangentY = next.y - previous.y;
      const tangentLength = Math.max(0.0001, Math.hypot(tangentX, tangentY));
      const normalX = -tangentY / tangentLength;
      const normalY = tangentX / tangentLength;
      const halfWidth = this.#width * 0.5;

      if (index > 0) {
        distanceAlongThread += Math.hypot(
          point.x - previous.x,
          point.y - previous.y,
        );
      }

      const vertexOffset = index * 4;
      this.#vertices[vertexOffset] = point.x + normalX * halfWidth;
      this.#vertices[vertexOffset + 1] = point.y + normalY * halfWidth;
      this.#vertices[vertexOffset + 2] = point.x - normalX * halfWidth;
      this.#vertices[vertexOffset + 3] = point.y - normalY * halfWidth;

      const u =
        distanceAlongThread / this.#repeatLength -
        elapsedSeconds * this.#flowSpeed;
      this.#uvs[vertexOffset] = u;
      this.#uvs[vertexOffset + 1] = 0;
      this.#uvs[vertexOffset + 2] = u;
      this.#uvs[vertexOffset + 3] = 1;
    }

    this.mesh.geometry.getBuffer("aPosition").update();
    this.mesh.geometry.getBuffer("aUV").update();
  }
}

export class FateThreadMesh extends Container {
  readonly #halo: RibbonLayer;
  readonly #aura: RibbonLayer;
  readonly #core: RibbonLayer;
  readonly #renderPoints: PointLike[];

  constructor(physicsPointCount: number) {
    super();
    const renderPointCount =
      (physicsPointCount - 1) * RENDER_SUBDIVISIONS + 1;
    this.#renderPoints = Array.from({ length: renderPointCount }, () => ({
      x: 0,
      y: 0,
    }));
    const textures = createProceduralThreadTextures();
    this.#halo = new RibbonLayer({
      texture: textures.glow,
      pointCount: renderPointCount,
      width: 25,
      repeatLength: 210,
      flowSpeed: 0.16,
      alpha: 0.23,
      blendMode: "add",
    });
    this.#aura = new RibbonLayer({
      texture: textures.glow,
      pointCount: renderPointCount,
      width: 11,
      repeatLength: 180,
      flowSpeed: 0.23,
      alpha: 0.46,
      blendMode: "add",
    });
    this.#core = new RibbonLayer({
      texture: textures.core,
      pointCount: renderPointCount,
      width: 4.5,
      repeatLength: 150,
      flowSpeed: 0.42,
      alpha: 1,
      blendMode: "screen",
    });

    this.addChild(this.#halo.mesh, this.#aura.mesh, this.#core.mesh);
  }

  update(points: readonly PointLike[], elapsedSeconds: number): void {
    resampleCatmullRom(points, RENDER_SUBDIVISIONS, this.#renderPoints);
    this.#halo.update(this.#renderPoints, elapsedSeconds);
    this.#aura.update(this.#renderPoints, elapsedSeconds * 1.07);
    this.#core.update(this.#renderPoints, elapsedSeconds);
    this.#halo.mesh.alpha = 0.2 + Math.sin(elapsedSeconds * 1.9) * 0.035;
    this.#aura.mesh.alpha = 0.42 + Math.sin(elapsedSeconds * 2.7) * 0.055;
  }
}

function resampleCatmullRom(
  points: readonly PointLike[],
  subdivisions: number,
  output: PointLike[],
): void {
  const lastPointIndex = points.length - 1;
  for (let index = 0; index < lastPointIndex; index += 1) {
    const p0 = points[Math.max(0, index - 1)];
    const p1 = points[index];
    const p2 = points[index + 1];
    const p3 = points[Math.min(lastPointIndex, index + 2)];

    for (let step = 0; step < subdivisions; step += 1) {
      const t = step / subdivisions;
      const t2 = t * t;
      const t3 = t2 * t;
      const target = output[index * subdivisions + step];
      target.x = catmullRom(p0.x, p1.x, p2.x, p3.x, t, t2, t3);
      target.y = catmullRom(p0.y, p1.y, p2.y, p3.y, t, t2, t3);
    }
  }

  const finalPoint = points[lastPointIndex];
  const finalTarget = output[output.length - 1];
  finalTarget.x = finalPoint.x;
  finalTarget.y = finalPoint.y;
}

function catmullRom(
  p0: number,
  p1: number,
  p2: number,
  p3: number,
  t: number,
  t2: number,
  t3: number,
): number {
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

function buildTriangleIndices(pointCount: number): Uint32Array {
  const indices = new Uint32Array((pointCount - 1) * 6);
  for (let index = 0; index < pointCount - 1; index += 1) {
    const offset = index * 6;
    const topLeft = index * 2;
    const bottomLeft = topLeft + 1;
    const topRight = topLeft + 2;
    const bottomRight = topLeft + 3;
    indices[offset] = topLeft;
    indices[offset + 1] = bottomLeft;
    indices[offset + 2] = topRight;
    indices[offset + 3] = topRight;
    indices[offset + 4] = bottomLeft;
    indices[offset + 5] = bottomRight;
  }
  return indices;
}

function createProceduralThreadTextures(): {
  core: Texture;
  glow: Texture;
} {
  const coreCanvas = document.createElement("canvas");
  coreCanvas.width = 256;
  coreCanvas.height = 32;
  const coreContext = getContext(coreCanvas);
  const coreGradient = coreContext.createLinearGradient(0, 0, 0, 32);
  coreGradient.addColorStop(0, "rgba(255, 204, 83, 0)");
  coreGradient.addColorStop(0.24, "rgba(244, 151, 36, .68)");
  coreGradient.addColorStop(0.43, "rgba(255, 244, 179, 1)");
  coreGradient.addColorStop(0.55, "rgba(255, 255, 239, 1)");
  coreGradient.addColorStop(0.72, "rgba(244, 140, 29, .72)");
  coreGradient.addColorStop(1, "rgba(255, 188, 42, 0)");
  coreContext.fillStyle = coreGradient;
  coreContext.fillRect(0, 0, 256, 32);

  for (const x of [26, 116, 206]) {
    const light = coreContext.createRadialGradient(x, 16, 0, x, 16, 24);
    light.addColorStop(0, "rgba(255, 255, 255, 1)");
    light.addColorStop(0.16, "rgba(255, 243, 164, .95)");
    light.addColorStop(0.42, "rgba(255, 178, 42, .36)");
    light.addColorStop(1, "rgba(255, 149, 18, 0)");
    coreContext.fillStyle = light;
    coreContext.fillRect(x - 24, 0, 48, 32);
  }

  const glowCanvas = document.createElement("canvas");
  glowCanvas.width = 256;
  glowCanvas.height = 64;
  const glowContext = getContext(glowCanvas);
  const glowGradient = glowContext.createLinearGradient(0, 0, 0, 64);
  glowGradient.addColorStop(0, "rgba(255, 118, 19, 0)");
  glowGradient.addColorStop(0.32, "rgba(255, 139, 25, .14)");
  glowGradient.addColorStop(0.5, "rgba(255, 224, 117, .92)");
  glowGradient.addColorStop(0.68, "rgba(255, 121, 20, .14)");
  glowGradient.addColorStop(1, "rgba(255, 118, 19, 0)");
  glowContext.fillStyle = glowGradient;
  glowContext.fillRect(0, 0, 256, 64);

  const core = Texture.from(coreCanvas);
  const glow = Texture.from(glowCanvas);
  core.source.wrapMode = "repeat";
  glow.source.wrapMode = "repeat";
  core.source.scaleMode = "linear";
  glow.source.scaleMode = "linear";
  return { core, glow };
}

function getContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Canvas 2D context is unavailable");
  }
  return context;
}
