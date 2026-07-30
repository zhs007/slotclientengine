import { beforeEach, describe, expect, it, vi } from "vitest";

const animatedPreviewSpies = vi.hoisted(() => ({
  applicationInit: vi.fn(async () => undefined),
  applicationDestroy: vi.fn(),
  tickerAdd: vi.fn(),
  tickerRemove: vi.fn(),
  tickerStart: vi.fn(),
  tickerStop: vi.fn(),
  playerInit: vi.fn(async () => undefined),
  playerPlay: vi.fn(),
  playerUpdate: vi.fn(),
  playerDestroy: vi.fn(),
}));

vi.mock("pixi.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("pixi.js")>();
  return {
    ...actual,
    Application: class {
      readonly canvas = document.createElement("canvas");
      readonly stage = {
        addChild: vi.fn(),
        removeChild: vi.fn(),
      };
      readonly ticker = {
        add: animatedPreviewSpies.tickerAdd,
        remove: animatedPreviewSpies.tickerRemove,
        start: animatedPreviewSpies.tickerStart,
        stop: animatedPreviewSpies.tickerStop,
      };

      async init(options: { readonly width: number; readonly height: number }) {
        this.canvas.width = options.width;
        this.canvas.height = options.height;
        await animatedPreviewSpies.applicationInit();
      }

      destroy() {
        animatedPreviewSpies.applicationDestroy();
      }
    },
  };
});

vi.mock("@slotclientengine/rendercore", () => ({
  createOfficialSpinePlayer: vi.fn(() => ({
    view: {
      getLocalBounds: () => ({ x: 0, y: 0, width: 100, height: 80 }),
      scale: { set: vi.fn() },
      position: { set: vi.fn() },
    },
    init: animatedPreviewSpies.playerInit,
    play: animatedPreviewSpies.playerPlay,
    update: animatedPreviewSpies.playerUpdate,
    destroy: animatedPreviewSpies.playerDestroy,
  })),
}));

import { createNewEditorProject } from "../src/model/editor-project.js";
import { ResourcePickerPreview } from "../src/preview/resource-picker-preview.js";

describe("ResourcePickerPreview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows image and Spine page previews and revokes owned URLs on clear", async () => {
    const project = createNewEditorProject("maximized-focus");
    const image = {
      id: "panel.png",
      kind: "image" as const,
      path: "panel.png",
      size: { width: 100, height: 80 },
    };
    const spine = {
      id: "hero.json",
      kind: "spine" as const,
      skeleton: "hero.json",
      atlas: "hero.atlas",
      textures: {
        "hero-a.png": "hero-a.png",
        "hero-b.png": "hero-b.png",
      },
      animationNames: ["Idle"],
      animationEvents: { Idle: [] },
    };
    project.resources.set(image.id, image);
    project.resources.set(spine.id, spine);
    project.assets.set(image.path, new Uint8Array([1]));
    project.assets.set(spine.skeleton, new Uint8Array([2]));
    project.assets.set(spine.atlas, new Uint8Array([3]));
    project.assets.set("hero-a.png", new Uint8Array([4]));
    project.assets.set("hero-b.png", new Uint8Array([5]));
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const preview = new ResourcePickerPreview();
    const host = document.createElement("div");

    await preview.show({
      host,
      project,
      resource: image,
      animation: "",
    });
    expect(host.querySelector("img")?.alt).toContain("panel.png");

    await preview.show({
      host,
      project,
      resource: spine,
      animation: "",
    });
    expect(
      [...host.querySelectorAll("figcaption")].map(
        (caption) => caption.textContent,
      ),
    ).toEqual(["hero-a.png", "hero-b.png"]);

    preview.clear();
    expect(host.childElementCount).toBe(0);
    expect(revoke).toHaveBeenCalledTimes(3);
    preview.destroy();
    revoke.mockRestore();
  });

  it("reports missing bytes without mutating the project", async () => {
    const project = createNewEditorProject("maximized-focus");
    const resource = {
      id: "missing.png",
      kind: "image" as const,
      path: "missing.png",
      size: { width: 1, height: 1 },
    };
    project.resources.set(resource.id, resource);
    const preview = new ResourcePickerPreview();
    const host = document.createElement("div");

    await preview.show({ host, project, resource, animation: "" });

    expect(host.textContent).toContain("资源预览缺少 bytes");
    expect(project.assets.size).toBe(0);
    preview.destroy();
  });

  it("revokes contact-sheet URLs when a later page is missing", async () => {
    const project = createNewEditorProject("maximized-focus");
    const resource = {
      id: "partial.json",
      kind: "spine" as const,
      skeleton: "partial.json",
      atlas: "partial.atlas",
      textures: {
        "first.png": "first.png",
        "missing.png": "missing.png",
      },
      animationNames: ["Idle"],
      animationEvents: { Idle: [] },
    };
    project.resources.set(resource.id, resource);
    project.assets.set("first.png", new Uint8Array([1]));
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    const preview = new ResourcePickerPreview();
    const host = document.createElement("div");

    await preview.show({ host, project, resource, animation: "" });

    expect(host.textContent).toContain("资源预览缺少 bytes：missing.png");
    expect(revoke).toHaveBeenCalledTimes(1);
    preview.destroy();
    revoke.mockRestore();
  });

  it("reuses one animated renderer and only destroys it with the owner", async () => {
    const project = createNewEditorProject("maximized-focus");
    const resource = {
      id: "hero.json",
      kind: "spine" as const,
      skeleton: "hero.json",
      atlas: "hero.atlas",
      textures: { "hero.png": "hero.png" },
      animationNames: ["Idle"],
      animationEvents: { Idle: [] },
    };
    project.resources.set(resource.id, resource);
    project.assets.set(
      resource.skeleton,
      new TextEncoder().encode('{"skeleton":{"spine":"4.3.0"}}'),
    );
    project.assets.set(resource.atlas, new TextEncoder().encode("hero.png\n"));
    project.assets.set("hero.png", new Uint8Array([1]));
    const preview = new ResourcePickerPreview();
    const host = document.createElement("div");

    await preview.show({ host, project, resource, animation: "Idle" });
    expect(host.querySelector("canvas")?.getAttribute("aria-label")).toBe(
      "hero.json · Idle",
    );
    preview.clear();
    expect(animatedPreviewSpies.playerDestroy).toHaveBeenCalledOnce();
    expect(animatedPreviewSpies.applicationDestroy).not.toHaveBeenCalled();

    await preview.show({ host, project, resource, animation: "Idle" });
    expect(animatedPreviewSpies.applicationInit).toHaveBeenCalledOnce();
    expect(animatedPreviewSpies.playerInit).toHaveBeenCalledTimes(2);

    preview.destroy();
    await vi.waitFor(() =>
      expect(animatedPreviewSpies.applicationDestroy).toHaveBeenCalledOnce(),
    );
  });
});
