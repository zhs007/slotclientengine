import type * as PIXI from "pixi.js";

export class VNIRuntimeLoadedResources {
  private referenceCount = 1;
  private released = false;

  constructor(
    readonly texturesByAssetId: ReadonlyMap<string, PIXI.Texture>,
    private readonly ownedTextures: ReadonlySet<PIXI.Texture>,
  ) {}

  retain(): VNIRuntimeLoadedResources {
    if (this.released) {
      throw new Error("Cannot retain released VNI player loaded resources.");
    }
    this.referenceCount += 1;
    return this;
  }

  release(): void {
    if (this.released) return;
    this.referenceCount -= 1;
    if (this.referenceCount > 0) return;
    this.released = true;
    for (const texture of this.ownedTextures) {
      texture.destroy(true);
    }
  }
}
