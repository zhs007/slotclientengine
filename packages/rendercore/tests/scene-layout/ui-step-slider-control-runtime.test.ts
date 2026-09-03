import {
  Container,
  Texture,
  TextureSource,
  type FederatedPointerEvent,
} from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutManifestDocument,
  parseSceneLayoutManifestV7,
  upgradeSceneLayoutManifestToLatest,
  resolveNearestStepSliderState,
  resolveStepSliderPosition,
} from "../../src/scene-layout/index.js";
import { compileGameLayoutRuntimeEventCatalog } from "../../src/scene-layout/core/runtime-address-catalog.js";
import { game002LayoutFixture } from "./fixtures.js";

const TRACK_SIZE = { width: 336, height: 50 };
const THUMB_SIZE = { width: 46, height: 46 };

function sliderManifest() {
  const draft = {
    version: 7 as const,
    kind: "scene-layout" as const,
    id: "step-slider-layout",
    main: {
      order: 10,
      columns: 1,
      rows: 1,
      cellSize: { width: 10, height: 10 },
      gap: { x: 0, y: 0 },
    },
    nodes: [
      {
        id: "fastplay-speed",
        order: 1,
        uiControl: {
          kind: "step-slider" as const,
          track: {
            kind: "image" as const,
            path: "splash_fastplay_bar.png",
            size: TRACK_SIZE,
          },
          thumb: {
            kind: "image" as const,
            path: "splash_fastplay_tag.png",
            size: THUMB_SIZE,
          },
          steps: 3,
          snapDurationSeconds: 0.12,
        },
        placements: {
          landscape: { x: 0, y: 0, scale: 1 },
          portrait: { x: 0, y: 0, scale: 1 },
        },
      },
    ],
    gameModes: {
      initialMode: "Splash",
      modes: [
        {
          id: "Splash",
          main: {
            enabled: false,
            variants: {
              landscape: {
                x: 0,
                y: 0,
                focusRect: { x: -200, y: -100, width: 400, height: 200 },
              },
              portrait: {
                x: 0,
                y: 0,
                focusRect: { x: -200, y: -100, width: 400, height: 200 },
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

function texture(width: number, height: number): Texture {
  return new Texture({ source: new TextureSource({ width, height }) });
}

function pointerEvent(pointerId: number, x: number): FederatedPointerEvent {
  return {
    pointerId,
    getLocalPosition: () => ({ x, y: 0 }),
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
  } as unknown as FederatedPointerEvent;
}

describe("Scene Layout step-slider UI control", () => {
  it("parses the v7 branch and derives exact equally spaced positions", () => {
    const manifest = sliderManifest();
    const node = manifest.nodes[0];
    if (
      !node ||
      !("uiControl" in node) ||
      node.uiControl.kind !== "step-slider"
    )
      throw new Error("expected step-slider node");
    expect([
      resolveStepSliderPosition(node.uiControl, 0),
      resolveStepSliderPosition(node.uiControl, 1),
      resolveStepSliderPosition(node.uiControl, 2),
    ]).toEqual([-145, 0, 145]);
    expect(resolveNearestStepSliderState(node.uiControl, -72.5)).toBe(1);
    expect(resolveNearestStepSliderState(node.uiControl, 999)).toBe(2);

    const invalid = structuredClone(manifest) as any;
    invalid.nodes[0].uiControl.steps = 1;
    expect(() => parseSceneLayoutManifestV7(invalid)).toThrow(/at least 2/);
    const noTravel = structuredClone(manifest) as any;
    noTravel.nodes[0].uiControl.track.size.width = 46;
    expect(() => parseSceneLayoutManifestV7(noTravel)).toThrow(
      /greater than thumb width/,
    );
    const legacy = structuredClone(game002LayoutFixture) as any;
    legacy.nodes[0].uiControl = structuredClone(node.uiControl);
    expect(() => parseSceneLayoutManifestDocument(legacy)).toThrow(/unknown/);
  });

  it("drags, snaps on the manual clock, and commits one entered event", async () => {
    const events: unknown[] = [];
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest: sliderManifest(),
        imageModules: {
          "splash_fastplay_bar.png": "memory:track",
          "splash_fastplay_tag.png": "memory:thumb",
        },
      }),
      loadTexture: vi.fn(async (url) =>
        url === "memory:track"
          ? texture(TRACK_SIZE.width, TRACK_SIZE.height)
          : texture(THUMB_SIZE.width, THUMB_SIZE.height),
      ),
      observeUiControlState: (event) => events.push(event),
    });
    await runtime.init();
    runtime.applyViewport({ width: 400, height: 200 });
    const capability = runtime.getUiControl("fastplay-speed");
    expect(capability?.kind).toBe("step-slider");
    if (capability?.kind !== "step-slider") throw new Error("wrong control");
    expect(capability.steps).toBe(3);
    expect(capability.getState()).toBe(0);
    const view = runtime.getNode("fastplay-speed").children[0] as Container;
    const thumb = view.children[1];
    view.emit("pointerdown", pointerEvent(7, 100));
    view.emit("globalpointermove", pointerEvent(7, 999));
    expect(thumb?.x).toBe(145);
    view.emit("globalpointermove", pointerEvent(7, 100));
    view.emit("pointerupoutside", pointerEvent(7, 999));
    expect(capability.getState()).toBe(0);
    runtime.update(0.06);
    expect(thumb?.x).toBeGreaterThan(100);
    expect(capability.getState()).toBe(0);
    runtime.update(0.06);
    expect(thumb?.x).toBe(145);
    expect(capability.getState()).toBe(2);
    expect(events).toEqual([
      expect.objectContaining({
        controlId: "fastplay-speed",
        controlKind: "step-slider",
        previousState: 0,
        state: 2,
        source: "pointer",
      }),
    ]);
    runtime.destroy();
  });

  it("supports awaitable programmatic state and rejects superseded work", async () => {
    const events: unknown[] = [];
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest: sliderManifest(),
        imageModules: {
          "splash_fastplay_bar.png": "memory:track",
          "splash_fastplay_tag.png": "memory:thumb",
        },
      }),
      loadTexture: async (url) =>
        url === "memory:track"
          ? texture(TRACK_SIZE.width, TRACK_SIZE.height)
          : texture(THUMB_SIZE.width, THUMB_SIZE.height),
      observeUiControlState: (event) => events.push(event),
    });
    await runtime.init();
    const capability = runtime.getUiControl("fastplay-speed");
    if (capability?.kind !== "step-slider") throw new Error("wrong control");
    const first = capability.setState(2);
    const second = capability.setState(1);
    await expect(first).rejects.toThrow(/superseded/);
    runtime.update(0.12);
    await second;
    expect(capability.getState()).toBe(1);
    await expect(capability.setState(3)).rejects.toThrow(/between 0 and 2/);
    await capability.setState(1);
    expect(events).toHaveLength(1);
    runtime.destroy();
    expect(() => capability.getState()).toThrow(/destroyed/);
  });

  it("waits for both texture prepares before rolling back a failed control", async () => {
    let resolveTrack!: (value: Texture) => void;
    const track = new Promise<Texture>((resolve) => {
      resolveTrack = resolve;
    });
    const unloadTexture = vi.fn(async () => undefined);
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest: sliderManifest(),
        imageModules: {
          "splash_fastplay_bar.png": "memory:track",
          "splash_fastplay_tag.png": "memory:thumb",
        },
      }),
      loadTexture: vi.fn((url) =>
        url === "memory:track"
          ? track
          : Promise.reject(new Error("thumb decode failed")),
      ),
      unloadTexture,
    });
    const initialization = runtime.init();
    void initialization.catch(() => undefined);
    await Promise.resolve();
    expect(unloadTexture).not.toHaveBeenCalled();
    resolveTrack(texture(TRACK_SIZE.width, TRACK_SIZE.height));
    await expect(initialization).rejects.toThrow(/thumb decode failed/);
    expect(unloadTexture).toHaveBeenCalledWith("memory:track");
    runtime.destroy();
  });

  it("publishes one globally unique catalog event per step", () => {
    const catalog = compileGameLayoutRuntimeEventCatalog({
      manifest: upgradeSceneLayoutManifestToLatest(sliderManifest()),
      symbolPackages: {},
      popupManifests: {},
    });
    const entries = catalog.entries.filter(
      (entry) => entry.family === "ui-control-state",
    );
    expect(entries.map((entry) => entry.descriptor.address)).toEqual([
      "gamelayout:/ui-control/fastplay-speed/step-slider/state/0/entered",
      "gamelayout:/ui-control/fastplay-speed/step-slider/state/1/entered",
      "gamelayout:/ui-control/fastplay-speed/step-slider/state/2/entered",
    ]);
    expect(entries[1]).toMatchObject({
      facets: [
        { key: "control", value: "fastplay-speed" },
        { key: "control-kind", value: "step-slider" },
        { key: "state", value: "1" },
        { key: "edge", value: "entered" },
      ],
      descriptor: { detail: { state: 1, steps: 3 } },
    });
  });
});
