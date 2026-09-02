import { Sprite, Texture, type FederatedPointerEvent } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
  createSceneLayoutRuntimeAllocation,
  parseSceneLayoutManifestDocument,
  parseSceneLayoutManifestV7,
} from "../../src/scene-layout/index.js";
import { compileGameLayoutRuntimeEventCatalog } from "../../src/scene-layout/core/runtime-address-catalog.js";
import { game002LayoutFixture } from "./fixtures.js";

function radioManifest() {
  const size = { width: Texture.WHITE.width, height: Texture.WHITE.height };
  const draft = {
    version: 7 as const,
    kind: "scene-layout" as const,
    id: "radio-layout",
    main: {
      order: 10,
      columns: 1,
      rows: 1,
      cellSize: { width: 10, height: 10 },
      gap: { x: 0, y: 0 },
    },
    nodes: [
      {
        id: "splash-flag",
        order: 1,
        uiControl: {
          kind: "radio" as const,
          off: { kind: "image" as const, path: "flag-off.png", size },
          on: { kind: "image" as const, path: "flag-on.png", size },
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
                focusRect: { x: -50, y: -50, width: 100, height: 100 },
              },
              portrait: {
                x: 0,
                y: 0,
                focusRect: { x: -50, y: -50, width: 100, height: 100 },
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

describe("Scene Layout radio UI control", () => {
  it("parses the v7-only layer union and contributes both exact image paths", () => {
    const manifest = radioManifest();
    const radioNode = manifest.nodes[0];
    if (!radioNode || !("uiControl" in radioNode))
      throw new Error("expected radio UI-control node");
    expect(manifest.version).toBe(7);
    expect(manifest.nodes[0]).toMatchObject({
      id: "splash-flag",
      uiControl: { kind: "radio" },
    });
    const duplicate = structuredClone(manifest) as any;
    duplicate.nodes[0].uiControl.on.path = "flag-off.png";
    expect(() => parseSceneLayoutManifestV7(duplicate)).toThrow(
      /off\/on paths must be different/,
    );
    const both = structuredClone(manifest) as any;
    both.nodes[0].resource = both.nodes[0].uiControl.off;
    expect(() => parseSceneLayoutManifestV7(both)).toThrow(
      /exactly one of resource or uiControl/,
    );
    const duplicateOrder = structuredClone(manifest) as any;
    duplicateOrder.nodes[0].order = duplicateOrder.main.order;
    expect(() => parseSceneLayoutManifestV7(duplicateOrder)).toThrow(
      /node\/reel\/popup order must be unique/,
    );
    const legacy = structuredClone(game002LayoutFixture) as any;
    legacy.nodes[0].uiControl = structuredClone(radioNode.uiControl);
    expect(() => parseSceneLayoutManifestDocument(legacy)).toThrow(/unknown/);
  });

  it("keeps one Sprite, toggles state, and emits only committed edges", async () => {
    const events: unknown[] = [];
    const manifest = radioManifest();
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest,
        imageModules: {
          "flag-off.png": "memory:off",
          "flag-on.png": "memory:on",
        },
      }),
      loadTexture: vi.fn(async () => Texture.WHITE),
      observeUiControlState: (event) => events.push(event),
    });
    await runtime.init();
    runtime.applyViewport({ width: 100, height: 100 });
    expect(runtime.getRenderObject("splash-flag")).toBeNull();
    const control = runtime.getUiControl("splash-flag");
    expect(control?.kind).toBe("radio");
    expect(control?.getState()).toBe("off");
    control?.setState("off");
    expect(events).toEqual([]);
    control?.setState("on");
    expect(control?.getState()).toBe("on");
    expect(events).toEqual([
      expect.objectContaining({
        controlId: "splash-flag",
        previousState: "off",
        state: "on",
        source: "programmatic",
      }),
    ]);
    const sprite = runtime.getNode("splash-flag").children[0] as Sprite;
    const movedDraft = {
      ...manifest,
      nodes: manifest.nodes.map((node, index) =>
        index === 0
          ? {
              ...node,
              placements: {
                ...node.placements,
                landscape: { ...node.placements.landscape!, x: 12 },
              },
            }
          : node,
      ),
    };
    const moved = {
      ...movedDraft,
      runtimeAllocation: createSceneLayoutRuntimeAllocation(movedDraft),
    };
    runtime.applyGeometryManifest(moved);
    expect(control?.getState()).toBe("on");
    expect(runtime.getNode("splash-flag").children[0]).toBe(sprite);
    const nativeTarget = new EventTarget();
    const hostClick = vi.fn();
    nativeTarget.addEventListener("pointerup", (nativeEvent) => {
      sprite.emit("pointertap", {
        preventDefault: vi.fn(),
        stopPropagation: vi.fn(),
        nativeEvent: nativeEvent as PointerEvent,
      } as unknown as FederatedPointerEvent);
    });
    nativeTarget.dispatchEvent(
      new Event("pointerup", { bubbles: true, cancelable: true }),
    );
    nativeTarget.addEventListener("click", hostClick);
    nativeTarget.dispatchEvent(
      new Event("click", { bubbles: true, cancelable: true }),
    );
    expect(control?.getState()).toBe("off");
    expect(hostClick).not.toHaveBeenCalled();
    expect(events).toHaveLength(2);
    expect(events[1]).toMatchObject({ source: "pointer", state: "off" });
    expect(runtime.getNode("splash-flag").children[0]).toBe(sprite);
    runtime.destroy();
    expect(() => control?.getState()).toThrow(/destroyed/);
  });

  it("rolls back a partially prepared radio when either texture fails", async () => {
    const unloadTexture = vi.fn(async () => undefined);
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest: radioManifest(),
        imageModules: {
          "flag-off.png": "memory:off",
          "flag-on.png": "memory:on",
        },
      }),
      loadTexture: vi.fn(async (url) => {
        if (url === "memory:on") throw new Error("decode failed");
        return Texture.WHITE;
      }),
      unloadTexture,
    });
    await expect(runtime.init()).rejects.toThrow(/decode failed/);
    expect(unloadTexture).toHaveBeenCalledWith("memory:off");
    runtime.destroy();
  });

  it("publishes globally unique state-specific catalog addresses", () => {
    const catalog = compileGameLayoutRuntimeEventCatalog({
      manifest: radioManifest(),
      symbolPackages: {},
      popupManifests: {},
    });
    const entries = catalog.entries.filter(
      (entry) => entry.family === "ui-control-state",
    );
    expect(entries.map((entry) => entry.descriptor.address)).toEqual([
      "gamelayout:/ui-control/splash-flag/radio/state/off/entered",
      "gamelayout:/ui-control/splash-flag/radio/state/on/entered",
    ]);
    expect(entries[1]?.facets).toEqual([
      { key: "control", value: "splash-flag" },
      { key: "control-kind", value: "radio" },
      { key: "state", value: "on" },
      { key: "edge", value: "entered" },
    ]);
  });
});
