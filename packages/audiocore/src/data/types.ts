export const AUDIO_MANIFEST_VERSION = 1 as const;

export type AudioMediaType =
  | "audio/mpeg"
  | "audio/ogg"
  | "audio/wav"
  | "audio/mp4"
  | "audio/aac"
  | "audio/webm";

export interface AudioSourceV1 {
  readonly path: string;
  readonly mediaType: AudioMediaType;
}

export interface AudioAssetV1 {
  readonly sources: readonly AudioSourceV1[];
}

export interface AudioVoicePolicyV1 {
  readonly maxConcurrent: number;
  readonly overflow: "reject" | "restart-oldest";
}

export type AudioBgmFocusPolicyV1 =
  | { readonly kind: "keep" }
  | {
      readonly kind: "duck";
      readonly targetGain: number;
      readonly attackSeconds: number;
      readonly releaseSeconds: number;
    }
  | {
      readonly kind: "pause";
      readonly fadeOutSeconds: number;
      readonly fadeInSeconds: number;
    };

export interface AudioEffectBindingV1 {
  readonly name: string;
  readonly asset: AudioAssetV1;
  readonly playback: "once" | "loop";
  readonly offsetSeconds: number;
  readonly voices: AudioVoicePolicyV1;
  readonly bgm: AudioBgmFocusPolicyV1;
}

export interface AudioMusicBindingV1 {
  readonly name: string;
  readonly asset: AudioAssetV1;
  readonly loop: true;
  readonly fadeOutSeconds: number;
  readonly fadeInSeconds: number;
}

export interface AudioEffectManifestV1 {
  readonly version: 1;
  readonly effects: readonly AudioEffectBindingV1[];
}

export interface AudioCatalogManifestV1 extends AudioEffectManifestV1 {
  readonly music: readonly AudioMusicBindingV1[];
  readonly programmaticEffects: readonly string[];
}

export interface AudioCueV1 {
  readonly id: string;
  readonly effect: string;
  readonly offsetSeconds: number;
}

export interface CompiledAudioCueTable {
  readonly cues: readonly AudioCueV1[];
}

export interface CompiledAudioEffectRoute {
  readonly route: string;
  readonly owner: string;
  readonly localName: string;
  readonly effect: AudioEffectBindingV1;
}
