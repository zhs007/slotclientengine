import { createSceneLayoutPackageResource } from "@slotclientengine/rendercore";
import type {
  SceneLayoutPackageResource,
  SymbolPackageResource,
} from "@slotclientengine/rendercore";

export interface Game003v2Resource {
  readonly package: SceneLayoutPackageResource;
  readonly symbols: SymbolPackageResource;
  readonly reelSet: string;
  readonly columns: 5;
  readonly rows: 5;
}

export async function prepareGame003v2Resource(
  files: ReadonlyMap<string, Uint8Array>,
): Promise<Game003v2Resource> {
  const resource = await createSceneLayoutPackageResource({ files });
  try {
    const modes = resource.manifest.gameModes;
    const mode = modes?.modes.find(
      (candidate) => candidate.id === modes.initialMode,
    );
    if (!mode?.symbolPackage)
      throw new Error("Minecart2 initial mode must bind a symbol package.");
    const binding = resource.manifest.symbolPackages?.[mode.symbolPackage];
    const symbols = resource.symbolPackages[mode.symbolPackage];
    if (!binding || !symbols)
      throw new Error(
        `Minecart2 symbol package "${mode.symbolPackage}" is unavailable.`,
      );
    if (binding.renderMode !== "standard")
      throw new Error(
        "Minecart2 initial symbol package must use standard reels.",
      );
    const geometry = resource.manifest.reels.main;
    if (!geometry || geometry.columns !== 5 || geometry.rows !== 5)
      throw new Error("Minecart2 main reel geometry must be 5x5.");
    return Object.freeze({
      package: resource,
      symbols,
      reelSet: binding.reelSet,
      columns: 5 as const,
      rows: 5 as const,
    });
  } catch (error) {
    await resource.destroy();
    throw error;
  }
}
