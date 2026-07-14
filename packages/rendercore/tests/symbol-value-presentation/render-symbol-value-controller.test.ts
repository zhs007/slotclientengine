import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import type { RendercoreSpineSlotPlayer } from "../../src/spine/runtime-player.js";
import {
  createDefaultSymbolAnimationResolver,
  RenderSymbol,
} from "../../src/symbol/index.js";
import {
  createRenderSymbolValueController,
  type SymbolValuePresentationResource,
} from "../../src/symbol-value-presentation/index.js";

describe("render symbol value controller", () => {
  it("selects tiers, binds text to the configured slot and cleans up on value changes", async () => {
    const players: FakeSlotPlayer[] = [];
    const symbol = createSymbol((tier) => {
      const player = new FakeSlotPlayer();
      player.tierSkeleton = tier.spec.skeleton;
      players.push(player);
      return player;
    });

    symbol.init();
    symbol.setPresentationValue(5);
    expect(symbol.getPresentationValue()).toBe(5);
    expect(symbol.baseLayer.visible).toBe(true);
    await flushPromises();
    expect(players).toHaveLength(1);
    expect(players[0].tierSkeleton).toBe("./low.json");
    expect(players[0].plays).toEqual([{ animationName: "Idle", loop: true }]);
    expect(players[0].attached[0]).toMatchObject({ slot: "Num" });
    expect((players[0].attached[0]?.object as any).text).toBe("5");
    expect(symbol.overlayLayer.children).toEqual([players[0].view]);
    expect(symbol.baseLayer.visible).toBe(false);

    symbol.update(0.1);
    expect(players[0].updates).toEqual([0.1]);
    symbol.setPresentationValue(25);
    expect(players[0].removed).toHaveLength(1);
    expect(players[0].destroyed).toBe(true);
    expect(symbol.baseLayer.visible).toBe(true);
    await flushPromises();
    expect(players[1].tierSkeleton).toBe("./high.json");
    expect((players[1].attached[0]?.object as any).text).toBe("25");

    symbol.setPresentationValue(null);
    expect(symbol.getPresentationValue()).toBeNull();
    expect(players[1].destroyed).toBe(true);
    symbol.resetForPoolRelease();
    symbol.destroy();
  });

  it("rejects invalid values and reports async player initialization failures", async () => {
    const error = new Error("tier init failed");
    const symbol = createSymbol(() => new FakeSlotPlayer(error));
    symbol.init();

    expect(() => symbol.setPresentationValue(0)).toThrow(
      /positive safe integer/,
    );
    symbol.setPresentationValue(1);
    await flushPromises();
    expect(() => symbol.update(0.01)).toThrow(error);
    symbol.destroy();
    expect(() => symbol.setPresentationValue(1)).toThrow(/destroyed/);
  });

  it("ignores a late initialization after the value has been cleared", async () => {
    let finish!: () => void;
    const player = new FakeSlotPlayer(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const symbol = createSymbol(() => player);
    symbol.init();
    symbol.setPresentationValue(1);
    symbol.setPresentationValue(null);
    finish();
    await flushPromises();

    expect(player.attached).toEqual([]);
    expect(player.destroyed).toBe(true);
    expect(symbol.overlayLayer.children).toEqual([]);
    symbol.destroy();
  });
});

function createSymbol(
  createPlayer: (
    tier: SymbolValuePresentationResource["tiers"][number],
  ) => RendercoreSpineSlotPlayer,
): RenderSymbol {
  let symbol!: RenderSymbol;
  symbol = new RenderSymbol({
    definition: {
      code: 8,
      symbol: "GOLD",
      pays: [],
      defaultState: "normal",
      states: [
        { id: "normal", phase: "stable", playback: "static" },
        { id: "spinBlur", phase: "stable", playback: "static" },
      ],
    },
    texture: {
      kind: "transparent",
      width: 200,
      height: 200,
    },
    stateTextures: { spinBlur: Texture.WHITE },
    animationResolver: createDefaultSymbolAnimationResolver(),
    valueControllerFactory: (root) =>
      createRenderSymbolValueController({
        root,
        resource: createResource(),
        playerFactory: ({ tier }) => createPlayer(tier),
      }),
  });
  return symbol;
}

function createResource(): SymbolValuePresentationResource {
  const createTier = (skeleton: string, maxExclusive?: number) =>
    Object.freeze({
      ...(maxExclusive === undefined ? {} : { maxExclusive }),
      spec: Object.freeze({
        kind: "spine" as const,
        skeleton,
        atlas: "./Symbol.atlas",
        texture: "./Symbol.png",
        playback: Object.freeze({
          mode: "animation" as const,
          animationName: "Idle",
          loop: true,
        }),
      }),
      skeleton: {},
      atlasText: "Symbol.png\n",
      textureUrl: "/Symbol.png",
      atlasPage: "Symbol.png",
    });
  return Object.freeze({
    symbol: "GOLD",
    defaultValues: Object.freeze([1, 5, 25]),
    tiers: Object.freeze([
      createTier("./low.json", 10),
      createTier("./high.json"),
    ]),
    text: Object.freeze({
      slot: "Num",
      x: 2,
      y: -3,
      fontFamily: "Arial",
      fontSize: 32,
      fontWeight: "900",
      fill: "#fff",
      stroke: "#000",
      strokeWidth: 4,
    }),
  });
}

class FakeSlotPlayer implements RendercoreSpineSlotPlayer {
  readonly view = new Container();
  readonly plays: Array<{ animationName: string; loop: boolean }> = [];
  readonly attached: Array<{ slot: string; object: Container }> = [];
  readonly removed: Container[] = [];
  readonly updates: number[] = [];
  tierSkeleton = "";
  destroyed = false;
  readonly #initResult: Error | Promise<void> | undefined;

  constructor(initResult?: Error | Promise<void>) {
    this.#initResult = initResult;
  }

  init(): Promise<void> | void {
    if (this.#initResult instanceof Error)
      return Promise.reject(this.#initResult);
    return this.#initResult;
  }

  play(options: { animationName: string; loop: boolean }): void {
    this.plays.push(options);
  }

  update(deltaSeconds: number): { completed: boolean } {
    this.updates.push(deltaSeconds);
    return { completed: false };
  }

  attachSlotObject(options: { slot: string; object: Container }): void {
    this.attached.push(options);
  }

  removeSlotObject(object: Container): void {
    this.removed.push(object);
  }

  reset(): void {}

  destroy(): void {
    this.destroyed = true;
    this.view.parent?.removeChild(this.view);
  }
}

async function flushPromises(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
