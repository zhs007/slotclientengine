import { Texture } from "pixi.js";
import { describe, expect, it } from "vitest";
import {
  RenderSymbol,
  SymbolAnimationError,
  createDefaultSymbolAnimationResolver,
  createDefaultSymbolStatePreset,
  createNamedSymbolAnimationResolver,
  createSymbolDefinitionFromPreset
} from "../../src/symbol/index.js";
import type { SymbolAnimationProfileMap } from "../../src/symbol/index.js";

const createDefinition = (symbol = "SC") =>
  createSymbolDefinitionFromPreset({
    code: 1,
    symbol,
    pays: [0, 2, 4],
    preset: createDefaultSymbolStatePreset()
  });

const createTexture = (width = 32, height = 32) => {
  const texture = new Texture({ source: Texture.WHITE.source });
  Object.defineProperty(texture, "width", {
    configurable: true,
    value: width
  });
  Object.defineProperty(texture, "height", {
    configurable: true,
    value: height
  });
  return texture;
};

function createLayeredRenderSymbol(profiles: SymbolAnimationProfileMap): RenderSymbol {
  return new RenderSymbol({
    definition: createDefinition(),
    texture: {
      kind: "layered",
      layers: [
        { index: 0, texture: createTexture() },
        { index: 1, texture: createTexture() },
        { index: 2, texture: createTexture() }
      ]
    },
    animationResolver: createNamedSymbolAnimationResolver({
      profiles,
      fallback: createDefaultSymbolAnimationResolver()
    })
  });
}

function createLayeredRenderSymbolWithKeyframes(
  profiles: SymbolAnimationProfileMap
): {
  readonly renderSymbol: RenderSymbol;
  readonly frames: readonly Texture[];
} {
  const frames = [createTexture(), createTexture(), createTexture(), createTexture(), createTexture()];
  return {
    frames,
    renderSymbol: new RenderSymbol({
      definition: createDefinition("RS"),
      texture: {
        kind: "layered",
        layers: [
          { index: 0, texture: createTexture() },
          { index: 1, texture: frames[0], keyframes: frames },
          { index: 2, texture: createTexture() }
        ]
      },
      animationResolver: createNamedSymbolAnimationResolver({
        profiles,
        fallback: createDefaultSymbolAnimationResolver()
      })
    })
  };
}

describe("named symbol animations", () => {
  it("runs layer bounce and layer shine without changing layer 0", () => {
    const renderSymbol = createLayeredRenderSymbol({
      SC: {
        appear: {
          playback: "once",
          durationSeconds: 0.4,
          effects: [
            {
              name: "layerBounceScale",
              params: { layer: 1, maxScale: 1.2, offsetY: -12, cycles: 1, rotationDegrees: -20 }
            },
            {
              name: "layerShineScale",
              params: { layer: 2, maxScale: 1.2, shineAlpha: 0.9, shineWidthRatio: 0.3, rotationDegrees: 10 }
            }
          ]
        }
      }
    });

    renderSymbol.requestState("appear");
    expect(renderSymbol.overlayLayer.children.length).toBe(2);
    renderSymbol.update(0.1);

    const [baseLayer, bounceLayer, shineLayer] = renderSymbol.getLayerSprites();
    expect(baseLayer.sprite.scale.x).toBe(1);
    expect(baseLayer.sprite.y).toBe(0);
    expect(bounceLayer.sprite.scale.x).toBeGreaterThan(1);
    expect(bounceLayer.sprite.y).toBeLessThan(0);
    expect(bounceLayer.sprite.rotation).toBeLessThan(0);
    expect(shineLayer.sprite.scale.x).toBeGreaterThan(1);
    expect(shineLayer.sprite.rotation).toBeGreaterThan(0);
    expect(renderSymbol.overlayLayer.children[0]?.alpha ?? 0).toBeGreaterThan(0);

    const completed = renderSymbol.update(1);
    expect(completed.onceCompleted).toBe(true);
    expect(bounceLayer.sprite.scale.x).toBe(1);
    expect(bounceLayer.sprite.rotation).toBe(0);
    expect(shineLayer.sprite.scale.x).toBe(1);
    expect(shineLayer.sprite.rotation).toBe(0);
    expect(renderSymbol.overlayLayer.children.length).toBe(0);
  });

  it("runs staggered shine across explicit layers", () => {
    const renderSymbol = createLayeredRenderSymbol({
      SC: {
        win: {
          playback: "once",
          durationSeconds: 0.6,
          effects: [
            {
              name: "layerStaggeredShineScale",
              params: { layers: [0, 1, 2], maxScale: 1.2, staggerSeconds: 0.08, durationRatio: 0.7 }
            }
          ]
        }
      }
    });

    renderSymbol.requestState("win");
    expect(renderSymbol.overlayLayer.children.length).toBe(6);
    renderSymbol.update(0.12);
    const [firstLayer, secondLayer, thirdLayer] = renderSymbol.getLayerSprites();
    expect(firstLayer.sprite.scale.x).toBeGreaterThan(1);
    expect(secondLayer.sprite.scale.x).toBeGreaterThanOrEqual(1);
    expect(thirdLayer.sprite.scale.x).toBe(1);

    renderSymbol.update(1);
    expect(renderSymbol.overlayLayer.children.length).toBe(0);
    expect(renderSymbol.getLayerSprites().map((layer) => layer.sprite.scale.x)).toEqual([1, 1, 1]);
  });

  it("runs layer texture sequence and restores the static layer texture on completion", () => {
    const { renderSymbol, frames } = createLayeredRenderSymbolWithKeyframes({
      RS: {
        win: {
          playback: "once",
          durationSeconds: 0.5,
          effects: [
            {
              name: "layerTextureSequence",
              params: { layer: 1 }
            },
            {
              name: "layerStaggeredShineScale",
              params: { layers: [1, 2], maxScale: 1.2, staggerSeconds: 0.08 }
            }
          ]
        }
      }
    });
    const [, animatedLayer, shineLayer] = renderSymbol.getLayerSprites();

    renderSymbol.requestState("win");
    expect(animatedLayer.sprite.texture).toBe(frames[0]);
    expect(renderSymbol.overlayLayer.children.length).toBe(4);

    renderSymbol.update(0.11);
    expect(animatedLayer.sprite.texture).toBe(frames[1]);
    expect(shineLayer.sprite.scale.x).toBeGreaterThanOrEqual(1);

    renderSymbol.update(0.11);
    expect(animatedLayer.sprite.texture).toBe(frames[2]);

    renderSymbol.update(1);
    expect(animatedLayer.sprite.texture).toBe(frames[0]);
    expect(renderSymbol.overlayLayer.children.length).toBe(0);
  });

  it("supports explicit frame duration and delayed layer texture sequences", () => {
    const { renderSymbol, frames } = createLayeredRenderSymbolWithKeyframes({
      RS: {
        win: {
          playback: "once",
          durationSeconds: 0.5,
          effects: [
            {
              name: "layerTextureSequence",
              params: { layer: 1, frameDurationSeconds: 0.05, delaySeconds: 0.05, durationRatio: 0.8 }
            }
          ]
        }
      }
    });
    const animatedLayer = renderSymbol.getLayerSprites()[1];

    renderSymbol.requestState("win");
    renderSymbol.update(0.04);
    expect(animatedLayer.sprite.texture).toBe(frames[0]);

    renderSymbol.update(0.11);
    expect(animatedLayer.sprite.texture).toBe(frames[2]);
  });

  it("keeps single sprite appear and win shine available through named profiles", () => {
    const renderSymbol = new RenderSymbol({
      definition: createDefinition("S00"),
      texture: createTexture(),
      animationResolver: createNamedSymbolAnimationResolver({
        profiles: {
          S00: {
            appear: {
              playback: "once",
              durationSeconds: 0.4,
              effects: [{ name: "singleSpriteAppear", params: { maxScale: 1.4 } }]
            },
            win: {
              playback: "once",
              durationSeconds: 0.4,
              effects: [{ name: "singleSpriteWinShine", params: { maxScale: 1.2 } }]
            }
          }
        },
        fallback: createDefaultSymbolAnimationResolver()
      })
    });

    renderSymbol.requestState("appear");
    renderSymbol.update(0.2);
    expect(renderSymbol.sprite.scale.x).toBeGreaterThan(1.39);
    renderSymbol.update(1);
    expect(renderSymbol.sprite.scale.x).toBe(1);

    renderSymbol.requestState("win");
    expect(renderSymbol.overlayLayer.children.length).toBe(2);
    renderSymbol.update(0.2);
    expect(renderSymbol.sprite.scale.x).toBeGreaterThan(1.19);
    renderSymbol.update(1);
    expect(renderSymbol.overlayLayer.children.length).toBe(0);
  });

  it("fails fast for missing fallback, unknown effects, bad layers and invalid params", () => {
    expect(
      () =>
        new RenderSymbol({
          definition: createDefinition(),
          texture: createTexture(),
          animationResolver: createNamedSymbolAnimationResolver({ profiles: {} })
        })
    ).toThrow(SymbolAnimationError);

    expect(() =>
      createLayeredRenderSymbol({
        SC: {
          appear: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "missingAnimation" }]
          }
        }
      }).requestState("appear")
    ).toThrow(/Unknown symbol animation/);

    expect(() =>
      createLayeredRenderSymbol({
        SC: {
          appear: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "layerBounceScale", params: { layer: 9 } }]
          }
        }
      }).requestState("appear")
    ).toThrow(/layer 9/);

    expect(() =>
      createLayeredRenderSymbol({
        SC: {
          appear: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "layerShineScale", params: { layer: 1, maxScale: "large" } }]
          }
        }
      }).requestState("appear")
    ).toThrow(/maxScale/);

    expect(() =>
      createLayeredRenderSymbol({
        SC: {
          appear: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "layerBounceScale", params: { layer: 1, rotationDegrees: "left" } }]
          }
        }
      }).requestState("appear")
    ).toThrow(/rotationDegrees/);

    expect(() =>
      createLayeredRenderSymbol({
        SC: {
          appear: {
            playback: "loop",
            durationSeconds: 0.4,
            effects: [{ name: "layerBounceScale", params: { layer: 1 } }]
          }
        }
      }).requestState("appear")
    ).toThrow(/playback/);

    expect(() =>
      createLayeredRenderSymbol({
        SC: {
          win: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "layerTextureSequence", params: { layer: 1 } }]
          }
        }
      }).requestState("win")
    ).toThrow(/keyframes/);

    expect(() =>
      createLayeredRenderSymbol({
        SC: {
          win: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "layerTextureSequence", params: { layer: 9 } }]
          }
        }
      }).requestState("win")
    ).toThrow(/layer 9/);

    expect(() =>
      createLayeredRenderSymbolWithKeyframes({
        RS: {
          win: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "layerTextureSequence", params: { layer: 1, durationRatio: 1.2 } }]
          }
        }
      }).renderSymbol.requestState("win")
    ).toThrow(/durationRatio/);

    expect(() =>
      createLayeredRenderSymbolWithKeyframes({
        RS: {
          win: {
            playback: "once",
            durationSeconds: 0.4,
            effects: [{ name: "layerTextureSequence", params: { layer: 1, unknown: true } }]
          }
        }
      }).renderSymbol.requestState("win")
    ).toThrow(/Unknown animation param/);
  });
});
