import { parsePopupManifest } from "@slotclientengine/rendercore/popup/data";
import type { SceneLayoutManifest } from "@slotclientengine/rendercore/scene-layout/data";
import {
  parseSymbolPackageManifest,
  parseSymbolStateTextureManifest,
} from "@slotclientengine/rendercore/symbol/data";
import { parseJson } from "./package-reader.js";

export type PackageAudioAssetRole = "effect" | "music";
export interface PackageAudioAssetDescriptor {
  readonly role: PackageAudioAssetRole;
  readonly mediaType: string;
}

export function collectPackageAudioAssetRoles(
  manifest: SceneLayoutManifest,
  files: ReadonlyMap<string, Uint8Array>,
): ReadonlyMap<string, PackageAudioAssetDescriptor> {
  const roles = new Map<string, PackageAudioAssetDescriptor>();
  if (
    manifest.version === 4 ||
    manifest.version === 5 ||
    manifest.version === 6
  ) {
    for (const effect of manifest.audio.effects)
      addBinding(roles, effect.asset.sources, "effect");
    for (const music of manifest.audio.music)
      addBinding(roles, music.asset.sources, "music");
  }
  if (manifest.version === 5 || manifest.version === 6)
    for (const binding of manifest.eventAudio.bindings)
      addBinding(roles, binding.audio.asset.sources, binding.audio.category);
  for (const binding of symbolBindings(manifest)) {
    const packageManifest = parseSymbolPackageManifest(
      parseRequiredJson(files, binding.manifest),
    );
    const symbolManifest = parseSymbolStateTextureManifest(
      parseRequiredJson(files, packageManifest.entrypoints.symbolManifest),
    );
    if (symbolManifest.version === 3)
      for (const effect of symbolManifest.audio.effects)
        addBinding(roles, effect.asset.sources, "effect");
  }
  for (const binding of Object.values(manifest.popups ?? {})) {
    const popup = parsePopupManifest(
      parseRequiredJson(files, binding.manifest),
    );
    if ("audio" in popup)
      for (const effect of popup.audio.effects)
        addBinding(roles, effect.asset.sources, "effect");
  }
  return new Map([...roles].sort(([left], [right]) => compare(left, right)));
}

export function collectPackageAudioAssets(
  manifest: SceneLayoutManifest,
  files: ReadonlyMap<string, Uint8Array>,
): readonly string[] {
  return Object.freeze([
    ...collectPackageAudioAssetRoles(manifest, files).keys(),
  ]);
}

function addBinding(
  roles: Map<string, PackageAudioAssetDescriptor>,
  sources: readonly {
    readonly path: string;
    readonly mediaType: string;
  }[],
  role: PackageAudioAssetRole,
): void {
  if (sources.length !== 1)
    throw new Error(
      `固定 AAC production 优化要求每个 audio binding 恰好一个 source，收到：${sources
        .map((source) => source.path)
        .join(", ")}`,
    );
  for (const source of sources) {
    const current = roles.get(source.path);
    if (current && current.mediaType !== source.mediaType)
      throw new Error(
        `音频资源 mediaType 冲突：${source.path} (${current.mediaType} / ${source.mediaType})`,
      );
    roles.set(
      source.path,
      Object.freeze({
        role: current?.role === "music" || role === "music" ? "music" : role,
        mediaType: source.mediaType,
      }),
    );
  }
}

function symbolBindings(
  manifest: SceneLayoutManifest,
): readonly { readonly manifest: string }[] {
  if (manifest.symbolPackage)
    return [{ manifest: manifest.symbolPackage.manifest }];
  return Object.values(manifest.symbolPackages ?? {}).map((binding) => ({
    manifest: binding.manifest,
  }));
}

function parseRequiredJson(
  files: ReadonlyMap<string, Uint8Array>,
  key: string,
): unknown {
  const bytes = files.get(key);
  if (!bytes) throw new Error(`音频资源遍历缺少 bytes：${key}`);
  return parseJson(bytes, key);
}

function compare(left: string, right: string): number {
  return left.localeCompare(right, "en");
}
