import { assertVNIProject } from "@slotclientengine/vnicore/data";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "../../image-string/data/index.js";
import { collectPopupDirectPaths, parsePopupManifest } from "./manifest.js";
import {
  collectPopupObjectDirectPaths,
  parsePopupObjectManifest,
} from "./object-manifest.js";
import { assertPopupFilenameKey, assertPopupPackagePath } from "./path.js";
import type { PopupResourceSpec } from "./types.js";

export function collectMappedPopupObjectAssetKeys(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifest = parsePopupObjectManifest(options.manifest);
  const keys = new Set(collectPopupObjectDirectPaths(manifest));
  const mapped = [...keys].every((path) => !path.includes("/"));
  collectNestedResourceKeys({
    resources: manifest.resources,
    files: options.files,
    keys,
    mapped,
    ownerManifest: mapped ? undefined : "popup-object.manifest.json",
  });
  return Object.freeze(
    [...keys].sort((left, right) => left.localeCompare(right, "en")),
  );
}

export function collectPopupObjectPackagePaths(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly allowExtraFiles?: boolean;
}): readonly string[] {
  const expected = collectMappedPopupObjectAssetKeys(options);
  const mapped = expected.every((path) => !path.includes("/"));
  const actual = [...options.files.keys()]
    .filter((path) => path !== "popup-object.manifest.json")
    .map((path) =>
      mapped ? assertPopupFilenameKey(path) : assertPopupPackagePath(path),
    )
    .sort((left, right) => left.localeCompare(right, "en"));
  assertNoPathAliases(actual);
  if (
    !options.allowExtraFiles &&
    JSON.stringify(expected) !== JSON.stringify(actual)
  )
    throw new Error(
      `popup object package entries must exactly match transitive closure; expected=${expected.join(",")}, actual=${actual.join(",")}.`,
    );
  for (const path of expected) requireBytes(options.files, path);
  return expected;
}

export function collectMappedPopupAssetKeys(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifest = parsePopupManifest(options.manifest);
  const keys = new Set(collectPopupDirectPaths(manifest));
  const mapped = [...keys].every((path) => !path.includes("/"));
  collectNestedResourceKeys({
    resources: manifest.resources,
    files: options.files,
    keys,
    mapped,
  });
  return Object.freeze(
    [...keys].sort((left, right) => left.localeCompare(right, "en")),
  );
}

function collectNestedResourceKeys(options: {
  readonly resources: Readonly<Record<string, PopupResourceSpec>>;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly keys: Set<string>;
  readonly mapped: boolean;
  readonly ownerManifest?: string;
}): void {
  const resolve = (path: string) =>
    options.mapped
      ? assertPopupFilenameKey(path)
      : options.ownerManifest
        ? resolveRelative(options.ownerManifest, path)
        : assertPopupPackagePath(path);
  for (const resource of Object.values(options.resources)) {
    if (resource.kind === "image-string") {
      const manifestPath = resolve(resource.manifest);
      const nested = parseImageStringManifest(
        parseJson(requireBytes(options.files, manifestPath), manifestPath),
      );
      if (!options.mapped) {
        const directoryId = manifestPath.split("/").at(-2);
        if (nested.id !== directoryId)
          throw new Error(
            `popup image-string dependency id mismatch: ${manifestPath}`,
          );
      }
      for (const key of collectImageStringAssetPaths(nested))
        options.keys.add(
          options.mapped
            ? assertPopupFilenameKey(key)
            : resolveRelative(manifestPath, key),
        );
    } else if (resource.kind === "vni") {
      const projectPath = resolve(resource.project);
      const project = assertVNIProject(
        parseJson(requireBytes(options.files, projectPath), projectPath),
      );
      for (const asset of project.assets)
        options.keys.add(
          options.mapped
            ? assertPopupFilenameKey(asset.path)
            : resolveRelative(projectPath, asset.path),
        );
    } else if (resource.kind === "popup-object") {
      const objectPath = resolve(resource.manifest);
      const objectManifest = parsePopupObjectManifest(
        parseJson(requireBytes(options.files, objectPath), objectPath),
      );
      for (const path of collectPopupObjectDirectPaths(objectManifest))
        options.keys.add(
          resolveRelativeOrMapped(objectPath, path, options.mapped),
        );
      collectNestedResourceKeys({
        resources: objectManifest.resources,
        files: options.files,
        keys: options.keys,
        mapped: options.mapped,
        ownerManifest: objectPath,
      });
    }
  }
}

function resolveRelativeOrMapped(
  ownerManifest: string,
  path: string,
  mapped: boolean,
): string {
  return mapped
    ? assertPopupFilenameKey(path)
    : resolveRelative(ownerManifest, path);
}

export function collectPopupPackagePaths(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
  readonly allowExtraFiles?: boolean;
}): readonly string[] {
  const manifest = parsePopupManifest(options.manifest);
  const expected = collectMappedPopupAssetKeys({
    manifest,
    files: options.files,
  });
  const mapped = expected.every((path) => !path.includes("/"));
  if (
    expected.some((path) => path.includes("/")) &&
    expected.some((path) => !path.includes("/"))
  )
    throw new Error(
      "popup package 不得混用 filename key 与 direct package path。",
    );
  const actual = [...options.files.keys()]
    .filter((path) => path !== "popup.manifest.json")
    .map((path) =>
      mapped ? assertPopupFilenameKey(path) : assertPopupPackagePath(path),
    )
    .sort((left, right) => left.localeCompare(right, "en"));
  assertNoPathAliases(actual);
  if (
    !options.allowExtraFiles &&
    JSON.stringify(expected) !== JSON.stringify(actual)
  )
    throw new Error(
      `popup package entries must exactly match transitive closure; expected=${expected.join(",")}, actual=${actual.join(",")}.`,
    );
  for (const path of expected) requireBytes(options.files, path);
  return expected;
}

function assertNoPathAliases(paths: readonly string[]): void {
  const seen = new Map<string, string>();
  for (const path of paths) {
    const folded = path.normalize("NFC").toLocaleLowerCase("en-US");
    const existing = seen.get(folded);
    if (existing && existing !== path)
      throw new Error(
        `popup package path alias collision: ${existing}, ${path}.`,
      );
    seen.set(folded, path);
  }
}

function resolveRelative(base: string, reference: string): string {
  const directory = base.includes("/")
    ? base.slice(0, base.lastIndexOf("/") + 1)
    : "";
  return assertPopupPackagePath(`${directory}${reference}`);
}

function requireBytes(
  files: ReadonlyMap<string, Uint8Array>,
  path: string,
): Uint8Array {
  const bytes = files.get(path);
  if (!bytes) throw new Error(`popup package missing ${path}.`);
  return bytes;
}

function parseJson(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (error) {
    throw new Error(
      `invalid JSON ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
