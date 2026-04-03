import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import { CabinAnimationEntity } from "../../src/ani/cabin/cabin-animation.js";
import { asset12AnimationData } from "../../src/data/asset-12-animation-data.js";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";
import { getAnimationBundle } from "../../src/data/animation-bundles.js";

function createTextureMap(textureNames: string[]) {
  return Object.fromEntries(textureNames.map((name) => [name, Texture.EMPTY])) as Record<string, Texture>;
}

describe("CabinAnimationEntity", () => {
  it("switches animations and resets elapsed time", () => {
    const entity = new CabinAnimationEntity(cabinAnimationData, createTextureMap(cabinAnimationData.attachmentNames));

    entity.play("cabin");
    entity.update(1.25);
    expect(entity.currentAnimationName).toBe("cabin");
    expect(entity.currentTime).toBeCloseTo(1.25);

    entity.play("cabin_s");
    expect(entity.currentAnimationName).toBe("cabin_s");
    expect(entity.currentTime).toBe(0);
    expect(entity.getCurrentPose().slots.ui31.attachmentName).toBe("ui8");
  });

  it("clamps sampled state when loop is disabled", () => {
    const entity = new CabinAnimationEntity(cabinAnimationData, createTextureMap(cabinAnimationData.attachmentNames));

    entity.play("cabin");
    entity.setLoop(false);
    entity.update(99);

    expect(entity.getCurrentPose().time).toBe(cabinAnimationData.animations.cabin.duration);

    entity.stop();
    const before = entity.currentTime;
    entity.update(1);
    expect(entity.currentTime).toBe(before);
  });

  it("plays the asset 12 default animation from the bundle registry", () => {
    const bundle = getAnimationBundle("asset-12");
    const entity = new CabinAnimationEntity(
      asset12AnimationData,
      createTextureMap(asset12AnimationData.attachmentNames),
      bundle.defaultAnimationName
    );

    expect(entity.currentAnimationName).toBe("bonus1");
    entity.update(0.5);
    expect(entity.currentTime).toBeCloseTo(0.5);

    entity.play("fg1");
    expect(entity.currentAnimationName).toBe("fg1");
    expect(entity.currentTime).toBe(0);
    expect(entity.getCurrentPose().drawOrder).toEqual(asset12AnimationData.slotOrder);
  });
});