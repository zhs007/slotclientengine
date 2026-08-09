import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createGridCellEffectController,
  createGridCellEffectResourceFromLoadedSpine,
  createGridCellEffectResourcesFromManifest,
  deriveGridCellEffectPoolCapacities,
  parseReelManifest,
  type GridCellEffectResource,
} from "../../src/reel/index.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";

const TEST_REEL_MANIFEST = {
  version: 1,
  spin: {
    bounceStrength: 0,
    dimmingAlpha: 0.5,
    timing: {
      startStepMs: 10,
      stopStepMs: 10,
      settleAfterLastStartMs: 0,
      minimumSpinCycles: 1,
      speedSymbolsPerSecond: 10,
    },
    cellEffects: {
      pulse: {
        skeleton: "./pulse.json",
        atlas: "./pulse.atlas",
        texture: "./pulse.png",
        animation: "Loop",
        loopCount: 1,
        finishBeforeStopMs: 0,
        transform: { x: 0, y: 0, scale: 1 },
      },
    },
    anticipation: {
      effect: "pulse",
      triggerLandedCount: 2,
      firstFollowingStopDelayMs: 0,
      stopStepMs: 100,
    },
  },
  cascade: {
    anticipationRefill: {
      sweep: {
        effect: "pulse",
        loopCount: 1,
        startStepMs: 100,
        order: "left-right-bottom-up",
      },
      spin: {
        effect: "pulse",
        order: "bottom-left-up-right-wave",
        startStepMs: 10,
        stopStepMs: 100,
        settleAfterLastStartMs: 0,
        minimumSpinCycles: 1,
        speedSymbolsPerSecond: 10,
      },
    },
  },
};
const TEST_EFFECT_SKELETON = {
  skeleton: { spine: "4.3.23" },
  bones: [{ name: "root" }],
  animations: {
    Loop: { bones: { root: { rotate: [{ time: 0 }, { time: 0.5 }] } } },
  },
};
const TEST_EFFECT_ATLAS =
  "effect.png\nsize: 1,1\nformat: RGBA8888\nfilter: Linear,Linear\n";

describe("grid cell effect resources and controller", () => {
  it("adapts an already loaded package Spine resource without path maps", () => {
    const resource = createGridCellEffectResourceFromLoadedSpine({
      id: "loaded",
      resource: {
        skeleton: TEST_EFFECT_SKELETON,
        atlasText: TEST_EFFECT_ATLAS,
        textureUrls: { "effect.png": "/effect.png" },
      },
      animationName: "Loop",
      loopCount: 1,
      finishBeforeStopMs: 0,
      transform: { x: 0, y: 0, scale: 1 },
    });

    expect(resource).toMatchObject({
      id: "loaded",
      animationName: "Loop",
      durationSeconds: 0.5,
    });
    expect(() =>
      createGridCellEffectResourceFromLoadedSpine({
        id: "loaded",
        resource: {
          skeleton: TEST_EFFECT_SKELETON,
          atlasText: TEST_EFFECT_ATLAS,
          textureUrls: {},
        },
        animationName: "Loop",
        loopCount: 1,
        finishBeforeStopMs: 0,
        transform: { x: 0, y: 0, scale: 1 },
      }),
    ).toThrow(/texture/i);
  });

  it("builds generic effect resources and derives bounded pool capacities", () => {
    const manifest = parseReelManifest(TEST_REEL_MANIFEST);
    const resources = createGridCellEffectResourcesFromManifest({
      manifest,
      skeletonModules: { "./pulse.json": TEST_EFFECT_SKELETON },
      atlasModules: { "./pulse.atlas": TEST_EFFECT_ATLAS },
      textureModules: { "./pulse.png": "/effect.png" },
    });

    expect(resources.pulse).toMatchObject({
      animationName: "Loop",
      durationSeconds: 0.5,
      officialDurationSeconds: 0.5,
      loopCount: 1,
    });
    expect(
      deriveGridCellEffectPoolCapacities({
        manifest,
        resources,
        cellCount: 10,
      }),
    ).toEqual({ pulse: 5 });
    expect(() =>
      deriveGridCellEffectPoolCapacities({
        manifest,
        resources,
        cellCount: 0,
      }),
    ).toThrow(/cellCount/);
    expect(() =>
      createGridCellEffectResourcesFromManifest({
        manifest,
        skeletonModules: {},
        atlasModules: {},
        textureModules: {},
      }),
    ).toThrow(/resolve exactly once/);
    expect(() =>
      createGridCellEffectResourcesFromManifest({
        manifest,
        skeletonModules: {
          "./pulse.json": TEST_EFFECT_SKELETON,
          "duplicate/pulse.json": TEST_EFFECT_SKELETON,
        },
        atlasModules: { "./pulse.atlas": TEST_EFFECT_ATLAS },
        textureModules: { "./pulse.png": "/effect.png" },
      }),
    ).toThrow(/found 2/);
  });

  it("binds the declared texture module to the atlas page", () => {
    const manifest = parseReelManifest({
      ...TEST_REEL_MANIFEST,
      spin: {
        ...TEST_REEL_MANIFEST.spin,
        cellEffects: {
          pulse: {
            ...TEST_REEL_MANIFEST.spin.cellEffects.pulse,
            texture: "./content-addressed-effect.webp",
          },
        },
      },
    });
    const resources = createGridCellEffectResourcesFromManifest({
      manifest,
      skeletonModules: { "./pulse.json": TEST_EFFECT_SKELETON },
      atlasModules: { "./pulse.atlas": TEST_EFFECT_ATLAS },
      textureModules: {
        "./content-addressed-effect.webp": "/assets/physical-hash.webp",
      },
    });

    expect(resources.pulse?.playerResource.textureUrls).toEqual({
      "effect.png": "/assets/physical-hash.webp",
    });
  });

  it("prepares a bounded pool, uses real loop edges, reuses and cleans players", () => {
    const resources = createFakeResources();
    const players: FakePlayer[] = [];
    const controller = createGridCellEffectController({
      resources,
      capacities: { normal: 2, anticipation: 1 },
      columns: 2,
      rows: 2,
      cellWidth: 10,
      cellHeight: 12,
      createPlayer: (resource) => {
        const player = new FakePlayer(resource.durationSeconds);
        players.push(player);
        return player;
      },
    });
    expect(controller.getSnapshot()).toMatchObject({
      prepared: false,
      capacity: 3,
      activeCount: 0,
    });
    expect(() =>
      controller.startScheduledEffect({
        effectId: "normal",
        position: { x: 0, y: 0 },
        loopCount: 1,
      }),
    ).toThrow(/not prepared/);
    controller.prepare();
    controller.prepare();
    expect(players.every((player) => player.initialized)).toBe(true);
    controller.startScheduledEffect({
      effectId: "normal",
      position: { x: 0, y: 0 },
      loopCount: 1,
    });
    expect(() =>
      controller.startScheduledEffect({
        effectId: "normal",
        position: { x: 0, y: 0 },
        loopCount: 1,
      }),
    ).toThrow(/already active/);
    controller.startScheduledEffect({
      effectId: "normal",
      position: { x: 1, y: 0 },
      loopCount: 1,
    });
    expect(() =>
      controller.startScheduledEffect({
        effectId: "normal",
        position: { x: 0, y: 1 },
        loopCount: 1,
      }),
    ).toThrow(/exhausted/);
    expect(controller.update(0.05).completed).toEqual([]);
    expect(controller.update(0.05).completed).toEqual([
      { effectId: "normal", x: 0, y: 0 },
      { effectId: "normal", x: 1, y: 0 },
    ]);
    expect(controller.getSnapshot()).toMatchObject({
      activeCount: 0,
      idleCount: 3,
    });
    controller.startScheduledEffect({
      effectId: "anticipation",
      position: { x: 1, y: 1 },
      loopCount: 3,
    });
    expect(controller.isActive("anticipation", { x: 1, y: 1 })).toBe(true);
    expect(controller.update(0.08).completed).toEqual([]);
    expect(controller.getSnapshot().active).toEqual([
      {
        effectId: "anticipation",
        x: 1,
        y: 1,
        completedLoops: 1,
      },
    ]);
    expect(controller.update(0.16).completed).toEqual([
      { effectId: "anticipation", x: 1, y: 1 },
    ]);
    controller.startScheduledEffect({
      effectId: "anticipation",
      position: { x: 1, y: 1 },
      loopCount: 3,
    });
    controller.cancelAll();
    controller.cancelAll();
    expect(controller.getSnapshot().activeCount).toBe(0);
    expect(() => controller.update(-1)).toThrow(/deltaSeconds/);
    expect(() =>
      controller.startScheduledEffect({
        effectId: "normal",
        position: { x: 9, y: 0 },
        loopCount: 1,
      }),
    ).toThrow(/out of range/);
    controller.destroy();
    controller.destroy();
    expect(players.every((player) => player.destroyed)).toBe(true);
    expect(() => controller.update(0)).toThrow(/destroyed/);
  });

  it("waits for async preparation and rejects invalid pool lifecycle inputs", async () => {
    const resources = createFakeResources();
    let releaseInit!: () => void;
    const init = new Promise<void>((resolve) => {
      releaseInit = resolve;
    });
    const controller = createGridCellEffectController({
      resources: { normal: resources.normal },
      capacities: { normal: 1 },
      columns: 1,
      rows: 1,
      cellWidth: 10,
      cellHeight: 10,
      createPlayer: () => {
        const player = new FakePlayer(0.1);
        player.init = () => init;
        return player;
      },
    });
    const preparation = controller.prepare();
    expect(preparation).toBeInstanceOf(Promise);
    expect(() => controller.prepare()).toThrow(/already preparing/);
    releaseInit();
    await preparation;
    expect(() =>
      controller.startScheduledEffect({
        effectId: "missing",
        position: { x: 0, y: 0 },
        loopCount: 1,
      }),
    ).toThrow(/exhausted/);
    expect(() =>
      controller.startScheduledEffect({
        effectId: "normal",
        position: { x: 0, y: 0 },
        loopCount: 0,
      }),
    ).toThrow(/loopCount/);
    controller.destroy();
    expect(() =>
      createGridCellEffectController({
        resources: { normal: resources.normal },
        capacities: { normal: 0 },
        columns: 1,
        rows: 1,
        cellWidth: 10,
        cellHeight: 10,
      }),
    ).toThrow(/capacity/);
    expect(() =>
      createGridCellEffectController({
        resources: {},
        capacities: {},
        columns: 1,
        rows: 1,
        cellWidth: 10,
        cellHeight: 10,
      }),
    ).toThrow(/must not be empty/);
  });
});

class FakePlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  initialized = false;
  destroyed = false;
  elapsed = 0;
  maxElapsed = 0;

  constructor(private readonly durationSeconds: number) {}
  init(): void {
    this.initialized = true;
  }
  play(): void {
    this.elapsed = 0;
  }
  update(deltaSeconds: number) {
    this.elapsed += deltaSeconds;
    this.maxElapsed = Math.max(this.maxElapsed, this.elapsed);
    const loopCompleted = this.elapsed >= this.durationSeconds;
    if (loopCompleted) this.elapsed %= this.durationSeconds;
    return {
      completed: false,
      ...(loopCompleted ? { loopCompleted: true } : {}),
      events: [],
    };
  }
  reset(): void {
    this.elapsed = 0;
  }
  destroy(): void {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
    this.view.destroy();
  }
}

function createFakeResources() {
  const create = (id: string, durationSeconds: number) =>
    Object.freeze({
      id,
      playerResource: {
        skeleton: {},
        atlasText: "unused",
        textureUrls: {},
      },
      animationName: "Loop",
      officialDurationSeconds: durationSeconds,
      durationSeconds,
      completionBoundaryAdjustmentSeconds: 1e-9,
      loopCount: 1,
      finishBeforeStopMs: 0,
      transform: Object.freeze({ x: 0, y: 0, scale: 1 }),
    }) satisfies GridCellEffectResource;
  return Object.freeze({
    normal: create("normal", 0.1),
    anticipation: create("anticipation", 0.08),
  });
}
