import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import { createRenderObject } from "../../src/presentation/render-object.js";
import { createRenderObjectLayer } from "../../src/presentation/render-object-layer.js";
import { createRenderObjectMotionRuntime } from "../../src/presentation/render-object-motion.js";
import {
  createGameLayoutRuntimeAddresses,
  type GameLayoutRuntimeResourceEndpoint,
} from "../../src/scene-layout/core/runtime-address.js";
import type { SceneLayoutPackageResource } from "../../src/scene-layout/types.js";

describe("Game Layout addressed RenderObject mounting", () => {
  it("registers explicit instances, accepts gamelayout as an id, mounts, and unregisters on destroy", async () => {
    const motion = createRenderObjectMotionRuntime();
    const layerView = new Container();
    const layer = createRenderObjectLayer({
      view: layerView,
      label: "layout",
      motionRuntime: motion,
    }).layer;
    const loadedImage = {
      kind: "image" as const,
      url: "blob:badge",
      size: { width: 1, height: 1 },
    };
    const manifest = {
      id: "address-mount",
      nodes: [],
      reels: {},
      popupPackages: {},
      gameModes: { modes: [], transitions: [] },
      runtimeResources: {
        badge: {
          kind: "image",
          path: "badge.png",
          size: { width: 1, height: 1 },
        },
      },
    } as unknown as SceneLayoutPackageResource["runtimeManifest"];
    const resource = {
      manifest,
      runtimeManifest: manifest,
      layout: { spineResources: {}, vniResources: {} },
      popupPackages: {},
      symbolPackages: {},
      getLoadedRuntimeResource: (name: string, kind: string) =>
        name === "badge" && kind === "image" ? loadedImage : null,
    } as unknown as SceneLayoutPackageResource;
    const created: ReturnType<typeof createRenderObject>[] = [];
    const controller = createGameLayoutRuntimeAddresses(resource, {
      getRenderObject: () => null,
      getRenderLayer: () => layer,
      getArea: () => ({}) as never,
      getGameModeSnapshot: () => ({}) as never,
      playEffect: () => ({}) as never,
      stopEffect() {},
      getAudioSnapshot: () => ({}) as never,
      getPopupLayer: () => ({}) as never,
      getPopupString: () => ({}) as never,
      createRenderObject: async () => {
        const view = new Container();
        let object!: ReturnType<typeof createRenderObject>;
        object = createRenderObject({
          view,
          destroy: () => view.destroy(),
        });
        created.push(object);
        return object;
      },
      createImgNumberRenderObject: async () => ({}) as never,
      assertReady() {},
    });
    const factory = controller.addresses.resolve(
      "gamelayout:/resource/image/badge",
      "resource-factory",
    ) as GameLayoutRuntimeResourceEndpoint;

    const object = await factory.create({ instanceId: "gamelayout" });
    const instanceAddress =
      "gamelayout:/resource/image/badge/instance/gamelayout";
    expect(controller.addresses.addressOf(object)).toBe(instanceAddress);
    expect(controller.addresses.describe(instanceAddress)).toMatchObject({
      kind: "render-object-instance",
      authored: false,
      detail: { instanceId: "gamelayout" },
    });
    expect(
      controller.addresses
        .list()
        .some(({ address }) => address === instanceAddress),
    ).toBe(true);
    expect(() => factory.create({ instanceId: "gamelayout" })).toThrow(
      /Duplicate live/,
    );
    expect(created).toHaveLength(1);

    const mount = controller.addresses.mount(
      "gamelayout:/layer/layout",
      object,
      { order: 7 },
    );
    expect(layerView.children).toHaveLength(1);
    expect(layerView.children[0]!.zIndex).toBe(7);
    mount.detach();
    mount.detach();
    expect(layerView.children).toHaveLength(0);

    object.destroy();
    expect(() => controller.addresses.describe(instanceAddress)).toThrow(
      /Unknown/,
    );
    const anonymous = await factory.create();
    expect(() => controller.addresses.addressOf(anonymous)).toThrow(/no live/);
    anonymous.destroy();
    controller.destroy();
    motion.destroy();
    layerView.destroy({ children: false });
  });
});
