import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  load: vi.fn(async (asset: { readonly src: string }) => ({
    source: { url: asset.src },
  })),
  setTexture: vi.fn(),
  textureFrom: vi.fn((source: unknown) => ({ source })),
  updates: [] as number[],
  slotAdds: [] as Array<{ slot: string; object: any; options: any }>,
  slotRemoves: [] as any[],
}));

vi.mock("pixi.js", () => {
  class Container {
    children: any[] = [];
    parent: Container | null = null;
    label = "";
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
    destroy() {}
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
        setAnimation: vi.fn((_track, name, loop) => {
          this.#entry = { loop, name, eventPending: name === "BG_FG" };
          return this.#entry;
        }),
      };
    }
    update(delta: number) {
      mocks.updates.push(delta);
      if (this.#entry?.eventPending) {
        this.#entry.eventPending = false;
        this.#entry.listener?.event?.(this.#entry, {
          data: { name: "SwitchScene" },
        });
      }
      if (delta > 0) {
        this.#entry.listener?.complete?.(this.#entry);
      }
    }
    destroy() {}
    addSlotObject = vi.fn((slot: string, object: any, options: any) => {
      mocks.slotAdds.push({ slot, object, options });
      object.parent = this;
    });
    removeSlotObject = vi.fn((object: any) => {
      mocks.slotRemoves.push(object);
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
    mocks.slotAdds.length = 0;
    mocks.slotRemoves.length = 0;
  });

  it("loads and binds every explicitly configured atlas page", async () => {
    const resource = {
      skeleton: {
        skeleton: { spine: "4.3.23" },
        animations: {
          BG: {},
          BG_FG: { events: [{ time: 0, name: "SwitchScene" }] },
        },
      },
      atlasText: "BG.png,BG_2.png",
      textureUrls: {
        "BG.png": "blob:http://localhost/shared-texture",
        "BG_2.png": "blob:http://localhost/shared-texture",
      },
    };
    const validation = validateOfficialSpineResource({
      resource,
      requiredAnimations: ["BG", "BG_FG"],
      requiredSlots: ["ValueSlot"],
      requiredAnimationEvents: { BG_FG: ["SwitchScene"] },
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

    expect(mocks.load).toHaveBeenCalledTimes(1);
    expect(mocks.load).toHaveBeenCalledWith({
      src: "blob:http://localhost/shared-texture",
      parser: "loadTextures",
    });
    expect(mocks.setTexture).toHaveBeenCalledTimes(2);
    const slotObject = new (await import("pixi.js")).Container();
    player.attachSlotObject({ slot: "ValueSlot", object: slotObject });
    const slotWrapper = mocks.slotAdds[0]!.object;
    expect(slotWrapper).not.toBe(slotObject);
    expect(slotWrapper.label).toBe("rendercore-spine-slot:ValueSlot");
    expect(slotWrapper.children).toEqual([slotObject]);
    expect(slotObject.parent).toBe(slotWrapper);
    expect(mocks.slotAdds[0]).toMatchObject({
      slot: "ValueSlot",
      options: {
        followAttachmentTimeline: false,
        followSlotColor: true,
      },
    });
    player.removeSlotObject(slotObject);
    expect(mocks.slotRemoves).toEqual([slotWrapper]);
    expect(slotObject.parent).toBeNull();
    player.play({ animationName: "BG_FG", loop: false });
    expect(player.update(0.1)).toEqual({
      completed: true,
      events: [{ name: "SwitchScene" }],
    });
    player.play({ animationName: "BG", loop: true });
    expect(player.update(0.1)).toEqual({
      completed: false,
      loopCompleted: true,
      events: [],
    });
    expect(player.update(0)).toEqual({ completed: false, events: [] });
    player.play({ animationName: "BG_FG", loop: false });
    const timeZero = player.update(0);
    expect(timeZero).toEqual({
      completed: false,
      events: [{ name: "SwitchScene" }],
    });
    expect(Object.isFrozen(timeZero)).toBe(true);
    expect(Object.isFrozen(timeZero.events)).toBe(true);
    expect(player.update(0)).toEqual({ completed: false, events: [] });
    player.play({ animationName: "BG_FG", loop: false });
    player.reset();
    expect(player.update(0)).toEqual({ completed: false, events: [] });
    player.destroy();
    expect(() => player.update(0)).toThrow(/destroyed/);
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
