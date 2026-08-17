import {
  assertEditorAssetKey,
  extensionOfEditorAssetKey,
  type EditorAdapterCandidate,
  type EditorFormatAdapter,
  type EditorImportSourceFile,
} from "@slotclientengine/editorresource";
import type { AudioMediaType } from "../data/index.js";

export interface AudioImportMetadata {
  readonly mediaType: AudioMediaType;
  readonly extension: string;
}

const MEDIA_BY_EXTENSION: Readonly<Record<string, AudioMediaType>> =
  Object.freeze({
    mp3: "audio/mpeg",
    ogg: "audio/ogg",
    wav: "audio/wav",
    m4a: "audio/mp4",
    mp4: "audio/mp4",
    aac: "audio/aac",
    webm: "audio/webm",
  });

export const audioEditorFormatAdapter: EditorFormatAdapter<AudioImportMetadata> =
  Object.freeze({
    id: "audio-v1",
    discover(
      files: readonly EditorImportSourceFile[],
    ): readonly EditorAdapterCandidate<AudioImportMetadata>[] {
      return Object.freeze(
        files.flatMap((file) => {
          const extension = extensionOfEditorAssetKey(file.key);
          const expected = MEDIA_BY_EXTENSION[extension];
          if (!expected) return [];
          const detected = detectAudioMediaType(file.bytes);
          const diagnostics =
            detected === expected
              ? []
              : [
                  `audio signature 与扩展名不匹配：${file.key} expected=${expected}, detected=${detected ?? "unknown"}`,
                ];
          return [
            Object.freeze({
              adapterId: "audio-v1",
              rootKey: assertEditorAssetKey(file.key),
              exactKeys: Object.freeze([assertEditorAssetKey(file.key)]),
              parsed: Object.freeze({ mediaType: expected, extension }),
              diagnostics: Object.freeze(diagnostics),
            }),
          ];
        }),
      );
    },
  });

export function detectAudioMediaType(bytes: Uint8Array): AudioMediaType | null {
  if (
    starts(bytes, [0x49, 0x44, 0x33]) ||
    (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0)
  )
    return "audio/mpeg";
  if (text(bytes, 0, 4) === "OggS") return "audio/ogg";
  if (text(bytes, 0, 4) === "RIFF" && text(bytes, 8, 4) === "WAVE")
    return "audio/wav";
  if (bytes.length >= 12 && text(bytes, 4, 4) === "ftyp") return "audio/mp4";
  if (starts(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return "audio/webm";
  if (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xf6) === 0xf0)
    return "audio/aac";
  return null;
}

export function mediaTypeForAudioFilenameKey(key: string): AudioMediaType {
  const extension = extensionOfEditorAssetKey(assertEditorAssetKey(key));
  const mediaType = MEDIA_BY_EXTENSION[extension];
  if (!mediaType)
    throw new Error(`unsupported audio filename extension: ${key}`);
  return mediaType;
}

function starts(bytes: Uint8Array, signature: readonly number[]): boolean {
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}
function text(bytes: Uint8Array, offset: number, length: number): string {
  if (bytes.length < offset + length) return "";
  return String.fromCharCode(...bytes.slice(offset, offset + length));
}
