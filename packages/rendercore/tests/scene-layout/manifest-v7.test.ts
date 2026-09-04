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
  it("accepts only the narrow optional tap info Popup Object binding", () => {
    const source = emptyLayout();
    const mapped = parseSceneLayoutManifestV7({
      ...source,
      tapInfoObject: {
        manifest: "tap-to-continue-popup-object.manifest.json",
      },
    });
    expect(mapped.tapInfoObject).toEqual({
      manifest: "tap-to-continue-popup-object.manifest.json",
    });
    expect(parseSceneLayoutManifestV7({ ...source })).not.toHaveProperty(
      "tapInfoObject",
    );
    expect(() =>
      parseSceneLayoutManifestV7({
        ...source,
        tapInfoObject: { manifest: "../popup-object.manifest.json" },
      }),
    ).toThrow(/tapInfoObject\.manifest/);
    expect(() =>
      parseSceneLayoutManifestV7({
        ...source,
        tapInfoObject: {
          manifest: "tap-to-continue-popup-object.manifest.json",
          fallback: true,
        },
      }),
    ).toThrow(/unknown/);
  });

  it("accepts Popup Object only as an explicit node bound to tapInfoObject", () => {
    const source = emptyLayout();
    const objectManifest =
      "dependencies/popup-objects/tap-to-continue/popup-object.manifest.json";
    const node = {
      id: "tap-info",
      order: 2000,
      resource: { kind: "popup-object" as const, manifest: objectManifest },
      placements: {
        landscape: { x: 120, y: 240, scale: 1 },
        portrait: { x: -40, y: 360, scale: 1 },
      },
      scope: { BaseGame: ["landscape" as const] },
    };
    const draft = {
      ...source,
      nodes: [node],
      tapInfoObject: { manifest: objectManifest },
      runtimeAllocation: undefined,
    };
    const parsed = parseSceneLayoutManifestV7({
      ...draft,
      runtimeAllocation: createSceneLayoutRuntimeAllocation(draft as never),
    });
    expect(parsed.nodes[0]).toMatchObject(node);

    const { tapInfoObject: _tapInfoObject, ...withoutTapInfoObject } = draft;
    expect(() =>
      parseSceneLayoutManifestV7({
        ...withoutTapInfoObject,
        runtimeAllocation: createSceneLayoutRuntimeAllocation(draft as never),
      }),
    ).toThrow(/requires tapInfoObject/u);
    expect(() =>
      parseSceneLayoutManifestV7({
        ...draft,
        tapInfoObject: {
          manifest:
            "dependencies/popup-objects/other/popup-object.manifest.json",
        },
        runtimeAllocation: createSceneLayoutRuntimeAllocation(draft as never),
      }),
    ).toThrow(/must reference tapInfoObject\.manifest/u);
  });

  it("places an explicit Popup Object node with ordinary center coordinates", async () => {
    const source = emptyLayout();
    const objectManifest =
      "dependencies/popup-objects/tap-to-continue/popup-object.manifest.json";
    const draft = {
      ...source,
      nodes: [
        {
          id: "tap-info",
          order: 2000,
          resource: {
            kind: "popup-object" as const,
            manifest: objectManifest,
          },
          placements: {
            landscape: { x: 120, y: 240, scale: 1 },
            portrait: { x: -40, y: 360, scale: 1 },
          },
        },
      ],
      tapInfoObject: { manifest: objectManifest },
      runtimeAllocation: undefined,
    };
    const manifest = parseSceneLayoutManifestV7({
      ...draft,
      runtimeAllocation: createSceneLayoutRuntimeAllocation(draft as never),
    });
    const popupObjectResource = {
      kind: "popup-object" as const,
      manifest: {
        version: 1 as const,
        kind: "popup-object" as const,
        name: "tap-to-continue",
        resources: {},
        layers: [],
      },
      resource: {
        manifest: {
          version: 9 as const,
          kind: "popup" as const,
          id: "tap-to-continue",
          name: "tap-to-continue",
          type: "single-state" as const,
          adaptation: {
            mode: "maximized-focus" as const,
            focus: { left: 1, right: 1, top: 1, bottom: 1 },
          },
          backdrop: {
            enabled: false,
            color: "#000000",
            alpha: 0,
            visibleStates: ["active" as const],
          },
          resources: {},
          audio: { version: 1 as const, effects: [], cues: [] },
          singleState: { layers: [] },
        },
        resources: {},
        destroy() {},
      },
    };
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest,
        popupObjectResource: popupObjectResource as never,
      }),
    });
    await runtime.init();
    runtime.applyViewport({ width: 1920, height: 1080 });
    expect(
      runtime.container.getChildByLabel("scene-layout-slot:tap-info", true)
        ?.position,
    ).toMatchObject({ x: 120, y: 240 });
    expect(runtime.getRenderObject("tap-info")).toMatchObject({
      kind: "popup-object",
    });
    runtime.update(1 / 60);
    runtime.destroy();
  });

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
    expect(upgraded.version).toBe(8);
    expect(upgraded).toHaveProperty("main");
    expect(upgraded).not.toHaveProperty("coordinateOrigin");
    expect(upgraded).not.toHaveProperty("adaptation");
    expect(upgraded.gameModes.modes[0]).toHaveProperty(
      "main.variants.landscape",
    );
  });
});
