import {
  CanvasTexture,
  Color,
  RepeatWrapping,
  SRGBColorSpace,
  type Texture,
} from "three";
import { createRandom } from "./random.js";

export interface TurfTextureSet {
  readonly albedo: CanvasTexture;
  readonly roughness: CanvasTexture;
  readonly bump: CanvasTexture;
  dispose(): void;
}

function requireContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D context is unavailable.");
  return context;
}

function configure(texture: Texture, repeatX: number, repeatY: number): void {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
}

export function createTurfTextures(
  seed: number,
  baseColor: string,
  repeatX: number,
  repeatY: number,
): TurfTextureSet {
  const size = 512;
  const random = createRandom(seed);
  const albedoCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  for (const canvas of [albedoCanvas, roughnessCanvas, bumpCanvas]) {
    canvas.width = size;
    canvas.height = size;
  }
  const albedoContext = requireContext(albedoCanvas);
  const roughnessContext = requireContext(roughnessCanvas);
  const bumpContext = requireContext(bumpCanvas);
  albedoContext.fillStyle = baseColor;
  albedoContext.fillRect(0, 0, size, size);
  roughnessContext.fillStyle = "#d8d8d8";
  roughnessContext.fillRect(0, 0, size, size);
  bumpContext.fillStyle = "#5f5f5f";
  bumpContext.fillRect(0, 0, size, size);

  const base = new Color(baseColor);
  for (let index = 0; index < 4600; index += 1) {
    const x = random.range(0, size);
    const y = random.range(0, size);
    const length = random.range(2.5, 9);
    const angle = random.range(-1.2, 1.2);
    const lightness = random.range(-0.09, 0.1);
    const blade = base
      .clone()
      .offsetHSL(
        random.range(-0.025, 0.025),
        random.range(-0.04, 0.08),
        lightness,
      );
    albedoContext.strokeStyle = `#${blade.getHexString()}`;
    albedoContext.globalAlpha = random.range(0.34, 0.86);
    albedoContext.lineWidth = random.range(0.8, 2.05);
    albedoContext.beginPath();
    albedoContext.moveTo(x, y);
    albedoContext.lineTo(
      x + Math.sin(angle) * length,
      y - Math.cos(angle) * length,
    );
    albedoContext.stroke();

    const rough = Math.floor(random.range(184, 244));
    roughnessContext.strokeStyle = `rgb(${rough}, ${rough}, ${rough})`;
    roughnessContext.globalAlpha = 0.55;
    roughnessContext.lineWidth = random.range(0.8, 2.1);
    roughnessContext.beginPath();
    roughnessContext.moveTo(x, y);
    roughnessContext.lineTo(
      x + Math.sin(angle) * length,
      y - Math.cos(angle) * length,
    );
    roughnessContext.stroke();

    const height = Math.floor(random.range(100, 210));
    bumpContext.strokeStyle = `rgb(${height}, ${height}, ${height})`;
    bumpContext.globalAlpha = 0.7;
    bumpContext.lineWidth = random.range(0.7, 1.6);
    bumpContext.beginPath();
    bumpContext.moveTo(x, y);
    bumpContext.lineTo(
      x + Math.sin(angle) * length,
      y - Math.cos(angle) * length,
    );
    bumpContext.stroke();
  }
  albedoContext.globalAlpha = 1;
  roughnessContext.globalAlpha = 1;
  bumpContext.globalAlpha = 1;

  const albedo = new CanvasTexture(albedoCanvas);
  const roughness = new CanvasTexture(roughnessCanvas);
  const bump = new CanvasTexture(bumpCanvas);
  albedo.colorSpace = SRGBColorSpace;
  configure(albedo, repeatX, repeatY);
  configure(roughness, repeatX, repeatY);
  configure(bump, repeatX, repeatY);
  return {
    albedo,
    roughness,
    bump,
    dispose: () => {
      albedo.dispose();
      roughness.dispose();
      bump.dispose();
    },
  };
}

export function createCartoonTileTextures(
  seed: number,
  baseColor: string,
  accentColor: string,
): TurfTextureSet {
  const size = 256;
  const random = createRandom(seed);
  const albedoCanvas = document.createElement("canvas");
  const roughnessCanvas = document.createElement("canvas");
  const bumpCanvas = document.createElement("canvas");
  for (const canvas of [albedoCanvas, roughnessCanvas, bumpCanvas]) {
    canvas.width = size;
    canvas.height = size;
  }
  const albedoContext = requireContext(albedoCanvas);
  const roughnessContext = requireContext(roughnessCanvas);
  const bumpContext = requireContext(bumpCanvas);
  albedoContext.fillStyle = baseColor;
  albedoContext.fillRect(0, 0, size, size);
  roughnessContext.fillStyle = "#e4e4e4";
  roughnessContext.fillRect(0, 0, size, size);
  bumpContext.fillStyle = "#808080";
  bumpContext.fillRect(0, 0, size, size);

  const base = new Color(baseColor);
  const accent = new Color(accentColor);
  for (let index = 0; index < 8; index += 1) {
    const patchColor = base
      .clone()
      .lerp(accent, random.range(0.18, 0.5))
      .offsetHSL(random.range(-0.018, 0.018), 0, random.range(-0.025, 0.035));
    albedoContext.fillStyle = `#${patchColor.getHexString()}`;
    albedoContext.globalAlpha = random.range(0.045, 0.1);
    albedoContext.beginPath();
    albedoContext.ellipse(
      random.range(0, size),
      random.range(0, size),
      random.range(28, 62),
      random.range(20, 46),
      random.range(0, Math.PI),
      0,
      Math.PI * 2,
    );
    albedoContext.fill();
  }

  for (let index = 0; index < 20; index += 1) {
    const x = random.range(5, size - 5);
    const y = random.range(5, size - 5);
    const height = random.range(7, 15);
    const lean = random.range(-5, 5);
    const strokeColor = accent
      .clone()
      .offsetHSL(random.range(-0.02, 0.02), 0, random.range(-0.04, 0.05));
    albedoContext.strokeStyle = `#${strokeColor.getHexString()}`;
    albedoContext.globalAlpha = random.range(0.22, 0.38);
    albedoContext.lineCap = "round";
    albedoContext.lineJoin = "round";
    albedoContext.lineWidth = random.range(3.2, 5.8);
    albedoContext.beginPath();
    albedoContext.moveTo(x - 2.5, y + 1.5);
    albedoContext.lineTo(x + lean * 0.35, y - height * 0.45);
    albedoContext.lineTo(x + lean, y - height);
    albedoContext.stroke();
  }
  albedoContext.globalAlpha = 1;
  bumpContext.globalAlpha = 1;

  const albedo = new CanvasTexture(albedoCanvas);
  const roughness = new CanvasTexture(roughnessCanvas);
  const bump = new CanvasTexture(bumpCanvas);
  albedo.colorSpace = SRGBColorSpace;
  configure(albedo, 1, 1);
  configure(roughness, 1, 1);
  configure(bump, 1, 1);
  return {
    albedo,
    roughness,
    bump,
    dispose: () => {
      albedo.dispose();
      roughness.dispose();
      bump.dispose();
    },
  };
}
