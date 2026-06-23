import { describe, expect, it, vi } from "vitest";

const pixiMock = vi.hoisted(() => {
  const textureByUrl = new Map<string, { width: number; height: number }>();

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
    label = "";
    position = new MockPoint();
    pivot = new MockPoint();
    scale = new MockPoint();
    anchor = new MockPoint();
    rotation = 0;
    alpha = 1;
    visible = true;
    blendMode = "normal";

    addChild(...children: MockContainer[]): MockContainer | undefined {
      this.children.push(...children);
      return children[0];
    }

    removeChildren(): MockContainer[] {
      const children = this.children;
      this.children = [];
      return children;
    }

    destroy(): void {
      this.children = [];
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

  class MockApplication {
    stage = new MockContainer();
    renderer = {
      resize: vi.fn(),
    };
    canvas = {
      getContext: vi.fn(() => null),
    };

    async init(): Promise<void> {
      return Promise.resolve();
    }

    destroy(): void {
      this.stage.destroy();
    }
  }

  return {
    textureByUrl,
    MockApplication,
    MockContainer,
    MockGraphics,
    MockSprite,
    MockText,
  };
});

vi.mock("pixi.js", () => ({
  Application: pixiMock.MockApplication,
  Assets: {
    load: vi.fn(async (url: string) => pixiMock.textureByUrl.get(url)),
  },
  Container: pixiMock.MockContainer,
  Graphics: pixiMock.MockGraphics,
  Sprite: pixiMock.MockSprite,
  Text: pixiMock.MockText,
}));

import { VNIPlayer } from "../../src/pixi/vni-player";
import { createLayerInstance } from "../../src/pixi/layer-instance";
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
    layers: [
      {
        id: "layer-a",
        name: "Layer A",
        type: "image",
        assetId: "asset-a",
        parentId: null,
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

async function createInitializedPlayer(
  options: {
    onPlayingChange?: (isPlaying: boolean) => void;
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
    container: createContainer(),
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
    onPlayingChange: options.onPlayingChange,
  });
  await player.init();
  return player;
}

describe("VNIPlayer", () => {
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
    expect(textInstance.display.children).toHaveLength(1);
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
      container,
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
          particleDisplay: InstanceType<typeof pixiMock.MockContainer>;
        }
      >;
    };
    const layerA = internals.layerInstances.get("layer-a");
    const layerB = internals.layerInstances.get("layer-b");

    expect(layerA).toBeDefined();
    expect(layerB).toBeDefined();
    expect(internals.contentRoot.children).toEqual([
      layerA?.display,
      layerA?.particleDisplay,
      layerB?.display,
      layerB?.particleDisplay,
    ]);
    expect(layerA?.display.visible).toBe(false);
    expect(layerA?.particleDisplay.children.length).toBeGreaterThan(0);
    expect(Number(container.dataset.v5gParticleSprites)).toBeGreaterThan(0);

    player.destroy();

    expect(container.dataset.v5gParticleSprites).toBeUndefined();
    expect(container.dataset.v5gProjectId).toBeUndefined();
    expect(container.dataset.vniParticleSprites).toBeUndefined();
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
      container: createContainer(),
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
      container: createContainer(),
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
      container: createContainer(),
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
  });

  it("writes pixel diagnostics when a WebGL context is readable", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callback(16);
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const container = createContainer();
    const player = new VNIPlayer({
      container,
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
    const gl = {
      drawingBufferWidth: 100,
      drawingBufferHeight: 100,
      RGBA: 0x1908,
      UNSIGNED_BYTE: 0x1401,
      readPixels: vi.fn(
        (
          _x: number,
          _y: number,
          _width: number,
          _height: number,
          _format: number,
          _type: number,
          pixel: Uint8Array,
        ) => {
          pixel[0] = 255;
          pixel[1] = 255;
          pixel[2] = 255;
          pixel[3] = 255;
        },
      ),
    };
    const internals = player as unknown as {
      app: { canvas: { getContext: ReturnType<typeof vi.fn> } };
    };
    internals.app.canvas.getContext = vi.fn(() => gl);

    await player.init();
    player.seek(0.1);

    expect(container.dataset.vniPixelSamples).toBe("49");
    expect(Number(container.dataset.vniNonBackgroundSamples)).toBeGreaterThan(
      0,
    );
    expect(container.dataset.vniPixelSampleError).toBeUndefined();
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
      container: createContainer(),
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

  it("records missing WebGL pixel diagnostics without failing playback", async () => {
    vi.stubGlobal("window", { devicePixelRatio: 1 });
    vi.stubGlobal("ResizeObserver", MockResizeObserver);
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback: FrameRequestCallback) => {
        callback(16);
        return 1;
      }),
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    pixiMock.textureByUrl.set("/a.png", { width: 100, height: 100 });
    pixiMock.textureByUrl.set("/b.png", { width: 100, height: 100 });

    const container = createContainer();
    const player = new VNIPlayer({
      container,
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

    expect(container.dataset.vniPixelSampleError).toBe("missing-webgl-context");
    expect(container.dataset.v5gPixelSampleError).toBe("missing-webgl-context");
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
