import {
  CanvasTexture,
  DataTexture,
  NearestFilter,
  RedFormat,
  RepeatWrapping,
  SRGBColorSpace,
  TextureLoader,
  UnsignedByteType,
} from "three";
import type { Texture } from "three";
import { createRandom } from "./random.js";

export interface CastleTextureLibrary {
  readonly floorAlbedo: Texture;
  readonly woodAlbedo: Texture;
  readonly chestWoodAlbedo: Texture;
  readonly chestGoldAlbedo: Texture;
  readonly columnStoneAlbedo: Texture;
  readonly oakStavesAlbedo: Texture;
  readonly cutStoneAlbedo: Texture;
  readonly forgedIronAlbedo: Texture;
  readonly fabricAlbedo: Texture;
  readonly crimsonLeatherAlbedo: Texture;
  readonly parchmentPagesAlbedo: Texture;
  readonly stoneDetail: CanvasTexture;
  readonly woodDetail: CanvasTexture;
  readonly fabricDetail: CanvasTexture;
  readonly metalDetail: CanvasTexture;
  readonly toonGradient: DataTexture;
  dispose(): void;
}

function context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Canvas 2D is unavailable.");
  return context;
}

function configureTiledTexture(
  texture: Texture,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
): Texture {
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = anisotropy;
  return texture;
}

function loadAlbedo(
  path: string,
  repeatX: number,
  repeatY: number,
  anisotropy: number,
): Texture {
  const texture = configureTiledTexture(
    new TextureLoader().load(path),
    repeatX,
    repeatY,
    anisotropy,
  );
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function createToonGradient(): DataTexture {
  const gradient = new DataTexture(
    new Uint8Array([38, 72, 112, 158, 205, 244]),
    6,
    1,
    RedFormat,
    UnsignedByteType,
  );
  gradient.minFilter = NearestFilter;
  gradient.magFilter = NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

function createDetailTexture(
  seed: number,
  pattern: "stone" | "wood" | "fabric" | "metal",
  repeatX: number,
  repeatY: number,
  anisotropy: number,
): CanvasTexture {
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const context = context2d(canvas);
  const random = createRandom(seed);
  context.fillStyle = pattern === "metal" ? "#d1d1d1" : "#808080";
  context.fillRect(0, 0, size, size);

  if (pattern === "stone") {
    for (let index = 0; index < 340; index += 1) {
      const value = Math.floor(random.range(76, 178));
      context.fillStyle = `rgb(${value},${value},${value})`;
      context.globalAlpha = random.range(0.12, 0.5);
      context.beginPath();
      context.ellipse(
        random.range(0, size),
        random.range(0, size),
        random.range(0.6, 4.2),
        random.range(0.4, 2.3),
        random.range(0, Math.PI),
        0,
        Math.PI * 2,
      );
      context.fill();
    }
    for (let index = 0; index < 18; index += 1) {
      context.strokeStyle = "#454545";
      context.globalAlpha = random.range(0.28, 0.58);
      context.lineWidth = random.range(0.7, 1.6);
      context.beginPath();
      let x = random.range(0, size);
      let y = random.range(0, size);
      context.moveTo(x, y);
      for (let segment = 0; segment < random.integer(2, 4); segment += 1) {
        x += random.range(-14, 14);
        y += random.range(6, 22);
        context.lineTo(x, y);
      }
      context.stroke();
    }
  } else if (pattern === "wood") {
    for (let y = 0; y < size; y += 3) {
      const wave = Math.sin(y * 0.095) * 2.4 + Math.sin(y * 0.027) * 4.8;
      const value = Math.floor(112 + Math.sin(y * 0.18) * 18);
      context.strokeStyle = `rgb(${value},${value},${value})`;
      context.globalAlpha = 0.3;
      context.lineWidth = random.range(0.55, 1.4);
      context.beginPath();
      context.moveTo(0, y + wave);
      context.bezierCurveTo(70, y - wave, 170, y + wave, size, y - wave * 0.5);
      context.stroke();
    }
    for (let index = 0; index < 7; index += 1) {
      const x = random.range(10, size - 10);
      const y = random.range(8, size - 8);
      context.strokeStyle = "#4a4a4a";
      context.globalAlpha = 0.38;
      context.lineWidth = 1.5;
      context.beginPath();
      context.ellipse(
        x,
        y,
        random.range(4, 9),
        random.range(1.5, 3.4),
        0,
        0,
        Math.PI * 2,
      );
      context.stroke();
    }
  } else if (pattern === "fabric") {
    for (let offset = -size; offset < size * 2; offset += 5) {
      context.strokeStyle = offset % 10 === 0 ? "#a8a8a8" : "#626262";
      context.globalAlpha = 0.26;
      context.lineWidth = 1;
      context.beginPath();
      context.moveTo(offset, 0);
      context.lineTo(offset + size, size);
      context.stroke();
    }
  } else {
    for (let index = 0; index < 76; index += 1) {
      const value = Math.floor(random.range(110, 235));
      context.strokeStyle = `rgb(${value},${value},${value})`;
      context.globalAlpha = random.range(0.12, 0.42);
      context.lineWidth = random.range(0.35, 1.1);
      const x = random.range(0, size);
      const y = random.range(0, size);
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + random.range(7, 45), y + random.range(-2, 2));
      context.stroke();
    }
  }
  context.globalAlpha = 1;
  return configureTiledTexture(
    new CanvasTexture(canvas),
    repeatX,
    repeatY,
    anisotropy,
  ) as CanvasTexture;
}

export function createCastleTextureLibrary(
  maxAnisotropy: number,
): CastleTextureLibrary {
  const anisotropy = Math.min(maxAnisotropy, 8);
  const textures: Omit<CastleTextureLibrary, "dispose"> = {
    floorAlbedo: loadAlbedo(
      "/textures/cartoon-floor-stone.webp",
      2.15,
      3.8,
      anisotropy,
    ),
    woodAlbedo: loadAlbedo(
      "/textures/cartoon-dark-wood.webp",
      1.25,
      1.25,
      anisotropy,
    ),
    chestWoodAlbedo: loadAlbedo(
      "/textures/cartoon-chest-walnut.webp",
      1,
      1,
      anisotropy,
    ),
    chestGoldAlbedo: loadAlbedo(
      "/textures/cartoon-hammered-gold.webp",
      1.35,
      1.35,
      anisotropy,
    ),
    columnStoneAlbedo: loadAlbedo(
      "/textures/cartoon-column-purple-stone.webp",
      1,
      1.4,
      anisotropy,
    ),
    oakStavesAlbedo: loadAlbedo(
      "/textures/cartoon-oak-staves.webp",
      1.15,
      1.55,
      anisotropy,
    ),
    cutStoneAlbedo: loadAlbedo(
      "/textures/cartoon-castle-cut-stone.webp",
      1.2,
      1.2,
      anisotropy,
    ),
    forgedIronAlbedo: loadAlbedo(
      "/textures/cartoon-forged-iron.webp",
      1.25,
      1.25,
      anisotropy,
    ),
    fabricAlbedo: loadAlbedo(
      "/textures/cartoon-burgundy-fabric.webp",
      1.4,
      2.8,
      anisotropy,
    ),
    crimsonLeatherAlbedo: loadAlbedo(
      "/textures/cartoon-crimson-leather.webp",
      1.3,
      1.3,
      anisotropy,
    ),
    parchmentPagesAlbedo: loadAlbedo(
      "/textures/cartoon-parchment-pages.webp",
      1.1,
      2.4,
      anisotropy,
    ),
    stoneDetail: createDetailTexture(0x570ae, "stone", 1.2, 1.2, anisotropy),
    woodDetail: createDetailTexture(0xb00d, "wood", 1.2, 1.2, anisotropy),
    fabricDetail: createDetailTexture(0xfab1c, "fabric", 2, 3, anisotropy),
    metalDetail: createDetailTexture(0x6e7a1, "metal", 1.5, 1.5, anisotropy),
    toonGradient: createToonGradient(),
  };
  return {
    ...textures,
    dispose: () => {
      for (const texture of Object.values(textures)) texture.dispose();
    },
  };
}
