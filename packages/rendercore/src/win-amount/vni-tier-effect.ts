import { Container } from "pixi.js";
import {
  assertVNIProject,
  createAssetUrlManifest,
  resolveProjectAssetUrls,
  type VNIProjectConfig,
} from "@slotclientengine/vnicore/core";
import {
  VNIPlayer,
  type VNIPlayerOptions,
} from "@slotclientengine/vnicore/pixi";
import type {
  CreateWinAmountAnimationTiersOptions,
  WinAmountAnimationLayout,
  WinAmountAnimationTier,
} from "./types.js";
import {
  alignWinAmountVniRoot,
  applyTierContainerLayout,
} from "./win-amount-stage.js";

export interface WinAmountVniPlayer {
  init(): Promise<void>;
  getDisplayObject(): Container;
  play(options: {
    readonly mode: "segmented";
    readonly loopStart: { readonly unit: "time"; readonly at: number };
    readonly loopEnd: { readonly unit: "time"; readonly at: number };
    readonly keepParticlesAlive: boolean;
  }): void;
  requestSegmentedPlaybackEnd(): void;
  update(deltaSeconds: number): void;
  onPlaybackComplete(listener: () => void): () => void;
  pause?(): void;
  destroy(): void;
}

export type WinAmountVniPlayerFactory = (
  options: VNIPlayerOptions,
) => WinAmountVniPlayer;

export interface WinAmountTierEffectOptions {
  readonly tier: WinAmountAnimationTier;
  readonly parent: Container;
  readonly layout: WinAmountAnimationLayout;
  readonly playerFactory?: WinAmountVniPlayerFactory;
}

export class WinAmountTierEffect {
  readonly id: string;
  readonly container = new Container();
  readonly #tier: WinAmountAnimationTier;
  readonly #parent: Container;
  readonly #playerFactory: WinAmountVniPlayerFactory;
  #player: WinAmountVniPlayer | null = null;
  #disposeComplete: (() => void) | null = null;
  #initialized = false;
  #initError: unknown = null;
  #endRequested = false;
  #completed = false;
  #destroyed = false;

  constructor(options: WinAmountTierEffectOptions) {
    this.#tier = options.tier;
    this.id = options.tier.id;
    this.#parent = options.parent;
    this.#playerFactory =
      options.playerFactory ??
      ((playerOptions) => new VNIPlayer(playerOptions));
    applyTierContainerLayout(
      this.container,
      options.layout,
      options.tier.vniProject.stage,
    );
  }

  start(): void {
    this.assertNotDestroyed();
    if (this.#player) {
      throw new Error(`win amount tier "${this.id}" already started.`);
    }
    this.#parent.addChild(this.container);
    void this.initializeAndPlay();
  }

  applyLayout(layout: WinAmountAnimationLayout): void {
    applyTierContainerLayout(
      this.container,
      layout,
      this.#tier.vniProject.stage,
    );
  }

  requestEnd(): void {
    this.assertNotDestroyed();
    if (this.#completed || this.#endRequested) {
      return;
    }
    this.#endRequested = true;
    if (this.#initialized) {
      this.#player?.requestSegmentedPlaybackEnd();
    }
  }

  update(deltaSeconds: number): void {
    if (this.#initError) {
      throw this.#initError;
    }
    if (!this.#initialized || this.#completed) {
      return;
    }
    this.#player?.update(deltaSeconds);
  }

  isComplete(): boolean {
    return this.#completed;
  }

  destroy(): void {
    if (this.#destroyed) {
      return;
    }
    this.#destroyed = true;
    this.#disposeComplete?.();
    this.#disposeComplete = null;
    this.#player?.pause?.();
    this.#player?.destroy();
    this.#player = null;
    this.container.destroy({ children: true });
  }

  private async initializeAndPlay(): Promise<void> {
    try {
      const player = this.#playerFactory({
        parent: this.container,
        projectId: `win-amount-${this.id}`,
        bundleId: "win-amount",
        profileId: "win-amount",
        profilePurpose: "win-amount-animation",
        assetScale: 1,
        project: this.#tier.vniProject,
        assetUrls: this.#tier.assetUrls,
        autoTick: false,
        fitPadding: 0,
      });
      this.#player = player;
      await player.init();
      if (this.#destroyed) {
        return;
      }
      alignWinAmountVniRoot(
        player.getDisplayObject(),
        this.#tier.vniProject.stage,
      );
      this.#disposeComplete = player.onPlaybackComplete(() => {
        this.#completed = true;
      });
      player.play({
        mode: "segmented",
        loopStart: { unit: "time", at: this.#tier.loopStartTime },
        loopEnd: { unit: "time", at: this.#tier.loopEndTime },
        keepParticlesAlive: this.#tier.keepParticlesAlive,
      });
      this.#initialized = true;
      if (this.#endRequested) {
        player.requestSegmentedPlaybackEnd();
      }
    } catch (error) {
      this.#initError = error;
    }
  }

  private assertNotDestroyed(): void {
    if (this.#destroyed) {
      throw new Error(`win amount tier "${this.id}" was destroyed.`);
    }
  }
}

export function createWinAmountAnimationTiersFromModules(
  options: CreateWinAmountAnimationTiersOptions,
): readonly WinAmountAnimationTier[] {
  if (options.tierConfigs.length === 0) {
    throw new Error("win amount animation tiers must not be empty.");
  }
  const projectModules = createProjectModuleMap(options.projectModules);
  assertUniqueAssetBasenames(options.assetModules);
  const assetManifest = createAssetUrlManifest({ ...options.assetModules });
  let previousThreshold = 0;
  const tiers = options.tierConfigs.map((config) => {
    if (config.thresholdMultiplier <= previousThreshold) {
      throw new Error(
        "win amount tier thresholds must be strictly increasing.",
      );
    }
    previousThreshold = config.thresholdMultiplier;
    const rawProject = projectModules.get(config.project);
    if (rawProject === undefined) {
      throw new Error(`win amount VNI project is missing: ${config.project}.`);
    }
    const sourceProject = assertVNIProject(rawProject);
    assertTierTiming(config, sourceProject);
    const vniProject = cloneProjectWithDuration(
      sourceProject,
      config.durationSeconds,
    );
    return Object.freeze({
      ...config,
      keepParticlesAlive: config.keepParticlesAlive ?? true,
      vniProject,
      assetUrls: resolveProjectAssetUrls(vniProject, assetManifest),
    });
  });
  return Object.freeze(tiers);
}

function createProjectModuleMap(
  modules: Readonly<Record<string, unknown>>,
): ReadonlyMap<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [modulePath, project] of Object.entries(modules)) {
    const key = `./${getFilename(modulePath)}`;
    if (map.has(key)) {
      throw new Error(`Duplicate win amount VNI project filename: ${key}.`);
    }
    map.set(key, project);
  }
  return map;
}

function assertUniqueAssetBasenames(
  modules: Readonly<Record<string, string>>,
): void {
  const seen = new Set<string>();
  for (const modulePath of Object.keys(modules)) {
    const filename = getFilename(modulePath);
    if (seen.has(filename)) {
      throw new Error(`Duplicate win amount VNI asset filename: ${filename}.`);
    }
    seen.add(filename);
  }
}

function assertTierTiming(
  config: {
    readonly id: string;
    readonly durationSeconds: number;
    readonly loopStartTime: number;
    readonly loopEndTime: number;
  },
  project: VNIProjectConfig,
): void {
  for (const [label, value] of [
    ["durationSeconds", config.durationSeconds],
    ["loopStartTime", config.loopStartTime],
    ["loopEndTime", config.loopEndTime],
  ] as const) {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error(
        `win amount tier "${config.id}" ${label} must be finite non-negative.`,
      );
    }
  }
  if (config.durationSeconds <= 0) {
    throw new Error(
      `win amount tier "${config.id}" durationSeconds must be positive.`,
    );
  }
  if (config.durationSeconds < 5) {
    throw new Error(
      `win amount tier "${config.id}" durationSeconds must be at least 5 seconds.`,
    );
  }
  if (
    !(
      config.loopStartTime <= config.loopEndTime &&
      config.loopEndTime <= config.durationSeconds &&
      config.durationSeconds <= project.stage.duration
    )
  ) {
    throw new Error(
      `win amount tier "${config.id}" must satisfy 0 <= loopStartTime <= loopEndTime <= durationSeconds <= project.stage.duration.`,
    );
  }
}

function cloneProjectWithDuration(
  project: VNIProjectConfig,
  durationSeconds: number,
): VNIProjectConfig {
  const clone = structuredClone(project) as VNIProjectConfig;
  clone.stage.duration = durationSeconds;
  return clone;
}

function getFilename(path: string): string {
  const parts = path.split(/[\\/]/u);
  const filename = parts.at(-1);
  if (!filename) {
    throw new Error(`Cannot parse win amount module path: ${path}`);
  }
  return filename;
}
