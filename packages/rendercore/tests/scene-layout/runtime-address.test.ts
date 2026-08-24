import { describe, expect, it } from "vitest";
import {
  formatGameLayoutRuntimeAddress,
  parseGameLayoutRuntimeAddress,
  splitGameLayoutRuntimeAddress,
} from "../../src/scene-layout/data/runtime-address.js";
import { createGameLayoutRuntimeAddresses } from "../../src/scene-layout/core/runtime-address.js";
import { compileGameLayoutRuntimeEventCatalog } from "../../src/scene-layout/core/runtime-address-catalog.js";
import { singleStatePopupFixture } from "../popup/fixtures.js";

describe("Game Layout runtime address", () => {
  it("publishes the global orientation variant event through bind and wait", async () => {
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest: {
          adaptation: { mode: "orientation-focus" },
          nodes: [],
          reels: {},
          gameModes: { modes: [], transitions: [] },
        },
        popupPackages: {},
      } as any,
      {} as any,
    );
    const address = formatGameLayoutRuntimeAddress("event", "variant-changed");
    expect(controller.addresses.describe(address)).toMatchObject({
      kind: "event",
      ownerAddress: null,
      capability: "event",
    });
    const occurrences: unknown[] = [];
    const dispose = controller.addresses.bind(address, (event) => {
      occurrences.push(event);
    });
    const waiting = controller.addresses.wait(address);
    controller.emit(address, {
      previousVariantId: "landscape",
      variantId: "portrait",
    });
    await expect(waiting).resolves.toMatchObject({
      sequence: 1,
      detail: {
        previousVariantId: "landscape",
        variantId: "portrait",
      },
    });
    expect(occurrences).toHaveLength(1);
    dispose();
    const abortController = new AbortController();
    const aborted = controller.addresses.wait(address, {
      signal: abortController.signal,
    });
    abortController.abort();
    await expect(aborted).rejects.toMatchObject({ name: "AbortError" });
    controller.destroy();
  });

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

  it("matches symbol instance wildcards encoded directly in addresses", () => {
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest: {
          nodes: [],
          reels: { main: { columns: 3, rows: 2 } },
          symbolPackages: {
            base: { reel: "main", reelSet: "base", renderMode: "standard" },
          },
          gameModes: { modes: [], transitions: [] },
        },
        symbolPackages: {
          base: {
            symbolManifest: { symbols: { WL: {} } },
            statePreset: {
              defaultState: "normal",
              states: [{ id: "win", phase: "stable", playback: "loop" }],
            },
          },
        },
        popupPackages: {},
      } as any,
      {} as any,
    );
    const address = (x: number | "*", y: number | "*") =>
      formatGameLayoutRuntimeAddress(
        "symbol-package",
        "base",
        "symbol",
        "WL",
        "instance",
        "reel",
        "main",
        "x",
        String(x),
        "y",
        String(y),
        "state",
        "win",
        "entered",
      );
    const exact = address(2, 1);
    const received: string[] = [];
    const disposers = [
      controller.addresses.bind(exact, (event) => received.push(event.address)),
      controller.addresses.bind(address(2, "*"), (event) =>
        received.push(event.address),
      ),
      controller.addresses.bind(address("*", 1), (event) =>
        received.push(event.address),
      ),
      controller.addresses.bind(address("*", "*"), (event) =>
        received.push(event.address),
      ),
    ];
    controller.emit(exact, { x: 2, y: 1 });
    expect(received).toEqual([exact, exact, exact, exact]);
    expect(controller.addresses.describe(address(2, "*")).kind).toBe("event");
    expect(() => controller.addresses.bind(address(3, "*"), () => {})).toThrow(
      "Unknown Game Layout runtime address",
    );
    for (const dispose of disposers) dispose();
    let factoryCalls = 0;
    controller.emit(exact, () => {
      factoryCalls += 1;
      return { x: 2, y: 1 };
    });
    expect(factoryCalls).toBe(0);
    controller.destroy();
  });

  it("uses the same pure event catalog as the runtime resolver", () => {
    const manifest = {
      nodes: [
        {
          id: "nearwin1",
          resource: {
            kind: "spine",
            skeleton: "nearwin.json",
            atlas: "nearwin.atlas",
            textures: { "nearwin.png": "nearwin.png" },
            defaultAnimation: "NearWin",
            loop: false,
          },
        },
      ],
      reels: { main: { columns: 2, rows: 1 } },
      symbolPackages: {
        base: { reel: "main", reelSet: "main", renderMode: "standard" },
      },
      popups: {},
      gameModes: {
        modes: [{ id: "BaseGame", bgm: "base" }],
        transitions: [],
      },
      runtimeResources: {},
    } as any;
    const source = {
      manifest,
      symbolPackages: { base: { symbols: ["WL"], states: ["win"] } },
      popupManifests: {},
    } as const;
    const compiled = compileGameLayoutRuntimeEventCatalog(source);
    expect(
      compiled.entries.some(({ descriptor }) =>
        descriptor.address.includes("/bgm/lifecycle/"),
      ),
    ).toBe(false);
    expect(
      compiled.entries.some(({ descriptor }) =>
        descriptor.address.includes("/audio/music/"),
      ),
    ).toBe(false);
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest,
        runtimeManifest: manifest,
        symbolPackages: {
          base: {
            symbolManifest: { symbols: { WL: {} } },
            statePreset: {
              defaultState: "win",
              states: [{ id: "win", phase: "stable", playback: "loop" }],
            },
          },
        },
        popupPackages: {},
        audioMusic: { base: {} },
      } as any,
      {} as any,
    );
    expect(
      controller.addresses
        .list({ kind: "event" })
        .map(({ address }) => address),
    ).toEqual(compiled.entries.map(({ descriptor }) => descriptor.address));
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
