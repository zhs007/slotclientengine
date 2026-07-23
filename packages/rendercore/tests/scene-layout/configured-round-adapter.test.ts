import { describe, expect, it, vi } from "vitest";
import type { GameLogic, SceneMatrix } from "@slotclientengine/logiccore";
import type { Application } from "pixi.js";
import {
  createConfiguredSceneLayoutRoundAdapter,
  parseSlotTemplatePresentationProfile,
  type SceneLayoutPackageResource,
  type SceneLayoutPackageRuntime,
} from "../../src/scene-layout/index.js";

const initialScene: SceneMatrix = [
  [1, 2],
  [3, 4],
];
const refillScene: SceneMatrix = [
  [4, 3],
  [2, 1],
];

function createResource() {
  const destroy = vi.fn();
  const resource = {
    manifest: {
      version: 1,
      kind: "scene-layout",
      id: "adapter-fixture",
      adaptation: {
        mode: "maximized-focus",
        artSize: { width: 100, height: 100 },
        focusRect: { x: 0, y: 0, width: 100, height: 100 },
        backgroundNode: "background",
      },
      nodes: [],
      reels: {
        main: {
          columns: 2,
          rows: 2,
          cellSize: { width: 10, height: 10 },
          gap: { x: 0, y: 0 },
          placements: { default: { x: 0, y: 0 } },
        },
      },
      symbolPackage: {
        manifest: "dependencies/symbols/fixture/symbols.package.json",
        reel: "main",
        reelSet: "public-reels",
        renderMode: "standard",
      },
    },
    destroy,
  } as unknown as SceneLayoutPackageResource;
  return { resource, destroy };
}

const roundFlow = {
  kind: "slot-round-flow",
  version: 1,
  components: { spin: "spin", wins: ["wins"] },
  amount: { cashFields: ["cashWin64", "cashWin"], cashUnit: "cents" },
  cascade: {
    kind: "cascade",
    version: 1,
    components: {
      remove: "remove",
      dropdown: "dropdown",
      refill: "refill",
    },
    symbols: {
      emptyCode: -1,
      removeExcludedSymbols: [],
      dropHeldSymbols: [],
      valueSymbols: [],
    },
    amount: { cashFields: ["cashWin64", "cashWin"], cashUnit: "cents" },
  },
} as const;

const presentation = parseSlotTemplatePresentationProfile({
  reel: {
    kind: "standard",
    version: 1,
    direction: "forward",
    speedSymbolsPerSecond: 20,
    minimumSpinCycles: 3,
    baseDurationMs: 800,
    startDelayMs: 50,
    stopDelayMs: 100,
    bounceStrength: 0,
  },
  flow: {
    version: 1,
    symbolStates: { normal: "normal", win: "win", remove: "remove" },
    dimmingAlpha: 0.5,
    popup: { enabled: false },
    cascade: {
      emphasisFadeInMs: 100,
      emphasisHoldMs: 1000,
      emphasisFadeOutMs: 100,
      baseFallSeconds: 0.2,
      perRowFallSeconds: 0.05,
      maxFallSeconds: 1,
      settleSeconds: 0.1,
    },
  },
});

function createLogic(options?: {
  readonly spinScenes?: readonly SceneMatrix[];
  readonly winPositions?: readonly number[];
  readonly refillScenes?: readonly SceneMatrix[];
  readonly includeWin?: boolean;
}): GameLogic {
  const step = {
    getIndex: () => 0,
    getComponentScenes: (name: string) => {
      if (name === "spin") return options?.spinScenes ?? [initialScene];
      if (name === "refill") return options?.refillScenes ?? [refillScene];
      return [];
    },
    getComponentResults: (name: string) =>
      name === "wins" && options?.includeWin !== false
        ? [{ pos: options?.winPositions ?? [0, 0] }]
        : [],
  };
  return {
    getSteps: () => [step],
  } as unknown as GameLogic;
}

function createHarness() {
  let tick: (() => void) | null = null;
  const canvas = {} as HTMLCanvasElement;
  const app = {
    canvas,
    init: vi.fn().mockResolvedValue(undefined),
    ticker: {
      deltaMS: 16,
      add: vi.fn((listener: () => void) => {
        tick = listener;
      }),
      remove: vi.fn(),
    },
    stage: { addChild: vi.fn() },
    renderer: {
      width: 320,
      height: 180,
      resize: vi.fn(),
    },
    destroy: vi.fn(),
  } as unknown as Application;
  let spinning = true;
  let once = false;
  const runtime = {
    container: {},
    init: vi.fn().mockResolvedValue(undefined),
    update: vi.fn(),
    applyViewport: vi.fn(),
    spinMainReelToScene: vi.fn(),
    isMainReelSpinning: vi.fn(() => spinning),
    requestMainReelSymbolStates: vi.fn(),
    getMainReelSymbolStateSnapshots: vi.fn(() => [{ isOnce: once }]),
    resetReelScene: vi.fn(),
    dismissActiveAwardCelebrationImmediately: vi.fn(),
    destroy: vi.fn(),
  } as unknown as SceneLayoutPackageRuntime;
  const gameLayer = {
    replaceChildren: vi.fn(),
  } as unknown as HTMLElement;
  const viewportListeners: Array<
    (viewport: {
      readonly frameDesignSize: {
        readonly width: number;
        readonly height: number;
      };
    }) => void
  > = [];
  const unsubscribe = vi.fn();
  const context = {
    gameLayer,
    getViewport: () => ({
      frameDesignSize: { width: 320, height: 180 },
    }),
    onViewportChange: (listener: (typeof viewportListeners)[number]) => {
      viewportListeners.push(listener);
      return unsubscribe;
    },
  };
  return {
    app,
    runtime,
    context,
    unsubscribe,
    viewportListeners,
    setSpinning(value: boolean) {
      spinning = value;
    },
    setOnce(value: boolean) {
      once = value;
    },
    runTick() {
      if (!tick) throw new Error("Ticker listener was not installed.");
      tick();
    },
  };
}

describe("configured scene-layout round adapter", () => {
  it("mounts, applies the initial scene, and drains spin/win/refill in order", async () => {
    const { resource, destroy } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0.25,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });

    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    harness.viewportListeners[0]({
      frameDesignSize: { width: 640, height: 360 },
    });
    const round = adapter.playSpin(createLogic());
    harness.runTick();
    harness.setSpinning(false);
    harness.runTick();
    harness.setOnce(true);
    harness.runTick();
    harness.setOnce(false);
    harness.runTick();
    await round;

    expect(harness.runtime.spinMainReelToScene).toHaveBeenCalledOnce();
    expect(harness.runtime.requestMainReelSymbolStates).toHaveBeenCalledWith(
      [{ x: 0, y: 0 }],
      "win",
    );
    expect(harness.runtime.resetReelScene).toHaveBeenCalledWith(
      "main",
      expect.objectContaining({ scene: refillScene }),
    );
    expect(harness.app.renderer.resize).toHaveBeenCalledWith(640, 360);

    adapter.destroy();
    adapter.destroy();
    expect(harness.unsubscribe).toHaveBeenCalledOnce();
    expect(harness.runtime.destroy).toHaveBeenCalledOnce();
    expect(destroy).not.toHaveBeenCalled();
    harness.viewportListeners[0]({
      frameDesignSize: { width: 800, height: 600 },
    });
    harness.runTick();
  });

  it("rejects lifecycle misuse before mutating runtime state", async () => {
    const { resource, destroy } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });

    await expect(adapter.playSpin(createLogic())).rejects.toThrow(
      /no initial scene/,
    );
    await expect(adapter.applyInitialState({})).rejects.toThrow(
      /requires live userInfo.defaultScene/,
    );
    await expect(
      adapter.applyInitialState({ defaultScene: initialScene }),
    ).rejects.toThrow(/not mounted/);
    await adapter.mount(harness.context);
    await expect(adapter.mount(harness.context)).rejects.toThrow(
      /already mounted/,
    );
    adapter.destroy();
    await expect(adapter.mount(harness.context)).rejects.toThrow(/destroyed/);
    expect(destroy).toHaveBeenCalledOnce();
  });

  it("rejects invalid compiled rounds and concurrent play", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0.5,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });

    await expect(
      adapter.playSpin(createLogic({ spinScenes: [] })),
    ).rejects.toThrow(/exactly one authoritative scene/);
    await expect(
      adapter.playSpin(
        createLogic({ spinScenes: [initialScene, refillScene] }),
      ),
    ).rejects.toThrow(/received 2/);
    await expect(
      adapter.playSpin(createLogic({ spinScenes: [[[1, 2]]] })),
    ).rejects.toThrow(/must contain 2 columns/);
    await expect(
      adapter.playSpin(
        createLogic({
          spinScenes: [[[1], [2]]],
        }),
      ),
    ).rejects.toThrow(/must contain 2 rows/);
    await expect(
      adapter.playSpin(createLogic({ winPositions: [2, 0] })),
    ).rejects.toThrow(/outside 2x2/);
    await expect(
      adapter.playSpin(
        createLogic({ refillScenes: [initialScene, refillScene] }),
      ),
    ).rejects.toThrow(/at most one scene/);

    const activeRound = adapter.playSpin(createLogic());
    await expect(adapter.playSpin(createLogic())).rejects.toThrow(
      /already in progress/,
    );
    adapter.destroy();
    await expect(activeRound).rejects.toThrow(/destroyed during a round/);
  });

  it("completes a non-cascade round with no win results", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow: {
        kind: "slot-round-flow",
        version: 1,
        components: { spin: "spin", wins: ["wins"] },
        amount: {
          cashFields: ["cashWin64", "cashWin"],
          cashUnit: "cents",
        },
      },
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });
    const round = adapter.playSpin(createLogic({ includeWin: false }));
    harness.setSpinning(false);
    harness.runTick();
    await round;
    expect(harness.runtime.requestMainReelSymbolStates).not.toHaveBeenCalled();
    expect(harness.runtime.resetReelScene).not.toHaveBeenCalled();
    adapter.destroy();
  });

  it("destroys a partially initialized runtime when initialization fails", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    (
      harness.runtime.init as unknown as ReturnType<typeof vi.fn>
    ).mockRejectedValue("runtime-init-failure");
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);

    await expect(
      adapter.applyInitialState({ defaultScene: initialScene }),
    ).rejects.toThrow(/runtime-init-failure/);
    expect(harness.runtime.destroy).toHaveBeenCalledOnce();
    adapter.destroy();
  });

  it("rejects the active round when a frame update fails", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    (
      harness.runtime.update as unknown as ReturnType<typeof vi.fn>
    ).mockImplementationOnce(() => {
      throw new Error("frame-update-failure");
    });
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      random: () => 0,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    await adapter.applyInitialState({ defaultScene: initialScene });

    const round = adapter.playSpin(createLogic());
    harness.runTick();
    await expect(round).rejects.toThrow(/frame-update-failure/);
    adapter.destroy();
  });

  it("fails explicitly when default phase randomization lacks Web Crypto", async () => {
    const { resource } = createResource();
    const harness = createHarness();
    const adapter = createConfiguredSceneLayoutRoundAdapter({
      packageResource: resource,
      roundFlow,
      presentation,
      applicationFactory: () => harness.app,
      runtimeFactory: () => harness.runtime,
    });
    await adapter.mount(harness.context);
    const originalCrypto = globalThis.crypto;
    vi.stubGlobal("crypto", undefined);
    try {
      await expect(
        adapter.applyInitialState({ defaultScene: initialScene }),
      ).rejects.toThrow(/Web Crypto getRandomValues/);
    } finally {
      vi.stubGlobal("crypto", originalCrypto);
      adapter.destroy();
    }
  });
});
