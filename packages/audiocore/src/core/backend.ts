import type { AudioMediaType } from "../data/index.js";

export interface AudioBackendSource {
  readonly url: string;
  readonly mediaType: AudioMediaType;
}

export interface AudioBackendInstance {
  volume: number;
  paused: boolean;
  stop(): void;
  onEnded(listener: () => void): () => void;
}

export interface AudioBackendSound {
  play(options: {
    readonly loop: boolean;
    readonly volume: number;
  }): AudioBackendInstance | Promise<AudioBackendInstance>;
  destroy(): void;
}

export interface AudioBackend {
  prepare(sources: readonly AudioBackendSource[]): Promise<AudioBackendSound>;
  unlock(): Promise<void>;
}
