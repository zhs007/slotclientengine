import { describe, expect, it } from "vitest";
import { cabinAnimationData } from "../../src/data/cabin-animation-data.js";
import { buildVictoryProject, EXPORT_STAGE, MIRROR_LAYER_PAIRS } from "../../src/runtime/spine-to-victoryani.js";

function createAssetPaths() {
  return Object.fromEntries(cabinAnimationData.attachmentNames.map((name) => [name, `./assets/${name}.png`]));
}

function getFirstVisibleFrame(script: string) {
  const payload = JSON.parse(script) as { frames: Array<[number, number, number, number, number, number, 0 | 1]> };
  return payload.frames.find((frame) => frame[6] === 1) ?? payload.frames[0];
}

describe("mirror mapping", () => {
  it("keeps known UI branch pairs mirrored around the export stage anchor", () => {
    const project = buildVictoryProject(cabinAnimationData, "cabin", {
      fps: cabinAnimationData.skeleton.fps,
      assetPaths: createAssetPaths(),
      stageAnchorX: EXPORT_STAGE.anchorX,
      stageAnchorY: EXPORT_STAGE.anchorY
    });

    for (const [leftId, rightId] of MIRROR_LAYER_PAIRS) {
      const left = project.layers?.find((layer) => layer.id === leftId);
      const right = project.layers?.find((layer) => layer.id === rightId);

      expect(left).toBeDefined();
      expect(right).toBeDefined();

      const leftFrame = getFirstVisibleFrame(left!.animations![0].script!);
      const rightFrame = getFirstVisibleFrame(right!.animations![0].script!);

      expect(leftFrame[0] + rightFrame[0]).toBeCloseTo(EXPORT_STAGE.anchorX * 2, 1);
      expect(leftFrame[1]).toBeCloseTo(rightFrame[1], 1);
      expect(Math.abs(leftFrame[2])).toBeCloseTo(Math.abs(rightFrame[2]), 3);
      expect(Math.abs(leftFrame[3])).toBeCloseTo(Math.abs(rightFrame[3]), 3);
    }
  });
});