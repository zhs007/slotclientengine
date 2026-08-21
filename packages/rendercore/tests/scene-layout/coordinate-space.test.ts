import { Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutResource,
  createSceneLayoutRuntime,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout authored coordinates", () => {
  it("animates authored node position and program properties on the runtime clock", async () => {
    const manifest = structuredClone(game002LayoutFixture);
    manifest.nodes[0]!.placements.default = {
      x: 100,
      y: 200,
      scale: 2,
    };
    (
      manifest.nodes[0]!.placements
        .default as (typeof manifest.nodes)[0]["placements"]["default"] & {
        rotation: number;
      }
    ).rotation = 10;
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
    const object = runtime.getRenderObject("bg");
    if (!object) throw new Error("expected authored image object");
    const slot = runtime.getNode("bg").parent!;
    const initialOrigin = runtime.resolveLayoutAnchor(object.getAnchor());
    const homeOrigin = runtime.resolveLayoutAnchor(
      object.motion.getHomeAnchor(),
    );

    const completed = vi.fn();
    const animation = object.motion
      .animate({
        position: {
          anchor: runtime.getLayoutAnchor({ x: 500, y: 200 }),
          selfAlign: "origin",
          axis: "x",
        },
        opacity: 0.25,
        scale: { x: 1.5, y: -0.5 },
        rotationDegrees: 170,
        durationSeconds: 1,
      })
      .then(completed);

    runtime.update(0.5);
    expect(slot.alpha).toBeCloseTo(0.625);
    expect(slot.scale.x).toBeCloseTo(2.5);
    expect(slot.scale.y).toBeCloseTo(0.5);
    expect(slot.angle).toBeCloseTo(95);
    expect(completed).not.toHaveBeenCalled();

    runtime.update(0.5);
    await animation;
    expect(runtime.resolveLayoutAnchor(object.getAnchor())).toEqual({
      x: 500,
      y: initialOrigin.y,
    });
    expect(slot.alpha).toBe(0.25);
    expect(slot.scale.x).toBe(3);
    expect(slot.scale.y).toBe(-1);
    expect(slot.angle).toBeCloseTo(180);
    expect(runtime.resolveLayoutAnchor(object.motion.getHomeAnchor())).toEqual(
      homeOrigin,
    );

    object.motion.reset();
    expect(runtime.resolveLayoutAnchor(object.getAnchor())).toEqual(
      initialOrigin,
    );
    expect(slot.alpha).toBe(1);
    expect(slot.scale.x).toBe(2);
    expect(slot.scale.y).toBe(2);
    expect(slot.angle).toBeCloseTo(10);
    runtime.destroy();
  });

  it("rejects and resets authored property motion on geometry replacement", async () => {
    const manifest = structuredClone(game002LayoutFixture);
    manifest.nodes[0]!.placements.default = { x: 100, y: 200, scale: 1 };
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
    const object = runtime.getRenderObject("bg");
    if (!object) throw new Error("expected authored image object");
    const moving = object.motion.animate({
      opacity: 0,
      scale: { x: 2, y: 2 },
      rotationDegrees: 90,
      durationSeconds: 1,
    });
    runtime.update(0.25);
    const replacement = structuredClone(manifest);
    replacement.nodes[0]!.placements.default = {
      x: 150,
      y: 200,
      scale: 1,
    };
    (
      replacement.nodes[0]!.placements
        .default as (typeof replacement.nodes)[0]["placements"]["default"] & {
        rotation: number;
      }
    ).rotation = 20;
    runtime.applyGeometryManifest(replacement);

    await expect(moving).rejects.toThrow(/geometry was replaced/);
    const slot = runtime.getNode("bg").parent!;
    expect(runtime.resolveLayoutAnchor(object.motion.getHomeAnchor())).toEqual({
      x: 150.5,
      y: 200.5,
    });
    expect(slot.alpha).toBe(1);
    expect(slot.scale.x).toBe(1);
    expect(slot.scale.y).toBe(1);
    expect(slot.angle).toBeCloseTo(20);
    runtime.destroy();
  });

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
