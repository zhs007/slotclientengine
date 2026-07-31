import type { SymbolStateTexturePixels } from "@slotclientengine/rendercore/symbol";

export const MAX_GENERATED_IMAGE_PIXELS = 16_777_216;

export async function decodeBrowserImage(
  bytes: Uint8Array,
): Promise<SymbolStateTexturePixels> {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength === 0)
    throw new Error("待生成的 normal 图片 bytes 不能为空。");
  const blob = new Blob([bytes as BlobPart]);
  let source: CanvasImageSource;
  let width: number;
  let height: number;
  let release: () => void;
  if (typeof globalThis.createImageBitmap === "function") {
    const bitmap = await globalThis.createImageBitmap(blob);
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
    release = () => bitmap.close();
  } else {
    const loaded = await loadHtmlImage(blob);
    source = loaded.image;
    width = loaded.image.naturalWidth;
    height = loaded.image.naturalHeight;
    release = loaded.release;
  }
  try {
    assertPixelBudget(width, height);
    const canvas = createCanvas(width, height);
    const context = require2dContext(canvas);
    context.clearRect(0, 0, width, height);
    context.drawImage(source, 0, 0, width, height);
    const image = context.getImageData(0, 0, width, height);
    return Object.freeze({
      width,
      height,
      data: new Uint8ClampedArray(image.data),
    });
  } catch (error) {
    throw new Error(`normal 图片浏览器解码失败：${formatError(error)}`);
  } finally {
    release();
  }
}

export async function encodeBrowserPng(
  pixels: SymbolStateTexturePixels,
): Promise<Uint8Array> {
  assertPixelBudget(pixels.width, pixels.height);
  if (
    !(pixels.data instanceof Uint8ClampedArray) ||
    pixels.data.length !== pixels.width * pixels.height * 4
  ) {
    throw new Error("待编码 RGBA 长度与 width/height 不一致。");
  }
  const canvas = createCanvas(pixels.width, pixels.height);
  const context = require2dContext(canvas);
  const image = context.createImageData(pixels.width, pixels.height);
  image.data.set(pixels.data);
  context.putImageData(image, 0, 0);
  try {
    const blob = isOffscreenCanvas(canvas)
      ? await canvas.convertToBlob({ type: "image/png" })
      : await htmlCanvasToBlob(canvas);
    if (blob.type && blob.type !== "image/png")
      throw new Error(`浏览器返回了非 PNG media type：${blob.type}。`);
    return new Uint8Array(await blob.arrayBuffer());
  } catch (error) {
    throw new Error(`state texture PNG 编码失败：${formatError(error)}`);
  }
}

function assertPixelBudget(width: number, height: number): void {
  if (
    !Number.isSafeInteger(width) ||
    !Number.isSafeInteger(height) ||
    width <= 0 ||
    height <= 0
  ) {
    throw new Error("图片 width/height 必须是正安全整数。");
  }
  const pixels = width * height;
  if (!Number.isSafeInteger(pixels) || pixels > MAX_GENERATED_IMAGE_PIXELS)
    throw new Error(
      `图片像素数 ${pixels} 超过浏览器生成上限 ${MAX_GENERATED_IMAGE_PIXELS}。`,
    );
}

function createCanvas(
  width: number,
  height: number,
): HTMLCanvasElement | OffscreenCanvas {
  if (typeof globalThis.OffscreenCanvas === "function")
    return new globalThis.OffscreenCanvas(width, height);
  if (!globalThis.document) throw new Error("当前环境没有可用的 Canvas。");
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function require2dContext(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D {
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("无法创建 2D Canvas context。");
  return context as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D;
}

function isOffscreenCanvas(
  canvas: HTMLCanvasElement | OffscreenCanvas,
): canvas is OffscreenCanvas {
  return (
    typeof globalThis.OffscreenCanvas === "function" &&
    canvas instanceof globalThis.OffscreenCanvas
  );
}

async function loadHtmlImage(
  blob: Blob,
): Promise<{ readonly image: HTMLImageElement; readonly release: () => void }> {
  if (typeof globalThis.Image !== "function")
    throw new Error("当前浏览器不支持 ImageBitmap 或 HTMLImageElement。");
  const url = URL.createObjectURL(blob);
  const image = new globalThis.Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error("HTMLImageElement decode 失败。"));
      image.src = url;
    });
    return Object.freeze({
      image,
      release: () => URL.revokeObjectURL(url),
    });
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

async function htmlCanvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("HTMLCanvasElement.toBlob 返回 null。")),
      "image/png",
    );
  });
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
