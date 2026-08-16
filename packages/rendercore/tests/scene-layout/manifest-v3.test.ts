import { describe, expect, it } from "vitest";
import {
  parseSceneLayoutManifestDocument,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout manifest v3", () => {
  it("accepts a canonical allocation and rejects missing or drifting v3 fields", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    expect(parseSceneLayoutManifestDocument(latest)).toEqual(latest);
    const { runtimeAllocation: _allocation, ...missing } = latest;
    expect(() => parseSceneLayoutManifestDocument(missing)).toThrow(
      /runtimeAllocation is required/,
    );
    expect(() =>
      parseSceneLayoutManifestDocument({
        ...latest,
        runtimeAllocation: {
          ...latest.runtimeAllocation,
          package: {
            ...latest.runtimeAllocation.package,
            nodes: [],
          },
        },
      }),
    ).toThrow(/runtimeAllocation\.package\.nodes/);
  });

  it("normalizes both v1 and v2 through the same RenderCore latest path", () => {
    const fromV1 = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    const { runtimeAllocation: _allocation, ...modern } = fromV1;
    const fromV2 = upgradeSceneLayoutManifestToLatest({
      ...modern,
      version: 2,
    });
    expect(fromV2).toEqual(fromV1);
    expect(Object.isFrozen(fromV1.runtimeAllocation)).toBe(true);
  });
});
