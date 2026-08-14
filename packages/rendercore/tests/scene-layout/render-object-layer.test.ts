import { Assets, Container, Texture } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRenderObject,
  getRenderObjectAdapter,
} from "../../src/presentation/render-object.js";
import {
  createSceneLayoutPackageResource,
  createSceneLayoutPresentationSurface,
  createSceneLayoutResource,
  createSceneLayoutRuntime,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

function renderObject() {
  const view = new Container();
  return {
    object: createRenderObject({
      view,
      destroy: () => view.destroy({ children: true }),
    }),
    view,
  };
}

describe("scene layout RenderObject layers", () => {
  afterEach(() => vi.restoreAllMocks());

  it("reuses exact node child/before/after bands and current transforms", async () => {
    const manifest = {
      ...game002LayoutFixture,
      nodes: [
        {
          ...game002LayoutFixture.nodes[0],
          placements: {
            default: {
              x: 100,
              y: 200,
              scale: 2,
              rotation: 30,
              center: { x: 0.5, y: 0.5 },
            },
          },
        },
      ],
    };
    const resource = createSceneLayoutResource({
      manifest,
      imageModules: { "assets/bg.png": "memory:bg" },
    });
    const runtime = createSceneLayoutRuntime({
      resource,
      loadTexture: async () => Texture.EMPTY,
      unloadTexture: async () => undefined,
    });
    await runtime.init();
    runtime.applyArtSpace();

    const child = renderObject();
    const before = renderObject();
    const after = renderObject();
    runtime.getNodeRenderLayer("bg").add(child.object);
    runtime.getNodeRenderLayer("bg", "before").add(before.object);
    runtime.getNodeRenderLayer("bg", "after").add(after.object);
    expect(child.view.parent?.label).toBe("bg");
    expect(before.view.parent?.label).toBe("scene-layout-before:bg");
    expect(after.view.parent?.label).toBe("scene-layout-after:bg");

    const rootObject = renderObject();
    const anchor = runtime.getNodeRenderLayer("bg").getAnchor({ x: 10, y: 20 });
    const expected = runtime.getRootRenderLayer().resolveAnchor(anchor);
    runtime.getRootRenderLayer().addAt(rootObject.object, {
      anchor,
      offset: { x: 5, y: -4 },
      order: 2,
    });
    expect(rootObject.view.position.x).toBeCloseTo(expected.x + 5);
    expect(rootObject.view.position.y).toBeCloseTo(expected.y - 4);
    expect(rootObject.view.parent?.label).toBe(
      "scene-layout-render-layer:layout",
    );

    runtime.setNodeActive("bg", false);
    expect(runtime.getNode("bg").parent?.visible).toBe(false);
    expect(() => runtime.getNodeRenderLayer("missing")).toThrow(/Unknown/);
    expect(() => runtime.getNodeRenderLayer("bg", "middle" as "child")).toThrow(
      /placement/,
    );
    runtime.destroy();
    for (const item of [child, before, after, rootObject]) {
      expect(item.view.parent).toBeNull();
      expect(getRenderObjectAdapter(item.object).view).toBe(item.view);
      item.object.destroy();
    }
  });

  it("adds safe package layers without changing borrowed Container seams", async () => {
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const resource = await createSceneLayoutPackageResource({
      manifest: game002LayoutFixture,
      files: new Map([["assets/bg.png", new Uint8Array([1])]]),
    });
    const surface = createSceneLayoutPresentationSurface({ resource });
    await surface.init();
    surface.applyArtSpace();
    const layout = renderObject();
    const transition = renderObject();
    const popup = renderObject();
    surface.getRenderLayer("layout").add(layout.object);
    surface.getRenderLayer("transition").add(transition.object);
    surface.getRenderLayer("popup").add(popup.object);
    expect(layout.view.parent?.label).toBe("scene-layout-render-layer:layout");
    expect(transition.view.parent?.label).toBe(
      "scene-layout-render-layer:transition",
    );
    expect(popup.view.parent?.label).toBe("scene-layout-render-layer:popup");
    expect(surface.getLayer("layout")).toBe(surface.backgroundContainer);
    expect(surface.getNode("bg").label).toBe("bg");
    expect(surface.getNodeAnchor("bg")).toEqual({ kind: "render-anchor" });
    expect(surface.getNodeRenderLayer("bg")).toBeDefined();
    expect(() => surface.getRenderLayer("reel")).toThrow(/unavailable/);
    surface.destroy();
    for (const item of [layout, transition, popup]) {
      expect(item.view.parent).toBeNull();
      item.object.destroy();
    }
  });
});
