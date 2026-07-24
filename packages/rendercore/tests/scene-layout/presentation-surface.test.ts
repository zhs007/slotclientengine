import { Assets, Texture } from "pixi.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createSceneLayoutPackageResource,
  createSceneLayoutPresentationSurface,
} from "../../src/scene-layout/index.js";
import { game002LayoutFixture } from "./fixtures.js";

describe("scene layout presentation surface", () => {
  afterEach(() => vi.restoreAllMocks());

  it("enforces initialization and mode contracts", async () => {
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const resource = await createSceneLayoutPackageResource({
      manifest: game002LayoutFixture,
      files: new Map([["assets/bg.png", new Uint8Array([1])]]),
    });
    expect(() =>
      createSceneLayoutPresentationSurface({
        resource,
        initialMode: "BaseGame",
      }),
    ).toThrow(/manifest has no gameModes/);

    const surface = createSceneLayoutPresentationSurface({ resource });
    expect(() => surface.applyViewport({ width: 1125, height: 2000 })).toThrow(
      /has not initialized/,
    );
    await surface.init();
    await expect(surface.init()).rejects.toThrow(/only initialize once/);
    surface.applyArtSpace();
    expect(surface.backgroundContainer.position).toMatchObject({ x: 0, y: 0 });
    surface.destroy();
  });

  it("rejects an unavailable initial mode", async () => {
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const resource = await createSceneLayoutPackageResource({
      manifest: {
        ...game002LayoutFixture,
        gameModes: {
          initialMode: "BaseGame",
          modes: [
            {
              id: "BaseGame",
              backgroundNodes: { default: "bg" },
              nodeStates: {},
            },
          ],
          transitions: [],
        },
      },
      files: new Map([["assets/bg.png", new Uint8Array([1])]]),
    });
    expect(() =>
      createSceneLayoutPresentationSurface({
        resource,
        initialMode: "FreeGame",
      }),
    ).toThrow(/unavailable/);
    await resource.destroy();
  });

  it("applies initial-mode background visibility without creating a reel", async () => {
    vi.spyOn(Assets, "load").mockResolvedValue(Texture.EMPTY as never);
    vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const manifest = {
      ...game002LayoutFixture,
      adaptation: {
        ...game002LayoutFixture.adaptation,
        backgroundNode: "base",
      },
      nodes: [
        {
          ...game002LayoutFixture.nodes[0],
          id: "base",
          resource: {
            ...game002LayoutFixture.nodes[0].resource,
            path: "assets/base.png",
          },
        },
        {
          ...game002LayoutFixture.nodes[0],
          id: "free",
          order: 1,
          resource: {
            ...game002LayoutFixture.nodes[0].resource,
            path: "assets/free.png",
          },
        },
      ],
      gameModes: {
        initialMode: "BaseGame",
        modes: [
          {
            id: "BaseGame",
            backgroundNodes: { default: "base" },
            nodeStates: {},
          },
          {
            id: "FreeGame",
            backgroundNodes: { default: "free" },
            nodeStates: {},
          },
        ],
        transitions: [],
      },
    };
    const resource = await createSceneLayoutPackageResource({
      manifest,
      files: new Map([
        ["assets/base.png", new Uint8Array([1])],
        ["assets/free.png", new Uint8Array([2])],
      ]),
    });
    const surface = createSceneLayoutPresentationSurface({ resource });
    await surface.init();
    const snapshot = surface.applyViewport({ width: 1125, height: 2000 });
    expect(snapshot.variantId).toBe("default");
    expect(
      surface.backgroundContainer.getChildByLabel(
        "scene-layout-slot:base",
        true,
      )?.visible,
    ).toBe(true);
    expect(
      surface.backgroundContainer.getChildByLabel(
        "scene-layout-slot:free",
        true,
      )?.visible,
    ).toBe(false);
    expect(() => surface.getAwardCelebrationPlayer("missing")).toThrow(
      /unavailable/,
    );
    surface.applyArtSpace();
    expect(surface.backgroundContainer.position).toMatchObject({ x: 0, y: 0 });
    surface.update(1 / 60);
    surface.destroy();
    surface.destroy();
    expect(() => surface.update(1 / 60)).toThrow(/destroyed/);
  });
});
