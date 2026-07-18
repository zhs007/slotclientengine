import {
  suggestCharacterFromFilename,
  type UploadedImageDraft,
} from "../model/editor-project.js";

export async function decodeUploadedImage(
  file: File,
  id: string = crypto.randomUUID(),
): Promise<UploadedImageDraft> {
  const extension = file.name.toLowerCase().match(/\.(png|webp)$/u)?.[1];
  const mediaType =
    extension === "webp"
      ? "image/webp"
      : extension === "png"
        ? "image/png"
        : null;
  if (!mediaType) throw new Error(`只接受 PNG/WebP：${file.name}`);
  if (file.type && file.type !== mediaType)
    throw new Error(`文件扩展名与 MIME 不一致：${file.name}`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const { width, height } = await decodeImageBlob(
    new Blob([bytes], { type: mediaType }),
    file.name,
  );
  return Object.freeze({
    id,
    originalName: file.name,
    mediaType,
    bytes,
    width,
    height,
    suggestedCharacter: suggestCharacterFromFilename(file.name),
  });
}

export async function decodeImageBlob(
  blob: Blob,
  label: string,
): Promise<{ readonly width: number; readonly height: number }> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      const result = { width: bitmap.width, height: bitmap.height };
      bitmap.close();
      return result;
    } catch (error) {
      throw new Error(`图片解码失败 ${label}：${formatError(error)}`);
    }
  }
  const url = URL.createObjectURL(blob);
  try {
    return await new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () =>
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error(`图片解码失败：${label}`));
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
