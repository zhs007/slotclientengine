import { Container, Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import type { ImageStringResource } from "../../src/image-string/core/index.js";
import { createImgNumberRenderObject } from "../../src/presentation/imgnumber-render-object.js";
import type { ImgNumberRenderObject } from "../../src/presentation/index.js";
import {
  createRenderObject,
  getRenderObjectAdapter,
} from "../../src/presentation/render-object.js";
import { createRenderObjectLayer } from "../../src/presentation/render-object-layer.js";
import { createRenderObjectMotionRuntime } from "../../src/presentation/render-object-motion.js";
import {
  createGameLayoutRuntimeAddresses,
  type GameLayoutRuntimeResourceEndpoint,
} from "../../src/scene-layout/core/runtime-address.js";

describe("Game Layout runtime address pools", () => {
  it("isolates canonical factory pools, reuses destroyed handles, and destroys instances", async () => {
    const motion = createRenderObjectMotionRuntime();
    const layerView = new Container();
    const layer = createRenderObjectLayer({
      view: layerView,
      label: "top",
      motionRuntime: motion,
    }).layer;
    const created = new Map<string, Container[]>();
    const digitsResource: ImageStringResource = {
      manifest: {
        version: 1,
        kind: "image-string",
        id: "digits",
        metrics: { lineHeight: 1, letterSpacing: 0 },
        glyphs: Object.fromEntries(
          ["0", "1", "5"].map((glyph) => [
            glyph,
            {
              path: `${glyph}.png`,
              size: { width: 1, height: 1 },
              offset: { x: 0, y: 0 },
            },
          ]),
        ),
        fixedAdvanceGroups: [],
      },
      textures: {
        "0.png": Texture.WHITE,
        "1.png": Texture.WHITE,
        "5.png": Texture.WHITE,
      },
      destroyed: false,
      assertUsable() {},
      async destroy() {},
    };
    const create = (key: string) => {
      const view = new Container();
      const values = created.get(key) ?? [];
      values.push(view);
      created.set(key, values);
      return createRenderObject({ view, destroy: () => view.destroy() });
    };
    const manifest = {
      nodes: [],
      reels: { main: { columns: 1, rows: 1 } },
      symbolPackages: {
        base: { reel: "main", reelSet: "base", renderMode: "standard" },
      },
      gameModes: { modes: [], transitions: [] },
      runtimeResources: {
        topick: {
          kind: "spine",
          skeleton: "topick.json",
          atlas: "topick.atlas",
          textures: { "topick.png": "topick.png" },
        },
        flash: {
          kind: "image",
          path: "flash.png",
          size: { width: 1, height: 1 },
        },
        digits: { kind: "image-string", manifest: "digits.json" },
      },
    } as any;
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest,
        runtimeManifest: manifest,
        popupPackages: {},
        symbolPackages: {
          base: {
            symbolManifest: { symbols: { WL: {} } },
            statePreset: {
              defaultState: "normal",
              states: [{ id: "normal", phase: "stable", playback: "loop" }],
            },
          },
        },
      } as any,
      {
        getRenderObject: () => null,
        getRenderLayer: () => layer,
        getArea: () => ({}) as never,
        getGameModeSnapshot: () => ({}) as never,
        playEffect: () => ({}) as never,
        stopEffect() {},
        getAudioSnapshot: () => ({}) as never,
        getPopupLayer: () => ({}) as never,
        getPopupString: () => ({}) as never,
        createRenderObject: async (name) => create(`resource:${name}`),
        createImgNumberRenderObject: async (_name, options) => {
          const object = createImgNumberRenderObject({
            resource: digitsResource,
            ...options,
          });
          const values = created.get("resource:digits") ?? [];
          values.push(getRenderObjectAdapter(object).view);
          created.set("resource:digits", values);
          return object;
        },
        createSymbolRenderObject: async (binding, symbol) =>
          create(`symbol:${binding}:${symbol}`),
        assertReady() {},
      },
    );

    const topick = controller.addresses.resolve(
      "gamelayout:/resource/spine/topick",
      "resource-factory",
    ) as GameLayoutRuntimeResourceEndpoint;
    const symbol = controller.addresses.resolve(
      "gamelayout:/symbol-package/base/symbol/WL",
      "resource-factory",
    ) as GameLayoutRuntimeResourceEndpoint;
    const digits = controller.addresses.resolve(
      "gamelayout:/resource/image-string/digits",
      "resource-factory",
    ) as GameLayoutRuntimeResourceEndpoint;
    expect(symbol.descriptor).toMatchObject({
      ownerAddress: "gamelayout:/symbol-package/base",
      detail: { resourceKind: "symbol", symbol: "WL" },
    });

    const first = await topick.create({ pooled: true });
    const firstView = getRenderObjectAdapter(first).view;
    controller.addresses.mount("gamelayout:/reel/main/layer/top", first);
    expect(layerView.children).toEqual([firstView]);
    first.destroy();
    expect(layerView.children).toEqual([]);
    const reused = await topick.create({ pooled: true });
    expect(getRenderObjectAdapter(reused).view).toBe(firstView);
    expect(created.get("resource:topick")).toHaveLength(1);

    const wild = await symbol.create({ pooled: true });
    expect(getRenderObjectAdapter(wild).view).not.toBe(firstView);
    expect(created.get("symbol:base:WL")).toHaveLength(1);
    expect(() =>
      symbol.create({ pooled: true, instanceId: "not-allowed" }),
    ).toThrow(/only accepts the pooled option/);

    const oneHundred = (await digits.create({
      pooled: true,
      text: "100",
      anchor: { x: 0, y: 0 },
    })) as ImgNumberRenderObject;
    const digitsView = getRenderObjectAdapter(oneHundred).view;
    expect(oneHundred.getText()).toBe("100");
    oneHundred.destroy();
    const fifty = (await digits.create({
      pooled: true,
      text: "50",
      anchor: { x: 1, y: 1 },
    })) as ImgNumberRenderObject;
    expect(getRenderObjectAdapter(fifty).view).toBe(digitsView);
    expect(fifty.getText()).toBe("50");
    expect(created.get("resource:digits")).toHaveLength(1);
    fifty.destroy();

    reused.destroy();
    controller.destroy();
    expect(() => wild.setVisible(true)).toThrow(/destroyed/);
    expect(firstView.destroyed).toBe(true);
    expect(created.get("symbol:base:WL")![0]!.destroyed).toBe(true);
    motion.destroy();
    layerView.destroy({ children: false });
  });
});
