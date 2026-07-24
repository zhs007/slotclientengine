import { Container } from "pixi.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createSurface: vi.fn(),
}));

vi.mock("@slotclientengine/rendercore", () => ({
  createSceneLayoutPresentationSurface: mocks.createSurface,
}));

import { createGame002SceneLayoutPlayers } from "../src/scene-layout-skin.js";

describe("game002 scene-layout skin adapter", () => {
  beforeEach(() => {
    mocks.createSurface.mockReset();
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
    const surface = {
      backgroundContainer: new Container(),
      popupContainer: new Container(),
      init: vi.fn().mockResolvedValue(undefined),
      applyViewport: vi.fn(),
      applyArtSpace: vi.fn(),
      update: vi.fn(),
      getAwardCelebrationPlayer: vi.fn().mockReturnValue(popup),
      destroy: vi.fn(),
    };
    mocks.createSurface.mockReturnValue(surface);
    const resource = { id: "crave-resource" };

    const players = createGame002SceneLayoutPlayers({
      resource: resource as never,
      initialMode: "BaseGame",
      awardCelebrationPopup: "award",
    });
    expect(mocks.createSurface).toHaveBeenCalledWith({
      resource,
      initialMode: "BaseGame",
    });
    expect(players.backgroundPlayer.container).toBe(
      surface.backgroundContainer,
    );
    expect(players.winAmountPlayer.container).toBe(surface.popupContainer);

    await players.backgroundPlayer.init();
    expect(surface.init).toHaveBeenCalledOnce();
    expect(surface.applyArtSpace).toHaveBeenCalledOnce();
    expect(surface.applyViewport).not.toHaveBeenCalled();
    players.backgroundPlayer.update(1 / 60);
    expect(surface.update).toHaveBeenCalledWith(1 / 60);

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
    expect(surface.destroy).not.toHaveBeenCalled();

    players.backgroundPlayer.destroy();
    expect(surface.destroy).toHaveBeenCalledOnce();
    expect(surface.getAwardCelebrationPlayer).toHaveBeenCalledWith("award");
  });
});
