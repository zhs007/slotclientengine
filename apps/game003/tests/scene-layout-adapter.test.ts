import { Container } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import { createGame003Adapter } from "../src/game-adapter.js";

describe("game003 skin 2 presentation capabilities", () => {
  it("mounts the package presentation without legacy assets, bg-bar or minecart", async () => {
    const canvas = document.createElement("canvas");
    const ticker = {
      add: vi.fn(),
      remove: vi.fn(),
      stop: vi.fn(),
    };
    const app = {
      canvas,
      stage: new Container(),
      renderer: { resize: vi.fn() },
      ticker,
      init: vi.fn(async () => undefined),
      destroy: vi.fn(),
    };
    const reelContainer = new Container();
    const reelRuntime = {
      mainReelsLayer: reelContainer,
    };
    const packageContainer = new Container();
    const applyViewport = vi.fn();
    const destroyPresentation = vi.fn();
    const winAmountPlayer = {
      container: new Container(),
      start: vi.fn(),
      update: vi.fn(),
      requestAdvance: vi.fn(),
      requestDismiss: vi.fn(),
      dismissImmediately: vi.fn(),
      applyLayout: vi.fn(),
      isPlaying: vi.fn(() => false),
      destroy: vi.fn(),
    };
    const legacyStaticLoader = vi.fn();
    const legacySymbolLoader = vi.fn();
    const legacyBgBarLoader = vi.fn();
    const legacyRuntimeFactory = vi.fn();
    const legacyBgBarFactory = vi.fn();
    const legacyMinecartFactory = vi.fn();
    const coinOverlay = {
      container: new Container(),
      show: vi.fn(),
      clear: vi.fn(),
      refresh: vi.fn(),
      getSnapshot: vi.fn(),
      destroy: vi.fn(),
    };
    const carousel = {
      container: new Container(),
      firstCycleComplete: false,
      prepare: vi.fn(),
      start: vi.fn(),
      clear: vi.fn(),
      update: vi.fn(),
      getSnapshot: vi.fn(() => ({ phase: "idle" })),
      destroy: vi.fn(),
    };
    const adapter = createGame003Adapter({
      skin: {
        id: "2",
        label: "minecart2",
        presentation: { kind: "scene-layout" },
        winSymbolLoop: {
          componentNames: ["bg-wins"],
          cyclePauseSeconds: 0.2,
          resultAmount: {
            yOffsetRatioFromCellCenter: 0,
            fontSize: 24,
            fill: "#ffffff",
            stroke: "#000000",
            strokeWidth: 1,
          },
        },
        coinOverlay: {},
      } as never,
      createApplication: () => app,
      loadStaticTextures: legacyStaticLoader,
      loadSymbolTextures: legacySymbolLoader,
      loadBgBarSymbolTextures: legacyBgBarLoader,
      createRuntime: legacyRuntimeFactory,
      createBgBarRuntime: legacyBgBarFactory,
      createMinecartInteractionRuntime: legacyMinecartFactory,
      createCoinOverlayRuntime: () => coinOverlay as never,
      createSymbolWinCarousel: () => carousel as never,
      createSceneLayoutPresentation: vi.fn(async () => ({
        reelRuntime,
        packageRuntime: { container: packageContainer },
        winAmountPlayer,
        applyViewport,
        destroy: destroyPresentation,
      })) as never,
    });
    const gameLayer = document.createElement("div");
    await adapter.mount({
      gameLayer,
      getViewport: () => ({
        frameDesignSize: { width: 1174, height: 2000 },
      }),
      onViewportChange: () => () => undefined,
    } as never);

    expect(legacyStaticLoader).not.toHaveBeenCalled();
    expect(legacySymbolLoader).not.toHaveBeenCalled();
    expect(legacyBgBarLoader).not.toHaveBeenCalled();
    expect(legacyRuntimeFactory).not.toHaveBeenCalled();
    expect(legacyBgBarFactory).not.toHaveBeenCalled();
    expect(legacyMinecartFactory).not.toHaveBeenCalled();
    expect(app.stage.children).toContain(packageContainer);
    expect(reelContainer.children).toEqual([
      coinOverlay.container,
      carousel.container,
    ]);
    expect(applyViewport).toHaveBeenCalledWith({ width: 1174, height: 2000 });

    expect(adapter.destroy).toBeDefined();
    adapter.destroy!();
    expect(destroyPresentation).toHaveBeenCalledOnce();
  });
});
