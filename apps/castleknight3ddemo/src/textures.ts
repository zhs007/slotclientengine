import { CanvasTexture, Color, RepeatWrapping, SRGBColorSpace } from "three";
import { createRandom } from "./random.js";

export interface StoneTextureSet {
  readonly albedo: CanvasTexture;
  readonly roughness: CanvasTexture;
  readonly bump: CanvasTexture;
  dispose(): void;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  return context;
}

export function createStoneTextures(
  seed: number,
  baseHex: string,
  repeatX: number,
  repeatY: number,
): StoneTextureSet {
  const size = 512;
  const random = createRandom(seed);
  const albedoCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  for (const canvas of [albedoCanvas, roughnessCanvas, bumpCanvas]) {
    canvas.width = size;
    canvas.height = size;
  }
  const albedo = context2d(albedoCanvas);
  const roughness = context2d(roughnessCanvas);
  const bump = context2d(bumpCanvas);
  albedo.fillStyle = baseHex;
  albedo.fillRect(0, 0, size, size);
  roughness.fillStyle = "#dddddd";
  roughness.fillRect(0, 0, size, size);
  bump.fillStyle = "#888888";
  bump.fillRect(0, 0, size, size);
  const base = new Color(baseHex);

  for (let index = 0; index < 620; index += 1) {
    const x = random.range(0, size);
    const y = random.range(0, size);
    const radius = random.range(0.7, 4.8);
    const color = base
      .clone()
      .offsetHSL(random.range(-0.025, 0.025), 0, random.range(-0.12, 0.1));
    albedo.fillStyle = `#${color.getHexString()}`;
    albedo.globalAlpha = random.range(0.12, 0.42);
    albedo.beginPath();
    albedo.ellipse(
      x,
      y,
      radius,
      radius * random.range(0.25, 0.8),
      random.range(0, Math.PI),
      0,
      Math.PI * 2,
    );
    albedo.fill();
    const value = Math.floor(random.range(80, 182));
    bump.fillStyle = `rgb(${value},${value},${value})`;
    bump.globalAlpha = random.range(0.12, 0.42);
    bump.fill();
  }

  for (let index = 0; index < 34; index += 1) {
    let x = random.range(0, size);
    let y = random.range(0, size);
    albedo.strokeStyle = random.next() > 0.5 ? "#25202b" : "#8b7f78";
    albedo.globalAlpha = random.range(0.2, 0.48);
    albedo.lineWidth = random.range(0.7, 2.2);
    bump.strokeStyle = "#404040";
    bump.globalAlpha = 0.68;
    bump.lineWidth = albedo.lineWidth * 1.3;
    albedo.beginPath();
    bump.beginPath();
    albedo.moveTo(x, y);
    bump.moveTo(x, y);
    for (let segment = 0; segment < random.integer(2, 6); segment += 1) {
      x += random.range(-24, 24);
      y += random.range(7, 30);
      albedo.lineTo(x, y);
      bump.lineTo(x, y);
    }
    albedo.stroke();
    bump.stroke();
  }
  albedo.globalAlpha = 1;
  bump.globalAlpha = 1;

  const albedoTexture = new CanvasTexture(albedoCanvas);
  const roughnessTexture = new CanvasTexture(roughnessCanvas);
  const bumpTexture = new CanvasTexture(bumpCanvas);
  albedoTexture.colorSpace = SRGBColorSpace;
  for (const texture of [albedoTexture, roughnessTexture, bumpTexture]) {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(repeatX, repeatY);
  }
  return {
    albedo: albedoTexture,
    roughness: roughnessTexture,
    bump: bumpTexture,
    dispose: () => {
      albedoTexture.dispose();
      roughnessTexture.dispose();
      bumpTexture.dispose();
    },
  };
}
