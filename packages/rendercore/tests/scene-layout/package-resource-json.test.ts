import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutPackageResourceFromResolvedFiles,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { resolveSceneLayoutPackageFiles } from "../../src/scene-layout/package-resource.js";
import { createMappedPackageFiles } from "../editor-assets-map-fixture.js";
import { game002LayoutFixture } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

function jsonManifest() {
  const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
  return {
    ...latest,
    runtimeResources: {
      "spin-config": {
        kind: "json" as const,
        path: "assets/spin-config.json",
      },
    },
    runtimeAllocation: {
      ...latest.runtimeAllocation,
      onDemand: {
        ...latest.runtimeAllocation.onDemand,
        runtimeResources: ["spin-config"],
      },
    },
  };
}

describe("scene layout package JSON data", () => {
  it("resolves a mapped v5 initial closure without parsing deferred allocation as empty", async () => {
    const source = jsonManifest();
    const manifest = {
      ...source,
      nodes: source.nodes.map((node) => ({
        ...node,
        resource:
          node.resource.kind === "image"
            ? { ...node.resource, path: "bg.png" }
            : node.resource,
      })),
      runtimeResources: {
        "spin-config": { kind: "json" as const, path: "spin-config.json" },
      },
    };
    const mapped = await createMappedPackageFiles({
      controls: new Map([["layout.manifest.json", encode(manifest)]]),
      assets: new Map([
        ["bg.png", new Uint8Array([1])],
        ["spin-config.json", encode({ reels: [] })],
      ]),
    });
    const partial = new Map(mapped.files);
    partial.delete(mapped.map.files["spin-config.json"]!.path);

    const resolved = await resolveSceneLayoutPackageFiles({
      manifest,
      files: partial,
      allowMissingRuntimeResources: true,
    });

    expect(resolved.has("bg.png")).toBe(true);
    expect(resolved.has("spin-config.json")).toBe(false);
  });

  it("shares one lazy load and exposes the same frozen value through both APIs", async () => {
    const bytes = encode({
      localReels: [["A", "B"]],
      numberWeights: [{ value: 5, weight: 7 }],
    });
    const loader = vi.fn(async () => bytes);
    const resource = await createSceneLayoutPackageResourceFromResolvedFiles({
      manifest: jsonManifest(),
      files: new Map([["assets/bg.png", new Uint8Array([1])]]),
      lazyRuntimeResources: true,
      loadRuntimeResourceBytes: loader,
    });
    try {
      const [value, wrapped] = await Promise.all([
        resource.loadJsonData("spin-config"),
        resource.loadRuntimeResource("spin-config", "json"),
      ]);
      expect(loader).toHaveBeenCalledTimes(1);
      expect(wrapped.value).toBe(value);
      expect(
        resource.getLoadedRuntimeResource("spin-config", "json")?.value,
      ).toBe(value);
      expect(Object.isFrozen(value)).toBe(true);
      await expect(
        resource.loadRuntimeResource("spin-config", "image"),
      ).rejects.toThrow(/must be image; actual json/);
      await expect(resource.loadJsonData("missing")).rejects.toThrow(
        /was not found/,
      );
    } finally {
      resource.destroy();
    }
  });

  it("does not cache invalid JSON and rejects a load that finishes after destroy", async () => {
    const loader = vi
      .fn<() => Promise<Uint8Array>>()
      .mockResolvedValueOnce(encode(7))
      .mockResolvedValueOnce(encode({ ok: true }));
    const resource = await createSceneLayoutPackageResourceFromResolvedFiles({
      manifest: jsonManifest(),
      files: new Map([["assets/bg.png", new Uint8Array([1])]]),
      lazyRuntimeResources: true,
      loadRuntimeResourceBytes: loader,
    });
    await expect(resource.loadJsonData("spin-config")).rejects.toThrow(
      /root must be an object or array/,
    );
    await Promise.resolve();
    await expect(resource.loadJsonData("spin-config")).resolves.toEqual({
      ok: true,
    });
    resource.destroy();

    let resolveBytes!: (bytes: Uint8Array) => void;
    const pendingBytes = new Promise<Uint8Array>((resolve) => {
      resolveBytes = resolve;
    });
    const destroyed = await createSceneLayoutPackageResourceFromResolvedFiles({
      manifest: jsonManifest(),
      files: new Map([["assets/bg.png", new Uint8Array([1])]]),
      lazyRuntimeResources: true,
      loadRuntimeResourceBytes: async () => pendingBytes,
    });
    const pending = destroyed.loadJsonData("spin-config");
    destroyed.destroy();
    resolveBytes(encode({ ok: true }));
    await expect(pending).rejects.toThrow(/destroyed during runtime resource/);
    expect(
      destroyed.getLoadedRuntimeResource("spin-config", "json"),
    ).toBeNull();
  });
});
