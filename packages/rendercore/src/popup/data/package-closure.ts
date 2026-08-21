import { assertVNIProject } from "@slotclientengine/vnicore/data";
import {
  collectImageStringAssetPaths,
  parseImageStringManifest,
} from "../../image-string/data/index.js";
import { collectPopupDirectPaths, parsePopupManifest } from "./manifest.js";
import { assertPopupFilenameKey, assertPopupPackagePath } from "./path.js";

export function collectMappedPopupAssetKeys(options: {
  readonly manifest: unknown;
  readonly files: ReadonlyMap<string, Uint8Array>;
}): readonly string[] {
  const manifest = parsePopupManifest(options.manifest);
  const keys = new Set(collectPopupDirectPaths(manifest));
  const mapped = [...keys].every((path) => !path.includes("/"));
  for (const resource of Object.values(manifest.resources)) {
    if (resource.kind === "image-string") {
      const nested = parseImageStringManifest(
        parseJson(
          requireBytes(options.files, resource.manifest),
          resource.manifest,
        ),
      );
      if (!mapped) {
        const directoryId = resource.manifest.split("/").at(-2);
        if (nested.id !== directoryId)
          throw new Error(
            `popup image-string dependency id mismatch: ${resource.manifest}`,
          );
      }
      for (const key of collectImageStringAssetPaths(nested))
        keys.add(
          mapped
            ? assertPopupFilenameKey(key)
            : resolveRelative(resource.manifest, key),
        );
    } else if (resource.kind === "vni") {
      const project = assertVNIProject(
        parseJson(
          requireBytes(options.files, resource.project),
          resource.project,
        ),
      );
      for (const asset of project.assets)
        keys.add(
          mapped
            ? assertPopupFilenameKey(asset.path)
            : resolveRelative(resource.project, asset.path),
        );
    }
  }
  return Object.freeze(
    [...keys].sort((left, right) => left.localeCompare(right, "en")),
  );
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
