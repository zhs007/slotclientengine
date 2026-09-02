import type {
  AudioBgmFocusPolicyV1,
  AudioEffectBindingV1,
  AudioEventTrackBindingV1,
  AudioEventTrackFocusV1,
  AudioMusicBindingV1,
  AudioVoicePolicyV1,
} from "../data/index.js";
import type {
  AudioBackend,
  AudioBackendActivityState,
  AudioBackendInstance,
  AudioBackendSound,
  AudioBackendSource,
} from "./backend.js";

export interface ResolvedAudioEffect {
  readonly binding: AudioEffectBindingV1;
  readonly sources: readonly AudioBackendSource[];
}

export interface ResolvedAudioMusic {
  readonly binding: AudioMusicBindingV1;
  readonly sources: readonly AudioBackendSource[];
}

export interface ResolvedAudioEventTrack {
  readonly binding: AudioEventTrackBindingV1;
  readonly sources: readonly AudioBackendSource[];
}

export type AudioPlaybackState =
  "pending" | "playing" | "ended" | "stopped" | "failed";

export interface AudioPlaybackHandle {
  readonly id: number;
  readonly route: string;
  readonly state: AudioPlaybackState;
  readonly error: unknown | null;
  readonly finished: Promise<AudioPlaybackState>;
  stop(): void;
}

export interface AudioRuntimeSnapshot {
  readonly activity: AudioBackendActivityState;
  readonly pendingEffects: number;
  readonly activeEffects: number;
  readonly preparedSounds: number;
  readonly activeMusic: string | null;
  readonly musicVoices: number;
  readonly focus: "keep" | "duck" | "pause";
  readonly focusGain: number;
}

export interface AudioMusicLifecycleEvent {
  readonly name: string;
  readonly phase: "started" | "stopped";
}

export interface AudioEffectPlayOptions {
  readonly delaySeconds?: number;
  /** Overrides the authored playback mode for this invocation. */
  readonly loop?: boolean;
}

/** Internal source seam used by package owners that resolve media lazily. */
export interface AudioDeferredEffect {
  readonly resolveSources: () => Promise<readonly AudioBackendSource[]>;
  readonly voices: AudioVoicePolicyV1;
  readonly bgm: AudioBgmFocusPolicyV1;
}

export interface AudioRuntime {
  prepare(routes: readonly string[]): Promise<void>;
  playEffect(
    route: string,
    options?: AudioEffectPlayOptions,
  ): AudioPlaybackHandle;
  /** Starts an effect whose package-owned media URL may not exist yet. */
  playDeferredEffect(
    route: string,
    effect: AudioDeferredEffect,
    options?: AudioEffectPlayOptions,
  ): AudioPlaybackHandle;
  stopDeferredEffect(route: string): void;
  stopEffect(route: string): void;
  playTrack(name: string): AudioPlaybackHandle;
  stopTrack(name: string): void;
  requestMusic(name: string | null): Promise<void>;
  observeMusic(listener: (event: AudioMusicLifecycleEvent) => void): () => void;
  update(deltaSeconds: number): void;
  unlock(): Promise<void>;
  setMasterMuted(muted: boolean): void;
  setMusicVolume(volume: number): void;
  setEffectVolume(volume: number): void;
  getSnapshot(): AudioRuntimeSnapshot;
  destroy(): void;
}

interface EffectPlaybackPolicy {
  readonly playback: "once" | "loop";
  readonly voices: AudioVoicePolicyV1;
  readonly category: "music" | "effect";
  readonly legacyBgmFocus: AudioBgmFocusPolicyV1 | null;
  readonly eventFocus: AudioEventTrackFocusV1 | null;
}

interface ResolvedEffectPlayback extends EffectPlaybackPolicy {
  readonly sources: readonly AudioBackendSource[];
}

interface PendingEffect {
  readonly handle: MutablePlaybackHandle;
  readonly playbackKey: string;
  readonly policy: EffectPlaybackPolicy;
  resolved: ResolvedEffectPlayback | null;
  remainingSeconds: number;
  sound: AudioBackendSound | null;
  ready: boolean;
  starting: boolean;
  cancelled: boolean;
}

interface ActiveEffect {
  readonly handle: MutablePlaybackHandle;
  readonly playbackKey: string;
  readonly resolved: ResolvedEffectPlayback;
  readonly instance: AudioBackendInstance;
  readonly disposeEnded: () => void;
  readonly sequence: number;
}

interface MusicVoice {
  readonly id: number;
  readonly name: string;
  readonly binding: AudioMusicBindingV1;
  readonly instance: AudioBackendInstance;
  readonly sourceIdentity: string;
  transitionGain: number;
  startGain: number;
  targetGain: number;
  elapsedSeconds: number;
  durationSeconds: number;
  stopping: boolean;
}

class MutablePlaybackHandle implements AudioPlaybackHandle {
  readonly id: number;
  readonly route: string;
  state: AudioPlaybackState = "pending";
  error: unknown | null = null;
  readonly finished: Promise<AudioPlaybackState>;
  readonly #stop: () => void;
  #resolve!: (state: AudioPlaybackState) => void;
  #settled = false;

  constructor(id: number, route: string, stop: () => void) {
    this.id = id;
    this.route = route;
    this.#stop = stop;
    this.finished = new Promise((resolve) => {
      this.#resolve = resolve;
    });
  }

  stop(): void {
    this.#stop();
  }
  settle(
    state: Extract<AudioPlaybackState, "ended" | "stopped" | "failed">,
    error: unknown = null,
  ): void {
    if (this.#settled) return;
    this.#settled = true;
    this.state = state;
    this.error = error;
    this.#resolve(state);
  }
}

export function createAudioRuntime(options: {
  readonly backend: AudioBackend;
  readonly effects: Readonly<Record<string, ResolvedAudioEffect>>;
  readonly music?: Readonly<Record<string, ResolvedAudioMusic>>;
  readonly tracks?: Readonly<Record<string, ResolvedAudioEventTrack>>;
}): AudioRuntime {
  return new DefaultAudioRuntime(
    options.backend,
    options.effects,
    options.music ?? {},
    options.tracks ?? {},
  );
}

class DefaultAudioRuntime implements AudioRuntime {
  readonly #backend: AudioBackend;
  readonly #effects: Readonly<Record<string, ResolvedAudioEffect>>;
  readonly #music: Readonly<Record<string, ResolvedAudioMusic>>;
  readonly #tracks: Readonly<Record<string, ResolvedAudioEventTrack>>;
  readonly #sounds = new Map<string, AudioBackendSound>();
  readonly #preparing = new Map<string, Promise<AudioBackendSound>>();
  readonly #pending = new Map<number, PendingEffect>();
  readonly #active = new Map<number, ActiveEffect>();
  readonly #focus = new Map<number, AudioBgmFocusPolicyV1>();
  readonly #musicVoices: MusicVoice[] = [];
  readonly #musicListeners = new Set<
    (event: AudioMusicLifecycleEvent) => void
  >();
  readonly #musicActivityWaiters = new Set<() => void>();
  readonly #disposeActivity: () => void;
  #nextId = 1;
  #nextMusicVoiceId = -1;
  #sequence = 1;
  #masterMuted = false;
  #musicVolume = 1;
  #effectVolume = 1;
  #focusGain = 1;
  #focusStartGain = 1;
  #focusTargetGain = 1;
  #focusElapsedSeconds = 0;
  #focusDurationSeconds = 0;
  #focusKind: "keep" | "duck" | "pause" = "keep";
  #activity: AudioBackendActivityState;
  #currentMusic: string | null = null;
  #musicRequest = 0;
  #destroyed = false;

  constructor(
    backend: AudioBackend,
    effects: Readonly<Record<string, ResolvedAudioEffect>>,
    music: Readonly<Record<string, ResolvedAudioMusic>>,
    tracks: Readonly<Record<string, ResolvedAudioEventTrack>>,
  ) {
    this.#backend = backend;
    this.#effects = Object.freeze({ ...effects });
    this.#music = Object.freeze({ ...music });
    this.#tracks = Object.freeze({ ...tracks });
    this.#activity = backend.getActivityState();
    this.#disposeActivity = backend.observeActivity((state) =>
      this.setActivity(state),
    );
  }

  async prepare(routes: readonly string[]): Promise<void> {
    this.assertAlive();
    await Promise.all(
      routes.map((route) => {
        const effect = this.#effects[route];
        if (!effect) throw new Error(`unknown audio effect route: ${route}`);
        return this.prepareSound(`effect:${route}`, effect.sources);
      }),
    );
  }

  playEffect(
    route: string,
    options: AudioEffectPlayOptions = {},
  ): AudioPlaybackHandle {
    this.assertAlive();
    assertLoopOption(options.loop);
    const resolved = this.#effects[route];
    if (!resolved) throw new Error(`unknown audio effect route: ${route}`);
    const delaySeconds = options.delaySeconds ?? resolved.binding.offsetSeconds;
    const playback =
      options.loop === undefined
        ? resolved.binding.playback
        : options.loop
          ? "loop"
          : "once";
    return this.startPlayback({
      playbackKey: `effect:${route}`,
      route,
      policy: effectPolicy(resolved, playback),
      sources: resolved.sources,
      delaySeconds,
    });
  }

  playDeferredEffect(
    route: string,
    effect: AudioDeferredEffect,
    options: AudioEffectPlayOptions = {},
  ): AudioPlaybackHandle {
    this.assertAlive();
    assertLoopOption(options.loop);
    if (typeof route !== "string" || route.length === 0)
      throw new Error("audio deferred effect route must be non-empty.");
    const playback = options.loop ? "loop" : "once";
    return this.startPlayback({
      playbackKey: `effect:${route}`,
      route,
      policy: {
        playback,
        voices:
          playback === "loop"
            ? { ...effect.voices, maxConcurrent: 1 }
            : effect.voices,
        category: "effect",
        legacyBgmFocus: effect.bgm,
        eventFocus: null,
      },
      resolveSources: effect.resolveSources,
      delaySeconds: options.delaySeconds ?? 0,
    });
  }

  stopDeferredEffect(route: string): void {
    this.assertAlive();
    if (typeof route !== "string" || route.length === 0)
      throw new Error("audio deferred effect route must be non-empty.");
    this.stopPlaybackKey(`effect:${route}`);
  }

  stopEffect(route: string): void {
    this.assertAlive();
    if (!this.#effects[route])
      throw new Error(`unknown audio effect route: ${route}`);
    this.stopPlaybackKey(`effect:${route}`);
  }

  playTrack(name: string): AudioPlaybackHandle {
    this.assertAlive();
    const resolved = this.#tracks[name];
    if (!resolved) throw new Error(`unknown audio event track: ${name}`);
    return this.startPlayback({
      playbackKey: `track:${name}`,
      route: name,
      policy: eventTrackPolicy(resolved),
      sources: resolved.sources,
      delaySeconds: 0,
    });
  }

  stopTrack(name: string): void {
    this.assertAlive();
    if (!this.#tracks[name])
      throw new Error(`unknown audio event track: ${name}`);
    this.stopPlaybackKey(`track:${name}`);
  }

  async requestMusic(name: string | null): Promise<void> {
    this.assertAlive();
    if (name === this.#currentMusic) return;
    const request = ++this.#musicRequest;
    this.wakeMusicActivityWaiters();
    if (name === null) {
      this.#currentMusic = null;
      for (const voice of this.#musicVoices)
        this.rampMusic(voice, 0, voice.binding.fadeOutSeconds, true);
      return;
    }
    const resolved = this.#music[name];
    if (!resolved) throw new Error(`unknown audio music binding: ${name}`);
    this.#currentMusic = name;
    try {
      const sound = await this.prepareSound(`music:${name}`, resolved.sources);
      this.assertAlive();
      if (request !== this.#musicRequest) return;
      await this.restartMusicRequest(request, name, resolved, sound);
    } catch (error) {
      if (request === this.#musicRequest) this.#currentMusic = null;
      throw new Error(
        `failed to start audio music ${name}: ${formatError(error)}`,
      );
    }
  }

  observeMusic(
    listener: (event: AudioMusicLifecycleEvent) => void,
  ): () => void {
    this.assertAlive();
    this.#musicListeners.add(listener);
    let active = true;
    return () => {
      if (!active) return;
      active = false;
      this.#musicListeners.delete(listener);
    };
  }

  update(deltaSeconds: number): void {
    this.assertAlive();
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0)
      throw new Error(
        "audio runtime deltaSeconds must be finite and non-negative.",
      );
    if (this.#activity === "suspended") return;
    for (const pending of this.#pending.values()) {
      pending.remainingSeconds = Math.max(
        0,
        pending.remainingSeconds - deltaSeconds,
      );
      this.tryStartPending(pending);
    }
    this.updateFocus(deltaSeconds);
    for (let index = this.#musicVoices.length - 1; index >= 0; index -= 1) {
      const voice = this.#musicVoices[index]!;
      if (voice.transitionGain !== voice.targetGain) {
        voice.elapsedSeconds += deltaSeconds;
        const progress =
          voice.durationSeconds === 0
            ? 1
            : Math.min(1, voice.elapsedSeconds / voice.durationSeconds);
        voice.transitionGain =
          voice.startGain + (voice.targetGain - voice.startGain) * progress;
      }
      if (voice.stopping && voice.transitionGain === 0) {
        voice.instance.stop();
        this.#musicVoices.splice(index, 1);
        this.emitMusic(voice.name, "stopped");
      }
    }
    this.applyEffectVolumes();
    this.applyMusicState();
  }

  async unlock(): Promise<void> {
    this.assertAlive();
    await this.#backend.unlock();
  }

  setMasterMuted(muted: boolean): void {
    this.assertAlive();
    this.#masterMuted = muted;
    this.applyEffectVolumes();
    this.applyMusicState();
  }
  setMusicVolume(volume: number): void {
    this.#musicVolume = unit(volume, "music volume");
    this.applyEffectVolumes();
    this.applyMusicState();
  }
  setEffectVolume(volume: number): void {
    this.#effectVolume = unit(volume, "effect volume");
    this.applyEffectVolumes();
  }

  getSnapshot(): AudioRuntimeSnapshot {
    return Object.freeze({
      activity: this.#activity,
      pendingEffects: this.#pending.size,
      activeEffects: this.#active.size,
      preparedSounds: this.#sounds.size,
      activeMusic: this.#currentMusic,
      musicVoices: this.#musicVoices.length,
      focus: this.#focusKind,
      focusGain: this.#focusGain,
    });
  }

  destroy(): void {
    if (this.#destroyed) return;
    this.#disposeActivity();
    this.#destroyed = true;
    this.wakeMusicActivityWaiters();
    this.#musicListeners.clear();
    for (const pending of this.#pending.values()) {
      pending.cancelled = true;
      pending.handle.settle("stopped");
    }
    this.#pending.clear();
    for (const active of [...this.#active.values()])
      this.finishActive(active, "stopped", true);
    for (const voice of this.#musicVoices) voice.instance.stop();
    this.#musicVoices.length = 0;
    this.#focus.clear();
    for (const sound of this.#sounds.values()) sound.destroy();
    this.#sounds.clear();
    this.#preparing.clear();
    this.#currentMusic = null;
  }

  private emitMusic(
    name: string,
    phase: AudioMusicLifecycleEvent["phase"],
  ): void {
    const event = Object.freeze({ name, phase });
    for (const listener of [...this.#musicListeners]) listener(event);
  }

  private startPlayback(options: {
    readonly playbackKey: string;
    readonly route: string;
    readonly policy: EffectPlaybackPolicy;
    readonly sources?: readonly AudioBackendSource[];
    readonly resolveSources?: () => Promise<readonly AudioBackendSource[]>;
    readonly delaySeconds: number;
  }): AudioPlaybackHandle {
    const { playbackKey, route, policy, delaySeconds } = options;
    if (!Number.isFinite(delaySeconds) || delaySeconds < 0)
      throw new Error(
        "audio effect delaySeconds must be finite and non-negative.",
      );
    if (policy.playback === "once" && this.#activity === "suspended")
      return this.stoppedHandle(route);
    if (policy.playback === "loop") {
      const existing = [
        ...this.#pending.values(),
        ...this.#active.values(),
      ].find(
        (entry) =>
          entry.playbackKey === playbackKey &&
          ("policy" in entry
            ? entry.policy.playback
            : entry.resolved.playback) === "loop",
      );
      if (existing) return existing.handle;
    }
    const current = this.activeForKey(playbackKey);
    if (
      policy.playback === "once" &&
      current.length >= policy.voices.maxConcurrent
    ) {
      if (policy.voices.overflow === "reject")
        return this.failedHandle(
          route,
          new Error(`audio voice limit reached: ${route}`),
        );
      this.stopById(current[0]!.handle.id);
    }
    const id = this.#nextId++;
    const handle = new MutablePlaybackHandle(id, route, () =>
      this.stopById(id),
    );
    const pending: PendingEffect = {
      handle,
      playbackKey,
      policy,
      resolved: null,
      remainingSeconds: delaySeconds,
      sound: null,
      ready: false,
      starting: false,
      cancelled: false,
    };
    this.#pending.set(id, pending);
    if (options.sources) this.preparePendingSources(pending, options.sources);
    else if (options.resolveSources)
      void this.preparePending(pending, options.resolveSources);
    else
      this.failPending(
        pending,
        new Error(`audio effect has no source resolver: ${route}`),
      );
    this.tryStartPending(pending);
    return handle;
  }

  private preparePendingSources(
    pending: PendingEffect,
    sourceInput: readonly AudioBackendSource[],
  ): void {
    const sources = Object.freeze([...sourceInput]);
    if (sources.length === 0) {
      this.failPending(
        pending,
        new Error(`audio effect has no sources: ${pending.handle.route}`),
      );
      return;
    }
    pending.resolved = Object.freeze({ ...pending.policy, sources });
    void this.prepareSound(pending.playbackKey, sources).then(
      (sound) => {
        if (
          this.#destroyed ||
          pending.cancelled ||
          !this.#pending.has(pending.handle.id)
        )
          return;
        pending.sound = sound;
        pending.ready = true;
        this.tryStartPending(pending);
      },
      (error) => this.failPending(pending, error),
    );
  }

  private async preparePending(
    pending: PendingEffect,
    resolveSources: () => Promise<readonly AudioBackendSource[]>,
  ): Promise<void> {
    try {
      const sources = Object.freeze([...(await resolveSources())]);
      if (
        this.#destroyed ||
        pending.cancelled ||
        !this.#pending.has(pending.handle.id)
      )
        return;
      if (sources.length === 0)
        throw new Error(`audio effect has no sources: ${pending.handle.route}`);
      const sound = await this.prepareSound(pending.playbackKey, sources);
      if (
        this.#destroyed ||
        pending.cancelled ||
        !this.#pending.has(pending.handle.id)
      )
        return;
      pending.resolved = Object.freeze({ ...pending.policy, sources });
      pending.sound = sound;
      pending.ready = true;
      this.tryStartPending(pending);
    } catch (error) {
      this.failPending(pending, error);
    }
  }

  private stopPlaybackKey(playbackKey: string): void {
    for (const entry of [...this.#pending.values(), ...this.#active.values()])
      if (entry.playbackKey === playbackKey) this.stopById(entry.handle.id);
  }

  private prepareSound(
    key: string,
    sources: readonly AudioBackendSource[],
  ): Promise<AudioBackendSound> {
    const cached = this.#sounds.get(key);
    if (cached) return Promise.resolve(cached);
    const pending = this.#preparing.get(key);
    if (pending) return pending;
    const operation = this.#backend.prepare(sources).then(
      (sound) => {
        this.#preparing.delete(key);
        if (this.#destroyed) {
          sound.destroy();
          throw new Error("audio runtime is destroyed.");
        }
        this.#sounds.set(key, sound);
        return sound;
      },
      (error) => {
        this.#preparing.delete(key);
        throw error;
      },
    );
    this.#preparing.set(key, operation);
    return operation;
  }

  private tryStartPending(pending: PendingEffect): void {
    if (
      pending.cancelled ||
      pending.starting ||
      this.#activity === "suspended" ||
      !pending.ready ||
      pending.remainingSeconds > 0 ||
      !pending.sound ||
      !pending.resolved
    )
      return;
    const resolved = pending.resolved;
    pending.starting = true;
    void Promise.resolve(
      pending.sound.play({
        loop: pending.policy.playback === "loop",
        volume: 0,
      }),
    ).then(
      (instance) => {
        pending.starting = false;
        if (
          this.#destroyed ||
          pending.cancelled ||
          !this.#pending.has(pending.handle.id)
        ) {
          instance.stop();
          pending.handle.settle("stopped");
          return;
        }
        if (this.#activity === "suspended") {
          instance.stop();
          if (pending.policy.playback === "once")
            this.stopById(pending.handle.id);
          return;
        }
        this.#pending.delete(pending.handle.id);
        pending.handle.state = "playing";
        let active!: ActiveEffect;
        const disposeEnded = instance.onEnded(() =>
          this.finishActive(active, "ended", false),
        );
        active = {
          handle: pending.handle,
          playbackKey: pending.playbackKey,
          resolved,
          instance,
          disposeEnded,
          sequence: this.#sequence++,
        };
        this.#active.set(pending.handle.id, active);
        const legacyFocus = resolved.legacyBgmFocus;
        if (legacyFocus && legacyFocus.kind !== "keep") {
          this.#focus.set(pending.handle.id, legacyFocus);
          this.recomputeFocus(legacyFocus, "acquire");
        }
        this.applyEffectVolumes();
        this.applyMusicState();
      },
      (error) => {
        pending.starting = false;
        this.failPending(pending, error);
      },
    );
  }

  private failPending(pending: PendingEffect, error: unknown): void {
    if (!this.#pending.delete(pending.handle.id)) return;
    pending.cancelled = true;
    pending.handle.settle("failed", error);
  }

  private stopById(id: number): void {
    const pending = this.#pending.get(id);
    if (pending) {
      this.#pending.delete(id);
      pending.cancelled = true;
      pending.handle.settle("stopped");
      return;
    }
    const active = this.#active.get(id);
    if (active) this.finishActive(active, "stopped", true);
  }

  private finishActive(
    active: ActiveEffect,
    state: "ended" | "stopped",
    stop: boolean,
  ): void {
    if (!this.#active.delete(active.handle.id)) return;
    active.disposeEnded();
    if (stop) active.instance.stop();
    const focus = this.#focus.get(active.handle.id);
    if (focus) {
      this.#focus.delete(active.handle.id);
      this.recomputeFocus(focus, "release");
    }
    active.handle.settle(state);
    this.applyEffectVolumes();
    this.applyMusicState();
  }

  private activeForKey(playbackKey: string): (PendingEffect | ActiveEffect)[] {
    return [...this.#pending.values(), ...this.#active.values()]
      .filter((entry) => entry.playbackKey === playbackKey)
      .sort(
        (a, b) =>
          ("sequence" in a ? a.sequence : a.handle.id) -
          ("sequence" in b ? b.sequence : b.handle.id),
      );
  }

  private failedHandle(route: string, error: unknown): AudioPlaybackHandle {
    const handle = new MutablePlaybackHandle(this.#nextId++, route, () => {});
    handle.settle("failed", error);
    return handle;
  }

  private stoppedHandle(route: string): AudioPlaybackHandle {
    const handle = new MutablePlaybackHandle(this.#nextId++, route, () => {});
    handle.settle("stopped");
    return handle;
  }

  private recomputeFocus(
    changed: AudioBgmFocusPolicyV1,
    phase: "acquire" | "release",
  ): void {
    const policies = [...this.#focus.values()];
    const pause = policies.some((policy) => policy.kind === "pause");
    const ducks = policies.filter(
      (policy): policy is Extract<AudioBgmFocusPolicyV1, { kind: "duck" }> =>
        policy.kind === "duck",
    );
    const kind = pause ? "pause" : ducks.length ? "duck" : "keep";
    const target = pause
      ? 0
      : ducks.length
        ? Math.min(...ducks.map(({ targetGain }) => targetGain))
        : 1;
    const duration =
      changed.kind === "keep"
        ? 0
        : changed.kind === "duck"
          ? phase === "acquire"
            ? changed.attackSeconds
            : changed.releaseSeconds
          : phase === "acquire"
            ? changed.fadeOutSeconds
            : changed.fadeInSeconds;
    this.#focusKind = kind;
    this.#focusStartGain = this.#focusGain;
    this.#focusTargetGain = target;
    this.#focusElapsedSeconds = 0;
    this.#focusDurationSeconds = duration;
    if (duration === 0) this.#focusGain = target;
    this.applyEffectVolumes();
    this.applyMusicState();
  }

  private updateFocus(deltaSeconds: number): void {
    if (this.#focusGain === this.#focusTargetGain) return;
    this.#focusElapsedSeconds += deltaSeconds;
    const progress =
      this.#focusDurationSeconds === 0
        ? 1
        : Math.min(1, this.#focusElapsedSeconds / this.#focusDurationSeconds);
    this.#focusGain =
      this.#focusStartGain +
      (this.#focusTargetGain - this.#focusStartGain) * progress;
  }

  private rampMusic(
    voice: MusicVoice,
    target: number,
    duration: number,
    stopping: boolean,
  ): void {
    voice.startGain = voice.transitionGain;
    voice.targetGain = target;
    voice.elapsedSeconds = 0;
    voice.durationSeconds = duration;
    voice.stopping = stopping;
  }

  private applyEffectVolumes(): void {
    for (const active of this.#active.values()) {
      active.instance.paused = this.#activity === "suspended";
      const category = active.resolved.category;
      const base = this.#masterMuted
        ? 0
        : category === "music"
          ? this.#musicVolume
          : this.#effectVolume;
      const legacyMusicFocus = category === "music" ? this.#focusGain : 1;
      active.instance.volume =
        base *
        legacyMusicFocus *
        this.eventFocusGain(
          active.handle.id,
          category,
          sourceIdentity(active.resolved.sources),
        );
    }
  }

  private applyMusicState(): void {
    const base = this.#masterMuted ? 0 : this.#musicVolume;
    for (const voice of this.#musicVoices) {
      voice.instance.volume = base * voice.transitionGain * this.#focusGain;
      voice.instance.volume *= this.eventFocusGain(
        voice.id,
        "music",
        voice.sourceIdentity,
      );
      voice.instance.paused =
        this.#activity === "suspended" ||
        (this.#focusKind === "pause" && this.#focusGain === 0);
    }
  }

  private setActivity(state: AudioBackendActivityState): void {
    if (this.#destroyed || state === this.#activity) return;
    this.#activity = state;
    if (state === "suspended") {
      for (const pending of [...this.#pending.values()])
        if (pending.policy.playback === "once")
          this.stopById(pending.handle.id);
      for (const active of [...this.#active.values()])
        if (active.resolved.playback === "once")
          this.stopById(active.handle.id);
    } else {
      this.wakeMusicActivityWaiters();
      for (const pending of this.#pending.values())
        this.tryStartPending(pending);
    }
    this.applyEffectVolumes();
    this.applyMusicState();
  }

  private waitForActiveMusicRequest(): Promise<void> {
    if (this.#activity === "active") return Promise.resolve();
    return new Promise((resolve) => this.#musicActivityWaiters.add(resolve));
  }

  private wakeMusicActivityWaiters(): void {
    for (const resolve of [...this.#musicActivityWaiters]) resolve();
    this.#musicActivityWaiters.clear();
  }

  private async restartMusicRequest(
    request: number,
    name: string,
    resolved: ResolvedAudioMusic,
    sound: AudioBackendSound,
  ): Promise<void> {
    while (request === this.#musicRequest) {
      while (this.#activity === "suspended") {
        await this.waitForActiveMusicRequest();
        this.assertAlive();
        if (request !== this.#musicRequest) return;
      }
      const instance = await sound.play({ loop: true, volume: 0 });
      if (this.#destroyed) {
        instance.stop();
        throw new Error("audio runtime is destroyed.");
      }
      if (request !== this.#musicRequest) {
        instance.stop();
        return;
      }
      if (this.isSuspended()) {
        instance.stop();
        continue;
      }
      this.commitMusicVoice(name, resolved, instance);
      return;
    }
  }

  private commitMusicVoice(
    name: string,
    resolved: ResolvedAudioMusic,
    instance: AudioBackendInstance,
  ): void {
    for (const voice of this.#musicVoices)
      this.rampMusic(voice, 0, voice.binding.fadeOutSeconds, true);
    const voice: MusicVoice = {
      id: this.#nextMusicVoiceId--,
      name,
      binding: resolved.binding,
      instance,
      sourceIdentity: sourceIdentity(resolved.sources),
      transitionGain: 0,
      startGain: 0,
      targetGain: 1,
      elapsedSeconds: 0,
      durationSeconds: resolved.binding.fadeInSeconds,
      stopping: false,
    };
    this.#musicVoices.push(voice);
    this.applyMusicState();
    this.emitMusic(name, "started");
  }

  private isSuspended(): boolean {
    return this.#activity === "suspended";
  }

  private eventFocusGain(
    voiceId: number,
    category: "music" | "effect",
    identity: string,
  ): number {
    let gain = 1;
    const targetSequence = this.#active.get(voiceId)?.sequence ?? Infinity;
    for (const owner of this.#active.values()) {
      if (owner.handle.id === voiceId) continue;
      const focus = owner.resolved.eventFocus;
      if (!focus) continue;
      if (category === "music" && focus.bgm)
        gain = Math.min(gain, focus.bgm.targetGain);
      if (category === "effect" && focus.effects) {
        const matches =
          focus.effects.scope === "all" ||
          (sourceIdentity(owner.resolved.sources) === identity &&
            targetSequence < owner.sequence);
        if (matches) gain = Math.min(gain, focus.effects.targetGain);
      }
    }
    return gain;
  }
  private assertAlive(): void {
    if (this.#destroyed) throw new Error("audio runtime is destroyed.");
  }
}

function unit(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1)
    throw new Error(`${label} must be between 0 and 1.`);
  return value;
}

function assertLoopOption(loop: boolean | undefined): void {
  if (loop !== undefined && typeof loop !== "boolean")
    throw new Error("audio effect loop must be boolean when provided.");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function effectPolicy(
  resolved: ResolvedAudioEffect,
  playback: "once" | "loop",
): EffectPlaybackPolicy {
  return Object.freeze({
    playback,
    voices:
      playback === "loop"
        ? Object.freeze({ ...resolved.binding.voices, maxConcurrent: 1 })
        : resolved.binding.voices,
    category: "effect",
    legacyBgmFocus: resolved.binding.bgm,
    eventFocus: null,
  });
}

function eventTrackPolicy(
  resolved: ResolvedAudioEventTrack,
): EffectPlaybackPolicy {
  return Object.freeze({
    playback: resolved.binding.playback,
    voices: resolved.binding.voices,
    category: resolved.binding.category,
    legacyBgmFocus: null,
    eventFocus: resolved.binding.focus,
  });
}

function sourceIdentity(sources: readonly AudioBackendSource[]): string {
  return JSON.stringify(sources.map(({ url, mediaType }) => [url, mediaType]));
}
