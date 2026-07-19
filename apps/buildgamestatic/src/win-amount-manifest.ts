import { readFileSync } from "node:fs";
import { basename, join, posix } from "node:path";
import {
  assertExistingDirectory,
  assertExistingFile,
  assertExtension,
} from "./path-utils.js";

export interface BuildWinAmountManifestPlayback {
  readonly mode: "segmented";
  readonly durationSeconds: number;
  readonly loopStartTime: number;
  readonly loopEndTime: number;
  readonly keepParticlesAlive: boolean;
}

export interface BuildWinAmountManifestTier {
  readonly id: string;
  readonly thresholdMultiplier: number;
  readonly project: string;
  readonly playback: BuildWinAmountManifestPlayback;
}

export interface BuildWinAmountManifest {
  readonly version: 1;
  readonly kind: "vni-win-amount-tiers";
  readonly projectGlob: string;
  readonly assetGlob: string;
  readonly projectGlobPath: string;
  readonly assetGlobPath: string;
  readonly tiers: readonly BuildWinAmountManifestTier[];
}

export function loadWinAmountManifestForBuild(options: {
  readonly rootDir: string;
  readonly manifestPath: string;
  readonly label: string;
}): BuildWinAmountManifest {
  assertExistingFile(options.rootDir, options.manifestPath);
  assertExtension(options.manifestPath, [".json"], options.label);
  const raw = JSON.parse(
    readFileSync(join(options.rootDir, options.manifestPath), "utf8"),
  );
  const record = assertRecord(raw, options.label);
  assertKeys(record, options.label, [
    "version",
    "kind",
    "projectGlob",
    "assetGlob",
    "tiers",
  ]);
  if (record.version !== 1) {
    throw new Error(`${options.label}.version 必须是 1。`);
  }
  if (record.kind !== "vni-win-amount-tiers") {
    throw new Error(`${options.label}.kind 必须是 vni-win-amount-tiers。`);
  }
  const projectGlob = assertManifestProjectGlob(
    record.projectGlob,
    `${options.label}.projectGlob`,
  );
  const assetGlob = assertManifestAssetGlob(
    record.assetGlob,
    `${options.label}.assetGlob`,
  );
  if (!Array.isArray(record.tiers) || record.tiers.length === 0) {
    throw new Error(`${options.label}.tiers 必须是非空数组。`);
  }
  const tiers = Object.freeze(
    record.tiers.map((tier, index) =>
      parseManifestTier(tier, `${options.label}.tiers[${index}]`),
    ),
  );
  assertUnique(
    tiers.map((tier) => tier.id),
    `${options.label}.tiers.id`,
  );
  let previousThreshold = 0;
  for (const tier of tiers) {
    if (tier.thresholdMultiplier <= previousThreshold) {
      throw new Error(
        `${options.label}.tiers thresholdMultiplier 必须严格递增。`,
      );
    }
    previousThreshold = tier.thresholdMultiplier;
  }

  const manifestDir = posix.dirname(options.manifestPath);
  const projectGlobPath = resolveManifestRelativePath(manifestDir, projectGlob);
  const assetGlobPath = resolveManifestRelativePath(manifestDir, assetGlob);
  const projectDirectory = getStrictGlobDirectory(projectGlobPath);
  const assetDirectory = getStrictGlobDirectory(assetGlobPath);
  assertExistingDirectory(options.rootDir, projectDirectory);
  assertExistingDirectory(options.rootDir, assetDirectory);

  const globProjects = expandManifestProjectGlob(projectGlob);
  const tierProjects = new Set(tiers.map((tier) => tier.project));
  for (const project of tierProjects) {
    if (!globProjects.has(project)) {
      throw new Error(`${options.label}.projectGlob 未覆盖 ${project}。`);
    }
  }
  if (globProjects.size !== tierProjects.size) {
    throw new Error(
      `${options.label}.projectGlob 必须与 tiers[].project 完全一致。`,
    );
  }

  const assetBasenames = new Set<string>();
  for (const tier of tiers) {
    const projectPath = resolveManifestRelativePath(manifestDir, tier.project);
    assertExistingFile(options.rootDir, projectPath);
    assertExtension(projectPath, [".json"], `${options.label}.${tier.id}`);
    const project = JSON.parse(
      readFileSync(join(options.rootDir, projectPath), "utf8"),
    ) as {
      readonly stage?: { readonly duration?: unknown };
      readonly assets?: readonly { readonly path?: unknown }[];
    };
    const duration = assertPositiveNumber(
      project.stage?.duration,
      `${options.label}.${tier.id}.stage.duration`,
    );
    if (tier.playback.durationSeconds > duration) {
      throw new Error(
        `${options.label}.${tier.id}.playback.durationSeconds 不能大于 project.stage.duration ${duration}。`,
      );
    }
    for (const asset of project.assets ?? []) {
      const assetPath = assertProjectAssetPath(
        asset.path,
        `${options.label}.${tier.id}.assets[].path`,
      );
      const assetRepoPath = posix.join(posix.dirname(projectPath), assetPath);
      assertExistingFile(options.rootDir, assetRepoPath);
      const name = basename(assetRepoPath);
      if (assetBasenames.has(name)) {
        throw new Error(`${options.label} asset basename 重复：${name}。`);
      }
      assetBasenames.add(name);
    }
  }

  return Object.freeze({
    version: 1,
    kind: "vni-win-amount-tiers",
    projectGlob,
    assetGlob,
    projectGlobPath,
    assetGlobPath,
    tiers,
  });
}

function parseManifestTier(
  value: unknown,
  label: string,
): BuildWinAmountManifestTier {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "id",
    "thresholdMultiplier",
    "project",
    "playback",
  ]);
  return Object.freeze({
    id: assertNonEmptyString(record.id, `${label}.id`),
    thresholdMultiplier: assertPositiveNumber(
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
): BuildWinAmountManifestPlayback {
  const record = assertRecord(value, label);
  assertKeys(record, label, [
    "mode",
    "durationSeconds",
    "loopStartTime",
    "loopEndTime",
    "keepParticlesAlive",
  ]);
  if (record.mode !== "segmented") {
    throw new Error(`${label}.mode 必须是 segmented。`);
  }
  const durationSeconds = assertPositiveNumber(
    record.durationSeconds,
    `${label}.durationSeconds`,
  );
  const loopStartTime = assertNonNegativeNumber(
    record.loopStartTime,
    `${label}.loopStartTime`,
  );
  const loopEndTime = assertNonNegativeNumber(
    record.loopEndTime,
    `${label}.loopEndTime`,
  );
  if (!(loopStartTime <= loopEndTime && loopEndTime <= durationSeconds)) {
    throw new Error(
      `${label} 必须满足 loopStartTime <= loopEndTime <= durationSeconds。`,
    );
  }
  if (typeof record.keepParticlesAlive !== "boolean") {
    throw new Error(`${label}.keepParticlesAlive 必须是 boolean。`);
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
      `${label} 必须是 ./{bigwin,superwin,megawin}.json 这类 brace JSON glob。`,
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
    throw new Error(`${label} 只能匹配 manifest 同目录 assets 下的图片资源。`);
  }
  return glob;
}

function assertManifestProjectPath(value: unknown, label: string): string {
  const path = assertManifestRelativeString(value, label);
  if (!/^\.[/][-A-Za-z0-9_]+\.json$/u.test(path)) {
    throw new Error(`${label} 必须是 ./filename.json。`);
  }
  return path;
}

function assertProjectAssetPath(value: unknown, label: string): string {
  const path = assertNonEmptyString(value, label);
  if (
    !path.startsWith("assets/") ||
    path.includes("..") ||
    path.includes("\\") ||
    path.includes("//")
  ) {
    throw new Error(`${label} 必须是 assets/ 下的相对路径。`);
  }
  return path;
}

function assertManifestRelativeString(value: unknown, label: string): string {
  const text = assertNonEmptyString(value, label);
  if (!text.startsWith("./")) {
    throw new Error(`${label} 必须以 ./ 开头。`);
  }
  if (text.includes("..") || text.includes("\\") || text.includes("**")) {
    throw new Error(`${label} 不能包含 ..、反斜杠或递归 glob。`);
  }
  return text;
}

function resolveManifestRelativePath(
  manifestDir: string,
  relativePath: string,
): string {
  return posix.join(manifestDir, relativePath.slice(2));
}

function expandManifestProjectGlob(glob: string): ReadonlySet<string> {
  const match = /^\.[/]\{(?<names>[-A-Za-z0-9_,]+)\}\.json$/u.exec(glob);
  if (!match?.groups?.names) {
    throw new Error(`无法解析 win amount projectGlob：${glob}`);
  }
  return new Set(match.groups.names.split(",").map((name) => `./${name}.json`));
}

function getStrictGlobDirectory(glob: string): string {
  const firstGlobIndex = glob.search(/[*{[]/u);
  if (firstGlobIndex === -1) {
    throw new Error(`glob 必须包含 glob 表达式：${glob}`);
  }
  const prefix = glob.slice(0, firstGlobIndex);
  const slashIndex = prefix.lastIndexOf("/");
  if (slashIndex <= 0) {
    throw new Error(`glob 必须包含可验证目录：${glob}`);
  }
  return prefix.slice(0, slashIndex);
}

function assertRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} 必须是对象。`);
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
      throw new Error(`${label} 包含未知字段 "${key}"。`);
    }
  }
  for (const key of allowed) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) {
      throw new Error(`${label} 缺少字段 "${key}"。`);
    }
  }
}

function assertUnique(values: readonly string[], label: string): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) {
      throw new Error(`${label} 包含重复值 "${value}"。`);
    }
    seen.add(value);
  }
}

function assertNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} 必须是非空字符串。`);
  }
  return value;
}

function assertPositiveNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} 必须是正数。`);
  }
  return value;
}

function assertNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new Error(`${label} 必须是非负数。`);
  }
  return value;
}
