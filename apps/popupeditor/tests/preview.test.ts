import { beforeEach, describe, expect, it, vi } from "vitest";
import { Container } from "pixi.js";

const stage = new Container();
const canvas = document.createElement("canvas");
const ticker = { add: vi.fn() };
vi.mock("pixi.js", async (original) => {
  const actual = await original<typeof import("pixi.js")>();
  class Application {
    stage = stage;
    canvas = canvas;
    ticker = ticker;
    screen = { width: 540, height: 720 };
    async init() {}
    destroy() {}
  }
  class Graphics extends actual.Container {
    clear() {
      return this;
    }
    rect() {
      return this;
    }
    stroke() {
      return this;
    }
    moveTo() {
      return this;
    }
    lineTo() {
      return this;
    }
  }
  return { ...actual, Application, Graphics };
});
const player = {
  container: new Container(),
  init: vi.fn(async () => {}),
  isPlaying: vi.fn(() => true),
  update: vi.fn(() => ({
    activeTierId: "base",
    activeSegment: "loop",
    phase: "counting",
    formattedAmount: "$1.00",
    activeLayerCount: 1,
    endingLayerCount: 0,
  })),
  dismissImmediately: vi.fn(),
  start: vi.fn(),
  requestAdvance: vi.fn(),
  requestDismiss: vi.fn(),
  destroy: vi.fn(),
};
const resource = { destroy: vi.fn() };
vi.mock("@slotclientengine/rendercore/popup", () => ({
  createPopupPackageResource: vi.fn(async () => resource),
  createAwardCelebrationPlayer: vi.fn(() => player),
}));
vi.mock("../src/io/popup-zip.js", () => ({
  exportPopupZip: vi.fn(async () => ({ bytes: new Uint8Array([1]) })),
  importPopupZip: vi.fn(() => ({})),
}));
vi.mock("@slotclientengine/browserartifactio", async (original) => ({
  ...(await original<typeof import("@slotclientengine/browserartifactio")>()),
  extractBoundedZip: vi.fn(() => new Map()),
}));

describe("PopupPreview", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="host"></div><div id="status"></div>';
    vi.clearAllMocks();
  });
  it("uses the production player, freezes input on play, updates snapshots and cleans owners", async () => {
    const { PopupPreview } = await import("../src/preview/popup-preview.js");
    const preview = new PopupPreview(
      document.querySelector("#host")!,
      document.querySelector("#status")!,
    );
    await preview.init();
    await preview.rebuild({} as never);
    preview.setInput(100, 5000);
    preview.play();
    preview.advance();
    preview.dismiss();
    preview.dismissImmediately();
    preview.setViewport(1920, 1080, 0.5, false);
    expect(player.start).toHaveBeenCalledWith({
      betAmountRaw: 100,
      winAmountRaw: 5000,
    });
    const callback = ticker.add.mock.calls[0]![0];
    callback({ deltaMS: 16 });
    expect(document.querySelector("#status")!.textContent).toContain("base");
    preview.destroy();
    expect(player.destroy).toHaveBeenCalled();
    expect(resource.destroy).toHaveBeenCalled();
  });
});
