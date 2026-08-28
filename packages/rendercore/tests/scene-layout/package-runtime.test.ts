import { Assets, Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type {
  AudioBackend,
  AudioBackendInstance,
  AudioBackendSound,
} from "@slotclientengine/audiocore/core";
import {
  RenderGridCellReelSet,
  RenderReel,
  RenderReelSet,
} from "../../src/reel/index.js";
import { createRenderObject } from "../../src/presentation/index.js";
import { getRenderObjectAdapter } from "../../src/presentation/render-object.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import {
  createSceneLayoutPackageResource,
  createSceneLayoutPackageRuntime,
  upgradeSceneLayoutManifestToLatest,
  type SceneLayoutManifestV1,
} from "../../src/scene-layout/index.js";
import { formatGameLayoutRuntimeAddress } from "../../src/scene-layout/data/runtime-address.js";
import { createSceneLayoutPackageRuntimeInspector } from "../../src/scene-layout/editor.js";
import { transitionResourceKey } from "../../src/scene-layout/resource.js";
import { game002LayoutFixture, game003LayoutFixture } from "./fixtures.js";
import * as sceneLayoutCoreApi from "../../src/scene-layout/index.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

class EventAudioInstance implements AudioBackendInstance {
  volume = 1;
  paused = false;
  stopped = false;
  stop() {
    this.stopped = true;
  }
  onEnded() {
    return () => {};
  }
}

class EventAudioSound implements AudioBackendSound {
  readonly instances: EventAudioInstance[] = [];
  play() {
    const instance = new EventAudioInstance();
    this.instances.push(instance);
    return instance;
  }
  destroy() {}
}

class EventAudioBackend implements AudioBackend {
  readonly sounds: EventAudioSound[] = [];
  unlockCount = 0;
  async prepare() {
    const sound = new EventAudioSound();
    this.sounds.push(sound);
    return sound;
  }
  async unlock() {
    this.unlockCount += 1;
  }
}

class CompletingTransitionPlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  #switchEvent = "SwitchScene";
  #playing = false;

  init() {}
  play() {
    this.#playing = true;
  }
  update() {
    if (!this.#playing) return { completed: false, events: [] };
    this.#playing = false;
    return {
      completed: true,
      events: [{ name: this.#switchEvent }],
    };
  }
  reset() {
    this.#playing = false;
  }
  destroy() {
    this.#playing = false;
    this.view.parent?.removeChild(this.view);
  }
}

class ManualTransitionPlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  readonly plays: Array<{ animationName: string; loop: boolean }> = [];
  readonly results: Array<{
    completed: boolean;
    events: readonly { name: string }[];
  }> = [];

  init() {}
  play(options: { animationName: string; loop: boolean }) {
    this.plays.push(options);
  }
  update() {
    return this.results.shift() ?? { completed: false, events: [] };
  }
  reset() {
    this.results.length = 0;
  }
  destroy() {
    this.view.parent?.removeChild(this.view);
  }
}

function transitionSpec(from: string, to: string) {
  return {
    from,
    to,
    overlay: {
      resource: {
        kind: "spine" as const,
        skeleton: `assets/transitions/${from}-${to}.json`,
        atlas: `assets/transitions/${from}-${to}.atlas`,
        textures: {
          "transition.png": `assets/transitions/${from}-${to}.png`,
        },
      },
      animation: `${from}_${to}`,
      switchEvent: "SwitchScene",
      placements: { default: { x: 0, y: 0, scale: 1 } },
    },
  };
}

function createRuntimeWithTransitions(
  resource: Awaited<ReturnType<typeof createSceneLayoutPackageResource>>,
  pairs: readonly (readonly [string, string])[],
  createTransitionPlayer: () => RendercoreSpinePlayer = () =>
    new CompletingTransitionPlayer(),
) {
  const transitions = pairs.map(([from, to]) => transitionSpec(from, to));
  const layoutManifest: SceneLayoutManifestV1 = {
    ...resource.layout.manifest,
    gameModes: {
      ...resource.layout.manifest.gameModes!,
      transitions,
    },
  };
  const manifest = upgradeSceneLayoutManifestToLatest(layoutManifest);
  const spineResources = { ...resource.layout.spineResources };
  for (const [from, to] of pairs) {
    spineResources[transitionResourceKey(from, to)] = {
      skeleton: {},
      atlasText: "transition.png",
      textureUrls: { "transition.png": "blob:transition" },
    };
  }
  return createSceneLayoutPackageRuntime({
    resource: {
      ...resource,
      manifest: layoutManifest,
      runtimeManifest: manifest,
      layout: { ...resource.layout, manifest: layoutManifest, spineResources },
    },
    createTransitionPlayer,
  });
}

async function waitForModeTarget(
  runtime: ReturnType<typeof createRuntimeWithTransitions>,
  modeId: string,
) {
  for (let index = 0; index < 20; index += 1) {
    if (runtime.getGameModeSnapshot().targetMode === modeId) return;
    await Promise.resolve();
  }
  throw new Error(`Mode target ${modeId} did not become ready.`);
}

async function completeModeRequest(
  runtime: ReturnType<typeof createRuntimeWithTransitions>,
  modeId: string,
  options?: Parameters<typeof runtime.requestGameMode>[1],
) {
  const pending = runtime.requestGameMode(modeId, options);
  await waitForModeTarget(runtime, modeId);
  runtime.update(1 / 60);
  await pending;
}

const symbolsPackage = {
  version: 1,
  kind: "symbol-package",
  id: "demo-symbols",
  cellSize: { width: 1, height: 1 },
  entrypoints: {
    gameConfig: "gameconfig.json",
    symbolManifest: "symbol-state-textures.manifest.json",
  },
  resources: ["a.png", "b.png"],
};

const gameConfig = {
  paytable: {
    "0": { code: 0, symbol: "A", pays: [1] },
    "1": { code: 1, symbol: "B", pays: [1] },
  },
  symbolCodes: { A: 0, B: 1 },
  reels: {
    main: [
      [0, 1],
      [1, 0],
    ],
  },
};

const symbolManifest = {
  version: 1,
  states: ["win"],
  symbols: {
    A: {
      normal: "./a.png",
      win: "./a.png",
      scale: 1,
      renderPriority: 1,
      animations: { win: { kind: "builtin", durationSeconds: 0.58 } },
    },
    B: {
      normal: "./b.png",
      win: "./b.png",
      scale: 1,
      animations: { win: { kind: "builtin", durationSeconds: 0.58 } },
    },
  },
};

function layoutManifest(renderMode: "standard" | "grid-cell") {
  return {
    ...game002LayoutFixture,
    reels: {
      main: {
        order: 1,
        columns: 2,
        rows: 2,
        cellSize: { width: 1, height: 1 },
        gap: { x: 2, y: 3 },
        placements: { default: { x: 640, y: 337 } },
      },
    },
    symbolPackage: {
      manifest: "dependencies/symbols/demo-symbols/symbols.package.json",
      reel: "main" as const,
      reelSet: "main",
      renderMode,
    },
  };
}

function files(): Map<string, Uint8Array> {
  const prefix = "dependencies/symbols/demo-symbols/";
  return new Map([
    ["assets/bg.png", new Uint8Array([1])],
    [`${prefix}symbols.package.json`, encode(symbolsPackage)],
    [`${prefix}gameconfig.json`, encode(gameConfig)],
    [`${prefix}symbol-state-textures.manifest.json`, encode(symbolManifest)],
    [`${prefix}a.png`, new Uint8Array([2])],
    [`${prefix}b.png`, new Uint8Array([3])],
  ]);
}

function canonicalMultiSymbolFixture() {
  const ids = ["demo-symbols", "alt-symbols"] as const;
  const packageFiles = new Map<string, Uint8Array>([
    ["assets/bg.png", new Uint8Array([1])],
  ]);
  for (const id of ids) {
    const prefix = `dependencies/symbols/${id}/`;
    packageFiles.set(
      `${prefix}symbols.package.json`,
      encode({ ...symbolsPackage, id }),
    );
    packageFiles.set(`${prefix}gameconfig.json`, encode(gameConfig));
    packageFiles.set(
      `${prefix}symbol-state-textures.manifest.json`,
      encode(symbolManifest),
    );
    packageFiles.set(`${prefix}a.png`, new Uint8Array([2]));
    packageFiles.set(`${prefix}b.png`, new Uint8Array([3]));
  }
  const manifest = {
    ...game002LayoutFixture,
    reels: layoutManifest("standard").reels,
    symbolPackages: {
      "demo-symbols": {
        manifest: "dependencies/symbols/demo-symbols/symbols.package.json",
        reel: "main" as const,
        reelSet: "main",
        renderMode: "standard" as const,
      },
      "alt-symbols": {
        manifest: "dependencies/symbols/alt-symbols/symbols.package.json",
        reel: "main" as const,
        reelSet: "main",
        renderMode: "grid-cell" as const,
      },
    },
    gameModes: {
      initialMode: "BaseGame",
      modes: [
        {
          id: "BaseGame",
          backgroundNodes: { default: "bg" },
          nodeStates: {},
          symbolPackage: "demo-symbols",
        },
        {
          id: "FreeGame",
          backgroundNodes: { default: "bg" },
          nodeStates: {},
          symbolPackage: "alt-symbols",
        },
        {
          id: "BonusGame",
          backgroundNodes: { default: "bg" },
          nodeStates: {},
          symbolPackage: "alt-symbols",
        },
        {
          id: "EmptyGame",
          backgroundNodes: { default: "bg" },
          nodeStates: {},
        },
      ],
    },
  };
  return { manifest, files: packageFiles };
}

function popupLayoutFixture() {
  const characters = [..."$,.0123456789"];
  const glyphs = Object.fromEntries(
    characters.map((character, index) => [
      character,
      {
        path: `assets/g${index}.png`,
        size: { width: 1, height: 1 },
        offset: { x: 0, y: 0 },
      },
    ]),
  );
  const amountLayer = {
    id: "amount",
    kind: "image-string",
    order: 0,
    resource: "amount",
    binding: "win-amount",
    anchor: { x: 0.5, y: 0.5 },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const vniLayer = {
    id: "effect",
    kind: "vni",
    order: 1,
    resource: "effect",
    playback: { mode: "once" },
    transform: { x: 0, y: 0, scale: 1 },
  };
  const popup = {
    version: 1,
    kind: "popup",
    id: "celebration",
    type: "award-celebration",
    designViewport: { width: 100, height: 100 },
    amountFormat: {
      rawScale: 100,
      fractionDigits: 2,
      useGrouping: true,
      groupSeparator: ",",
      decimalSeparator: ".",
      prefix: "$",
      suffix: "",
      rounding: "floor",
    },
    resources: {
      amount: {
        kind: "image-string",
        manifest:
          "dependencies/image-strings/amount/image-string.manifest.json",
      },
      effect: {
        kind: "vni",
        project: `assets/${"9".repeat(64)}.json`,
      },
    },
    awardCelebration: {
      base: { countDurationSeconds: 1, layers: [amountLayer] },
      standard: { countDurationSeconds: 1, layers: [amountLayer] },
      celebrationTiers: [
        {
          id: "bigwin",
          thresholdMultiplier: 15,
          countDurationSeconds: 1,
          layers: [amountLayer, vniLayer],
        },
        {
          id: "superwin",
          thresholdMultiplier: 30,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
        {
          id: "megawin",
          thresholdMultiplier: 50,
          countDurationSeconds: 1,
          layers: [amountLayer],
        },
      ],
    },
  };
  const imageString = {
    version: 1,
    kind: "image-string",
    id: "amount",
    metrics: { lineHeight: 1, letterSpacing: 0 },
    glyphs,
    fixedAdvanceGroups: [],
  };
  const manifest = {
    ...game002LayoutFixture,
    popups: {
      celebration: {
        type: "award-celebration" as const,
        manifest: "dependencies/popups/celebration/popup.manifest.json",
        order: 2000,
        placements: { default: { x: 3, y: -4, scale: 0.8 } },
      },
    },
    gameModes: {
      initialMode: "BaseGame",
      modes: [
        {
          id: "BaseGame",
          nodeStates: {},
          awardCelebrationPopup: "celebration",
        },
        { id: "FreeGame", nodeStates: {} },
      ],
    },
  };
  const prefix = "dependencies/popups/celebration/";
  const dependency = `${prefix}dependencies/image-strings/amount/`;
  const packageFiles = new Map<string, Uint8Array>([
    ["assets/bg.png", new Uint8Array([1])],
    [`${prefix}popup.manifest.json`, encode(popup)],
    [`${dependency}image-string.manifest.json`, encode(imageString)],
    [
      `${prefix}assets/${"9".repeat(64)}.json`,
      encode({
        schemaVersion: "VNI_0.020",
        editor: { name: "VNI", version: "VNI_0.020" },
        engineTarget: { name: "cocos_creator", version: "3.8.6" },
        name: "popup-once",
        exportProfile: {
          id: "runtime",
          purpose: "runtime",
          assetScale: 1,
        },
        stage: {
          width: 100,
          height: 100,
          coordinate: "center",
          duration: 0.5,
          backgroundColor: "#000000",
        },
        assets: [],
        layerGroups: [],
        layers: [],
        particles: [],
      }),
    ],
  ]);
  characters.forEach((_, index) =>
    packageFiles.set(
      `${dependency}assets/g${index}.png`,
      new Uint8Array([index + 2]),
    ),
  );
  return { manifest, files: packageFiles };
}

describe("scene layout package runtime", () => {
  it("emits one committed variant event and ignores initial or same-variant resize", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const manifest = {
        ...game003LayoutFixture,
        nodes: game003LayoutFixture.nodes.slice(0, 2),
      };
      const resource = await createSceneLayoutPackageResource({
        manifest,
        files: new Map([
          ["assets/bg1.png", new Uint8Array([1])],
          ["assets/bg2.png", new Uint8Array([2])],
        ]),
      });
      const runtime = createSceneLayoutPackageRuntime({
        resource,
        presentationOnly: true,
      });
      await runtime.init();
      const events: unknown[] = [];
      const dispose = runtime.addresses.bind(
        "gamelayout:/event/variant-changed",
        (event) => events.push(event),
      );

      runtime.applyViewport({ width: 1920, height: 1080 });
      runtime.applyViewport({ width: 1600, height: 900 });
      expect(events).toEqual([]);
      runtime.applyViewport({ width: 1200, height: 1800 });
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        sequence: 3,
        detail: {
          previousVariantId: "landscape",
          variantId: "portrait",
        },
      });
      runtime.applyViewport({ width: 1300, height: 1900 });
      expect(events).toHaveLength(1);
      expect(() => runtime.applyViewport({ width: 1000, height: 900 })).toThrow(
        /cannot contain focusRect/,
      );
      expect(events).toHaveLength(1);

      dispose();
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("commits a prepared v4 background order change without a second structure check", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const manifest = {
        ...game002LayoutFixture,
        nodes: [
          game002LayoutFixture.nodes[0],
          {
            ...game002LayoutFixture.nodes[0],
            id: "free-bg",
            order: 1,
            resource: {
              ...game002LayoutFixture.nodes[0].resource,
              path: "assets/free-bg.png",
            },
          },
        ],
        gameModes: {
          initialMode: "BaseGame",
          modes: [
            {
              id: "BaseGame",
              backgroundNodes: { default: "bg" },
              nodeStates: {},
            },
            {
              id: "FreeGame",
              backgroundNodes: { default: "free-bg" },
              nodeStates: {},
            },
          ],
          transitions: [
            {
              from: "BaseGame",
              to: "FreeGame",
              overlay: { kind: "none" as const },
            },
          ],
        },
        runtimeResources: {
          badge: {
            kind: "image" as const,
            path: "assets/badge.png",
            size: { width: 1, height: 1 },
          },
        },
      };
      const resource = await createSceneLayoutPackageResource({
        manifest,
        files: new Map([
          ["assets/bg.png", new Uint8Array([1])],
          ["assets/free-bg.png", new Uint8Array([2])],
          ["assets/badge.png", new Uint8Array([3])],
        ]),
        lazyRuntimeResources: true,
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      expect(resource.runtimeManifest.version).toBe(5);
      expect(resource.layout.manifest.runtimeResources).toBeUndefined();
      const runtime = createSceneLayoutPackageRuntime({
        resource,
        presentationOnly: true,
      });
      await runtime.init();
      runtime.applyViewport({ width: 2000, height: 2000 });
      const badge = await runtime.createRenderObject("badge");

      await expect(
        runtime.requestGameMode("FreeGame"),
      ).resolves.toBeUndefined();
      expect(runtime.getStableGameMode()).toBe("FreeGame");
      expect(runtime.getNode("free-bg").parent?.visible).toBe(true);
      expect(runtime.getNode("bg").parent?.visible).toBe(false);

      badge.destroy();
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  for (const renderMode of ["standard", "grid-cell"] as const) {
    it(`emits distinct batch and occurrence symbol-state events on ${renderMode} reels`, async () => {
      const load = vi
        .spyOn(Assets, "load")
        .mockResolvedValue(Texture.WHITE as never);
      const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
      const backend = new EventAudioBackend();
      try {
        const batchA =
          "gamelayout:/symbol-package/demo-symbols/symbolsstatebatch/A/win";
        const manifest = upgradeSceneLayoutManifestToLatest(
          layoutManifest(renderMode),
        );
        const packageFiles = files();
        packageFiles.set("assets/batch-win.mp3", new Uint8Array([4]));
        const resource = await createSceneLayoutPackageResource({
          manifest: {
            ...manifest,
            eventAudio: {
              version: 1,
              ignoreLegacyAudio: false,
              bindings: [
                {
                  event: batchA,
                  audio: {
                    name: "batch-win",
                    asset: {
                      sources: [
                        {
                          path: "assets/batch-win.mp3",
                          mediaType: "audio/mpeg",
                        },
                      ],
                    },
                    category: "effect",
                    playback: "once",
                    voices: { maxConcurrent: 1, overflow: "restart-oldest" },
                    focus: {},
                  },
                },
              ],
            },
          },
          files: packageFiles,
        });
        const runtime = createSceneLayoutPackageRuntime({
          resource,
          audioBackend: backend,
        });
        await runtime.init({
          reels: {
            main: {
              scene: [
                [1, 1],
                [0, 0],
              ],
              localPhaseYs: [0, 0],
            },
          },
        });
        await runtime.unlockAudio();
        const batchB =
          "gamelayout:/symbol-package/demo-symbols/symbolsstatebatch/B/win";
        const occurrenceB =
          "gamelayout:/symbol-package/demo-symbols/symbol/B/instance/reel/main/x/0/y/0/state/win/entered";
        const observed: Array<{ address: string; detail: unknown }> = [];
        const disposers = [batchA, batchB, occurrenceB].map((address) =>
          runtime.addresses.bind(address, (event) => observed.push(event)),
        );

        await runtime.playMainReelSymbolStateBatch([
          {
            positions: [
              { x: 0, y: 0 },
              { x: 1, y: 0 },
            ],
            state: "win",
            options: { transitionMode: "immediate", completion: "entered" },
          },
          {
            positions: [{ x: 0, y: 0 }],
            symbol: "B",
            state: "win",
            options: { transitionMode: "immediate", completion: "entered" },
          },
        ]);

        expect(observed.slice(0, 2).map(({ address }) => address)).toEqual([
          batchA,
          batchB,
        ]);
        expect(observed[0]?.detail).toEqual({
          eventFamily: "symbols-state-batch",
          symbolPackageId: "demo-symbols",
          symbol: "A",
          state: "win",
        });
        for (let index = 0; index < 5; index += 1) await Promise.resolve();
        expect(backend.sounds).toHaveLength(1);
        expect(backend.sounds[0]?.instances).toHaveLength(1);
        expect(observed.some(({ address }) => address === occurrenceB)).toBe(
          true,
        );

        const eventCount = observed.length;
        expect(() =>
          runtime.playMainReelSymbolStateBatch([
            {
              positions: [{ x: 0, y: 1 }],
              symbol: "A",
              state: "win",
              options: {
                transitionMode: "immediate",
                completion: "entered",
              },
            },
          ]),
        ).toThrow(/symbol "A" is not present/);
        expect(observed).toHaveLength(eventCount);
        expect(
          runtime.getMainReelSymbolStateSnapshots([{ x: 0, y: 1 }])[0]
            ?.requestedState,
        ).toBe("normal");

        const abortController = new AbortController();
        abortController.abort();
        const abortedEventCount = observed.length;
        let abortedError: unknown;
        try {
          await runtime.playMainReelSymbolStateBatch(
            [
              {
                positions: [{ x: 1, y: 1 }],
                state: "win",
                options: {
                  transitionMode: "immediate",
                  completion: "entered",
                },
              },
            ],
            { signal: abortController.signal },
          );
        } catch (error) {
          abortedError = error;
        }
        expect(abortedError).toMatchObject({ name: "AbortError" });
        expect(observed).toHaveLength(abortedEventCount);
        expect(
          runtime.getMainReelSymbolStateSnapshots([{ x: 1, y: 1 }])[0]
            ?.requestedState,
        ).toBe("normal");

        for (const dispose of disposers) dispose();
        runtime.destroy();
      } finally {
        load.mockRestore();
        unload.mockRestore();
      }
    });

    it(`creates, orders and resets the ${renderMode} reel from package contracts`, async () => {
      const load = vi
        .spyOn(Assets, "load")
        .mockResolvedValue(Texture.WHITE as never);
      const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
      try {
        const resource = await createSceneLayoutPackageResource({
          manifest: layoutManifest(renderMode),
          files: files(),
        });
        const runtime = createSceneLayoutPackageRuntime({ resource });
        const initialScene = [
          [1, 1],
          [0, 0],
        ];
        await runtime.init({
          reels: {
            main: { scene: initialScene, localPhaseYs: [5, -3] },
          },
        });
        let delayCompleted = false;
        const delay = runtime.waitForPresentationDelay(50).then(() => {
          delayCompleted = true;
        });
        runtime.update(0.049);
        await Promise.resolve();
        expect(delayCompleted).toBe(false);
        runtime.update(0.001);
        await delay;
        expect(delayCompleted).toBe(true);
        const reel = runtime.getReelPresentation("main");
        expect(
          renderMode === "standard"
            ? reel instanceof RenderReelSet
            : reel instanceof RenderGridCellReelSet,
        ).toBe(true);
        expect(reel.parent).toBe(runtime.container.children[0]);
        expect(reel.parent!.getChildIndex(reel)).toBe(1);
        const snapshot = runtime.applyViewport({ width: 1920, height: 1080 });
        expect(snapshot.reels.main.artRect).toEqual({
          x: 640,
          y: 337,
          width: 4,
          height: 5,
        });
        expect(reel.position).toMatchObject({ x: 640, y: 337 });
        const movedManifest = structuredClone(
          layoutManifest(renderMode),
        ) as any;
        movedManifest.reels.main.placements.default = { x: 650, y: 345 };
        const movedSnapshot = runtime.applyGeometryManifest(movedManifest);
        expect(movedSnapshot?.reels.main).toMatchObject({
          artRect: { x: 650, y: 345, width: 4, height: 5 },
        });
        expect(runtime.getReelPresentation("main")).toBe(reel);
        expect(reel.position).toMatchObject({ x: 650, y: 345 });
        expect(
          runtime.getMainReelSymbolGeometrySnapshots([{ x: 0, y: 0 }]),
        ).toMatchObject([{ x: 0, y: 0 }]);
        expect(
          renderMode === "standard"
            ? (reel as RenderReelSet).getVisibleScene()
            : (reel as RenderGridCellReelSet).getVisibleScene(),
        ).toEqual(initialScene);
        const nextScene = [
          [0, 1],
          [1, 0],
        ];
        runtime.resetReelScene("main", {
          scene: nextScene,
          localPhaseYs: [100, -100],
        });
        expect(
          renderMode === "standard"
            ? (reel as RenderReelSet).getVisibleScene()
            : (reel as RenderGridCellReelSet).getVisibleScene(),
        ).toEqual(nextScene);
        const sceneWithEmptySymbol = [
          [-1, 1],
          [1, 0],
        ];
        runtime.applyMainReelSnapshot({
          scene: sceneWithEmptySymbol,
          localPhaseYs: [0, 0],
          presentationValues: [
            [null, null],
            [null, null],
          ],
        });
        expect(runtime.getMainReelSceneSnapshot()).toEqual(
          sceneWithEmptySymbol,
        );
        expect(() =>
          runtime.applyMainReelSnapshot({
            scene: sceneWithEmptySymbol,
            localPhaseYs: [0, 0],
            presentationValues: [
              [2, null],
              [null, null],
            ],
          }),
        ).toThrow(/must be null for an empty grid cell/);
        runtime.applyMainReelSnapshot({
          scene: nextScene,
          localPhaseYs: [0, 0],
        });
        expect(() =>
          runtime.resetReelScene("main", {
            scene: [[0], [1]],
            localPhaseYs: [0, 0],
          }),
        ).toThrow(/2 rows/);
        expect(() =>
          runtime.resetReelScene("main", {
            scene: [
              [0, 9],
              [1, 0],
            ],
            localPhaseYs: [0, 0],
          }),
        ).toThrow(/not displayable/);
        expect(() =>
          runtime.resetReelScene("main", {
            scene: nextScene,
            localPhaseYs: [0, 0.5],
          }),
        ).toThrow(/safe integer/);
        runtime.update(1 / 60);
        runtime.destroy();
        runtime.destroy();
        expect(() => runtime.getReelPresentation("main")).toThrow(/destroyed/);
      } finally {
        load.mockRestore();
        unload.mockRestore();
      }
    });

    it(`starts configured ${renderMode} stopping state at the first real landing`, async () => {
      const load = vi
        .spyOn(Assets, "load")
        .mockResolvedValue(Texture.WHITE as never);
      const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
      try {
        const resource = await createSceneLayoutPackageResource({
          manifest: layoutManifest(renderMode),
          files: files(),
        });
        const reelPresentation =
          renderMode === "standard"
            ? {
                kind: "standard" as const,
                version: 1 as const,
                direction: "forward" as const,
                speedSymbolsPerSecond: 100,
                minimumSpinCycles: 1,
                baseDurationMs: 100,
                startDelayMs: 0,
                stopDelayMs: 100,
                bounceStrength: 0,
              }
            : {
                kind: "grid-cell" as const,
                version: 1 as const,
                direction: "forward" as const,
                order: "top-down-left-right" as const,
                timing: {
                  startStepMs: 0,
                  stopStepMs: 100,
                  settleAfterLastStartMs: 100,
                  minimumSpinCycles: 1,
                  speedSymbolsPerSecond: 100,
                },
                bounceStrength: 0,
              };
        const runtime = createSceneLayoutPackageRuntime({
          resource,
          reelPresentation,
        });
        await runtime.init({
          reels: {
            main: {
              scene: [
                [1, 1],
                [0, 0],
              ],
              localPhaseYs: [0, 0],
            },
          },
        });
        const target = {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          random: () => 0,
        };
        expect(() =>
          runtime.spinMainReelToScene({
            ...target,
            landingStates: [["normal"], ["normal", "normal"]],
          }),
        ).toThrow(/2 rows/);
        runtime.spinMainReelToScene({
          ...target,
          landingStates: [
            ["normal", "normal"],
            ["normal", "normal"],
          ],
          ...(renderMode === "grid-cell"
            ? {
                buildGridCellSpinPlan: (stage) =>
                  stage.createPlan({
                    activation: {
                      activationGate: { x: 0, y: 0 },
                      firstFollowingStopDelayMs: 100,
                      activatedStopStepMs: 100,
                    },
                  }),
              }
            : {}),
        });
        runtime.update(0.1);
        const starts = runtime.drainMainReelStartedPositions();
        const landings = runtime.drainMainReelLandingPositions();
        const activations = runtime.drainMainReelActivationPositions();

        expect(landings).toHaveLength(renderMode === "standard" ? 2 : 1);
        expect(starts).toHaveLength(renderMode === "grid-cell" ? 4 : 0);
        expect(runtime.drainMainReelStartedPositions()).toEqual([]);
        expect(activations).toEqual(
          renderMode === "grid-cell" ? [{ x: 0, y: 0 }] : [],
        );
        expect(runtime.drainMainReelActivationPositions()).toEqual([]);
        expect(runtime.isMainReelSpinning()).toBe(true);
        expect(runtime.getMainReelSymbolStateSnapshots(landings)).toMatchObject(
          landings.map(() => ({ requestedState: "normal" })),
        );
        runtime.destroy();
      } finally {
        load.mockRestore();
        unload.mockRestore();
      }
    });
  }

  it("exposes one targetless grid transaction and settles only its first response target", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: layoutManifest("grid-cell"),
        files: files(),
      });
      const runtime = createSceneLayoutPackageRuntime({
        resource,
        reelPresentation: {
          kind: "grid-cell",
          version: 1,
          direction: "forward",
          order: "top-down-left-right",
          timing: {
            startStepMs: 0,
            stopStepMs: 20,
            settleAfterLastStartMs: 80,
            minimumSpinCycles: 1,
            speedSymbolsPerSecond: 20,
          },
          bounceStrength: 0,
        },
      });
      await runtime.init({
        reels: {
          main: {
            scene: [
              [1, 1],
              [0, 0],
            ],
            localPhaseYs: [0, 0],
          },
        },
      });
      expect(() => runtime.getReelSpin("main")).toThrow(
        /requires a standard reel runtime/,
      );
      expect(() =>
        runtime.startMainReelContinuousSpin({ random: null as never }),
      ).toThrow(/phase random must be a function/);
      runtime.startMainReelContinuousSpin({
        positions: [{ x: 0, y: 0 }],
        dimming: {
          resolveDimmingAlpha: () => 0,
          fadeInMs: 0,
          fadeOutMs: 0,
        },
        dimmingActivatedAtStart: false,
      });
      runtime.settleMainReelContinuousSpin({
        scene: [
          [0, 1],
          [0, 0],
        ],
        localPhaseYs: [0, 0],
        random: () => 0,
        buildGridCellSpinPlan: (stage) =>
          stage.createPlan({ positions: [{ x: 0, y: 0 }] }),
      });
      for (
        let index = 0;
        index < 20 && runtime.isMainReelSpinning();
        index += 1
      )
        runtime.update(0.05);
      expect(() =>
        runtime.startMainReelContinuousSpin({
          localReels: [[0], [1]],
          random: () => 0,
        }),
      ).toThrow(/grid rows 2 exceed reel 0 length 1/);
      const atomicStart = vi.spyOn(RenderReel.prototype, "startContinuous");
      const samples = [0.9, 0, 0, 0];
      let sampleIndex = 0;
      const localReels = [
        [1, 1, 0, 0],
        [0, 0, 1, 1],
      ] as const;
      runtime.startMainReelContinuousSpin({
        localReels,
        random: () => samples[sampleIndex++]!,
      });
      runtime.update(0.05);
      expect(runtime.drainMainReelStartedPositions()).toHaveLength(4);
      expect(sampleIndex).toBe(4);
      expect(
        atomicStart.mock.calls.map(([options]) => options.localPhaseY),
      ).toEqual([3, 1, 0, 1]);
      expect(
        atomicStart.mock.calls.every(
          ([options]) =>
            options.reels?.getName() === "scene-layout-local-spin" &&
            options.reels.getLength(0) === 4,
        ),
      ).toBe(true);
      atomicStart.mockRestore();
      const atomicSettle = vi.spyOn(RenderReel.prototype, "settleContinuous");
      const target = {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
        localReels,
        random: () => 0,
      };
      expect(() => runtime.spinMainReelToScene(target)).toThrow(
        /must be settled through/,
      );
      runtime.settleMainReelContinuousSpin(target);
      expect(atomicSettle).toHaveBeenCalledTimes(4);
      expect(
        atomicSettle.mock.calls.every(
          ([, options]) =>
            options?.reels?.getName() === "scene-layout-local-spin" &&
            options.reels.getLength(1) === 4,
        ),
      ).toBe(true);
      atomicSettle.mockRestore();
      for (
        let index = 0;
        index < 20 && runtime.isMainReelSpinning();
        index += 1
      )
        runtime.update(0.05);
      expect(runtime.getMainReelSceneSnapshot()).toEqual(target.scene);
      expect(() => runtime.settleMainReelContinuousSpin(target)).toThrow(
        /without an active continuous spin/,
      );
      const destroyedDelay = runtime.waitForPresentationDelay(100);
      runtime.destroy();
      await expect(destroyedDelay).rejects.toThrow(/destroyed/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("starts and settles one targetless standard reel transaction", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: layoutManifest("standard"),
        files: files(),
      });
      const runtime = createSceneLayoutPackageRuntime({
        resource,
        reelPresentation: {
          kind: "standard",
          version: 1,
          direction: "forward",
          speedSymbolsPerSecond: 100,
          minimumSpinCycles: 1,
          baseDurationMs: 100,
          startDelayMs: 0,
          stopDelayMs: 0,
          bounceStrength: 0,
        },
      });
      await runtime.init({
        reels: {
          main: {
            scene: [
              [1, 1],
              [0, 0],
            ],
            localPhaseYs: [0, 0],
          },
        },
      });
      for (const input of [
        {
          localReels: [
            [0, 1],
            [1, 0],
          ],
        },
        { positions: [{ x: 0, y: 0 }] },
        { random: () => 0 },
        { dimming: {} },
        { dimmingActivatedAtStart: true },
      ]) {
        expect(() =>
          runtime.startMainReelContinuousSpin(input as never),
        ).toThrow(/does not accept grid-cell presentation options/);
      }
      runtime.startMainReelContinuousSpin();
      runtime.cancelMainReelContinuousSpin();
      expect(runtime.isMainReelSpinning()).toBe(false);
      runtime.startMainReelContinuousSpin();
      runtime.update(0.05);
      expect(runtime.isMainReelSpinning()).toBe(true);
      const target = {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
        random: () => 0,
      };
      expect(() => runtime.spinMainReelToScene(target)).toThrow(
        /must be settled through/,
      );
      runtime.settleMainReelContinuousSpin(target);
      for (
        let index = 0;
        index < 20 && runtime.isMainReelSpinning();
        index += 1
      )
        runtime.update(0.05);
      expect(runtime.getMainReelSceneSnapshot()).toEqual(target.scene);
      expect(() => runtime.settleMainReelContinuousSpin(target)).toThrow(
        /without an active continuous spin/,
      );
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("requires explicit runtime scene input and rejects incompatible bindings", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: layoutManifest("standard"),
        files: files(),
      });
      const runtime = createSceneLayoutPackageRuntime({ resource });
      await runtime.init();
      expect(runtime.hasCommittedMainReelScene()).toBe(false);
      expect(() => runtime.getMainReelSceneSnapshot()).toThrow(
        /no committed initial scene/,
      );
      runtime.resetReelScene("main", {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
      });
      expect(() => runtime.startMainReelContinuousSpin()).toThrow(
        /requires a reel presentation profile/,
      );
      expect(runtime.hasCommittedMainReelScene()).toBe(true);
      expect(runtime.getMainReelSceneSnapshot()).toEqual([
        [0, 1],
        [1, 0],
      ]);

      await expect(
        createSceneLayoutPackageResource({
          manifest: {
            ...layoutManifest("standard"),
            reels: {
              main: {
                ...layoutManifest("standard").reels.main,
                cellSize: { width: 2, height: 1 },
              },
            },
          },
          files: files(),
        }),
      ).rejects.toThrow(/cellSize mismatch/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("prevalidates and atomically swaps canonical per-mode symbol packages", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource(
        canonicalMultiSymbolFixture(),
      );
      expect(Object.keys(resource.symbolPackages)).toEqual([
        "demo-symbols",
        "alt-symbols",
      ]);
      const runtime = createRuntimeWithTransitions(resource, [
        ["BaseGame", "FreeGame"],
        ["FreeGame", "BaseGame"],
        ["FreeGame", "BonusGame"],
        ["BonusGame", "FreeGame"],
        ["FreeGame", "EmptyGame"],
      ]);
      const baseInput = {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
      };
      await runtime.init({ reels: { main: baseInput } });
      runtime.applyViewport({ width: 2000, height: 2000 });
      const baseReel = runtime.getReelPresentation("main");
      expect(baseReel).toBeInstanceOf(RenderReelSet);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "BaseGame",
        stableSymbolPackage: "demo-symbols",
      });

      await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
        /requires target reels\.main/,
      );
      await expect(
        runtime.requestGameMode("FreeGame", {
          reels: {
            main: {
              scene: [
                [0, 9],
                [1, 0],
              ],
              localPhaseYs: [0, 0],
            },
          },
        }),
      ).rejects.toThrow(/not displayable/);
      expect(runtime.getReelPresentation("main")).toBe(baseReel);
      expect(runtime.getGameModeSnapshot().stableMode).toBe("BaseGame");

      await completeModeRequest(runtime, "FreeGame", {
        reels: { main: baseInput },
      });
      const freeReel = runtime.getReelPresentation("main");
      expect(freeReel).toBeInstanceOf(RenderGridCellReelSet);
      expect(freeReel).not.toBe(baseReel);
      expect(baseReel.destroyed).toBe(false);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "FreeGame",
        stableSymbolPackage: "alt-symbols",
      });

      await completeModeRequest(runtime, "BaseGame");
      expect(runtime.getReelPresentation("main")).toBe(baseReel);
      expect(freeReel.destroyed).toBe(false);
      await completeModeRequest(runtime, "FreeGame");
      expect(runtime.getReelPresentation("main")).toBe(freeReel);

      await completeModeRequest(runtime, "BonusGame");
      expect(runtime.getReelPresentation("main")).toBe(freeReel);
      await expect(
        runtime.requestGameMode("FreeGame", { reels: { main: baseInput } }),
      ).rejects.toThrow(/sharing a symbol package/);

      await completeModeRequest(runtime, "FreeGame", {
        recreateReel: true,
        reels: { main: baseInput },
      });
      const forcedReel = runtime.getReelPresentation("main");
      expect(forcedReel).not.toBe(freeReel);
      expect(forcedReel).toBeInstanceOf(RenderGridCellReelSet);
      expect(freeReel.destroyed).toBe(true);

      await completeModeRequest(runtime, "EmptyGame");
      expect(() => runtime.getReelPresentation("main")).toThrow(/unavailable/);
      expect(forcedReel.destroyed).toBe(false);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "EmptyGame",
        stableSymbolPackage: null,
      });
      runtime.destroy();
      expect(baseReel.destroyed).toBe(true);
      expect(forcedReel.destroyed).toBe(true);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("keeps the main reel aligned with guide geometry across mode art-size switches", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const fixture = canonicalMultiSymbolFixture();
      const manifest = structuredClone(
        upgradeSceneLayoutManifestToLatest(fixture.manifest),
      ) as any;
      manifest.coordinateOrigin = "center";
      for (const mode of manifest.gameModes.modes) {
        const square = mode.id === "BaseGame" || mode.id === "BonusGame";
        mode.adaptation = {
          mode: "maximized-focus",
          artSize: {
            width: 2000,
            height: square ? 2000 : 1125,
          },
          focusRect: {
            x: 0,
            y: 0,
            width: 2000,
            height: square ? 2000 : 1125,
          },
        };
        mode.reelPlacements.main.default = { x: 0, y: 0 };
      }
      const resource = await createSceneLayoutPackageResource({
        manifest,
        files: fixture.files,
      });
      const runtime = createSceneLayoutPackageRuntime({ resource });
      const input = {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
      };
      await runtime.init({ reels: { main: input } });

      const expectAligned = (viewportSize: {
        width: number;
        height: number;
      }) => {
        const snapshot = runtime.applyViewport(viewportSize);
        const guideRect = snapshot.reels.main.viewportRect;
        const reel = runtime.getReelPresentation("main");
        expect({
          x: reel.position.x + reel.parent!.position.x,
          y: reel.position.y + reel.parent!.position.y,
        }).toEqual({ x: guideRect.x, y: guideRect.y });
      };

      expectAligned({ width: 2000, height: 2000 });
      await runtime.selectAuthoringGameMode("FreeGame", {
        reels: { main: input },
      });
      expectAligned({ width: 2000, height: 1125 });
      await runtime.selectAuthoringGameMode("BonusGame");
      expectAligned({ width: 2000, height: 2000 });
      await runtime.selectAuthoringGameMode("FreeGame");
      expectAligned({ width: 2000, height: 1125 });

      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("keeps the source reel before the event and swaps the complete scene at the event", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource(
        canonicalMultiSymbolFixture(),
      );
      const players: ManualTransitionPlayer[] = [];
      const runtime = createRuntimeWithTransitions(
        resource,
        [["BaseGame", "FreeGame"]],
        () => {
          const player = new ManualTransitionPlayer();
          players.push(player);
          return player;
        },
      );
      const scene = {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
      };
      await runtime.init({ reels: { main: scene } });
      runtime.applyViewport({ width: 2000, height: 2000 });
      const sourceReel = runtime.getReelPresentation("main");
      const pending = runtime.requestGameMode("FreeGame", {
        reels: { main: scene },
      });
      await waitForModeTarget(runtime, "FreeGame");

      expect(runtime.getReelPresentation("main")).toBe(sourceReel);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "BaseGame",
        displayedMode: "BaseGame",
        transitionPhase: "before-switch",
        displayedSymbolPackage: "demo-symbols",
        targetSymbolPackage: "alt-symbols",
      });
      expect(runtime.container.children.at(-1)?.label).toBe(
        "scene-transition-video-blackout",
      );
      expect(players[0].plays).toEqual([
        { animationName: "BaseGame_FreeGame", loop: false },
      ]);

      players[0].results.push({
        completed: false,
        events: [{ name: "SwitchScene" }],
      });
      runtime.update(0.5);
      const targetReel = runtime.getReelPresentation("main");
      expect(targetReel).not.toBe(sourceReel);
      expect(sourceReel.destroyed).toBe(false);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "BaseGame",
        displayedMode: "FreeGame",
        transitionPhase: "after-switch",
        displayedSymbolPackage: "alt-symbols",
      });
      expect(players[0].view.parent?.label).toBe("scene-transition-overlay");

      players[0].results.push({ completed: true, events: [] });
      runtime.update(0.5);
      await pending;
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "FreeGame",
        displayedMode: "FreeGame",
        phase: "stable",
      });
      expect(players[0].view.parent).toBeNull();
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("keeps the package runtime layout-only when no symbols binding exists", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const create = () =>
        createSceneLayoutPackageResource({
          manifest: game002LayoutFixture,
          files: new Map([["assets/bg.png", new Uint8Array([1])]]),
        });
      const resource = await create();
      const runtime = createSceneLayoutPackageRuntime({ resource });
      await runtime.init();
      runtime.applyViewport({ width: 100, height: 100 });
      expect(() => runtime.getReelPresentation("main")).toThrow(/unavailable/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [],
          localPhaseYs: [],
        }),
      ).toThrow(/unavailable/);
      expect(() => runtime.setImageStringText("bg", "0")).toThrow(
        /not an image-string/,
      );
      expect(() => runtime.requestNodeState("bg", "FG")).toThrow(
        /not a stateful Spine/,
      );
      await expect(runtime.createRenderObject("nearwin1")).rejects.toThrow(
        /Unknown scene layout runtime resource/,
      );
      await expect(
        runtime.createImgNumberRenderObject("winAmount", { text: "100" }),
      ).rejects.toThrow(/Unknown scene layout runtime resource/);
      runtime.destroy();

      const unexpected = createSceneLayoutPackageRuntime({
        resource: await create(),
      });
      await expect(
        unexpected.init({
          reels: { main: { scene: [], localPhaseYs: [] } },
        }),
      ).rejects.toThrow(/no symbol binding/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("does not advance an injected main reel when the host owns its update loop", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: layoutManifest("grid-cell"),
        files: files(),
      });
      const runtime = createSceneLayoutPackageRuntime({
        resource,
        hostUpdatesMainReel: true,
      });
      await runtime.init({
        reels: {
          main: {
            scene: [
              [1, 1],
              [0, 0],
            ],
            localPhaseYs: [0, 0],
          },
        },
      });
      const reel = runtime.getReelPresentation("main");
      expect(reel).toBeInstanceOf(RenderGridCellReelSet);
      if (!(reel instanceof RenderGridCellReelSet))
        throw new Error("Expected a grid-cell main reel.");
      const update = vi.spyOn(reel, "update");

      runtime.update(1 / 60);

      expect(update).not.toHaveBeenCalled();
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("owns generic game-mode snapshots and rejects popup fallbacks", async () => {
    expect(
      "createSceneLayoutPackageRuntimeInspector" in sceneLayoutCoreApi,
    ).toBe(false);
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const manifest = {
        ...game002LayoutFixture,
        gameModes: {
          initialMode: "BaseGame",
          modes: [
            { id: "BaseGame", nodeStates: {} },
            { id: "FreeGame", nodeStates: {} },
          ],
        },
      };
      const resource = await createSceneLayoutPackageResource({
        manifest,
        files: new Map([["assets/bg.png", new Uint8Array([1])]]),
      });
      const runtime = createRuntimeWithTransitions(resource, [
        ["BaseGame", "FreeGame"],
      ]);
      const inspector = createSceneLayoutPackageRuntimeInspector(runtime);
      await runtime.init();
      runtime.applyViewport({ width: 2000, height: 2000 });
      expect(runtime.getGameModeIds()).toEqual(["BaseGame", "FreeGame"]);
      expect(runtime.getGameModeIds()).toBe(runtime.getGameModeIds());
      expect(runtime.getStableGameMode()).toBe("BaseGame");
      expect(runtime.getGameModePhase()).toBe("stable");
      expect(inspector.getGameModeSnapshot()).toEqual({
        stableMode: "BaseGame",
        displayedMode: "BaseGame",
        targetMode: null,
        phase: "stable",
        transitionPhase: null,
        transition: null,
        preparedTargetMode: null,
        transitionKind: null,
        activePreludePopup: null,
        mediaTimeSeconds: null,
        mediaDurationSeconds: null,
        fadeProgress: null,
        stableSymbolPackage: null,
        displayedSymbolPackage: null,
        targetSymbolPackage: null,
        activeBackgroundNodes: ["bg"],
      });
      await expect(
        runtime.requestGameMode("BaseGame"),
      ).resolves.toBeUndefined();
      await completeModeRequest(runtime, "FreeGame");
      expect(runtime.getStableGameMode()).toBe("FreeGame");
      expect(inspector.getGameModeSnapshot().stableMode).toBe("FreeGame");
      await expect(runtime.requestGameMode("Missing")).rejects.toThrow(
        /Unknown/,
      );
      expect(() =>
        runtime.startAwardCelebrationForCurrentMode({
          betAmountRaw: 0,
          winAmountRaw: 1,
        }),
      ).toThrow(/betAmountRaw/);
      expect(() =>
        runtime.startAwardCelebrationForCurrentMode({
          betAmountRaw: 1,
          winAmountRaw: -1,
        }),
      ).toThrow(/winAmountRaw/);
      expect(() =>
        runtime.startAwardCelebrationForCurrentMode({
          betAmountRaw: 1,
          winAmountRaw: 1,
        }),
      ).toThrow(/has no award celebration/);
      expect(() => runtime.requestAdvanceAwardCelebration()).toThrow(
        /No award celebration/,
      );
      expect(inspector.getActiveAwardCelebrationSnapshot()).toBeNull();
      expect(runtime.getActiveAwardCelebrationPhase()).toBeNull();
      runtime.dismissActiveAwardCelebrationImmediately();
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("loads legacy v1 directly through the default latest game-mode flow", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: game002LayoutFixture,
        files: new Map([["assets/bg.png", new Uint8Array([1])]]),
      });
      const runtime = createSceneLayoutPackageRuntime({ resource });
      await runtime.init();
      expect(resource.manifest.version).toBe(1);
      expect(resource.runtimeManifest.version).toBe(5);
      expect(runtime.getGameModeIds()).toEqual(["BaseGame"]);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "BaseGame",
        displayedMode: "BaseGame",
      });
      await expect(
        runtime.requestGameMode("BaseGame"),
      ).resolves.toBeUndefined();
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("starts, advances and clears the popup bound to the current mode", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const fixture = popupLayoutFixture();
      const resource = await createSceneLayoutPackageResource({
        ...fixture,
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      const runtime = createRuntimeWithTransitions(resource, [
        ["BaseGame", "FreeGame"],
      ]);
      const inspector = createSceneLayoutPackageRuntimeInspector(runtime);
      await runtime.init();
      runtime.applyViewport({ width: 200, height: 100 });
      const popup = runtime.getAwardCelebrationPopup("celebration");
      expect(resource.popupPackages.celebration.manifest.type).toBe(
        "award-celebration",
      );
      if (
        resource.popupPackages.celebration.manifest.type !== "award-celebration"
      )
        throw new Error("Expected award celebration popup fixture.");
      expect(
        resource.popupPackages.celebration.manifest.awardCelebration
          .celebrationTiers[0]!.layers[1],
      ).toMatchObject({ playback: { mode: "once" } });
      expect(popup.container.position).toMatchObject({ x: 0, y: 0 });
      expect(popup.container.scale).toMatchObject({ x: 1, y: 1 });
      expect(popup.container.children.at(-1)?.position).toMatchObject({
        x: 103,
        y: 46,
      });
      expect(popup.container.children.at(-1)?.scale).toMatchObject({
        x: 0.8,
        y: 0.8,
      });
      expect(popup.container.zIndex).toBe(2000);
      const celebrationComplete = runtime.playAwardCelebrationForCurrentMode({
        betAmountRaw: 100,
        winAmountRaw: 6000,
      });
      expect(inspector.getActiveAwardCelebrationSnapshot()).toMatchObject({
        phase: "counting",
        finalAmountRaw: 6000,
      });
      expect(runtime.getActiveAwardCelebrationPhase()).toBe("counting");
      const queuedCelebration = runtime.playAwardCelebrationForCurrentMode({
        betAmountRaw: 100,
        winAmountRaw: 3000,
      });
      await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
        /while an award celebration is active/,
      );
      runtime.update(0.25);
      expect(
        inspector.getActiveAwardCelebrationSnapshot()!.displayedAmountRaw,
      ).toBeGreaterThan(0);
      const popupPresentation = runtime.getPopupPresentation();
      expect(popupPresentation.eventMode).toBe("static");
      popupPresentation.emit("pointerdown", {} as never);
      runtime.requestAdvanceAwardCelebration();
      runtime.requestAdvanceAwardCelebration();
      runtime.requestAdvanceAwardCelebration();
      expect(inspector.getActiveAwardCelebrationSnapshot()).toMatchObject({
        phase: "counting",
        activeTierId: "megawin",
        displayedAmountRaw: 5840,
      });
      runtime.update(1);
      expect(inspector.getActiveAwardCelebrationSnapshot()).toMatchObject({
        phase: "dismissing",
        activeTierId: "megawin",
        activeSegment: "end",
        displayedAmountRaw: 6000,
      });
      popupPresentation.emit("pointerdown", {} as never);
      expect(inspector.getActiveAwardCelebrationSnapshot()).toMatchObject({
        phase: "dismissing",
        activeTierId: "megawin",
        displayedAmountRaw: 6000,
      });
      expect(popupPresentation.eventMode).toBe("static");
      runtime.update(10);
      await expect(celebrationComplete).resolves.toBeUndefined();
      expect(runtime.getActiveAwardCelebrationPhase()).toBe("counting");
      runtime.dismissActiveAwardCelebrationImmediately();
      await expect(queuedCelebration).resolves.toBeUndefined();
      expect(popupPresentation.eventMode).toBe("none");
      expect(inspector.getActiveAwardCelebrationSnapshot()).toBeNull();
      expect(runtime.getActiveAwardCelebrationPhase()).toBeNull();
      await completeModeRequest(runtime, "FreeGame");
      expect(() =>
        runtime.startAwardCelebrationForCurrentMode({
          betAmountRaw: 100,
          winAmountRaw: 6000,
        }),
      ).toThrow(/has no award celebration/);
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("keeps Popup catalogs available while deferring Popup image preparation", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const fixture = popupLayoutFixture();
    const decodeImage = vi.fn(async () => ({ width: 1, height: 1 }));
    try {
      const resource = await createSceneLayoutPackageResource({
        ...fixture,
        lazyPopupResources: true,
        decodeImage,
      });

      expect(resource.popupManifests?.celebration?.type).toBe(
        "award-celebration",
      );
      expect(resource.popupPackages).toEqual({});
      expect(decodeImage).not.toHaveBeenCalled();
      expect(load).not.toHaveBeenCalled();

      const popup = await resource.loadPopupPackage!("celebration");
      expect(popup.manifest.type).toBe("award-celebration");
      expect(decodeImage).toHaveBeenCalled();
      expect(load).toHaveBeenCalled();
      expect(resource.getLoadedPopupPackage!("celebration")).toBe(popup);
      await resource.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("opens one exact Popup address, drains one close, and reuses the cached player", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const fixture = popupLayoutFixture();
      const resource = await createSceneLayoutPackageResource({
        ...fixture,
        decodeImage: async () => ({ width: 1, height: 1 }),
      });
      const runtime = createSceneLayoutPackageRuntime({ resource });
      await runtime.init();
      const address = formatGameLayoutRuntimeAddress("popup", "celebration");
      const cachedPlayer = runtime.getAwardCelebrationPopup("celebration");
      expect(
        runtime
          .getPopupPresentation()
          .children.filter(
            (child) => child.label === "scene-layout-shared-popup-backdrop",
          ),
      ).toHaveLength(1);
      expect(
        cachedPlayer.container.children.some((child) =>
          child.label.endsWith("backdrop"),
        ),
      ).toBe(false);

      expect(() =>
        runtime.openPopup({ address, type: "single-state" }),
      ).toThrow(/type mismatch/);
      expect(runtime.getActivePopupAddress()).toBeNull();

      const first = runtime.openPopup({
        address,
        type: "award-celebration",
        instanceId: "gamelayout",
        betAmountRaw: 100,
        winAmountRaw: 1_000,
      });
      expect(first).toMatchObject({
        address,
        type: "award-celebration",
        instanceAddress: "gamelayout:/popup/celebration/instance/gamelayout",
      });
      const popupChildView = new Container();
      const popupChild = createRenderObject({
        view: popupChildView,
        destroy: () => popupChildView.destroy(),
      });
      const popupMount = runtime.addresses.mount(
        `${first.instanceAddress}/layer/root`,
        popupChild,
        { order: 3 },
      );
      expect(getRenderObjectAdapter(popupChild).view.parent?.visible).toBe(
        true,
      );
      expect(() =>
        runtime.enqueuePopup({
          address,
          type: "award-celebration",
          instanceId: "gamelayout",
          betAmountRaw: 100,
          winAmountRaw: 2_000,
        }),
      ).toThrow(/Duplicate live/);
      expect(runtime.getActivePopupAddress()).toBe(address);
      expect(runtime.getAwardCelebrationPopup("celebration")).toBe(
        cachedPlayer,
      );
      expect(() =>
        runtime.openPopup({
          address,
          type: "award-celebration",
          betAmountRaw: 100,
          winAmountRaw: 1_000,
        }),
      ).toThrow(/already active/);

      const closed = runtime.closePopup();
      for (
        let index = 0;
        index < 10 && runtime.getActivePopupAddress();
        index += 1
      )
        runtime.update(1);
      await expect(closed).resolves.toBeUndefined();
      await expect(first.finished).resolves.toBeUndefined();
      expect(popupChildView.parent).toBeNull();
      popupMount.detach();
      expect(() =>
        runtime.addresses.describe(
          "gamelayout:/popup/celebration/instance/gamelayout",
        ),
      ).toThrow(/Unknown/);
      popupChild.destroy();
      expect(runtime.getActivePopupAddress()).toBeNull();

      const second = runtime.openPopup({
        address,
        type: "award-celebration",
        betAmountRaw: 100,
        winAmountRaw: 1_000,
      });
      expect(runtime.getAwardCelebrationPopup("celebration")).toBe(
        cachedPlayer,
      );
      await expect(
        runtime.closePopup({ behavior: "immediate" }),
      ).resolves.toBeUndefined();
      await expect(second.finished).resolves.toBeUndefined();
      expect(runtime.getActivePopupAddress()).toBeNull();
      const destroyed = runtime.openPopup({
        address,
        type: "award-celebration",
        betAmountRaw: 100,
        winAmountRaw: 1_000,
      });
      const queuedAtDestroy = runtime.enqueuePopup({
        address,
        type: "award-celebration",
        betAmountRaw: 100,
        winAmountRaw: 2_000,
      });
      runtime.destroy();
      await expect(destroyed.finished).rejects.toThrow(
        /destroyed during Popup playback/,
      );
      await expect(queuedAtDestroy.finished).rejects.toThrow(
        /destroyed during Popup playback/,
      );
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("rejects lifecycle and every runtime matrix boundary without fallback", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    try {
      const resource = await createSceneLayoutPackageResource({
        manifest: layoutManifest("standard"),
        files: files(),
      });
      const runtime = createSceneLayoutPackageRuntime({ resource });
      expect(() => runtime.applyViewport({ width: 10, height: 10 })).toThrow(
        /not initialized/,
      );
      await runtime.init({
        reels: {
          main: {
            scene: [
              [0, 1],
              [1, 0],
            ],
            localPhaseYs: [0, 0],
          },
        },
      });
      await expect(runtime.init()).rejects.toThrow(/already/);

      expect(() =>
        runtime.resetReelScene("main", {
          scene: [],
          localPhaseYs: [0, 0],
        }),
      ).toThrow(/2x2/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0.5, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
        }),
      ).toThrow(/not displayable/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [],
        }),
      ).toThrow(/2 values/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [],
        }),
      ).toThrow(/2x2/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [[null], [null, null]],
        }),
      ).toThrow(/column 0/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [
            [-1, null],
            [null, null],
          ],
        }),
      ).toThrow(/positive/);
      expect(() =>
        runtime.resetReelScene("main", {
          scene: [
            [0, 1],
            [1, 0],
          ],
          localPhaseYs: [0, 0],
          presentationValues: [
            [0.5, null],
            [null, 7],
          ],
        }),
      ).toThrow(/safe integer/);
      runtime.resetReelScene("main", {
        scene: [
          [0, 1],
          [1, 0],
        ],
        localPhaseYs: [0, 0],
        presentationValues: [
          [null, 2],
          [1, null],
        ],
      });
      expect(() => runtime.getReelPresentation("other" as "main")).toThrow(
        /unavailable/,
      );
      expect(runtime.getSymbolArea("main")).toBe(
        runtime.getReelPresentation("main"),
      );
      expect(runtime.getReelSpin("main")).toBe(
        runtime.getReelPresentation("main"),
      );
      expect(
        runtime.getReelArea("main").getSymbol({ x: 0, y: 0 }),
      ).toBeDefined();
      expect(runtime.getNodeAnchor("bg")).toEqual({
        kind: "render-anchor",
      });
      const programView = new Container();
      const programObject = createRenderObject({
        view: programView,
        destroy: () => programView.destroy(),
      });
      const reelLayer = runtime.getRenderLayer("reel");
      reelLayer.addAt(programObject, {
        anchor: runtime.getNodeRenderLayer("bg").getAnchor(),
        offset: { x: 2, y: 3 },
      });
      expect(programView.parent?.label).toBe("scene-layout-render-layer:reel");
      expect(runtime.getRenderLayer("layout")).toBe(
        runtime.getRootRenderLayer(),
      );
      expect(runtime.getRenderLayer("transition")).toBeDefined();
      expect(runtime.getRenderLayer("popup")).toBeDefined();
      expect(runtime.getRenderLayer("main.top")).toBe(
        runtime.getSymbolArea("main").getLayer("top"),
      );
      expect(runtime.getRenderLayer("bg")).toBe(
        runtime.getNodeRenderLayer("bg"),
      );
      expect(runtime.getRenderLayer("bg.after")).toBe(
        runtime.getNodeRenderLayer("bg", "after"),
      );
      expect(runtime.getRenderLayer("node:bg")).toBe(
        runtime.getNodeRenderLayer("bg"),
      );
      expect(() => runtime.getRenderLayer("hud" as "layout")).toThrow();
      const scopedView = new Container();
      const scopedObject = createRenderObject({
        view: scopedView,
        destroy: () => scopedView.destroy(),
      });
      await runtime.getSymbolArea("main").present((scope) =>
        scope.withNode(
          runtime.getNodeRenderLayer("bg", "after"),
          scopedObject,
          { ownership: "detach" },
          async () => {
            expect(scopedView.parent?.label).toBe("scene-layout-after:bg");
          },
        ),
      );
      expect(scopedView.parent).toBeNull();
      scopedObject.destroy();
      expect(() => runtime.getNodeAnchor("missing")).toThrow();
      expect(() => runtime.getSymbolArea("other")).toThrow(/unavailable/);
      expect(() => runtime.getReelSpin("other")).toThrow(/unavailable/);
      runtime.destroy();
      expect(programView.parent).toBeNull();
      programObject.destroy();

      const dead = createSceneLayoutPackageRuntime({
        resource: await createSceneLayoutPackageResource({
          manifest: layoutManifest("standard"),
          files: files(),
        }),
      });
      dead.destroy();
      await expect(dead.init()).rejects.toThrow(/destroyed/);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("retains an initial-mode loop event until trusted audio unlock", async () => {
    const load = vi
      .spyOn(Assets, "load")
      .mockResolvedValue(Texture.WHITE as never);
    const unload = vi.spyOn(Assets, "unload").mockResolvedValue(undefined);
    const backend = new EventAudioBackend();
    try {
      const latest = upgradeSceneLayoutManifestToLatest(game002LayoutFixture);
      const resource = await createSceneLayoutPackageResource({
        manifest: {
          ...latest,
          eventAudio: {
            version: 1,
            ignoreLegacyAudio: false,
            bindings: [
              {
                event: "gamelayout:/mode/BaseGame/state/stable/entered",
                endEvent: "gamelayout:/mode/BaseGame/state/stable/exited",
                audio: {
                  name: "initial-loop",
                  asset: {
                    sources: [
                      {
                        path: "assets/event-base.mp3",
                        mediaType: "audio/mpeg",
                      },
                    ],
                  },
                  category: "music",
                  playback: "loop",
                  voices: {
                    maxConcurrent: 1,
                    overflow: "restart-oldest",
                  },
                  focus: {},
                },
              },
            ],
          },
        },
        files: new Map([
          ["assets/bg.png", new Uint8Array([1])],
          ["assets/event-base.mp3", new Uint8Array([2])],
        ]),
      });
      const runtime = createSceneLayoutPackageRuntime({
        resource,
        presentationOnly: true,
        audioBackend: backend,
      });
      await runtime.init();
      expect(backend.sounds).toHaveLength(0);
      await runtime.unlockAudio();
      for (let index = 0; index < 5; index += 1) await Promise.resolve();
      expect(backend.unlockCount).toBe(1);
      expect(backend.sounds).toHaveLength(1);
      expect(backend.sounds[0]?.instances).toHaveLength(1);
      runtime.destroy();
      expect(backend.sounds[0]?.instances[0]?.stopped).toBe(true);
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });
});
