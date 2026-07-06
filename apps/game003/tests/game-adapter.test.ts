import { describe, expect, it, vi } from "vitest";
import { Assets, Container, Texture } from "pixi.js";
import {
  createSlotGameLogicResult,
  type GameLogic,
  type SceneMatrix,
} from "@slotclientengine/gameframeworks";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import type { WinAmountAnimationPlayer } from "@slotclientengine/rendercore/win-amount";
import {
  GAME003_BG_BAR_FEATURES,
  GAME003_DEFAULT_SCENE,
  GAME003_SAMPLE_BG_BAR_SPIN_RESULT,
  GAME003_SAMPLE_BG_BAR_WIN_SPIN_RESULT,
  GAME003_SAMPLE_COIN_SPIN_RESULT,
  GAME003_SAMPLE_WIN_SPIN_RESULT,
  GAME003_SPIN_SCENE,
  GAME003_WIN_SPIN_SCENE,
} from "./fixtures/game003-gmi.js";
import type { Game003BgBarLayout } from "../src/bg-bar-layout.js";
import type {
  Game003BgBarRuntime,
  Game003BgBarRuntimeSnapshot,
} from "../src/bg-bar-runtime.js";
import type {
  Game003BgBarFeature,
  Game003BgBarSpinPlan,
} from "../src/bg-bar-sequence.js";
import type { Game003CoinOverlayRuntime } from "../src/coin-overlay-runtime.js";
import {
  createGame003Adapter,
  type Game003AdapterOptions,
  type Game003StaticTextures,
} from "../src/game-adapter.js";
import type { Game003ReelRuntime } from "../src/game-demo.js";
import {
  GAME003_SKIN1_LANDSCAPE_SCENE_PARTS,
  GAME003_SKIN1_PORTRAIT_SCENE_PARTS,
  createGame003ReelLayout,
} from "../src/game-layout.js";
import type { Game003MinecartInteractionLayout } from "../src/minecart-interaction-layout.js";
import type { Game003MinecartInteractionRuntime } from "../src/minecart-interaction-runtime.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 adapter", () => {
  it("fails clearly before mount and when mounting twice", async () => {
    const fakeApp = createFakeApplication();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => new FakeRuntime().asRuntime(),
    });

    expect(() =>
      adapter.applyInitialState?.({
        userInfo: {},
        balance: 100,
        defaultScene: GAME003_DEFAULT_SCENE,
      }),
    ).toThrow(/not mounted/);
    expect(() => adapter.playSpin(createLogic(GAME003_SPIN_SCENE))).toThrow(
      /not mounted/,
    );

    await adapter.mount(createMountContext());
    await expect(adapter.mount(createMountContext())).rejects.toThrow(
      /already mounted/,
    );
  });

  it("mounts Pixi canvas, applies default scene, and keeps live untouched on resize", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const bgBar = new FakeBgBarRuntime();
    const minecart = new FakeMinecartRuntime();
    const context = createMountContext({ width: 1174, height: 2000 });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createBgBarRuntime: () => bgBar.asRuntime(),
      createMinecartInteractionRuntime: () => minecart.asRuntime(),
    });

    await adapter.mount(context);

    expect(fakeApp.initOptions).toEqual({
      width: 1174,
      height: 2000,
      antialias: true,
      autoDensity: false,
      resolution: 1,
    });
    expect([...context.gameLayer.children]).toEqual([fakeApp.canvas]);
    expect(fakeApp.stage.children).toHaveLength(1);
    expect(fakeApp.resizeCalls).toEqual([[1174, 2000]]);
    expect(runtime.layoutCalls.at(-1)).toMatchObject({
      x: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.x,
      y: GAME003_SKIN1_PORTRAIT_SCENE_PARTS.reelArea.y,
    });
    expect(bgBar.layoutCalls.at(-1)).toMatchObject({
      orientation: "portrait",
      movement: "right",
    });
    expect(minecart.layoutCalls.at(-1)).toMatchObject({
      orientation: "portrait",
    });

    adapter.applyInitialState?.({ userInfo: {}, balance: 100 });
    expect(runtime.appliedScenes).toEqual([]);
    adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: GAME003_DEFAULT_SCENE,
    });
    expect(runtime.appliedScenes).toEqual([GAME003_DEFAULT_SCENE]);

    context.emitViewport({ width: 1600, height: 1000 });
    expect(fakeApp.resizeCalls.at(-1)).toEqual([1600, 1000]);
    expect(runtime.layoutCalls.at(-1)).toMatchObject({
      x: GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.reelArea.x,
      y: GAME003_SKIN1_LANDSCAPE_SCENE_PARTS.reelArea.y,
    });
    expect(bgBar.layoutCalls.at(-1)).toMatchObject({
      orientation: "landscape",
      movement: "down",
    });
    expect(minecart.layoutCalls.at(-1)).toMatchObject({
      orientation: "landscape",
    });
    expect(fakeWinAmountPlayers.at(-1)?.layoutCalls).toHaveLength(2);
    expect(fakeApp.stage.children).toHaveLength(1);
  });

  it("default loaders validate static texture sizes and load symbol state textures", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const loadSpy = vi
      .spyOn(Assets, "load")
      .mockImplementation(async (url: unknown) => {
        return createTextureForUrl(String(url)) as never;
      });
    const adapter = createGame003Adapter({
      skin: getGame003SkinConfig("1"),
      createApplication: () => fakeApp.app,
      createRuntime: () => runtime.asRuntime(),
    });

    await adapter.mount(createMountContext());

    expect(loadSpy.mock.calls.length).toBeGreaterThanOrEqual(47);
    expect(runtime.layoutCalls).toHaveLength(2);
    loadSpy.mockRestore();
  });

  it("default static loader fails when a scene texture size drifts", async () => {
    const fakeApp = createFakeApplication();
    const loadSpy = vi
      .spyOn(Assets, "load")
      .mockImplementation(async (url: unknown) => {
        if (String(url).includes("bg2")) {
          return createSizedTexture(100, 100) as never;
        }
        return createTextureForUrl(String(url)) as never;
      });
    const adapter = createGame003Adapter({
      skin: getGame003SkinConfig("1"),
      createApplication: () => fakeApp.app,
      createRuntime: () => new FakeRuntime().asRuntime(),
    });

    await expect(adapter.mount(createMountContext())).rejects.toThrow(
      /bg2\.jpg size/,
    );
    loadSpy.mockRestore();
  });

  it("resolves playSpin only after runtime completion and caps large ticker deltas", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(createLogic(GAME003_SPIN_SCENE)),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.spinTargets).toEqual([GAME003_SPIN_SCENE]);

    fakeApp.tick(5_000);
    await Promise.resolve();
    expect(runtime.updateDeltas[0]).toBeCloseTo(1 / 30);
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
    expect(runtime.currentScene).toEqual(GAME003_SPIN_SCENE);
  });

  it("shows CO coin overlay after reel stop and clears it before the next spin", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const coinOverlay = new FakeCoinOverlayRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createCoinOverlayRuntime: () => coinOverlay.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const firstSpin = Promise.resolve(adapter.playSpin(createCoinLogic()));
    expect(coinOverlay.clearCount).toBe(1);
    expect(coinOverlay.shows).toEqual([]);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await firstSpin;
    expect(coinOverlay.shows).toEqual([
      [
        { x: 1, y: 1, amount: 2, text: "2" },
        { x: 1, y: 2, amount: 1, text: "1" },
        { x: 1, y: 3, amount: 150, text: "150" },
      ],
    ]);

    const secondSpin = Promise.resolve(
      adapter.playSpin(createLogic(GAME003_SPIN_SCENE)),
    );
    expect(coinOverlay.clearCount).toBe(2);
    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await secondSpin;
    expect(coinOverlay.shows.at(-1)).toEqual([]);
  });

  it("clears CO coin overlay when applying initial state", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const coinOverlay = new FakeCoinOverlayRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createCoinOverlayRuntime: () => coinOverlay.asRuntime(),
    });
    await adapter.mount(createMountContext());

    adapter.applyInitialState?.({
      userInfo: {},
      balance: 100,
      defaultScene: GAME003_DEFAULT_SCENE,
    });

    expect(coinOverlay.clearCount).toBe(1);
    expect(runtime.appliedScenes).toEqual([GAME003_DEFAULT_SCENE]);
  });

  it("fails CO overlay protocol errors before starting the reels", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const coinOverlay = new FakeCoinOverlayRuntime();
    const invalidResult = cloneCoinSpinResult();
    invalidResult.gmi.replyPlay.results[0].clientData.otherScenes[0].values[1].values[1] = 0;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createCoinOverlayRuntime: () => coinOverlay.asRuntime(),
    });
    await adapter.mount(createMountContext());

    expect(() => adapter.playSpin(createCoinLogic(invalidResult))).toThrow(
      /positive coin amount/,
    );
    expect(runtime.spinTargets).toEqual([]);
    expect(coinOverlay.clearCount).toBe(1);
  });

  it("skips minecart when terminal bg-bar feature is normal", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const bgBar = new FakeBgBarRuntime();
    const minecart = new FakeMinecartRuntime({
      completeOnFirstUpdate: false,
    });
    bgBar.completeNextUpdate = false;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createBgBarRuntime: () => bgBar.asRuntime(),
      createMinecartInteractionRuntime: () => minecart.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(adapter.playSpin(createBgBarLogic()));
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(bgBar.startPlans).toHaveLength(1);
    expect(bgBar.startPlans[0]?.features).toEqual(GAME003_BG_BAR_FEATURES);
    expect(bgBar.playing).toBe(true);
    expect(minecart.resetCount).toBe(0);
    expect(minecart.exitRequests).toEqual([false]);
    expect(minecart.startFeatures).toEqual([]);
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);

    bgBar.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(minecart.startFeatures).toEqual([]);
    expect(resolved).toBe(true);
  });

  it("moves a parked minecart out on the next spin and waits for exit completion", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const bgBar = new FakeBgBarRuntime();
    const minecart = new FakeMinecartRuntime({
      completeOnFirstUpdate: false,
      initialPhase: "parked",
    });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createBgBarRuntime: () => bgBar.asRuntime(),
      createMinecartInteractionRuntime: () => minecart.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(adapter.playSpin(createBgBarLogic()));
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(minecart.exitRequests).toEqual([true]);
    expect(minecart.phase).toBe("cart-exit");

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(minecart.phase).toBe("cart-exit");

    minecart.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
    expect(minecart.phase).toBe("idle");
    expect(minecart.startFeatures).toEqual([]);
  });

  it("fails if a new terminal minecart feature arrives before the parked cart exits", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const bgBar = new FakeBgBarRuntime();
    const minecart = new FakeMinecartRuntime({
      completeOnFirstUpdate: false,
      initialPhase: "parked",
    });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createBgBarRuntime: () => bgBar.asRuntime(),
      createMinecartInteractionRuntime: () => minecart.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = adapter.playSpin(
      createBgBarLogicWithFeatures(["wild", "normal", "wild", "wild", "up"]),
    );

    fakeApp.tick(16);
    await expect(spinPromise).rejects.toThrow(/exit must complete/);
  });

  it("starts minecart after terminal win when terminal bg-bar feature is not normal", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const bgBar = new FakeBgBarRuntime();
    const minecart = new FakeMinecartRuntime({
      completeOnFirstUpdate: false,
    });
    const features = ["wild", "normal", "wild", "wild", "up"] as const;
    bgBar.completeNextUpdate = false;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createBgBarRuntime: () => bgBar.asRuntime(),
      createMinecartInteractionRuntime: () => minecart.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(createBgBarLogicWithFeatures(features)),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    await Promise.resolve();
    expect(bgBar.startPlans).toHaveLength(1);
    expect(bgBar.startPlans[0]?.features).toEqual(features);
    expect(minecart.startFeatures).toEqual([]);
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);

    bgBar.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(minecart.startFeatures).toEqual(["wild"]);
    expect(resolved).toBe(false);

    minecart.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
  });

  it("does not resolve when minecart completes before the main reels stop", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const bgBar = new FakeBgBarRuntime();
    const minecart = new FakeMinecartRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createBgBarRuntime: () => bgBar.asRuntime(),
      createMinecartInteractionRuntime: () => minecart.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(
        createBgBarLogicWithFeatures(["wild", "normal", "wild", "wild", "up"]),
      ),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    fakeApp.tick(16);
    await Promise.resolve();
    expect(minecart.startFeatures).toEqual(["wild"]);
    expect(minecart.phase).toBe("parked");
    expect(resolved).toBe(false);

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
  });

  it("plays bg-wins groups in order before resolving playSpin", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(adapter.playSpin(createWinLogic()));
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.spinTargets).toEqual([GAME003_WIN_SPIN_SCENE]);
    expect(runtime.winRequests).toEqual([
      {
        state: "win",
        positions: [
          { x: 0, y: 4 },
          { x: 1, y: 2 },
          { x: 2, y: 0 },
        ],
      },
    ]);
    expect(() => adapter.playSpin(createLogic(GAME003_SPIN_SCENE))).toThrow(
      /already in progress/,
    );

    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.winRequests).toHaveLength(2);
    expect(runtime.winRequests[1]).toEqual({
      state: "win",
      positions: [
        { x: 0, y: 2 },
        { x: 1, y: 3 },
        { x: 2, y: 4 },
      ],
    });

    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
  });

  it("resolves after amount animation reaches awaiting-dismiss without requiring a click", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const winAmount = new FakeWinAmountPlayer({ completeOnFirstUpdate: false });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(
        createLogic(GAME003_SPIN_SCENE, {
          betAmountRaw: 10,
          lines: 10,
          winAmountRaw: 25,
        }),
      ),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(winAmount.starts).toEqual([{ betAmountRaw: 100, winAmountRaw: 25 }]);
    expect(winAmount.updateDeltas).toEqual([]);

    winAmount.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
    expect(winAmount.phase).toBe("awaiting-dismiss");
  });

  it("keeps ticking an awaiting win amount after resolve and dismisses it on the next spin", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const winAmount = new FakeWinAmountPlayer({ completeOnFirstUpdate: true });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    await adapter.mount(createMountContext());

    const firstSpin = Promise.resolve(
      adapter.playSpin(
        createLogic(GAME003_SPIN_SCENE, {
          betAmountRaw: 10,
          lines: 10,
          winAmountRaw: 25,
        }),
      ),
    );
    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    fakeApp.tick(16);
    await firstSpin;
    expect(winAmount.phase).toBe("awaiting-dismiss");
    const updateCountAfterResolve = winAmount.updateDeltas.length;

    fakeApp.tick(16);
    expect(winAmount.updateDeltas).toHaveLength(updateCountAfterResolve + 1);
    expect(winAmount.phase).toBe("awaiting-dismiss");

    const secondSpin = Promise.resolve(
      adapter.playSpin(createLogic(GAME003_SPIN_SCENE)),
    );
    expect(winAmount.immediateDismissRequests).toBe(2);
    expect(winAmount.phase).toBe("complete");

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await secondSpin;
  });

  it("waits for both symbol win sequence and amount animation", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const winAmount = new FakeWinAmountPlayer({ completeOnFirstUpdate: false });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(adapter.playSpin(createWinLogic()));
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    fakeApp.tick(16);
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.winRequests).toHaveLength(2);
    expect(winAmount.starts[0]).toMatchObject({
      betAmountRaw: 50,
      winAmountRaw: GAME003_SAMPLE_WIN_SPIN_RESULT.totalwin,
    });

    for (let index = 0; index < 31; index += 1) {
      fakeApp.tick(33);
    }
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(runtime.winRequests.length).toBeGreaterThan(2);
    expect(runtime.winRequests.at(-1)).toEqual({
      state: "win",
      positions: [
        { x: 0, y: 4 },
        { x: 1, y: 2 },
        { x: 2, y: 0 },
      ],
    });

    winAmount.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
  });

  it("waits for bg-bar, bg-wins groups and amount animation together", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const bgBar = new FakeBgBarRuntime();
    const winAmount = new FakeWinAmountPlayer({ completeOnFirstUpdate: false });
    bgBar.completeNextUpdate = false;
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createBgBarRuntime: () => bgBar.asRuntime(),
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(createBgBarWinLogic()),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    fakeApp.tick(16);
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);
    expect(bgBar.startPlans).toHaveLength(1);
    expect(bgBar.updateDeltas.length).toBeGreaterThanOrEqual(3);
    expect(runtime.winRequests).toHaveLength(2);
    expect(winAmount.starts).toHaveLength(1);

    winAmount.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);

    bgBar.completeNextUpdate = true;
    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
  });

  it("forwards canvas clicks to advance the current win amount animation", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const winAmount = new FakeWinAmountPlayer({ completeOnFirstUpdate: false });
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
      createWinAmountPlayer: () => winAmount.asPlayer(),
    });
    await adapter.mount(createMountContext());

    const spinPromise = Promise.resolve(
      adapter.playSpin(
        createLogic(GAME003_SPIN_SCENE, {
          betAmountRaw: 10,
          lines: 10,
          winAmountRaw: 250,
        }),
      ),
    );
    let resolved = false;
    void spinPromise.then(() => {
      resolved = true;
    });

    runtime.completeNextUpdate = true;
    fakeApp.tick(16);
    await Promise.resolve();
    expect(resolved).toBe(false);

    fakeApp.canvas.dispatchEvent(new Event("pointerdown"));
    expect(winAmount.advanceRequests).toBe(1);
    expect(winAmount.phase).toBe("awaiting-dismiss");
    expect(resolved).toBe(false);

    fakeApp.tick(16);
    await spinPromise;
    expect(resolved).toBe(true);
  });

  it("rejects playSpin errors, visual mismatches, and destroy removes listeners", async () => {
    const fakeApp = createFakeApplication();
    const runtime = new FakeRuntime();
    const context = createMountContext();
    const adapter = createTestAdapter({
      createApplication: () => fakeApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => runtime.asRuntime(),
    });
    await adapter.mount(context);

    const first = adapter.playSpin(createLogic(GAME003_SPIN_SCENE));
    expect(() => adapter.playSpin(createLogic(GAME003_SPIN_SCENE))).toThrow(
      /already in progress/,
    );
    runtime.updateError = new Error("runtime exploded");
    fakeApp.tick(16);
    await expect(first).rejects.toThrow(/runtime exploded/);
    expect(fakeApp.stopped).toBe(true);

    const mismatchRuntime = new FakeRuntime();
    mismatchRuntime.forceVisualScene = GAME003_DEFAULT_SCENE;
    const mismatchApp = createFakeApplication();
    const mismatchAdapter = createTestAdapter({
      createApplication: () => mismatchApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => mismatchRuntime.asRuntime(),
    });
    await mismatchAdapter.mount(createMountContext());
    const pending = mismatchAdapter.playSpin(createLogic(GAME003_SPIN_SCENE));
    mismatchRuntime.completeNextUpdate = true;
    mismatchApp.tick(16);
    await expect(pending).rejects.toThrow(/does not match/);

    const destroyRuntime = new FakeRuntime();
    const destroyBgBar = new FakeBgBarRuntime();
    const destroyMinecart = new FakeMinecartRuntime();
    const destroyApp = createFakeApplication();
    const destroyContext = createMountContext();
    const destroyAdapter = createTestAdapter({
      createApplication: () => destroyApp.app,
      loadStaticTextures: loadFakeStaticTextures,
      loadSymbolTextures: async () => ({}),
      createRuntime: () => destroyRuntime.asRuntime(),
      createBgBarRuntime: () => destroyBgBar.asRuntime(),
      createMinecartInteractionRuntime: () => destroyMinecart.asRuntime(),
    });
    await destroyAdapter.mount(destroyContext);
    const destroyPending = destroyAdapter.playSpin(
      createLogic(GAME003_SPIN_SCENE),
    );
    destroyAdapter.destroy?.();
    await expect(destroyPending).rejects.toThrow(/destroyed/);
    expect(destroyContext.gameLayer.children).toHaveLength(0);
    const destroyedWinAmount = fakeWinAmountPlayers.at(-1);
    expect(destroyedWinAmount?.destroyed).toBe(true);
    expect(destroyBgBar.destroyed).toBe(true);
    expect(destroyMinecart.destroyed).toBe(true);
    destroyApp.canvas.dispatchEvent(new Event("pointerdown"));
    expect(destroyedWinAmount?.advanceRequests).toBe(0);
    const resizeCount = destroyApp.resizeCalls.length;
    destroyContext.emitViewport({ width: 1600, height: 1000 });
    expect(destroyApp.resizeCalls).toHaveLength(resizeCount);
  });
});

const fakeWinAmountPlayers: FakeWinAmountPlayer[] = [];
const fakeBgBarRuntimes: FakeBgBarRuntime[] = [];
const fakeMinecartRuntimes: FakeMinecartRuntime[] = [];

function createTestAdapter(options: Omit<Game003AdapterOptions, "skin">) {
  return createGame003Adapter({
    skin: getGame003SkinConfig("1"),
    loadBgBarSymbolTextures:
      options.loadBgBarSymbolTextures ?? (async () => ({})),
    createBgBarRuntime:
      options.createBgBarRuntime ??
      (() => {
        const runtime = new FakeBgBarRuntime();
        fakeBgBarRuntimes.push(runtime);
        return runtime.asRuntime();
      }),
    createMinecartInteractionRuntime:
      options.createMinecartInteractionRuntime ??
      (() => {
        const runtime = new FakeMinecartRuntime();
        fakeMinecartRuntimes.push(runtime);
        return runtime.asRuntime();
      }),
    createWinAmountPlayer:
      options.createWinAmountPlayer ??
      (() => {
        const player = new FakeWinAmountPlayer();
        fakeWinAmountPlayers.push(player);
        return player.asPlayer();
      }),
    ...options,
  });
}

function createMountContext(
  initialFrameDesignSize: {
    readonly width: number;
    readonly height: number;
  } = {
    width: 1174,
    height: 2000,
  },
) {
  const frame = document.createElement("div");
  const gameLayer = document.createElement("div");
  const overlay = document.createElement("div");
  type TestViewportSnapshot = ReturnType<typeof createViewportSnapshot>;
  let viewport: TestViewportSnapshot = createViewportSnapshot(
    initialFrameDesignSize,
  );
  const viewportListeners = new Set<(next: TestViewportSnapshot) => void>();
  return {
    frame,
    gameLayer,
    overlay,
    getState: () => ({
      connected: false,
      spinState: "connecting" as const,
      balance: null,
      win: 0,
      betIndex: 0,
      betOption: { bet: 5, lines: 10, times: 1 },
      muted: false,
      fastMode: false,
      autoMode: false,
      error: null,
    }),
    getViewport: () => viewport,
    onViewportChange: (listener: (next: TestViewportSnapshot) => void) => {
      viewportListeners.add(listener);
      return () => {
        viewportListeners.delete(listener);
      };
    },
    emitViewport: (frameDesignSize: {
      readonly width: number;
      readonly height: number;
    }) => {
      viewport = createViewportSnapshot(frameDesignSize);
      for (const listener of viewportListeners) {
        listener(viewport);
      }
    },
  };
}

function createFakeApplication() {
  const listeners = new Set<(ticker: { readonly deltaMS: number }) => void>();
  const canvas = document.createElement("canvas");
  const stage = new Container();
  const state: {
    stopped: boolean;
    destroyed: boolean;
    initOptions: unknown;
    resizeCalls: number[][];
  } = {
    stopped: false,
    destroyed: false,
    initOptions: null,
    resizeCalls: [],
  };
  const app = {
    canvas,
    stage,
    renderer: {
      resize(width: number, height: number) {
        state.resizeCalls.push([width, height]);
      },
    },
    ticker: {
      add(listener: (ticker: { readonly deltaMS: number }) => void) {
        listeners.add(listener);
      },
      remove(listener: (ticker: { readonly deltaMS: number }) => void) {
        listeners.delete(listener);
      },
      stop() {
        state.stopped = true;
      },
    },
    async init(options: unknown) {
      state.initOptions = options;
      return undefined;
    },
    destroy() {
      state.destroyed = true;
      return undefined;
    },
  };

  return {
    app,
    canvas,
    stage,
    get stopped() {
      return state.stopped;
    },
    get destroyed() {
      return state.destroyed;
    },
    get initOptions() {
      return state.initOptions;
    },
    get resizeCalls() {
      return state.resizeCalls;
    },
    tick(deltaMS: number) {
      for (const listener of listeners) {
        listener({ deltaMS });
      }
    },
  };
}

function createViewportSnapshot(frameDesignSize: {
  readonly width: number;
  readonly height: number;
}) {
  return {
    pageSize: frameDesignSize,
    frameDesignSize,
    scale: 1,
    cssSize: frameDesignSize,
    offsetX: 0,
    offsetY: 0,
  };
}

async function loadFakeStaticTextures(): Promise<Game003StaticTextures> {
  return {
    landscapeBackground: Texture.EMPTY,
    portraitBackground: Texture.EMPTY,
    mainReelBackground: Texture.EMPTY,
    landscapeConveyor: Texture.EMPTY,
    portraitConveyor: Texture.EMPTY,
    minecart: createSizedTexture(369, 252),
  };
}

function createTextureForUrl(url: string): Texture {
  if (url.includes("bg1")) {
    return createSizedTexture(2000, 2000);
  }
  if (url.includes("bg2")) {
    return createSizedTexture(1174, 2000);
  }
  if (url.includes("mainreelbg")) {
    return createSizedTexture(1130, 824);
  }
  if (url.includes("conveyor1")) {
    return createSizedTexture(284, 775);
  }
  if (url.includes("conveyor2")) {
    return createSizedTexture(934, 227);
  }
  if (/minecart(?:-[A-Za-z0-9_-]+)?\.png(?:$|\?)/.test(url)) {
    return createSizedTexture(369, 252);
  }
  if (url.includes("wild")) {
    return createSizedTexture(172, 158);
  }
  if (url.includes("up")) {
    return createSizedTexture(172, 130);
  }
  return createSizedTexture(172, 130);
}

function createSizedTexture(width: number, height: number): Texture {
  const texture = new Texture({ source: Texture.WHITE.source });
  Object.defineProperty(texture, "width", {
    configurable: true,
    value: width,
  });
  Object.defineProperty(texture, "height", {
    configurable: true,
    value: height,
  });
  return texture;
}

function createLogic(
  scene: SceneMatrix,
  amounts: {
    readonly betAmountRaw?: number;
    readonly lines?: number;
    readonly winAmountRaw?: number;
  } = {},
): GameLogic {
  const step = {
    getScene: () => scene,
    hasComponent: () => false,
    getComponent: () => undefined,
  };
  return {
    getStep: () => step,
    getBet: () => amounts.betAmountRaw ?? 5,
    getLines: () => amounts.lines ?? 10,
    getTotalWin: () => amounts.winAmountRaw ?? 0,
  } as unknown as GameLogic;
}

function createWinLogic(): GameLogic {
  return createSlotGameLogicResult(GAME003_SAMPLE_WIN_SPIN_RESULT, {
    bet: { bet: 5, lines: 10, times: 1 },
    userInfo: { balance: 1000, gameid: 69003 },
  }).logic;
}

function createCoinLogic(
  spinResult: unknown = GAME003_SAMPLE_COIN_SPIN_RESULT,
): GameLogic {
  return createSlotGameLogicResult(spinResult, {
    bet: { bet: 5, lines: 10, times: 1 },
    userInfo: { balance: 1000, gameid: 69003 },
  }).logic;
}

function createBgBarLogic(): GameLogic {
  return createSlotGameLogicResult(GAME003_SAMPLE_BG_BAR_SPIN_RESULT, {
    bet: { bet: 5, lines: 10, times: 1 },
    userInfo: { balance: 1000, gameid: 69003 },
  }).logic;
}

function createBgBarLogicWithFeatures(
  features: Game003BgBarSpinPlan["features"],
): GameLogic {
  const component = {
    hasBasicComponentData: true,
    raw: Object.freeze({
      "@type": "type.googleapis.com/sgc7pb.FeatureBar2Data",
      features,
      usedFeatures: Object.freeze([]),
      cacheFeatures: Object.freeze([]),
      curFeature: "normal",
      basicComponentData: Object.freeze({
        usedScenes: Object.freeze([]),
        usedOtherScenes: Object.freeze([]),
        usedResults: Object.freeze([]),
        usedPrizeScenes: Object.freeze([]),
        srcScenes: Object.freeze([]),
        pos: Object.freeze([]),
        mapUsedSPGrid: Object.freeze({}),
        coinWin: 0,
        cashWin: 0,
        targetScene: 0,
        runIndex: 0,
        output: 0,
        strOutput: "",
      }),
    }),
  };
  const step = {
    getScene: () => GAME003_SPIN_SCENE,
    hasComponent: (name: string) => name === "bg-bar",
    getComponent: (name: string) => (name === "bg-bar" ? component : null),
  };
  return {
    getStep: () => step,
    getBet: () => 5,
    getLines: () => 10,
    getTotalWin: () => 0,
  } as unknown as GameLogic;
}

function createBgBarWinLogic(): GameLogic {
  return createSlotGameLogicResult(GAME003_SAMPLE_BG_BAR_WIN_SPIN_RESULT, {
    bet: { bet: 5, lines: 10, times: 1 },
    userInfo: { balance: 1000, gameid: 69003 },
  }).logic;
}

function cloneCoinSpinResult(): any {
  return JSON.parse(JSON.stringify(GAME003_SAMPLE_COIN_SPIN_RESULT));
}

class FakeRuntime {
  readonly mainReelsLayer = new Container();
  readonly appliedScenes: SceneMatrix[] = [];
  readonly spinTargets: SceneMatrix[] = [];
  readonly layoutCalls: unknown[] = [];
  currentScene: SceneMatrix | null = null;
  targetScene: SceneMatrix | null = null;
  completeNextUpdate = false;
  updateError: Error | null = null;
  spinning = false;
  forceVisualScene: SceneMatrix | null = null;
  readonly updateDeltas: number[] = [];
  readonly winRequests: Array<{
    readonly positions: readonly { readonly x: number; readonly y: number }[];
    readonly state: string;
  }> = [];
  activeWinPositions: readonly { readonly x: number; readonly y: number }[] =
    [];
  activeWinState: string | null = null;
  winUpdateCount = 0;

  asRuntime(): Game003ReelRuntime {
    const fake = this;
    return {
      mainReelsLayer: this.mainReelsLayer,
      applyScene: (scene: SceneMatrix) => {
        this.appliedScenes.push(scene);
        this.currentScene = scene;
        this.mainReelsLayer.visible = true;
        return [0, 0, 0, 0, 0];
      },
      spinToScene: (scene: SceneMatrix) => {
        if (this.spinning) {
          throw new Error("game003 reels are already spinning.");
        }
        this.spinTargets.push(scene);
        this.targetScene = scene;
        this.spinning = true;
        return {} as any;
      },
      update: (deltaSeconds: number) => {
        this.updateDeltas.push(deltaSeconds);
        if (this.updateError) {
          throw this.updateError;
        }
        if (!this.spinning && this.activeWinState) {
          this.winUpdateCount += 1;
          if (this.winUpdateCount >= 1) {
            this.activeWinState = null;
            this.activeWinPositions = [];
          }
          return {
            completed: false,
            spinning: false,
            startedAxes: [],
            stoppedAxes: [],
          };
        }
        if (!this.completeNextUpdate || !this.targetScene) {
          return {
            completed: false,
            spinning: true,
            startedAxes: [0],
            stoppedAxes: [],
          };
        }
        this.currentScene = this.targetScene;
        this.targetScene = null;
        this.spinning = false;
        this.mainReelsLayer.visible = true;
        return {
          completed: true,
          spinning: false,
          startedAxes: [0, 1, 2, 3, 4],
          stoppedAxes: [0, 1, 2, 3, 4],
        };
      },
      isSpinning: () => this.spinning,
      requestVisibleSymbolStates: (
        positions: readonly { readonly x: number; readonly y: number }[],
        state: string,
      ) => {
        this.winRequests.push({
          positions: positions.map((position) => ({ ...position })),
          state,
        });
        this.activeWinPositions = positions;
        this.activeWinState = state;
        this.winUpdateCount = 0;
      },
      getVisibleSymbolStateSnapshots: (
        positions: readonly { readonly x: number; readonly y: number }[],
      ) =>
        positions.map((position) => {
          const isActive = this.activeWinPositions.some(
            (active) => active.x === position.x && active.y === position.y,
          );
          const requestedState = isActive
            ? (this.activeWinState ?? "normal")
            : "normal";
          return {
            x: position.x,
            y: position.y,
            code: 1,
            kind: "textured" as const,
            requestedState,
            resolvedState: requestedState,
            isOnce: requestedState === "win",
          };
        }),
      getVisibleSymbolGeometrySnapshots: (
        positions: readonly { readonly x: number; readonly y: number }[],
      ) =>
        positions.map((position) => ({
          x: position.x,
          y: position.y,
          code: 1,
          kind: "textured" as const,
          centerX: position.x * 100 + 50,
          centerY: position.y * 100 + 50,
          cellWidth: 100,
          cellHeight: 100,
        })),
      getVisualSnapshot: () => {
        const scene = this.forceVisualScene ?? this.currentScene;
        if (!scene) {
          throw new Error("fake runtime has no current scene.");
        }
        return {
          visible: true,
          spinning: this.spinning,
          visibleScene: scene,
          requestedStates: [
            ["normal"],
            ["normal"],
            ["normal"],
            ["normal"],
            ["normal"],
          ],
          reelCount: 5,
          layerX: 0,
          layerY: 0,
        };
      },
      applyLayout: (layout: unknown) => {
        this.layoutCalls.push(layout);
      },
      config: {} as any,
      gameConfig: {
        getSymbolCode: (symbol: string) => (symbol === "CO" ? 11 : undefined),
      } as any,
      layout: createGame003ReelLayout(),
      get layerLayout(): any {
        return (
          (fake.layoutCalls.at(-1) as {
            readonly x: number;
            readonly y: number;
          }) ?? { x: 0, y: 0 }
        );
      },
      getCurrentScene: () => this.currentScene,
      getTargetScene: () => this.targetScene,
      getFinalYs: () => [0, 0, 0, 0, 0],
      createSpinPlan: () => ({}) as any,
    };
  }
}

class FakeBgBarRuntime {
  readonly container = new Container();
  readonly startPlans: Game003BgBarSpinPlan[] = [];
  readonly updateDeltas: number[] = [];
  readonly layoutCalls: Game003BgBarLayout[] = [];
  completeNextUpdate = true;
  playing = false;
  destroyed = false;
  terminalEventEmitted = false;

  asRuntime(): Game003BgBarRuntime {
    return {
      container: this.container,
      applyLayout: (layout) => {
        this.layoutCalls.push(layout);
      },
      reset: () => {
        this.playing = false;
      },
      startSpin: (plan) => {
        if (this.playing) {
          throw new Error("fake bg-bar already playing.");
        }
        this.startPlans.push(plan);
        this.playing = true;
        this.terminalEventEmitted = false;
      },
      update: (deltaSeconds) => {
        this.updateDeltas.push(deltaSeconds);
        if (this.completeNextUpdate) {
          this.playing = false;
          if (!this.terminalEventEmitted) {
            this.terminalEventEmitted = true;
            return {
              completed: true,
              terminalFeatureCompleted:
                this.startPlans.at(-1)?.features[0] ?? "normal",
            };
          }
        }
        return { completed: !this.playing };
      },
      isPlaying: () => this.playing,
      getSnapshot: (): Game003BgBarRuntimeSnapshot => ({
        phase: this.playing ? "shifting" : "idle",
        idleQueue: null,
        items: [],
      }),
      destroy: () => {
        this.destroyed = true;
        this.playing = false;
      },
    };
  }
}

class FakeMinecartRuntime {
  readonly container = new Container();
  readonly startFeatures: Game003BgBarFeature[] = [];
  readonly exitRequests: boolean[] = [];
  readonly updateDeltas: number[] = [];
  readonly layoutCalls: Game003MinecartInteractionLayout[] = [];
  completeNextUpdate: boolean;
  resetCount = 0;
  phase:
    | "idle"
    | "cart-rush"
    | "symbol-fly"
    | "symbol-hold"
    | "parked"
    | "cart-exit"
    | "destroyed";
  destroyed = false;

  constructor(
    options: {
      readonly completeOnFirstUpdate?: boolean;
      readonly initialPhase?:
        | "idle"
        | "cart-rush"
        | "symbol-fly"
        | "symbol-hold"
        | "parked"
        | "cart-exit";
    } = {
      completeOnFirstUpdate: true,
      initialPhase: "idle",
    },
  ) {
    this.completeNextUpdate = options.completeOnFirstUpdate ?? true;
    this.phase = options.initialPhase ?? "idle";
  }

  asRuntime(): Game003MinecartInteractionRuntime {
    return {
      container: this.container,
      applyLayout: (layout) => {
        this.layoutCalls.push(layout);
      },
      reset: () => {
        this.resetCount += 1;
        this.phase = "idle";
      },
      start: (feature) => {
        if (feature === "normal") {
          throw new Error("fake minecart should not play normal.");
        }
        if (this.phase !== "idle") {
          throw new Error(`fake minecart cannot start from ${this.phase}.`);
        }
        this.startFeatures.push(feature);
        this.phase = "cart-rush";
      },
      startExitIfParked: () => {
        const started = this.phase === "parked";
        this.exitRequests.push(started);
        if (
          this.phase === "cart-rush" ||
          this.phase === "symbol-fly" ||
          this.phase === "symbol-hold" ||
          this.phase === "cart-exit"
        ) {
          throw new Error(`fake minecart cannot exit from ${this.phase}.`);
        }
        if (started) {
          this.phase = "cart-exit";
        }
        return started;
      },
      clearParkedCart: () => {
        if (this.phase === "parked") {
          this.phase = "idle";
        }
      },
      update: (deltaSeconds) => {
        this.updateDeltas.push(deltaSeconds);
        if (this.completeNextUpdate) {
          if (this.phase === "cart-exit") {
            this.phase = "idle";
          } else if (
            this.phase === "cart-rush" ||
            this.phase === "symbol-fly" ||
            this.phase === "symbol-hold"
          ) {
            this.phase = "parked";
          }
        }
        return { completed: !this.isPlaying() };
      },
      isPlaying: () => this.isPlaying(),
      getSnapshot: () => ({
        phase: this.phase,
        feature: this.startFeatures.at(-1) ?? null,
        cartPosition: { x: 0, y: 0 },
        cartRotation: 0,
        cartVisible: this.phase !== "idle" && this.phase !== "destroyed",
        payloadPosition: this.isPlaying() ? { x: 0, y: 0 } : null,
        payloadScale: this.isPlaying() ? { x: 1, y: 1 } : null,
        payloadAlpha: this.isPlaying() ? 1 : null,
        payloadVisible: this.isPlaying(),
      }),
      destroy: () => {
        this.destroyed = true;
        this.phase = "destroyed";
      },
    };
  }

  isPlaying(): boolean {
    return (
      this.phase === "cart-rush" ||
      this.phase === "symbol-fly" ||
      this.phase === "symbol-hold" ||
      this.phase === "cart-exit"
    );
  }
}

class FakeCoinOverlayRuntime {
  readonly container = new Container();
  readonly shows: {
    readonly x: number;
    readonly y: number;
    readonly amount: number;
    readonly text: string;
  }[][] = [];
  clearCount = 0;
  refreshCount = 0;
  destroyed = false;

  asRuntime(): Game003CoinOverlayRuntime {
    return {
      container: this.container,
      show: (items) => {
        this.shows.push(items.map((item) => ({ ...item })));
      },
      clear: () => {
        this.clearCount += 1;
      },
      refresh: () => {
        this.refreshCount += 1;
      },
      getSnapshot: () => ({
        phase: "idle",
        items: [],
        texts: [],
      }),
      destroy: () => {
        this.destroyed = true;
      },
    };
  }
}

class FakeWinAmountPlayer {
  readonly container = new Container();
  readonly starts: Array<{
    readonly betAmountRaw: number;
    readonly winAmountRaw: number;
  }> = [];
  readonly updateDeltas: number[] = [];
  readonly layoutCalls: unknown[] = [];
  advanceRequests = 0;
  dismissRequests = 0;
  immediateDismissRequests = 0;
  phase:
    | "idle"
    | "minor-counting"
    | "major-counting"
    | "tier-counting"
    | "awaiting-dismiss"
    | "dismissing"
    | "complete" = "idle";
  destroyed = false;
  completeNextUpdate: boolean;

  constructor(
    options: { readonly completeOnFirstUpdate?: boolean } = {
      completeOnFirstUpdate: true,
    },
  ) {
    this.completeNextUpdate = options.completeOnFirstUpdate ?? true;
  }

  asPlayer(): WinAmountAnimationPlayer {
    return {
      container: this.container,
      start: (input) => {
        this.starts.push(input);
        this.phase = input.winAmountRaw > 0 ? "major-counting" : "complete";
      },
      update: (deltaSeconds) => {
        this.updateDeltas.push(deltaSeconds);
        if (this.completeNextUpdate && this.phase === "major-counting") {
          this.phase = "awaiting-dismiss";
        }
        return {
          completed: this.phase === "idle" || this.phase === "complete",
          phase: this.phase,
          displayedAmountRaw: this.starts.at(-1)?.winAmountRaw ?? 0,
        };
      },
      applyLayout: (layout) => {
        this.layoutCalls.push(layout);
      },
      requestAdvance: () => {
        this.advanceRequests += 1;
        if (
          this.phase === "minor-counting" ||
          this.phase === "major-counting" ||
          this.phase === "tier-counting"
        ) {
          this.phase = "awaiting-dismiss";
        }
      },
      requestDismiss: () => {
        this.dismissRequests += 1;
        this.phase = "complete";
      },
      dismissImmediately: () => {
        this.immediateDismissRequests += 1;
        this.phase = "complete";
      },
      isPlaying: () => this.phase !== "idle" && this.phase !== "complete",
      destroy: () => {
        this.destroyed = true;
        this.phase = "complete";
      },
    };
  }
}
