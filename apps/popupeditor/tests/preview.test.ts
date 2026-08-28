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
  applyViewport: vi.fn(() => ({
    viewportSize: { width: 1080, height: 1920 },
    contentScale: 1,
    contentPosition: { x: 540, y: 960 },
  })),
  setTextWidthGuidesVisible: vi.fn(),
  destroy: vi.fn(),
};
const resource = {
  manifest: { type: "award-celebration" },
  destroy: vi.fn(),
};
vi.mock("@slotclientengine/rendercore/popup/editor", async (original) => ({
  ...(await original<
    typeof import("@slotclientengine/rendercore/popup/editor")
  >()),
  createPopupPackageResource: vi.fn(async () => resource),
  createAwardCelebrationPlayer: vi.fn(() => player),
  createSpinePopupPlayer: vi.fn(() => player),
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
    resource.manifest.type = "award-celebration";
    vi.clearAllMocks();
  });
  it("formats whole preview amounts with fixed decimals and optional grouping", async () => {
    const { formatPopupPreviewAmount } =
      await import("../src/preview/popup-preview.js");
    expect(formatPopupPreviewAmount(0)).toBe("0");
    expect(
      formatPopupPreviewAmount(999, {
        fractionDigits: 2,
        useGrouping: false,
      }),
    ).toBe("999.00");
    expect(
      formatPopupPreviewAmount(1000, {
        fractionDigits: 2,
        useGrouping: true,
      }),
    ).toBe("1,000.00");
    expect(
      formatPopupPreviewAmount(1234567, {
        fractionDigits: 3,
        useGrouping: true,
      }),
    ).toBe("1,234,567.000");
    expect(() =>
      formatPopupPreviewAmount(1, {
        fractionDigits: 7,
        useGrouping: false,
      }),
    ).toThrow(/0\.\.6 safe integer/);
    expect(() =>
      formatPopupPreviewAmount(Number.MAX_SAFE_INTEGER + 1, {
        fractionDigits: 0,
        useGrouping: false,
      }),
    ).toThrow(/non-negative safe integer/);
  });
  it("uses the production player, freezes input on play, updates snapshots and cleans owners", async () => {
    const { PopupPreview } = await import("../src/preview/popup-preview.js");
    const { createAwardCelebrationPlayer } =
      await import("@slotclientengine/rendercore/popup/editor");
    const preview = new PopupPreview(
      document.querySelector("#host")!,
      document.querySelector("#status")!,
    );
    await preview.init();
    expect(document.querySelector("#host")!.classList).toContain(
      "popup-preview-gradient",
    );
    await preview.rebuild({} as never);
    expect(player.setTextWidthGuidesVisible).toHaveBeenLastCalledWith(true);
    const formatAmount = vi.mocked(createAwardCelebrationPlayer).mock
      .calls[0]![0].formatAmount!;
    expect(formatAmount(1234567)).toBe("1234567");
    preview.setAmountFormat({ fractionDigits: 2, useGrouping: true });
    expect(formatAmount(1234567)).toBe("1,234,567.00");
    preview.setInput(100, 5000);
    preview.play();
    canvas.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "A" }));
    expect(player.requestAdvance).toHaveBeenCalledTimes(2);
    const input = document.createElement("input");
    document.body.append(input);
    const editingKey = new KeyboardEvent("keydown", {
      key: "B",
      bubbles: true,
      cancelable: true,
    });
    input.dispatchEvent(editingKey);
    expect(player.requestAdvance).toHaveBeenCalledTimes(2);
    expect(editingKey.defaultPrevented).toBe(false);
    preview.setViewport(1920, 1080, 0.5, false);
    expect(player.setTextWidthGuidesVisible).toHaveBeenLastCalledWith(false);
    expect(player.applyViewport).toHaveBeenLastCalledWith({
      width: 1920,
      height: 1080,
    });
    expect(player.start).toHaveBeenCalledWith({
      betAmountRaw: 100,
      winAmountRaw: 5000,
    });
    const callback = ticker.add.mock.calls[0]![0];
    callback({ deltaMS: 16 });
    expect(document.querySelector("#status")!.textContent).toContain("base");
    preview.destroy();
    canvas.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "B" }));
    expect(player.requestAdvance).toHaveBeenCalledTimes(2);
    expect(player.destroy).toHaveBeenCalled();
    expect(resource.destroy).toHaveBeenCalled();
    expect(document.querySelector("#host")!.classList).not.toContain(
      "popup-preview-gradient",
    );
  });

  it("discards a prepared preview when a newer edit invalidates the rebuild", async () => {
    let release!: () => void;
    player.init.mockImplementationOnce(
      () => new Promise<void>((resolve) => (release = resolve)),
    );
    const { PopupPreview } = await import("../src/preview/popup-preview.js");
    const preview = new PopupPreview(
      document.querySelector("#host")!,
      document.querySelector("#status")!,
    );
    await preview.init();
    const rebuilding = preview.rebuild({} as never);
    await vi.waitFor(() => expect(player.init).toHaveBeenCalled());
    preview.cancelPendingRebuild();
    release();
    await rebuilding;
    expect(player.destroy).toHaveBeenCalled();
    expect(resource.destroy).toHaveBeenCalled();
    preview.destroy();
  });

  it("releases a failed preview prepare without replacing the current canvas", async () => {
    player.init.mockRejectedValueOnce(new Error("font prepare failed"));
    const { PopupPreview } = await import("../src/preview/popup-preview.js");
    const preview = new PopupPreview(
      document.querySelector("#host")!,
      document.querySelector("#status")!,
    );
    await preview.init();
    await expect(preview.rebuild({} as never)).rejects.toThrow(
      "font prepare failed",
    );
    expect(player.destroy).toHaveBeenCalled();
    expect(resource.destroy).toHaveBeenCalled();
    expect(document.querySelector("#host")!.contains(canvas)).toBe(true);
    preview.destroy();
  });

  it("dismisses a playing Spine Popup from canvas or keyboard input", async () => {
    resource.manifest.type = "spine";
    const { PopupPreview } = await import("../src/preview/popup-preview.js");
    const preview = new PopupPreview(
      document.querySelector("#host")!,
      document.querySelector("#status")!,
    );
    await preview.init();
    await preview.rebuild({} as never);
    preview.play();
    expect(player.start).toHaveBeenCalledWith();

    canvas.dispatchEvent(new Event("pointerdown"));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(player.requestDismiss).toHaveBeenCalledTimes(2);

    preview.destroy();
  });
});
