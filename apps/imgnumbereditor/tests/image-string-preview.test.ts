import { beforeEach, describe, expect, it, vi } from "vitest";

const renderer = {
  container: {
    position: {
      x: 0,
      y: 0,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    },
    scale: {
      x: 1,
      y: 1,
      set(value: number) {
        this.x = value;
        this.y = value;
      },
    },
    pivot: { x: 10, y: 5 },
  },
  setText: vi.fn(),
  getSnapshot: vi.fn(() => ({
    text: "01",
    logicalBounds: { x: 0, y: 0, width: 20, height: 10 },
    visualBounds: { x: 1, y: 1, width: 18, height: 8 },
    anchor: { x: 0.5, y: 0.5 },
  })),
  destroy: vi.fn(),
};

const graphics = {
  clear: vi.fn(),
  rect: vi.fn(),
  stroke: vi.fn(),
  destroy: vi.fn(),
};
graphics.clear.mockReturnValue(graphics);
graphics.rect.mockReturnValue(graphics);
graphics.stroke.mockReturnValue(graphics);

const app = {
  canvas: document.createElement("canvas"),
  init: vi.fn(async () => undefined),
  stage: { addChild: vi.fn() },
  destroy: vi.fn(),
};

vi.mock("pixi.js", () => ({
  Application: class {
    constructor() {
      return app;
    }
  },
  Graphics: class {
    constructor() {
      return graphics;
    }
  },
}));

vi.mock("@slotclientengine/rendercore/image-string", () => ({
  createRenderImageString: vi.fn(() => renderer),
}));

import { ImageStringPreview } from "../src/preview/image-string-preview.js";

describe("ImageStringPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    graphics.clear.mockReturnValue(graphics);
    graphics.rect.mockReturnValue(graphics);
    graphics.stroke.mockReturnValue(graphics);
  });

  it("owns only its Pixi view and delegates text/layout to rendercore", async () => {
    const host = document.createElement("div");
    const preview = await ImageStringPreview.create(host, {} as never, "01");
    expect(host.firstElementChild).toBe(app.canvas);
    expect(app.stage.addChild).toHaveBeenCalled();
    preview.setText("10");
    expect(renderer.setText).toHaveBeenCalledWith("10");
    preview.setZoom(2);
    expect(renderer.container.scale.x).toBe(2);
    expect(preview.getSnapshot()).toEqual(
      expect.objectContaining({ text: "01" }),
    );
    expect(() => preview.setZoom(0)).toThrow("zoom");
    preview.destroy();
    preview.destroy();
    expect(renderer.destroy).toHaveBeenCalledOnce();
    expect(app.destroy).toHaveBeenCalledWith(true);
    expect(() => preview.setText("0")).toThrow("已销毁");
  });
});
