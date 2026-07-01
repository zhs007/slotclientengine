import { describe, expect, it, vi } from "vitest";
import type {
  Container as PixiContainer,
  Texture as PixiTexture,
} from "pixi.js";

const pixiMock = vi.hoisted(() => {
  interface MockTextureSource {
    resource?: unknown;
    width?: number;
    height?: number;
    label?: string;
    alphaMode?: string;
    transparent?: boolean;
    destroyed?: boolean;
    destroy?: () => void;
  }

  interface MockTextureData {
    width: number;
    height: number;
    source?: MockTextureSource;
    label?: string;
    destroyed?: boolean;
    destroy?: (destroySource?: boolean) => void;
  }

  const textureByUrl = new Map<string, MockTextureData>();

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
    label = "";
    position = new MockPoint();
    pivot = new MockPoint();
    scale = new MockPoint();
    anchor = new MockPoint();
    mask: MockContainer | null = null;
    rotation = 0;
    alpha = 1;
    visible = true;
    localBlendMode = "inherit";
    groupBlendMode = "normal";

    get blendMode(): string {
      return this.localBlendMode;
    }

    set blendMode(value: string) {
      this.localBlendMode = value;
      this.groupBlendMode = value === "inherit" ? "normal" : value;
    }

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

    destroy(): void {
      this.children = [];
      this.parent = null;
    }
  }

  class MockGraphics extends MockContainer {
    clear(): this {
      return this;
    }

    rect(): this {
      return this;
    }

    fill(): this {
      return this;
    }
  }

  class MockSprite extends MockContainer {
    constructor(readonly texture: { width: number; height: number }) {
      super();
    }
  }

  class MockText extends MockContainer {
    constructor(readonly options: unknown) {
      super();
    }
  }

  class MockCanvasSource {
    readonly resource: unknown;
    readonly width: number;
    readonly height: number;
    readonly label: string;
    readonly alphaMode: string | undefined;
    readonly transparent: boolean | undefined;
    destroyed = false;

    constructor(options: {
      resource?: unknown;
      width?: number;
      height?: number;
      label?: string;
      alphaMode?: string;
      transparent?: boolean;
    }) {
      this.resource = options.resource;
      this.width = options.width ?? 0;
      this.height = options.height ?? 0;
      this.label = options.label ?? "";
      this.alphaMode = options.alphaMode;
      this.transparent = options.transparent;
    }

    destroy(): void {
      this.destroyed = true;
    }
  }

  class MockTexture {
    readonly source: MockTextureSource;
    readonly width: number;
    readonly height: number;
    readonly label: string;
    destroyed = false;

    constructor(options: {
      source?: MockTextureSource;
      width?: number;
      height?: number;
      label?: string;
    }) {
      this.source = options.source ?? {};
      this.width = options.width ?? this.source.width ?? 0;
      this.height = options.height ?? this.source.height ?? 0;
      this.label = options.label ?? "";
    }

    destroy(destroySource = false): void {
      this.destroyed = true;
      if (destroySource) {
        this.source.destroy?.();
        this.source.destroyed = true;
      }
    }
  }

  class MockApplication {
    stage = new MockContainer();
    renderer = {
      resize: vi.fn(),
    };
    canvas = {
      getContext: vi.fn(() => null),
    };
    initOptions: unknown = null;
    destroyCalls: unknown[][] = [];
    render = vi.fn();

    async init(options?: unknown): Promise<void> {
      this.initOptions = options;
      return Promise.resolve();
    }

    destroy(...args: unknown[]): void {
      this.destroyCalls.push(args);
      this.stage.destroy();
    }
  }

  return {
    textureByUrl,
    MockApplication,
    MockCanvasSource,
    MockContainer,
    MockGraphics,
    MockSprite,
    MockText,
    MockTexture,
  };
});

vi.mock("pixi.js", () => ({
  Application: pixiMock.MockApplication,
  Assets: {
    load: vi.fn(async (url: string) => pixiMock.textureByUrl.get(url)),
  },
  CanvasSource: pixiMock.MockCanvasSource,
  Container: pixiMock.MockContainer,
  Graphics: pixiMock.MockGraphics,
  Sprite: pixiMock.MockSprite,
  Text: pixiMock.MockText,
  Texture: pixiMock.MockTexture,
}));

import { VNIPlayer } from "../../src/pixi/vni-player";
import {
  applySampledLayerState,
  createLayerInstance,
} from "../../src/pixi/layer-instance";
import type { V5GLayerConfig, V5GProjectConfig } from "../../src/core/types";

class MockResizeObserver {
  observe(): void {
    return undefined;
  }

  disconnect(): void {
    return undefined;
  }
}

function createContainer(): HTMLElement {
  return {
    clientWidth: 800,
    clientHeight: 600,
    dataset: {},
    appendChild: vi.fn(),
  } as unknown as HTMLElement;
}

function createMockPixiContainer(): PixiContainer {
  return new pixiMock.MockContainer() as unknown as PixiContainer;
}

function createProject(): V5GProjectConfig {
  return {
    schemaVersion: "VNI_0.010",
    editor: { name: "VNI", version: "VNI_0.010" },
    engineTarget: { name: "cocos_creator", version: "3.8.6" },
    name: "player-test",
    stage: {
      width: 400,
      height: 300,
      coordinate: "center",
      duration: 2,
      backgroundColor: "#101827",
    },
    assets: [
      {
        id: "asset-a",
        type: "image",
        path: "assets/a.png",
        originalName: "a.png",
        width: 100,
        height: 100,
      },
      {
        id: "asset-b",
        type: "image",
        path: "assets/b.png",
        originalName: "b.png",
        width: 100,
        height: 100,
      },
    ],
    layerGroups: [
      {
        id: "group_default",
        name: "Upper",
        visible: true,
        collapsed: false,
        order: 0,
      },
      {
        id: "lower",
        name: "Lower",
        visible: true,
        collapsed: false,
        order: 1,
      },
    ],
    layers: [
      {
        id: "layer-a",
        name: "Layer A",
        type: "image",
        assetId: "asset-a",
        parentId: null,
        groupId: "lower",
        visible: true,
        locked: false,
        transform: {
          x: 0,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        opacity: 1,
        blendMode: "add",
        animations: [
          {
            id: "combo",
            type: "particle_combo",
            startTime: 0,
            duration: 1.6,
            enabled: true,
            seed: 13,
            params: {
              count: 12,
              size: 42,
              sourceOpacity: 0,
              spawnMode: 1,
              spawnRadius: 90,
              spawnRatio: 0.18,
              targetX: 320,
              targetY: 0,
              travelMode: 1,
              curve: 160,
              orbitRadius: 80,
              orbitTurns: 1,
              orbitSpeed: 1,
              orbitRatio: 0.35,
              staggerRatio: 0.28,
              trailCount: 4,
              trailSpacing: 0.045,
              trailFade: 0.55,
              vanishMode: 1,
              vanishRatio: 0.18,
              flashScale: 1.6,
              flashIntensity: 1.4,
            },
          },
        ],
        keyframes: [],
      },
      {
        id: "layer-b",
        name: "Layer B",
        type: "image",
        assetId: "asset-b",
        parentId: null,
        groupId: "group_default",
        visible: true,
        locked: false,
        transform: {
          x: 50,
          y: 0,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          anchorX: 0.5,
          anchorY: 0.5,
        },
        opacity: 1,
        blendMode: "normal",
        animations: [],
        keyframes: [],
      },
    ],
    particles: [],
  };
}

function createThreeGroupProject(): V5GProjectConfig {
  const project = createProject();
  project.layerGroups.push({
    id: "middle",
    name: "Middle",
    visible: true,
    collapsed: false,
    order: 2,
  });
  project.layers.splice(1, 0, {
    ...project.layers[1],
    id: "layer-middle",
    name: "Layer Middle",
    groupId: "middle",
  });
  return project;
}

function createRenderEffectProject(): V5GProjectConfig {
  const project = createProject();
  project.layers[0].animations = [
    {
      id: "shatter",
      type: "shatter",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 3,
      params: {
        count: 8,
        pieceSize: 32,
        force: 200,
        impactAngle: 90,
        spreadAngle: 120,
        gravity: 500,
        spin: 4,
        sourceOpacity: 0,
        fadeOut: true,
      },
    },
  ];
  project.layers[1].animations = [
    {
      id: "glow",
      type: "glow",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 4,
      params: {
        intensity: 0.75,
        spread: 0.12,
        minAlpha: 0.15,
        maxAlpha: 0.75,
        pulses: 2,
        blendMode: 2,
        keepOriginal: false,
      },
    },
  ];
  return project;
}

function createSafeGlowProject(): V5GProjectConfig {
  const project = createProject();
  project.layers[0].animations = [
    {
      id: "safe-glow",
      type: "safe_glow",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 5,
      params: {
        spread: 0.12,
        minOpacity: 0.12,
        maxOpacity: 0.65,
        pulses: 2,
        keepOriginal: false,
      },
    },
  ];
  project.layers[1].animations = [];
  return project;
}

async function createInitializedPlayer(
  options: {
    onPlayingChange?: (isPlaying: boolean) => void;
    project?: V5GProjectConfig;
    autoTick?: boolean;
  } = {},
): Promise<VNIPlayer> {
  vi.stubGlobal("window", { devicePixelRatio: 1 });
  vi.stubGlobal("ResizeObserver", MockResizeObserver);
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1),
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
  pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

  const player = new VNIPlayer({
    parent: createMockPixiContainer(),
    diagnosticsElement: createContainer(),
    viewport: { width: 800, height: 600 },
    projectId: "player-test",
    bundleId: "legacy",
    profileId: "legacy_full",
    profilePurpose: "legacy",
    assetScale: 1,
    project: options.project ?? createProject(),
    assetUrls: {
      "assets/a.png": "/a.png",
      "assets/b.png": "/b.png",
    },
    autoTick: options.autoTick,
    onPlayingChange: options.onPlayingChange,
  });
  await player.init();
  return player;
}

describe("VNIPlayer", () => {
  it("mounts only runtime content and never renders exported stage background", async () => {
    const player = await createInitializedPlayer();
    const internals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
      contentRoot: InstanceType<typeof pixiMock.MockContainer>;
    };

    expect(internals.stageRoot.children).toEqual([internals.contentRoot]);
  });

  it("destroys only its own display tree and leaves the external Pixi host alive", async () => {
    const player = await createInitializedPlayer();
    const internals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
    };
    const parent = internals.stageRoot.parent;

    player.destroy();

    expect(parent?.children).not.toContain(internals.stageRoot);
    expect(internals.stageRoot.parent).toBeNull();
  });

  it("creates text layer instances and fails fast for invalid image layers", () => {
    const project = createProject();
    const imageLayer = project.layers[0];
    const asset = project.assets[0];
    const textLayer: V5GLayerConfig = {
      ...imageLayer,
      type: "text",
      assetId: null,
      text: "Hello",
      animations: [],
    };

    const textInstance = createLayerInstance(textLayer, new Map(), new Map());
    expect(textInstance.display).toBeInstanceOf(pixiMock.MockText);
    expect(textInstance.display.children).toHaveLength(0);
    expect(textInstance.texture).toBeNull();

    expect(() =>
      createLayerInstance(
        { ...imageLayer, assetId: null },
        new Map(),
        new Map(),
      ),
    ).toThrow("requires assetId");
    expect(() =>
      createLayerInstance(imageLayer, new Map(), new Map([[asset.id, asset]])),
    ).toThrow("missing texture");
    expect(() =>
      createLayerInstance(
        { ...imageLayer, type: "group" } as V5GLayerConfig,
        new Map(),
        new Map(),
      ),
    ).toThrow("Unsupported V5G layer type");
  });

  it("uses the renderable sprite as the layer display and applies blend mode directly", () => {
    const project = createProject();
    const imageLayer = project.layers[0];
    const asset = project.assets[0];
    const texture = { width: 100, height: 100 } as unknown as PixiTexture;
    const instance = createLayerInstance(
      imageLayer,
      new Map([[asset.id, texture]]),
      new Map([[asset.id, asset]]),
    );

    applySampledLayerState(
      instance,
      {
        layerId: imageLayer.id,
        transform: { ...imageLayer.transform },
        baseOpacity: 1,
        opacity: 1,
        visible: true,
        renderImageDisplay: true,
        hasActiveParticleAnimation: false,
        hasActiveRenderEffect: false,
        hasActiveSafeGlowAnimation: false,
        blendMode: "add",
      },
      project.stage,
    );

    expect(instance.display).toBeInstanceOf(pixiMock.MockSprite);
    expect(instance.display.children).toHaveLength(0);
    expect(instance.display.blendMode).toBe("add");
    expect(instance.display.groupBlendMode).toBe("add");
  });

  it("derives transparent matte textures for additive JPEG layers", async () => {
    const project = createProject();
    project.assets[0] = {
      ...project.assets[0],
      path: "assets/a.jpg",
      originalName: "a.jpg",
      width: 2,
      height: 1,
    };
    project.layers[0] = {
      ...project.layers[0],
      blendMode: "add",
    };

    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 64, 128, 0, 255]);
    const imageData = { data: pixels } as ImageData;
    const context = {
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      getImageData: vi.fn(() => imageData),
      putImageData: vi.fn(),
    };
    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.jpg", {
      width: 2,
      height: 1,
      source: { resource: {} },
    });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      diagnosticsElement: createContainer(),
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project,
      assetUrls: {
        "assets/a.jpg": "/a.jpg",
        "assets/b.png": "/b.png",
      },
      autoTick: false,
    });

    await player.init();

    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockSprite>;
          texture: InstanceType<typeof pixiMock.MockTexture>;
        }
      >;
      ownedTextures: Set<InstanceType<typeof pixiMock.MockTexture>>;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const derivedTexture = layerA?.texture;

    expect(derivedTexture).toBeInstanceOf(pixiMock.MockTexture);
    expect(derivedTexture?.source).toBeInstanceOf(pixiMock.MockCanvasSource);
    expect(layerA?.display.texture).toBe(derivedTexture);
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(context.drawImage).toHaveBeenCalledWith({}, 0, 0, 2, 1);
    expect([...pixels]).toEqual([0, 0, 0, 0, 128, 255, 0, 128]);
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0);

    player.destroy();

    expect(derivedTexture?.destroyed).toBe(true);
    expect([...internals.ownedTextures]).toEqual([]);
  });

  it("keeps shared JPEG textures opaque when any layer uses normal blending", async () => {
    const project = createProject();
    project.assets[0] = {
      ...project.assets[0],
      path: "assets/a.jpg",
      originalName: "a.jpg",
      width: 2,
      height: 1,
    };
    project.layers[0] = {
      ...project.layers[0],
      blendMode: "add",
    };
    project.layers[1] = {
      ...project.layers[1],
      assetId: "asset-a",
      blendMode: "normal",
    };

    const canvas = {
      width: 0,
      height: 0,
      getContext: vi.fn(),
    };
    vi.stubGlobal("document", {
      createElement: vi.fn(() => canvas),
    });
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const originalTexture = {
      width: 2,
      height: 1,
      source: { resource: {} },
    };
    pixiMock.textureByUrl.set("/a.jpg", originalTexture);
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      diagnosticsElement: createContainer(),
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project,
      assetUrls: {
        "assets/a.jpg": "/a.jpg",
        "assets/b.png": "/b.png",
      },
      autoTick: false,
    });

    await player.init();

    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          texture: unknown;
        }
      >;
      ownedTextures: Set<InstanceType<typeof pixiMock.MockTexture>>;
    };

    expect(internals.layerInstances.get("layer-a")?.texture).toBe(
      originalTexture,
    );
    expect(internals.layerInstances.get("layer-b")?.texture).toBe(
      originalTexture,
    );
    expect(internals.ownedTextures.size).toBe(0);
    expect(canvas.getContext).not.toHaveBeenCalled();

    player.destroy();
  });

  it("draws particles in per-layer containers and updates diagnostics", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const container = createContainer();
    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      diagnosticsElement: container,
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
    });

    await player.init();
    player.seek(0.8);

    const internals = player as unknown as {
      contentRoot: InstanceType<typeof pixiMock.MockContainer>;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          safeGlowDisplay: InstanceType<typeof pixiMock.MockContainer>;
          effectDisplay: InstanceType<typeof pixiMock.MockContainer>;
          particleDisplay: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
      groupContainersById: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const layerB = internals.layerInstances.get("layer-b");
    const lowerGroup = internals.groupContainersById.get("lower");
    const defaultGroup = internals.groupContainersById.get("group_default");

    expect(layerA).toBeDefined();
    expect(layerB).toBeDefined();
    expect(lowerGroup).toBeDefined();
    expect(defaultGroup).toBeDefined();
    expect(internals.contentRoot.children).toHaveLength(3);
    expect(internals.contentRoot.children[0]).toBe(lowerGroup);
    expect(internals.contentRoot.children[2]).toBe(defaultGroup);
    expect(lowerGroup?.children).toEqual([
      layerA?.display,
      layerA?.safeGlowDisplay,
      layerA?.effectDisplay,
      layerA?.particleDisplay,
    ]);
    expect(defaultGroup?.children).toEqual([
      layerB?.display,
      layerB?.safeGlowDisplay,
      layerB?.effectDisplay,
      layerB?.particleDisplay,
    ]);
    expect(layerA?.display.visible).toBe(false);
    expect(layerA?.particleDisplay.children.length).toBeGreaterThan(0);
    expect(Number(container.dataset.v5gParticleSprites)).toBeGreaterThan(0);

    player.destroy();

    expect(container.dataset.v5gParticleSprites).toBeUndefined();
    expect(container.dataset.v5gProjectId).toBeUndefined();
    expect(container.dataset.vniParticleSprites).toBeUndefined();
    expect(container.dataset.vniSafeGlowSprites).toBeUndefined();
    expect(container.dataset.vniProjectId).toBeUndefined();
  });

  it("fails fast when asset URLs or texture sizes are wrong", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/wrong.png", { width: 64, height: 64 });

    const missingUrlPlayer = new VNIPlayer({
      parent: createMockPixiContainer(),
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {},
    });
    await expect(missingUrlPlayer.init()).rejects.toThrow(
      "missing from manifest",
    );

    const wrongSizePlayer = new VNIPlayer({
      parent: createMockPixiContainer(),
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/wrong.png",
        "assets/b.png": "/wrong.png",
      },
    });
    await expect(wrongSizePlayer.init()).rejects.toThrow(
      "texture size mismatch",
    );
  });

  it("requires init before playRange", () => {
    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
    });

    expect(() =>
      player.playRange({ range: { unit: "time", start: 0, end: 1 } }),
    ).toThrow("requires init");
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: " ",
        afterGroupId: "lower",
        beforeGroupId: "group_default",
        node: createMockPixiContainer(),
      }),
    ).toThrow("requires init");
  });

  it("exposes render-order layer groups and legal slots", async () => {
    const player = await createInitializedPlayer();

    expect(player.getLayerGroups().map((group) => group.id)).toEqual([
      "lower",
      "group_default",
    ]);
    expect(player.getLayerGroupSlots()).toEqual([
      {
        afterGroupId: "lower",
        afterGroupName: "Lower",
        beforeGroupId: "group_default",
        beforeGroupName: "Upper",
        renderIndex: 0,
      },
    ]);
  });

  it("attaches and detaches host nodes between adjacent groups", async () => {
    const container = createContainer();
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      diagnosticsElement: container,
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
    });
    await player.init();

    const node = new pixiMock.MockContainer();
    const destroySpy = vi.spyOn(node, "destroy");
    const dispose = player.attachNodeBetweenLayerGroups({
      id: "host-node",
      afterGroupId: "lower",
      beforeGroupId: "group_default",
      node: node as unknown as PixiContainer,
    });
    const internals = player as unknown as {
      contentRoot: InstanceType<typeof pixiMock.MockContainer>;
    };
    const slotContainer = internals.contentRoot.children[1];

    expect(slotContainer.children).toEqual([node]);
    expect(container.dataset.vniMountedNodes).toBe("1");
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: "host-node",
        afterGroupId: "lower",
        beforeGroupId: "group_default",
        node: createMockPixiContainer(),
      }),
    ).toThrow("Duplicate VNI mounted node id");
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: " ",
        afterGroupId: "lower",
        beforeGroupId: "group_default",
        node: createMockPixiContainer(),
      }),
    ).toThrow("mounted node id");

    dispose();
    dispose();

    expect(slotContainer.children).toEqual([]);
    expect(destroySpy).not.toHaveBeenCalled();
    expect(container.dataset.vniMountedNodes).toBe("0");
    expect(() => player.detachMountedNode("host-node")).toThrow("Unknown");
  });

  it("destroys mounted nodes only when destroyOnDetach is true", async () => {
    const player = await createInitializedPlayer();
    const node = new pixiMock.MockContainer();
    const destroySpy = vi.spyOn(node, "destroy");

    player.attachNodeBetweenLayerGroups({
      id: "destroy-me",
      afterGroupId: "lower",
      beforeGroupId: "group_default",
      node: node as unknown as PixiContainer,
      destroyOnDetach: true,
    });
    player.clearMountedNodes();

    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("renders deterministic render effects and clears start-frame leakage", async () => {
    const player = await createInitializedPlayer({
      project: createRenderEffectProject(),
    });
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          effectDisplay: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const layerB = internals.layerInstances.get("layer-b");
    if (!layerA || !layerB) throw new Error("Missing test layers.");

    player.seek(0.5);

    expect(layerA.display.visible).toBe(false);
    expect(layerA.effectDisplay.children.length).toBeGreaterThan(0);
    expect(layerB.display.visible).toBe(false);
    expect(layerB.effectDisplay.children.length).toBeGreaterThan(0);

    player.seek(0);

    expect(layerA.effectDisplay.children).toEqual([]);
    expect(layerB.effectDisplay.children).toEqual([]);
  });

  it("renders safe glow as an independent inherited-blend overlay", async () => {
    const container = createContainer();
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      diagnosticsElement: container,
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createSafeGlowProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
    });
    await player.init();
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          safeGlowDisplay: InstanceType<typeof pixiMock.MockContainer>;
          effectDisplay: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    if (!layerA) throw new Error("Missing layer-a instance.");

    expect(layerA.display.visible).toBe(false);
    expect(layerA.safeGlowDisplay.children).toHaveLength(1);
    expect(layerA.effectDisplay.children).toHaveLength(0);
    expect(layerA.safeGlowDisplay.children[0].blendMode).toBe("add");
    expect(container.dataset.vniSafeGlowSprites).toBe("1");
    expect(container.dataset.vniRenderEffectSprites).toBe("0");

    player.destroy();

    expect(container.dataset.vniSafeGlowSprites).toBeUndefined();
  });

  it("fails fast for reversed, unknown, and non-adjacent group slots", async () => {
    const player = await createInitializedPlayer({
      project: createThreeGroupProject(),
    });
    const node = createMockPixiContainer();

    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: "reverse",
        afterGroupId: "group_default",
        beforeGroupId: "middle",
        node,
      }),
    ).toThrow("not adjacent");
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: "unknown",
        afterGroupId: "missing",
        beforeGroupId: "group_default",
        node,
      }),
    ).toThrow("Unknown VNI layer group");
    expect(() =>
      player.attachNodeBetweenLayerGroups({
        id: "non-adjacent",
        afterGroupId: "lower",
        beforeGroupId: "group_default",
        node,
      }),
    ).toThrow("not adjacent");
  });

  it("attaches project images using loaded textures and display compensation", async () => {
    const player = await createInitializedPlayer();
    const dispose = player.attachImageBetweenLayerGroups({
      id: "asset-node",
      afterGroupId: "lower",
      beforeGroupId: "group_default",
      assetId: "asset-b",
      x: 25,
      y: 35,
      scaleX: 2,
      scaleY: 3,
      rotation: 90,
      anchorX: 0.25,
      anchorY: 0.75,
      opacity: 0.5,
      blendMode: "add",
    });
    const internals = player as unknown as {
      contentRoot: InstanceType<typeof pixiMock.MockContainer>;
    };
    const slotContainer = internals.contentRoot.children[1];
    const sprite = slotContainer.children[0];

    expect(sprite.position).toMatchObject({ x: 25, y: 35 });
    expect(sprite.scale).toMatchObject({ x: 2, y: 3 });
    expect(sprite.rotation).toBeCloseTo(Math.PI / 2);
    expect(sprite.alpha).toBe(0.5);
    expect(sprite.blendMode).toBe("add");

    dispose();
    expect(slotContainer.children).toEqual([]);
    expect(() =>
      player.attachImageBetweenLayerGroups({
        id: "missing-asset",
        afterGroupId: "lower",
        beforeGroupId: "group_default",
        assetId: "missing",
      }),
    ).toThrow("Unknown VNI asset id");
  });

  it("attaches external images from explicit URLs", async () => {
    pixiMock.textureByUrl.set("/external.png", { width: 64, height: 32 });
    const player = await createInitializedPlayer();
    const dispose = await player.attachExternalImageBetweenLayerGroups({
      id: "external-asset",
      afterGroupId: "lower",
      beforeGroupId: "group_default",
      imageUrl: "/external.png",
      label: "assets/external.png",
      x: 12,
      y: 18,
      scaleX: 0.5,
      scaleY: 0.75,
      opacity: 0.8,
    });
    const internals = player as unknown as {
      contentRoot: InstanceType<typeof pixiMock.MockContainer>;
    };
    const slotContainer = internals.contentRoot.children[1];
    const sprite = slotContainer.children[0];

    expect(sprite.label).toBe("VNI mounted external image assets/external.png");
    expect(sprite.position).toMatchObject({ x: 12, y: 18 });
    expect(sprite.scale).toMatchObject({ x: 0.5, y: 0.75 });
    expect(sprite.alpha).toBe(0.8);

    dispose();
    expect(slotContainer.children).toEqual([]);
    await expect(
      player.attachExternalImageBetweenLayerGroups({
        id: "missing-external",
        afterGroupId: "lower",
        beforeGroupId: "group_default",
        imageUrl: "/missing.png",
      }),
    ).rejects.toThrow("failed to load a valid Pixi texture");
  });

  it("clears mounted nodes and diagnostics on destroy", async () => {
    const container = createContainer();
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      diagnosticsElement: container,
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
    });
    await player.init();
    player.attachNodeBetweenLayerGroups({
      id: "destroyed",
      afterGroupId: "lower",
      beforeGroupId: "group_default",
      node: createMockPixiContainer(),
    });

    expect(container.dataset.vniLayerGroups).toBe("2");
    expect(container.dataset.vniLayerGroupSlots).toBe("1");
    expect(container.dataset.vniMountedNodes).toBe("1");

    player.destroy();

    expect(container.dataset.vniLayerGroups).toBeUndefined();
    expect(container.dataset.vniLayerGroupSlots).toBeUndefined();
    expect(container.dataset.vniMountedNodes).toBeUndefined();
  });

  it("plays a non-looping time range, fires markers before complete, and stops", async () => {
    const playingChanges: boolean[] = [];
    const player = await createInitializedPlayer({
      onPlayingChange: (isPlaying) => playingChanges.push(isPlaying),
    });
    const events: string[] = [];
    player.addPlaybackEvent({
      id: "quarter",
      at: { unit: "time", at: 0.25 },
      listener: (event) => events.push(`${event.id}:${event.loopIndex}`),
    });
    player.addPlaybackEvent({
      id: "end",
      at: { unit: "time", at: 0.6 },
      listener: (event) => events.push(`${event.id}:${event.loopIndex}`),
    });
    player.onPlaybackComplete((event) => {
      events.push(`complete:${event.currentTime}:${event.loopIndex}`);
    });

    player.playRange({
      range: { unit: "time", start: 0, end: 0.6 },
      loop: false,
    });
    player.update(0.6);

    expect(events).toEqual(["quarter:0", "end:0"]);
    expect(player.getPlaybackState()).toMatchObject({
      mode: "range",
      phase: "particle-draining",
      isPlaying: false,
      isDrainingParticles: true,
    });
    player.update(1.6);
    expect(events).toEqual(["quarter:0", "end:0", "complete:0.6:0"]);
    expect(player.isPlaying()).toBe(false);
    expect(player.getTime()).toBe(0.6);
    expect(playingChanges).toEqual([true, false]);
  });

  it("supports host-driven playback without starting RAF when autoTick is false", async () => {
    const requestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });
    const requestRender = vi.fn();

    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      viewport: { width: 800, height: 600 },
      requestRender,
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
      autoTick: false,
    });
    await player.init();
    expect(requestRender).toHaveBeenCalledTimes(1);
    requestRender.mockClear();
    requestAnimationFrame.mockClear();
    const events: string[] = [];
    player.onPlaybackComplete(() => events.push("complete"));

    player.playRange({
      range: { unit: "time", start: 0, end: 0.6 },
      loop: false,
    });

    expect(requestAnimationFrame).not.toHaveBeenCalled();
    player.update(0.6);
    expect(requestRender).toHaveBeenCalled();
    expect(events).toEqual([]);
    requestRender.mockClear();
    player.update(1.6);
    expect(requestRender).toHaveBeenCalled();
    expect(events).toEqual(["complete"]);
  });

  it("accepts fitPadding 0 for one-to-one stage fitting", async () => {
    const player = await createInitializedPlayer();
    const defaultInternals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
    };
    expect(defaultInternals.stageRoot.scale.x).toBeCloseTo(536 / 300);

    const paddedRequestAnimationFrame = vi.fn(() => 1);
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal("requestAnimationFrame", paddedRequestAnimationFrame);
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });
    const noPaddingPlayer = new VNIPlayer({
      parent: createMockPixiContainer(),
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
      fitPadding: 0,
    });
    await noPaddingPlayer.init();
    const noPaddingInternals = noPaddingPlayer as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
    };
    expect(noPaddingInternals.stageRoot.scale.x).toBeCloseTo(2);
    expect(() => {
      new VNIPlayer({
        parent: createMockPixiContainer(),
        projectId: "player-test",
        bundleId: "legacy",
        profileId: "legacy_full",
        profilePurpose: "legacy",
        assetScale: 1,
        project: createProject(),
        assetUrls: {
          "assets/a.png": "/a.png",
          "assets/b.png": "/b.png",
        },
        fitPadding: -1,
      });
    }).toThrow("fitPadding");
  });

  it("inherits loop state for ranges and supports frame playback markers", async () => {
    const player = await createInitializedPlayer();
    const events: string[] = [];
    player.setLoop(false);
    player.addPlaybackEvent({
      id: "frame-marker",
      at: { unit: "frame", at: 30, fps: 60 },
      listener: (event) => events.push(`${event.id}:${event.time}`),
    });
    player.onPlaybackComplete(() => events.push("complete"));

    player.playRange({ range: { unit: "time", start: 0, end: 0.5 } });
    player.playRange({ range: { unit: "time", start: 0, end: 0.75 } });
    player.update(0.75);
    player.update(1.6);

    expect(events).toEqual(["frame-marker:0.5", "complete"]);
    expect(player.isPlaying()).toBe(false);
  });

  it("advances through RAF ticks and resets full playback from the end", async () => {
    let rafCallback: FrameRequestCallback | null = null;
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        rafCallback = callback;
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const player = new VNIPlayer({
      parent: createMockPixiContainer(),
      viewport: { width: 800, height: 600 },
      projectId: "player-test",
      bundleId: "legacy",
      profileId: "legacy_full",
      profilePurpose: "legacy",
      assetScale: 1,
      project: createProject(),
      assetUrls: {
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
    });
    await player.init();
    player.play();
    player.play();
    expect(rafCallback).not.toBeNull();
    const callback = rafCallback as unknown as FrameRequestCallback;
    callback(performance.now() + 500);
    expect(player.getTime()).toBeGreaterThan(0);

    player.setLoop(false);
    player.update(2);
    expect(player.getTime()).toBe(2);
    player.update(1.6);
    player.play();
    expect(player.getTime()).toBe(0);
  });

  it("loops a range without dropping markers across multiple wrapped segments", async () => {
    const player = await createInitializedPlayer();
    const events: string[] = [];
    player.addPlaybackEvent({
      id: "a",
      at: { unit: "time", at: 0.3 },
      listener: (event) => events.push(`${event.id}:${event.loopIndex}`),
    });
    player.addPlaybackEvent({
      id: "b",
      at: { unit: "time", at: 0.5 },
      listener: (event) => events.push(`${event.id}:${event.loopIndex}`),
    });
    player.onPlaybackComplete(() => events.push("complete"));

    player.playRange({
      range: { unit: "time", start: 0.2, end: 0.6 },
      loop: true,
    });
    player.update(1);

    expect(events).toEqual(["a:0", "b:0", "a:1", "b:1", "a:2"]);
    expect(player.isPlaying()).toBe(true);
    expect(player.getTime()).toBeCloseTo(0.4);
  });

  it("normalizes frame ranges and open-ended ranges", async () => {
    const player = await createInitializedPlayer();
    const completed: number[] = [];
    player.onPlaybackComplete((event) => completed.push(event.endTime));

    player.playRange({
      range: { unit: "frame", start: 30, end: 60, fps: 60 },
      loop: false,
    });
    expect(player.getTime()).toBe(0.5);
    player.update(0.5);
    expect(completed).toEqual([]);
    player.update(1.6);
    expect(completed).toEqual([1]);

    player.playRange({
      range: { unit: "time", start: 1, end: -1 },
      loop: false,
    });
    player.update(1);
    expect(completed).toEqual([1]);
    player.update(1.6);
    expect(completed).toEqual([1, 2]);
  });

  it("rejects invalid ranges and duplicate or unknown marker ids", async () => {
    const player = await createInitializedPlayer();

    expect(() =>
      player.playRange({
        range: { unit: "frame", start: 0, end: 1, fps: 0 },
      }),
    ).toThrow("fps");
    expect(() =>
      player.playRange({
        range: { unit: "frame", start: 0.5, end: 1, fps: 60 },
      }),
    ).toThrow("start frame");
    expect(() =>
      player.playRange({ range: { unit: "time", start: 1, end: 1 } }),
    ).toThrow("Invalid VNI playback range");
    expect(() =>
      player.playRange({ range: { unit: "time", start: Number.NaN, end: 1 } }),
    ).toThrow("finite number");
    expect(() =>
      player.playRange({
        range: { unit: "frame", start: 0, end: 1 } as any,
      }),
    ).toThrow("fps");
    expect(() => player.update(Number.NaN)).toThrow("deltaSeconds");

    player.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.2 },
      listener: () => undefined,
    });
    expect(() =>
      player.addPlaybackEvent({
        id: "marker",
        at: { unit: "time", at: 0.3 },
        listener: () => undefined,
      }),
    ).toThrow("Duplicate");
    expect(() => player.clearPlaybackEvent("missing")).toThrow("Unknown");
    expect(() =>
      player.addPlaybackEvent({
        id: "late",
        at: { unit: "time", at: 3 },
        listener: () => undefined,
      }),
    ).toThrow("within project duration");
  });

  it("supports marker and complete disposers and once markers", async () => {
    const player = await createInitializedPlayer();
    const events: string[] = [];
    const removePersistent = player.addPlaybackEvent({
      id: "persistent",
      at: { unit: "time", at: 0.3 },
      listener: () => events.push("persistent"),
    });
    removePersistent();
    removePersistent();
    player.addPlaybackEvent({
      id: "once",
      at: { unit: "time", at: 0.4 },
      once: true,
      listener: () => events.push("once"),
    });
    const removeComplete = player.onPlaybackComplete(() =>
      events.push("complete"),
    );
    removeComplete();
    removeComplete();

    player.playRange({
      range: { unit: "time", start: 0.2, end: 0.6 },
      loop: true,
    });
    player.update(0.8);

    expect(events).toEqual(["once"]);
  });

  it("does not trigger markers from seek, restart, or paused updates", async () => {
    const player = await createInitializedPlayer();
    const events: string[] = [];
    player.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.4 },
      listener: () => events.push("marker"),
    });

    player.seek(0.5);
    player.restart();
    player.playRange({
      range: { unit: "time", start: 0, end: 1 },
      loop: false,
    });
    player.pause();
    player.update(1);

    expect(events).toEqual([]);
  });

  it("can clear all markers before playback", async () => {
    const player = await createInitializedPlayer();
    const events: string[] = [];
    player.addPlaybackEvent({
      id: "marker",
      at: { unit: "time", at: 0.4 },
      listener: () => events.push("marker"),
    });
    player.clearPlaybackEvents();
    player.playRange({
      range: { unit: "time", start: 0, end: 0.5 },
      loop: false,
    });
    player.update(0.5);

    expect(events).toEqual([]);
  });

  it("propagates marker and complete listener errors", async () => {
    const player = await createInitializedPlayer();
    player.addPlaybackEvent({
      id: "bad",
      at: { unit: "time", at: 0.2 },
      listener: () => {
        throw new Error("marker failed");
      },
    });
    player.playRange({
      range: { unit: "time", start: 0, end: 0.4 },
      loop: false,
    });

    expect(() => player.update(0.2)).toThrow("marker failed");

    const completePlayer = await createInitializedPlayer();
    completePlayer.onPlaybackComplete(() => {
      throw new Error("complete failed");
    });
    completePlayer.setLoop(false);
    completePlayer.play();
    expect(() => completePlayer.update(2)).toThrow("complete failed");
  });

  it("supports segmented hold playback, user-requested ending, and particle drain", async () => {
    const player = await createInitializedPlayer();
    const completed: string[] = [];
    player.onPlaybackComplete((event) =>
      completed.push(`${event.currentTime}:${event.loopIndex}`),
    );

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.5 },
      loopEnd: { unit: "time", at: 0.5 },
    });
    player.setLoop(false);
    player.update(0.8);

    expect(player.getTime()).toBe(0.5);
    expect(player.getPlaybackState()).toMatchObject({
      mode: "segmented",
      phase: "loop",
      keepParticlesAlive: true,
      isPlaying: true,
    });
    expect(player.getPlaybackState().liveParticleCount).toBeGreaterThan(0);
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          particleDisplay: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    if (!layerA) throw new Error("Missing layer-a instance.");
    const firstHoldParticles = layerA.particleDisplay.children.map((child) => ({
      x: child.position.x,
      y: child.position.y,
      alpha: child.alpha,
      rotation: child.rotation,
      scaleX: child.scale.x,
      scaleY: child.scale.y,
    }));

    player.update(0.5);
    expect(player.getTime()).toBe(0.5);
    expect(player.getPlaybackState().phase).toBe("loop");
    const secondHoldParticles = layerA.particleDisplay.children.map(
      (child) => ({
        x: child.position.x,
        y: child.position.y,
        alpha: child.alpha,
        rotation: child.rotation,
        scaleX: child.scale.x,
        scaleY: child.scale.y,
      }),
    );
    expect(secondHoldParticles.length).toBeGreaterThan(0);
    expect(secondHoldParticles).not.toEqual(firstHoldParticles);

    player.requestSegmentedPlaybackEnd();
    expect(player.getPlaybackState().phase).toBe("ending");
    player.update(1.5);
    expect(player.getPlaybackState()).toMatchObject({
      phase: "particle-draining",
      isPlaying: false,
      isDrainingParticles: true,
    });
    expect(completed).toEqual([]);

    player.update(1.6);
    expect(player.getPlaybackState()).toMatchObject({
      phase: "complete",
      isDrainingParticles: false,
      liveParticleCount: 0,
    });
    expect(completed).toEqual(["2:0"]);
  });

  it("supports segmented range loops and explicit errors outside segmented state", async () => {
    const player = await createInitializedPlayer();

    expect(() => player.requestSegmentedPlaybackEnd()).toThrow(
      "No active VNI segmented playback",
    );
    expect(() =>
      player.play({
        mode: "segmented",
        loopStart: { unit: "time", at: 1 },
        loopEnd: { unit: "time", at: 0.5 },
      }),
    ).toThrow("loopStart <= loopEnd");

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.4 },
      loopEnd: { unit: "time", at: 0.8 },
      keepParticlesAlive: false,
    });
    player.update(1.1);

    expect(player.getPlaybackState()).toMatchObject({
      mode: "segmented",
      phase: "loop",
      loopIndex: 1,
      keepParticlesAlive: false,
    });
    expect(player.getTime()).toBeCloseTo(0.7);

    player.seek(0.2);
    expect(player.getPlaybackState()).toMatchObject({
      mode: "timeline",
      phase: "idle",
      isDrainingParticles: false,
    });
    expect(player.getTime()).toBe(0.2);
  });
});
