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
  it("resolves an authored radio through its UI-control owner address", () => {
    const control = {
      kind: "radio" as const,
      getState: () => "off" as const,
      setState() {},
    };
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest: {
          nodes: [
            {
              id: "splash-flag",
              order: 1,
              uiControl: {
                kind: "radio",
                off: {
                  kind: "image",
                  path: "flag-off.png",
                  size: { width: 145, height: 50 },
                },
                on: {
                  kind: "image",
                  path: "flag-on.png",
                  size: { width: 145, height: 50 },
                },
              },
              placements: {},
            },
          ],
          reels: {},
          gameModes: { modes: [], transitions: [] },
        },
        popupPackages: {},
      } as any,
      {
        assertReady() {},
        getUiControl: () => control,
      } as any,
    );
    const address = formatGameLayoutRuntimeAddress("ui-control", "splash-flag");
    expect(controller.addresses.describe(address)).toMatchObject({
      kind: "ui-control",
      capability: "borrowed",
      detail: { controlKind: "radio" },
    });
    const endpoint = controller.addresses.resolve(address, "ui-control");
    expect(endpoint.kind).toBe("ui-control");
    if (endpoint.kind !== "ui-control") throw new Error("wrong endpoint kind");
    expect(endpoint.get()).toBe(control);
    expect(() =>
      controller.addresses.resolve(address, "render-object"),
    ).toThrow(/kind mismatch/);
    controller.destroy();
  });

  it("resolves an authored step-slider through the same owner endpoint", () => {
    const control = {
      kind: "step-slider" as const,
      steps: 3,
      getState: () => 0,
      setState: async () => {},
    };
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest: {
          nodes: [
            {
              id: "fast-play",
              order: 1,
              uiControl: {
                kind: "step-slider",
                track: {
                  kind: "image",
                  path: "fastplay-bar.png",
                  size: { width: 336, height: 50 },
                },
                thumb: {
                  kind: "image",
                  path: "fastplay-tag.png",
                  size: { width: 46, height: 46 },
                },
                steps: 3,
                snapDurationSeconds: 0.12,
              },
              placements: {},
            },
          ],
          reels: {},
          gameModes: { modes: [], transitions: [] },
        },
        popupPackages: {},
      } as any,
      {
        assertReady() {},
        getUiControl: () => control,
      } as any,
    );
    const address = formatGameLayoutRuntimeAddress("ui-control", "fast-play");
    expect(controller.addresses.describe(address)).toMatchObject({
      kind: "ui-control",
      capability: "borrowed",
      detail: { controlKind: "step-slider" },
    });
    const endpoint = controller.addresses.resolve(address, "ui-control");
    if (endpoint.kind !== "ui-control") throw new Error("wrong endpoint kind");
    expect(endpoint.get()).toBe(control);
    controller.destroy();
  });

  it("does not publish JSON program data as a render factory address", () => {
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest: {
          nodes: [],
          reels: {},
          runtimeResources: {
            "spin-config": { kind: "json", path: "spin-config.json" },
          },
          gameModes: { modes: [], transitions: [] },
        },
        popupPackages: {},
      } as any,
      {} as any,
    );
    expect(controller.addresses.list({ kind: "resource-factory" })).toEqual([]);
    expect(() =>
      controller.addresses.describe(
        formatGameLayoutRuntimeAddress("resource", "json", "spin-config"),
      ),
    ).toThrow(/Unknown Game Layout runtime address/);
    controller.destroy();
  });

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
          main: { columns: 3, rows: 2 },
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

  it("publishes spin lifecycle catalogs by render mode without duplicates", () => {
    const createSource = (
      symbolPackages: Record<
        string,
        { reel: "main"; reelSet: string; renderMode: "standard" | "grid-cell" }
      >,
    ) =>
      ({
        manifest: {
          nodes: [],
          main: { columns: 2, rows: 2 },
          symbolPackages,
          popups: {},
          gameModes: { modes: [], transitions: [] },
          runtimeResources: {},
        },
        symbolPackages: Object.fromEntries(
          Object.keys(symbolPackages).map((id) => [
            id,
            { symbols: ["WL"], states: ["normal"] },
          ]),
        ),
        popupManifests: {},
      }) as any;

    const standard = compileGameLayoutRuntimeEventCatalog(
      createSource({
        base: { reel: "main", reelSet: "base", renderMode: "standard" },
        free: { reel: "main", reelSet: "free", renderMode: "standard" },
      }),
    );
    const standardSpinAddresses = standard.entries
      .filter(({ family }) => family === "spin-lifecycle")
      .map(({ descriptor }) => descriptor.address);
    expect(standardSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/reel-spin/x/*/lifecycle/started",
    );
    expect(standardSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/reel-spin/lifecycle/started",
    );
    expect(standardSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/reel-spin/lifecycle/ended",
    );
    expect(standardSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/reel-spin/lifecycle/all-stopped",
    );
    expect(standardSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/cell-spin/x/*/y/*/lifecycle/stopped",
    );
    expect(
      standardSpinAddresses.some((address) =>
        address.includes("/spin/grid-cell/"),
      ),
    ).toBe(false);
    expect(new Set(standardSpinAddresses).size).toBe(
      standardSpinAddresses.length,
    );

    const gridCell = compileGameLayoutRuntimeEventCatalog(
      createSource({
        base: { reel: "main", reelSet: "base", renderMode: "grid-cell" },
      }),
    );
    const gridSpinAddresses = gridCell.entries
      .filter(({ family }) => family === "spin-lifecycle")
      .map(({ descriptor }) => descriptor.address);
    expect(gridSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/grid-cell/x/1/y/*/lifecycle/started",
    );
    expect(gridSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/grid-cell/x/*/y/1/lifecycle/stopped",
    );
    expect(gridSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/grid-cell/lifecycle/started",
    );
    expect(gridSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/grid-cell/lifecycle/ended",
    );
    expect(gridSpinAddresses).toContain(
      "gamelayout:/reel/main/spin/grid-cell/lifecycle/all-stopped",
    );
    expect(
      gridSpinAddresses.some((address) => address.includes("/spin/reel-spin/")),
    ).toBe(false);
  });

  it("dispatches exact spin occurrences to coordinate wildcards", () => {
    const controller = createGameLayoutRuntimeAddresses(
      {
        manifest: {
          nodes: [],
          main: { columns: 2, rows: 2 },
          symbolPackages: {
            base: { reel: "main", reelSet: "base", renderMode: "grid-cell" },
          },
          gameModes: { modes: [], transitions: [] },
        },
        symbolPackages: {
          base: {
            symbolManifest: { symbols: { WL: {} } },
            statePreset: {
              defaultState: "normal",
              states: [{ id: "normal", phase: "stable", playback: "loop" }],
            },
          },
        },
        popupPackages: {},
      } as any,
      {} as any,
    );
    const address = (x: number | "*", y: number | "*") =>
      formatGameLayoutRuntimeAddress(
        "reel",
        "main",
        "spin",
        "grid-cell",
        "x",
        String(x),
        "y",
        String(y),
        "lifecycle",
        "stopped",
      );
    const exact = address(1, 0);
    const received: string[] = [];
    const disposers = [
      exact,
      address(1, "*"),
      address("*", 0),
      address("*", "*"),
    ].map((candidate) =>
      controller.addresses.bind(candidate, (event) =>
        received.push(event.address),
      ),
    );
    controller.emit(exact, { x: 1, y: 0 });
    expect(received).toEqual([exact, exact, exact, exact]);
    for (const dispose of disposers) dispose();
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
      main: { columns: 2, rows: 1 },
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
      compiled.entries.find(
        ({ descriptor }) =>
          descriptor.address ===
          "gamelayout:/symbol-package/base/symbolsstatebatch/WL/win",
      ),
    ).toMatchObject({
      family: "symbols-state-batch",
      facets: [
        { key: "symbol-package", value: "base" },
        { key: "symbol", value: "WL" },
        { key: "state", value: "win" },
      ],
      descriptor: {
        detail: {
          eventFamily: "symbols-state-batch",
          symbolPackageId: "base",
          symbol: "WL",
          state: "win",
        },
      },
    });
    expect(
      compiled.entries.some(
        ({ descriptor, family }) =>
          family === "symbol-state" &&
          descriptor.address ===
            "gamelayout:/symbol-package/base/symbol/WL/instance/reel/main/x/0/y/0/state/win/entered",
      ),
    ).toBe(true);
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
