import { describe, expect, it } from "vitest";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutManifestDocument,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/data/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout audio runtime resource manifest", () => {
  it("parses a typed audio resource without changing the latest version", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    const parsed = parseSceneLayoutManifestDocument({
      ...latest,
      runtimeResources: {
        jingle: {
          kind: "audio",
          path: "assets/jingle.ogg",
          mediaType: "audio/ogg",
        },
      },
      runtimeAllocation: {
        ...latest.runtimeAllocation,
        onDemand: {
          ...latest.runtimeAllocation.onDemand,
          runtimeResources: ["jingle"],
        },
      },
    });

    expect(parsed.version).toBe(8);
    expect(parsed.runtimeResources?.jingle).toEqual({
      kind: "audio",
      path: "assets/jingle.ogg",
      mediaType: "audio/ogg",
    });
    expect(collectSceneLayoutAssetPaths(parsed)).toContain("assets/jingle.ogg");
  });

  it("strictly validates the path, media type, and shape", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    const allocation = {
      ...latest.runtimeAllocation,
      onDemand: {
        ...latest.runtimeAllocation.onDemand,
        runtimeResources: ["jingle"],
      },
    };
    const parse = (resource: unknown) =>
      parseSceneLayoutManifestDocument({
        ...latest,
        runtimeAllocation: allocation,
        runtimeResources: { jingle: resource },
      });

    expect(() =>
      parse({ kind: "audio", path: "jingle.json", mediaType: "audio/ogg" }),
    ).toThrow(/unsupported extension/);
    expect(() =>
      parse({ kind: "audio", path: "jingle.ogg", mediaType: "video/mp4" }),
    ).toThrow(/mediaType/);
    expect(() =>
      parse({
        kind: "audio",
        path: "jingle.ogg",
        mediaType: "audio/ogg",
        autoplay: true,
      }),
    ).toThrow(/unknown key "autoplay"/);
  });
});
