import { describe, expect, it } from "vitest";
import type { SymbolAssetMap } from "@slotclientengine/rendercore";
import { createTestTexture } from "../../../packages/rendercore/tests/reel/helpers.js";
import { createGame003BgBarLayout } from "../src/bg-bar-layout.js";
import {
  createGame003BgBarRuntime,
  GAME003_BG_BAR_SHIFT_DURATION_SECONDS,
} from "../src/bg-bar-runtime.js";
import type { Game003BgBarSpinPlan } from "../src/bg-bar-sequence.js";
import { createGame003Layout } from "../src/game-layout.js";
import { getGame003SkinConfig } from "../src/skin-config.js";

describe("game003 bg-bar runtime", () => {
  it("shifts five queued features, plays terminal win, and settles four idle features", () => {
    const runtime = createRuntime();
    const plan = createPlan(["normal", "wild", "wild", "wild", "up"]);

    expect(runtime.getSnapshot()).toMatchObject({
      phase: "idle",
      idleQueue: null,
      items: [],
    });

    runtime.startSpin(plan);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "shifting",
      items: [
        { feature: "normal", slotIndex: null, requestedState: "normal" },
        { feature: "wild", slotIndex: null, requestedState: "normal" },
        { feature: "wild", slotIndex: null, requestedState: "normal" },
        { feature: "wild", slotIndex: null, requestedState: "normal" },
        { feature: "up", slotIndex: null, requestedState: "appear" },
      ],
    });
    expectSymbolPosition(runtime, 0, 142, 540);
    expectSymbolPosition(runtime, 1, 142, 405);
    expectSymbolPosition(runtime, 2, 142, 270);
    expectSymbolPosition(runtime, 3, 142, 138);
    expectSymbolPosition(runtime, 4, 142, 6);

    expect(runtime.update(GAME003_BG_BAR_SHIFT_DURATION_SECONDS / 2)).toEqual({
      completed: false,
    });
    expect(runtime.isPlaying()).toBe(true);
    expect(runtime.update(GAME003_BG_BAR_SHIFT_DURATION_SECONDS)).toEqual({
      completed: false,
    });
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "terminal-win",
      items: [
        { feature: "normal", slotIndex: 4, requestedState: "win" },
        { feature: "wild", slotIndex: 3, requestedState: "normal" },
        { feature: "wild", slotIndex: 2, requestedState: "normal" },
        { feature: "wild", slotIndex: 1, requestedState: "normal" },
        { feature: "up", slotIndex: 0, requestedState: "normal" },
      ],
    });
    expectSymbolPosition(runtime, 0, 142, 675);
    expectSymbolPosition(runtime, 1, 142, 540);
    expectSymbolPosition(runtime, 2, 142, 405);
    expectSymbolPosition(runtime, 3, 142, 270);
    expectSymbolPosition(runtime, 4, 142, 138);

    expect(runtime.update(0.58)).toEqual({ completed: true });
    expect(runtime.isPlaying()).toBe(false);
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "idle",
      idleQueue: ["wild", "wild", "wild", "up"],
      items: [
        { feature: "wild", slotIndex: 3, visible: true },
        { feature: "wild", slotIndex: 2, visible: true },
        { feature: "wild", slotIndex: 1, visible: true },
        { feature: "up", slotIndex: 0, visible: true },
      ],
    });
    expect(runtime.update(0)).toEqual({ completed: true });
  });

  it("treats each server feature queue as authoritative and rejects invalid updates", () => {
    const runtime = createRuntime();
    runtime.startSpin(createPlan(["normal", "wild", "wild", "wild", "up"]));
    runtime.update(GAME003_BG_BAR_SHIFT_DURATION_SECONDS);
    runtime.update(0.58);

    runtime.startSpin(createPlan(["normal", "wild", "wild", "wild", "up"]));
    expect(runtime.getSnapshot()).toMatchObject({
      phase: "shifting",
      items: [
        { feature: "normal" },
        { feature: "wild" },
        { feature: "wild" },
        { feature: "wild" },
        { feature: "up" },
      ],
    });
    runtime.update(GAME003_BG_BAR_SHIFT_DURATION_SECONDS);
    runtime.update(0.58);

    expect(() => runtime.update(Number.NaN)).toThrow(/finite non-negative/);
    runtime.startSpin(createPlan(["wild", "wild", "wild", "up", "normal"]));
    expect(runtime.isPlaying()).toBe(true);
    expect(() =>
      runtime.startSpin(createPlan(["wild", "wild", "wild", "up", "normal"])),
    ).toThrow(/already in progress/);
  });

  it("requires layout before spin and fails after destroy", () => {
    const config = getGame003SkinConfig("1").bgBar;
    const runtime = createGame003BgBarRuntime({
      config,
      symbolAssets: createAssets(),
    });

    expect(() =>
      runtime.startSpin(createPlan(["normal", "wild", "wild", "wild", "up"])),
    ).toThrow(/layout must be applied/);

    runtime.applyLayout(createLayout());
    runtime.destroy();
    runtime.destroy();
    expect(() => runtime.update(0)).toThrow(/destroyed/);
    expect(() => runtime.applyLayout(createLayout())).toThrow(/destroyed/);
  });

  it("rejects symbol assets outside the bg-bar display set", () => {
    expect(() =>
      createGame003BgBarRuntime({
        config: getGame003SkinConfig("1").bgBar,
        symbolAssets: {
          ...createAssets(),
          bonus: {
            normal: createTestTexture(172, 158),
            states: {},
          },
        },
      }),
    ).toThrow(/unused symbol assets: bonus/);
  });
});

function createRuntime() {
  const runtime = createGame003BgBarRuntime({
    config: getGame003SkinConfig("1").bgBar,
    symbolAssets: createAssets(),
  });
  runtime.applyLayout(createLayout());
  return runtime;
}

function createLayout() {
  return createGame003BgBarLayout({
    layout: createGame003Layout({
      viewportSize: { width: 1600, height: 1000 },
    }),
    config: getGame003SkinConfig("1").bgBar,
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

function expectSymbolPosition(
  runtime: ReturnType<typeof createGame003BgBarRuntime>,
  childIndex: number,
  x: number,
  y: number,
): void {
  const child = runtime.container.children[childIndex];
  expect(child, `bg-bar child ${childIndex}`).toBeDefined();
  expect(child.position.x).toBeCloseTo(x);
  expect(child.position.y).toBeCloseTo(y);
}

function createPlan(
  features: Game003BgBarSpinPlan["features"],
): Game003BgBarSpinPlan {
  return {
    stepIndex: 0,
    features,
  };
}
