import { beforeEach, describe, expect, it, vi } from "vitest";

const pixiMock = vi.hoisted(() => {
  class MockPoint {
    x = 0;
    y = 0;

    set(x: number, y = x): void {
      this.x = x;
      this.y = y;
    }
  }

  class MockContainer {
    children: MockContainer[] = [];
    parent: MockContainer | null = null;
    visible = true;
    alpha = 1;
    zIndex = 0;
    sortableChildren = false;
    tint = 0xffffff;
    blendMode = "normal";
    mask: MockContainer | null = null;
    renderable = true;
    includeInBuild = true;
    measurable = true;
    position = new MockPoint();
    pivot = new MockPoint();
    scale = new MockPoint();
    anchor = new MockPoint();

    addChild(...children: MockContainer[]): MockContainer | undefined {
      for (const child of children) {
        child.parent?.removeChild(child);
        child.parent = this;
      }
      this.children.push(...children);
      return children[0];
    }

    removeChild(...children: MockContainer[]): MockContainer | undefined {
      for (const child of children) {
        const index = this.children.indexOf(child);
        if (index >= 0) {
          this.children.splice(index, 1);
          child.parent = null;
        }
      }
      return children[0];
    }

    removeChildren(): MockContainer[] {
      const children = this.children;
      for (const child of children) {
        child.parent = null;
      }
      this.children = [];
      return children;
    }

    setFromMatrix(matrix: { readonly tx: number; readonly ty: number }): void {
      this.position.set(matrix.tx, matrix.ty);
    }
  }

  class MockTexture {
    static EMPTY = new MockTexture();
    static WHITE = new MockTexture();
    source = {};
    width = 64;
    height = 64;

    constructor(readonly options?: unknown) {}
  }

  class MockSprite extends MockContainer {
    constructor(public texture: MockTexture) {
      super();
    }
  }

  class MockMeshGeometry {
    positions: Float32Array;
    uvs: Float32Array;
    indices: Uint32Array;

    constructor(options: {
      readonly positions: Float32Array;
      readonly uvs: Float32Array;
      readonly indices: Uint32Array;
    }) {
      this.positions = options.positions;
      this.uvs = options.uvs;
      this.indices = options.indices;
    }
  }

  class MockMesh extends MockContainer {
    constructor(
      readonly options: {
        readonly geometry: MockMeshGeometry;
        readonly texture: MockTexture;
      },
    ) {
      super();
      this.geometry = options.geometry;
      this.texture = options.texture;
    }

    geometry: MockMeshGeometry;
    texture: MockTexture;
  }

  class MockGraphics extends MockContainer {
    points: number[] = [];
    fillOptions: unknown = null;

    clear(): this {
      this.points = [];
      this.fillOptions = null;
      return this;
    }

    poly(points: readonly number[]): this {
      this.points = [...points];
      return this;
    }

    fill(options: unknown): this {
      this.fillOptions = options;
      return this;
    }
  }

  class MockMatrix {
    tx = 0;
    ty = 0;

    set(
      _a: number,
      _b: number,
      _c: number,
      _d: number,
      tx: number,
      ty: number,
    ): void {
      this.tx = tx;
      this.ty = ty;
    }
  }

  class MockRectangle {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly width: number,
      readonly height: number,
    ) {}
  }

  return {
    assetsLoad: vi.fn(async () => MockTexture.WHITE),
    MockContainer,
    MockGraphics,
    MockMatrix,
    MockMesh,
    MockMeshGeometry,
    MockRectangle,
    MockSprite,
    MockTexture,
  };
});

vi.mock("pixi.js", () => ({
  Assets: {
    load: pixiMock.assetsLoad,
  },
  Container: pixiMock.MockContainer,
  Graphics: pixiMock.MockGraphics,
  Matrix: pixiMock.MockMatrix,
  Mesh: pixiMock.MockMesh,
  MeshGeometry: pixiMock.MockMeshGeometry,
  Rectangle: pixiMock.MockRectangle,
  Sprite: pixiMock.MockSprite,
  Texture: pixiMock.MockTexture,
}));

import {
  Spine38SymbolPlayer,
  isSpine38Skeleton,
  parseSpineAtlasText,
  validateSpine38SkeletonContract,
} from "../../src/symbol/spine38-runtime.js";
import type { SymbolSpineAnimationResource } from "../../src/symbol/index.js";

beforeEach(() => {
  vi.clearAllMocks();
  pixiMock.assetsLoad.mockResolvedValue(pixiMock.MockTexture.WHITE);
});

describe("Spine 3.8 symbol runtime", () => {
  it("validates a stable Spine 3.8 fixture and exact animation names", () => {
    const atlas = parseSpineAtlasText(createAtlasText());
    const skeleton = createSkeleton();
    expect(isSpine38Skeleton(skeleton)).toBe(true);
    for (const animationName of ["Idle", "Win"]) {
      expect(() =>
        validateSpine38SkeletonContract({
          skeleton,
          animationName,
          atlas,
        }),
      ).not.toThrow();
    }

    expect(() =>
      validateSpine38SkeletonContract({
        skeleton,
        animationName: "Start",
        atlas,
      }),
    ).toThrow(/missing animation "Start"/);
  });

  it("plays a Spine 3.8 skeleton through Pixi sprites and reports once completion", async () => {
    const player = new Spine38SymbolPlayer({
      resource: createResource({
        loop: false,
        skeleton: createSkeleton(),
        atlasText: createAtlasText(),
      }),
    });

    expect(player.update(0).completed).toBe(false);

    await player.init();

    expect(pixiMock.assetsLoad).toHaveBeenCalledWith("/assets/Symbol.png");
    expect(player.view.children).toHaveLength(1);
    const slotLayer = player.view.children[0] as unknown as InstanceType<
      typeof pixiMock.MockContainer
    >;
    expect(slotLayer.sortableChildren).toBe(true);
    const sprite = slotLayer.children[0] as unknown as InstanceType<
      typeof pixiMock.MockSprite
    >;
    expect(sprite.visible).toBe(true);
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.alpha).toBe(1);
    expect(sprite.blendMode).toBe("add");
    expect(sprite.texture).toBeInstanceOf(pixiMock.MockTexture);
    expect(sprite.texture.options).toMatchObject({
      rotate: 6,
      label: "gem",
    });

    expect(player.update(0.25).completed).toBe(false);
    expect(sprite.tint).toBe(0xff0000);
    expect(sprite.alpha).toBeCloseTo(0.5019, 3);
    expect(player.update(0.25).completed).toBe(true);
    player.reset();
    expect(player.update(0.5).completed).toBe(true);
    player.play({ animationName: "Idle", loop: true });
    expect(player.update(2).completed).toBe(false);

    player.destroy();
    player.destroy();
    expect(player.view.children).toHaveLength(0);
    expect(() => player.update(0)).toThrow(/destroyed/);
  });

  it("renders weighted mesh and clipping attachments from a Spine 3.8 fixture", async () => {
    const player = new Spine38SymbolPlayer({
      resource: createResource({
        loop: true,
        skeleton: createWeightedMeshSkeleton(),
        atlasText: createAtlasText(),
        animationName: "Idle",
      }),
    });

    await player.init();

    const slotLayer = player.view.children[0] as unknown as InstanceType<
      typeof pixiMock.MockContainer
    >;
    const mesh = slotLayer.children.find(
      (child) => child instanceof pixiMock.MockMesh,
    ) as InstanceType<typeof pixiMock.MockMesh> | undefined;
    expect(mesh).toBeDefined();
    expect(mesh?.texture.options).toMatchObject({
      rotate: 6,
      label: "gem",
    });
    const mask = slotLayer.children.find(
      (child) => child instanceof pixiMock.MockGraphics,
    ) as InstanceType<typeof pixiMock.MockGraphics> | undefined;
    expect(mask).toBeDefined();
    expect(mask?.visible).toBe(true);
    expect(mask?.renderable).toBe(true);
    expect(mask?.includeInBuild).toBe(false);
    expect(mask?.measurable).toBe(false);
    expect(mask?.points).toHaveLength(8);
    expect(mask?.points.some((point) => point !== 0)).toBe(true);
    expect(mesh?.mask).toBe(mask);
    const unmaskedSlot = slotLayer.children.find(
      (child) =>
        child instanceof pixiMock.MockSprite &&
        child.texture.options &&
        typeof child.texture.options === "object" &&
        child.texture.options !== null &&
        "label" in child.texture.options &&
        child.texture.options.label === "gem",
    ) as InstanceType<typeof pixiMock.MockSprite> | undefined;
    expect(unmaskedSlot?.mask ?? null).toBeNull();
    expect(mesh?.geometry.uvs).toHaveLength(8);
    expect(mesh?.geometry.indices).toHaveLength(6);
    expect([...Array.from(mesh?.geometry.positions ?? [])].some(Boolean)).toBe(
      true,
    );
  });

  it("fails fast for atlas, skeleton and runtime contract errors", async () => {
    expect(() => parseSpineAtlasText("Symbol.png\n")).toThrow(/page header/);
    expect(() =>
      parseSpineAtlasText(
        "Symbol.png\nsize: 64,64\nformat: RGBA8888\nfilter: Linear,Linear\nrepeat: none\ngem\n  rotate: false\n",
      ),
    ).toThrow(/gem.xy/);
    expect(() => isSpine38Skeleton({})).toThrow(/bones or slots/);
    expect(() =>
      validateSpine38SkeletonContract({
        skeleton: {
          skeleton: { spine: "3.8.99" },
          bones: [{ name: "child", parent: "missing" }],
          slots: [],
          skins: { default: {} },
          animations: { Idle: {} },
        },
        animationName: "Idle",
        atlas: parseSpineAtlasText(createAtlasText()),
      }),
    ).toThrow(/missing parent bone/);

    await expect(
      new Spine38SymbolPlayer({
        resource: createResource({
          skeleton: createSkeleton(),
          atlasPage: "Other.png",
          atlasText: createAtlasText(),
        }),
      }).init(),
    ).rejects.toThrow(/atlas page contract changed/);

    await expect(
      new Spine38SymbolPlayer({
        resource: createResource({
          skeleton: createSkeleton({ attachmentPath: "missing" }),
          atlasText: createAtlasText(),
        }),
      }).init(),
    ).rejects.toThrow(/missing region "missing"/);

    const player = new Spine38SymbolPlayer({
      resource: createResource({
        skeleton: createSkeleton(),
        animationName: "Missing",
        atlasText: createAtlasText(),
      }),
    });
    await expect(player.init()).rejects.toThrow(/was not found/);

    const initializedPlayer = new Spine38SymbolPlayer({
      resource: createResource({
        skeleton: createSkeleton(),
        atlasText: createAtlasText(),
      }),
    });
    await initializedPlayer.init();
    expect(() =>
      initializedPlayer.play({ animationName: "Missing", loop: false }),
    ).toThrow(/was not found/);
    expect(() => initializedPlayer.update(-0.1)).toThrow(/deltaSeconds/);
  });

  it("supports object skins, hidden attachments, fallback frame values and non-rotated atlas regions", async () => {
    const skeleton = {
      skeleton: { spine: "3.8.99" },
      bones: [{ name: "root" }, { name: "child", parent: "root" }],
      slots: [{ name: "slot", bone: "child", attachment: "gem", color: "bad" }],
      skins: {
        default: {
          slot: {
            gem: { width: 8, height: 10 },
            alt: { name: "alt-texture", width: 4, height: 6 },
          },
        },
      },
      animations: {
        Hide: {
          slots: {
            slot: {
              attachment: [{}],
              color: [{}],
            },
          },
          bones: {
            child: {
              translate: [{ time: 0.5, x: 8, y: 4 }],
              scale: [{ time: 0.5, curve: [0.1, 0.2, 0.3, 0.4] }],
            },
          },
          drawOrder: [
            { time: 0 },
            { time: 0.25, offsets: [{ slot: "missing", offset: 0 }] },
          ],
        },
        ShowAlt: {
          slots: {
            slot: {
              attachment: [{ name: "alt" }],
            },
          },
        },
      },
    };
    const atlasText = [
      "Symbol.png",
      "size: 64,64",
      "format: RGBA8888",
      "filter: Linear,Linear",
      "repeat: none",
      "gem",
      "  rotate: false",
      "  xy: 1, 2",
      "  size: 8, 10",
      "  orig: 8, 10",
      "  offset: 0, 0",
      "  index: -1",
      "alt-texture",
      "  rotate: false",
      "  xy: 10, 12",
      "  size: 4, 6",
      "  orig: 4, 6",
      "  offset: 0, 0",
      "  index: -1",
      "",
    ].join("\n");

    expect(isSpine38Skeleton({ ...skeleton, skeleton: {} })).toBe(false);
    expect(() =>
      validateSpine38SkeletonContract({
        skeleton: {
          ...skeleton,
          skins: {
            default: {
              slot: {
                missing: { path: "missing", width: 8, height: 10 },
              },
            },
          },
        },
        animationName: "Hide",
        atlas: parseSpineAtlasText(atlasText),
      }),
    ).toThrow(/missing atlas region "missing"/);

    const player = new Spine38SymbolPlayer({
      resource: createResource({
        skeleton,
        atlasText,
        animationName: "Hide",
        loop: false,
      }),
    });

    player.reset();
    await player.init();
    const slotLayer = player.view.children[0] as unknown as InstanceType<
      typeof pixiMock.MockContainer
    >;
    expect(slotLayer.children).toHaveLength(0);
    expect(player.update(0.25).completed).toBe(false);
    expect(player.update(0.25).completed).toBe(true);

    player.play({ animationName: "ShowAlt", loop: false });
    const sprite = slotLayer.children[0] as unknown as InstanceType<
      typeof pixiMock.MockSprite
    >;
    expect(sprite.visible).toBe(true);
    expect(sprite.tint).toBe(0xffffff);
    expect(sprite.alpha).toBe(1);
    expect(sprite.texture.options).toMatchObject({
      rotate: 0,
      label: "alt-texture",
    });
  });
});

function createResource(options: {
  readonly skeleton: unknown;
  readonly atlasText: string;
  readonly animationName?: string;
  readonly atlasPage?: string;
  readonly loop?: boolean;
}): SymbolSpineAnimationResource {
  return {
    symbol: "T1",
    state: "win",
    skeleton: options.skeleton,
    atlasText: options.atlasText,
    textureUrl: "/assets/Symbol.png",
    atlasPage: options.atlasPage ?? "Symbol.png",
    spec: {
      kind: "spine",
      skeleton: "./T1.json",
      atlas: "./Symbol.atlas",
      texture: "./Symbol.png",
      playback: {
        mode: "animation",
        animationName: options.animationName ?? "Win",
        loop: options.loop ?? false,
      },
    },
  };
}

function createSkeleton(options: { readonly attachmentPath?: string } = {}) {
  return {
    skeleton: { spine: "3.8.99", width: 64, height: 64, fps: 24 },
    bones: [
      { name: "root" },
      { name: "child", parent: "root", x: 4, y: 6, rotation: -10 },
    ],
    slots: [
      {
        name: "slot",
        bone: "child",
        attachment: "gem",
        color: "ffffffff",
        blend: "additive",
      },
    ],
    skins: [
      {
        name: "default",
        attachments: {
          slot: {
            gem: {
              path: options.attachmentPath ?? "gem",
              x: 3,
              y: 5,
              rotation: 15,
              width: 16,
              height: 18,
            },
            clip: {
              type: "clipping",
              end: "slot",
              vertexCount: 4,
              vertices: [-5, -5, 5, -5, 5, 5, -5, 5],
            },
          },
        },
      },
    ],
    animations: {
      Idle: {
        bones: {
          child: {
            rotate: [{ angle: 0 }, { time: 0.5, angle: 30 }],
            scale: [
              { x: 1, y: 1 },
              { time: 0.5, x: 1.25, y: 0.75 },
            ],
          },
        },
      },
      Win: {
        slots: {
          slot: {
            color: [{ color: "ffffffff" }, { time: 0.25, color: "ff000080" }],
          },
        },
        bones: {
          child: {
            translate: [
              { x: 0, y: 0, curve: "stepped" },
              { time: 0.25, x: 10, y: -5 },
              { time: 0.5, x: 20, y: 0, curve: 0.25, c3: 0.75 },
            ],
            rotate: [{ angle: 350 }, { time: 0.5, angle: 10 }],
            scale: [
              { x: 1, y: 1 },
              { time: 0.5, x: 2, y: 2 },
            ],
            shear: [
              { x: 0, y: 0 },
              { time: 0.5, x: 2, y: 4 },
            ],
          },
        },
        draworder: [
          {
            time: 0.1,
            offsets: [{ slot: "slot", offset: 0 }],
          },
        ],
      },
    },
  };
}

function createWeightedMeshSkeleton() {
  return {
    skeleton: { spine: "3.8.99", width: 64, height: 64, fps: 24 },
    bones: [{ name: "root" }],
    slots: [
      { name: "clip", bone: "root", attachment: "clip" },
      { name: "mesh", bone: "root", attachment: "mesh" },
      { name: "plain", bone: "root", attachment: "gem" },
    ],
    skins: [
      {
        name: "default",
        attachments: {
          clip: {
            clip: {
              type: "clipping",
              end: "mesh",
              vertexCount: 4,
              vertices: [-10, -10, 10, -10, 10, 10, -10, 10],
            },
          },
          mesh: {
            mesh: {
              type: "mesh",
              path: "gem",
              uvs: [0, 0, 1, 0, 1, 1, 0, 1],
              triangles: [0, 1, 2, 2, 3, 0],
              vertices: [
                1, 0, -8, -8, 1, 1, 0, 8, -8, 1, 1, 0, 8, 8, 1, 1, 0, -8, 8, 1,
              ],
            },
          },
          plain: {
            gem: { path: "gem", width: 16, height: 18 },
          },
        },
      },
    ],
    animations: { Idle: {} },
  };
}

function createAtlasText(): string {
  return [
    "Symbol.png",
    "size: 64,64",
    "format: RGBA8888",
    "filter: Linear,Linear",
    "repeat: none",
    "gem",
    "  rotate: true",
    "  xy: 1, 2",
    "  size: 16, 18",
    "  orig: 16, 18",
    "  offset: 0, 0",
    "  index: -1",
    "",
  ].join("\n");
}
