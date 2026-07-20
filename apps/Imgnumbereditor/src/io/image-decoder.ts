import {
  suggestCharacterFromFilename,
  type UploadedImageDraft,
} from "../model/editor-project.js";
import {
  allocateContentAddressedPath,
  detectRasterAssetType,
  sha256Hex,
  suggestLogicalResourceId,
} from "@slotclientengine/browserartifactio";

export async function decodeUploadedImage(
  file: File,
  id?: string,
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
  const detected = detectRasterAssetType(bytes);
  if (detected.mediaType !== mediaType)
    throw new Error(`文件扩展名与真实内容类型不一致：${file.name}`);
  const logicalId = id ?? suggestLogicalResourceId(file.name);
  if (!logicalId)
    throw new Error(`无法从 ${file.name} 建议 ASCII logical resource id。`);
  const digest = await sha256Hex(bytes);
  const contentPath = allocateContentAddressedPath({
    digest,
    extension: detected.extension,
  });
  const { width, height } = await decodeImageBlob(
    new Blob([bytes], { type: mediaType }),
    file.name,
  );
  return Object.freeze({
    id: logicalId,
    originalName: file.name,
    mediaType,
    bytes,
    width,
    height,
    suggestedCharacter: suggestCharacterFromFilename(file.name),
    digest,
    contentPath,
    provenance: {
      sourceNames: Object.freeze([file.name]),
      sourceKind: file.webkitRelativePath
        ? ("directory" as const)
        : ("files" as const),
      batchLabel: `image:${file.name}`,
    },
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
