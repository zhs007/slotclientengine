import { Container, Texture } from "pixi.js";
import { describe, expect, it, vi } from "vitest";
import {
  SymbolImageStringController,
  createSymbolImageStringResources,
  notifySymbolImageStringSpineActive,
  notifySymbolImageStringSpineInactive,
} from "../../src/symbol-image-string/index.js";
import { RenderSymbol } from "../../src/symbol/render-symbol.js";
import { createDefaultSymbolStatePreset } from "../../src/symbol/state-machine.js";
import type { RendercoreSpineSlotPlayer } from "../../src/spine/runtime-player.js";

const manifest = {
  version: 1 as const,
  kind: "image-string" as const,
  id: "digits",
  metrics: { lineHeight: 10, letterSpacing: 0 },
  glyphs: {
    "0": {
      path: "assets/0.png",
      size: { width: 5, height: 10 },
      offset: { x: 0, y: 0 },
    },
    "1": {
      path: "assets/1.png",
      size: { width: 5, height: 10 },
      offset: { x: 0, y: 0 },
    },
  },
  fixedAdvanceGroups: [],
};

describe("SymbolImageStringController", () => {
  it("preserves strings, validates atomically, attaches by state and resets for pool", () => {
    const symbol = createSymbol();
    const controller = new SymbolImageStringController({
      root: symbol,
      nodes: [
        {
          spec: {
            name: "coin-value",
            resource:
              "./dependencies/image-strings/digits/image-string.manifest.json",
            target: { state: "normal", slot: "Num" },
            initialText: "01",
            anchor: { x: 0.5, y: 0.5 },
            transform: { x: 2, y: 3, scale: 0.5 },
            followSlotColor: false,
          },
          resource: {
            manifest,
            textures: {
              "assets/0.png": Texture.EMPTY,
              "assets/1.png": Texture.EMPTY,
            },
            destroyed: false,
            assertUsable: () => undefined,
            destroy: async () => undefined,
          },
        },
      ],
    });
    const player = createPlayer();

    expect(controller.getNodeNames()).toEqual(["coin-value"]);
    expect(controller.getText("coin-value")).toBe("01");
    controller.setText("coin-value", "001");
    expect(controller.getText("coin-value")).toBe("001");
    controller.setText("coin-value", "");
    expect(controller.getText("coin-value")).toBe("");
    controller.setText("coin-value", "001");
    expect(() => controller.setText("coin-value", "2")).toThrow(/缺少 glyph/);
    expect(controller.getText("coin-value")).toBe("001");
    expect(() => controller.getText("missing")).toThrow(/symbol "A".*missing/);
    expect(() => controller.setText("missing", "0")).toThrow(
      /symbol "A".*missing/,
    );

    notifySymbolImageStringSpineActive(symbol, "win", player);
    expect(player.attachSlotObject).not.toHaveBeenCalled();
    notifySymbolImageStringSpineActive(symbol, "normal", player);
    expect(player.attachSlotObject).toHaveBeenCalledWith(
      expect.objectContaining({ slot: "Num", followSlotColor: false }),
    );
    notifySymbolImageStringSpineInactive(symbol, createPlayer());
    expect(player.removeSlotObject).not.toHaveBeenCalled();
    notifySymbolImageStringSpineInactive(symbol, player);
    expect(player.removeSlotObject).toHaveBeenCalled();

    controller.resetForPoolRelease();
    expect(controller.getText("coin-value")).toBe("01");
    controller.destroy();
    controller.destroy();
    expect(() => controller.getNodeNames()).toThrow(/destroyed/);
    expect(() =>
      notifySymbolImageStringSpineActive(symbol, "normal", player),
    ).not.toThrow();
    expect(() =>
      notifySymbolImageStringSpineInactive(symbol, player),
    ).not.toThrow();
    symbol.destroy();
  });

  it("builds an empty resource map and reports a missing nested manifest", async () => {
    await expect(
      createSymbolImageStringResources({
        manifest: { symbols: { A: { imageStringNodes: [] } } } as never,
        symbolManifestPath: "symbol-state-textures.manifest.json",
        imageStringManifests: {},
        imageModules: {},
      }),
    ).resolves.toEqual({ resources: {}, sharedResources: [] });

    await expect(
      createSymbolImageStringResources({
        manifest: {
          symbols: {
            A: {
              imageStringNodes: [
                {
                  name: "coin-value",
                  resource:
                    "./dependencies/image-strings/digits/image-string.manifest.json",
                  target: { state: "normal", slot: "Num" },
                  initialText: "0",
                  anchor: { x: 0.5, y: 0.5 },
                  transform: { x: 0, y: 0, scale: 1 },
                  followSlotColor: true,
                },
              ],
            },
          },
        } as never,
        symbolManifestPath: "symbol-state-textures.manifest.json",
        imageStringManifests: {},
        imageModules: {},
      }),
    ).rejects.toThrow(/manifest is missing/);
  });
});

function createSymbol(): RenderSymbol {
  const preset = createDefaultSymbolStatePreset();
  return new RenderSymbol({
    definition: {
      code: 0,
      symbol: "A",
      pays: [0],
      defaultState: preset.defaultState,
      states: preset.states,
      equivalences: preset.equivalences,
    },
    texture: Texture.EMPTY,
    animationResolver: (context) => ({
      stateId: context.resolvedState,
      playback: context.state.playback,
      reset: () => undefined,
      update: () => ({ loopCompleted: false, onceCompleted: false }),
    }),
  });
}

function createPlayer(): RendercoreSpineSlotPlayer {
  return {
    view: new Container(),
    init: () => undefined,
    play: () => undefined,
    update: () => ({ completed: false }),
    reset: () => undefined,
    destroy: () => undefined,
    attachSlotObject: vi.fn(),
    removeSlotObject: vi.fn(),
  };
}
