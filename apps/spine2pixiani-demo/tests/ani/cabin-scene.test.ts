import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { CabinScene } from "../../src/ani/cabin/cabin-scene.js";
import { asset12AnimationData } from "../../src/data/asset-12-animation-data.js";
import { sampleAnimationPose } from "../../src/runtime/timeline-sampler.js";

function createTextureMap() {
  return Object.fromEntries(asset12AnimationData.attachmentNames.map((name) => [name, Texture.EMPTY])) as Record<string, Texture>;
}

describe("CabinScene", () => {
  it("updates sprite zIndex from sampled drawOrder instead of the setup slot order", () => {
    const scene = new CabinScene(asset12AnimationData, createTextureMap());
    const pose = sampleAnimationPose(asset12AnimationData, "fg1", 1.1, true);

    scene.applyPose(pose);

    const slotLayer = scene.view.children[1] as { children: Array<{ zIndex: number }> };
    expect(slotLayer.children[0].zIndex).toBe(67);
    expect(slotLayer.children[15].zIndex).toBe(0);
    expect(slotLayer.children.at(-1)?.zIndex).toBe(124);
  });
});