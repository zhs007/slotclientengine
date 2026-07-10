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
  CreateWinAmountAnimationTiersFromManifestModulesOptions,
  CreateWinAmountAnimationTiersOptions,
  ParsedWinAmountAnimationManifest,
  WinAmountAnimationManifestPlayback,
  WinAmountAnimationManifestTier,
  WinAmountAnimationLayout,
  WinAmountAnimationTier,
  WinAmountAnimationTierConfig,
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

export function parseWinAmountAnimationManifest(
  manifest: unknown,
): ParsedWinAmountAnimationManifest {
  const record = assertRecord(manifest, "win amount animation manifest");
  assertKeys(record, "win amount animation manifest", [
    "version",
    "kind",
    "projectGlob",
    "assetGlob",
    "tiers",
  ]);
  if (record.version !== 1) {
    throw new Error("win amount animation manifest version must be 1.");
  }
  if (record.kind !== "vni-win-amount-tiers") {
    throw new Error(
      'win amount animation manifest kind must be "vni-win-amount-tiers".',
    );
  }
  const projectGlob = assertManifestProjectGlob(
    record.projectGlob,
    "win amount animation manifest.projectGlob",
  );
  const assetGlob = assertManifestAssetGlob(
    record.assetGlob,
    "win amount animation manifest.assetGlob",
  );
  if (!Array.isArray(record.tiers) || record.tiers.length === 0) {
    throw new Error(
      "win amount animation manifest.tiers must be a non-empty array.",
    );
  }
  const tiers = Object.freeze(
    record.tiers.map((tier, index) =>
      parseManifestTier(
        tier,
        `win amount animation manifest.tiers[${index}]`,
      ),
    ),
  );
  assertUniqueStrings(
    tiers.map((tier) => tier.id),
    "win amount animation manifest.tiers.id",
  );
  let previousThreshold = 0;
  for (const tier of tiers) {
    if (tier.thresholdMultiplier <= previousThreshold) {
      throw new Error(
        "win amount animation manifest tier thresholds must be strictly increasing.",
      );
    }
    previousThreshold = tier.thresholdMultiplier;
  }
  const globProjects = expandManifestProjectGlob(projectGlob);
  const tierProjects = new Set(tiers.map((tier) => tier.project));
  for (const project of tierProjects) {
    if (!globProjects.has(project)) {
      throw new Error(
        `win amount animation manifest projectGlob does not cover ${project}.`,
      );
    }
  }
  if (globProjects.size !== tierProjects.size) {
    throw new Error(
      "win amount animation manifest projectGlob must match exactly the tier projects.",
    );
  }
  return Object.freeze({
    version: 1,
    kind: "vni-win-amount-tiers",
    projectGlob,
    assetGlob,
    tiers,
  });
}

export function createWinAmountAnimationTiersFromManifestModules(
  options: CreateWinAmountAnimationTiersFromManifestModulesOptions,
): readonly WinAmountAnimationTier[] {
  const manifest = parseWinAmountAnimationManifest(options.manifest);
  const tierConfigs = manifest.tiers.map(
    (tier): WinAmountAnimationTierConfig => ({
      id: tier.id,
      thresholdMultiplier: tier.thresholdMultiplier,
      project: tier.project,
      durationSeconds: tier.playback.durationSeconds,
      loopStartTime: tier.playback.loopStartTime,
      loopEndTime: tier.playback.loopEndTime,
      keepParticlesAlive: tier.playback.keepParticlesAlive,
    }),
  );
  return createWinAmountAnimationTiersFromModules({
    tierConfigs,
    projectModules: options.projectModules,
    assetModules: options.assetModules,
  });
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

function parseManifestTier(
  value: unknown,
  label: string,
): WinAmountAnimationManifestTier {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "id",
    "thresholdMultiplier",
    "project",
    "playback",
  ]);
  return Object.freeze({
    id: assertNonEmptyString(record.id, `${label}.id`),
    thresholdMultiplier: assertPositiveFiniteNumber(
      record.thresholdMultiplier,
      `${label}.thresholdMultiplier`,
    ),
    project: assertManifestProjectPath(record.project, `${label}.project`),
    playback: parseManifestPlayback(record.playback, `${label}.playback`),
  });
}

function parseManifestPlayback(
  value: unknown,
  label: string,
): WinAmountAnimationManifestPlayback {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "mode",
    "durationSeconds",
    "loopStartTime",
    "loopEndTime",
    "keepParticlesAlive",
  ]);
  if (record.mode !== "segmented") {
    throw new Error(`${label}.mode must be "segmented".`);
  }
  const durationSeconds = assertPositiveFiniteNumber(
    record.durationSeconds,
    `${label}.durationSeconds`,
  );
  const loopStartTime = assertNonNegativeFiniteNumber(
    record.loopStartTime,
    `${label}.loopStartTime`,
  );
  const loopEndTime = assertNonNegativeFiniteNumber(
    record.loopEndTime,
    `${label}.loopEndTime`,
  );
  if (!(loopStartTime <= loopEndTime && loopEndTime <= durationSeconds)) {
    throw new Error(
      `${label} must satisfy loopStartTime <= loopEndTime <= durationSeconds.`,
    );
  }
  if (typeof record.keepParticlesAlive !== "boolean") {
    throw new Error(`${label}.keepParticlesAlive must be a boolean.`);
  }
  return Object.freeze({
    mode: "segmented",
    durationSeconds,
    loopStartTime,
    loopEndTime,
    keepParticlesAlive: record.keepParticlesAlive,
  });
}

function assertManifestProjectGlob(value: unknown, label: string): string {
  const glob = assertManifestRelativeString(value, label);
  if (!/^\.[/]\{[-A-Za-z0-9_,]+\}\.json$/u.test(glob)) {
    throw new Error(
      `${label} must be a manifest-relative brace JSON glob such as ./{bigwin,superwin,megawin}.json.`,
    );
  }
  return glob;
}

function assertManifestAssetGlob(value: unknown, label: string): string {
  const glob = assertManifestRelativeString(value, label);
  if (
    !(
      /^\.[/]assets[/]\*\.(png|jpg|jpeg|webp)$/iu.test(glob) ||
      /^\.[/]assets[/]\*\.\{png,jpg,jpeg,webp\}$/iu.test(glob)
    )
  ) {
    throw new Error(
      `${label} must match manifest-local win amount image assets.`,
    );
  }
  return glob;
}

function assertManifestProjectPath(value: unknown, label: string): string {
  const path = assertManifestRelativeString(value, label);
  if (!/^\.[/][-A-Za-z0-9_]+\.json$/u.test(path)) {
    throw new Error(`${label} must be a manifest-local ./filename.json path.`);
  }
  return path;
}

function assertManifestRelativeString(value: unknown, label: string): string {
  const text = assertNonEmptyString(value, label);
  if (!text.startsWith("./")) {
    throw new Error(`${label} must start with "./".`);
  }
  if (text.includes("..") || text.includes("\\") || text.includes("**")) {
    throw new Error(`${label} must not contain .., \\, or recursive glob.`);
  }
  return text;
}

function expandManifestProjectGlob(glob: string): ReadonlySet<string> {
  const match = /^\.[/]\{(?<names>[-A-Za-z0-9_,]+)\}\.json$/u.exec(glob);
  if (!match?.groups?.names) {
    throw new Error(`Cannot parse win amount projectGlob: ${glob}.`);
  }
  const names = match.groups.names.split(",");
  return new Set(names.map((name) => `./${name}.json`));
}

function assertRecord(
  value: unknown,
  label: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }
  return value as Record<string, unknown>;
}

function assertKeys(
  record: Record<string, unknown>,
  label: string,
  allowed: readonly string[],
): void {
  const allowedSet = new Set(allowed);
  for (const key of Object.keys(record)) {
    if (!allowedSet.has(key)) {
      throw new Error(`${label} contains unknown field "${key}".`);
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`${label} is missing field "${key}".`);
    }
  }
}

function assertUniqueStrings(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} contains duplicate value "${value}".`);
    }
    seen.add(value);
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function assertPositiveFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a finite positive number.`);
  }
  return value;
}

function assertNonNegativeFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a finite non-negative number.`);
  }
  return value;
}
