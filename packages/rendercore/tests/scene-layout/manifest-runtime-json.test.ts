import { describe, expect, it } from "vitest";
import {
  collectSceneLayoutAssetPaths,
  parseSceneLayoutJsonData,
  parseSceneLayoutManifestDocument,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/data/index.js";
import { game002LayoutFixture } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

describe("scene layout JSON runtime resource manifest", () => {
  it("adds the JSON kind without changing the latest version or old documents", () => {
    const legacyLatest =
      upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    expect(legacyLatest.version).toBe(7);
    expect(legacyLatest.runtimeResources).toBeUndefined();

    const latest = parseSceneLayoutManifestDocument({
      ...legacyLatest,
      runtimeResources: {
        "spin-config": { kind: "json", path: "assets/spin-config.json" },
      },
      runtimeAllocation: {
        ...legacyLatest.runtimeAllocation,
        onDemand: {
          ...legacyLatest.runtimeAllocation.onDemand,
          runtimeResources: ["spin-config"],
        },
      },
    });
    expect(latest.version).toBe(7);
    expect(latest.runtimeResources?.["spin-config"]).toEqual({
      kind: "json",
      path: "assets/spin-config.json",
    });
    expect(collectSceneLayoutAssetPaths(latest)).toContain(
      "assets/spin-config.json",
    );
  });

  it("strictly validates the JSON spec", () => {
    const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
    const allocation = {
      ...latest.runtimeAllocation,
      onDemand: {
        ...latest.runtimeAllocation.onDemand,
        runtimeResources: ["spin-config"],
      },
    };
    expect(() =>
      parseSceneLayoutManifestDocument({
        ...latest,
        runtimeAllocation: allocation,
        runtimeResources: {
          "spin-config": { kind: "json", path: "spin-config.txt" },
        },
      }),
    ).toThrow(/unsupported extension/);
    expect(() =>
      parseSceneLayoutManifestDocument({
        ...latest,
        runtimeAllocation: allocation,
        runtimeResources: {
          "spin-config": {
            kind: "json",
            path: "spin-config.json",
            fallback: "other.json",
          },
        },
      }),
    ).toThrow(/unknown key "fallback"/);
  });
});

describe("scene layout JSON program data", () => {
  it("returns a deeply frozen object or array without assigning business schema", () => {
    const value = parseSceneLayoutJsonData(
      encode({
        localReels: [["A", "B"]],
        numberWeights: [{ value: 10, weight: 3 }],
      }),
      "spin-config.json",
    );
    expect(value).toEqual({
      localReels: [["A", "B"]],
      numberWeights: [{ value: 10, weight: 3 }],
    });
    expect(Object.isFrozen(value)).toBe(true);
    expect(
      Object.isFrozen((value as { localReels: unknown[] }).localReels),
    ).toBe(true);
    expect(Object.isFrozen(parseSceneLayoutJsonData(encode([1, 2])))).toBe(
      true,
    );
  });

  it("rejects primitive roots, malformed UTF-8, and malformed JSON", () => {
    expect(() => parseSceneLayoutJsonData(encode(1), "value.json")).toThrow(
      /root must be an object or array/,
    );
    expect(() =>
      parseSceneLayoutJsonData(new Uint8Array([0xff]), "bad.json"),
    ).toThrow(/invalid UTF-8/);
    expect(() =>
      parseSceneLayoutJsonData(new TextEncoder().encode("{"), "bad.json"),
    ).toThrow(/invalid JSON/);
  });
});
