import { describe, expect, it } from "vitest";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import { createTestTexture } from "../../../packages/rendercore/tests/reel/helpers.js";
import { createGame003Layout } from "../src/game-layout.js";
import { createGame003MinecartInteractionLayout } from "../src/minecart-interaction-layout.js";
import {
  createGame003MinecartInteractionRuntime,
  type Game003MinecartInteractionRuntimeOptions,
} from "../src/minecart-interaction-runtime.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 minecart interaction runtime", () => {
  it("rushes, brakes, flies the payload, and completes with payload faded out", () => {
    const runtime = createRuntime();
    const layout = createLayout();

    runtime.start("wild");
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "cart-rush",
      feature: "wild",
      cartVisible: true,
      payloadVisible: true,
      payloadAlpha: 1,
    });
    expect(runtime.getSnapshot().cartPosition).toEqual(layout.cartStartCenter);

    runtime.update(0.29);
    const braking = runtime.getSnapshot();
    expect(braking.phase).toBe("cart-rush");
    expect(braking.cartPosition.x).toBeGreaterThan(layout.cartStopCenter.x);
    expect(Math.abs(braking.cartRotation)).toBeGreaterThan(0);

    runtime.update(0.09);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "symbol-fly",
      cartRotation: 0,
    });
    runtime.update(0.18);
    const flying = runtime.getSnapshot();
    expect(flying.phase).toBe("symbol-fly");
    expect(flying.payloadVisible).toBe(true);
    expect(flying.payloadAlpha ?? 0).toBeLessThan(1);
    expect(flying.payloadPosition?.x).toBeCloseTo(layout.payloadTargetCenter.x);
    expect(flying.payloadPosition?.y ?? 0).toBeLessThan(
      layout.payloadStartCenter.y,
    );

    expect(runtime.update(0.18)).toEqual({ completed: true });
    expect(runtime.isPlaying()).toBe(false);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "idle",
      cartRotation: 0,
      payloadAlpha: 0,
      payloadVisible: false,
    });
  });

  it("rejects normal payloads, bad lifecycle calls, and texture drift", () => {
    const runtime = createRuntime();

    expect(() => runtime.start("normal")).toThrow(/normal bg-bar/);
    runtime.start("wild");
    expect(() => runtime.start("wild")).toThrow(/already in progress/);
    expect(() => runtime.update(Number.NaN)).toThrow(/finite non-negative/);

    runtime.destroy();
    runtime.destroy();
    expect(() => runtime.update(0)).toThrow(/destroyed/);
    expect(() => runtime.applyLayout(createLayout())).toThrow(/destroyed/);

    expect(() =>
      createRuntime({
        minecartTexture: createTestTexture(100, 100),
      }),
    ).toThrow(/minecart texture size/);
  });

  it("keeps play progress when layout changes during rush", () => {
    const runtime = createRuntime();
    runtime.start("up");
    runtime.update(0.21);
    const before = runtime.getSnapshot();

    runtime.applyLayout(createLayout({ width: 1174, height: 2000 }));
    const after = runtime.getSnapshot();

    expect(after.phase).toBe("cart-rush");
    expect(after.cartPosition).not.toEqual(before.cartPosition);
    expect(after.cartPosition).not.toEqual(
      createLayout({ width: 1174, height: 2000 }).cartStartCenter,
    );
  });
});

function createRuntime(
  overrides: Partial<Game003MinecartInteractionRuntimeOptions> = {},
) {
  const skin = getGame003SkinConfig("1");
  const runtime = createGame003MinecartInteractionRuntime({
    config: skin.minecartInteraction,
    bgBarConfig: skin.bgBar,
    minecartTexture: createTestTexture(369, 252),
    symbolAssets: createAssets(),
    ...overrides,
  });
  runtime.applyLayout(createLayout());
  return runtime;
}

function createLayout(
  viewportSize: { readonly width: number; readonly height: number } = {
    width: 1600,
    height: 1000,
  },
) {
  const skin = getGame003SkinConfig("1");
  return createGame003MinecartInteractionLayout({
    layout: createGame003Layout({ viewportSize }),
    config: skin.minecartInteraction,
  });
}

function createAssets(): SymbolAssetMap {
  return {
    normal: {
      normal: { kind: "transparent", width: 172, height: 158 },
      states: {},
    },
    wild: {
      normal: createTestTexture(172, 158),
      states: {},
    },
    up: {
      normal: createTestTexture(172, 130),
      states: {},
    },
  };
}
