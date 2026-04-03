import { Assets, Texture } from "pixi.js";
import type { VictoryProjectConfig } from "../config/victory-types.js";

export function createProjectAssetResolver(manifest: Record<string, string>) {
  return (assetPath: string) => {
    const normalizedAssetPath = assetPath.replaceAll("\\", "/");
    return manifest[normalizedAssetPath] ?? normalizedAssetPath;
  };
}

export function collectProjectAssetPaths(project: VictoryProjectConfig) {
  return [...new Set(project.layers.filter((layer) => layer.type === "pic" && layer.asset).map((layer) => layer.asset))];
}

export async function loadProjectTextures(project: VictoryProjectConfig) {
  const textures = new Map<string, Texture>();

  await Promise.all(
    collectProjectAssetPaths(project).map(async (assetPath) => {
      const texture = await Assets.load<Texture>(assetPath);
      textures.set(assetPath, texture);
    })
  );

  return textures;
}