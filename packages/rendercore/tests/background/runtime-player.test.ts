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
        animations: [
          { name: "BG", duration: 15 },
          { name: "BG_FG", duration: 1.6 },
        ],
        slots: [{ name: "ValueSlot" }],
        findAnimation: (name: string) =>
          ["BG", "BG_FG"].includes(name) ? { name } : null,
        findSlot: (name: string) =>
          name === "ValueSlot" ? { name: "ValueSlot" } : null,
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
      if (delta > 0) {
        this.#entry.listener?.complete?.(this.#entry);
      }
    }
    destroy() {}
    addSlotObject = vi.fn((_slot: string, object: any) => {
      object.parent = this;
    });
    removeSlotObject = vi.fn((object: any) => {
      object.parent = null;
    });
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
    const validation = validateOfficialSpineResource({
      resource,
      requiredAnimations: ["BG", "BG_FG"],
      requiredSlots: ["ValueSlot"],
    });
    expect(validation.atlasPages).toEqual(["BG.png", "BG_2.png"]);
    expect(validation.animationDurations).toEqual({ BG: 15, BG_FG: 1.6 });
    expect(validation.slotNames).toEqual(["ValueSlot"]);
    expect(() =>
      validateOfficialSpineResource({
        resource,
        requiredAnimations: ["BG"],
        requiredSlots: ["Missing"],
      }),
    ).toThrow(/slot "Missing" was not found/);

    const player = createOfficialSpinePlayer({ resource });
    await player.init();

    expect(mocks.load).toHaveBeenCalledTimes(2);
    expect(mocks.load).toHaveBeenCalledWith("/assets/BG.png");
    expect(mocks.load).toHaveBeenCalledWith("/assets/BG_2.png");
    expect(mocks.setTexture).toHaveBeenCalledTimes(2);
    const slotObject = new (await import("pixi.js")).Container();
    player.attachSlotObject({ slot: "ValueSlot", object: slotObject });
    player.removeSlotObject(slotObject);
    player.play({ animationName: "BG_FG", loop: false });
    expect(player.update(0.1)).toEqual({ completed: true });
    player.play({ animationName: "BG", loop: true });
    expect(player.update(0.1)).toEqual({
      completed: false,
      loopCompleted: true,
    });
    expect(player.update(0)).toEqual({ completed: false });
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
