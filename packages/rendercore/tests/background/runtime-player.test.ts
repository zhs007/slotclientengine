import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(async (url: string) => ({ source: { url } })),
  setTexture: vi.fn(),
  textureFrom: vi.fn((source: unknown) => ({ source })),
  updates: [] as number[],
}));

vi.mock("pixi.js", () => {
  class Container {
    children: any[] = [];
    parent: Container | null = null;
    addChild(...children: any[]) {
      this.children.push(...children);
      for (const child of children) child.parent = this;
    }
    removeChild(child: any) {
      this.children = this.children.filter((candidate) => candidate !== child);
      child.parent = null;
    }
    removeChildren() {
      this.children = [];
    }
  }
  return { Assets: { load: mocks.load }, Container };
});

vi.mock("@esotericsoftware/spine-pixi-v8", () => {
  class TextureAtlas {
    pages: Array<{ name: string; setTexture: typeof mocks.setTexture }>;
    constructor(atlasText: string) {
      this.pages = atlasText.split(",").map((name) => ({
        name,
        setTexture: mocks.setTexture,
      }));
    }
  }
  class AtlasAttachmentLoader {
    constructor(readonly atlas: unknown) {}
  }
  class SkeletonJson {
    constructor(readonly loader: unknown) {}
    readSkeletonData() {
      return {
        animations: [{ name: "BG" }, { name: "BG_FG" }],
        findAnimation: (name: string) =>
          ["BG", "BG_FG"].includes(name) ? { name } : null,
      };
    }
  }
  class Spine {
    autoUpdate = true;
    parent: any = null;
    skeleton: any;
    state: any;
    #entry: any = null;
    constructor(options: any) {
      this.skeleton = {
        data: options.skeletonData,
        setupPose: vi.fn(),
      };
      this.state = {
        clearTracks: vi.fn(),
        clearListeners: vi.fn(),
        setAnimation: vi.fn((_track, _name, loop) => {
          this.#entry = { loop };
          return this.#entry;
        }),
      };
    }
    update(delta: number) {
      mocks.updates.push(delta);
      if (!this.#entry?.loop && delta > 0) {
        this.#entry.listener?.complete?.(this.#entry);
      }
    }
    destroy() {}
  }
  return {
    AtlasAttachmentLoader,
    SkeletonJson,
    Spine,
    SpineTexture: { from: mocks.textureFrom },
    TextureAtlas,
  };
});

import {
  createOfficialSpinePlayer,
  validateOfficialSpineResource,
} from "../../src/spine/runtime-player.js";

describe("shared official Spine player", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.updates.length = 0;
  });

  it("loads and binds every explicitly configured atlas page", async () => {
    const resource = {
      skeleton: { skeleton: { spine: "4.3.23" } },
      atlasText: "BG.png,BG_2.png",
      textureUrls: {
        "BG.png": "/assets/BG.png",
        "BG_2.png": "/assets/BG_2.png",
      },
    };
    expect(
      validateOfficialSpineResource({
        resource,
        requiredAnimations: ["BG", "BG_FG"],
      }).atlasPages,
    ).toEqual(["BG.png", "BG_2.png"]);

    const player = createOfficialSpinePlayer({ resource });
    await player.init();

    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenCalledWith("/assets/BG.png");
    expect(mocks.load).toHaveBeenCalledWith("/assets/BG_2.png");
    expect(mocks.setTexture).toHaveBeenCalledTimes(2);
    player.play({ animationName: "BG_FG", loop: false });
    expect(player.update(0.1)).toEqual({ completed: true });
    player.play({ animationName: "BG", loop: true });
    expect(player.update(0.1)).toEqual({ completed: false });
    player.destroy();
  });

  it("rejects missing, extra and duplicate page contracts", () => {
    const skeleton = { skeleton: { spine: "4.3.23" } };
    expect(() =>
      validateOfficialSpineResource({
        resource: {
          skeleton,
          atlasText: "BG.png,BG_2.png",
          textureUrls: { "BG.png": "/BG.png" },
        },
        requiredAnimations: ["BG"],
      }),
    ).toThrow(/pages must exactly match texture pages/);
    expect(() =>
      validateOfficialSpineResource({
        resource: {
          skeleton,
          atlasText: "BG.png,BG.png",
          textureUrls: { "BG.png": "/BG.png" },
        },
        requiredAnimations: ["BG"],
      }),
    ).toThrow(/pages must exactly match texture pages/);
  });
});
