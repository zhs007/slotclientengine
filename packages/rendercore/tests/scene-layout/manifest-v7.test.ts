import { describe, expect, it } from "vitest";
import {
  createSceneLayoutRuntimeAllocation,
  createSceneLayoutResource,
  createSceneLayoutRuntime,
  parseSceneLayoutManifestV7,
  resolveSceneLayoutViewportV7,
  upgradeSceneLayoutManifestToLatest,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

function emptyLayout() {
  const draft = {
    version: 7 as const,
    kind: "scene-layout" as const,
    id: "centered-layout",
    main: {
      order: 10,
      columns: 5,
      rows: 3,
      cellSize: { width: 160, height: 160 },
      gap: { x: 0, y: 0 },
    },
    nodes: [],
    gameModes: {
      initialMode: "BaseGame",
      modes: [
        {
          id: "BaseGame",
          main: {
            enabled: true,
            variants: {
              landscape: {
                x: 0,
                y: 0,
                focusRect: { x: -460, y: -300, width: 920, height: 600 },
              },
              portrait: {
                x: 0,
                y: 40,
                focusRect: { x: -460, y: -280, width: 920, height: 640 },
              },
            },
          },
          nodeStates: {},
        },
      ],
    },
    audio: {
      version: 1 as const,
      effects: [],
      music: [],
      programmaticEffects: [],
    },
    eventAudio: { version: 1 as const, ignoreLegacyAudio: false, bindings: [] },
    runtimeAllocation: undefined as never,
  };
  return parseSceneLayoutManifestV7({
    ...draft,
    runtimeAllocation: createSceneLayoutRuntimeAllocation(draft),
  });
}

describe("scene layout manifest v7", () => {
  it("accepts an empty ordinary-node list and resolves main from center coordinates", () => {
    const manifest = emptyLayout();
    const snapshot = resolveSceneLayoutViewportV7({
      manifest,
      viewportSize: { width: 1920, height: 1080 },
    });
    expect(manifest.nodes).toEqual([]);
    expect(snapshot.variantId).toBe("landscape");
    expect(snapshot.main.layoutRect).toEqual({
      x: -400,
      y: -240,
      width: 800,
      height: 480,
    });
  });

  it("initializes and renders without a background or any ordinary node", async () => {
    const resource = createSceneLayoutResource({ manifest: emptyLayout() });
    const runtime = createSceneLayoutRuntime({ resource });
    await runtime.init();
    const snapshot = runtime.applyViewport({ width: 1080, height: 1920 });
    expect(snapshot.variantId).toBe("portrait");
    expect(snapshot.main.enabled).toBe(true);
    expect(runtime.getLayoutPoint({ kind: "origin" })).toEqual({ x: 0, y: 0 });
    expect(runtime.getLayoutPoint({ kind: "main", align: "center" })).toEqual({
      x: 0,
      y: 40,
    });
    runtime.destroy();
  });

  it("rejects removed Scene Layout concepts in native v7", () => {
    const manifest = emptyLayout();
    for (const [field, value] of [
      ["coordinateOrigin", "center"],
      ["artSize", { width: 1920, height: 1080 }],
      ["adaptation", {}],
      ["backgroundNodes", {}],
    ] as const)
      expect(() =>
        parseSceneLayoutManifestV7({ ...manifest, [field]: value }),
      ).toThrow(/unknown/);
  });

  it("upgrades legacy data to v7 without mutating its source", () => {
    const source = structuredClone(game002LayoutFixture);
    const before = structuredClone(source);
    const upgraded = upgradeSceneLayoutManifestToLatest(source);
    expect(source).toEqual(before);
    expect(upgraded.version).toBe(7);
    expect(upgraded).toHaveProperty("main");
    expect(upgraded).not.toHaveProperty("coordinateOrigin");
    expect(upgraded).not.toHaveProperty("adaptation");
    expect(upgraded.gameModes.modes[0]).toHaveProperty(
      "main.variants.landscape",
    );
  });
});
