import { describe, expect, it } from "vitest";
import {
  formatGameLayoutRuntimeAddress,
  parseGameLayoutRuntimeAddress,
  splitGameLayoutRuntimeAddress,
} from "../../src/scene-layout/data/runtime-address.js";
import { createGameLayoutRuntimeAddresses } from "../../src/scene-layout/core/runtime-address.js";
import { singleStatePopupFixture } from "../popup/fixtures.js";

describe("Game Layout runtime address", () => {
  it("exposes typed get endpoints for single-state popup layers and strings", () => {
    const layer = {} as any;
    const string = {
      kind: "text" as const,
      name: "heading",
      index: 0,
      text: "READY",
      overridden: false,
      setText() {},
      resetText() {},
    };
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest: {
          nodes: [],
          reels: {},
          gameModes: { modes: [], transitions: [] },
        },
        popupPackages: {
          freeform: {
            manifest: singleStatePopupFixture(),
            resources: {},
            destroy() {},
          },
        },
      } as any,
      {
        getPopupLayer: () => layer,
        getPopupString: () => string,
        getRenderObject: () => null,
        getRenderLayer: () => ({}) as any,
        getArea: () => ({}) as any,
        getGameModeSnapshot: () => ({}) as any,
        playEffect: () => ({}) as any,
        stopEffect() {},
        getAudioSnapshot: () => ({}) as any,
        createRenderObject: async () => ({}) as any,
        createImgNumberRenderObject: async () => ({}) as any,
        assertReady() {},
      },
    );
    const layerEndpoint = controller.addresses.resolve(
      "gamelayout:/popup/freeform/layer/heading",
      "popup-layer",
    );
    expect(layerEndpoint.kind).toBe("popup-layer");
    if (layerEndpoint.kind !== "popup-layer") throw new Error("wrong kind");
    expect(layerEndpoint.get()).toBe(layer);
    const stringEndpoint = controller.addresses.resolve(
      "gamelayout:/popup/freeform/string/text/heading",
      "popup-string",
    );
    expect(stringEndpoint.kind).toBe("popup-string");
    if (stringEndpoint.kind !== "popup-string") throw new Error("wrong kind");
    expect(stringEndpoint.get()).toBe(string);
    expect(stringEndpoint.input("GO")).toEqual({
      kind: "text",
      name: "heading",
      text: "GO",
    });
    controller.destroy();
  });
  it("round-trips exact owner identities with canonical segment encoding", () => {
    const address = formatGameLayoutRuntimeAddress(
      "transition",
      "Base Game",
      "Free/Game",
      "effect",
      "spine",
      "event",
      "Start+1",
    );
    expect(address).toBe(
      "gamelayout:/transition/Base%20Game/Free%2FGame/effect/spine/event/Start%2B1",
    );
    expect(splitGameLayoutRuntimeAddress(address)).toEqual([
      "transition",
      "Base Game",
      "Free/Game",
      "effect",
      "spine",
      "event",
      "Start+1",
    ]);
  });

  it.each([
    "transition/BaseGame/FreeGame",
    "gamelayout:/transition/BaseGame/FreeGame/",
    "gamelayout:/transition//FreeGame",
    "gamelayout:/transition/../FreeGame",
    "gamelayout:/transition/%42aseGame/FreeGame",
    "gamelayout:/transition/BaseGame/FreeGame?event=Start",
  ])("rejects non-canonical address %s", (address) => {
    expect(() => parseGameLayoutRuntimeAddress(address)).toThrow();
  });
});
