import {
  parseAudioEffectBindingV1,
  type AudioBgmFocusPolicyV1,
  type AudioEffectBindingV1,
  type AudioMediaType,
} from "../data/index.js";
import {
  createAudioRuntime,
  type AudioBackend,
  type AudioPlaybackHandle,
  type AudioRuntime,
} from "../core/index.js";

export interface AudioEffectDraftV1 {
  readonly name: string;
  readonly path: string;
  readonly mediaType: AudioMediaType;
  readonly playback: "once" | "loop";
  readonly offsetSeconds: number;
  readonly maxConcurrent: number;
  readonly overflow: "reject" | "restart-oldest";
  readonly bgm: AudioBgmFocusPolicyV1;
}

export interface AudioEffectFieldDescriptor {
  readonly key: keyof AudioEffectDraftV1;
  readonly label: string;
  readonly kind: "text" | "number" | "select" | "asset" | "focus";
  readonly options?: readonly string[];
}

export const AUDIO_EFFECT_FIELD_DESCRIPTORS: readonly AudioEffectFieldDescriptor[] =
  Object.freeze([
    { key: "name", label: "音效名称", kind: "text" },
    { key: "path", label: "音频资源", kind: "asset" },
    {
      key: "mediaType",
      label: "媒体格式",
      kind: "select",
      options: [
        "audio/mpeg",
        "audio/ogg",
        "audio/wav",
        "audio/mp4",
        "audio/aac",
        "audio/webm",
      ],
    },
    {
      key: "playback",
      label: "播放方式",
      kind: "select",
      options: ["once", "loop"],
    },
    { key: "offsetSeconds", label: "延迟（秒）", kind: "number" },
    { key: "maxConcurrent", label: "最大并发", kind: "number" },
    {
      key: "overflow",
      label: "并发溢出",
      kind: "select",
      options: ["reject", "restart-oldest"],
    },
    { key: "bgm", label: "BGM 行为", kind: "focus" },
  ]);

export function createAudioEffectDraft(
  overrides: Partial<AudioEffectDraftV1> = {},
): AudioEffectDraftV1 {
  return Object.freeze({
    name: "effect",
    path: "effect.mp3",
    mediaType: "audio/mpeg",
    playback: "once",
    offsetSeconds: 0,
    maxConcurrent: 4,
    overflow: "reject",
    bgm: Object.freeze({ kind: "keep" as const }),
    ...overrides,
  });
}

export function materializeAudioEffectDraft(
  draft: AudioEffectDraftV1,
): AudioEffectBindingV1 {
  return parseAudioEffectBindingV1({
    name: draft.name,
    asset: { sources: [{ path: draft.path, mediaType: draft.mediaType }] },
    playback: draft.playback,
    offsetSeconds: draft.offsetSeconds,
    voices: {
      maxConcurrent: draft.playback === "loop" ? 1 : draft.maxConcurrent,
      overflow: draft.overflow,
    },
    bgm: draft.bgm,
  });
}

export interface AudioEffectPreviewSession {
  play(): AudioPlaybackHandle;
  stop(): void;
  update(deltaSeconds: number): void;
  unlock(): Promise<void>;
  destroy(): void;
}

export function createAudioEffectPreviewSession(options: {
  readonly backend: AudioBackend;
  readonly effect: AudioEffectBindingV1;
  readonly resolveUrl: (path: string) => string;
}): AudioEffectPreviewSession {
  const route = options.effect.name;
  const runtime: AudioRuntime = createAudioRuntime({
    backend: options.backend,
    effects: {
      [route]: {
        binding: options.effect,
        sources: options.effect.asset.sources.map(({ path, mediaType }) => ({
          url: options.resolveUrl(path),
          mediaType,
        })),
      },
    },
  });
  let destroyed = false;
  return Object.freeze({
    play: () => {
      if (destroyed)
        throw new Error("audio effect preview session is destroyed.");
      return runtime.playEffect(route);
    },
    stop: () => {
      if (!destroyed) runtime.stopEffect(route);
    },
    update: (deltaSeconds: number) => {
      if (!destroyed) runtime.update(deltaSeconds);
    },
    unlock: () => runtime.unlock(),
    destroy: () => {
      if (destroyed) return;
      destroyed = true;
      runtime.destroy();
    },
  });
}
