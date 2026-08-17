import {
  compileAudioCueTable,
  type AudioCueV1,
  type CompiledAudioCueTable,
} from "../data/index.js";

export type AudioCueSink = (cue: AudioCueV1) => void;

export interface AudioCueTimeline {
  readonly generation: number;
  update(localTimeSeconds: number): void;
  skipTo(localTimeSeconds: number): void;
  cancel(): void;
  destroy(): void;
}

export function createAudioCueTimeline(options: {
  readonly cues: readonly AudioCueV1[] | CompiledAudioCueTable;
  readonly sink: AudioCueSink;
  readonly generation?: number;
}): AudioCueTimeline {
  const table =
    "cues" in options.cues ? options.cues : compileAudioCueTable(options.cues);
  return new DefaultAudioCueTimeline(
    table,
    options.sink,
    options.generation ?? 1,
  );
}

class DefaultAudioCueTimeline implements AudioCueTimeline {
  readonly generation: number;
  readonly #table: CompiledAudioCueTable;
  readonly #sink: AudioCueSink;
  #time = 0;
  #cursor = 0;
  #cancelled = false;
  #destroyed = false;

  constructor(
    table: CompiledAudioCueTable,
    sink: AudioCueSink,
    generation: number,
  ) {
    if (!Number.isSafeInteger(generation) || generation <= 0)
      throw new Error("audio cue generation must be a positive safe integer.");
    this.#table = table;
    this.#sink = sink;
    this.generation = generation;
  }

  update(localTimeSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(localTimeSeconds) || localTimeSeconds < this.#time)
      throw new Error("audio cue local time must be finite and monotonic.");
    if (this.#cancelled) return;
    while (this.#cursor < this.#table.cues.length) {
      const cue = this.#table.cues[this.#cursor]!;
      if (cue.offsetSeconds > localTimeSeconds) break;
      this.#cursor += 1;
      if (
        cue.offsetSeconds > this.#time ||
        (this.#time === 0 && cue.offsetSeconds === 0)
      )
        this.#sink(cue);
    }
    this.#time = localTimeSeconds;
  }

  skipTo(localTimeSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(localTimeSeconds) || localTimeSeconds < this.#time)
      throw new Error("audio cue skip time must be finite and monotonic.");
    while (
      this.#cursor < this.#table.cues.length &&
      this.#table.cues[this.#cursor]!.offsetSeconds <= localTimeSeconds
    )
      this.#cursor += 1;
    this.#time = localTimeSeconds;
  }

  cancel(): void {
    if (!this.#destroyed) this.#cancelled = true;
  }

  destroy(): void {
    this.#destroyed = true;
    this.#cancelled = true;
  }

  private assertAlive(): void {
    if (this.#destroyed) throw new Error("audio cue timeline is destroyed.");
  }
}
