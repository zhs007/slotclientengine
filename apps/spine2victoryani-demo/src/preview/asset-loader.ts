import { Assets, Texture } from "pixi.js";
import type { VictoryProjectConfig } from "../config/victory-types.js";

export async function loadProjectTextures(project: VictoryProjectConfig) {
  const textures = new Map<string, Texture>();
  const assetPaths = [...new Set(project.layers.filter((layer) => layer.type === "pic" && layer.asset).map((layer) => layer.asset))];

  await Promise.all(
    assetPaths.map(async (assetPath) => {
      const texture = await Assets.load<Texture>(assetPath);
      textures.set(assetPath, texture);
    })
  );

  return textures;
}