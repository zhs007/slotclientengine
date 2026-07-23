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
    frame?: MockRectangle;
  }

  const textureByUrl = new Map<string, MockTextureData>();
  const assetsLoad = vi.fn(async (input: string | { src: string }) =>
    textureByUrl.get(typeof input === "string" ? input : input.src),
  );

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

    addChildAt(child: MockContainer, index: number): MockContainer {
      child.parent?.removeChild(child);
      child.parent = this;
      const insertionIndex = Math.max(0, Math.min(index, this.children.length));
      this.children.splice(insertionIndex, 0, child);
      return child;
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

  class MockRectangle {
    constructor(
      readonly x: number,
      readonly y: number,
      readonly width: number,
      readonly height: number,
    ) {}
  }

  class MockSprite extends MockContainer {
    tint = 0xffffff;

    constructor(readonly texture: { width: number; height: number }) {
      super();
    }
  }

  class MockText extends MockContainer {
    text = "";

    constructor(readonly options: unknown) {
      super();
      if (
        typeof options === "object" &&
        options !== null &&
        "text" in options
      ) {
        this.text = String((options as { text: unknown }).text);
      }
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
    readonly frame: MockRectangle;
    destroyed = false;

    constructor(options: {
      source?: MockTextureSource;
      width?: number;
      height?: number;
      label?: string;
      frame?: MockRectangle;
    }) {
      this.source = options.source ?? {};
      this.width =
        options.width ?? options.frame?.width ?? this.source.width ?? 0;
      this.height =
        options.height ?? options.frame?.height ?? this.source.height ?? 0;
      this.label = options.label ?? "";
      this.frame =
        options.frame ?? new MockRectangle(0, 0, this.width, this.height);
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
    assetsLoad,
    MockApplication,
    MockCanvasSource,
    MockContainer,
    MockGraphics,
    MockRectangle,
    MockSprite,
    MockText,
    MockTexture,
  };
});

vi.mock("pixi.js", () => ({
  Application: pixiMock.MockApplication,
  Assets: {
    load: pixiMock.assetsLoad,
  },
  CanvasSource: pixiMock.MockCanvasSource,
  Container: pixiMock.MockContainer,
  Graphics: pixiMock.MockGraphics,
  Rectangle: pixiMock.MockRectangle,
  Sprite: pixiMock.MockSprite,
  Text: pixiMock.MockText,
  Texture: pixiMock.MockTexture,
}));

import { VNIPlayer } from "../../src/pixi/vni-player";
import {
  applySampledLayerState,
  createLayerInstance,
} from "../../src/pixi/layer-instance";
import {
  applyPrecomposedLightMaskPixels,
  createPrecomposedLightMaskKey,
} from "../../src/pixi/precomposed-light-mask";
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

function createMockCanvas(
  context: ReturnType<typeof createMockCanvasContext>,
): HTMLCanvasElement {
  return {
    width: 0,
    height: 0,
    getContext: vi.fn(() => context),
  } as unknown as HTMLCanvasElement;
}

function createMockCanvasContext(imageData: ImageData) {
  return {
    save: vi.fn(),
    translate: vi.fn(),
    rotate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    restore: vi.fn(),
    getImageData: vi.fn(() => imageData),
    putImageData: vi.fn(),
  };
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
        blendMode: "normal",
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

function createStaticProject(): V5GProjectConfig {
  const project = createProject();
  for (const layer of project.layers) {
    layer.animations = [];
  }
  return project;
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

function createMovingParticleProject(): V5GProjectConfig {
  const project = createProject();
  const layer = project.layers[0];
  layer.transform = {
    ...layer.transform,
    x: 0,
    y: 0,
  };
  layer.blendMode = "normal";
  layer.animations = [
    {
      id: "twinkle",
      type: "particle_twinkle",
      startTime: 0,
      duration: 1.5,
      enabled: true,
      seed: 31,
      params: {
        radius: 0,
        count: 80,
        spawnInterval: 0.1,
        twinkleDuration: 0.8,
        batchMin: 2,
        batchMax: 2,
        size: 24,
      },
    },
    {
      id: "move",
      type: "move",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 32,
      params: {
        fromX: 0,
        fromY: 0,
        toX: 100,
        toY: 0,
        baseX: 0,
        baseY: 0,
        easing: "linear",
      },
    },
    {
      id: "fade",
      type: "fade",
      startTime: 0.5,
      duration: 0.1,
      enabled: true,
      seed: 33,
      params: {
        fromOpacity: 1,
        toOpacity: 0,
        easing: "linear",
      },
    },
  ];
  project.layers[1].animations = [];
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
  project.assets[0] = {
    ...project.assets[0],
    path: "assets/a.webp",
    originalName: "a.webp",
  };
  project.layers[0].blendMode = "add";
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

function createTextLayerProject(): V5GProjectConfig {
  const project = createStaticProject();
  project.layers[1] = {
    ...project.layers[1],
    id: "text-layer",
    name: "Text Layer",
    type: "text",
    assetId: null,
    text: "Original",
    animations: [
      {
        id: "text-scale",
        type: "scale_up",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          fromScaleX: 1,
          fromScaleY: 1,
          toScaleX: 2,
          toScaleY: 2,
        },
      },
    ],
  };
  return project;
}

function createChaserLightProject(): V5GProjectConfig {
  const project = createStaticProject();
  project.layers[0].animations = [
    {
      id: "chaser",
      type: "chaser_light",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 1,
      params: {
        totalCount: 6,
        spacing: 80,
        lightDuration: 0.08,
        interval: 0.04,
        trajectory: 0,
        radius: 100,
        centerX: 0,
        centerY: 0,
        endX: 200,
        endY: 0,
        curve: 80,
        lightSize: 40,
        dimAlpha: 0.1,
        keepOriginal: false,
      },
    },
  ];
  return project;
}

function createSequenceProject(): V5GProjectConfig {
  const project = createStaticProject();
  project.schemaVersion = "VNI_0.070";
  project.editor.version = "VNI_0.070";
  project.layers[0] = {
    ...project.layers[0],
    type: "sequence",
    assetId: null,
    sequence: {
      frameAssetIds: ["asset-a", "asset-b"],
      cycleDuration: 1,
      loop: true,
    },
  };
  return project;
}

function createCardCarouselProject(): V5GProjectConfig {
  const project = createSequenceProject();
  project.schemaVersion = "VNI_0.095";
  project.editor.version = "VNI_0.095";
  project.stage.duration = 6.1;
  project.layers[0].animations = [
    {
      id: "carousel",
      type: "card_carousel_3d",
      startTime: 0,
      duration: 6.1,
      enabled: true,
      seed: 1,
      params: {
        phasePreviewMode: "full_demo",
        cardCount: 7,
        targetIndex: 2,
        rounds: 3,
        direction: 1,
        introDuration: 1.2,
        introSpeed: 0.22,
        revealDirection: 0,
        revealStagger: 0.08,
        revealOffsetX: 90,
        revealScaleFrom: 0.72,
        demoIdleDuration: 1.2,
        idleSpeed: 0.18,
        fastDuration: 1.1,
        fastSpeed: 2.8,
        accelRatio: 0.28,
        stopDuration: 1.6,
        holdDuration: 1,
        stopOvershoot: 0.18,
        finalPop: 0.12,
        finalGlow: 0.18,
        radius: 360,
        cardSpacing: 1,
        perspective: 0.72,
        slices: 3,
        visibleRange: 0.72,
        cardSize: 360,
        centerScale: 1.12,
        sideScale: 0.72,
        sideAlpha: 0.38,
        shadeStrength: 0.42,
        curve: 0.55,
        tilt: 8,
        sourceOpacity: 0,
        hideBack: true,
        keepOriginal: false,
      },
    },
  ];
  return project;
}

function createDeterministicEffectProject(): V5GProjectConfig {
  const project = createStaticProject();
  project.schemaVersion = "VNI_0.070";
  project.editor.version = "VNI_0.070";
  project.layers[0].animations = [
    {
      id: "energy-ring",
      type: "energy_ring",
      startTime: 0,
      duration: 1,
      enabled: true,
      seed: 7,
      params: {
        ringCount: 2,
        startScale: 0.25,
        endScale: 2.4,
        sourceOpacity: 0,
        alpha: 1,
        stagger: 0.1,
        rotation: 60,
        pulse: 0.08,
        vanishMode: 1,
        additive: true,
      },
    },
  ];
  return project;
}

function createMaskedProject(showSourceLayer: boolean): V5GProjectConfig {
  const project = createStaticProject();
  project.layers[1].mask = {
    enabled: true,
    sourceLayerId: "layer-a",
    mode: "alpha",
    compositeMode: "precompose_light_alpha",
    showSourceLayer,
  };
  return project;
}

function createPrecomposedMaskProject(): V5GProjectConfig {
  const project = createMaskedProject(false);
  project.assets[1] = {
    ...project.assets[1],
    path: "assets/b.webp",
    originalName: "b.webp",
  };
  project.layers[1].blendMode = "add";
  project.layers[1].transform.x = 24;
  project.layers[1].opacity = 0.75;
  project.layers[0].opacity = 0.5;
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
  pixiMock.textureByUrl.set("/a.png", {
    width: 100,
    height: 100,
    source: { width: 100, height: 100 },
    frame: new pixiMock.MockRectangle(0, 0, 100, 100),
  });
  pixiMock.textureByUrl.set("/b.png", {
    width: 100,
    height: 100,
    source: { width: 100, height: 100 },
    frame: new pixiMock.MockRectangle(0, 0, 100, 100),
  });

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
  it("runs manual intro, arbitrary continuous wait, authored selection, and dynamic resolve", async () => {
    const player = await createInitializedPlayer({
      project: createCardCarouselProject(),
      autoTick: false,
    });
    const marker = vi.fn();
    const completed = vi.fn();
    player.addPlaybackEvent({
      id: "manual-intro-marker",
      at: { unit: "time", at: 1 },
      listener: marker,
    });
    player.onPlaybackComplete(completed);
    const session = player.createManualPlaybackSession();
    const animations = session.listAnimations({
      capability: "cyclic-selection",
    });
    expect(animations).toHaveLength(1);
    expect(animations[0]).toMatchObject({
      ref: { layerId: "layer-a", animationId: "carousel" },
      animationType: "card_carousel_3d",
      capabilities: [
        "continuous-phase",
        "replaceable-carriers",
        "cyclic-selection",
      ],
    });
    const cyclic = session
      .getAnimation(animations[0].ref)
      .requireCyclicSelection();
    const descriptor = cyclic.getAuthoredPreviewDescriptor();
    expect(descriptor).toMatchObject({
      introRange: { unit: "time", start: 0, end: 1.2 },
      continuousHoldPoint: { unit: "time", at: 1.2 },
      continuousPhaseId: "idle",
      authoredContinuousPreviewDurationSeconds: 1.2,
      endingRange: { unit: "time", start: 2.4, end: 6.1 },
      authoredTargetCarrierIndex: 2,
    });
    cyclic.adoptAuthoredItems();

    const intro = session.playRange({ range: descriptor.introRange });
    player.update(1.2);
    await expect(intro.completed).resolves.toEqual({ reason: "complete" });
    expect(marker).toHaveBeenCalledTimes(1);
    expect(completed).toHaveBeenCalledWith({
      startTime: 0,
      endTime: 1.2,
      currentTime: 1.2,
      loopIndex: 0,
    });

    const hold = session.holdTimeline({
      at: descriptor.continuousHoldPoint,
    });
    cyclic.startContinuousPhase({
      phaseId: descriptor.continuousPhaseId,
    });
    const advance = session.advanceFor({ durationSeconds: 4.5 });
    player.update(4.5);
    await expect(advance.completed).resolves.toEqual({ reason: "complete" });
    expect(cyclic.getState()).toMatchObject({
      phase: "continuous",
      continuousElapsedSeconds: 4.5,
    });

    const committed = cyclic.prepareAuthoredSelection();
    await expect(committed.committed).resolves.toMatchObject({
      carrierIndex: 2,
    });
    hold.release();
    cyclic.startResolvePhase();
    const ending = session.playRange({
      range: descriptor.endingRange,
      preserveRuntimeAnimationState: true,
    });
    player.update(3.7);
    await expect(ending.completed).resolves.toEqual({ reason: "complete" });

    const internals = player as unknown as {
      cardCarouselStates: Array<{
        runtime: {
          output: { rotation: number };
          prepared: { angleStep: number };
        };
      }>;
    };
    const runtime = internals.cardCarouselStates[0].runtime;
    const targetAngle =
      runtime.output.rotation + 2 * runtime.prepared.angleStep;
    expect(
      Math.atan2(Math.sin(targetAngle), Math.cos(targetAngle)),
    ).toBeCloseTo(0, 10);
    expect(cyclic.getState().phase).toBe("complete");
    expect(() => player.seek(0)).toThrow("manual playback session");

    session.destroy();
    expect(() => session.getState()).not.toThrow();
    player.seek(0);
    player.destroy();
  });

  it("cancels manual operations and enforces single-session transport ownership", async () => {
    const player = await createInitializedPlayer({
      project: createCardCarouselProject(),
      autoTick: false,
    });
    const session = player.createManualPlaybackSession();
    expect(() => player.createManualPlaybackSession()).toThrow(
      "already has an active",
    );
    const operation = session.playRange({
      range: { unit: "time", start: 0, end: 1.2 },
    });
    expect(() =>
      session.playRange({
        range: { unit: "time", start: 0, end: 1.2 },
      }),
    ).toThrow("active operation");
    operation.cancel();
    await expect(operation.completed).rejects.toMatchObject({
      name: "VNIPlaybackCancelledError",
    });
    session.destroy();
    player.destroy();
  });

  it.each([0, 1.5, 4.5, 10])(
    "keeps authored target 2 after %s seconds of controlled idle",
    async (durationSeconds) => {
      const player = await createInitializedPlayer({
        project: createCardCarouselProject(),
        autoTick: false,
      });
      const session = player.createManualPlaybackSession();
      const info = session.listAnimations({
        capability: "cyclic-selection",
      })[0];
      const cyclic = session.getAnimation(info.ref).requireCyclicSelection();
      const descriptor = cyclic.getAuthoredPreviewDescriptor();
      cyclic.adoptAuthoredItems();
      const intro = session.playRange({ range: descriptor.introRange });
      player.update(1.2);
      await intro.completed;
      const hold = session.holdTimeline({
        at: descriptor.continuousHoldPoint,
      });
      cyclic.startContinuousPhase({ phaseId: "idle" });
      if (durationSeconds > 0) {
        const advance = session.advanceFor({ durationSeconds });
        player.update(durationSeconds + 5);
        await advance.completed;
        expect(cyclic.getState().continuousElapsedSeconds).toBeCloseTo(
          durationSeconds,
          10,
        );
      }
      await cyclic.prepareAuthoredSelection().committed;
      hold.release();
      cyclic.startResolvePhase();
      const ending = session.playRange({
        range: descriptor.endingRange,
        preserveRuntimeAnimationState: true,
      });
      player.update(10);
      await ending.completed;
      const internals = player as unknown as {
        cardCarouselStates: Array<{
          runtime: {
            output: { rotation: number };
            prepared: { angleStep: number };
          };
        }>;
      };
      const runtime = internals.cardCarouselStates[0].runtime;
      const aligned = runtime.output.rotation + 2 * runtime.prepared.angleStep;
      expect(Math.atan2(Math.sin(aligned), Math.cos(aligned))).toBeCloseTo(
        0,
        10,
      );
      session.destroy();
      player.destroy();
    },
  );

  it("commits a replacement only after its carrier is hidden and preserves host texture ownership", async () => {
    const player = await createInitializedPlayer({
      project: createCardCarouselProject(),
      autoTick: false,
    });
    const session = player.createManualPlaybackSession();
    const info = session.listAnimations({
      capability: "cyclic-selection",
    })[0];
    const cyclic = session.getAnimation(info.ref).requireCyclicSelection();
    cyclic.setInitialItems(
      Array.from({ length: 7 }, (_, index) => ({
        key: `item-${index}`,
        visual: {
          kind: "project-asset" as const,
          assetId: index % 2 === 0 ? "asset-a" : "asset-b",
        },
      })),
    );
    expect(() =>
      cyclic.setInitialItems(
        Array.from({ length: 7 }, () => ({
          key: "duplicate",
          visual: {
            kind: "project-asset" as const,
            assetId: "asset-a",
          },
        })),
      ),
    ).toThrow("Duplicate");
    const hold = session.holdTimeline({
      at: { unit: "time", at: 1.2 },
    });
    cyclic.startContinuousPhase({ phaseId: "idle" });
    player.update(0.01);
    const internals = player as unknown as {
      cardCarouselRenderer: {
        sliceTextures: Map<
          string,
          {
            texture: InstanceType<typeof pixiMock.MockTexture>;
            refs: number;
          }
        >;
      };
      cardCarouselStates: Array<{
        runtime: {
          output: {
            cards: Array<{ visible: boolean }>;
          };
        };
      }>;
    };
    const visibleIndex =
      internals.cardCarouselStates[0].runtime.output.cards.findIndex(
        (card) => card.visible,
      );
    expect(visibleIndex).toBeGreaterThanOrEqual(0);
    const hostTexture = new pixiMock.MockTexture({
      source: { width: 64, height: 64 },
      width: 64,
      height: 64,
    });
    const transaction = cyclic.prepareSelection({
      selectedItem: {
        key: `item-${visibleIndex}`,
        visual: {
          kind: "texture",
          texture: hostTexture as unknown as PixiTexture,
        },
      },
    });
    expect(cyclic.getState().phase).toBe("selection-pending");
    for (
      let step = 0;
      step < 200 && cyclic.getState().phase === "selection-pending";
      step += 1
    ) {
      player.update(0.1);
    }
    await expect(transaction.committed).resolves.toMatchObject({
      itemKey: `item-${visibleIndex}`,
      carrierIndex: visibleIndex,
    });
    expect(cyclic.getState().phase).toBe("selection-committed");
    expect(hostTexture.destroyed).toBe(false);
    hold.release();
    session.destroy();
    expect(hostTexture.destroyed).toBe(false);
    expect(
      [...internals.cardCarouselRenderer.sliceTextures.values()].every(
        (entry) => entry.refs > 0,
      ),
    ).toBe(true);
    player.destroy();
    expect(hostTexture.destroyed).toBe(false);
  });

  it("pools card_carousel_3d nodes and slice textures across 300 frames and releases owned views", async () => {
    const player = await createInitializedPlayer({
      project: createCardCarouselProject(),
      autoTick: false,
    });
    const internals = player as unknown as {
      cardCarouselRenderer: {
        getStats(): {
          cardContainersCreated: number;
          sliceSpritesCreated: number;
          sliceTexturesCreated: number;
        };
        sliceTextures: Map<
          string,
          {
            texture: InstanceType<typeof pixiMock.MockTexture>;
            refs: number;
          }
        >;
      };
      cardCarouselStates: Array<{
        runtime: {
          root: InstanceType<typeof pixiMock.MockContainer>;
        };
      }>;
    };
    const initialStats = internals.cardCarouselRenderer.getStats();
    const root = internals.cardCarouselStates[0].runtime.root;
    const cardNodes = [...root.children];
    const sliceNodes = cardNodes.flatMap((card) => [...card.children]);

    for (let frame = 0; frame < 300; frame += 1) {
      player.seek((frame / 299) * 6.1);
    }

    expect(internals.cardCarouselRenderer.getStats()).toMatchObject({
      cardContainersCreated: 7,
      sliceSpritesCreated: 21,
      sliceTexturesCreated: 6,
    });
    expect(initialStats).toMatchObject({
      cardContainersCreated: 7,
      sliceSpritesCreated: 21,
      sliceTexturesCreated: 6,
    });
    expect(new Set(root.children)).toEqual(new Set(cardNodes));
    expect(root.children.flatMap((card) => [...card.children])).toEqual(
      expect.arrayContaining(sliceNodes),
    );

    const sliceTextures = [
      ...internals.cardCarouselRenderer.sliceTextures.values(),
    ].map((entry) => entry.texture);
    const sourceTextures = [
      pixiMock.textureByUrl.get("/a.png")?.source,
      pixiMock.textureByUrl.get("/b.png")?.source,
    ];
    player.restart();
    expect(internals.cardCarouselStates[0].runtime.root).toBe(root);
    player.destroy();
    expect(sliceTextures.every((texture) => texture.destroyed)).toBe(true);
    expect(internals.cardCarouselRenderer.sliceTextures.size).toBe(0);
    expect(sourceTextures.every((source) => source?.destroyed !== true)).toBe(
      true,
    );
  });

  it("loads project textures through Pixi texture parser even when URLs lack extensions", async () => {
    pixiMock.assetsLoad.mockClear();

    await createInitializedPlayer({
      project: createStaticProject(),
    });

    expect(pixiMock.assetsLoad).toHaveBeenCalledWith({
      src: "/a.png",
      parser: "loadTextures",
    });
    expect(pixiMock.assetsLoad).toHaveBeenCalledWith({
      src: "/b.png",
      parser: "loadTextures",
    });
  });

  it("mounts only runtime content and never renders exported stage background", async () => {
    const player = await createInitializedPlayer({
      project: createStaticProject(),
    });
    const internals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
      slotContainersByKey: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const layerB = internals.layerInstances.get("layer-b");
    const [slotContainer] = [...internals.slotContainersByKey.values()];

    expect(internals.stageRoot.parent?.children).toEqual([internals.stageRoot]);
    expect(internals.stageRoot.children).toEqual([
      layerA?.display,
      slotContainer,
      layerB?.display,
    ]);
  });

  it("scales the stage independently from the clipping viewport", async () => {
    const player = await createInitializedPlayer({
      project: createStaticProject(),
    });
    const internals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
    };

    player.setViewportSize(1200, 430);
    player.setViewportScale(0.1);

    expect(internals.stageRoot.position).toMatchObject({ x: 600, y: 215 });
    expect(internals.stageRoot.scale).toMatchObject({ x: 0.1, y: 0.1 });
    expect(player.getViewportScale()).toBe(0.1);
    expect(() => player.setViewportScale(0)).toThrow("positive finite");
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

  it("samples multi_move through the player while preserving empty-frame visibility", async () => {
    const project = createStaticProject();
    project.schemaVersion = "VNI_0.074";
    project.editor.version = "VNI_0.074";
    project.stage.duration = 3;
    project.layers[0].animations = [
      {
        id: "multi-move",
        type: "multi_move",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          pointsJson: JSON.stringify([
            { x: 0, y: 0, time: 0, easing: "linear" },
            { x: 100, y: 50, time: 1, easing: "linear" },
          ]),
        },
      },
    ];

    const player = await createInitializedPlayer({
      project,
      autoTick: false,
    });
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");

    player.seek(1);

    expect(layerA?.display.position).toMatchObject({ x: 300, y: 100 });
    expect(layerA?.display.visible).toBe(true);

    player.seek(1.5);

    expect(layerA?.display.position).toMatchObject({ x: 300, y: 100 });
    expect(layerA?.display.alpha).toBe(0);
    expect(layerA?.display.visible).toBe(false);
  });

  it("clears pressure visual rotation across seek and restart without rebuilding layer roots", async () => {
    const project = createStaticProject();
    project.schemaVersion = "VNI_0.087";
    project.editor.version = "VNI_0.087";
    project.layers[0].animations = [
      {
        id: "pressure-rotate",
        type: "rotate",
        startTime: 0,
        duration: 1,
        enabled: true,
        seed: 1,
        params: {
          turns: 1,
          direction: 1,
          accelRatio: 0,
          decelRatio: 0,
          pressure: 0.4,
          pressureStretch: 0.5,
        },
      },
    ];
    const player = await createInitializedPlayer({ project, autoTick: false });
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          content: InstanceType<typeof pixiMock.MockContainer>;
          textureDisplay: InstanceType<typeof pixiMock.MockSprite>;
        }
      >;
    };
    const layer = internals.layerInstances.get("layer-a");
    if (!layer) throw new Error("Missing pressure layer.");
    const root = layer.display;
    const content = layer.content;
    const sprite = layer.textureDisplay;

    player.seek(0.5);
    expect(layer.display.scale).toMatchObject({ x: 1.2, y: 0.6 });
    expect(layer.content.rotation).toBeCloseTo(Math.PI);

    player.seek(1.5);
    expect(layer.content.rotation).toBe(0);
    player.restart();
    expect(layer.content.rotation).toBe(0);
    expect(layer.display).toBe(root);
    expect(layer.content).toBe(content);
    expect(layer.textureDisplay).toBe(sprite);
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
    expect(textInstance.display).toBeInstanceOf(pixiMock.MockContainer);
    expect(textInstance.originalTextDisplay).toBeInstanceOf(pixiMock.MockText);
    expect(textInstance.display.children).toEqual([textInstance.content]);
    expect(textInstance.content.children).toEqual([
      textInstance.originalTextDisplay,
    ]);
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

  it("uses stable outer/content roots and applies blend mode to the outer layer", () => {
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
        visualRotation: 90,
        baseOpacity: 1,
        opacity: 1,
        visible: true,
        renderImageDisplay: true,
        hasActiveParticleAnimation: false,
        hasActiveChaserLightAnimation: false,
        hasActiveRenderEffect: false,
        hasActiveDeterministicEffect: false,
        hasActiveSafeGlowAnimation: false,
        hasActiveCardCarousel3D: false,
        blendMode: "add",
      },
      project.stage,
    );

    expect(instance.display).toBeInstanceOf(pixiMock.MockContainer);
    expect(instance.display.children).toEqual([instance.content]);
    expect(instance.content.children).toEqual([instance.textureDisplay]);
    expect(instance.textureDisplay).toBeInstanceOf(pixiMock.MockSprite);
    expect(instance.display.blendMode).toBe("add");
    expect(instance.display.groupBlendMode).toBe("add");
    expect(instance.content.rotation).toBeCloseTo(Math.PI / 2);

    const stableContent = instance.content;
    const stableTextureDisplay = instance.textureDisplay;
    applySampledLayerState(
      instance,
      {
        layerId: imageLayer.id,
        transform: { ...imageLayer.transform },
        visualRotation: 0,
        baseOpacity: 1,
        opacity: 1,
        visible: true,
        renderImageDisplay: true,
        hasActiveParticleAnimation: false,
        hasActiveChaserLightAnimation: false,
        hasActiveRenderEffect: false,
        hasActiveDeterministicEffect: false,
        hasActiveSafeGlowAnimation: false,
        hasActiveCardCarousel3D: false,
        blendMode: "normal",
      },
      project.stage,
    );
    expect(instance.content).toBe(stableContent);
    expect(instance.textureDisplay).toBe(stableTextureDisplay);
    expect(instance.content.rotation).toBe(0);
  });

  it("matches the editor precompose_light_alpha pixel formula and cache key inputs", () => {
    const targetPixels = new Uint8ClampedArray([
      100, 150, 200, 128, 0, 0, 0, 255,
    ]);
    const sourcePixels = new Uint8ClampedArray([0, 0, 0, 128, 0, 0, 0, 255]);

    applyPrecomposedLightMaskPixels(targetPixels, sourcePixels, 0.5);

    expect([...targetPixels]).toEqual([100, 150, 200, 25, 0, 0, 0, 0]);

    const project = createPrecomposedMaskProject();
    const key = createPrecomposedLightMaskKey({
      stage: project.stage,
      target: {
        layerId: project.layers[1].id,
        asset: project.assets[1],
        texture: {
          width: 100,
          height: 100,
          label: "target-texture",
          source: { label: "target-source" },
        } as PixiTexture,
        transform: project.layers[1].transform,
        opacity: project.layers[1].opacity,
        blendMode: "add",
      },
      source: {
        layerId: project.layers[0].id,
        asset: project.assets[0],
        texture: {
          width: 100,
          height: 100,
          label: "source-texture",
          source: { label: "source-source" },
        } as PixiTexture,
        transform: project.layers[0].transform,
        opacity: project.layers[0].opacity,
      },
    });

    expect(key).toContain("precompose_light_alpha");
    expect(key).toContain("targetTransform");
    expect(key).toContain("sourceOpacity");
    expect(key).toContain("add");
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
          display: InstanceType<typeof pixiMock.MockContainer>;
          textureDisplay: InstanceType<typeof pixiMock.MockSprite> | null;
          texture: InstanceType<typeof pixiMock.MockTexture>;
        }
      >;
      ownedTextures: Set<InstanceType<typeof pixiMock.MockTexture>>;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const derivedTexture = layerA?.texture;

    expect(derivedTexture).toBeInstanceOf(pixiMock.MockTexture);
    expect(derivedTexture?.source).toBeInstanceOf(pixiMock.MockCanvasSource);
    expect(layerA?.textureDisplay?.texture).toBe(derivedTexture);
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(context.drawImage).toHaveBeenCalledWith({}, 0, 0, 2, 1);
    expect([...pixels]).toEqual([0, 0, 0, 0, 128, 255, 0, 128]);
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0);

    player.destroy();

    expect(derivedTexture?.destroyed).toBe(true);
    expect([...internals.ownedTextures]).toEqual([]);
  });

  it("derives transparent matte textures for additive RGB PNG layers without alpha", async () => {
    const project = createProject();
    project.assets[0] = {
      ...project.assets[0],
      path: "assets/a.png",
      originalName: "a.png",
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
    const pngResource = {};
    pixiMock.textureByUrl.set("/a.png", {
      width: 2,
      height: 1,
      source: { resource: pngResource },
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
        "assets/a.png": "/a.png",
        "assets/b.png": "/b.png",
      },
      autoTick: false,
    });

    await player.init();

    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          textureDisplay: InstanceType<typeof pixiMock.MockSprite> | null;
          texture: InstanceType<typeof pixiMock.MockTexture>;
        }
      >;
      ownedTextures: Set<InstanceType<typeof pixiMock.MockTexture>>;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const derivedTexture = layerA?.texture;

    expect(derivedTexture).toBeInstanceOf(pixiMock.MockTexture);
    expect(derivedTexture?.source).toBeInstanceOf(pixiMock.MockCanvasSource);
    expect(layerA?.textureDisplay?.texture).toBe(derivedTexture);
    expect(canvas.width).toBe(2);
    expect(canvas.height).toBe(1);
    expect(context.drawImage).toHaveBeenCalledWith(pngResource, 0, 0, 2, 1);
    expect([...pixels]).toEqual([0, 0, 0, 0, 128, 255, 0, 128]);
    expect(context.putImageData).toHaveBeenCalledWith(imageData, 0, 0);

    player.destroy();

    expect(derivedTexture?.destroyed).toBe(true);
    expect([...internals.ownedTextures]).toEqual([]);
  });

  it("keeps additive PNG textures when decoded pixels already include alpha", async () => {
    const project = createProject();
    project.assets[0] = {
      ...project.assets[0],
      path: "assets/a.png",
      originalName: "a.png",
      width: 2,
      height: 1,
    };
    project.layers[0] = {
      ...project.layers[0],
      blendMode: "add",
    };

    const pixels = new Uint8ClampedArray([0, 0, 0, 255, 64, 128, 0, 80]);
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
    const pngResource = {};
    const originalTexture = {
      width: 2,
      height: 1,
      source: { resource: pngResource },
    };
    pixiMock.textureByUrl.set("/a.png", originalTexture);
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
        "assets/a.png": "/a.png",
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
    expect(internals.ownedTextures.size).toBe(0);
    expect(context.drawImage).toHaveBeenCalledWith(pngResource, 0, 0, 2, 1);
    expect([...pixels]).toEqual([0, 0, 0, 255, 64, 128, 0, 80]);
    expect(context.putImageData).not.toHaveBeenCalled();

    player.destroy();
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

  it("draws particles as direct runtime sprites and updates diagnostics", async () => {
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
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
      slotContainersByKey: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
      liveParticleSpritesByLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>[]
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const layerB = internals.layerInstances.get("layer-b");
    const [slotContainer] = [...internals.slotContainersByKey.values()];
    const layerAParticles =
      internals.liveParticleSpritesByLayer.get("layer-a") ?? [];

    expect(layerA).toBeDefined();
    expect(layerB).toBeDefined();
    expect(slotContainer).toBeDefined();
    expect(internals.stageRoot.children).toEqual([
      layerA?.display,
      ...layerAParticles,
      slotContainer,
      layerB?.display,
    ]);
    expect(layerA?.display.visible).toBe(false);
    expect(layerAParticles.length).toBeGreaterThan(0);
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

  it("rejects project-level legacy_alpha before runtime init", () => {
    const project = createStaticProject();
    project.maskCompositeMode = "legacy_alpha";

    expect(
      () =>
        new VNIPlayer({
          parent: createMockPixiContainer(),
          projectId: "player-test",
          bundleId: "legacy",
          profileId: "legacy_full",
          profilePurpose: "legacy",
          assetScale: 1,
          project,
          assetUrls: {
            "assets/a.png": "/a.png",
            "assets/b.png": "/b.png",
          },
        }),
    ).toThrow("project.maskCompositeMode legacy_alpha");
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
      slotContainersByKey: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
    };
    const [slotContainer] = [...internals.slotContainersByKey.values()];

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

  it("binds dynamic text to text layers and restores the original text on dispose", async () => {
    const container = createContainer();
    const player = await createInitializedPlayer({
      project: createTextLayerProject(),
    });
    (
      player as unknown as { diagnosticsElement?: HTMLElement }
    ).diagnosticsElement = container;
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          content: InstanceType<typeof pixiMock.MockContainer>;
          originalTextDisplay: InstanceType<typeof pixiMock.MockText> | null;
        }
      >;
    };
    const textLayer = internals.layerInstances.get("text-layer");
    if (!textLayer?.originalTextDisplay) {
      throw new Error("Missing text layer instance.");
    }

    const binding = player.attachTextToTextLayer({
      id: "score",
      layerId: "text-layer",
      text: "100",
    });

    expect(textLayer.originalTextDisplay.visible).toBe(false);
    expect(textLayer.content.children).toHaveLength(2);
    expect(container.dataset.vniTextLayerBindings).toBe("1");
    binding.setText("200");
    expect(
      (textLayer.content.children[1] as InstanceType<typeof pixiMock.MockText>)
        .text,
    ).toBe("200");
    expect(() =>
      player.attachTextToTextLayer({
        id: "score",
        layerId: "text-layer",
        text: "duplicate",
      }),
    ).toThrow("Duplicate VNI mounted node id");
    expect(() =>
      player.attachNodeToTextLayer({
        id: "bad",
        layerId: "layer-a",
        node: createMockPixiContainer(),
      }),
    ).toThrow("is not a text layer");

    binding.dispose();

    expect(textLayer.originalTextDisplay.visible).toBe(true);
    expect(textLayer.content.children).toHaveLength(1);
    expect(container.dataset.vniTextLayerBindings).toBe("0");
  });

  it("attaches project images to text layers through the public API", async () => {
    const player = await createInitializedPlayer({
      project: createTextLayerProject(),
    });
    const dispose = await player.attachImageToTextLayer({
      id: "text-image",
      layerId: "text-layer",
      assetId: "asset-a",
    });
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          content: InstanceType<typeof pixiMock.MockContainer>;
          originalTextDisplay: InstanceType<typeof pixiMock.MockText> | null;
        }
      >;
    };
    const textLayer = internals.layerInstances.get("text-layer");

    expect(textLayer?.content.children).toHaveLength(2);
    expect(textLayer?.originalTextDisplay?.visible).toBe(false);

    dispose();

    expect(textLayer?.content.children).toHaveLength(1);
    expect(textLayer?.originalTextDisplay?.visible).toBe(true);
  });

  it("renders deterministic render effects at timeline boundaries and clears after coverage", async () => {
    const player = await createInitializedPlayer({
      project: createRenderEffectProject(),
    });
    const internals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
      slotContainersByKey: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
      renderEffectDisplaysByLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>[]
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const layerB = internals.layerInstances.get("layer-b");
    const [slotContainer] = [...internals.slotContainersByKey.values()];
    if (!layerA || !layerB) throw new Error("Missing test layers.");

    player.seek(0.5);

    const layerAEffects =
      internals.renderEffectDisplaysByLayer.get("layer-a") ?? [];
    const layerBEffects =
      internals.renderEffectDisplaysByLayer.get("layer-b") ?? [];
    expect(layerA.display.visible).toBe(false);
    expect(layerAEffects.length).toBeGreaterThan(0);
    expect(layerB.display.visible).toBe(false);
    expect(layerBEffects.length).toBeGreaterThan(0);
    expect(internals.stageRoot.children).toEqual([
      layerA.display,
      ...layerAEffects,
      slotContainer,
      layerB.display,
      ...layerBEffects,
    ]);

    player.seek(0);

    expect(
      internals.renderEffectDisplaysByLayer.get("layer-a")?.length ?? 0,
    ).toBeGreaterThan(0);
    expect(
      internals.renderEffectDisplaysByLayer.get("layer-b")?.length ?? 0,
    ).toBeGreaterThan(0);

    player.seek(1.01);

    expect(internals.renderEffectDisplaysByLayer.get("layer-a") ?? []).toEqual(
      [],
    );
    expect(internals.renderEffectDisplaysByLayer.get("layer-b") ?? []).toEqual(
      [],
    );
  });

  it("switches sequence layer textures during deterministic seeks", async () => {
    const player = await createInitializedPlayer({
      project: createSequenceProject(),
    });
    const internals = player as unknown as {
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
          textureDisplay: InstanceType<typeof pixiMock.MockSprite> | null;
          texture: InstanceType<typeof pixiMock.MockTexture> | null;
        }
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    if (!layerA?.texture) throw new Error("Missing sequence layer.");
    const firstTexture = layerA.texture;

    player.seek(0.6);

    expect(layerA.texture).not.toBe(firstTexture);
    expect(layerA.textureDisplay?.texture).toBe(layerA.texture);

    player.seek(1);

    expect(layerA.texture).toBe(firstTexture);
    expect(layerA.textureDisplay?.texture).toBe(firstTexture);
  });

  it("reuses deterministic effect sprites and clears them after coverage", async () => {
    const player = await createInitializedPlayer({
      project: createDeterministicEffectProject(),
    });
    const internals = player as unknown as {
      deterministicEffectSpritesByLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockSprite>[]
      >;
    };

    player.seek(0.5);

    const firstSprites =
      internals.deterministicEffectSpritesByLayer.get("layer-a") ?? [];
    expect(firstSprites.length).toBeGreaterThan(0);
    const firstSprite = firstSprites[0];
    expect(firstSprite.parent).not.toBeNull();

    player.seek(0.6);

    expect(
      internals.deterministicEffectSpritesByLayer.get("layer-a")?.[0],
    ).toBe(firstSprite);

    player.seek(1.01);

    expect(internals.deterministicEffectSpritesByLayer.has("layer-a")).toBe(
      false,
    );
    expect(firstSprite.parent).toBeNull();
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
        "assets/a.webp": "/a.png",
        "assets/b.png": "/b.png",
      },
    });
    await player.init();
    const internals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
      safeGlowSpritesByLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>[]
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    if (!layerA) throw new Error("Missing layer-a instance.");
    const safeGlowSprites =
      internals.safeGlowSpritesByLayer.get("layer-a") ?? [];

    expect(layerA.display.visible).toBe(false);
    expect(safeGlowSprites).toHaveLength(1);
    expect(internals.stageRoot.children).toContain(safeGlowSprites[0]);
    expect(safeGlowSprites[0].blendMode).toBe("add");
    expect(container.dataset.vniSafeGlowSprites).toBe("1");
    expect(container.dataset.vniRenderEffectSprites).toBe("0");

    player.destroy();

    expect(container.dataset.vniSafeGlowSprites).toBeUndefined();
  });

  it("renders chaser_light with pooled sprites and diagnostics", async () => {
    const container = createContainer();
    const player = await createInitializedPlayer({
      project: createChaserLightProject(),
    });
    (
      player as unknown as { diagnosticsElement?: HTMLElement }
    ).diagnosticsElement = container;

    player.seek(0.5);

    const internals = player as unknown as {
      chaserLightSpritesByLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockSprite>[]
      >;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
    };
    const firstSprites =
      internals.chaserLightSpritesByLayer.get("layer-a") ?? [];
    expect(firstSprites).toHaveLength(6);
    expect(internals.layerInstances.get("layer-a")?.display.visible).toBe(
      false,
    );
    expect(firstSprites.every((sprite) => sprite.visible)).toBe(true);
    expect(container.dataset.vniChaserLightSprites).toBe("6");

    player.seek(0.6);

    expect(internals.chaserLightSpritesByLayer.get("layer-a")).toBe(
      firstSprites,
    );
    expect(internals.chaserLightSpritesByLayer.get("layer-a")).toEqual(
      firstSprites,
    );
    expect(container.dataset.vniChaserLightSprites).toBe("6");

    player.seek(1.1);

    expect(internals.chaserLightSpritesByLayer.get("layer-a")).toBeUndefined();
    expect(firstSprites.every((sprite) => sprite.parent === null)).toBe(true);
    expect(container.dataset.vniChaserLightSprites).toBe("0");

    player.destroy();

    expect(internals.chaserLightSpritesByLayer.size).toBe(0);
    expect(container.dataset.vniChaserLightSprites).toBeUndefined();
  });

  it("applies masks without rendering hidden source layers", async () => {
    const container = createContainer();
    const player = await createInitializedPlayer({
      project: createMaskedProject(false),
    });
    (
      player as unknown as { diagnosticsElement?: HTMLElement }
    ).diagnosticsElement = container;

    player.seek(0.5);

    const internals = player as unknown as {
      maskSpritesByTargetLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockSprite>
      >;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
      maskCacheKeysByTargetLayer: Map<string, string>;
    };
    const source = internals.layerInstances.get("layer-a");
    const target = internals.layerInstances.get("layer-b");

    expect(source?.display.visible).toBe(false);
    expect(target?.display.mask).toBe(
      internals.maskSpritesByTargetLayer.get("layer-b"),
    );
    expect(internals.maskCacheKeysByTargetLayer.has("layer-b")).toBe(false);
    expect(container.dataset.vniMaskSprites).toBe("1");

    player.destroy();

    expect(container.dataset.vniMaskSprites).toBeUndefined();
  });

  it("precomposes light masks once, reuses stable cache keys, and destroys stale textures", async () => {
    const project = createPrecomposedMaskProject();
    const targetPixels = new Uint8ClampedArray([200, 100, 0, 255]);
    const sourcePixels = new Uint8ClampedArray([0, 0, 0, 255]);
    const targetImageData = { data: targetPixels } as ImageData;
    const sourceImageData = { data: sourcePixels } as ImageData;
    const targetContext = createMockCanvasContext(targetImageData);
    const sourceContext = createMockCanvasContext(sourceImageData);
    const canvases = [
      createMockCanvas(targetContext),
      createMockCanvas(sourceContext),
      createMockCanvas(createMockCanvasContext(targetImageData)),
      createMockCanvas(createMockCanvasContext(sourceImageData)),
    ];
    const createElement = vi.fn(() => {
      const canvas = canvases.shift();
      if (!canvas) throw new Error("Unexpected canvas allocation.");
      return canvas;
    });
    vi.stubGlobal("document", { createElement });
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const targetResource = { id: "target-resource" };
    const sourceResource = { id: "source-resource" };
    pixiMock.textureByUrl.set("/a.png", {
      width: 100,
      height: 100,
      label: "source-texture",
      source: { resource: sourceResource, label: "source-source" },
    });
    pixiMock.textureByUrl.set("/b.png", {
      width: 100,
      height: 100,
      label: "target-texture",
      source: { resource: targetResource, label: "target-source" },
    });

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
        "assets/a.png": "/a.png",
        "assets/b.webp": "/b.png",
      },
      autoTick: false,
    });
    await player.init();

    const internals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
      layerInstances: Map<
        string,
        {
          display: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
      slotContainersByKey: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
      maskSpritesByTargetLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockSprite>
      >;
      precomposedLightMasksByTargetLayer: Map<
        string,
        {
          key: string;
          sprite: InstanceType<typeof pixiMock.MockSprite>;
          texture: InstanceType<typeof pixiMock.MockTexture>;
        }
      >;
      maskCacheKeysByTargetLayer: Map<string, string>;
    };
    const source = internals.layerInstances.get("layer-a");
    const target = internals.layerInstances.get("layer-b");
    const [slotContainer] = [...internals.slotContainersByKey.values()];
    const initialState =
      internals.precomposedLightMasksByTargetLayer.get("layer-b");
    if (!initialState) throw new Error("Missing precomposed mask state.");

    expect(createElement).toHaveBeenCalledTimes(2);
    expect(targetContext.drawImage).toHaveBeenCalledWith(
      targetResource,
      -50,
      -50,
      100,
      100,
    );
    expect(sourceContext.drawImage).toHaveBeenCalledWith(
      sourceResource,
      -50,
      -50,
      100,
      100,
    );
    expect([...targetPixels]).toEqual([200, 100, 0, 100]);
    expect(target?.display.mask).toBeNull();
    expect(target?.display.alpha).toBe(0);
    expect(source?.display.visible).toBe(false);
    expect(internals.maskSpritesByTargetLayer.size).toBe(0);
    expect(internals.stageRoot.children).toEqual([
      source?.display,
      slotContainer,
      target?.display,
      initialState.sprite,
    ]);
    expect(internals.maskCacheKeysByTargetLayer.get("layer-b")).toContain(
      "targetTransform",
    );

    player.seek(0);

    expect(createElement).toHaveBeenCalledTimes(2);
    expect(internals.precomposedLightMasksByTargetLayer.get("layer-b")).toBe(
      initialState,
    );

    project.layers[1].transform.x += 1;
    player.seek(0);

    const nextState =
      internals.precomposedLightMasksByTargetLayer.get("layer-b");
    expect(nextState).toBeDefined();
    expect(nextState).not.toBe(initialState);
    expect(initialState.texture.destroyed).toBe(true);
    expect(createElement).toHaveBeenCalledTimes(4);

    player.destroy();

    expect(nextState?.texture.destroyed).toBe(true);
    expect(internals.precomposedLightMasksByTargetLayer.size).toBe(0);
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
      slotContainersByKey: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
    };
    const [slotContainer] = [...internals.slotContainersByKey.values()];
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
      slotContainersByKey: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>
      >;
    };
    const [slotContainer] = [...internals.slotContainersByKey.values()];
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

  it("skips zero-duration RAF ticks without weakening host delta validation", async () => {
    const player = await createInitializedPlayer();
    const rafCallbacks: FrameRequestCallback[] = [];
    const requestAnimationFrame = vi.fn(
      (callback: FrameRequestCallback): number => {
        rafCallbacks.push(callback);
        return rafCallbacks.length;
      },
    );
    vi.stubGlobal("requestAnimationFrame", requestAnimationFrame);
    vi.spyOn(performance, "now").mockReturnValue(1000);

    player.play();

    expect(requestAnimationFrame).toHaveBeenCalledTimes(1);
    const firstFrame = rafCallbacks.shift();
    if (!firstFrame) throw new Error("Missing first RAF callback.");
    expect(() => firstFrame(1000)).not.toThrow();
    expect(player.getTime()).toBe(0);
    expect(requestAnimationFrame).toHaveBeenCalledTimes(2);

    const secondFrame = rafCallbacks.shift();
    if (!secondFrame) throw new Error("Missing second RAF callback.");
    expect(() => secondFrame(1016)).not.toThrow();
    expect(player.getTime()).toBeCloseTo(0.016);
    expect(() => player.update(0)).toThrow("deltaSeconds");
  });

  it("keeps VNI viewport rendering at natural 100% scale", async () => {
    const player = await createInitializedPlayer();
    const defaultInternals = player as unknown as {
      stageRoot: InstanceType<typeof pixiMock.MockContainer>;
    };
    expect(defaultInternals.stageRoot.scale.x).toBeCloseTo(1);
    expect(defaultInternals.stageRoot.scale.y).toBeCloseTo(1);

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
    expect(noPaddingInternals.stageRoot.scale.x).toBeCloseTo(1);
    expect(noPaddingInternals.stageRoot.scale.y).toBeCloseTo(1);
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
      liveParticleSpritesByLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>[]
      >;
    };
    const firstHoldParticles = (
      internals.liveParticleSpritesByLayer.get("layer-a") ?? []
    ).map((child) => ({
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
    const secondHoldParticles = (
      internals.liveParticleSpritesByLayer.get("layer-a") ?? []
    ).map((child) => ({
      x: child.position.x,
      y: child.position.y,
      alpha: child.alpha,
      rotation: child.rotation,
      scaleX: child.scale.x,
      scaleY: child.scale.y,
    }));
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

  it("keeps moving live particle emitters from snapping back when segmented loops wrap", async () => {
    const player = await createInitializedPlayer({
      project: createMovingParticleProject(),
    });
    const internals = player as unknown as {
      liveParticleSpritesByLayer: Map<
        string,
        InstanceType<typeof pixiMock.MockContainer>[]
      >;
    };

    player.play({
      mode: "segmented",
      loopStart: { unit: "time", at: 0.2 },
      loopEnd: { unit: "time", at: 0.6 },
    });
    player.update(0.5);
    const beforeWrapParticles =
      internals.liveParticleSpritesByLayer.get("layer-a") ?? [];
    const beforeWrapX = beforeWrapParticles[0]?.position.x ?? 0;

    player.update(0.2);
    const afterWrapParticles =
      internals.liveParticleSpritesByLayer.get("layer-a") ?? [];
    const afterWrapX = afterWrapParticles[0]?.position.x ?? 0;

    expect(player.getTime()).toBeCloseTo(0.3);
    expect(player.getPlaybackState().loopIndex).toBe(1);
    expect(beforeWrapParticles.length).toBeGreaterThan(0);
    expect(afterWrapParticles.length).toBeGreaterThan(0);
    expect(beforeWrapX).toBeCloseTo(250);
    expect(afterWrapX).toBeCloseTo(260);
    expect(afterWrapX).toBeGreaterThan(beforeWrapX);
  });
});
