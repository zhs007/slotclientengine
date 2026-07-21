import { Assets, Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { RenderGridCellReelSet, RenderReelSet } from "../../src/reel/index.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";
import {
  createSceneLayoutPackageResource,
  createSceneLayoutPackageRuntime,
} from "../../src/scene-layout/index.js";
import { transitionResourceKey } from "../../src/scene-layout/resource.js";
import { game002LayoutFixture } from "./fixtures.js";

const encode = (value: unknown) =>
  new TextEncoder().encode(`${JSON.stringify(value)}\n`);

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
  const manifest = {
    ...resource.manifest,
    gameModes: {
      ...resource.manifest.gameModes!,
      transitions,
    },
  };
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
      manifest,
      layout: { ...resource.layout, manifest, spineResources },
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
  states: [],
  symbols: {
    A: { normal: "./a.png", scale: 1, renderPriority: 1 },
    B: { normal: "./b.png", scale: 1 },
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
    },
    awardCelebration: {
      base: { countDurationSeconds: 1, layers: [amountLayer] },
      standard: { countDurationSeconds: 1, layers: [amountLayer] },
      celebrationTiers: [
        {
          id: "bigwin",
          thresholdMultiplier: 15,
          countDurationSeconds: 1,
          layers: [amountLayer],
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
  for (const renderMode of ["standard", "grid-cell"] as const) {
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
  }

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
      await expect(runtime.init()).rejects.toThrow(
        /requires initial reels.main/,
      );

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
      expect(baseReel.destroyed).toBe(true);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "FreeGame",
        stableSymbolPackage: "alt-symbols",
      });

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
      expect(forcedReel.destroyed).toBe(true);
      expect(runtime.getGameModeSnapshot()).toMatchObject({
        stableMode: "EmptyGame",
        stableSymbolPackage: null,
      });
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
      expect(sourceReel.destroyed).toBe(true);
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

  it("owns generic game-mode snapshots and rejects popup fallbacks", async () => {
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
      await runtime.init();
      runtime.applyViewport({ width: 2000, height: 2000 });
      expect(runtime.getGameModeIds()).toEqual(["BaseGame", "FreeGame"]);
      expect(runtime.getGameModeSnapshot()).toEqual({
        stableMode: "BaseGame",
        displayedMode: "BaseGame",
        targetMode: null,
        phase: "stable",
        transitionPhase: null,
        transition: null,
        preparedTargetMode: null,
        transitionKind: null,
        mediaTimeSeconds: null,
        mediaDurationSeconds: null,
        fadeProgress: null,
        stableSymbolPackage: null,
        displayedSymbolPackage: null,
        targetSymbolPackage: null,
        activeBackgroundNodes: [],
      });
      await expect(
        runtime.requestGameMode("BaseGame"),
      ).resolves.toBeUndefined();
      await completeModeRequest(runtime, "FreeGame");
      expect(runtime.getGameModeSnapshot().stableMode).toBe("FreeGame");
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
      expect(runtime.getActiveAwardCelebrationSnapshot()).toBeNull();
      runtime.dismissActiveAwardCelebrationImmediately();
      runtime.destroy();
    } finally {
      load.mockRestore();
      unload.mockRestore();
    }
  });

  it("keeps legacy low-level package runtime and rejects new game-mode APIs", async () => {
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
      expect(() => runtime.getGameModeIds()).toThrow(
        /does not declare gameModes/,
      );
      expect(() => runtime.getGameModeSnapshot()).toThrow(
        /does not declare gameModes/,
      );
      await expect(runtime.requestGameMode("BaseGame")).rejects.toThrow(
        /does not declare gameModes/,
      );
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
      await runtime.init();
      runtime.applyViewport({ width: 200, height: 100 });
      const popup = runtime.getAwardCelebrationPopup("celebration");
      expect(popup.container.position).toMatchObject({ x: 103, y: 46 });
      expect(popup.container.scale).toMatchObject({ x: 0.8, y: 0.8 });
      runtime.startAwardCelebrationForCurrentMode({
        betAmountRaw: 100,
        winAmountRaw: 6000,
      });
      expect(runtime.getActiveAwardCelebrationSnapshot()).toMatchObject({
        phase: "counting",
        finalAmountRaw: 6000,
      });
      expect(() =>
        runtime.startAwardCelebrationForCurrentMode({
          betAmountRaw: 100,
          winAmountRaw: 6000,
        }),
      ).toThrow(/already active/);
      await expect(runtime.requestGameMode("FreeGame")).rejects.toThrow(
        /while an award celebration is active/,
      );
      runtime.update(0.25);
      expect(
        runtime.getActiveAwardCelebrationSnapshot()!.displayedAmountRaw,
      ).toBeGreaterThan(0);
      runtime.requestAdvanceAwardCelebration();
      runtime.dismissActiveAwardCelebrationImmediately();
      expect(runtime.getActiveAwardCelebrationSnapshot()).toBeNull();
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
      runtime.destroy();

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
});
