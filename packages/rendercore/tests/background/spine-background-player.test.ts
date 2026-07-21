import { Container } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  createSpineBackgroundPlayer,
  parseSpineBackgroundManifest,
  type SpineBackgroundResource,
  type SpineBackgroundTransitionSpec,
} from "../../src/background/index.js";
import type { RendercoreSpinePlayer } from "../../src/spine/runtime-player.js";

describe("Spine background player", () => {
  it("initializes one clipped player at the manifest transform and loops BaseGame", async () => {
    const lowLevel = new FakeLowLevelPlayer();
    let factoryCalls = 0;
    const player = createSpineBackgroundPlayer({
      resource: createResource(),
      playerFactory: () => {
        factoryCalls += 1;
        return lowLevel;
      },
    });

    expect(() => player.update(0)).toThrow(/has not initialized/);
    expect(() => player.requestState("FreeGame")).toThrow(
      /has not initialized/,
    );
    expect(() => player.getSnapshot()).toThrow(/has not initialized/);
    await player.init();

    expect(factoryCalls).toBe(1);
    expect(lowLevel.initialized).toBe(true);
    expect(lowLevel.plays).toEqual([{ animationName: "BG", loop: true }]);
    expect(lowLevel.view.position).toMatchObject({ x: 1000, y: 1000 });
    expect(lowLevel.view.scale).toMatchObject({ x: 1, y: 1 });
    expect(player.container.children[0]).toBe(lowLevel.view);
    expect(player.container.mask).toBe(player.container.children[1]);
    expect((player.container.mask as any).context.bounds).toMatchObject({
      minX: 0,
      minY: 0,
      maxX: 2000,
      maxY: 2000,
    });
    expect(player.getSnapshot()).toEqual({
      stableState: "BaseGame",
      targetState: null,
      phase: "stable",
    });
    await expect(player.init()).rejects.toThrow(/already/);
  });

  it("updates while stable and completes both directed transitions on runtime completion", async () => {
    const lowLevel = new FakeLowLevelPlayer();
    const player = createPlayer(lowLevel);
    await player.init();

    player.update(0.25);
    expect(lowLevel.updateDeltas).toEqual([0.25]);
    const toFreeGame = player.requestState("FreeGame");
    expect(lowLevel.plays.at(-1)).toEqual({
      animationName: "BG_FG",
      loop: false,
    });
    player.update(0.5);
    expect(player.getSnapshot()).toEqual({
      stableState: "BaseGame",
      targetState: "FreeGame",
      phase: "transitioning",
    });
    lowLevel.completeNextUpdate = true;
    player.update(0.1);
    await toFreeGame;
    expect(lowLevel.plays.at(-1)).toEqual({
      animationName: "FG",
      loop: true,
    });
    expect(player.getSnapshot().stableState).toBe("FreeGame");

    const toBaseGame = player.requestState("BaseGame");
    expect(lowLevel.plays.at(-1)).toEqual({
      animationName: "FG_BG",
      loop: false,
    });
    lowLevel.completeNextUpdate = true;
    player.update(0);
    await toBaseGame;
    expect(lowLevel.plays.at(-1)).toEqual({
      animationName: "BG",
      loop: true,
    });
    expect(player.getSnapshot().stableState).toBe("BaseGame");
  });

  it("keeps same-state idempotent and rejects unknown, missing and concurrent requests", async () => {
    const lowLevel = new FakeLowLevelPlayer();
    const resource = createResource({
      extraStates: { BonusGame: { animation: "BONUS" } },
    });
    const player = createPlayer(lowLevel, resource);
    await player.init();
    const playCount = lowLevel.plays.length;
    await player.requestState("BaseGame");
    expect(lowLevel.plays).toHaveLength(playCount);

    expect(() => player.requestState("Unknown")).toThrow(/Unknown.*Unknown/);
    expect(() => player.requestState("BonusGame")).toThrow(
      /No direct.*BaseGame.*BonusGame/,
    );

    const pending = player.requestState("FreeGame");
    expect(() => player.requestState("BaseGame")).toThrow(
      /already in progress/,
    );
    lowLevel.completeNextUpdate = true;
    player.update(0.1);
    await pending;
  });

  it("fails invalid lifecycle calls and rejects a pending transition on destroy", async () => {
    const lowLevel = new FakeLowLevelPlayer();
    const player = createPlayer(lowLevel);
    await player.init();

    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, -0.1]) {
      expect(() => player.update(delta)).toThrow(/finite non-negative/);
    }
    const pending = player.requestState("FreeGame");
    player.destroy();
    await expect(pending).rejects.toThrow(/destroyed/);
    expect(lowLevel.destroyed).toBe(true);
    expect(player.container.children).toHaveLength(0);
    expect(player.container.mask).toBeFalsy();
    player.destroy();
    expect(() => player.update(0)).toThrow(/destroyed/);
    expect(() => player.requestState("BaseGame")).toThrow(/destroyed/);
    expect(() => player.getSnapshot()).toThrow(/destroyed/);
  });

  it("cleans up a low-level player when initialization fails", async () => {
    const lowLevel = new FakeLowLevelPlayer();
    lowLevel.initError = new Error("low-level init exploded");
    const player = createPlayer(lowLevel);

    await expect(player.init()).rejects.toThrow(/low-level init exploded/);
    expect(lowLevel.destroyed).toBe(true);
    expect(player.container.children).toHaveLength(0);
  });
});

function createPlayer(
  lowLevel: FakeLowLevelPlayer,
  resource = createResource(),
) {
  return createSpineBackgroundPlayer({
    resource,
    playerFactory: () => lowLevel,
  });
}

function createResource(
  options: {
    readonly extraStates?: Record<string, { readonly animation: string }>;
    readonly extraTransitions?: readonly SpineBackgroundTransitionSpec[];
  } = {},
): SpineBackgroundResource {
  const raw = {
    version: 1,
    kind: "spine",
    artSize: { width: 2000, height: 2000 },
    adaptation: {
      mode: "maximized-focus",
      focusRect: { x: 577.5, y: 270, width: 840, height: 1200 },
    },
    resource: {
      skeleton: "./BG.json",
      atlas: "./BG.atlas",
      textures: { "BG.png": "./BG.png" },
      transform: { x: 1000, y: 1000, scale: 1 },
    },
    initialState: "BaseGame",
    states: {
      BaseGame: { animation: "BG" },
      FreeGame: { animation: "FG" },
      ...options.extraStates,
    },
    transitions: [
      { from: "BaseGame", to: "FreeGame", animation: "BG_FG" },
      { from: "FreeGame", to: "BaseGame", animation: "FG_BG" },
      ...(options.extraTransitions ?? []),
    ],
  };
  return Object.freeze({
    manifest: parseSpineBackgroundManifest(raw),
    skeleton: { skeleton: { spine: "4.3.23" } },
    atlasText: "BG.png\nsize:1,1\nformat:RGBA8888\nfilter:Linear,Linear\n",
    textureUrls: Object.freeze({ "BG.png": "/BG.png" }),
    atlasPages: Object.freeze(["BG.png"]),
  });
}

class FakeLowLevelPlayer implements RendercoreSpinePlayer {
  readonly view = new Container();
  readonly plays: Array<{
    readonly animationName: string;
    readonly loop: boolean;
  }> = [];
  readonly updateDeltas: number[] = [];
  initialized = false;
  destroyed = false;
  completeNextUpdate = false;
  initError: Error | null = null;

  init(): void {
    if (this.initError) throw this.initError;
    this.initialized = true;
  }

  play(options: {
    readonly animationName: string;
    readonly loop: boolean;
  }): void {
    this.plays.push({ ...options });
    this.completeNextUpdate = false;
  }

  update(deltaSeconds: number): {
    readonly completed: boolean;
    readonly events: readonly [];
  } {
    this.updateDeltas.push(deltaSeconds);
    const completed = this.completeNextUpdate;
    this.completeNextUpdate = false;
    return { completed, events: [] };
  }

  reset(): void {
    return undefined;
  }

  destroy(): void {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
  }
}
