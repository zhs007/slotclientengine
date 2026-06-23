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

import { V5GPlayer } from "../../src/runtime/v5g-player";
import type { V5GProjectConfig } from "../../src/v5g/types";

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

describe("V5GPlayer", () => {
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
    const player = new V5GPlayer({
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
  });
});
