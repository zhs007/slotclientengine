import { describe, expect, it } from "vitest";
import {
  getLayerDisplayAsset,
  getLayerDisplayAssetId,
  getSequenceFrameAssetId,
} from "../../src/core/sequence-layer";
import type {
  V5GAssetConfig,
  V5GLayerConfig,
  V5GTransformConfig,
} from "../../src/core/types";

const transform: V5GTransformConfig = {
  x: 0,
  y: 0,
  scaleX: 1,
  scaleY: 1,
  rotation: 0,
  anchorX: 0.5,
  anchorY: 0.5,
};

const assets = new Map<string, V5GAssetConfig>(
  ["a", "b", "c"].map((id) => [
    id,
    {
      id,
      type: "image",
      path: `assets/${id}.png`,
      originalName: `${id}.png`,
      width: 100,
      height: 80,
    },
  ]),
);

function sequenceLayer(
  frameAssetIds: string[],
  overrides: Partial<NonNullable<V5GLayerConfig["sequence"]>> = {},
): V5GLayerConfig {
  return {
    id: "sequence",
    name: "Sequence",
    type: "sequence",
    assetId: null,
    sequence: {
      frameAssetIds,
      cycleDuration: 0.3,
      loop: true,
      ...overrides,
    },
    parentId: null,
    groupId: "group_default",
    visible: true,
    locked: false,
    transform,
    opacity: 1,
    blendMode: "normal",
    animations: [],
    keyframes: [],
  };
}

function imageLayer(assetId: string | null): V5GLayerConfig {
  return {
    ...sequenceLayer([]),
    id: "image",
    name: "Image",
    type: "image",
    assetId,
    sequence: undefined,
  };
}

describe("sequence-layer", () => {
  it("loops sequence frames with editor-compatible frame boundaries", () => {
    const layer = sequenceLayer(["a", "b", "c"]);

    expect(getSequenceFrameAssetId(layer, -1)).toBe("a");
    expect(getSequenceFrameAssetId(layer, 0)).toBe("a");
    expect(getSequenceFrameAssetId(layer, 0.1)).toBe("b");
    expect(getSequenceFrameAssetId(layer, 0.2)).toBe("c");
    expect(getSequenceFrameAssetId(layer, 0.3)).toBe("a");
    expect(getSequenceFrameAssetId(layer, 0.41)).toBe("b");
  });

  it("clamps non-looping sequences to the final frame", () => {
    const layer = sequenceLayer(["a", "b", "c"], { loop: false });

    expect(getSequenceFrameAssetId(layer, 0.29)).toBe("c");
    expect(getSequenceFrameAssetId(layer, 0.3)).toBe("c");
    expect(getSequenceFrameAssetId(layer, 4)).toBe("c");
  });

  it("returns the only frame without depending on duration", () => {
    const layer = sequenceLayer(["b"], {
      cycleDuration: 0,
      loop: false,
    });

    expect(getSequenceFrameAssetId(layer, 99)).toBe("b");
  });

  it("resolves image and sequence display assets", () => {
    const layer = sequenceLayer(["a", "b", "c"]);

    expect(getLayerDisplayAssetId(imageLayer("a"), 1)).toBe("a");
    expect(getLayerDisplayAssetId(layer, 0.2)).toBe("c");
    expect(getLayerDisplayAsset(layer, 0.2, assets)?.id).toBe("c");
    expect(getLayerDisplayAsset(imageLayer(null), 0, assets)).toBeNull();
  });

  it("fails explicitly for invalid sequence display contracts", () => {
    expect(() => getSequenceFrameAssetId(imageLayer("a"), 0)).toThrow(
      "is not a sequence layer",
    );
    expect(() =>
      getSequenceFrameAssetId(
        { ...sequenceLayer(["a"]), sequence: undefined },
        0,
      ),
    ).toThrow("is missing sequence");
    expect(() => getSequenceFrameAssetId(sequenceLayer([]), 0)).toThrow(
      "requires at least one frameAssetId",
    );
    expect(() =>
      getLayerDisplayAsset(sequenceLayer(["missing"]), 0, assets),
    ).toThrow('references missing display asset "missing"');
  });
});
