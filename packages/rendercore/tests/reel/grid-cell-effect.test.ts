import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createGridCellEffectController,
  createGridCellEffectResourcesFromManifest,
  deriveGridCellEffectPoolCapacities,
  parseReelManifest,
  type GridCellEffectResource,
} from "../../src/reel/index.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";

const ASSET_ROOT = resolve(__dirname, "../../../../assets/game002-s3");
const RAW_MANIFEST = JSON.parse(
  readFileSync(resolve(ASSET_ROOT, "reel.manifest.json"), "utf8"),
) as unknown;
const RAW_ATLAS = readFileSync(resolve(ASSET_ROOT, "Symbol.atlas"), "utf8");
const SKELETONS = Object.freeze({
  "../../../assets/game002-s3/Nearwin1.json": JSON.parse(
    readFileSync(resolve(ASSET_ROOT, "Nearwin1.json"), "utf8"),
  ),
  "../../../assets/game002-s3/Nearwin2.json": JSON.parse(
    readFileSync(resolve(ASSET_ROOT, "Nearwin2.json"), "utf8"),
  ),
});

describe("grid cell effect resources and controller", () => {
  it("validates exact real Spine resources, durations and schedule-derived pools", () => {
    const manifest = parseReelManifest(RAW_MANIFEST);
    const resources = createGridCellEffectResourcesFromManifest({
      manifest,
      skeletonModules: SKELETONS,
      atlasModules: {
        "../../../assets/game002-s3/Symbol.atlas": RAW_ATLAS,
      },
      textureModules: {
        "../../../assets/game002-s3/Symbol.png": "/Symbol.png",
      },
    });
    expect(resources.anticipation).toMatchObject({
      animationName: "Loop",
      loopCount: 1,
    });
    expect(resources.anticipation!.durationSeconds).toBeCloseTo(0.6666667, 6);
    expect(resources.anticipation!.officialDurationSeconds).toBe(
      0.6666666865348816,
    );
    expect(resources.refillSweep).toMatchObject({
      animationName: "Loop",
      loopCount: 1,
    });
    expect(resources.refillSweep!.durationSeconds).toBeCloseTo(0.4, 6);
    expect(resources.refillSweep!.officialDurationSeconds).toBe(
      0.4000000059604645,
    );
    expect(
      resources.refillSweep!.completionBoundaryAdjustmentSeconds,
    ).toBeGreaterThan(
      resources.refillSweep!.officialDurationSeconds -
        resources.refillSweep!.durationSeconds,
    );
    expect(
      deriveGridCellEffectPoolCapacities({
        manifest,
        resources,
        cellCount: 54,
      }),
    ).toEqual({ anticipation: 3, refillSweep: 5 });
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
          ...SKELETONS,
          "duplicate/Nearwin1.json":
            SKELETONS["../../../assets/game002-s3/Nearwin1.json"],
        },
        atlasModules: {
          "../../../assets/game002-s3/Symbol.atlas": RAW_ATLAS,
        },
        textureModules: {
          "../../../assets/game002-s3/Symbol.png": "/Symbol.png",
        },
      }),
    ).toThrow(/found 2/);
    expect(() =>
      deriveGridCellEffectPoolCapacities({
        manifest,
        resources,
        cellCount: 0,
      }),
    ).toThrow(/cellCount/);

    const players: FakePlayer[] = [];
    const controller = createGridCellEffectController({
      resources: { refillSweep: resources.refillSweep! },
      capacities: { refillSweep: 1 },
      columns: 1,
      rows: 1,
      cellWidth: 10,
      cellHeight: 10,
      createPlayer: (resource) => {
        const player = new FakePlayer(resource.officialDurationSeconds);
        players.push(player);
        return player;
      },
    });
    controller.prepare();
    controller.startScheduledEffect({
      effectId: "refillSweep",
      position: { x: 0, y: 0 },
      loopCount: 1,
    });
    expect(controller.update(resources.refillSweep!.durationSeconds)).toEqual({
      completed: [{ effectId: "refillSweep", x: 0, y: 0 }],
    });
    expect(players[0]!.maxElapsed).toBeGreaterThanOrEqual(
      resources.refillSweep!.officialDurationSeconds,
    );
    controller.destroy();
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
