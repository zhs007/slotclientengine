import { Container } from "pixi.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createRuntime: vi.fn(),
}));

vi.mock("@slotclientengine/rendercore", () => ({
  createSceneLayoutPackageRuntime: mocks.createRuntime,
  RenderGridCellReelSet: class {},
}));

import { createGame002SceneRuntime } from "../src/game002-scene-runtime.js";

describe("game002 scene-layout presentation adapter", () => {
  beforeEach(() => {
    mocks.createRuntime.mockReset();
  });

  it("adapts the shared surface and award popup to game002 players", async () => {
    const popup = {
      start: vi.fn(),
      update: vi
        .fn()
        .mockReturnValueOnce({
          phase: "counting",
          displayedAmountRaw: 125,
          activeTierId: "big",
        })
        .mockReturnValueOnce({
          phase: "complete",
          displayedAmountRaw: 250,
        }),
      requestAdvance: vi.fn(),
      requestDismiss: vi.fn(),
      dismissImmediately: vi.fn(),
      isPlaying: vi.fn().mockReturnValue(true),
    };
    const runtime = {
      container: new Container(),
      init: vi.fn().mockResolvedValue(undefined),
      applyArtSpace: vi.fn(),
      update: vi.fn(),
      getGameModeSnapshot: vi.fn().mockReturnValue({ stableMode: "BaseGame" }),
      prepareGameModeTransition: vi.fn().mockResolvedValue(undefined),
      requestGameMode: vi.fn().mockResolvedValue(undefined),
      acknowledgeMainReelSceneCommit: vi.fn(),
      attachMainReelOverlay: vi.fn().mockReturnValue(() => undefined),
      bindPopupInput: vi.fn().mockReturnValue(() => undefined),
      requestPrimaryPopupInteraction: vi
        .fn()
        .mockReturnValue({ handled: false }),
      getAwardCelebrationPopup: vi.fn().mockReturnValue(popup),
      destroy: vi.fn(),
    };
    mocks.createRuntime.mockReturnValue(runtime);
    const resource = { id: "crave-resource" };
    const reel = new Container();

    const players = createGame002SceneRuntime({
      resource: resource as never,
      initialMode: "BaseGame",
      awardCelebrationPopup: "award",
      reel: reel as never,
    });
    expect(mocks.createRuntime).toHaveBeenCalledWith({
      resource,
      createGridCellReel: expect.any(Function),
      hostUpdatesMainReel: true,
    });
    expect(players.backgroundPlayer.container).toBe(runtime.container);
    expect(players.winAmountPlayer.container).toBe(runtime.container);

    await players.backgroundPlayer.init();
    expect(runtime.init).toHaveBeenCalledOnce();
    expect(runtime.applyArtSpace).toHaveBeenCalledOnce();
    players.backgroundPlayer.update(1 / 60);
    expect(runtime.update).toHaveBeenCalledWith(1 / 60);
    expect(players.backgroundPlayer.getMode?.()).toBe("BaseGame");
    await players.backgroundPlayer.prepareModeTransition?.("FreeGame");
    await players.backgroundPlayer.requestMode?.("FreeGame");
    expect(runtime.prepareGameModeTransition).toHaveBeenCalledWith("FreeGame");
    expect(runtime.requestGameMode).toHaveBeenCalledWith("FreeGame");
    players.backgroundPlayer.acknowledgeReelSceneCommit();
    expect(runtime.acknowledgeMainReelSceneCommit).toHaveBeenCalledOnce();
    const inputBinding = {
      canvas: new EventTarget(),
      keyboardTarget: new EventTarget(),
      onError: vi.fn(),
    };
    players.backgroundPlayer.bindPopupInput(inputBinding);
    expect(runtime.bindPopupInput).toHaveBeenCalledWith(inputBinding);
    expect(players.backgroundPlayer.requestPrimaryPopupInteraction()).toEqual({
      handled: false,
    });

    const input = { amountRaw: 250 };
    players.winAmountPlayer.start(input as never);
    expect(popup.start).toHaveBeenCalledWith(input);
    expect(players.winAmountPlayer.update(0.1)).toEqual({
      completed: false,
      phase: "tier-counting",
      displayedAmountRaw: 125,
      activeTierId: "big",
    });
    expect(players.winAmountPlayer.update(0.1)).toEqual({
      completed: true,
      phase: "complete",
      displayedAmountRaw: 250,
    });
    players.winAmountPlayer.requestAdvance();
    players.winAmountPlayer.requestDismiss();
    players.winAmountPlayer.dismissImmediately();
    players.winAmountPlayer.applyLayout({} as never);
    expect(players.winAmountPlayer.isPlaying()).toBe(true);
    players.winAmountPlayer.destroy();
    expect(popup.requestAdvance).toHaveBeenCalledOnce();
    expect(popup.requestDismiss).toHaveBeenCalledOnce();
    expect(popup.dismissImmediately).toHaveBeenCalledOnce();
    expect(runtime.destroy).not.toHaveBeenCalled();

    players.backgroundPlayer.destroy();
    expect(runtime.destroy).toHaveBeenCalledOnce();
    expect(runtime.getAwardCelebrationPopup).toHaveBeenCalledWith("award");
  });
});
