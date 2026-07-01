import { Container } from "pixi.js";
import { beforeEach, describe, expect, it } from "vitest";
import bigwinProject from "../../../../assets/game003-s1/win-amount/bigwin.json";
import megawinProject from "../../../../assets/game003-s1/win-amount/megawin.json";
import superwinProject from "../../../../assets/game003-s1/win-amount/superwin.json";
import {
  createWinAmountAnimationPlayer,
  createWinAmountAnimationTiersFromModules,
  type WinAmountVniPlayer,
} from "../../src/win-amount/index.js";
import type { VNIPlayerOptions } from "@slotclientengine/vnicore/pixi";

describe("win amount animation player", () => {
  beforeEach(() => {
    FakeVniPlayer.instances.length = 0;
  });

  it("completes zero wins without creating overlays", () => {
    const player = createTestPlayer();

    player.start({ betAmountRaw: 10, winAmountRaw: 0 });
    const result = player.update(0);

    expect(result.completed).toBe(true);
    expect(result.displayedAmountRaw).toBe(0);
    expect(FakeVniPlayer.instances).toHaveLength(0);
  });

  it("counts minor wins at the reel bottom and completes without VNI tiers", () => {
    const player = createTestPlayer();

    player.start({ betAmountRaw: 10, winAmountRaw: 8 });
    expect(player.update(0.75)).toMatchObject({
      completed: false,
      phase: "minor-counting",
      displayedAmountRaw: 4,
    });
    expect(player.update(0.75)).toMatchObject({
      completed: true,
      phase: "complete",
      displayedAmountRaw: 8,
    });
    expect(FakeVniPlayer.instances).toHaveLength(0);
  });

  it("counts major wins after the minor phase before completing", () => {
    const player = createTestPlayer();

    player.start({ betAmountRaw: 10, winAmountRaw: 50 });
    expect(player.update(1.5)).toMatchObject({
      completed: false,
      phase: "major-counting",
      displayedAmountRaw: 10,
    });
    expect(player.update(1.5).displayedAmountRaw).toBe(30);
    expect(player.update(1.5)).toMatchObject({
      completed: true,
      phase: "complete",
      displayedAmountRaw: 50,
    });
    expect(FakeVniPlayer.instances).toHaveLength(0);
  });

  it("switches big, super, and mega tiers at reached thresholds", async () => {
    const player = createTestPlayer();

    player.start({ betAmountRaw: 10, winAmountRaw: 500 });
    player.update(1.5);
    expect(player.update(3)).toMatchObject({
      completed: false,
      phase: "tier-ending",
      activeTierId: "megawin",
      displayedAmountRaw: 500,
    });
    await flushMicrotasks();

    expect(
      FakeVniPlayer.instances.map((instance) => instance.projectId),
    ).toEqual([
      "win-amount-bigwin",
      "win-amount-superwin",
      "win-amount-megawin",
    ]);
    expect(
      FakeVniPlayer.instances.map((instance) => instance.playOptions),
    ).toEqual([
      { loopStart: 1, loopEnd: 4, keepParticlesAlive: true },
      { loopStart: 1, loopEnd: 4, keepParticlesAlive: true },
      { loopStart: 1, loopEnd: 4, keepParticlesAlive: true },
    ]);
    expect(
      FakeVniPlayer.instances.map((instance) => instance.endRequests),
    ).toEqual([1, 1, 1]);

    expect(player.update(0.1)).toMatchObject({
      completed: true,
      phase: "complete",
      displayedAmountRaw: 500,
    });
  });

  it("fails fast for invalid input, delta, and formatter output", () => {
    const player = createTestPlayer();

    expect(() => player.start({ betAmountRaw: 0, winAmountRaw: 1 })).toThrow(
      /betAmountRaw/,
    );
    player.start({ betAmountRaw: 10, winAmountRaw: 1 });
    expect(() => player.update(-1)).toThrow(/deltaSeconds/);

    const badFormatter = createTestPlayer(() => "");
    expect(() =>
      badFormatter.start({ betAmountRaw: 10, winAmountRaw: 1 }),
    ).toThrow(/formatter/);
  });
});

function createTestPlayer(
  formatter = (amount: number) => `$${amount.toFixed(2)}`,
) {
  return createWinAmountAnimationPlayer({
    config: {
      formatter,
      minorCountDurationSeconds: 1.5,
      majorCountDurationSeconds: 3,
      thresholdMultipliers: {
        minor: 1,
        big: 15,
        super: 30,
        mega: 50,
      },
      layout: {
        minorTextPosition: { x: 100, y: 200 },
        majorTextPosition: { x: 100, y: 100 },
        tierStageRect: { x: 0, y: 0, width: 2000, height: 2000 },
      },
      textStyle: {
        minorFontSize: 54,
        majorFontSize: 118,
        fill: "#fff7d6",
        stroke: "#5a2500",
        strokeWidth: 8,
      },
      tiers: createWinAmountAnimationTiersFromModules({
        tierConfigs: [
          createTierConfig("bigwin", 15, "./bigwin.json"),
          createTierConfig("superwin", 30, "./superwin.json"),
          createTierConfig("megawin", 50, "./megawin.json"),
        ],
        projectModules: {
          "/assets/game003-s1/win-amount/bigwin.json": bigwinProject,
          "/assets/game003-s1/win-amount/superwin.json": superwinProject,
          "/assets/game003-s1/win-amount/megawin.json": megawinProject,
        },
        assetModules: createAssetModules([
          bigwinProject,
          superwinProject,
          megawinProject,
        ]),
      }),
    },
    playerFactory: (options) => new FakeVniPlayer(options),
  });
}

function createTierConfig(
  id: string,
  thresholdMultiplier: number,
  project: string,
) {
  return {
    id,
    thresholdMultiplier,
    project,
    durationSeconds: 5,
    loopStartTime: 1,
    loopEndTime: 4,
    keepParticlesAlive: true,
  };
}

function createAssetModules(
  projects: ReadonlyArray<{
    readonly assets: readonly { readonly path: string }[];
  }>,
): Record<string, string> {
  const modules: Record<string, string> = {};
  for (const project of projects) {
    for (const asset of project.assets) {
      const filename = asset.path.split("/").at(-1);
      if (!filename) {
        throw new Error(`bad fixture asset path ${asset.path}`);
      }
      modules[`/assets/game003-s1/win-amount/assets/${filename}`] =
        `/generated/${filename}`;
    }
  }
  return modules;
}

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

class FakeVniPlayer implements WinAmountVniPlayer {
  static readonly instances: FakeVniPlayer[] = [];
  readonly display = new Container();
  readonly projectId: string;
  readonly completeListeners = new Set<() => void>();
  playOptions: unknown = null;
  endRequests = 0;
  completed = false;

  constructor(options: VNIPlayerOptions) {
    this.projectId = options.projectId;
    FakeVniPlayer.instances.push(this);
  }

  async init(): Promise<void> {
    return undefined;
  }

  getDisplayObject(): Container {
    return this.display;
  }

  play(options: {
    readonly loopStart: { readonly at: number };
    readonly loopEnd: { readonly at: number };
    readonly keepParticlesAlive: boolean;
  }): void {
    this.playOptions = {
      loopStart: options.loopStart.at,
      loopEnd: options.loopEnd.at,
      keepParticlesAlive: options.keepParticlesAlive,
    };
  }

  requestSegmentedPlaybackEnd(): void {
    this.endRequests += 1;
  }

  update(): void {
    if (this.endRequests === 0 || this.completed) {
      return;
    }
    this.completed = true;
    for (const listener of this.completeListeners) {
      listener();
    }
  }

  onPlaybackComplete(listener: () => void): () => void {
    this.completeListeners.add(listener);
    return () => this.completeListeners.delete(listener);
  }

  destroy(): void {
    this.completeListeners.clear();
  }
}
