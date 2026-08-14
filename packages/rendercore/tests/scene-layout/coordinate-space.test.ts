import { Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout authored coordinates", () => {
  it("keeps center-origin points authored while mapping anchors through Pixi locals", async () => {
    const manifest = structuredClone(game002LayoutFixture);
    (manifest as { coordinateOrigin?: "center" }).coordinateOrigin = "center";
    manifest.nodes[0]!.placements.default = { x: 0, y: 0, scale: 1 };
    manifest.reels.main.placements.default = { x: 0, y: -123 };
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest,
        imageModules: { "assets/bg.png": "memory:bg" },
      }),
      loadTexture: async () => Texture.EMPTY,
      unloadTexture: async () => undefined,
    });
    await runtime.init();
    runtime.applyArtSpace();

    expect(runtime.getLayoutPoint({ kind: "origin" })).toEqual({ x: 0, y: 0 });
    expect(runtime.getLayoutPoint({ kind: "art", align: "top-left" })).toEqual({
      x: -1000,
      y: -1000,
    });
    expect(runtime.getLayoutPoint({ kind: "art", align: "center" })).toEqual({
      x: 0,
      y: 0,
    });
    expect(
      runtime.getLayoutPoint({ kind: "viewport", align: "bottom-right" }),
    ).toEqual({
      x: 1000,
      y: 1000,
    });
    const anchor = runtime.getLayoutAnchor({ x: 25, y: -40 });
    expect(runtime.resolveLayoutAnchor(anchor)).toEqual({ x: 25, y: -40 });
    expect(
      runtime.resolveLayoutAnchor(runtime.getNodeRenderLayer("bg").getAnchor()),
    ).toEqual({
      x: 0,
      y: 0,
    });
    expect(() =>
      runtime.getLayoutPoint({ kind: "art", align: "middle" as "center" }),
    ).toThrow(/alignment/);
    runtime.destroy();
  });

  it("requires a current snapshot and finite authored points", async () => {
    const runtime = createSceneLayoutRuntime({
      resource: createSceneLayoutResource({
        manifest: game002LayoutFixture,
        imageModules: { "assets/bg.png": "memory:bg" },
      }),
      loadTexture: async () => Texture.EMPTY,
      unloadTexture: async () => undefined,
    });
    await runtime.init();
    expect(() => runtime.getLayoutPoint({ kind: "origin" })).toThrow(
      /viewport/,
    );
    runtime.applyArtSpace();
    expect(() => runtime.getLayoutAnchor({ x: Number.NaN, y: 0 })).toThrow(
      /finite/,
    );
    const object = runtime.getRenderObject("bg");
    expect(object?.kind).toBe("image");
    expect(runtime.getRenderObject("bg")).toBe(object);
    object?.setVisible(false);
    expect(runtime.getNode("bg").parent?.visible).toBe(false);
    runtime.setNodeActive("bg", true);
    expect(runtime.getNode("bg").parent?.visible).toBe(false);
    object?.setVisible(true);
    expect(runtime.getNode("bg").parent?.visible).toBe(true);
    expect(() => runtime.getRenderObject("missing")).toThrow(/Unknown/);
    runtime.destroy();
    expect(() => object?.getAnchor()).toThrow(/destroyed/);
  });
});
